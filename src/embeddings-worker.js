// Copyright (c) 2026 Ashwin Iyer — Licensed under AGPL-3.0

// Dedicated worker that owns the embedding model (see embeddings.js for the
// page-side client). Inference is CPU-heavy — hundreds of milliseconds per
// batch — and when it ran on the explorer page's main thread, in-flight
// detail fetches couldn't have their responses processed and sat "pending"
// until the WASM yielded. In here it costs the page nothing.
//
// Protocol: {type:"init", resumeText} -> {type:"ready"} | {type:"error"};
// {type:"score", id, texts} -> {type:"scores", id, cosines} | {type:"error", id}.
import { pipeline, env } from "@huggingface/transformers";
import { htmlToText, chunkText } from "./embeddings.js";

const MODEL_ID = "turtlecap/mdbr-leaf-mt-resume-grader";

// From the model's config_sentence_transformers.json: the QUERY side gets this
// prefix, documents are embedded bare. The resume plays the query role.
const QUERY_PREFIX =
  "Represent this sentence for searching relevant passages: ";

env.allowLocalModels = false;
// The tiny .mjs loader ships in the package (it is JavaScript — MV3 forbids
// executing remotely hosted code, so it cannot be fetched at runtime).
env.backends.onnx.wasm.wasmPaths = `${self.location.origin}/ort/`;

// The 22.5MB ORT .wasm binary does NOT ship in the package. Semantic AI is
// opt-in: on first enable it's fetched from the project's GitHub repo (serves
// CORS + CORP headers), persisted in the Cache API, and handed to ORT as raw
// bytes via wasmBinary. WebAssembly bytes are data, unlike the .mjs loader.
// The model weights stream from the HF CDN the same way (transformers.js's
// own cache). Together: ~46MB one-time download, then fully offline.
const WASM_URL =
  "https://raw.githubusercontent.com/Ashwin-Iyer1/NUWorks-Co-op-grader/refs/heads/chrome-extension/public/ort/ort-wasm-simd-threaded.asyncify.wasm";
const RUNTIME_CACHE = "nuwg-semantic-runtime";

async function loadWasmBinary() {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(WASM_URL);
  if (cached) return cached.arrayBuffer();

  const resp = await fetch(WASM_URL);
  if (!resp.ok) {
    throw new Error(`AI runtime download failed: HTTP ${resp.status}`);
  }

  // Stream so the page can show a real percentage for the ~22.5MB download.
  const total = Number(resp.headers.get("content-length")) || 0;
  const reader = resp.body.getReader();
  const parts = [];
  let loaded = 0;
  let lastPct = -1;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    loaded += value.length;
    if (total) {
      const pct = Math.round((loaded / total) * 100);
      if (pct !== lastPct) {
        lastPct = pct;
        self.postMessage({ type: "progress", label: "Downloading AI runtime", pct });
      }
    }
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  await cache.put(
    WASM_URL,
    new Response(bytes, { headers: { "Content-Type": "application/wasm" } })
  );
  return bytes.buffer;
}

let extractor = null;
let resumeVec = null;

self.onmessage = async (e) => {
  const msg = e.data;
  try {
    if (msg.type === "init") {
      // Thread count. Multithreaded WASM only works when crossOriginIsolated
      // (COOP/COEP in the manifest); without isolation ORT clamps to 1
      // regardless. When isolated, ask for up to 4 threads explicitly — the
      // runtime's own default can stay at 1 even where more are available.
      // msg.numThreads is the bench page's override.
      if (msg.numThreads) {
        env.backends.onnx.wasm.numThreads = msg.numThreads;
      } else if (self.crossOriginIsolated) {
        // Half the cores, capped at 4, floor of 1. This ships to weak
        // hardware (MacBook Air, Chromebooks): a dual-core machine gets ONE
        // thread so the pass never saturates it, and even big desktops stay
        // at 4 — benched 159ms/doc there vs 90 at 16 threads, a fine trade
        // for a background pass that leaves the rest of the machine alone.
        env.backends.onnx.wasm.numThreads = Math.min(
          4,
          Math.max(1, Math.floor((self.navigator.hardwareConcurrency || 2) / 2))
        );
      }
      env.backends.onnx.wasm.wasmBinary = await loadWasmBinary();

      // transformers.js fires the SAME progress events when streaming the
      // model out of its cache as when downloading it, and reading 23MB off
      // disk on every cold page-open would flash the "downloading" modal for
      // a download that isn't happening. Only report progress when the big
      // weights file is genuinely absent from the cache.
      let isRealDownload = true;
      try {
        const tCache = await caches.open("transformers-cache");
        const keys = await tCache.keys();
        isRealDownload = !keys.some(
          (r) => r.url.includes(MODEL_ID) && r.url.includes(".onnx")
        );
      } catch {
        // Cache API unavailable → every load is a real download; report it.
      }

      const t0 = performance.now();
      extractor = await pipeline("feature-extraction", MODEL_ID, {
        dtype: "q8",
        // The Hub config currently marks model_quantized.onnx as external-data
        // format, but the uploaded 22.99MB file is self-contained and has no
        // `_data` sidecar. Override that metadata so Transformers.js loads it.
        use_external_data_format: false,
        // Surface the one-time ~23MB weights download as page-visible
        // progress; only the big weights file is worth reporting.
        progress_callback: (p) => {
          if (isRealDownload && p.status === "progress" && p.total > 5_000_000) {
            self.postMessage({
              type: "progress",
              label: "Downloading AI model",
              pct: Math.round((p.loaded / p.total) * 100),
            });
          }
        },
      });
      console.log(
        `[Semantic] ${MODEL_ID} ready in ${Math.round(performance.now() - t0)} ms ` +
          `(int8 ONNX ~23MB, 384-dim, 256-token window, WASM backend, ` +
          `threads=${env.backends.onnx.wasm.numThreads ?? "auto"}, ` +
          `crossOriginIsolated=${self.crossOriginIsolated})`
      );

      // Chunk-and-average the resume: it normally overflows the model's
      // 256-token window, and plain truncation would drop the tail sections.
      const t1 = performance.now();
      const chunks = chunkText(htmlToText(msg.resumeText)).map(
        (c) => QUERY_PREFIX + c
      );
      const res = await extractor(chunks, { pooling: "mean", normalize: true });
      const dim = res.dims[res.dims.length - 1];
      resumeVec = new Float32Array(dim);
      for (let c = 0; c < chunks.length; c++) {
        for (let i = 0; i < dim; i++) resumeVec[i] += res.data[c * dim + i];
      }
      let norm = 0;
      for (let i = 0; i < dim; i++) norm += resumeVec[i] * resumeVec[i];
      norm = Math.sqrt(norm) || 1;
      for (let i = 0; i < dim; i++) resumeVec[i] /= norm;

      console.log(
        `[Semantic] Resume embedded as ${chunks.length} chunk(s) in ${Math.round(performance.now() - t1)} ms (query-prefixed, mean-pooled, averaged)`
      );
      self.postMessage({ type: "ready" });
    } else if (msg.type === "score") {
      const t0 = performance.now();
      // The fine-tuned model was trained with a 256-token window. Roughly
      // 1,200 characters fills that window for typical job descriptions;
      // the tokenizer applies the exact token limit for denser text.
      const charCap = msg.charCap || 1200;
      const cleaned = msg.texts.map((t) => htmlToText(t).slice(0, charCap));
      const out = await extractor(cleaned, {
        pooling: "mean",
        normalize: true,
      });
      const d = out.dims[out.dims.length - 1];
      const cosines = cleaned.map((_, i) => {
        let sum = 0;
        for (let j = 0; j < d; j++) sum += resumeVec[j] * out.data[i * d + j];
        return sum;
      });
      self.postMessage({
        type: "scores",
        id: msg.id,
        cosines,
        ms: Math.round(performance.now() - t0),
      });
    }
  } catch (err) {
    self.postMessage({
      type: "error",
      id: msg.type === "score" ? msg.id : undefined,
      message: String((err && err.message) || err),
    });
  }
};
