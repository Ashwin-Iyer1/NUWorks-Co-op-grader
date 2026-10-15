#!/usr/bin/env python3
"""Copy a frozen selected checkpoint into a clean inference-only release.

No models are trained, exported, loaded, or sent to APIs. The selected checkpoint
is verified using the experiment runner's exact model_hashes function and is
never modified. Generated trainer README files can embed training examples and
are deliberately excluded; write a reviewed model card separately.

  python package_model_release.py \
      --selection models/major_agnostic/experiments/selection.json \
      --output models/major_agnostic/selected_model
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import tempfile
from pathlib import Path, PurePosixPath

from run_major_agnostic_experiments import ROOT, model_hashes, sha256


MANIFEST_NAME = "release_provenance.json"
INFERENCE_NAMES = {
    "modules.json", "config.json", "config_sentence_transformers.json",
    "tokenizer.json", "tokenizer_config.json", "special_tokens_map.json",
    "added_tokens.json", "vocab.txt", "vocab.json", "merges.txt",
    "tokenizer.model", "spiece.model", "sentencepiece.bpe.model",
    "model.safetensors", "model.safetensors.index.json",
    "pytorch_model.bin", "pytorch_model.bin.index.json",
}
INFERENCE_PATTERN = re.compile(
    r"(?:sentence_[A-Za-z0-9_]+_config\.json|"
    r"model-\d+-of-\d+\.safetensors|pytorch_model-\d+-of-\d+\.bin)\Z"
)


def json_hash(value) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def inference_files(source: Path) -> dict[str, Path]:
    """Allowlist inference files only in modules.json-declared directories."""
    source = source.resolve()
    modules = json.loads((source / "modules.json").read_text(encoding="utf-8"))
    if not isinstance(modules, list) or not modules:
        raise ValueError("Expected a nonempty SentenceTransformer modules.json")
    directories = {source}
    for module in modules:
        if not str(module.get("type", "")).startswith("sentence_transformers."):
            raise ValueError("Only built-in SentenceTransformer modules may be packaged")
        relative = PurePosixPath(str(module.get("path", "")).replace("\\", "/"))
        if relative.is_absolute() or any(part in ("..", ".") or ":" in part for part in relative.parts):
            raise ValueError("Unsafe module path in modules.json")
        directory = source.joinpath(*relative.parts)
        if directory.is_symlink() or not directory.resolve().is_relative_to(source):
            raise ValueError("Module directory resolves outside the selected checkpoint")
        if not directory.is_dir():
            raise ValueError(f"Missing declared module directory: {relative}")
        directories.add(directory)
    selected = {}
    for directory in sorted(directories):
        for file in sorted(directory.iterdir()):
            if file.name not in INFERENCE_NAMES and not INFERENCE_PATTERN.fullmatch(file.name):
                continue
            if not file.is_file() or file.is_symlink() or not file.resolve().is_relative_to(source):
                raise ValueError(f"Inference asset is not a regular checkpoint file: {file.name}")
            selected[file.relative_to(source).as_posix()] = file
    if "modules.json" not in selected:
        raise ValueError("Missing modules.json")
    if not any(name.endswith((".safetensors", ".bin")) for name in selected):
        raise ValueError("No inference model weights found")
    # Sharded weights must be complete; don't emit a seemingly usable package
    # that points to shards omitted by the allowlist.
    for name, file in selected.items():
        if not name.endswith(".index.json"):
            continue
        index = json.loads(file.read_text(encoding="utf-8"))
        weight_map = index.get("weight_map")
        if not isinstance(weight_map, dict) or not weight_map:
            raise ValueError(f"Invalid weight index: {name}")
        for shard in set(weight_map.values()):
            target = (PurePosixPath(name).parent / str(shard)).as_posix()
            if target not in selected:
                raise ValueError(f"Missing inference weight shard: {target}")
    return selected


def baseline_provenance(run: dict, explicit_revision: str | None, repo_id: str) -> dict:
    baseline = run.get("inputs", {}).get("baseline_model", {})
    baseline_path = Path(baseline.get("path", ""))
    frozen = {key.replace("\\", "/"): value for key, value in baseline.get("files", {}).items()}
    metadata_name = ".cache/huggingface/download/model.safetensors.metadata"
    metadata = baseline_path / metadata_name
    inferred = None
    evidence_hash = None
    if metadata_name in frozen:
        if not metadata.is_file() or sha256(metadata) != frozen[metadata_name]:
            raise ValueError("Frozen baseline HF revision evidence changed or is missing")
        inferred = metadata.read_text(encoding="utf-8").splitlines()[0].strip()
        evidence_hash = frozen[metadata_name]
        if not re.fullmatch(r"[a-fA-F0-9]{40}", inferred):
            raise ValueError("Baseline download metadata has no pinned HF commit revision")
    if explicit_revision is not None and inferred is not None and explicit_revision.lower() != inferred.lower():
        raise ValueError("Explicit baseline revision conflicts with frozen download metadata")
    revision = explicit_revision or inferred
    if not revision or not re.fullmatch(r"[a-fA-F0-9]{40}", revision):
        raise ValueError("Provide --baseline-hf-revision with the pinned 40-character HF commit")
    return {
        "repo_id": repo_id, "revision": revision.lower(),
        "revision_evidence": "frozen_huggingface_download_metadata" if inferred else "explicit_operator_supplied_revision",
        "revision_metadata_sha256": evidence_hash,
        "frozen_baseline_snapshot_sha256": json_hash(baseline),
    }


def package_release(selection_path: Path, output: Path, *, run_manifest_path: Path | None = None,
                    baseline_hf_revision: str | None = None,
                    baseline_hf_repo: str = "turtlecap/mdbr-leaf-mt-resume-grader") -> dict:
    selection_path, output = Path(selection_path).resolve(), Path(output).resolve()
    run_manifest_path = Path(run_manifest_path).resolve() if run_manifest_path else selection_path.with_name("run_manifest.json")
    selection = json.loads(selection_path.read_text(encoding="utf-8"))
    run = json.loads(run_manifest_path.read_text(encoding="utf-8"))
    selection_digest = sha256(selection_path)
    if run.get("selection_sha256") != selection_digest or selection.get("selection_split") != "val":
        raise ValueError("Selection is not frozen by the experiment run manifest")
    source = Path(selection["selected_model"])
    source = source.resolve() if source.is_absolute() else (ROOT / source).resolve()
    if output == source or output.is_relative_to(source) or source.is_relative_to(output):
        raise ValueError("Release output must not overlap the selected checkpoint")
    snapshot = model_hashes(source)
    if snapshot != selection.get("selected_model_hashes"):
        raise ValueError("Selected checkpoint changed after validation selection")
    for artifact in selection.get("validation_result_hashes", {}).values():
        if sha256(Path(artifact["path"])) != artifact["sha256"]:
            raise ValueError("Frozen validation results changed")
    baseline = baseline_provenance(run, baseline_hf_revision, baseline_hf_repo)
    selected = inference_files(source)
    release_hashes = {name: sha256(file) for name, file in selected.items()}
    # Confirm each released file belongs to the already-verified snapshot.
    snapshot_files = {key.replace("\\", "/"): value for key, value in snapshot["files"].items()}
    if any(snapshot_files.get(name) != digest for name, digest in release_hashes.items()):
        raise ValueError("Inference files changed during packaging preflight")
    manifest = {
        "schema_version": 1, "kind": "frozen_sentence_transformer_inference_release",
        "selected_id": selection["selected_id"], "selection_split": "val",
        "selected_at": selection.get("selected_at"), "selection_sha256": selection_digest,
        "source_snapshot_sha256": json_hash(snapshot),
        "experiment_run_manifest_sha256": sha256(run_manifest_path),
        "baseline_huggingface": baseline,
        "inference": run.get("inputs", {}).get("inference", {}),
        "release_files_sha256": release_hashes,
        "release_contents_sha256": json_hash(release_hashes),
        "copied_file_count": len(release_hashes),
        "source_checkpoint_modified": False, "api_requests": 0,
        "exclusions": ["auto-generated README/model cards", "optimizer/scheduler/RNG/trainer states",
                       "training arguments and examples", "checkpoints", "cache", "logs", "calibration and ONNX exports"],
    }
    if output.exists() and not output.is_dir():
        raise ValueError("Release output already exists and is not a directory")
    existing_files = {file.relative_to(output).as_posix(): file for file in output.rglob("*") if file.is_file()} if output.exists() else {}
    if existing_files:
        extra = set(existing_files) - set(release_hashes) - {MANIFEST_NAME}
        if extra or set(release_hashes) - set(existing_files):
            raise ValueError("Nonempty release directory does not contain exactly the expected inference files")
        if any(existing_files[name].is_symlink() or sha256(existing_files[name]) != digest
               for name, digest in release_hashes.items()):
            raise ValueError("Nonempty release directory has different inference bytes; use a fresh output")
        provenance_path = output / MANIFEST_NAME
        if provenance_path.exists():
            previous = json.loads(provenance_path.read_text(encoding="utf-8"))
            keys = ("selection_sha256", "source_snapshot_sha256", "baseline_huggingface", "release_files_sha256")
            if any(previous.get(key) != manifest[key] for key in keys):
                raise ValueError("Existing release provenance describes a different frozen selection")
            return previous
        # Identical inference files may be adopted, but never rewritten.
        provenance_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        return manifest
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=f".{output.name}-staging-", dir=output.parent) as staging_name:
        staging = Path(staging_name)
        for name, file in selected.items():
            destination = staging / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(file, destination)
            if sha256(destination) != release_hashes[name]:
                raise ValueError(f"Copied inference file failed verification: {name}")
        # Freeze verification covers ALL original checkpoint files, including
        # excluded training state. We never write back to the checkpoint.
        if model_hashes(source) != snapshot or sha256(selection_path) != selection_digest:
            raise ValueError("Frozen source changed while packaging; release was not published")
        (staging / MANIFEST_NAME).write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        if output.exists():
            # Only an empty directory reached this branch. rmdir cannot remove
            # newly appeared files, so a racing writer causes a safe failure.
            output.rmdir()
        staging.replace(output)
    return manifest


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--selection", type=Path, default=Path("models/major_agnostic/experiments/selection.json"))
    parser.add_argument("--run-manifest", type=Path)
    parser.add_argument("--output", type=Path, default=Path("models/major_agnostic/selected_model"))
    parser.add_argument("--baseline-hf-repo", default="turtlecap/mdbr-leaf-mt-resume-grader")
    parser.add_argument("--baseline-hf-revision")
    args = parser.parse_args(argv)
    manifest = package_release(args.selection, args.output, run_manifest_path=args.run_manifest,
                               baseline_hf_revision=args.baseline_hf_revision, baseline_hf_repo=args.baseline_hf_repo)
    print(json.dumps({"output": str(args.output), "selected_id": manifest["selected_id"],
                      "inference_files": manifest["copied_file_count"],
                      "release_contents_sha256": manifest["release_contents_sha256"],
                      "baseline_hf_revision": manifest["baseline_huggingface"]["revision"]}, indent=2))


if __name__ == "__main__":
    main()
