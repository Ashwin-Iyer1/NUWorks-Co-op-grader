import tempfile
import unittest
from collections import Counter
from pathlib import Path

from build_diverse_jobs import ROLES, build_jobs, write_jobs
from generate_openai_labels import load_job_sources


class DiverseJobTests(unittest.TestCase):
    def test_independent_balanced_scenarios(self):
        jobs = build_jobs()
        self.assertEqual(len(jobs), 144)
        self.assertEqual(len({job["job_id"] for job in jobs}), 144)
        self.assertEqual(len({job["family_id"] for job in jobs}), 144)
        self.assertEqual(len({job["job_desc"] for job in jobs}), 144)
        for major in ROLES:
            selected = [job for job in jobs if job["major"] == major]
            self.assertEqual(Counter(job["split"] for job in selected), {"train": 4, "val": 1, "test": 1})
            self.assertEqual(Counter(job["seniority"] for job in selected), {"internship": 3, "entry_level": 3})

    def test_job_loader_and_reproducibility(self):
        with tempfile.TemporaryDirectory() as first, tempfile.TemporaryDirectory() as second:
            first, second = Path(first), Path(second)
            self.assertEqual(write_jobs(first), write_jobs(second))
            self.assertEqual((first / "jobs.json").read_bytes(), (second / "jobs.json").read_bytes())
            loaded = load_job_sources([first / "jobs.json"])
            self.assertEqual(len(loaded), 144)
            self.assertEqual({job.job_id for job in loaded}, {"job-" + job["job_id"] for job in build_jobs()})

    def test_credential_gates_are_explicit(self):
        for job in build_jobs():
            if job["major"] == "Nursing" and job["seniority"] == "entry_level":
                self.assertIn("current Registered Nurse license", job["job_desc"])
            self.assertIn("Required qualifications:", job["job_desc"])
            self.assertIn("Preferred:", job["job_desc"])
            self.assertNotIn("score", job)


if __name__ == "__main__":
    unittest.main()
