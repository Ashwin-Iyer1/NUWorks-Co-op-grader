import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from evaluate_major_counterfactual import build_suite, compare_variants, display_grade, main, read_calibration


class MajorCounterfactualTests(unittest.TestCase):
    def test_variants_hold_skill_evidence_and_job_fixed(self):
        rows = build_suite()
        self.assertEqual(len(rows), 24)
        self.assertEqual(len({row["case_id"] for row in rows}), 4)
        for case in {row["case_id"] for row in rows}:
            family = [row for row in rows if row["case_id"] == case]
            self.assertEqual(len({row["job"] for row in family}), 1)
            self.assertEqual(len({row["evidence_sha256"] for row in family}), 1)
            self.assertEqual(len({row["resume"].split("\n\n", 1)[1] for row in family}), 1)
            self.assertEqual(len({row["resume"] for row in family}), 6)
            self.assertTrue(all(len(row["resume"]) < 1100 and len(row["job"]) < 1200 for row in family))
            self.assertEqual({row["changed_attributes"] for row in family}, {"none", "major", "year", "major_and_year"})

    def test_deltas_compare_to_same_case_baseline_without_accuracy_claims(self):
        rows = build_suite()
        values = [.5 if row["variant"] == "baseline" else .45 for row in rows]
        result = compare_variants(rows, values)
        self.assertEqual(len(result["comparisons"]), 20)
        self.assertEqual(result["summary"]["major"]["comparisons"], 8)
        self.assertEqual(result["summary"]["year"]["comparisons"], 8)
        self.assertEqual(result["summary"]["major_and_year"]["comparisons"], 4)
        self.assertAlmostEqual(result["summary"]["all"]["mean_absolute_cosine_change"], .05)
        self.assertNotIn("baseline_display_grade", result["comparisons"][0])
        self.assertAlmostEqual(result["comparisons"][0]["cosine_change"], -.05)

    def test_piecewise_and_affine_grade_maps_match_extension_rounding(self):
        calibration = {"method": "quantile_piecewise_linear", "cosine_knots": [.2, .6, .8],
                       "score_knots": [0, .5, 1]}
        self.assertEqual(display_grade(-1, calibration), 0)
        self.assertEqual(display_grade(1, calibration), 100)
        self.assertEqual(display_grade(.7, calibration), 75)
        self.assertEqual(display_grade(.125, {"method": "affine", "slope": 1, "intercept": 0}), 13)
        report = compare_variants(build_suite(), [.5] * 24, calibration)
        self.assertEqual(report["summary"]["all"]["maximum_absolute_display_grade_change"], 0)

    def test_bad_calibration_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "calibration.json"
            for xs, ys in (([.5, .4], [.1, .2]), ([.4, .5], [.2, .1]), ([.4, .5], [0, 2])):
                path.write_text(json.dumps({"schema_version": 1, "method": "quantile_piecewise_linear",
                                            "cosine_knots": xs, "score_knots": ys}), encoding="utf-8")
                with self.assertRaises(ValueError):
                    read_calibration(path)

    def test_suite_only_never_loads_a_model(self):
        with tempfile.TemporaryDirectory() as directory, \
                patch("evaluate_major_counterfactual.evaluate_local_model") as evaluate, \
                contextlib.redirect_stdout(io.StringIO()):
            main(["--write-suite-only", "--out-dir", directory])
            evaluate.assert_not_called()
            report = json.loads((Path(directory) / "report.json").read_text())
            self.assertEqual(report["models"], {})
            self.assertIn("not_accuracy", report["kind"])

    def test_candidate_requires_frozen_selection(self):
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            main(["--baseline", "baseline", "--candidate", "candidate"])


if __name__ == "__main__":
    unittest.main()
