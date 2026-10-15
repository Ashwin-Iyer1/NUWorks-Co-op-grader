#!/usr/bin/env python3
"""Compare frozen raw predictions and display calibrations; never fit a curve.

An optional --labels CSV replaces BOTH models' original labels by exact
normalized resume/job identity. This allows a new teacher rubric to be audited
against the same saved predictions without rerunning or tuning either model.
Reports contain aggregate metrics and file hashes, not applicant/job text.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats

from evaluate_diversity import (
    RANK_METRICS, compare_frames, json_safe, mean_ci, per_resume_metrics, read_frame,
)


KEYS = ["_resume_key", "_job_key"]


def calibrated_scores(predictions: np.ndarray, calibration: dict) -> tuple[np.ndarray, np.ndarray]:
    """Return continuous 0-100 scores and extension-compatible rounded grades."""
    if calibration.get("schema_version") != 1:
        raise ValueError("Calibration must use schema_version 1")
    if calibration.get("method") != "quantile_piecewise_linear":
        raise ValueError("Expected a frozen quantile_piecewise_linear calibration")
    xs = np.asarray(calibration.get("cosine_knots", []), dtype=float)
    ys = np.asarray(calibration.get("score_knots", []), dtype=float)
    if (xs.ndim != 1 or ys.ndim != 1 or len(xs) < 2 or len(xs) != len(ys)
            or not np.isfinite(xs).all() or not np.isfinite(ys).all()
            or not (np.diff(xs) > 0).all() or not (np.diff(ys) >= 0).all()
            or not ((ys >= 0) & (ys <= 1)).all()):
        raise ValueError("Invalid calibration knots")
    continuous = np.clip(np.interp(predictions, xs, ys), 0, 1) * 100
    # np.round uses bankers' rounding; the extension uses Math.round on [0,100].
    return continuous, np.floor(continuous + 0.5)


def replace_labels(frame: pd.DataFrame, labels: pd.DataFrame) -> pd.DataFrame:
    result = frame.drop(columns="score").merge(
        labels[KEYS + ["score"]], on=KEYS, how="outer", indicator=True,
        validate="one_to_one",
    )
    if not result["_merge"].eq("both").all():
        raise ValueError("Replacement labels must contain exactly the prediction pairs")
    return result.drop(columns="_merge")


def compare(
    baseline: pd.DataFrame, candidate: pd.DataFrame,
    baseline_calibration: dict, candidate_calibration: dict,
    *, labels: pd.DataFrame | None = None, draws: int = 10000, seed: int = 20261015,
) -> dict:
    if draws < 1:
        raise ValueError("Bootstrap draws must be positive")
    compare_frames(candidate, baseline)
    if labels is not None:
        baseline = replace_labels(baseline, labels)
        candidate = replace_labels(candidate, labels)
    ranks, grades, result = {}, {}, {}
    for name, frame, calibration in (
        ("baseline", baseline, baseline_calibration),
        ("candidate", candidate, candidate_calibration),
    ):
        ranks[name] = per_resume_metrics(frame, min_gap=0.1, slices=[]).set_index("resume_key")
        continuous, rounded = calibrated_scores(frame.prediction.to_numpy(float), calibration)
        errors = pd.DataFrame({
            "resume_key": frame._resume_key.to_numpy(),
            "display_mae_points": np.abs(rounded - 100 * frame.score.to_numpy(float)),
            "continuous_mae_points": np.abs(continuous - 100 * frame.score.to_numpy(float)),
            "display_signed_error_points": rounded - 100 * frame.score.to_numpy(float),
        })
        grades[name] = errors.groupby("resume_key", sort=True).mean()
        result[name] = {
            "model_release": calibration.get("model_release"),
            "global_raw_spearman": float(stats.spearmanr(frame.score, frame.prediction).statistic),
            "rankable_resumes": len(ranks[name]),
            "constant_label_resumes": frame._resume_key.nunique() - len(ranks[name]),
            "macro_raw_ranking": {
                metric: mean_ci(ranks[name][metric].to_numpy(float), draws=draws, seed=seed)
                for metric in RANK_METRICS
            },
            "equal_resume_grading": {
                metric: mean_ci(grades[name][metric].to_numpy(float), draws=draws, seed=seed)
                for metric in errors.columns if metric != "resume_key"
            },
        }
    if set(ranks["baseline"].index) != set(ranks["candidate"].index):
        raise ValueError("Models have different rankable resume identities")
    result["paired_improvement"] = {
        "raw_ranking_candidate_minus_baseline": {
            metric: mean_ci(
                (ranks["candidate"][metric] - ranks["baseline"][metric]).to_numpy(float),
                draws=draws, seed=seed,
            ) for metric in RANK_METRICS
        },
        "grading_error_reduction_baseline_minus_candidate": {
            metric: mean_ci(
                (grades["baseline"][metric] - grades["candidate"][metric]).to_numpy(float),
                draws=draws, seed=seed,
            ) for metric in ["display_mae_points", "continuous_mae_points"]
        },
    }
    return {
        "schema_version": 1,
        "pairs": len(candidate), "resumes": candidate._resume_key.nunique(),
        "jobs": candidate._job_key.nunique(),
        "method": {
            "fit_or_tuning_performed": False,
            "bootstrap_unit": "normalized resume text", "bootstrap_draws": draws, "seed": seed,
            "weighting": "equal weight per resume; equal weight per job within each resume",
            "display_score": "100 * clipped piecewise interpolation, then JavaScript Math.round",
            "replacement_labels": labels is not None,
            "positive_paired_improvement_is_better": True,
        },
        "limitations": [
            "Teacher labels measure rubric agreement, not human judgments or hiring outcomes.",
            "Intervals resample whole resumes conditional on this fixed job pool.",
            "Raw cosine rankings and semantic grades do not include the extension's lexical blend.",
            "Node CPU inference does not establish browser WASM kernel parity.",
            "Changing label rubrics requires reporting both versions, not selecting the more favorable one.",
        ],
        **result,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-predictions", type=Path, required=True)
    parser.add_argument("--candidate-predictions", type=Path, required=True)
    parser.add_argument("--baseline-calibration", type=Path, required=True)
    parser.add_argument("--candidate-calibration", type=Path, required=True)
    parser.add_argument("--labels", type=Path)
    parser.add_argument("--label-description", required=True)
    parser.add_argument("--bootstrap-draws", type=int, default=10000)
    parser.add_argument("--seed", type=int, default=20261015)
    parser.add_argument("--json-out", type=Path, required=True)
    args = parser.parse_args()
    result = compare(
        read_frame(args.baseline_predictions), read_frame(args.candidate_predictions),
        json.loads(args.baseline_calibration.read_text(encoding="utf-8")),
        json.loads(args.candidate_calibration.read_text(encoding="utf-8")),
        labels=read_frame(args.labels) if args.labels else None,
        draws=args.bootstrap_draws, seed=args.seed,
    )
    result["label_description"] = args.label_description
    result["inputs"] = {
        name: {"path": str(path), "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
        for name in ["baseline_predictions", "candidate_predictions", "baseline_calibration",
                     "candidate_calibration", "labels"]
        if (path := getattr(args, name)) is not None
    }
    args.json_out.parent.mkdir(parents=True, exist_ok=True)
    args.json_out.write_text(json.dumps(json_safe(result), indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(f"Frozen comparison: {args.json_out}")
    for name in ["baseline", "candidate"]:
        print(name, "macro rho=", result[name]["macro_raw_ranking"]["spearman"]["mean"],
              "display MAE=", result[name]["equal_resume_grading"]["display_mae_points"]["mean"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
