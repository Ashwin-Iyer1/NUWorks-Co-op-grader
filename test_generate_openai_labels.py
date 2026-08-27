import unittest
import json
import tempfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from generate_openai_labels import (
    MATCH_SCHEMA,
    JobRecord,
    PairTask,
    ResumeRecord,
    find_job_records,
    grade_pair,
    html_to_text,
    load_job_sources,
    plan_tasks,
    redact_contact_details,
    select_diverse_resumes,
)


class FakeEncoder:
    def encode(self, value):
        return list(range(max(1, len(value) // 4)))


class LabelGeneratorTests(unittest.TestCase):
    def test_html_and_contact_redaction(self):
        text = html_to_text("<p>Email me at test@example.com</p><p>Call 617-555-1212</p>")
        self.assertIn("\n", text)
        redacted = redact_contact_details(text)
        self.assertNotIn("test@example.com", redacted)
        self.assertNotIn("617-555-1212", redacted)

    def test_finds_models_in_payload(self):
        rows = [{"job_id": "1", "job_desc": "Description"}]
        self.assertEqual(find_job_records({"models": rows}), rows)
        self.assertEqual(find_job_records({"data": {"models": rows}}), rows)

    def test_diverse_selection_is_reproducible(self):
        resumes = [
            ResumeRecord(f"r{i}", category, "x" * (100 + i))
            for i, category in enumerate(
                ["ENGINEERING"] * 4 + ["FINANCE"] * 4 + ["HEALTHCARE"] * 4
            )
        ]
        first = select_diverse_resumes(resumes, 3, seed=9)
        second = select_diverse_resumes(resumes, 3, seed=9)
        self.assertEqual(first, second)
        self.assertEqual(
            [item.category for item in first],
            ["ENGINEERING", "FINANCE", "HEALTHCARE"],
        )

    def test_planner_keeps_complete_resume_job_matrices(self):
        resumes = [
            ResumeRecord("r1", "ENGINEERING", "resume one"),
            ResumeRecord("r2", "FINANCE", "resume two"),
        ]
        jobs = [
            JobRecord("j1", "One", "job one"),
            JobRecord("j2", "Two", "job two"),
        ]
        _, first_tasks, _ = plan_tasks(
            resumes[:1],
            jobs,
            FakeEncoder(),
            token_budget=100_000,
            safety_margin=0,
            max_output_tokens=100,
            input_reserve_multiplier=1,
        )
        one_resume_cost = sum(task.reserved_tokens for task in first_tasks)
        selected, tasks, _ = plan_tasks(
            resumes,
            jobs,
            FakeEncoder(),
            token_budget=one_resume_cost + 1,
            safety_margin=0,
            max_output_tokens=100,
            input_reserve_multiplier=1,
        )
        self.assertEqual([item.resume_id for item in selected], ["r1"])
        self.assertEqual(len(tasks), len(jobs))

    def test_plan_can_skip_completed_pairs(self):
        resumes = [ResumeRecord("r1", "ENGINEERING", "resume")]
        jobs = [
            JobRecord("j1", "One", "job one"),
            JobRecord("j2", "Two", "job two"),
        ]
        selected, tasks, _ = plan_tasks(
            resumes,
            jobs,
            FakeEncoder(),
            token_budget=100_000,
            safety_margin=0,
            max_output_tokens=100,
            input_reserve_multiplier=1,
            completed_pair_ids={"r1__j1"},
        )
        self.assertEqual(len(selected), 1)
        self.assertEqual([task.pair_id for task in tasks], ["r1__j2"])

    def test_grade_pair_uses_structured_responses_request(self):
        response = SimpleNamespace(
            id="resp_test",
            status="completed",
            output_text=(
                '{"score":75,"confidence":80,"tier":"strong",'
                '"skills_fit":75,"experience_fit":70,"education_fit":90,'
                '"transferable_fit":75,"missing_requirements":[],'
                '"rationale":"Relevant evidence is present."}'
            ),
            usage=SimpleNamespace(
                input_tokens=100, output_tokens=50, total_tokens=150
            ),
        )
        fake_client = SimpleNamespace(
            responses=SimpleNamespace(create=lambda **kwargs: response)
        )
        task = PairTask("r1__j1", "r1", "j1", "ENGINEERING", 100, 200)
        resume = ResumeRecord("r1", "ENGINEERING", "Python engineer")
        job = JobRecord("j1", "Engineer", "Needs Python")

        with patch("generate_openai_labels.openai_client", return_value=fake_client):
            result = grade_pair(
                task,
                resume,
                job,
                model="gpt-5.6-terra",
                max_output_tokens=800,
                reasoning_effort="low",
            )

        self.assertEqual(result["label"]["score"], 75)
        self.assertEqual(result["usage"]["total_tokens"], 150)
        self.assertFalse(MATCH_SCHEMA["additionalProperties"])

    def test_multiple_job_sources_deduplicate_and_version_changed_ids(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            first = root / "first.json"
            second = root / "second.json"
            first.write_text(
                json.dumps(
                    {
                        "models": [
                            {"job_id": "1", "job_title": "One", "job_desc": "Alpha"},
                            {"job_id": "2", "job_title": "Two", "job_desc": "Beta"},
                        ]
                    }
                ),
                encoding="utf-8",
            )
            second.write_text(
                json.dumps(
                    {
                        "models": [
                            {"job_id": "2", "job_title": "Two", "job_desc": "Beta"},
                            {"job_id": "1", "job_title": "One", "job_desc": "Changed"},
                            {"job_id": "3", "job_title": "Three", "job_desc": "Gamma"},
                        ]
                    }
                ),
                encoding="utf-8",
            )

            jobs = load_job_sources([first, second])

        self.assertEqual(len(jobs), 4)
        self.assertEqual(jobs[0].job_id, "job-1")
        self.assertTrue(jobs[2].job_id.startswith("job-1-"))
        self.assertEqual(len({job.text for job in jobs}), 4)


if __name__ == "__main__":
    unittest.main()
