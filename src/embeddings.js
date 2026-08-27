// Copyright (c) 2026 Ashwin Iyer — Licensed under AGPL-3.0

// Semantic similarity scoring via a small on-device embedding model.
//
// Model: turtlecap/mdbr-leaf-mt-resume-grader — a resume/job-specific,
// 33.36M-param, 384-dim BGE model (mean pooling, 256-token context). Its int8
// ONNX weights (~34MB) stream from the Hugging
// Face CDN on first use and are cached by the browser. The separate ONNX
// runtime loader ships with the extension; its .wasm data is cached at runtime.
//
// This module is the PAGE side: pure text helpers plus a thin client for the
// dedicated worker (embeddings-worker.js) that owns the model. Inference must
// stay off the main thread — when it ran on the page, each batch blocked the
// event loop for hundreds of milliseconds and in-flight fetches appeared hung.

// Validation-fitted display calibration for the BGE fine-tune. This changes
// only the user-facing 0–100 value; cosine similarity still determines rank.
const SCORE_SLOPE = 1.9226748511;
const SCORE_INTERCEPT = -0.9568563562;

/**
 * HTML job description -> the plain text the tokenizer should see. Unlike
 * matcher.normalize this keeps case and punctuation — the model was trained
 * on natural text, not on a lowercased keyword soup.
 */
export function htmlToText(html) {
  if (!html) return "";
  return String(html)
    .replace(/<\/?(?:li|br|p|div|tr|h[1-6]|ul|ol)[^>]*>/gi, "\n")
    .replace(/<[^>]*>?/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&(?:quot|ldquo|rdquo)/gi, '"')
    .replace(/&(?:apos|rsquo|lsquo)/gi, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

/** Map a raw cosine onto the extension's 0-100 scale. */
export function cosineToScore(cos) {
  const t = SCORE_SLOPE * cos + SCORE_INTERCEPT;
  return Math.round(Math.max(0, Math.min(1, t)) * 100);
}

/**
 * Split long text into ~1100-char chunks so each usually stays inside the
 * model's 256-token window. Prefers paragraph boundaries, but a PDF-extracted
 * resume is often ONE giant line, so oversized paragraphs are further split
 * on sentence/bullet boundaries — plain truncation would silently drop
 * everything past the first chunk. Exported for the worker and benchmark so
 * all callers exercise identical chunking.
 */
export function chunkText(text, target = 1100) {
  const pieces = [];
  for (const para of text.split(/\n+/)) {
    if (para.length <= target) {
      pieces.push(para);
      continue;
    }
    let cur = "";
    for (const sentence of para.split(/(?<=[.!?])\s+|\s+(?=•)/)) {
      if (cur.length + sentence.length + 1 > target && cur) {
        pieces.push(cur);
        cur = "";
      }
      cur = cur ? `${cur} ${sentence}` : sentence;
    }
    if (cur) pieces.push(cur);
  }

  const out = [];
  let current = "";
  for (const piece of pieces) {
    if (current.length + piece.length + 1 > target && current) {
      out.push(current);
      current = "";
    }
    current = current ? `${current}\n${piece}` : piece;
  }
  if (current) out.push(current);
  return out.length ? out : [text];
}

/**
 * Spin up the embedding worker bound to one resume. Resolves to a scorer
 * ({ similarities(texts), dispose() }) once the model is loaded and the
 * resume embedded, or to null when anything fails (offline first run, WASM
 * blocked, worker unsupported) — callers treat null as "semantic scoring
 * off" and keep the lexical scores untouched.
 */
export function createSemanticScorer(resumeText, opts = {}) {
  return new Promise((resolveScorer) => {
    let worker;
    try {
      // Plain URL to a standalone build entry (see package.json build). Using
      // `new URL(..., import.meta.url)` here made Parcel emit an inline
      // <script type=importmap> into the HTML, which the extension CSP
      // rightly blocks — MV3 pages cannot run ANY inline script.
      worker = new Worker(chrome.runtime.getURL("embeddings-worker.js"), {
        type: "module",
      });
    } catch (e) {
      console.warn("Semantic scorer unavailable (no worker):", e);
      resolveScorer(null);
      return;
    }

    let ready = false;
    let nextId = 1;
    const pending = new Map();

    const fail = (message) => {
      pending.forEach((p) => p.reject(new Error(message)));
      pending.clear();
      if (!ready) {
        ready = true;
        console.warn("Semantic scorer unavailable, keeping lexical scores:", message);
        resolveScorer(null);
      }
      worker.terminate();
    };

    worker.onerror = (e) => fail(e.message || "worker error");
    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === "ready" && !ready) {
        ready = true;
        resolveScorer({
          /**
           * Cosine similarity of the resume against each job text (HTML ok).
           * Resolves to { cosines, ms } where ms is worker inference time.
           */
          similarities(texts, charCap) {
            return new Promise((resolve, reject) => {
              const id = nextId++;
              pending.set(id, { resolve, reject });
              worker.postMessage({ type: "score", id, texts, charCap });
            });
          },
          dispose() {
            worker.terminate();
          },
        });
      } else if (msg.type === "scores") {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (p) p.resolve({ cosines: msg.cosines, ms: msg.ms || 0 });
      } else if (msg.type === "progress") {
        // First-enable downloads (runtime .wasm, model weights).
        if (opts.onProgress) opts.onProgress(msg);
      } else if (msg.type === "error") {
        // A scoped scoring error fails just that batch; anything else
        // (model load, resume embed) takes the whole scorer down.
        const p = msg.id !== undefined ? pending.get(msg.id) : null;
        if (p) {
          pending.delete(msg.id);
          p.reject(new Error(msg.message));
        } else {
          fail(msg.message);
        }
      }
    };

    worker.postMessage({
      type: "init",
      resumeText,
      numThreads: opts.numThreads,
      revision: opts.revision,
    });
  });
}
