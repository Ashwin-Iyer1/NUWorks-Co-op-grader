#!/usr/bin/env python3
"""Freeze diverse sparse pairs and export family/job-disjoint labeled splits.

The lexical sampler chooses candidates, never labels. Every score must come
from the labeler. Synthetic and real-source evaluation remain separate.
"""
import argparse
import csv
import hashlib
import json
import random
from pathlib import Path

import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer

from generate_openai_labels import load_resumes, load_jobs, stable_id, write_json


def freeze_pairs(resume_csv, jobs_json, output, train_jobs=8, eval_jobs=16, seed=20261015):
    if train_jobs < 1 or eval_jobs < 1:
        raise ValueError("Train/evaluation job counts must be positive")
    metadata = pd.read_csv(resume_csv).fillna("")
    resumes = load_resumes(Path(resume_csv))
    jobs = load_jobs(Path(jobs_json))
    if len(metadata) != len(resumes):
        raise ValueError("Resume metadata and normalized unique resumes must align")
    payload = json.loads(Path(jobs_json).read_text(encoding="utf-8"))
    source_jobs = payload["models"] if isinstance(payload, dict) else payload
    source_ids = [str(row.get("job_id", "")).strip() for row in source_jobs]
    if any(not value for value in source_ids) or len(set(source_ids)) != len(source_ids):
        raise ValueError("Every source job must have a unique nonempty job_id")
    source_by_id = {f"job-{row['job_id']}": row for row in source_jobs}
    job_metadata = {job.job_id: source_by_id[job.job_id] for job in jobs}
    if len(job_metadata) != len(jobs):
        raise ValueError("Duplicate or ambiguous job metadata")
    metadata["resume_id"] = [r.resume_id for r in resumes]
    metadata["resume"] = [r.text for r in resumes]
    for field in ("split", "major", "family_id"):
        if field not in metadata:
            raise ValueError(f"Missing {field} metadata")
        if metadata[field].astype(str).str.strip().eq("").any():
            raise ValueError(f"Empty {field} metadata")
    if metadata.groupby("family_id")["split"].nunique().max() != 1:
        raise ValueError("Resume family crosses splits")
    if set(metadata["split"]) != {"train", "val", "test"}:
        raise ValueError("Expected train/val/test")
    if any(row.get("split") not in {"train", "val", "test"} for row in source_jobs):
        raise ValueError("Every job requires train/val/test split metadata")
    # No exact job or resume text may cross a split, even under different IDs.
    for texts in ([(r.text, metadata.iloc[i]["split"]) for i, r in enumerate(resumes)],
                  [(j.text, job_metadata[j.job_id]["split"]) for j in jobs]):
        seen = {}
        for text, split in texts:
            key = " ".join(text.lower().split())
            if key in seen and seen[key] != split:
                raise ValueError("Duplicate content crosses splits")
            seen[key] = split
    vectorizer = TfidfVectorizer(stop_words="english", ngram_range=(1, 2), sublinear_tf=True)
    matrix = vectorizer.fit_transform([j.text for j in jobs] + [r.text for r in resumes])
    similarities = (matrix[len(jobs):] @ matrix[:len(jobs)].T).toarray()
    planned_by_resume = []
    for index, resume in enumerate(resumes):
        row = metadata.iloc[index]
        count = train_jobs if row["split"] == "train" else eval_jobs
        eligible = [i for i, j in enumerate(jobs) if job_metadata[j.job_id]["split"] == row["split"]]
        if len(eligible) < count:
            raise ValueError("Too few jobs in split")
        ranked = sorted(eligible, key=lambda i: (-similarities[index, i], jobs[i].job_id))
        # Same-major, adjacent-domain hard alternatives, and random mismatches.
        # A major match alone is never treated as a positive label.
        evidence_domain = row.get("skill_domain", row["major"])
        own = [i for i in ranked if job_metadata[jobs[i].job_id].get("major") == evidence_domain]
        chosen = own[:min(2, count)]
        chosen += [i for i in ranked if i not in chosen][:max(0, count // 2 - len(chosen))]
        remaining = [i for i in eligible if i not in chosen]
        rng = random.Random(f"{seed}:{resume.resume_id}")
        rng.shuffle(remaining)
        chosen += remaining[:count-len(chosen)]
        planned_by_resume.append([
            {"resume_id": resume.resume_id, "job_id": jobs[i].job_id,
             "split": row["split"], "family_id": row["family_id"], "major": row["major"],
             "selection": "domain_or_lexical" if offset < count // 2 else "random"}
            for offset, i in enumerate(chosen)
        ])
    # Interleave majors, stages and splits before spending, avoiding a prefix
    # consisting entirely of one major if an invocation reaches its cap.
    random.Random(seed).shuffle(planned_by_resume)
    pairs = [rows[i] for i in range(max(map(len, planned_by_resume)))
             for rows in planned_by_resume if i < len(rows)]
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    metadata.to_csv(output / "resume_metadata.csv", index=False)
    pd.DataFrame([
        {**job_metadata[job.job_id], "job_id": job.job_id, "job": job.text}
        for job in jobs
    ]).to_csv(output / "job_metadata.csv", index=False)
    with (output / "pairs.jsonl").open("w", encoding="utf-8") as handle:
        for pair in pairs:
            handle.write(json.dumps(pair) + "\n")
    plan = {"seed": seed, "resumes": len(resumes), "jobs": len(jobs), "pairs": len(pairs),
            "pairs_by_split": dict(pd.Series([r["split"] for r in pairs]).value_counts().items()),
            "resume_sha256": hashlib.sha256(Path(resume_csv).read_bytes()).hexdigest(),
            "jobs_sha256": hashlib.sha256(Path(jobs_json).read_bytes()).hexdigest(),
            "selection": "half domain/lexical candidates, half random; no pseudo labels",
            "split_policy": "disjoint resume scenario families and job scenarios"}
    write_json(output / "pair_plan.json", plan)
    return plan


def export_splits(labels_csv, plan_dir, output, name="diverse"):
    plan_dir, output = Path(plan_dir), Path(output)
    metadata = pd.read_csv(plan_dir / "resume_metadata.csv").fillna("")
    labels = pd.read_csv(labels_csv)
    required = {"resume_id", "job_id", "resume", "job", "score"}
    if not required.issubset(labels.columns):
        raise ValueError(f"Missing label columns: {sorted(required - set(labels.columns))}")
    if labels[list(required)].isna().any().any():
        raise ValueError("Labels contain missing required values")
    with (plan_dir / "pairs.jsonl").open(encoding="utf-8") as handle:
        pairs = pd.DataFrame(json.loads(line) for line in handle if line.strip())
    if labels.duplicated(["resume_id", "job_id"]).any():
        raise ValueError("Duplicate labeled pairs")
    if not labels["score"].between(0, 1).all():
        raise ValueError("Scores must be finite and within [0, 1]")
    if pairs.duplicated(["resume_id", "job_id"]).any():
        raise ValueError("Duplicate frozen pairs")
    # The frozen manifest, rather than caller-provided labels, controls splits.
    if "split" in labels:
        labels = labels.drop(columns="split")
    frame = labels.merge(pairs[["resume_id", "job_id", "split"]], on=["resume_id", "job_id"], validate="one_to_one")
    if len(frame) != len(labels):
        raise ValueError("Labels include pairs outside frozen manifest")
    # Check every split before writing any trainer-visible CSV. A partial run
    # must never leave an apparently finished train split behind.
    for split in ("train", "val", "test"):
        actual, expected = (frame["split"] == split).sum(), (pairs["split"] == split).sum()
        if actual != expected:
            raise ValueError(f"Incomplete {split}: {actual}/{expected}; resume labeling before training")
    if metadata["resume_id"].duplicated().any():
        raise ValueError("Duplicate frozen resume metadata")
    canonical_resumes = metadata.set_index("resume_id")["resume"]
    if not frame["resume"].eq(frame["resume_id"].map(canonical_resumes)).all():
        raise ValueError("Labeled resume text differs from the frozen manifest")
    job_metadata = pd.read_csv(plan_dir / "job_metadata.csv")
    if job_metadata["job_id"].duplicated().any():
        raise ValueError("Duplicate frozen job metadata")
    canonical_jobs = job_metadata.set_index("job_id")["job"]
    if not frame["job"].eq(frame["job_id"].map(canonical_jobs)).all():
        raise ValueError("Labeled job text differs from the frozen manifest")
    # Use canonical diversity annotations even if an external label file has
    # overlapping metadata columns.
    authoritative = [field for field in metadata if field not in ("resume_id", "resume", "split")]
    frame = frame.drop(columns=[field for field in authoritative if field in frame])
    columns = [c for c in metadata.columns if c not in frame.columns or c == "resume_id"]
    frame = frame.merge(metadata[columns], on="resume_id", validate="many_to_one")
    output.mkdir(parents=True, exist_ok=True)
    report = {"planned_pairs": len(pairs), "labeled_pairs": len(frame), "splits": {}}
    for split in ("train", "val", "test"):
        part = frame[frame["split"] == split].copy()
        if split == "train":
            part[["resume", "job", "score"]].to_csv(output / f"{name}_{split}.csv", index=False)
        else:
            part.to_csv(output / f"{name}_{split}.csv", index=False)
        part.to_csv(output / f"{name}_{split}_metadata.csv", index=False)
        report["splits"][split] = {"pairs": len(part), "resumes": part.resume_id.nunique(),
                                     "families": part.family_id.nunique(), "jobs": part.job_id.nunique(),
                                     "majors": part.major.nunique(), "mean_score": float(part.score.mean())}
    write_json(output / f"{name}_split_manifest.json", report)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--resumes", default="data/major_agnostic/resumes.csv")
    parser.add_argument("--jobs", default="data/major_agnostic/jobs.json")
    parser.add_argument("--plan-dir", default="data/major_agnostic/plan")
    parser.add_argument("--train-jobs", type=int, default=8)
    parser.add_argument("--eval-jobs", type=int, default=16)
    parser.add_argument("--labels", help="export completed labels instead of rebuilding frozen pairs")
    parser.add_argument("--output", default="data")
    args = parser.parse_args()
    report = (export_splits(args.labels, args.plan_dir, args.output) if args.labels else
              freeze_pairs(args.resumes, args.jobs, args.plan_dir, args.train_jobs, args.eval_jobs))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
