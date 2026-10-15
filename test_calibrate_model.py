import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

import numpy as np
import pandas as pd

from calibrate_model import attach_groups, calibrate, cross_validate, fit_curve, load_predictions, resume_weights


def fixture():
    rows = []
    for family in range(5):
        for year in range(2):
            for job, cosine in enumerate([0.2, 0.4, 0.6, 0.8]):
                rows.append({"resume": f"Resume family {family}, year {year}", "job": f"Job {job}",
                             "prediction": cosine, "score": 0.15 + 0.7 * cosine,
                             "family_id": f"family-{family}", "split": "val"})
    return attach_groups(pd.DataFrame(rows))


class CalibrationTests(unittest.TestCase):
    def test_unequal_job_counts_have_equal_total_resume_weight(self):
        frame = pd.DataFrame({"resume": ["A"] * 972 + ["B"] * 16})
        frame = attach_groups(frame)
        weights = resume_weights(frame)
        self.assertAlmostEqual(weights[:972].sum(), 0.5)
        self.assertAlmostEqual(weights[972:].sum(), 0.5)

    def test_cv_holds_out_whole_families_and_exports_monotone_runtime_schema(self):
        output = calibrate(fixture(), model_release="test-release")
        self.assertEqual(output["schema_version"], 1)
        self.assertEqual(output["method"], "quantile_piecewise_linear")
        self.assertEqual(output["metadata"]["cross_validation"]["groups"], 5)
        self.assertEqual(output["metadata"]["resumes"], 10)
        self.assertTrue(np.all(np.diff(output["cosine_knots"]) > 0))
        self.assertTrue(np.all(np.diff(output["score_knots"]) >= 0))
        self.assertLess(output["metadata"]["in_sample"]["weighted_mae_calibrated"], 1e-12)
        self.assertTrue(output["metadata"]["raw_cosine_predictions_unchanged"])
        self.assertEqual(output["metadata"]["selected_fit"], "nonnegative_weighted_affine")

    def test_decreasing_association_becomes_monotone_not_reverse_order(self):
        x, y = np.array([0.2, 0.4, 0.6, 0.8]), np.array([0.9, 0.7, 0.3, 0.1])
        for method in ("weighted_isotonic", "nonnegative_weighted_affine"):
            curve = fit_curve(x, y, np.ones(4), method)
            self.assertTrue(np.all(np.diff(curve.score_knots) >= 0))
            self.assertEqual(len(curve.cosine_knots), 2)
            np.testing.assert_allclose(curve.predict(x), np.full(4, 0.5))

    def test_affine_clipping_breakpoints_are_exported_without_changing_mapping(self):
        curve = fit_curve(np.array([0, 0.2, 0.8, 1]), np.array([0, 0, 1, 1]),
                          np.ones(4), "nonnegative_weighted_affine")
        self.assertEqual(len(curve.cosine_knots), 4)
        self.assertEqual(curve.predict([-2, 2]).tolist(), [0, 1])

    def test_test_inputs_hf_ternary_and_duplicate_sources_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            test = root / "diverse_test_mean_vector.csv"
            fixture().to_csv(test, index=False)
            with self.assertRaisesRegex(ValueError, "Test-named"):
                load_predictions([test], "val")
            val = root / "diverse_val_mean_vector.csv"
            fixture().to_csv(val, index=False)
            with self.assertRaisesRegex(ValueError, "more than once"):
                load_predictions([val, val], "val")
            hf = root / "hf_val_mean_vector.csv"
            fixture().to_csv(hf, index=False)
            with self.assertRaisesRegex(ValueError, "HF ternary"):
                load_predictions([hf], "val")
            changed = fixture()
            changed["split"] = "test"
            changed.to_csv(val, index=False)
            with self.assertRaisesRegex(ValueError, "split metadata"):
                load_predictions([val], "val")

    def test_loader_hashes_inputs_and_does_not_guess_missing_families(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "openai_val_mean_vector.csv"
            fixture().drop(columns=["family_id", "_cv_group", "_resume_key"]).to_csv(path, index=False)
            frame, sources = load_predictions([path], "val")
            self.assertEqual(frame["_cv_group"].nunique(), 10)
            self.assertEqual(len(sources[0]["sha256"]), 64)

    def test_mixed_annotated_and_legacy_validation_exports_calibrate(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            annotated = root / "diverse_val_mean_vector.csv"
            legacy = root / "openai_val_mean_vector.csv"
            fixture().to_csv(annotated, index=False)
            legacy_frame = fixture().drop(columns=["split", "family_id", "_cv_group", "_resume_key"])
            legacy_frame["resume"] = "Legacy " + legacy_frame["resume"]
            legacy_frame.to_csv(legacy, index=False)

            frame, sources = load_predictions([annotated, legacy], "val")
            self.assertEqual(len(frame), 80)
            self.assertTrue(frame["split"].eq("val").all())
            self.assertEqual([source["split_metadata_source"] for source in sources],
                             ["csv", "declared_split_argument"])
            calibration = calibrate(frame, model_release="mixed-validation", sources=sources)
            self.assertEqual(calibration["metadata"]["data_split"], "val")
            self.assertEqual(calibration["metadata"]["pairs"], 80)
            self.assertEqual(calibration["metadata"]["cross_validation"]["groups"], 15)
            # Normalization changes only the loaded frame, never the source CSV.
            self.assertNotIn("split", pd.read_csv(legacy).columns)

    def test_existing_split_column_cannot_inherit_val_for_missing_or_nonval_cells(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "diverse_val_mean_vector.csv"
            for invalid in (None, "", "test", "train"):
                with self.subTest(split=invalid):
                    frame = fixture()
                    frame.loc[0, "split"] = invalid
                    frame.to_csv(path, index=False)
                    with self.assertRaisesRegex(ValueError, "split metadata"):
                        load_predictions([path], "val")

    def test_too_few_independent_groups_rejected(self):
        frame = fixture()
        frame["_cv_group"] = "one-family"
        with self.assertRaisesRegex(ValueError, "three independent"):
            cross_validate(frame)

    @unittest.skipUnless(shutil.which("node"), "Node is required for the extension schema integration check")
    def test_export_passes_actual_extension_validator(self):
        root = Path(__file__).resolve().parent
        payload = calibrate(fixture(), model_release="test-release")
        script = """
          import {execFileSync} from 'node:child_process';
          const source=execFileSync('git',['show','chrome-extension:src/semantic-model-version.mjs'],{encoding:'utf8'});
          const {validateSemanticCalibration}=await import('data:text/javascript,'+encodeURIComponent(source));
          let input=''; for await (const chunk of process.stdin) input+=chunk;
          const result=validateSemanticCalibration(JSON.parse(input));
          console.log(JSON.stringify({knots:result.cosine_knots.length,method:result.method}));
        """
        completed = subprocess.run(["node", "--input-type=module", "-e", script], cwd=root,
                                   input=json.dumps(payload), text=True, capture_output=True, check=True)
        self.assertEqual(json.loads(completed.stdout)["method"], "quantile_piecewise_linear")


if __name__ == "__main__":
    unittest.main()
