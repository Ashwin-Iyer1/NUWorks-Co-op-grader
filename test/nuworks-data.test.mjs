// Copyright (c) 2026 Ashwin Iyer — Licensed under AGPL-3.0
import test from "node:test";
import assert from "node:assert/strict";
import { safeLink, flattenFields, navigationLinks, recommendationGroups, createNuworksReader } from "../src/nuworks-data.mjs";

test("remote links reject executable URLs and credentials", () => {
  for (const value of ["javascript:alert(1)", "data:text/html,test", "https://user:secret@example.com", null, ""])
    assert.equal(safeLink(value), null);
  assert.equal(safeLink("/students/app/jobs/search"), "https://northeastern-csm.symplicity.com/students/app/jobs/search");
  assert.equal(safeLink("https://example.com/resource"), "https://example.com/resource");
});

test("schemas and navigation tolerate nested arrays and empty children", () => {
  const field = { field_key: "job_length", field_type_options: { picklist_options: [{ id: 1, value: "6 months" }] } };
  assert.deepEqual(flattenFields([[field], { fields: [{ group_fields: [{ field_key: "pay" }] }] }]).map(f => f.field_key), ["job_length", "pay"]);
  assert.deepEqual(navigationLinks({ a: { title: "Jobs", link: "/students/app/jobs", children: [] }, b: [{ title: "Jobs", link: "/students/app/jobs" }, { title: "Unsafe", link: "javascript:alert(1)" }, { title: "External", link: "https://example.com" }] }), [{ title: "Jobs", url: "https://northeastern-csm.symplicity.com/students/app/jobs" }]);
});

test("recommendations deduplicate within categories without losing provenance", () => {
  const job = { job_id: "a", score: 123 };
  const groups = recommendationGroups({ models: { jobs: { skills: { title: "Skills", jobs: [job, job, {}] }, major: { jobs: [job] } } } });
  assert.equal(groups[0].jobs.length, 1);
  assert.equal(groups[1].jobs.length, 1);
  assert.equal(groups[0].jobs[0].matchScore, undefined);
  assert.deepEqual(recommendationGroups({}), []);
});

test("reader gets fresh session credentials for each GET and reports errors", async () => {
  let calls = 0;
  const read = createNuworksReader(async () => ({ authorization: `session-${++calls}`, cookie: "cookie" }), c => ({ authorization: c.authorization }), async (url, options) => {
    assert.equal(url, "https://northeastern-csm.symplicity.com/api/v2/agents?includeDefs=true");
    assert.equal(options.method, "GET");
    assert.equal(options.headers.authorization, `session-${calls}`);
    assert.ok(options.signal);
    return { ok: true, json: async () => ({ models: [] }) };
  });
  await read("/api/v2/agents?includeDefs=true");
  await read("/api/v2/agents?includeDefs=true");
  assert.equal(calls, 2);
  const missing = createNuworksReader(async () => ({}), () => ({}), () => assert.fail("must not fetch"));
  await assert.rejects(missing("/api/v2/agents"), /401/);
  const failure = createNuworksReader(async () => ({ authorization: "test", cookie: "test" }), () => ({}), async () => ({ ok: false, status: 429 }));
  await assert.rejects(failure("/api/v2/agents"), /429/);
  await assert.rejects(read("https://example.com"), /Unsupported/);
});
