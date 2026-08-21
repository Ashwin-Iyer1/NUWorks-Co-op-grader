#!/usr/bin/env python3
"""Download resume/job-description matching datasets and build train/val/test pairs.

Produces CSV files in finetune/data/ with three columns:
    resume  - full resume text (encoded with the model's "query" prompt at train time)
    job     - full job-description text (encoded as a plain document)
    score   - match label in [0, 1] (continuous or binary depending on source)

Sources (downloaded anonymously via kagglehub — no Kaggle account needed):
  neuralframe  kaggle.com/datasets/saugataroyarghya/resume-dataset
               9.5k structured resumes paired with job requirements and a
               continuous matched_score in [0, 0.97].  License: CC BY-NC 4.0.
  recruitment  kaggle.com/datasets/surendra365/recruitement-dataset (opt-in)
               10k resume/JD pairs with a binary Best Match label across
               51 job roles.  License: ODbL.  DISABLED by default: analysis
               showed the label is ~50/50 noise uncorrelated with resume
               content (base-model ROC-AUC ~0.52), so training on it only
               hurts.  Enable with --include-recruitment if you want it
               anyway, e.g. as a sanity-check eval set.
  hf (opt-in)  huggingface.co/datasets/cnamuangtoun/resume-job-description-fit
               6.2k full-text pairs labeled No Fit / Potential Fit / Good Fit.
               Enable with --include-hf.

Splits are grouped by resume identity: a resume (or, for the synthetic
neuralframe set, any resume built from shared template fragments) appears in
exactly one of train/val/test, so held-out metrics reflect resumes the model
has never seen.

Usage:
    python prepare_data.py [--include-hf] [--out-dir data]
"""

import argparse
import ast
import os
import re

import kagglehub
import pandas as pd

SEED = 42


def parse_list(cell):
    """Dataset cells hold Python-list literals as strings; fall back to raw text."""
    if not isinstance(cell, str) or not cell.strip():
        return []
    try:
        value = ast.literal_eval(cell)
        if isinstance(value, list):
            return [str(v).strip() for v in value if str(v).strip() and str(v).lower() != "none"]
    except (ValueError, SyntaxError):
        pass
    return [cell.strip()]


def clean(text):
    return re.sub(r"\s+", " ", str(text)).strip()


def fragment_groups(df, columns):
    """Union-find over shared field values: rows sharing any fragment (same
    career objective, skills list, ...) land in one group, so a template can
    never appear in both train and test."""
    parent = list(range(len(df)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for col in columns:
        first = {}
        for i, v in enumerate(df[col].tolist()):
            if pd.isna(v) or not str(v).strip():
                continue
            if v in first:
                ra, rb = find(i), find(first[v])
                if ra != rb:
                    parent[ra] = rb
            else:
                first[v] = i
    return [find(i) for i in range(len(df))]


def build_neuralframe(out_dir):
    path = kagglehub.dataset_download("saugataroyarghya/resume-dataset")
    df = pd.read_csv(os.path.join(path, "resume_data.csv"), encoding="utf-8-sig")

    # These resumes are recombinations of a small pool of template fragments,
    # so split by fragment-sharing group rather than by row.
    groups = fragment_groups(df, ["career_objective", "skills", "positions"])

    rows = []
    for (_, r), group in zip(df.iterrows(), groups):
        resume_parts = []
        if isinstance(r.get("career_objective"), str):
            resume_parts.append(clean(r["career_objective"]))
        skills = parse_list(r.get("skills"))
        if skills:
            resume_parts.append("Skills: " + ", ".join(skills) + ".")
        degrees = parse_list(r.get("degree_names"))
        majors = parse_list(r.get("major_field_of_studies"))
        schools = parse_list(r.get("educational_institution_name"))
        edu = [" in ".join(filter(None, [d, m])) for d, m in
               zip(degrees, majors + [""] * (len(degrees) - len(majors)))] if degrees else []
        if edu:
            suffix = f" ({'; '.join(schools)})" if schools else ""
            resume_parts.append("Education: " + "; ".join(edu) + suffix + ".")
        positions = parse_list(r.get("positions"))
        companies = parse_list(r.get("professional_company_names"))
        if positions:
            jobs = [" at ".join(filter(None, [p, c])) for p, c in
                    zip(positions, companies + [""] * (len(positions) - len(companies)))]
            resume_parts.append("Experience: " + "; ".join(jobs) + ".")
        if isinstance(r.get("responsibilities"), str):
            resume_parts.append("Responsibilities: " + clean(r["responsibilities"]) + ".")
        certs = parse_list(r.get("certification_skills"))
        if certs:
            resume_parts.append("Certifications: " + ", ".join(certs) + ".")

        job_parts = []
        if isinstance(r.get("job_position_name"), str):
            job_parts.append("Position: " + clean(r["job_position_name"]) + ".")
        if isinstance(r.get("educationaL_requirements"), str):
            job_parts.append("Education required: " + clean(r["educationaL_requirements"]))
        if isinstance(r.get("experiencere_requirement"), str):
            job_parts.append("Experience required: " + clean(r["experiencere_requirement"]) + ".")
        if isinstance(r.get("responsibilities.1"), str):
            job_parts.append("Responsibilities: " + clean(r["responsibilities.1"]) + ".")
        req_skills = parse_list(r.get("skills_required"))
        if req_skills:
            job_parts.append("Skills required: " + ", ".join(req_skills) + ".")

        score = r.get("matched_score")
        if resume_parts and job_parts and pd.notna(score):
            rows.append({"resume": " ".join(resume_parts),
                         "job": " ".join(job_parts),
                         "score": round(float(score), 4),
                         "_group": group})

    write_splits(pd.DataFrame(rows), "neuralframe", out_dir)


def build_recruitment(out_dir):
    path = kagglehub.dataset_download("surendra365/recruitement-dataset")
    df = pd.read_csv(os.path.join(path, "job_applicant_dataset.csv"))
    # Deliberately drop name/age/gender/race/ethnicity — the model must never
    # learn demographic signals, only resume-vs-JD content match.
    out = pd.DataFrame({
        "resume": df["Resume"].map(clean),
        "job": df["Job Description"].map(clean),
        "score": df["Best Match"].astype(float),
    }).dropna()
    write_splits(out, "recruitment", out_dir)


HF_LABELS = {"No Fit": 0.0, "Potential Fit": 0.5, "Good Fit": 1.0}


def build_hf(out_dir):
    from datasets import load_dataset

    ds = load_dataset("cnamuangtoun/resume-job-description-fit")
    frames = []
    for split in ds:
        d = ds[split].to_pandas()
        frames.append(pd.DataFrame({
            "resume": d["resume_text"].map(clean),
            "job": d["job_description_text"].map(clean),
            "score": d["label"].map(HF_LABELS),
        }).dropna())
    write_splits(pd.concat(frames, ignore_index=True), "hf", out_dir)


def write_splits(df, name, out_dir, val_frac=0.1, test_frac=0.1):
    """Grouped split: all rows sharing a _group value (same resume, or resumes
    built from shared template fragments) land in the same split, so the test
    set only ever contains resume content the model never trained on."""
    df = df.drop_duplicates(subset=["resume", "job"])
    if "_group" not in df.columns:
        df = df.assign(_group=df["resume"])

    sizes = df.groupby("_group").size().sample(frac=1.0, random_state=SEED)
    n = len(df)
    assignment, cum = {}, 0.0
    for group, size in sizes.items():
        if cum < n * test_frac:
            assignment[group] = "test"
        elif cum < n * (test_frac + val_frac):
            assignment[group] = "val"
        else:
            assignment[group] = "train"
        cum += size

    which = df["_group"].map(assignment)
    for split in ("test", "val", "train"):
        part = (df[which == split]
                .drop(columns="_group")
                .sample(frac=1.0, random_state=SEED))
        out = os.path.join(out_dir, f"{name}_{split}.csv")
        part.to_csv(out, index=False)
        n_groups = df.loc[which == split, "_group"].nunique()
        print(f"{out}: {len(part)} pairs, {n_groups} resume groups "
              f"(mean score {part['score'].mean():.3f})")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out-dir", default=os.path.join(os.path.dirname(__file__) or ".", "data"))
    ap.add_argument("--include-hf", action="store_true",
                    help="also build the HuggingFace resume-job-description-fit dataset")
    ap.add_argument("--include-recruitment", action="store_true",
                    help="also build the Kaggle recruitment dataset (noisy labels, see docstring)")
    args = ap.parse_args()

    os.makedirs(args.out_dir, exist_ok=True)
    build_neuralframe(args.out_dir)
    if args.include_recruitment:
        build_recruitment(args.out_dir)
    if args.include_hf:
        build_hf(args.out_dir)


if __name__ == "__main__":
    main()
