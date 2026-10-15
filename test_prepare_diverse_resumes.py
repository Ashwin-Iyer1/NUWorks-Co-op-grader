import csv
import json
import tempfile
import unittest
from collections import Counter, defaultdict
from pathlib import Path

from generate_openai_labels import load_resumes
from prepare_diverse_resumes import DOMAINS, STAGES, build_rows, write_corpus


class DiverseResumeTests(unittest.TestCase):
    def test_balanced_coverage_and_frozen_family_splits(self):
        rows = build_rows()
        self.assertEqual(len(rows), 864)
        self.assertEqual(len(DOMAINS), 24)
        coverage = Counter((row["major"], row["student_year"]) for row in rows)
        self.assertEqual(len(coverage), 24 * 6)
        self.assertEqual(set(coverage.values()), {6})
        families = defaultdict(list)
        for row in rows:
            families[row["family_id"]].append(row)
        self.assertEqual(len(families), 144)
        for family in families.values():
            self.assertEqual({row["student_year"] for row in family}, set(STAGES))
            self.assertEqual(len({row["split"] for row in family}), 1)
            self.assertEqual(len({row["scenario"] for row in family}), 1)
        for major in DOMAINS:
            self.assertEqual(Counter(row["split"] for row in rows if row["major"] == major),
                             {"train": 24, "val": 6, "test": 6})

    def test_loader_identity_and_output_are_reproducible(self):
        with tempfile.TemporaryDirectory() as first, tempfile.TemporaryDirectory() as second:
            first, second = Path(first), Path(second)
            manifest = write_corpus(first)
            self.assertEqual(manifest, write_corpus(second))
            for name in ("resumes.csv", "resumes_train.csv", "resumes_val.csv", "resumes_test.csv", "corpus_manifest.json"):
                self.assertEqual((first / name).read_bytes(), (second / name).read_bytes())
            with (first / "resumes.csv").open(encoding="utf-8", newline="") as handle:
                rows = list(csv.DictReader(handle))
            loaded = load_resumes(first / "resumes.csv")
            self.assertEqual([row.resume_id for row in loaded], [row["resume_id"] for row in rows])
            self.assertEqual(len(loaded), 864)
            self.assertFalse(json.loads((first / "corpus_manifest.json").read_text())["labels_assigned"])

    def test_no_names_contacts_or_score_labels(self):
        for row in build_rows():
            self.assertNotIn("score", row)
            self.assertNotIn("label", row)
            self.assertNotIn("@", row["Resume_str"])
            self.assertNotIn("http", row["Resume_str"])
            self.assertEqual(row["source"], "independently_authored_fictional")
            self.assertGreater(len(row["Resume_str"]), 550)

    def test_major_and_academic_year_do_not_determine_evidence(self):
        rows = build_rows()
        interdisciplinary = [row for row in rows if row["major"] != row["skill_domain"]]
        self.assertEqual(len(interdisciplinary), 264)
        self.assertTrue(all(row["major"] not in {"Nursing", "Education"} for row in interdisciplinary))
        self.assertEqual(Counter(row["evidence_variant"] for row in rows),
                         {"standard": 792, "substantive_prior_project": 36, "coursework_without_placement": 36})
        self.assertTrue(all(row["student_year"] == "first_year" for row in rows if row["evidence_variant"] == "substantive_prior_project"))
        self.assertTrue(all(row["student_year"] == "senior" for row in rows if row["evidence_variant"] == "coursework_without_placement"))


if __name__ == "__main__":
    unittest.main()
