#!/usr/bin/env python3
"""Evaluate CSV splits using the actual Transformers.js q8 CPU pipeline.

The default job batch size 16 and text helpers come from chrome-extension's
worker/caller. Resume chunks are batched per resume. This fixes tokenizer and
dynamic-quantization batch differences from Python ONNX evaluation, while
keeping Node CPU vs browser WASM numerical equivalence an explicit limitation.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
import subprocess

import numpy as np
import pandas as pd
from scipy import stats

from evaluate_production import ranking_metrics


ROOT = Path(__file__).resolve().parent


def text_id(prefix, text):
    return prefix + hashlib.sha256(text.encode("utf-8")).hexdigest()


def runtime_job_text(text, strip_label_envelope=True):
    if strip_label_envelope:
        match = re.match(r"^Position: ([^\n]*)\n\nDescription:\n([\s\S]*)$", text)
        if match:
            return f"{match.group(1)}\n{match.group(2)}"
    return text


def prepare_input(frames, strip_label_envelope=True):
    resumes, jobs, pairs = {}, {}, []
    stripped = 0
    for name, frame in frames.items():
        for index, row in frame.iterrows():
            resume = str(row["resume"])
            original_job = str(row["job"])
            job = runtime_job_text(original_job, strip_label_envelope)
            stripped += job != original_job
            resume_id, job_id = text_id("r-", resume), text_id("j-", job)
            resumes[resume_id], jobs[job_id] = resume, job
            pairs.append({"id": f"{name}:{index}", "dataset": name,
                          "resume_id": resume_id, "job_id": job_id})
    return {"resumes": [{"id": key, "text": text} for key, text in resumes.items()],
            "jobs": [{"id": key, "text": text} for key, text in jobs.items()],
            "pairs": pairs, "label_envelopes_removed": stripped}


def apply_scores(frames, scored):
    records = scored["scores"]
    mapping = {row["id"]: float(row["prediction"]) for row in records}
    expected = {f"{name}:{index}" for name, frame in frames.items() for index in frame.index}
    if len(mapping) != len(records) or set(mapping) != expected:
        raise ValueError("Runtime score IDs do not exactly match the input pairs")
    if not all(np.isfinite(value) for value in mapping.values()):
        raise ValueError("Runtime returned non-finite scores")
    output = {}
    for name, frame in frames.items():
        result = frame.copy()
        result["prediction"] = [mapping[f"{name}:{index}"] for index in frame.index]
        output[name] = result
    return output


def clean_json(value):
    if isinstance(value, dict):
        return {key: clean_json(item) for key, item in value.items()}
    if isinstance(value, list):
        return [clean_json(item) for item in value]
    if isinstance(value, (np.integer, np.floating)):
        value = value.item()
    return None if isinstance(value, float) and not np.isfinite(value) else value


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--data-dir", type=Path, default=Path("data"))
    parser.add_argument("--datasets", nargs="+", default=["diverse", "openai", "hf", "neuralframe"])
    parser.add_argument("--split", choices=("val", "test"), default="val")
    parser.add_argument("--json-out", type=Path, required=True)
    parser.add_argument("--predictions-dir", type=Path)
    parser.add_argument("--artifact-dir", type=Path)
    parser.add_argument("--runtime-ref", default="chrome-extension")
    parser.add_argument("--node", default="node")
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument("--job-batch-size", type=int, default=16)
    parser.add_argument("--char-cap", type=int, default=1200)
    parser.add_argument("--keep-label-envelope", action="store_true",
                        help="retain synthetic Position:/Description: wrappers instead of runtime title + description")
    args = parser.parse_args()
    frames, data_hashes = {}, {}
    for name in args.datasets:
        source = args.data_dir / f"{name}_{args.split}.csv"
        frame = pd.read_csv(source).reset_index(drop=True)
        required = ["resume", "job", "score"]
        if frame.empty or not set(required).issubset(frame) or frame[required].isna().any().any():
            raise ValueError(f"{source}: missing input text/labels")
        frame["score"] = pd.to_numeric(frame["score"], errors="raise")
        if not frame["score"].between(0, 1).all():
            raise ValueError(f"{source}: labels must be finite and normalized to [0, 1]")
        frames[name] = frame
        data_hashes[str(source)] = hashlib.sha256(source.read_bytes()).hexdigest()
    artifacts = args.artifact_dir or args.json_out.parent / (args.json_out.stem + "_runtime")
    artifacts.mkdir(parents=True, exist_ok=True)
    input_path, output_path = artifacts / "input.json", artifacts / "scores.json"
    prepared = prepare_input(frames, not args.keep_label_envelope)
    input_path.write_text(json.dumps(prepared, ensure_ascii=False), encoding="utf-8")
    command = [args.node, str(ROOT / "evaluate_transformersjs.mjs"), "--model", str(args.model.resolve()),
               "--input", str(input_path.resolve()), "--output", str(output_path.resolve()),
               "--runtime-ref", args.runtime_ref, "--threads", str(args.threads),
               "--job-batch-size", str(args.job_batch_size), "--char-cap", str(args.char_cap)]
    subprocess.run(command, cwd=ROOT, check=True)
    scored = json.loads(output_path.read_text(encoding="utf-8"))
    predicted = apply_scores(frames, scored)
    output = {"model": str(args.model), "split": args.split, "datasets": {},
              "inference": scored["inference"], "runtime": scored["runtime"],
              "runtime_source": scored["runtime_source"], "input_sha256": scored["input_sha256"],
              "model_file_sha256": scored["model_file_sha256"], "counts": scored["counts"],
              "elapsed_seconds": scored["elapsed_seconds"],
              "data_sha256": data_hashes, "runtime_scores": str(output_path), "command": command,
              "label_envelopes_removed": prepared["label_envelopes_removed"]}
    for name, frame in predicted.items():
        labels, scores = frame["score"].to_numpy(), frame["prediction"].to_numpy()
        metrics = {"n": len(frame), "spearman": float(stats.spearmanr(scores, labels).statistic),
                   "pearson": float(stats.pearsonr(scores, labels).statistic),
                   "mae_raw_cosine": float(np.mean(np.abs(scores - labels))),
                   **ranking_metrics(frame, scores)}
        output["datasets"][name] = {"mean_vector": metrics}
        if args.predictions_dir:
            args.predictions_dir.mkdir(parents=True, exist_ok=True)
            frame.to_csv(args.predictions_dir / f"{name}_{args.split}_mean_vector.csv", index=False)
        print(f"{name}: rho={metrics['spearman']:.4f}, resume rho={metrics['mean_resume_spearman']}")
    args.json_out.parent.mkdir(parents=True, exist_ok=True)
    args.json_out.write_text(json.dumps(clean_json(output), indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(f"Transformers.js q8 CPU results: {args.json_out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
