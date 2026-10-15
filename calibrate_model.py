#!/usr/bin/env python3
"""Fit a validation-only display calibration from actual-JS prediction CSVs.

Example (run only after freezing model selection):
  python calibrate_model.py --split val --model-release RELEASE \
    --predictions diverse_val_mean_vector.csv --predictions openai_val_mean_vector.csv \
    --output calibration.json

By default every resume has equal total weight regardless of its number of jobs.
--weighting source_resume gives each supplied source equal total weight, then
each resume within that source equal weight. Choose this policy before fitting.
Select
weighted isotonic or nonnegative affine calibration by leave-family-out CV;
missing family IDs fall back to whole-resume groups. Export both as monotone
piecewise-linear knots compatible with the extension's schema. Raw cosine
predictions stay unchanged. The extension sorts a blend of rounded semantic
grades and lexical scores, so recalibration can change its displayed ordering.
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
import re

import numpy as np
import pandas as pd
from sklearn.isotonic import IsotonicRegression


FAMILY_COLUMNS = ("profile_family_id", "family_id")
FIT_METHODS = ("nonnegative_weighted_affine", "weighted_isotonic")


def text_key(text):
    return hashlib.sha256(re.sub(r"\s+", " ", str(text)).strip().casefold().encode("utf-8")).hexdigest()


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    temporary.replace(path)


def resume_weights(frame, weighting="resume"):
    """Normalize either resumes globally or sources then resumes within each."""
    if weighting not in ("resume", "source_resume"):
        raise ValueError(f"Unknown sample weighting: {weighting}")
    if weighting == "resume":
        counts = frame.groupby("_resume_key")["_resume_key"].transform("size").to_numpy(dtype=float)
        return 1.0 / (counts * frame["_resume_key"].nunique())
    if "_source" not in frame or frame["_source"].isna().any() or frame["_source"].astype(str).str.strip().eq("").any():
        raise ValueError("source_resume weighting requires nonempty source metadata for every row")
    counts = frame.groupby(["_source", "_resume_key"])["_resume_key"].transform("size").to_numpy(dtype=float)
    resumes_per_source = frame.groupby("_source")["_resume_key"].transform("nunique").to_numpy(dtype=float)
    return 1.0 / (frame["_source"].nunique() * resumes_per_source * counts)


def attach_groups(frame):
    frame = frame.copy()
    frame["_resume_key"] = frame["resume"].map(text_key)
    groups = {}
    for resume, rows in frame.groupby("_resume_key", sort=True):
        family_ids = set()
        for column in FAMILY_COLUMNS:
            if column in rows:
                family_ids.update(str(value).strip() for value in rows[column].dropna()
                                  if str(value).strip().lower() not in ("", "unknown", "nan"))
        if len(family_ids) > 1:
            raise ValueError(f"Conflicting family IDs for resume {resume[:12]}")
        groups[resume] = f"family:{next(iter(family_ids))}" if family_ids else f"resume:{resume}"
    frame["_cv_group"] = frame["_resume_key"].map(groups)
    return frame


def load_predictions(paths, split):
    if split != "val":
        raise ValueError("Calibration accepts validation data only (--split val)")
    if len({Path(path).resolve() for path in paths}) != len(paths):
        raise ValueError("A prediction CSV was supplied more than once")
    frames, sources = [], []
    for supplied in paths:
        path = Path(supplied)
        if re.search(r"(?:^|[_.-])test(?:[_.-]|$)", path.stem, re.I) or path.parent.name.lower() == "test":
            raise ValueError(f"Test-named input is forbidden for calibration: {path}")
        if re.match(r"^hf(?:[_.-]|$)", path.stem, re.I):
            raise ValueError("HF ternary labels are not continuous grade-calibration targets")
        frame = pd.read_csv(path)
        required = {"resume", "job", "score", "prediction"}
        if frame.empty or not required.issubset(frame):
            raise ValueError(f"{path}: missing prediction columns or rows")
        if frame[list(required)].isna().any().any():
            raise ValueError(f"{path}: missing text, score, or prediction")
        has_split_metadata = "split" in frame
        if has_split_metadata and not frame["split"].astype(str).eq("val").all():
            raise ValueError(f"{path}: split metadata is not entirely val")
        if not has_split_metadata:
            # Legacy prediction exports have no split column. Apply the
            # caller's explicit --split val declaration before concatenation;
            # otherwise mixing them with annotated CSVs creates NaN splits.
            # Missing/invalid cells in an existing split column remain errors.
            frame["split"] = split
        for field in ("resume", "job"):
            if frame[field].astype(str).str.strip().eq("").any():
                raise ValueError(f"{path}: empty {field} text")
        for field in ("score", "prediction"):
            frame[field] = pd.to_numeric(frame[field], errors="raise")
            if not np.isfinite(frame[field]).all():
                raise ValueError(f"{path}: non-finite {field}")
        if not frame["score"].between(0, 1).all():
            raise ValueError(f"{path}: scores must be within [0, 1]")
        if set(frame["score"].unique()) == {0.0, 0.5, 1.0}:
            raise ValueError(f"{path}: ternary labels are not continuous grade-calibration targets")
        if not frame["prediction"].between(-1.000001, 1.000001).all():
            raise ValueError(f"{path}: predictions must be raw cosine similarities")
        frame["_source"] = str(path)
        frames.append(frame)
        sources.append({"path": str(path), "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                        "pairs": len(frame),
                        "split_metadata_source": "csv" if has_split_metadata else "declared_split_argument"})
    if not frames:
        raise ValueError("At least one validation prediction CSV is required")
    combined = attach_groups(pd.concat(frames, ignore_index=True))
    job_keys = combined["job"].map(text_key)
    if pd.DataFrame({"resume": combined["_resume_key"], "job": job_keys}).duplicated().any():
        raise ValueError("Duplicate normalized resume/job pairs across calibration inputs")
    return combined, sources


@dataclass(frozen=True)
class Curve:
    cosine_knots: np.ndarray
    score_knots: np.ndarray

    def predict(self, values):
        return np.interp(values, self.cosine_knots, self.score_knots)


def fit_curve(predictions, labels, weights, method):
    x, y, weights = [np.asarray(values, dtype=float) for values in (predictions, labels, weights)]
    if not len(x) or len(x) != len(y) or len(x) != len(weights):
        raise ValueError("Fit arrays must have the same nonzero length")
    if not all(np.isfinite(values).all() for values in (x, y, weights)) or np.any(weights <= 0):
        raise ValueError("Fit values must be finite and weights positive")
    if np.any((y < 0) | (y > 1)):
        raise ValueError("Fit labels must be within [0, 1]")
    if method not in FIT_METHODS:
        raise ValueError(f"Unknown fit method: {method}")
    if np.unique(x).size < 2:
        # A fold can have a constant score even if the complete data does not.
        # A flat curve is honest and satisfies the runtime's two-knot schema.
        return Curve(np.array([-1.000001, 1.000001]), np.repeat(np.average(y, weights=weights), 2))
    if method == "weighted_isotonic":
        fit = IsotonicRegression(y_min=0, y_max=1, increasing=True, out_of_bounds="clip")
        fit.fit(x, y, sample_weight=weights)
        return Curve(fit.X_thresholds_.copy(), fit.y_thresholds_.copy())
    x_mean, y_mean = np.average(x, weights=weights), np.average(y, weights=weights)
    variance = np.average((x - x_mean) ** 2, weights=weights)
    covariance = np.average((x - x_mean) * (y - y_mean), weights=weights)
    slope = max(0.0, float(covariance / variance))
    intercept = float(y_mean - slope * x_mean)
    knots = [float(x.min()), float(x.max())]
    if slope > 0:
        # Include clipping breakpoints so the exported interpolation equals
        # the calibrated affine function throughout the observed interval.
        knots.extend(value for value in (-intercept / slope, (1 - intercept) / slope)
                     if x.min() < value < x.max())
    knots = np.array(sorted(set(knots)))
    return Curve(knots, np.clip(slope * knots + intercept, 0, 1))


def cross_validate(frame, weighting="resume"):
    if "split" in frame and not frame["split"].astype(str).eq("val").all():
        raise ValueError("Calibration CV accepts validation split metadata only")
    groups = sorted(frame["_cv_group"].unique())
    if len(groups) < 3:
        raise ValueError("At least three independent resume/family groups are required for calibration CV")
    y, x = frame["score"].to_numpy(dtype=float), frame["prediction"].to_numpy(dtype=float)
    full_weights = resume_weights(frame, weighting)
    out_of_fold = {method: np.full(len(frame), np.nan) for method in FIT_METHODS}
    fold_groups = frame["_cv_group"].to_numpy()
    for group in groups:
        held_out = fold_groups == group
        training = ~held_out
        weights = resume_weights(frame.loc[training], weighting)
        for method in FIT_METHODS:
            fit = fit_curve(x[training], y[training], weights, method)
            out_of_fold[method][held_out] = fit.predict(x[held_out])
    report = {method: {"weighted_mae": float(np.average(np.abs(predictions - y), weights=full_weights)),
                       "weighted_rmse": float(np.sqrt(np.average((predictions - y) ** 2, weights=full_weights)))}
              for method, predictions in out_of_fold.items()}
    if "_source" in frame:
        for method, predictions in out_of_fold.items():
            report[method]["per_source"] = []
            for source in sorted(frame["_source"].unique()):
                indexes = frame["_source"].eq(source).to_numpy()
                report[method]["per_source"].append({
                    "source": source, "pairs": int(indexes.sum()),
                    "resumes": int(frame.loc[indexes, "_resume_key"].nunique()),
                    "weighted_mae": float(np.average(np.abs(predictions[indexes] - y[indexes]), weights=full_weights[indexes])),
                    "weighted_rmse": float(np.sqrt(np.average((predictions[indexes] - y[indexes]) ** 2, weights=full_weights[indexes]))),
                })
    # Prefer the simpler curve when CV MAE is numerically tied.
    affine, isotonic = FIT_METHODS
    selected = affine if report[affine]["weighted_mae"] <= report[isotonic]["weighted_mae"] + 1e-6 else isotonic
    return selected, report, len(groups)


def calibrate(frame, *, model_release, sources=None, weighting="resume"):
    if not str(model_release).strip():
        raise ValueError("model_release must be a nonempty release identifier")
    if "split" in frame and not frame["split"].astype(str).eq("val").all():
        raise ValueError("Calibration accepts validation split metadata only")
    if "_cv_group" not in frame or "_resume_key" not in frame:
        frame = attach_groups(frame)
    frame = frame.reset_index(drop=True)
    selected, cv, groups = cross_validate(frame, weighting)
    x, y = frame["prediction"].to_numpy(dtype=float), frame["score"].to_numpy(dtype=float)
    weights = resume_weights(frame, weighting)
    curve = fit_curve(x, y, weights, selected)
    if len(curve.cosine_knots) < 2 or not np.all(np.diff(curve.cosine_knots) > 0):
        raise ValueError("Calibration must have at least two strictly increasing cosine knots")
    if not np.all(np.diff(curve.score_knots) >= -1e-12):
        raise ValueError("Calibration score knots must not decrease")
    source_coverage, source_errors = [], []
    fitted_predictions = curve.predict(x)
    if "_source" in frame:
        for source, indexes in frame.groupby("_source").groups.items():
            source_coverage.append({"path": source, "pairs": len(indexes),
                                    "resumes": frame.loc[indexes, "_resume_key"].nunique(),
                                    "total_weight": float(weights[list(indexes)].sum())})
            source_indexes = list(indexes)
            source_errors.append({
                "source": source,
                "weighted_mae_uncalibrated_cosine": float(np.average(np.abs(np.clip(x[source_indexes], 0, 1) - y[source_indexes]), weights=weights[source_indexes])),
                "weighted_mae_calibrated": float(np.average(np.abs(fitted_predictions[source_indexes] - y[source_indexes]), weights=weights[source_indexes])),
                "weighted_rmse_calibrated": float(np.sqrt(np.average((fitted_predictions[source_indexes] - y[source_indexes]) ** 2, weights=weights[source_indexes]))),
            })
    sample_weighting = {"method": weighting, "source_coverage": source_coverage}
    if weighting == "source_resume":
        sample_weighting.update(unit="source then normalized resume text",
                                total_per_source=1 / frame["_source"].nunique(),
                                per_pair="1 / (number of sources * resumes in source * pairs for that resume in source)")
    else:
        sample_weighting.update(unit="normalized resume text", total_per_resume=1 / frame["_resume_key"].nunique(),
                                per_pair="1 / (number of resumes * pairs for that resume)")
    return {
        "schema_version": 1, "model_release": str(model_release).strip(),
        "method": "quantile_piecewise_linear",
        "cosine_knots": curve.cosine_knots.tolist(), "score_knots": curve.score_knots.tolist(),
        "metadata": {
            "data_split": "val", "selected_fit": selected,
            "schema_note": "Runtime-compatible piecewise interpolation; knots fitted by selected weighted calibration, not marginal quantile matching.",
            "input_sha256": sources or [], "pairs": len(frame), "resumes": frame["_resume_key"].nunique(),
            "cross_validation": {"method": "leave-one-family-or-resume-out", "groups": groups,
                                 "criterion": f"lowest {weighting}-weighted MAE; prefer affine within 0.000001",
                                 "candidates": cv},
            "sample_weighting": sample_weighting,
            "in_sample": {
                "weighted_mae_uncalibrated_cosine": float(np.average(np.abs(np.clip(x, 0, 1) - y), weights=weights)),
                "weighted_mae_calibrated": float(np.average(np.abs(fitted_predictions - y), weights=weights)),
                "per_source": source_errors,
            },
            "raw_cosine_predictions_unchanged": True,
            "limitations": [
                "Calibration transforms semantic grades without modifying the model's raw cosine predictions.",
                "The current extension sorts a blend of rounded semantic grades and lexical scores; recalibration can change UI ordering.",
                "Cross-validation selected the calibration family; its selected error is not an independent test estimate.",
                "The final curve uses all supplied validation labels; in-sample errors are not generalization evidence.",
                "Family clusters come from supplied metadata; missing family IDs use individual resumes.",
                "Teacher scores are supervised match judgments, not hiring outcomes or calibrated probabilities.",
                "Monotone interpolation preserves cosine order before blending but can create tied grades; the lexical blend can reorder jobs.",
            ],
        },
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--predictions", type=Path, action="append", required=True)
    parser.add_argument("--split", choices=("val",), required=True)
    parser.add_argument("--model-release", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--weighting", choices=("resume", "source_resume"), default="resume",
                        help="resume: equal resumes globally; source_resume: equal sources then equal resumes within each")
    args = parser.parse_args()
    frame, sources = load_predictions(args.predictions, args.split)
    calibration = calibrate(frame, model_release=args.model_release, sources=sources, weighting=args.weighting)
    write_json(args.output, calibration)
    metadata = calibration["metadata"]
    selected = metadata["selected_fit"]
    print(f"Saved {len(calibration['cosine_knots'])} monotone display knots to {args.output}")
    print(f"Selected {selected}; leave-group-out weighted MAE: {metadata['cross_validation']['candidates'][selected]['weighted_mae']:.6f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
