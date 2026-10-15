import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { jobs, profiles } from "../demo/data.mjs";
import { matcher, rankJobs, filterJobs, toggleComparison, shortlistCsv } from "../demo/model.mjs";

test("vendored matcher exactly matches the documented upstream artifact", () => {
  const provenance = JSON.parse(readFileSync(new URL("../demo/vendor/PROVENANCE.json", import.meta.url)));
  assert.equal(createHash("sha256").update(readFileSync(new URL("../demo/vendor/matcher.mjs", import.meta.url))).digest("hex"), provenance.sha256);
});
test("all sample scores use the real matcher and maintain descending stable order", () => {
  for (const profile of profiles) {
    const ranked = rankJobs(jobs, profile.text);
    assert.equal(ranked.length, jobs.length);
    for (let i = 0; i < ranked.length; i++) {
      const job = ranked[i];
      assert.equal(job.result.score, matcher.calculateScore(profile.text, job.description).score);
      assert.ok(job.result.score >= 0 && job.result.score <= 100);
      assert.ok(i === 0 || ranked[i - 1].result.score >= job.result.score);
      assert.equal(new Set([...job.direct, ...job.inferred.map(({skill}) => skill), ...job.missing]).size, job.result.details.hardSkillsFound);
    }
  }
});
test("profile changes materially change the leading opportunity", () => {
  const tops = profiles.map((profile) => rankJobs(jobs, profile.text)[0]);
  assert.equal(new Set(tops.map((job) => job.id)).size, 3);
  assert.equal(tops[1].track, "Data & finance");
  assert.equal(tops[2].track, "Product & design");
  // The lexical matcher may favor a cross-discipline role. Do not rig scores
  // or fixtures to force the profile label to match the top role's category.
  const platformScore = (profile) => rankJobs(jobs, profile.text).find((job) => job.id === "northstar-platform").result.score;
  assert.ok(platformScore(profiles[0]) > platformScore(profiles[2]));
});
test("adding a required skill moves it from a gap into direct evidence", () => {
  const job = jobs.find((job) => job.id === "fieldnote-ml");
  const before = rankJobs([job], profiles[0].text)[0];
  const after = rankJobs([job], `${profiles[0].text}\nBuilt and evaluated PyTorch models.`)[0];
  assert.ok(before.result.details.missingRequired.includes("pytorch"));
  assert.ok(after.direct.includes("pytorch"));
  assert.ok(!after.result.details.missingRequired.includes("pytorch"));
  assert.ok(after.result.score >= before.result.score);
});
test("search, work style, minimum and saved filters compose without mutating rankings", () => {
  const ranked = rankJobs(jobs, profiles[0].text);
  const ids = ranked.map((job) => job.id);
  const saved = ["harbor-data", "cedar-web"];
  const results = filterJobs(ranked, { query: "PYTHON sql", track: "Engineering", workstyle: "Remote", minimum: 20, savedOnly: true, saved });
  assert.deepEqual(results.map((job) => job.id), ["harbor-data"]);
  assert.deepEqual(filterJobs(ranked, { query: "no-such-role" }), []);
  assert.deepEqual(filterJobs(ranked, { savedOnly: true }), []);
  assert.deepEqual(ranked.map((job) => job.id), ids);
  const pay = filterJobs(ranked, { sort: "pay" });
  assert.equal(pay[0].hourly, Math.max(...jobs.map((job) => job.hourly)));
});
test("comparison retains at most three unique roles and supports deselection", () => {
  let selected = [];
  for (const id of ["a", "b", "c", "d"]) selected = toggleComparison(selected, id);
  assert.deepEqual(selected, ["a", "b", "c"]);
  assert.deepEqual(toggleComparison(selected, "b"), ["a", "c"]);
});
test("CSV contains only shortlisted fictional jobs, current evidence and safe cells", () => {
  const ranked = rankJobs(jobs, profiles[0].text);
  const csv = shortlistCsv(ranked, ["harbor-data"]);
  assert.equal(csv.trim().split("\r\n").length, 2);
  assert.ok(csv.includes('"Fictional demo - not a real opening"'));
  assert.ok(csv.includes('"Harbor Systems"'));
  assert.ok(!csv.includes("Northstar Studio"));
  assert.ok(!csv.includes(profiles[0].text));
  const unsafe = { ...ranked[0], company: '=HYPERLINK("bad")' };
  assert.ok(shortlistCsv([unsafe], [unsafe.id]).includes('"\'=HYPERLINK(""bad"")"'));
});
test("empty input never produces a fabricated positive score", () => {
  assert.ok(rankJobs(jobs, "").every((job) => job.result.score === 0));
});
