// Benchmark: mdbr-leaf-ir semantic similarity of a real resume against a real
// NUWorks job batch (exmaplePayload.json), side by side with the lexical
// matcher. Also prints the cosine distribution used to calibrate
// COS_FLOOR / COS_CEIL in src/embeddings.js.
//
// Usage: node benchmark-semantic.mjs
import { readFileSync } from "fs";
import { pipeline } from "@huggingface/transformers";
import JobMatcher from "./src/matcher.js";
import { htmlToText, cosineToScore, chunkText } from "./src/embeddings.js";

const QUERY_PREFIX = "Represent this sentence for searching relevant passages: ";

const resume = readFileSync("resumeText.txt", "utf8");
const payload = JSON.parse(readFileSync("exmaplePayload.json", "utf8"));
const jobs = payload.models.filter((j) => j.job_desc);
console.log(`Jobs with descriptions: ${jobs.length}`);

// ── Load model ──
let t0 = performance.now();
const extractor = await pipeline("feature-extraction", "MongoDB/mdbr-leaf-ir", {
  dtype: "q8",
});
console.log(`Model load: ${(performance.now() - t0).toFixed(0)} ms`);

// ── Embed resume (chunk & average, using the production chunker) ──
t0 = performance.now();
const chunks = chunkText(htmlToText(resume)).map((c) => QUERY_PREFIX + c);
const rRes = await extractor(chunks, { pooling: "mean", normalize: true });
const dim = rRes.dims[rRes.dims.length - 1];
const resumeVec = new Float32Array(dim);
for (let c = 0; c < chunks.length; c++)
  for (let i = 0; i < dim; i++) resumeVec[i] += rRes.data[c * dim + i];
const rNorm = Math.hypot(...resumeVec);
for (let i = 0; i < dim; i++) resumeVec[i] /= rNorm || 1;
console.log(
  `Resume embed (${chunks.length} chunks, ${dim}-dim): ${(performance.now() - t0).toFixed(0)} ms`
);

// ── Embed all job descriptions in batches ──
const BATCH = 8;
const cosines = [];
t0 = performance.now();
for (let i = 0; i < jobs.length; i += BATCH) {
  const batch = jobs.slice(i, i + BATCH);
  // Mirror the production char cap (embeddings-worker.js default).
  const texts = batch.map((j) =>
    htmlToText(`${j.job_title || ""}\n${j.job_desc}`).slice(0, 2000)
  );
  const out = await extractor(texts, { pooling: "mean", normalize: true });
  const d = out.dims[out.dims.length - 1];
  for (let k = 0; k < batch.length; k++) {
    let dot = 0;
    for (let x = 0; x < d; x++) dot += resumeVec[x] * out.data[k * d + x];
    cosines.push(dot);
  }
}
const embedMs = performance.now() - t0;
console.log(
  `Embedded ${jobs.length} JDs: ${embedMs.toFixed(0)} ms total, ${(embedMs / jobs.length).toFixed(1)} ms/job\n`
);

// ── Lexical scores for comparison ──
const matcher = new JobMatcher();
const lexical = jobs.map(
  (j) => matcher.calculateScore(resume, `${j.job_title}\n${j.job_desc}`).score
);

// ── Distribution ──
const sorted = [...cosines].sort((a, b) => a - b);
const q = (p) => sorted[Math.floor(p * (sorted.length - 1))];
console.log("Cosine distribution:");
console.log(
  `  min=${q(0).toFixed(3)}  p10=${q(0.1).toFixed(3)}  p25=${q(0.25).toFixed(3)}  median=${q(0.5).toFixed(3)}  p75=${q(0.75).toFixed(3)}  p90=${q(0.9).toFixed(3)}  max=${q(1).toFixed(3)}\n`
);

// ── Rankings ──
const rows = jobs.map((j, i) => ({
  title: (j.job_title || "?").slice(0, 58),
  company: (j.name || "?").slice(0, 24),
  cos: cosines[i],
  sem: cosineToScore(cosines[i]),
  lex: lexical[i],
}));

// Blended exactly as custom.js does it: 0.65 lexical + 0.35 semantic.
rows.forEach((r) => {
  r.blend = Math.round(r.lex * 0.65 + r.sem * 0.35);
});

const byCos = [...rows].sort((a, b) => b.cos - a.cos);
const fmt = (r) =>
  `  cos=${r.cos.toFixed(3)}  sem=${String(r.sem).padStart(3)}  lex=${String(r.lex).padStart(3)}  blend=${String(r.blend).padStart(3)}  ${r.title} — ${r.company}`;

console.log("TOP 12 by semantic similarity:");
byCos.slice(0, 12).forEach((r) => console.log(fmt(r)));
console.log("\nBOTTOM 6 by semantic similarity:");
byCos.slice(-6).forEach((r) => console.log(fmt(r)));

// Disagreements: where semantic and lexical rank the same job most differently
const n = rows.length;
const cosRank = new Map(byCos.map((r, i) => [r, i]));
const byLex = [...rows].sort((a, b) => b.lex - a.lex);
const lexRank = new Map(byLex.map((r, i) => [r, i]));
const disagree = [...rows].sort(
  (a, b) =>
    Math.abs(lexRank.get(b) - cosRank.get(b)) -
    Math.abs(lexRank.get(a) - cosRank.get(a))
);
console.log("\nBIGGEST DISAGREEMENTS (lexical rank vs semantic rank):");
disagree
  .slice(0, 8)
  .forEach((r) =>
    console.log(
      `  lex#${String(lexRank.get(r) + 1).padStart(3)} vs sem#${String(cosRank.get(r) + 1).padStart(3)}  ${fmt(r).trim()}`
    )
  );

// Rank correlation (Spearman)
let d2 = 0;
rows.forEach((r) => {
  const d = lexRank.get(r) - cosRank.get(r);
  d2 += d * d;
});
const rho = 1 - (6 * d2) / (n * (n * n - 1));
console.log(`\nSpearman rank correlation lexical vs semantic: ${rho.toFixed(3)}`);
