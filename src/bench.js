// Copyright (c) 2026 Ashwin Iyer — Licensed under AGPL-3.0

// In-browser benchmark for the semantic scoring path. Drives the SAME worker
// the Job Explorer uses (embeddings-worker.js via createSemanticScorer), so
// numbers here are exactly what semanticRefine pays per job. Sweeps batch
// size, document length cap, and WASM thread count.
import { createSemanticScorer } from "./embeddings.js";

const $ = (id) => document.getElementById(id);

const LOREM =
  "We are seeking a motivated co-op student to join our engineering team for " +
  "the upcoming term. Responsibilities include developing and maintaining " +
  "software applications, collaborating with cross-functional teams, " +
  "analyzing requirements, writing automated tests, deploying services to " +
  "cloud infrastructure, and participating in design and code reviews. " +
  "Qualifications: currently pursuing a degree in Computer Science, Data " +
  "Science, or a related field; strong communication skills; experience with " +
  "modern programming languages such as Python or JavaScript; familiarity " +
  "with relational databases, REST APIs, version control, and agile " +
  "development practices. Preferred: exposure to machine learning, " +
  "statistics, financial analysis, or distributed systems. ";

// Realistic JD length: the 253-job NUWorks batch median is ~2.5k chars.
function makeDoc(chars, seed) {
  let s = `Posting ${seed}: `;
  while (s.length < chars) s += LOREM;
  return s.slice(0, chars);
}

const RESUME_FALLBACK =
  "Computer science and business student. Skills: Python, C++, JavaScript, " +
  "TypeScript, React, SQL, AWS, TensorFlow, Pandas. Built risk management " +
  "tools, trading systems, backtesting frameworks, and full-stack web apps.";

async function getResume() {
  try {
    const stored = await chrome.storage.local.get(["resume"]);
    return stored.resume || RESUME_FALLBACK;
  } catch {
    return RESUME_FALLBACK;
  }
}

const setStatus = (t) => ($("status").textContent = t);
const out = (html) => ($("out").innerHTML += html);

async function timedPass(scorer, docs, batch, charCap) {
  const t0 = performance.now();
  let inferMs = 0;
  for (let i = 0; i < docs.length; i += batch) {
    const { ms } = await scorer.similarities(docs.slice(i, i + batch), charCap);
    inferMs += ms;
  }
  const wall = performance.now() - t0;
  return { wall, inferMs, perDoc: wall / docs.length };
}

function table(title, header, rows) {
  out(
    `<h3>${title}</h3><table><tr>${header.map((h) => `<th>${h}</th>`).join("")}</tr>` +
      rows
        .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`)
        .join("") +
      `</table>`
  );
}

async function run() {
  $("btn").disabled = true;
  $("out").innerHTML = "";

  const hc = navigator.hardwareConcurrency || 1;
  out(
    `<p class="env">hardwareConcurrency=${hc} · crossOriginIsolated=${crossOriginIsolated}` +
      (crossOriginIsolated
        ? " (multithreaded WASM available)"
        : " (WASM clamped to 1 thread — thread sweep will show no difference)") +
      `<br>${navigator.userAgent}</p>`
  );

  const resume = await getResume();
  const N = 32;
  const docs = Array.from({ length: N }, (_, i) => makeDoc(2600, i));

  try {
    // ── Sweep 1: threads (model reloads per config; weights come from cache) ──
    const threadConfigs = [...new Set([1, Math.min(4, hc), hc])].filter(Boolean);
    const threadRows = [];
    let bestScorer = null;
    let bestPerDoc = Infinity;
    let bestThreads = 1;

    for (const t of threadConfigs) {
      setStatus(`Loading model with ${t} thread(s)…`);
      const scorer = await createSemanticScorer(resume, { numThreads: t });
      if (!scorer) {
        out(`<p>Scorer failed to load with numThreads=${t} — see console.</p>`);
        continue;
      }
      await scorer.similarities(docs.slice(0, 4), 2000); // warmup/compile
      setStatus(`Threads=${t}: scoring ${N} docs…`);
      const r = await timedPass(scorer, docs, 8, 2000);
      threadRows.push([
        `${t}`,
        r.perDoc.toFixed(1),
        Math.round(r.wall),
        Math.round((r.perDoc * 253) / 1000) + " s",
      ]);
      if (r.perDoc < bestPerDoc) {
        if (bestScorer) bestScorer.dispose();
        bestScorer = scorer;
        bestPerDoc = r.perDoc;
        bestThreads = t;
      } else {
        scorer.dispose();
      }
    }
    table(
      "Thread count (batch 8, full 256-token docs)",
      ["threads", "ms/doc", `total ms (${N} docs)`, "projected 253 jobs"],
      threadRows
    );

    // ── Sweep 2: batch size (best thread config) ──
    setStatus(`Batch sweep with ${bestThreads} thread(s)…`);
    const batchRows = [];
    for (const b of [1, 4, 8, 16, 32]) {
      const r = await timedPass(bestScorer, docs, b, 2000);
      batchRows.push([
        `${b}`,
        r.perDoc.toFixed(1),
        Math.round(r.wall),
        Math.round((r.perDoc * 253) / 1000) + " s",
      ]);
    }
    table(
      `Batch size (threads=${bestThreads})`,
      ["batch", "ms/doc", `total ms (${N} docs)`, "projected 253 jobs"],
      batchRows
    );

    // ── Sweep 3: document char cap (attention is O(tokens²)) ──
    setStatus("Char-cap sweep…");
    const capRows = [];
    for (const cap of [600, 1200, 2000]) {
      const r = await timedPass(bestScorer, docs, 8, cap);
      capRows.push([
        `${cap} (~${Math.round(cap / 5)} tokens)`,
        r.perDoc.toFixed(1),
        Math.round(r.wall),
        Math.round((r.perDoc * 253) / 1000) + " s",
      ]);
    }
    table(
      `Document length cap (threads=${bestThreads}, batch 8)`,
      ["char cap", "ms/doc", `total ms (${N} docs)`, "projected 253 jobs"],
      capRows
    );

    bestScorer.dispose();
    setStatus("Done. Re-run with DevTools CPU throttling to simulate a slower PC.");
  } catch (e) {
    setStatus(`Benchmark failed: ${e.message}`);
    console.error(e);
  } finally {
    $("btn").disabled = false;
  }
}

$("btn").addEventListener("click", run);
