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

const MODEL_ID = "MongoDB/mdbr-leaf-ir";

// From the model's config_sentence_transformers.json: the QUERY side gets this
// prefix, documents are embedded bare. The resume plays the query role.
const QUERY_PREFIX =
  "Represent this sentence for searching relevant passages: ";

env.allowLocalModels = false;
// This worker runs on the chrome-extension:// origin, so this resolves to the
// ort/ folder shipped inside the package — MV3 forbids remotely hosted code.
// The model WEIGHTS are data and stream from the HF CDN (cached after once).
env.backends.onnx.wasm.wasmPaths = `${self.location.origin}/ort/`;

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
      const t0 = performance.now();
      extractor = await pipeline("feature-extraction", MODEL_ID, {
        dtype: "q8",
      });
      console.log(
        `[Semantic] ${MODEL_ID} ready in ${Math.round(performance.now() - t0)} ms ` +
          `(int8 ONNX ~23MB, 384-dim, 512-token window, WASM backend, ` +
          `threads=${env.backends.onnx.wasm.numThreads ?? "auto"}, ` +
          `crossOriginIsolated=${self.crossOriginIsolated})`
      );

      // Chunk-and-average the resume: at ~850 tokens it overflows the
      // 512-token window, and plain truncation would drop the tail sections.
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
      // Attention cost is quadratic in tokens, so the char cap is the main
      // speed/quality dial. 2000 chars (~250 tokens) measured 0.979 rank
      // correlation with the full 512-token window on a real 253-job batch
      // (capsweep, repo history) while cutting inference ~15-40%; 1000 chars
      // degraded the top-25 noticeably. 4000 ≈ the full window.
      const charCap = msg.charCap || 2000;
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
