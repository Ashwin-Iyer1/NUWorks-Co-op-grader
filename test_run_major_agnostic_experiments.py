import copy
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from run_major_agnostic_experiments import (
    INFERENCE, Runner, choose_candidate, evaluation_command, finalize,
    sha256, train_command, validate_result, write_json,
)


def result(diverse=0.5, hf=0.5, openai=0.7, neuralframe=0.6, model="models/base"):
    return {"model": model, "split": "val", "inference": dict(INFERENCE), "datasets": {
        name: {"mean_vector": {"spearman": value, "mean_resume_spearman": value}}
        for name, value in (("diverse", diverse), ("hf", hf),
                            ("openai", openai), ("neuralframe", neuralframe))
    }}


class ExperimentRunnerTests(unittest.TestCase):
    def test_composite_is_equal_weight_and_regression_floor_rejects_high_diversity(self):
        results = {"baseline": result(), "mean_replay": result(0.51),
                   "a_epoch1": result(0.8, hf=0.479), "b_epoch1": result(0.6, hf=0.51)}
        selection = choose_candidate(results)
        self.assertEqual(selection["selected_id"], "b_epoch1")
        rows = {row["id"]: row for row in selection["candidates"]}
        self.assertEqual(rows["a_epoch1"]["failed_regression_floors"], ["hf"])
        self.assertAlmostEqual(rows["b_epoch1"]["composite"], (0.6 + 0.51 + 0.7) / 3)

    def test_baseline_and_mean_replay_can_win_without_forcing_new_training(self):
        self.assertEqual(choose_candidate({"baseline": result(), "mean_replay": result(0.4)})["selected_id"], "baseline")
        self.assertEqual(choose_candidate({"baseline": result(), "mean_replay": result(0.6)})["selected_id"], "mean_replay")

    def test_test_results_cannot_enter_selection(self):
        candidate = result()
        candidate["split"] = "test"
        with self.assertRaisesRegex(ValueError, "validation results only"):
            choose_candidate({"baseline": result(), "mean_replay": candidate})

    def test_nonfinite_or_missing_metrics_are_rejected(self):
        for value in (None, float("nan"), float("inf")):
            candidate = result(value)
            with self.assertRaisesRegex(ValueError, "Non-finite"):
                choose_candidate({"baseline": result(), "mean_replay": candidate})

    def test_supplied_evaluation_requires_same_runtime_and_model(self):
        valid = result()
        validate_result(valid, "models/base", "val")
        invalid = copy.deepcopy(valid)
        invalid["inference"]["pooling"] = "model"
        with self.assertRaisesRegex(ValueError, "runtime mean"):
            validate_result(invalid, "models/base", "val")
        with self.assertRaisesRegex(ValueError, "different model"):
            validate_result(valid, "models/other", "val")

    def test_training_commands_keep_empty_matryoshka_and_do_not_evaluate_test(self):
        args = SimpleNamespace(python=Path("python"), data_dir=Path("data"),
                               base_model=Path("models/base"), run_dir=Path("runs"),
                               seed=7, eval_batch_size=128)
        command = train_command(args, "a")
        self.assertEqual(command[command.index("--matryoshka-dims") + 1], "")
        self.assertEqual(command[command.index("--dataset-weights") + 1], "diverse=3,openai=1,hf=2,neuralframe=1")
        evaluation = evaluation_command(args, "models/base", "val", "report.json")
        self.assertNotIn("test", evaluation)
        self.assertEqual(evaluation[evaluation.index("--query-prompt") + 1], "")

    def test_completed_step_reuse_checks_artifact_hashes(self):
        with tempfile.TemporaryDirectory() as directory:
            args = SimpleNamespace(run_dir=Path(directory))
            runner = Runner(args, {"seed": 7})
            artifact = Path(directory) / "artifact.json"
            artifact.write_text("original", encoding="utf-8")
            command = ["not-executed"]
            runner.manifest["steps"]["step"] = {"status": "completed", "command": command,
                                                     "artifact_hashes": {str(artifact): sha256(artifact)}}
            with patch("run_major_agnostic_experiments.subprocess.run") as run:
                runner.run("step", command, [artifact])
                run.assert_not_called()
                artifact.write_text("changed", encoding="utf-8")
                with self.assertRaisesRegex(ValueError, "artifacts changed"):
                    runner.run("step", command, [artifact])

    def test_finalization_rejects_nonselected_id_before_reading_test(self):
        with tempfile.TemporaryDirectory() as directory:
            args = SimpleNamespace(run_dir=Path(directory), finalize="b_epoch1")
            path = args.run_dir / "selection.json"
            write_json(path, {"selected_id": "a_epoch1"})
            runner = SimpleNamespace(manifest={"selection_sha256": sha256(path)})
            with self.assertRaisesRegex(ValueError, "Only frozen selection"):
                finalize(args, runner)


if __name__ == "__main__":
    unittest.main()
