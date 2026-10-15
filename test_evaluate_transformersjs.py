import unittest

import pandas as pd

from evaluate_transformersjs import apply_scores, prepare_input, runtime_job_text


class TransformersJSWrapperTests(unittest.TestCase):
    def test_label_envelope_restores_actual_worker_caller_string(self):
        text = "Position: Research Intern\n\nDescription:\n<p>Collect evidence.</p>"
        self.assertEqual(runtime_job_text(text), "Research Intern\n<p>Collect evidence.</p>")
        self.assertEqual(runtime_job_text(text, False), text)
        self.assertEqual(runtime_job_text("Ordinary full job text"), "Ordinary full job text")

    def test_inputs_preserve_row_order_and_shared_identity(self):
        frame = pd.DataFrame({"resume": ["A", "B", "A"], "job": ["2", "1", "1"], "score": [0.2, 0.3, 0.7]})
        prepared = prepare_input({"val": frame})
        self.assertEqual(len(prepared["resumes"]), 2)
        self.assertEqual(len(prepared["jobs"]), 2)
        self.assertEqual([row["id"] for row in prepared["pairs"]], ["val:0", "val:1", "val:2"])
        self.assertEqual(prepared["pairs"][0]["resume_id"], prepared["pairs"][2]["resume_id"])

    def test_scores_align_by_id_and_reject_missing_duplicate_or_extra(self):
        frames = {"val": pd.DataFrame({"resume": ["A", "A"], "job": ["1", "2"], "score": [0.2, 0.7]})}
        records = [{"id": "val:1", "prediction": 0.8}, {"id": "val:0", "prediction": 0.3}]
        self.assertEqual(apply_scores(frames, {"scores": records})["val"].prediction.tolist(), [0.3, 0.8])
        for invalid in (records[:-1], records + records[:1], records + [{"id": "other", "prediction": 0.4}]):
            with self.assertRaisesRegex(ValueError, "exactly match"):
                apply_scores(frames, {"scores": invalid})


if __name__ == "__main__":
    unittest.main()
