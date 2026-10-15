#!/usr/bin/env python3
"""Run two fixed local fine-tuning experiments; select using validation only.

No API calls are made. By default print the plan without training/evaluation.
  python run_major_agnostic_experiments.py --execute
  python run_major_agnostic_experiments.py --finalize a_epoch1

The second command requires the exact ID frozen in selection.json. It evaluates
only the selected model and baseline on test, and prevents further selection in
the same run directory. All subprocesses run sequentially with individual logs.
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parent
DATASETS = ("diverse", "openai", "hf", "neuralframe")
RATES = {"a": 1e-5, "b": 3e-5}
WEIGHTS = "diverse=3,openai=1,hf=2,neuralframe=1"
INFERENCE = {"pooling": "mean", "query_prompt": "", "max_seq_length": 256,
             "job_char_cap": 1200, "resume_chunk_chars": 1100}
FLOOR_DROPS = {"hf": 0.02, "openai": 0.02, "neuralframe": 0.03}


def now():
    return datetime.now(timezone.utc).isoformat()


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    temporary.replace(path)


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def model_hashes(path):
    path = Path(path).resolve()
    if not (path / "modules.json").is_file():
        raise ValueError(f"Local SentenceTransformer model missing: {path}")
    files = {str(item.relative_to(path)): sha256(item) for item in sorted(path.rglob("*"))
             if item.is_file() and "checkpoints" not in item.relative_to(path).parts
             and item.suffix not in (".log", ".md")}
    return {"path": str(path), "files": files}


def metric(result, dataset, name="spearman"):
    try:
        value = result["datasets"][dataset]["mean_vector"][name]
    except KeyError as error:
        raise ValueError(f"Missing {dataset} {name} validation metric") from error
    if value is None or not math.isfinite(float(value)):
        raise ValueError(f"Non-finite {dataset} {name} validation metric")
    return float(value)


def validate_result(result, model, split, required=DATASETS):
    if result.get("split") != split:
        raise ValueError(f"Expected {split} results, got {result.get('split')}")
    if Path(result.get("model", "")).resolve() != Path(model).resolve():
        raise ValueError("Evaluation result references a different model")
    if result.get("inference") != INFERENCE:
        raise ValueError("Evaluation must use runtime mean pooling, blank prompt, and fixed caps")
    for dataset in required:
        metric(result, dataset, "mean_resume_spearman" if dataset == "diverse" else "spearman")


def choose_candidate(results):
    """Equal-weight three correlations; regression floors reference baseline."""
    if "baseline" not in results or "mean_replay" not in results:
        raise ValueError("Baseline and mean_replay must both remain selection candidates")
    baseline = results["baseline"]
    rows = []
    for candidate_id, result in results.items():
        if result.get("split") != "val":
            raise ValueError("Selection accepts validation results only")
        components = {
            "diverse_macro_resume_spearman": metric(result, "diverse", "mean_resume_spearman"),
            "hf_spearman": metric(result, "hf"),
            "openai_spearman": metric(result, "openai"),
        }
        failures = [dataset for dataset, drop in FLOOR_DROPS.items()
                    if metric(result, dataset) < metric(baseline, dataset) - drop - 1e-12]
        rows.append({"id": candidate_id, "model": result["model"],
                     "composite": sum(components.values()) / 3, "components": components,
                     "diversity_delta_vs_baseline": components["diverse_macro_resume_spearman"]
                     - metric(baseline, "diverse", "mean_resume_spearman"),
                     "neuralframe_spearman": metric(result, "neuralframe"),
                     "eligible": not failures, "failed_regression_floors": failures})
    eligible = [row for row in rows if row["eligible"]]
    if not eligible:
        raise ValueError("No eligible model; baseline metrics are inconsistent")
    # Diversity decides a tied composite; no test or training metric is inspected.
    best = max(eligible, key=lambda row: (row["composite"],
                                         row["components"]["diverse_macro_resume_spearman"],
                                         row["id"] == "baseline"))
    return {"selected_id": best["id"], "selected_model": best["model"],
            "criterion": "mean(diverse macro-resume rho, HF global rho, OpenAI global rho)",
            "tie_breaker": "higher diverse macro-resume rho, then unchanged baseline",
            "regression_floor_drops_from_baseline": FLOOR_DROPS,
            "selection_split": "val", "candidates": rows}


def train_command(args, candidate):
    return [str(args.python), "-u", "train.py", "--data-dir", str(args.data_dir),
            "--base-model", str(args.base_model), "--output", str(args.run_dir / candidate),
            "--datasets", *DATASETS, "--dataset-weights", WEIGHTS, "--epochs", "2",
            "--batch-size", "64", "--lr", str(RATES[candidate]), "--seed", str(args.seed),
            "--batch-sampler", "grouped", "--matryoshka-dims", "", "--pooling", "mean",
            "--max-seq-length", "256", "--save-total-limit", "2"]


def evaluation_command(args, model, split, output, datasets=DATASETS, predictions=None):
    command = [str(args.python), "-u", "evaluate_production.py", "--model", str(model),
               "--data-dir", str(args.data_dir), "--datasets", *datasets, "--split", split,
               "--batch-size", str(args.eval_batch_size), "--pooling", "mean",
               "--query-prompt", "", "--char-cap", "1200", "--chunk-chars", "1100",
               "--json-out", str(output)]
    if predictions:
        command.extend(["--predictions-dir", str(predictions)])
    return command


def snapshots(args):
    # Never inspect, hash, or load test data before explicit finalization.
    paths = [args.data_dir / f"{dataset}_{split}.csv"
             for dataset in DATASETS for split in ("train", "val")]
    paths += [ROOT / name for name in ("train.py", "evaluate_production.py", __file__)]
    for result in (args.baseline_results, args.base_results):
        if result:
            paths.append(result)
    missing = [str(path) for path in paths if not path.is_file()]
    if missing:
        raise ValueError(f"Inputs are not ready: {missing}")
    return {"files": {str(path.resolve()): sha256(path) for path in paths},
            "baseline_model": model_hashes(args.baseline_model),
            "starting_model": model_hashes(args.base_model),
            "python": str(args.python.resolve()), "seed": args.seed,
            "inference": INFERENCE, "datasets": list(DATASETS), "dataset_weights": WEIGHTS,
            "learning_rates": RATES, "epochs": 2, "batch_size": 64,
            "batch_sampler": "grouped", "matryoshka_dims": [], "api_requests": 0}


class Runner:
    def __init__(self, args, inputs):
        self.args = args
        self.path = args.run_dir / "run_manifest.json"
        if self.path.exists():
            self.manifest = json.loads(self.path.read_text(encoding="utf-8"))
            if self.manifest["inputs"] != inputs:
                raise ValueError("Run inputs changed; use a new --run-dir to preserve experiment provenance")
        else:
            self.manifest = {"created_at": now(), "inputs": inputs, "steps": {}}
            self.save()

    def save(self):
        write_json(self.path, self.manifest)

    def run(self, name, command, artifacts):
        previous = self.manifest["steps"].get(name)
        artifacts = [Path(path) for path in artifacts]
        if previous and previous.get("status") == "completed" and previous["command"] == command:
            if all(path.is_file() and sha256(path) == previous["artifact_hashes"].get(str(path))
                   for path in artifacts):
                print(f"Reusing completed step: {name}", flush=True)
                return
            raise ValueError(f"Completed step artifacts changed: {name}; use a new run directory")
        log = self.args.run_dir / "logs" / f"{name}.log"
        log.parent.mkdir(parents=True, exist_ok=True)
        step = {"command": command, "started_at": now(), "status": "running", "log": str(log)}
        self.manifest["steps"][name] = step
        self.save()
        print(f"Running {name}; log: {log}", flush=True)
        environment = os.environ.copy()
        environment["PYTHONUTF8"] = "1"
        with log.open("w", encoding="utf-8") as handle:
            completed = subprocess.run(command, cwd=ROOT, stdout=handle, stderr=subprocess.STDOUT,
                                       env=environment, check=False)
        step.update({"finished_at": now(), "returncode": completed.returncode,
                     "status": "completed" if completed.returncode == 0 else "failed"})
        if completed.returncode == 0:
            if not all(path.is_file() for path in artifacts):
                step["status"] = "failed"
                self.save()
                raise RuntimeError(f"Step {name} did not produce all required artifacts")
            step["artifact_hashes"] = {str(path): sha256(path) for path in artifacts}
        self.save()
        if completed.returncode:
            raise RuntimeError(f"Step {name} failed with exit {completed.returncode}; see {log}")


@contextmanager
def run_lock(directory):
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / ".run.lock"
    try:
        handle = path.open("x", encoding="utf-8")
    except FileExistsError as error:
        raise RuntimeError(f"Another run owns {path}; inspect its recorded PID before removing a stale lock") from error
    try:
        with handle:
            handle.write(json.dumps({"pid": os.getpid(), "started_at": now()}))
        yield
    finally:
        path.unlink(missing_ok=True)


def evaluate_one(args, runner, candidate_id, model, *, supplied=None, split="val", predictions=False):
    output = args.run_dir / "results" / f"{candidate_id}_{split}.json"
    if supplied:
        result = json.loads(supplied.read_text(encoding="utf-8"))
        validate_result(result, model, split, required=tuple(result.get("datasets", {})))
        missing = [dataset for dataset in DATASETS if dataset not in result["datasets"]]
        if missing:
            supplement = output.with_name(output.stem + "_supplement.json")
            runner.run(f"{candidate_id}_{split}_supplement",
                       evaluation_command(args, model, split, supplement, datasets=missing), [supplement])
            result["datasets"].update(json.loads(supplement.read_text(encoding="utf-8"))["datasets"])
        result["supplied_results"] = {"path": str(supplied), "sha256": sha256(supplied),
                                      "original_data_hashes_available": False}
        write_json(output, result)
    else:
        prediction_dir = args.run_dir / "predictions" / f"{candidate_id}_{split}" if predictions else None
        runner.run(f"{candidate_id}_{split}" + ("_predictions" if predictions else ""),
                   evaluation_command(args, model, split, output, predictions=prediction_dir), [output])
        result = json.loads(output.read_text(encoding="utf-8"))
    validate_result(result, model, split)
    return result, output


def run_validation(args, runner):
    if runner.manifest.get("test_started_at"):
        raise ValueError("Test evaluation already started; validation selection is frozen")
    results, result_files = {}, {}
    for candidate_id, model, supplied in (("baseline", args.baseline_model, args.baseline_results),
                                          ("mean_replay", args.base_model, args.base_results)):
        result, path = evaluate_one(args, runner, candidate_id, model, supplied=supplied)
        results[candidate_id], result_files[candidate_id] = result, path
    for candidate in RATES:
        model_dir = args.run_dir / candidate
        runner.run(f"train_{candidate}", train_command(args, candidate), [model_dir / "modules.json",
                                                                       model_dir / "model.safetensors"])
        checkpoints = sorted((model_dir / "checkpoints").glob("checkpoint-*"),
                             key=lambda path: int(path.name.split("-")[-1]))
        epochs = {}
        for path in checkpoints:
            state = json.loads((path / "trainer_state.json").read_text(encoding="utf-8"))
            epoch = float(state["epoch"])
            if abs(epoch - round(epoch)) < 1e-6:
                epochs[int(round(epoch))] = path
        if set(epochs) != {1, 2}:
            raise ValueError(f"Expected complete epoch 1/2 checkpoints for {candidate}; got {epochs}")
        for epoch, checkpoint in sorted(epochs.items()):
            candidate_id = f"{candidate}_epoch{epoch}"
            hashes = model_hashes(checkpoint)
            previous = runner.manifest.setdefault("checkpoint_hashes", {}).get(candidate_id)
            if previous is not None and previous != hashes:
                raise ValueError(f"Previously evaluated checkpoint changed: {candidate_id}")
            runner.manifest["checkpoint_hashes"][candidate_id] = hashes
            runner.save()
            result, path = evaluate_one(args, runner, candidate_id, checkpoint)
            results[candidate_id], result_files[candidate_id] = result, path
    selection = choose_candidate(results)
    selection["selected_at"] = now()
    selection["validation_result_hashes"] = {key: {"path": str(path), "sha256": sha256(path)}
                                            for key, path in result_files.items()}
    selection["selected_model_hashes"] = model_hashes(selection["selected_model"])
    write_json(args.run_dir / "selection.json", selection)
    runner.manifest["selection_sha256"] = sha256(args.run_dir / "selection.json")
    runner.save()
    print(json.dumps(selection, indent=2))
    print(f"Test data remains unopened. Finalize separately with --finalize {selection['selected_id']}")


def finalize(args, runner):
    selection_path = args.run_dir / "selection.json"
    if not selection_path.is_file() or sha256(selection_path) != runner.manifest.get("selection_sha256"):
        raise ValueError("A valid frozen validation selection is required before finalization")
    selection = json.loads(selection_path.read_text(encoding="utf-8"))
    if args.finalize != selection["selected_id"]:
        raise ValueError(f"Only frozen selection {selection['selected_id']} may be finalized")
    if model_hashes(selection["selected_model"]) != selection["selected_model_hashes"]:
        raise ValueError("Selected model changed after validation selection")
    for item in selection["validation_result_hashes"].values():
        if sha256(item["path"]) != item["sha256"]:
            raise ValueError("Validation results changed after selection")
    test_hashes = {str(args.data_dir / f"{name}_test.csv"): sha256(args.data_dir / f"{name}_test.csv")
                   for name in DATASETS}
    if runner.manifest.get("test_hashes", test_hashes) != test_hashes:
        raise ValueError("Test data changed after finalization began")
    runner.manifest.setdefault("test_started_at", now())
    runner.manifest["test_hashes"] = test_hashes
    runner.save()
    final_results = {}
    for candidate_id, model in dict([(selection["selected_id"], selection["selected_model"]),
                                     ("baseline", str(args.baseline_model))]).items():
        result, path = evaluate_one(args, runner, candidate_id, model, split="test", predictions=True)
        final_results[candidate_id] = {"result_file": str(path), "sha256": sha256(path), "result": result}
    write_json(args.run_dir / "final_test_results.json", {"selection": selection, "models": final_results})
    print(f"Final test results: {args.run_dir / 'final_test_results.json'}")


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=Path("data"))
    parser.add_argument("--base-model", type=Path, default=Path("models/major_agnostic/mean_replay"))
    parser.add_argument("--baseline-model", type=Path, default=Path("models/production_baseline"))
    parser.add_argument("--baseline-results", type=Path)
    parser.add_argument("--base-results", type=Path)
    parser.add_argument("--run-dir", type=Path, default=Path("models/major_agnostic/experiments"))
    parser.add_argument("--python", type=Path, default=Path(sys.executable))
    parser.add_argument("--seed", type=int, default=20261015)
    parser.add_argument("--eval-batch-size", type=int, default=128)
    action = parser.add_mutually_exclusive_group()
    action.add_argument("--execute", action="store_true")
    action.add_argument("--finalize", metavar="SELECTED_ID")
    return parser.parse_args()


def main():
    args = parse_args()
    os.chdir(ROOT)
    if not args.execute and not args.finalize:
        print(json.dumps({"api_requests": 0, "will_train_without_execute": False,
                          "will_read_test_without_finalize": False, "inference": INFERENCE,
                          "training_commands": {key: train_command(args, key) for key in RATES},
                          "validation_datasets": DATASETS, "regression_floor_drops": FLOOR_DROPS,
                          "selection": "equal mean(diverse macro-resume rho, HF rho, OpenAI rho)"}, indent=2))
        return 0
    with run_lock(args.run_dir):
        runner = Runner(args, snapshots(args))
        finalize(args, runner) if args.finalize else run_validation(args, runner)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
