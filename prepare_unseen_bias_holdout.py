#!/usr/bin/env python3
"""Freeze a resume-disjoint random holdout for the NUWorks bias check.

The selected resumes are excluded from every existing OpenAI-label split. One
resume is sampled per category to avoid a result dominated by one profession;
NUWorks jobs are sampled independently. The output files can be passed directly
to generate_openai_labels.py and the manifest makes the sample reproducible.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import random
from collections import defaultdict
from pathlib import Path

from generate_openai_labels import (
    DEFAULT_CATEGORY_ORDER,
    JobRecord,
    ResumeRecord,
    load_job_sources,
    load_resumes,
    stable_id,
)


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def prior_resume_ids(data_dir: Path) -> set[str]:
    ids: set[str] = set()
    for split in ("train", "val", "test"):
        path = data_dir / f"openai_{split}.csv"
        if not path.exists():
            continue
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            for row in csv.DictReader(handle):
                text = (row.get("resume") or "").strip()
                if text:
                    ids.add(stable_id("resume", text))
    return ids


def select_resumes(
    resumes: list[ResumeRecord], excluded_ids: set[str], count: int, seed: int
) -> list[ResumeRecord]:
    grouped: dict[str, list[ResumeRecord]] = defaultdict(list)
    for resume in resumes:
        if resume.resume_id not in excluded_ids:
            grouped[resume.category].append(resume)

    category_order = list(DEFAULT_CATEGORY_ORDER)
    category_order.extend(sorted(set(grouped).difference(category_order)))
    available_categories = [category for category in category_order if grouped[category]]
    if count > len(available_categories):
        raise ValueError(
            f"Requested {count} categories, but only {len(available_categories)} "
            "have unused resumes"
        )

    rng = random.Random(seed)
    selected: list[ResumeRecord] = []
    for category in available_categories[:count]:
        candidates = sorted(grouped[category], key=lambda item: item.resume_id)
        selected.append(rng.choice(candidates))
    return selected


def select_jobs(jobs: list[JobRecord], count: int, seed: int) -> list[JobRecord]:
    if count > len(jobs):
        raise ValueError(f"Requested {count} jobs, but only {len(jobs)} are available")
    ordered = sorted(jobs, key=lambda item: (item.job_id, item.text))
    return random.Random(seed ^ 0x5EEDB1A5).sample(ordered, count)


def job_description(job: JobRecord) -> str:
    prefix = f"Position: {job.title}\n\nDescription:\n"
    return job.text[len(prefix) :] if job.text.startswith(prefix) else job.text


def write_sources(
    output_dir: Path,
    resumes: list[ResumeRecord],
    jobs: list[JobRecord],
    *,
    seed: int,
    excluded_resume_count: int,
    resume_source: Path,
    job_sources: list[Path],
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    resume_path = output_dir / "resumes.csv"
    with resume_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=("Resume_str", "Category"))
        writer.writeheader()
        for resume in resumes:
            writer.writerow({"Resume_str": resume.text, "Category": resume.category})

    job_path = output_dir / "jobs.json"
    job_rows = []
    for job in jobs:
        source_id = job.job_id[4:] if job.job_id.startswith("job-") else job.job_id
        job_rows.append(
            {
                "job_id": source_id,
                "job_title": job.title,
                "job_desc": job_description(job),
            }
        )
    job_path.write_text(
        json.dumps({"models": job_rows}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    manifest = {
        "seed": seed,
        "method": "stratified random: one unused resume per category; random jobs",
        "resume_source": str(resume_source),
        "job_sources": [str(path) for path in job_sources],
        "excluded_prior_resume_ids": excluded_resume_count,
        "resume_count": len(resumes),
        "job_count": len(jobs),
        "pair_count": len(resumes) * len(jobs),
        "resumes": [
            {
                "resume_id": resume.resume_id,
                "category": resume.category,
                "sha256": sha256_text(resume.text),
            }
            for resume in resumes
        ],
        "jobs": [
            {
                "job_id": job.job_id,
                "title": job.title,
                "sha256": sha256_text(job.text),
            }
            for job in jobs
        ],
    }
    (output_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--resume-csv", type=Path, default=Path("archive/Resume/Resume.csv"))
    parser.add_argument(
        "--jobs-json",
        type=Path,
        nargs="+",
        default=[Path("exmaplePayload.json"), Path("more_job_descs.json")],
    )
    parser.add_argument("--data-dir", type=Path, default=Path("data"))
    parser.add_argument(
        "--output-dir", type=Path, default=Path("data/unseen_bias_sources")
    )
    parser.add_argument("--resume-count", type=int, default=24)
    parser.add_argument("--job-count", type=int, default=40)
    parser.add_argument("--seed", type=int, default=20260827)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    excluded = prior_resume_ids(args.data_dir)
    resumes = select_resumes(
        load_resumes(args.resume_csv), excluded, args.resume_count, args.seed
    )
    jobs = select_jobs(load_job_sources(args.jobs_json), args.job_count, args.seed)
    if any(resume.resume_id in excluded for resume in resumes):
        raise AssertionError("A prior OpenAI resume entered the unseen holdout")
    write_sources(
        args.output_dir,
        resumes,
        jobs,
        seed=args.seed,
        excluded_resume_count=len(excluded),
        resume_source=args.resume_csv,
        job_sources=args.jobs_json,
    )
    print(
        f"Frozen {len(resumes)} unseen resumes x {len(jobs)} jobs = "
        f"{len(resumes) * len(jobs):,} pairs in {args.output_dir}"
    )
    print("Categories: " + ", ".join(resume.category for resume in resumes))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
