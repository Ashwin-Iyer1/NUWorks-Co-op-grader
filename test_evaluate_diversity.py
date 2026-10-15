import tempfile
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

from evaluate_diversity import (
    attach_metadata, compare_frames, evaluate, leakage_audit, mean_ci,
    read_frame, resume_metrics, text_key, tie_aware_ndcg,
)


def sample_frame():
    rows = []
    for resume in range(6):
        for job, label in enumerate([0.0, 0.5, 1.0]):
            rows.append({"resume": f"resume {resume}", "job": f"job {job}",
                         "score": label, "prediction": label,
                         "major": "History" if resume < 3 else "Biology"})
    frame = pd.DataFrame(rows)
    frame["_resume_key"] = frame.resume.map(text_key)
    frame["_job_key"] = frame.job.map(text_key)
    return attach_metadata(frame, [], ["major", "student_year"])


class DiversityEvaluationTests(unittest.TestCase):
    def test_perfect_candidate_beats_reverse_baseline_with_paired_resume_intervals(self):
        candidate = sample_frame()
        baseline = candidate.copy()
        baseline["prediction"] = 1 - baseline["score"]
        baseline = baseline.sample(frac=1, random_state=7).reset_index(drop=True)
        result = evaluate(candidate, baseline=baseline, slices=["major", "student_year"], draws=100)
        self.assertEqual(result["rankable_resumes"], 6)
        self.assertEqual(result["paired_improvement"]["spearman"]["mean"], 2.0)
        self.assertEqual(result["paired_improvement"]["spearman"]["ci95"], [2.0, 2.0])
        self.assertEqual(result["coverage"]["student_year"][0]["value"], "unknown")
        self.assertTrue(result["slices"]["major"][0]["insufficient_sample"])

    def test_constant_predictions_count_as_no_ranking_signal(self):
        metrics = resume_metrics(np.array([0.0, 0.5, 1.0]), np.ones(3), 0.1)
        self.assertEqual(metrics["spearman"], 0)
        self.assertEqual(metrics["pairwise_accuracy"], 0.5)
        self.assertAlmostEqual(metrics["top1_best_rate"], 1 / 3)

    def test_ndcg_ties_do_not_depend_on_csv_row_order(self):
        labels = np.array([0.0, 0.4, 0.7, 1.0])
        predictions = np.ones(4)
        value = tie_aware_ndcg(labels, predictions, k=2)
        self.assertAlmostEqual(value, tie_aware_ndcg(labels[::-1], predictions, k=2))
        self.assertLess(value, 1)
        self.assertAlmostEqual(tie_aware_ndcg(labels, labels), 1)

    def test_baseline_pair_or_label_mismatch_is_rejected(self):
        frame = sample_frame()
        with self.assertRaisesRegex(ValueError, "exactly the same"):
            compare_frames(frame, frame.iloc[:-1])
        baseline = frame.copy()
        baseline.loc[0, "score"] = 0.1
        with self.assertRaisesRegex(ValueError, "labels disagree"):
            compare_frames(frame, baseline)

    def test_duplicate_text_id_variants_and_nonfinite_scores_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "pairs.csv"
            rows = [{"resume": "A Resume", "job": "A job", "score": 0.5},
                    {"resume": " a   RESUME ", "job": "a job", "score": 0.5}]
            pd.DataFrame(rows).to_csv(path, index=False)
            with self.assertRaisesRegex(ValueError, "duplicate normalized"):
                read_frame(path)
            rows.pop()
            rows[0]["prediction"] = float("inf")
            pd.DataFrame(rows).to_csv(path, index=False)
            with self.assertRaisesRegex(ValueError, "non-finite"):
                read_frame(path)

    def test_leakage_uses_text_not_identifiers(self):
        frame = sample_frame()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "train.csv"
            pd.DataFrame([{"resume": " RESUME   0 ", "job": " Job 0 "}]).to_csv(path, index=False)
            result = leakage_audit(frame, [path])[0]
            self.assertEqual(result["overlapping_resumes"], 1)
            self.assertEqual(result["overlapping_jobs"], 1)
            self.assertEqual(result["overlapping_pairs"], 1)

    def test_conflicting_major_metadata_is_rejected(self):
        frame = sample_frame()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "metadata.csv"
            pd.DataFrame([{"resume": "resume 0", "major": "Physics"}]).to_csv(path, index=False)
            with self.assertRaisesRegex(ValueError, "Conflicting major"):
                attach_metadata(frame, [path], ["major"])

    def test_no_uncertainty_claim_for_single_resume(self):
        self.assertIsNone(mean_ci(np.array([0.9]), draws=100, seed=1)["ci95"])
        self.assertEqual(mean_ci(np.array([]), draws=100, seed=1)["resumes"], 0)

    def test_correlated_profile_stages_resample_whole_families(self):
        values = np.array([0.0] * 6 + [1.0] * 6)
        clusters = ["family-a"] * 6 + ["family-b"] * 6
        result = mean_ci(values, clusters=clusters, draws=1000, seed=1)
        self.assertEqual(result["bootstrap_clusters"], 2)
        self.assertEqual(result["ci95"], [0.0, 1.0])
        one_family = mean_ci(values, clusters=["same-family"] * 12, draws=100, seed=1)
        self.assertIsNone(one_family["ci95"])

    def test_family_metadata_is_auto_detected_for_paired_bootstrap(self):
        candidate = sample_frame()
        candidate["profile_family_id"] = candidate["resume"].map(
            lambda text: "family-a" if int(text.split()[-1]) < 3 else "family-b")
        baseline = candidate.copy()
        baseline["prediction"] = 1 - baseline["score"]
        result = evaluate(candidate, baseline=baseline, slices=["major"], draws=100)
        self.assertEqual(result["method"]["bootstrap_unit"], "profile_family_id")
        self.assertEqual(result["paired_improvement"]["spearman"]["bootstrap_clusters"], 2)

    def test_labels_only_audit_does_not_invent_prediction_metrics(self):
        frame = sample_frame().drop(columns="prediction")
        result = evaluate(frame, slices=["major", "student_year"], draws=100)
        self.assertNotIn("macro_resume_metrics", result)
        self.assertEqual(result["resumes"], 6)


if __name__ == "__main__":
    unittest.main()
