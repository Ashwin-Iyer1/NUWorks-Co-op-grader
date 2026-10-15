import json
import tempfile
import unittest
from pathlib import Path

from package_model_release import MANIFEST_NAME, package_release
from run_major_agnostic_experiments import model_hashes, sha256


class ModelReleaseTests(unittest.TestCase):
    def fixture(self, root):
        source = root / "checkpoint-10"
        source.mkdir()
        (source / "1_Pooling").mkdir()
        (source / "modules.json").write_text(json.dumps([
            {"idx": 0, "path": "", "type": "sentence_transformers.models.Transformer"},
            {"idx": 1, "path": "1_Pooling", "type": "sentence_transformers.models.Pooling"},
        ]), encoding="utf-8")
        for name in ("config.json", "tokenizer.json", "tokenizer_config.json", "1_Pooling/config.json"):
            (source / name).write_text("{}", encoding="utf-8")
        (source / "model.safetensors").write_bytes(b"fictional inference weights")
        (source / "vocab.txt").write_text("sample", encoding="utf-8")
        for name in ("optimizer.pt", "scheduler.pt", "rng_state.pth", "trainer_state.json", "training_args.bin",
                     "README.md", "private_training.csv", "1_Pooling/README.md"):
            (source / name).write_text("PRIVATE TRAINING EXAMPLE", encoding="utf-8")
        baseline = root / "baseline"
        metadata = baseline / ".cache/huggingface/download/model.safetensors.metadata"
        metadata.parent.mkdir(parents=True)
        metadata.write_text("a" * 40 + "\nartifact-hash\n123\n", encoding="utf-8")
        selection = root / "selection.json"
        selection.write_text(json.dumps({"selected_id": "b_epoch2", "selected_model": str(source),
                                        "selection_split": "val", "selected_model_hashes": model_hashes(source)}), encoding="utf-8")
        (root / "run_manifest.json").write_text(json.dumps({
            "selection_sha256": sha256(selection), "inputs": {
                "inference": {"pooling": "mean"}, "baseline_model": {
                    "path": str(baseline), "files": {".cache/huggingface/download/model.safetensors.metadata": sha256(metadata)}}}}), encoding="utf-8")
        return source, selection, root / "release"

    def test_packages_only_inference_without_mutating_checkpoint_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as directory:
            source, selection, output = self.fixture(Path(directory))
            before = {str(file.relative_to(source)): file.read_bytes() for file in source.rglob("*") if file.is_file()}
            manifest = package_release(selection, output)
            after = {str(file.relative_to(source)): file.read_bytes() for file in source.rglob("*") if file.is_file()}
            self.assertEqual(before, after)
            names = {file.relative_to(output).as_posix() for file in output.rglob("*") if file.is_file()}
            self.assertEqual(names, set(manifest["release_files_sha256"]) | {MANIFEST_NAME})
            self.assertIn("1_Pooling/config.json", names)
            self.assertNotIn("README.md", names)
            self.assertNotIn("optimizer.pt", names)
            self.assertNotIn("training_args.bin", names)
            self.assertNotIn("private_training.csv", names)
            self.assertEqual(manifest["baseline_huggingface"]["revision"], "a" * 40)
            self.assertEqual(package_release(selection, output), manifest)

    def test_changed_source_is_rejected_before_writing_output(self):
        with tempfile.TemporaryDirectory() as directory:
            source, selection, output = self.fixture(Path(directory))
            (source / "model.safetensors").write_bytes(b"changed weights")
            with self.assertRaisesRegex(ValueError, "changed after"):
                package_release(selection, output)
            self.assertFalse(output.exists())

    def test_nonempty_conflicting_output_is_never_overwritten(self):
        with tempfile.TemporaryDirectory() as directory:
            _, selection, output = self.fixture(Path(directory))
            output.mkdir()
            (output / "model.safetensors").write_bytes(b"existing user model")
            with self.assertRaisesRegex(ValueError, "Nonempty"):
                package_release(selection, output)
            self.assertEqual((output / "model.safetensors").read_bytes(), b"existing user model")
            self.assertEqual(len(list(output.iterdir())), 1)

    def test_frozen_selection_and_baseline_revision_are_verified(self):
        with tempfile.TemporaryDirectory() as directory:
            _, selection, output = self.fixture(Path(directory))
            with self.assertRaisesRegex(ValueError, "conflicts"):
                package_release(selection, output, baseline_hf_revision="b" * 40)
            selection.write_text(selection.read_text() + "\n", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "not frozen"):
                package_release(selection, output)
            self.assertFalse(output.exists())

    def test_output_cannot_overlap_original_checkpoint(self):
        with tempfile.TemporaryDirectory() as directory:
            source, selection, _ = self.fixture(Path(directory))
            with self.assertRaisesRegex(ValueError, "overlap"):
                package_release(selection, source / "release")


if __name__ == "__main__":
    unittest.main()
