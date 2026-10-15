import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

import pandas as pd
import torch
from datasets import Dataset
from torch.utils.data import ConcatDataset
from sentence_transformers import SentenceTransformerTrainer
from sentence_transformers.sampler import ProportionalBatchSampler

from train import ResumeGroupedBatchSampler, load_split


def grouped_dataset():
    return Dataset.from_dict({
        "resume": [f"resume {resume}" for resume in range(5) for _ in range(5)],
        "job": [f"job {job}" for _ in range(5) for job in range(5)],
        "score": [job / 4 for _ in range(5) for job in range(5)],
    })


class TrainingPipelineTests(unittest.TestCase):
    def test_proportional_multi_dataset_sampler_does_not_lose_grouped_rows(self):
        dataset = grouped_dataset()
        # Five resume units of five rows need five batches of <=8, not ceil(25/8).
        samplers = [ResumeGroupedBatchSampler(dataset, batch_size=8, drop_last=False, seed=7)
                    for _ in range(2)]
        self.assertEqual(len(samplers[0]), 5)
        combined = ProportionalBatchSampler(
            ConcatDataset([dataset, dataset]), batch_samplers=samplers,
            generator=torch.Generator().manual_seed(7), seed=7,
        )
        batches = list(combined)
        self.assertEqual(len(batches), len(combined))
        self.assertEqual(sorted(index for batch in batches for index in batch), list(range(50)))
        for batch in batches:
            self.assertEqual(len({dataset[index % 25]["resume"] for index in batch}), 1)

    def test_trainer_uses_custom_sampler_and_generator_seed(self):
        # Exercise ST6's actual dispatch without constructing or training a model.
        trainer = object.__new__(SentenceTransformerTrainer)
        trainer.args = SimpleNamespace(batch_sampler=ResumeGroupedBatchSampler)
        first = trainer.get_batch_sampler(grouped_dataset(), 8, False,
                                           generator=torch.Generator().manual_seed(7))
        second = trainer.get_batch_sampler(grouped_dataset(), 8, False,
                                            generator=torch.Generator().manual_seed(19))
        self.assertIsInstance(first, ResumeGroupedBatchSampler)
        self.assertEqual(first._sampling_seed, 7)
        self.assertNotEqual(list(first), list(second))
        before = list(first)
        first.set_epoch(1)
        self.assertNotEqual(before, list(first))
        self.assertEqual(len(first), len(list(first)))

    def test_drop_last_keeps_last_full_batch(self):
        dataset = grouped_dataset().select(range(5))
        sampler = ResumeGroupedBatchSampler(dataset, batch_size=5, drop_last=True)
        self.assertEqual(len(list(sampler)), 1)
        self.assertEqual(len(sampler), 1)

    def test_training_inputs_exclude_metadata_and_cap_jobs(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "diverse_val.csv"
            pd.DataFrame([{
                "resume": "History student research", "job": "a" * 1500, "score": 0.6,
                "major": "History", "family_id": "history-family-1", "student_year": "first_year",
            }]).to_csv(path, index=False)
            dataset = load_split(directory, "diverse", "val")
            self.assertEqual(dataset.column_names, ["resume", "job", "score"])
            self.assertEqual(len(dataset[0]["job"]), 1200)


if __name__ == "__main__":
    unittest.main()
