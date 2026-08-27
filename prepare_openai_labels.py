#!/usr/bin/env python3
"""Create leakage-safe train/validation/test splits from OpenAI labels.

The label generator deliberately grades each resume against every job. Splits
must therefore be made by resume ID, never by individual pair, or the same
resume text would occur in both training and evaluation data.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
from pathlib import Path

import pandas as pd


REQUIRED_COLUMNS = {"resume", "job", "score", "resume_id", "job_id", "category"}
TRAINING_COLUMNS = ["resume", "job", "score"]


def split_by_resume(
    frame: pd.DataFrame,
    *,
    train_groups: int = 7,
    val_groups: int = 2,
    seed: int = 42,
) -> tuple[dict[str, pd.DataFrame], dict[str, list[str]]]:
    missing = REQUIRED_COLUMNS.difference(frame.columns)
    if missing:
        raise ValueError(f"Input CSV is missing columns: {sorted(missing)}")

    frame = frame.copy()
    frame["score"] = pd.to_numeric(frame["score"], errors="raise")
    if frame[list(REQUIRED_COLUMNS)].isna().any().any():
        raise ValueError("Input CSV contains missing required values")
    if not frame["score"].between(0.0, 1.0).all():
        raise ValueError("All scores must be normalized to [0, 1]")
    if frame.duplicated(["resume_id", "job_id"]).any():
        raise ValueError("Input CSV contains duplicate resume/job pairs")

    resume_ids = sorted(frame["resume_id"].astype(str).unique())
    if train_groups < 1 or val_groups < 1:
        raise ValueError("train_groups and val_groups must both be positive")
    if train_groups + val_groups >= len(resume_ids):
        raise ValueError("At least one resume group must remain for the test split")

    random.Random(seed).shuffle(resume_ids)
    membership = {
        "train": resume_ids[:train_groups],
        "val": resume_ids[train_groups : train_groups + val_groups],
        "test": resume_ids[train_groups + val_groups :],
    }
    splits = {}
    for split, ids in membership.items():
        part = frame[frame["resume_id"].astype(str).isin(ids)].copy()
        part = part.sample(frac=1.0, random_state=seed).reset_index(drop=True)
        splits[split] = part
    return splits, membership


def prepare(
    input_path: Path,
    output_dir: Path,
    *,
    name: str = "openai",
    train_groups: int = 7,
    val_groups: int = 2,
    seed: int = 42,
) -> dict:
    frame = pd.read_csv(input_path)
    splits, membership = split_by_resume(
        frame,
        train_groups=train_groups,
        val_groups=val_groups,
        seed=seed,
    )
    output_dir.mkdir(parents=True, exist_ok=True)

    manifest = {
        "source": str(input_path),
        "source_sha256": hashlib.sha256(input_path.read_bytes()).hexdigest(),
        "seed": seed,
        "dataset_name": name,
        "splits": {},
    }
    for split, part in splits.items():
        path = output_dir / f"{name}_{split}.csv"
        part[TRAINING_COLUMNS].to_csv(path, index=False)
        categories = sorted(part["category"].astype(str).unique())
        manifest["splits"][split] = {
            "path": str(path),
            "pairs": len(part),
            "resume_groups": len(membership[split]),
            "resume_ids": membership[split],
            "categories": categories,
            "mean_score": round(float(part["score"].mean()), 6),
            "score_std": round(float(part["score"].std()), 6),
        }
        print(
            f"{path}: {len(part):,} pairs, {len(membership[split])} resumes, "
            f"mean score {part['score'].mean():.3f}"
        )

    manifest_path = output_dir / f"{name}_split_manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Split manifest: {manifest_path}")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=Path("openai_labels/train.csv"))
    parser.add_argument("--output-dir", type=Path, default=Path("data"))
    parser.add_argument("--name", default="openai")
    parser.add_argument("--train-groups", type=int, default=7)
    parser.add_argument("--val-groups", type=int, default=2)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    prepare(
        args.input,
        args.output_dir,
        name=args.name,
        train_groups=args.train_groups,
        val_groups=args.val_groups,
        seed=args.seed,
    )


if __name__ == "__main__":
    main()
