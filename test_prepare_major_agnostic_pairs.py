import json
import tempfile
import unittest
from pathlib import Path

import pandas as pd

from prepare_major_agnostic_pairs import freeze_pairs, export_splits


class FrozenPairsTests(unittest.TestCase):
    def fixture(self, root):
        resumes, jobs = [], []
        for split in ("train", "val", "test"):
            for major in ("History", "Nursing"):
                for stage in ("first_year", "senior"):
                    resumes.append({"Resume_str": f"{split} {stage} {major} research and public communication",
                                    "Category": major, "major": major, "split": split,
                                    "family_id": f"{split}-{major}", "student_year": stage})
                jobs.append({"job_id": f"{split}-{major}", "title": f"{major} assistant",
                             "job_desc": f"{split} {major} research evidence and public communication",
                             "major": major, "split": split})
        resume_path, job_path = root / "resumes.csv", root / "jobs.json"
        pd.DataFrame(resumes).to_csv(resume_path, index=False)
        job_path.write_text(json.dumps({"models": jobs}), encoding="utf-8")
        return resume_path, job_path

    def test_family_and_jobs_disjoint_and_deterministic(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            resumes, jobs = self.fixture(root)
            for target in ("a", "b"):
                plan = freeze_pairs(resumes, jobs, root / target, 2, 2)
                self.assertEqual(plan["pairs"], 24)
            self.assertEqual((root / "a/pairs.jsonl").read_bytes(), (root / "b/pairs.jsonl").read_bytes())
            pairs = pd.read_json(root / "a/pairs.jsonl", lines=True)
            self.assertEqual(pairs.groupby("job_id").split.nunique().max(), 1)
            self.assertEqual(pairs.groupby("family_id").split.nunique().max(), 1)

    def test_incomplete_labels_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            resumes, jobs = self.fixture(root)
            freeze_pairs(resumes, jobs, root / "plan", 2, 2)
            pairs = pd.read_json(root / "plan/pairs.jsonl", lines=True)
            metadata = pd.read_csv(root / "plan/resume_metadata.csv")
            labels = pairs.merge(metadata[["resume_id", "resume"]], on="resume_id")
            labels["job"] = labels.job_id
            labels["score"] = 0.5
            labels = labels[["resume_id", "job_id", "resume", "job", "score"]]
            labels.iloc[:-1].to_csv(root / "labels.csv", index=False)
            with self.assertRaisesRegex(ValueError, "Incomplete"):
                export_splits(root / "labels.csv", root / "plan", root / "output")
            self.assertFalse((root / "output/diverse_train.csv").exists())

    def completed_labels(self, root):
        resumes, jobs = self.fixture(root)
        freeze_pairs(resumes, jobs, root / "plan", 2, 2)
        pairs = pd.read_json(root / "plan/pairs.jsonl", lines=True)
        resume_metadata = pd.read_csv(root / "plan/resume_metadata.csv")
        job_metadata = pd.read_csv(root / "plan/job_metadata.csv")
        labels = pairs.merge(resume_metadata[["resume_id", "resume"]], on="resume_id")
        labels = labels.merge(job_metadata[["job_id", "job"]], on="job_id")
        labels["score"] = 0.5
        return labels[["resume_id", "job_id", "resume", "job", "score"]]

    def test_complete_export_preserves_metadata_without_leaking_trainer_columns(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            labels = self.completed_labels(root)
            labels["major"] = "incorrect untrusted major"
            labels.to_csv(root / "labels.csv", index=False)
            report = export_splits(root / "labels.csv", root / "plan", root / "output")
            self.assertEqual(report["labeled_pairs"], 24)
            train = pd.read_csv(root / "output/diverse_train.csv")
            self.assertEqual(train.columns.tolist(), ["resume", "job", "score"])
            val = pd.read_csv(root / "output/diverse_val.csv")
            self.assertEqual(set(val["major"]), {"History", "Nursing"})
            self.assertIn("family_id", val)
            self.assertIn("student_year", val)

    def test_changed_text_under_frozen_id_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            labels = self.completed_labels(root)
            labels.loc[0, "job"] = "tampered job under the same ID"
            labels.to_csv(root / "labels.csv", index=False)
            with self.assertRaisesRegex(ValueError, "job text differs"):
                export_splits(root / "labels.csv", root / "plan", root / "output")
            self.assertFalse((root / "output/diverse_train.csv").exists())

    def test_duplicate_source_job_identifiers_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            resumes, jobs = self.fixture(root)
            payload = json.loads(jobs.read_text(encoding="utf-8"))
            payload["models"][1]["job_id"] = payload["models"][0]["job_id"]
            jobs.write_text(json.dumps(payload), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "unique nonempty job_id"):
                freeze_pairs(resumes, jobs, root / "plan", 2, 2)

    def test_family_overlap_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            resumes, jobs = self.fixture(root)
            frame = pd.read_csv(resumes)
            frame["family_id"] = frame.major
            frame.to_csv(resumes, index=False)
            with self.assertRaisesRegex(ValueError, "family crosses"):
                freeze_pairs(resumes, jobs, root / "plan", 2, 2)


if __name__ == "__main__":
    unittest.main()
