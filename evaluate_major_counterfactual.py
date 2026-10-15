#!/usr/bin/env python3
"""Stress-test irrelevant major/year sensitivity with fixed skills evidence.

These independently authored fictional cases are NOT accuracy labels. Jobs
explicitly accept any major and year. Each paired comparison changes only the
stated major, academic year, or both, while preserving every skill/activity.
Do not use this held-out challenge suite for training or model selection.

Create the suite without loading a model:
  python evaluate_major_counterfactual.py --out-dir reports/counterfactual --write-suite-only

Compare a candidate only AFTER freezing selection on ordinary validation data:
  python evaluate_major_counterfactual.py --baseline models/production_baseline \
      --candidate models/selected --selection-frozen --out-dir reports/counterfactual
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import statistics
from pathlib import Path


VERSION = "independent-major-year-stress-v1"

# Written independently of the training generator and its scenario inventory.
# No names, demographic attributes, contact details, or real applicant text.
CASES = (
    {
        "case_id": "web_quality", "field": "Software quality assurance",
        "major": "Computer Science", "other_majors": ("Music", "Geography"),
        "evidence": (
            "PROJECTS\nBuilt a test harness for a volunteer club's reservation form. "
            "Wrote Python tests covering empty fields, invalid dates, and repeated submissions. "
            "Isolated a validation bug, documented reproduction steps, and checked the fix.\n"
            "EXPERIENCE\nDuring a six-week project, reviewed changes in Git, discussed "
            "test results with a teammate, and maintained a concise defect log.\n"
            "SKILLS\nPython, automated tests, Git, debugging, and clear issue reports."
        ),
        "job": (
            "Software quality assurance intern. Students of any major and any academic "
            "year are eligible; no degree-field or graduation-date restriction. "
            "Write Python tests for input validation, reproduce defects, review fixes "
            "in Git, and communicate results. Coursework, personal projects, and "
            "volunteering qualify; prior paid experience is not required."
        ),
    },
    {
        "case_id": "public_exhibits", "field": "Arts and public communication",
        "major": "Art History", "other_majors": ("Chemistry", "Economics"),
        "evidence": (
            "PROJECTS\nDeveloped an illustrated handout explaining a neighborhood "
            "photography exhibit. Drafted short captions, checked factual claims "
            "against source notes, and revised confusing wording after visitor feedback.\n"
            "EXPERIENCE\nSupported three volunteer exhibit sessions by explaining the "
            "handout, answering visitor questions, and recording recurring questions.\n"
            "SKILLS\nPlain-language writing, copy editing, accessible page layout, "
            "source checking, and welcoming public presentations."
        ),
        "job": (
            "Community exhibit communications intern. Any major and any academic year "
            "are eligible. Draft accessible exhibit captions, verify facts, create "
            "clear handouts, and explain them to visitors. Volunteer and class projects "
            "count as experience. No specific degree, graduation date, or paid-work "
            "history is required."
        ),
    },
    {
        "case_id": "assay_records", "field": "Laboratory data operations",
        "major": "Biology", "other_majors": ("Philosophy", "Accounting"),
        "evidence": (
            "PROJECTS\nOrganized a teaching laboratory's enzyme assay records. Matched "
            "sample identifiers across worksheets, flagged duplicate identifiers, and "
            "plotted replicate measurements in R. Kept flagged observations in an "
            "exception log instead of silently deleting them.\n"
            "EXPERIENCE\nCompleted a supervised data-cleaning assignment and explained "
            "discrepancies to the laboratory coordinator using a reproducible script.\n"
            "SKILLS\nR, CSV data cleaning, identifier reconciliation, basic plots, "
            "and documentation of data-quality limitations."
        ),
        "job": (
            "Laboratory data operations intern. Open to students of all majors and "
            "all academic years. Reconcile sample identifiers, check duplicates, "
            "create basic R plots, and document discrepancies. This role handles "
            "records and does not perform clinical care or require licensure. "
            "Supervised coursework is sufficient; no degree-field or graduation-date requirement."
        ),
    },
    {
        "case_id": "supplier_records", "field": "Finance operations",
        "major": "Accounting", "other_majors": ("Theatre", "Environmental Science"),
        "evidence": (
            "PROJECTS\nCreated an Excel workbook for a student group's supplier "
            "invoices. Used lookup formulas to match invoices with purchase records, "
            "flagged duplicate invoice numbers, and summarized unpaid items in a pivot table.\n"
            "EXPERIENCE\nReconciled one term of records with a volunteer treasurer, "
            "documented exceptions, and drafted polite requests for missing receipts.\n"
            "SKILLS\nExcel lookups, pivot tables, reconciliation, accurate recordkeeping, "
            "and concise written follow-up."
        ),
        "job": (
            "Finance operations intern. Students from any major and academic year "
            "are eligible; no graduation-date or accounting-degree restriction. "
            "Use Excel to match invoices to purchase records, detect duplicates, "
            "summarize outstanding items, and request missing documents. Class or "
            "volunteer projects are acceptable; no license or paid experience is required."
        ),
    },
)


def build_suite() -> list[dict]:
    rows = []
    for case in CASES:
        variants = (
            ("baseline", case["major"], "second-year", "none"),
            ("major_other_1", case["other_majors"][0], "second-year", "major"),
            ("major_other_2", case["other_majors"][1], "second-year", "major"),
            ("year_first", case["major"], "first-year", "year"),
            ("year_fourth", case["major"], "fourth-year", "year"),
            ("major_and_year", case["other_majors"][0], "first-year", "major_and_year"),
        )
        for variant, major, year, changed in variants:
            resume = f"EDUCATION\nBachelor's degree in {major}, {year} student.\n\n{case['evidence']}"
            rows.append({
                "case_id": case["case_id"], "field": case["field"], "variant": variant,
                "changed_attributes": changed, "stated_major": major, "stated_year": year,
                "evidence_sha256": hashlib.sha256(case["evidence"].encode()).hexdigest(),
                "resume": resume, "job": case["job"],
            })
    return rows


def read_calibration(path: Path | None) -> dict | None:
    if path is None:
        return None
    calibration = json.loads(path.read_text(encoding="utf-8"))
    if calibration.get("schema_version") != 1:
        raise ValueError(f"Unsupported calibration schema: {path}")
    if calibration.get("method") == "affine":
        slope, intercept = float(calibration["slope"]), float(calibration["intercept"])
        if not math.isfinite(slope) or not math.isfinite(intercept) or slope < 0:
            raise ValueError("Invalid affine calibration")
    elif calibration.get("method") in ("quantile_piecewise_linear", "isotonic_piecewise_linear"):
        xs, ys = calibration["cosine_knots"], calibration["score_knots"]
        if len(xs) < 2 or len(xs) != len(ys):
            raise ValueError("Invalid calibration knot counts")
        if not all(math.isfinite(value) for value in [*xs, *ys]):
            raise ValueError("Calibration contains nonfinite knots")
        if any(a >= b for a, b in zip(xs, xs[1:])):
            raise ValueError("Cosine knots must strictly increase")
        if any(a > b for a, b in zip(ys, ys[1:])) or any(y < 0 or y > 1 for y in ys):
            raise ValueError("Score knots must be monotone and within [0, 1]")
    else:
        raise ValueError(f"Unsupported calibration method in {path}")
    return calibration


def display_grade(cosine: float, calibration: dict) -> int:
    """Reproduce embeddings.js cosineToScore, including JavaScript rounding."""
    if calibration["method"] == "affine":
        value = calibration["slope"] * cosine + calibration["intercept"]
    else:
        xs, ys = calibration["cosine_knots"], calibration["score_knots"]
        value = ys[0] if cosine <= xs[0] else ys[-1]
        for lower in range(len(xs) - 1):
            if xs[lower] <= cosine <= xs[lower + 1]:
                fraction = (cosine - xs[lower]) / (xs[lower + 1] - xs[lower])
                value = ys[lower] + fraction * (ys[lower + 1] - ys[lower])
                break
    return math.floor(max(0, min(1, value)) * 100 + 0.5)


def compare_variants(rows: list[dict], scores: list[float], calibration: dict | None = None) -> dict:
    if len(rows) != len(scores) or not all(math.isfinite(value) for value in scores):
        raise ValueError("Expected one finite score per suite row")
    base = {row["case_id"]: float(score) for row, score in zip(rows, scores) if row["variant"] == "baseline"}
    comparisons = []
    for row, value in zip(rows, scores):
        if row["variant"] == "baseline":
            continue
        reference = base[row["case_id"]]
        change = float(value) - reference
        item = {key: row[key] for key in ("case_id", "field", "variant", "changed_attributes")}
        item.update(baseline_cosine=reference, variant_cosine=float(value),
                    cosine_change=change, absolute_cosine_change=abs(change))
        if calibration is not None:
            before, after = display_grade(reference, calibration), display_grade(float(value), calibration)
            item.update(baseline_display_grade=before, variant_display_grade=after,
                        display_grade_change=after-before, absolute_display_grade_change=abs(after-before))
        comparisons.append(item)
    summary = {}
    for group in ("all", "major", "year", "major_and_year"):
        subset = [item for item in comparisons if group == "all" or item["changed_attributes"] == group]
        values = [item["absolute_cosine_change"] for item in subset]
        summary[group] = {"comparisons": len(subset), "independent_scenarios": len({item["case_id"] for item in subset}),
                          "mean_absolute_cosine_change": statistics.mean(values),
                          "maximum_absolute_cosine_change": max(values)}
        if calibration is not None:
            grades = [item["absolute_display_grade_change"] for item in subset]
            summary[group].update(mean_absolute_display_grade_change=statistics.mean(grades),
                                  maximum_absolute_display_grade_change=max(grades))
    return {"summary": summary, "comparisons": comparisons}


def model_fingerprints(path: Path) -> dict[str, str]:
    """Fingerprint local Torch weights and tokenizer/configuration artifacts."""
    hashes = {}
    for file in sorted(path.rglob("*")):
        relative = file.relative_to(path)
        if not file.is_file() or any(part in (".cache", "onnx", "openvino") for part in relative.parts):
            continue
        if file.suffix not in (".json", ".txt", ".safetensors", ".bin"):
            continue
        digest = hashlib.sha256()
        with file.open("rb") as handle:
            while chunk := handle.read(1024 * 1024):
                digest.update(chunk)
        hashes[relative.as_posix()] = digest.hexdigest()
    return hashes


def evaluate_local_model(path: Path, rows: list[dict], calibration_path: Path | None, batch_size: int, device: str | None) -> dict:
    # Deliberately lazy: generating/inspecting fixtures needs no model package.
    import pandas as pd
    from sentence_transformers import SentenceTransformer
    from evaluate_production import configure_pooling, score_dataset, chunk_text

    if not path.is_dir():
        raise ValueError(f"Expected a local frozen model directory: {path}")
    model = SentenceTransformer(str(path), local_files_only=True, device=device)
    model.max_seq_length = 256
    while len(model) > 2:
        del model[-1]
    configure_pooling(model, "mean")
    # A changed education label must never displace evidence through truncation.
    inputs = [chunk for row in rows for chunk in chunk_text(row["resume"], 1100)]
    inputs.extend(row["job"][:1200] for row in rows)
    maximum_tokens = max(len(model.tokenizer(text, truncation=False)["input_ids"]) for text in inputs)
    if maximum_tokens > 256:
        raise ValueError("Counterfactual input would be truncated; shorten fixture before freezing it")
    scores = score_dataset(model, pd.DataFrame(rows), batch_size, 1200, 1100, "")["mean_vector"]
    calibration = read_calibration(calibration_path)
    return {
        "model_path": str(path.resolve()), "maximum_untruncated_input_tokens": maximum_tokens,
        "model_file_sha256": model_fingerprints(path),
        "calibration_path": str(calibration_path.resolve()) if calibration_path else None,
        "calibration_sha256": hashlib.sha256(calibration_path.read_bytes()).hexdigest() if calibration_path else None,
        "calibration": calibration,
        **compare_variants(rows, scores.tolist(), calibration),
    }


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", type=Path)
    parser.add_argument("--candidate", type=Path)
    parser.add_argument("--baseline-calibration", type=Path)
    parser.add_argument("--candidate-calibration", type=Path)
    parser.add_argument("--selection-frozen", action="store_true")
    parser.add_argument("--write-suite-only", action="store_true")
    parser.add_argument("--out-dir", type=Path, default=Path("reports/major_counterfactual"))
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--device", choices=("cpu", "cuda"))
    args = parser.parse_args(argv)
    if args.candidate and not args.selection_frozen:
        parser.error("Freeze candidate selection first, then pass --selection-frozen")
    if not args.write_suite_only and args.baseline is None:
        parser.error("--baseline is required unless --write-suite-only")
    if args.batch_size < 1:
        parser.error("--batch-size must be positive")
    rows = build_suite()
    args.out_dir.mkdir(parents=True, exist_ok=True)
    suite_path = args.out_dir / "suite.jsonl"
    suite_text = "".join(json.dumps(row, sort_keys=True) + "\n" for row in rows)
    suite_path.write_text(suite_text, encoding="utf-8")
    report = {
        "version": VERSION, "kind": "counterfactual_invariance_stress_test_not_accuracy",
        "suite_sha256": hashlib.sha256(suite_text.encode()).hexdigest(),
        "independent_scenarios": len(CASES), "documents": len(rows),
        "candidate_selection_frozen": args.selection_frozen,
        "inference": {"pooling": "attention_mask_mean", "aggregation": "normalized_mean_of_chunk_vectors",
                      "max_seq_length": 256, "query_prompt": "", "job_char_cap": 1200, "resume_chunk_chars": 1100},
        "limitations": [
            "Four authored scenarios are a small stress suite, not representative applicants or accuracy labels.",
            "Variants within a scenario are correlated; no independent-sample confidence intervals are claimed.",
            "Lower sensitivity is desirable only when skill evidence and job eligibility truly remain fixed.",
            "No claim about protected traits, actual people, or population fairness follows from these cases.",
            "Display grades, if present, use each model's supplied calibration; raw cosine is the common comparison.",
        ],
        "models": {},
    }
    if not args.write_suite_only:
        for name in ("baseline", "candidate"):
            model_path = getattr(args, name)
            if model_path is None:
                continue
            calibration = getattr(args, f"{name}_calibration")
            if calibration is None and (model_path / "calibration.json").exists():
                calibration = model_path / "calibration.json"
            report["models"][name] = evaluate_local_model(model_path, rows, calibration, args.batch_size, args.device)
        if "candidate" in report["models"]:
            report["candidate_minus_baseline_mean_absolute_cosine_change"] = {
                group: report["models"]["candidate"]["summary"][group]["mean_absolute_cosine_change"]
                - report["models"]["baseline"]["summary"][group]["mean_absolute_cosine_change"]
                for group in ("all", "major", "year", "major_and_year")
            }
    (args.out_dir / "report.json").write_text(json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({"suite": str(suite_path), "report": str(args.out_dir / "report.json"),
                      "models_evaluated": list(report["models"])}))


if __name__ == "__main__":
    main()
