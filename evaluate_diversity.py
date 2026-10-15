#!/usr/bin/env python3
"""Audit resume diversity and compare held-out prediction CSVs without a model.

Examples:
  python evaluate_diversity.py --input openai_labels/train.csv --json-out coverage.json
  python evaluate_diversity.py --input candidate.csv --baseline baseline.csv \
      --metadata labels.csv --training data/openai_train.csv --json-out comparison.json

Predictions use evaluate_production.py's resume,job,score,prediction columns.
Metadata is joined by normalized resume text, never by row position or guessed
major/year. Bootstrap resampling operates on whole profile families when their
IDs are supplied (otherwise whole resumes), not correlated resume/job rows.
These intervals measure variation within this sample;
they do not make a reused job pool an independent-job benchmark.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats


DEFAULT_SLICES = ("category", "major", "student_year", "career_stage", "degree_level", "source")
FAMILY_COLUMNS = ("profile_family_id", "family_id")
RANK_METRICS = ("spearman", "ndcg_at_10", "top1_best_rate", "pairwise_accuracy")


def text_key(text: str) -> str:
    """Identity robust to whitespace/case changes; not a near-duplicate detector."""
    normalized = re.sub(r"\s+", " ", str(text)).strip().casefold()
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def read_frame(path: Path) -> pd.DataFrame:
    frame = pd.read_csv(path).reset_index(drop=True)
    required = {"resume", "job", "score"}
    if not required.issubset(frame.columns):
        raise ValueError(f"{path}: missing columns {sorted(required - set(frame.columns))}")
    for field in ("resume", "job"):
        if frame[field].isna().any() or frame[field].astype(str).str.strip().eq("").any():
            raise ValueError(f"{path}: empty {field} text")
        frame[f"_{field}_key"] = frame[field].map(text_key)
    if frame.empty:
        raise ValueError(f"{path}: no rows")
    if frame.duplicated(["_resume_key", "_job_key"]).any():
        raise ValueError(f"{path}: duplicate normalized resume/job pairs")
    for field in ("score", "prediction"):
        if field in frame:
            frame[field] = pd.to_numeric(frame[field], errors="raise")
            if not np.isfinite(frame[field]).all():
                raise ValueError(f"{path}: non-finite {field}")
    if not frame["score"].between(0, 1).all():
        raise ValueError(f"{path}: score must be normalized to [0, 1]")
    return frame


def attach_metadata(frame: pd.DataFrame, paths: list[Path], slices: list[str]) -> pd.DataFrame:
    """Refuse ambiguous metadata rather than silently assigning a major/year."""
    output = frame.copy()
    slices = list(dict.fromkeys([*slices, *FAMILY_COLUMNS]))
    records: dict[str, dict[str, str]] = {}
    sources = [frame]
    for path in paths:
        source = pd.read_csv(path)
        if "resume" not in source:
            raise ValueError(f"{path}: metadata requires a resume column")
        sources.append(source)
    for source in sources:
        available = [field for field in slices if field in source]
        if not available:
            continue
        for row in source[["resume", *available]].drop_duplicates().to_dict("records"):
            if pd.isna(row["resume"]):
                continue
            key = text_key(row["resume"])
            record = records.setdefault(key, {})
            for field in available:
                value = row[field]
                if pd.isna(value) or not str(value).strip():
                    continue
                value = str(value).strip()
                if field in record and record[field] != value:
                    raise ValueError(f"Conflicting {field} metadata for resume {key[:12]}")
                record[field] = value
    for field in slices:
        output[field] = output["_resume_key"].map(
            lambda key: records.get(key, {}).get(field, "unknown")
        )
    return output


def tie_aware_ndcg(labels: np.ndarray, predictions: np.ndarray, k: int = 10) -> float:
    """Expected DCG for randomly ordered tied predictions, including cutoff ties."""
    order = np.argsort(-predictions, kind="stable")
    scores, gains = predictions[order], np.expm1(np.log(2) * labels[order])
    discounts = np.zeros(len(labels))
    stop = min(k, len(labels))
    discounts[:stop] = 1 / np.log2(np.arange(2, stop + 2))
    starts = np.r_[0, np.flatnonzero(np.diff(scores)) + 1]
    ends = np.r_[starts[1:], len(labels)]
    dcg = sum(float(gains[start:end].mean() * discounts[start:end].sum())
              for start, end in zip(starts, ends))
    ideal = float((np.sort(gains)[::-1] * discounts).sum())
    return dcg / ideal if ideal > 0 else float("nan")


def resume_metrics(labels: np.ndarray, predictions: np.ndarray, min_gap: float) -> dict:
    # Constant predictions convey no ranking information; omitting these queries
    # from the mean would make a model that fails on a group appear better.
    rho = (0.0 if np.unique(predictions).size < 2
           else float(stats.spearmanr(labels, predictions).statistic))
    top = labels[predictions == predictions.max()]
    left, right = np.triu_indices(len(labels), k=1)
    label_delta = labels[left] - labels[right]
    valid = (np.abs(label_delta) >= min_gap) & (label_delta != 0)
    prediction_delta = predictions[left] - predictions[right]
    correct = np.sign(label_delta[valid]) * np.sign(prediction_delta[valid])
    pairwise = float(np.mean((correct + 1) / 2)) if valid.any() else None
    return {
        "spearman": rho,
        "ndcg_at_10": tie_aware_ndcg(labels, predictions),
        "top1_best_rate": float(np.mean(top == labels.max())),
        "pairwise_accuracy": pairwise,
    }


def per_resume_metrics(frame: pd.DataFrame, min_gap: float, slices: list[str]) -> pd.DataFrame:
    rows = []
    for key, group in frame.groupby("_resume_key", sort=True):
        labels = group["score"].to_numpy(dtype=float)
        if len(labels) < 2 or np.unique(labels).size < 2:
            continue
        rows.append({
            "resume_key": key,
            "pairs": len(group),
            **{field: group[field].iloc[0] for field in slices},
            **resume_metrics(labels, group["prediction"].to_numpy(dtype=float), min_gap),
        })
    return pd.DataFrame(rows, columns=["resume_key", "pairs", *slices, *RANK_METRICS])


def mean_ci(values: np.ndarray, *, draws: int, seed: int, clusters=None) -> dict:
    values = np.asarray(values, dtype=float)
    valid = np.isfinite(values)
    clusters = (np.arange(len(values)).astype(str) if clusters is None else np.asarray(clusters))
    clusters = clusters[valid]
    values = values[valid]
    if not len(values):
        return {"mean": None, "resumes": 0, "bootstrap_clusters": 0, "ci95": None}
    unique_clusters, membership = np.unique(clusters, return_inverse=True)
    cluster_sums = np.bincount(membership, weights=values)
    cluster_counts = np.bincount(membership)
    count = len(unique_clusters)
    result = {"mean": float(values.mean()), "resumes": len(values),
              "bootstrap_clusters": count, "ci95": None}
    if count < 2:
        return result
    rng = np.random.default_rng(seed)
    # Process in chunks so large evaluations cannot allocate draws x resumes at once.
    means = []
    for offset in range(0, draws, 128):
        indexes = rng.integers(0, count, (min(128, draws - offset), count))
        means.extend(cluster_sums[indexes].sum(axis=1) / cluster_counts[indexes].sum(axis=1))
    result["ci95"] = np.quantile(means, [0.025, 0.975]).tolist()
    return result


def summarize_rankings(rows: pd.DataFrame, draws: int, seed: int) -> dict:
    clusters = rows["_cluster"].to_numpy() if "_cluster" in rows else None
    return {metric: mean_ci(rows[metric].to_numpy(dtype=float), draws=draws, seed=seed, clusters=clusters)
            for metric in RANK_METRICS}


def coverage(frame: pd.DataFrame, slices: list[str]) -> dict:
    result = {}
    for field in slices:
        groups = []
        for value, group in frame.groupby(field, sort=True):
            groups.append({"value": str(value), "resumes": group["_resume_key"].nunique(),
                           "pairs": len(group), "mean_label": float(group["score"].mean())})
        result[field] = groups
    return result


def leakage_audit(frame: pd.DataFrame, training_paths: list[Path]) -> list[dict]:
    result = []
    evaluation_resumes = set(frame["_resume_key"])
    evaluation_jobs = set(frame["_job_key"])
    evaluation_pairs = set(zip(frame["_resume_key"], frame["_job_key"]))
    for path in training_paths:
        train = pd.read_csv(path, usecols=["resume", "job"])
        resumes, jobs = train["resume"].map(text_key), train["job"].map(text_key)
        result.append({
            "training_file": str(path),
            "overlapping_resumes": len(evaluation_resumes & set(resumes)),
            "overlapping_jobs": len(evaluation_jobs & set(jobs)),
            "overlapping_pairs": len(evaluation_pairs & set(zip(resumes, jobs))),
        })
    return result


def compare_frames(candidate: pd.DataFrame, baseline: pd.DataFrame) -> pd.DataFrame:
    keys = ["_resume_key", "_job_key"]
    merged = candidate[keys + ["score", "prediction"]].merge(
        baseline[keys + ["score", "prediction"]], on=keys, how="outer",
        suffixes=("_candidate", "_baseline"), indicator=True, validate="one_to_one",
    )
    if not merged["_merge"].eq("both").all():
        raise ValueError("Baseline and candidate must contain exactly the same resume/job pairs")
    if not np.allclose(merged["score_candidate"], merged["score_baseline"], atol=1e-12, rtol=0):
        raise ValueError("Baseline and candidate labels disagree")
    return merged


def evaluate(
    frame: pd.DataFrame, *, baseline: pd.DataFrame | None = None,
    slices: list[str] | None = None, draws: int = 2000, seed: int = 42,
    min_gap: float = 0.1, minimum_slice_resumes: int = 5,
    cluster_column: str | None = None,
) -> dict:
    slices = list(slices or DEFAULT_SLICES)
    if draws < 1:
        raise ValueError("Bootstrap draws must be positive")
    if not 0 <= min_gap <= 1:
        raise ValueError("Pairwise minimum label gap must be within [0, 1]")
    if cluster_column is None:
        cluster_column = next((field for field in FAMILY_COLUMNS if field in frame
                               and frame[field].notna().any()
                               and frame[field].fillna("unknown").ne("unknown").any()), None)
    if cluster_column and cluster_column not in frame:
        raise ValueError(f"Missing cluster metadata column: {cluster_column}")
    metadata_fields = list(dict.fromkeys([*slices, *([cluster_column] if cluster_column else [])]))
    bootstrap_unit = cluster_column or "normalized resume text"
    result = {
        "pairs": len(frame), "resumes": frame["_resume_key"].nunique(),
        "jobs": frame["_job_key"].nunique(), "coverage": coverage(frame, slices),
        "method": {"bootstrap_unit": bootstrap_unit, "bootstrap_draws": draws,
                   "seed": seed, "pairwise_min_label_gap": min_gap,
                   "minimum_slice_independent_clusters": minimum_slice_resumes},
        "limitations": [
            "Career category is not a verified academic major or student year.",
            "Teacher-label agreement is not measured hiring success or human agreement.",
            "Bootstrap intervals describe resume variation conditional on this job pool.",
            "Normalized exact-text checks do not detect paraphrases or shared template fragments.",
            "Family clusters use the supplied family identifiers; unknown families remain individual resumes.",
        ],
    }
    if "prediction" not in frame:
        if baseline is not None:
            raise ValueError("Candidate input has no prediction column")
        return result
    rows = per_resume_metrics(frame, min_gap, metadata_fields)
    def add_clusters(table):
        if cluster_column:
            table["_cluster"] = [
                f"family:{value}" if pd.notna(value) and str(value).strip() not in ("", "unknown")
                else f"resume:{key}" for key, value in zip(table["resume_key"], table[cluster_column])
            ]
        else:
            table["_cluster"] = table["resume_key"]
        return table
    rows = add_clusters(rows)
    result["rankable_resumes"] = len(rows)
    result["excluded_constant_label_resumes"] = result["resumes"] - len(rows)
    result["macro_resume_metrics"] = summarize_rankings(rows, draws, seed)
    result["per_resume"] = rows.where(pd.notnull(rows), None).to_dict("records")
    result["slices"] = {}
    for field in slices:
        result["slices"][field] = [
            {"value": str(value), "rankable_resumes": len(group),
             "independent_clusters": group["_cluster"].nunique(),
             "insufficient_sample": group["_cluster"].nunique() < minimum_slice_resumes,
             "metrics": summarize_rankings(group, draws, seed)}
            for value, group in rows.groupby(field, sort=True)
        ]
    if baseline is not None:
        compare_frames(frame, baseline)
        baseline = baseline.drop(columns=[field for field in metadata_fields if field in baseline]).merge(
            frame[["_resume_key", *metadata_fields]].drop_duplicates(), on="_resume_key",
            validate="many_to_one",
        )
        baseline_rows = add_clusters(per_resume_metrics(baseline, min_gap, metadata_fields))
        joined = rows.merge(baseline_rows, on="resume_key", suffixes=("_candidate", "_baseline"))
        result["baseline_macro_resume_metrics"] = summarize_rankings(baseline_rows, draws, seed)
        result["paired_improvement"] = {
            metric: mean_ci(
                joined[f"{metric}_candidate"].to_numpy(dtype=float)
                - joined[f"{metric}_baseline"].to_numpy(dtype=float), draws=draws, seed=seed,
                clusters=joined["_cluster_candidate"].to_numpy(),
            ) for metric in RANK_METRICS
        }
        result["paired_slice_improvement"] = {}
        for field in slices:
            result["paired_slice_improvement"][field] = [
                {"value": str(value), "rankable_resumes": len(group),
                 "independent_clusters": group["_cluster_candidate"].nunique(),
                 "insufficient_sample": group["_cluster_candidate"].nunique() < minimum_slice_resumes,
                 "metrics": {
                     metric: mean_ci(
                         group[f"{metric}_candidate"].to_numpy(dtype=float)
                         - group[f"{metric}_baseline"].to_numpy(dtype=float), draws=draws, seed=seed,
                         clusters=group["_cluster_candidate"].to_numpy(),
                     ) for metric in RANK_METRICS
                 }} for value, group in joined.groupby(f"{field}_candidate", sort=True)
            ]
    return result


def json_safe(value):
    if isinstance(value, dict):
        return {key: json_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [json_safe(item) for item in value]
    if isinstance(value, (np.integer, np.floating)):
        value = value.item()
    if isinstance(value, float) and not np.isfinite(value):
        return None
    return value


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--baseline", type=Path)
    parser.add_argument("--metadata", type=Path, action="append", default=[])
    parser.add_argument("--training", type=Path, action="append", default=[])
    parser.add_argument("--slices", nargs="+", default=list(DEFAULT_SLICES))
    parser.add_argument("--bootstrap-draws", type=int, default=2000)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--min-label-gap", type=float, default=0.1)
    parser.add_argument("--minimum-slice-resumes", type=int, default=5,
                        help="minimum independent resume/family clusters before marking a slice sufficient")
    parser.add_argument("--cluster-column", help="resample whole profile families; auto-detects profile_family_id/family_id")
    parser.add_argument("--leakage-policy", choices=("resume", "both", "report"), default="resume",
                        help="exit 2 on overlapping training resumes (default), either resumes/jobs, or never")
    parser.add_argument("--json-out", type=Path, required=True)
    args = parser.parse_args()
    metadata_fields = list(dict.fromkeys([*args.slices, *([args.cluster_column] if args.cluster_column else [])]))
    frame = attach_metadata(read_frame(args.input), args.metadata, metadata_fields)
    baseline = read_frame(args.baseline) if args.baseline else None
    result = evaluate(frame, baseline=baseline, slices=args.slices,
                      draws=args.bootstrap_draws, seed=args.seed, min_gap=args.min_label_gap,
                      minimum_slice_resumes=args.minimum_slice_resumes, cluster_column=args.cluster_column)
    result["input"] = str(args.input)
    result["baseline"] = str(args.baseline) if args.baseline else None
    result["leakage"] = leakage_audit(frame, args.training)
    contamination = any(row["overlapping_resumes"] for row in result["leakage"])
    if args.leakage_policy == "both":
        contamination = contamination or any(row["overlapping_jobs"] for row in result["leakage"])
    result["leakage_policy_failed"] = bool(contamination and args.leakage_policy != "report")
    args.json_out.parent.mkdir(parents=True, exist_ok=True)
    args.json_out.write_text(json.dumps(json_safe(result), indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(f"{result['resumes']} resumes, {result['jobs']} jobs, {result['pairs']} pairs; report: {args.json_out}")
    for metric, value in result.get("paired_improvement", {}).items():
        print(f"Paired {metric} improvement: {value['mean']}, 95% CI {value['ci95']}")
    if result["leakage_policy_failed"]:
        print("FAILED: training overlap violates the requested leakage policy")
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
