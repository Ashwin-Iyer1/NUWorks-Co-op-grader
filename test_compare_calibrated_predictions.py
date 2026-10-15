import json
from pathlib import Path
import subprocess
import unittest

import numpy as np
import pandas as pd

from compare_calibrated_predictions import calibrated_scores, compare, replace_labels
from evaluate_diversity import text_key


CALIBRATION = {
    "schema_version": 1, "method": "quantile_piecewise_linear",
    "model_release": "test", "cosine_knots": [0, 1], "score_knots": [0, 1],
}


def frame(rows):
    result = pd.DataFrame(rows, columns=["resume", "job", "score", "prediction"])
    result[["score", "prediction"]] = result[["score", "prediction"]].astype(float)
    result["_resume_key"] = result.resume.map(text_key)
    result["_job_key"] = result.job.map(text_key)
    return result


class CompareCalibratedPredictionsTests(unittest.TestCase):
    def test_rounding_and_clamping_match_pinned_extension_function(self):
        values = [-1, 0, 0.125, 0.375, 0.625, 0.875, 1, 2]
        script = """
          const {execFileSync}=require('node:child_process');
          const vm=require('node:vm');
          const source=execFileSync('git',['show',
            'bc657de2fcfd38949939e112ac6b3c75c2a7d499:src/embeddings.js'],{encoding:'utf8'});
          const start=source.indexOf('export function cosineToScore(');
          const code=source.slice(start,source.indexOf('\\n}',start)+2).replace('export ','');
          const context={};vm.createContext(context);vm.runInContext(code,context);
          const input=JSON.parse(process.argv[1]);
          process.stdout.write(JSON.stringify(input.values.map(x=>context.cosineToScore(x,input.calibration))));
        """
        expected = json.loads(subprocess.check_output(
            ["node", "-e", script, json.dumps({"values": values, "calibration": CALIBRATION})],
            cwd=Path(__file__).resolve().parent, text=True,
        ))
        _, actual = calibrated_scores(np.array(values), CALIBRATION)
        np.testing.assert_equal(actual, expected)
        self.assertEqual(actual[2], 13)

    def test_resume_weighting_and_paired_improvement(self):
        baseline = frame([
            ("A", f"job{i}", i % 2, 1 - i % 2) for i in range(8)
        ] + [("B", f"job{i}", i, i) for i in range(2)])
        candidate = baseline.copy()
        candidate["prediction"] = candidate.score
        result = compare(baseline, candidate, CALIBRATION, CALIBRATION, draws=1000)
        self.assertEqual(result["baseline"]["equal_resume_grading"]["display_mae_points"]["mean"], 50)
        self.assertEqual(result["candidate"]["equal_resume_grading"]["display_mae_points"]["mean"], 0)
        paired = result["paired_improvement"]["grading_error_reduction_baseline_minus_candidate"]["display_mae_points"]
        self.assertEqual(paired["mean"], 50)
        self.assertEqual(paired["bootstrap_clusters"], 2)
        self.assertAlmostEqual(result["baseline"]["macro_raw_ranking"]["spearman"]["mean"], 0)

    def test_new_labels_match_pairs_independent_of_row_order(self):
        baseline = frame([("A", "J1", 0, 0), ("A", "J2", 1, 1)])
        labels = frame([("a", "j2", 0, 0), ("a", "j1", 1, 0)])
        replaced = replace_labels(baseline, labels)
        self.assertEqual(dict(zip(replaced.job, replaced.score)), {"J1": 1, "J2": 0})
        result = compare(baseline, baseline, CALIBRATION, CALIBRATION, labels=labels, draws=10)
        self.assertEqual(result["baseline"]["equal_resume_grading"]["display_mae_points"]["mean"], 100)
        self.assertEqual(baseline.score.tolist(), [0, 1])

    def test_missing_or_duplicated_replacement_pairs_rejected(self):
        original = frame([("A", "J1", 0, 0), ("A", "J2", 1, 1)])
        with self.assertRaisesRegex(ValueError, "exactly"):
            replace_labels(original, original.iloc[:1])
        with self.assertRaises(pd.errors.MergeError):
            replace_labels(original, pd.concat([original, original.iloc[:1]]))

    def test_different_original_labels_rejected_before_regrading(self):
        original = frame([("A", "J1", 0, 0), ("A", "J2", 1, 1)])
        changed = original.copy()
        changed.loc[0, "score"] = 0.5
        with self.assertRaisesRegex(ValueError, "labels disagree"):
            compare(original, changed, CALIBRATION, CALIBRATION, labels=original, draws=10)

    def test_invalid_curve_rejected(self):
        with self.assertRaisesRegex(ValueError, "Invalid"):
            calibrated_scores(np.array([0.5]), {**CALIBRATION, "score_knots": [1, 0]})


if __name__ == "__main__":
    unittest.main()
