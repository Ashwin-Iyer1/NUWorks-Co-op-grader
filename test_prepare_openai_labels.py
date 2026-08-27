import tempfile
import unittest
from pathlib import Path

import pandas as pd

from prepare_openai_labels import prepare, split_by_resume


def sample_frame(groups=11, jobs=4):
    rows = []
    for resume_index in range(groups):
        for job_index in range(jobs):
            rows.append(
                {
                    "resume": f"resume text {resume_index}",
                    "job": f"job text {job_index}",
                    "score": (resume_index + job_index) / (groups + jobs),
                    "resume_id": f"resume-{resume_index}",
                    "job_id": f"job-{job_index}",
                    "category": f"category-{resume_index}",
                }
            )
    return pd.DataFrame(rows)


class PrepareOpenAILabelTests(unittest.TestCase):
    def test_grouped_split_is_disjoint_complete_and_reproducible(self):
        frame = sample_frame()
        first, membership = split_by_resume(frame, seed=7)
        second, second_membership = split_by_resume(frame, seed=7)

        self.assertEqual(membership, second_membership)
        self.assertEqual({key: len(value) for key, value in membership.items()}, {
            "train": 7,
            "val": 2,
            "test": 2,
        })
        all_ids = [set(ids) for ids in membership.values()]
        self.assertFalse(all_ids[0] & all_ids[1])
        self.assertFalse(all_ids[0] & all_ids[2])
        self.assertFalse(all_ids[1] & all_ids[2])
        self.assertEqual(sum(len(part) for part in first.values()), len(frame))
        self.assertEqual(
            first["test"]["resume_id"].tolist(),
            second["test"]["resume_id"].tolist(),
        )

    def test_prepare_writes_only_trainer_columns_and_manifest(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "labels.csv"
            sample_frame().to_csv(source, index=False)
            manifest = prepare(source, root / "data", seed=9)

            train = pd.read_csv(root / "data" / "openai_train.csv")
            self.assertEqual(train.columns.tolist(), ["resume", "job", "score"])
            self.assertEqual(manifest["splits"]["test"]["resume_groups"], 2)
            self.assertTrue((root / "data" / "openai_split_manifest.json").exists())

    def test_duplicate_pairs_are_rejected(self):
        frame = sample_frame()
        duplicate = pd.concat([frame, frame.iloc[[0]]], ignore_index=True)
        with self.assertRaisesRegex(ValueError, "duplicate"):
            split_by_resume(duplicate)


if __name__ == "__main__":
    unittest.main()
