import unittest

from generate_openai_labels import JobRecord, ResumeRecord
from prepare_unseen_bias_holdout import job_description, select_jobs, select_resumes


class PrepareUnseenBiasHoldoutTests(unittest.TestCase):
    def test_resume_selection_is_disjoint_stratified_and_reproducible(self):
        resumes = [
            ResumeRecord(f"r-{category}-{index}", category, f"text {category} {index}")
            for category in ("ENGINEERING", "FINANCE", "HEALTHCARE")
            for index in range(3)
        ]
        excluded = {"r-ENGINEERING-0", "r-FINANCE-0", "r-HEALTHCARE-0"}
        first = select_resumes(resumes, excluded, 3, seed=17)
        second = select_resumes(resumes, excluded, 3, seed=17)
        self.assertEqual(first, second)
        self.assertEqual(len({item.category for item in first}), 3)
        self.assertTrue(all(item.resume_id not in excluded for item in first))

    def test_job_selection_is_reproducible_and_preserves_description(self):
        jobs = [
            JobRecord(
                f"job-{index}",
                f"Title {index}",
                f"Position: Title {index}\n\nDescription:\nDescription {index}",
            )
            for index in range(10)
        ]
        first = select_jobs(jobs, 4, seed=23)
        second = select_jobs(jobs, 4, seed=23)
        self.assertEqual(first, second)
        self.assertEqual(job_description(first[0]), f"Description {first[0].job_id[4:]}")


if __name__ == "__main__":
    unittest.main()
