#!/usr/bin/env python3
"""Export the fine-tuned model to ONNX for Transformers.js (the extension runtime).

Produces the HuggingFace repo layout Transformers.js expects:
    <out>/config.json, tokenizer.json, ...
    <out>/onnx/model.onnx             (fp32)
    <out>/onnx/model_quantized.onnx   (dynamic qint8 — the ~23 MB file users download)

Requires:  pip install "optimum[onnxruntime]" onnx

Usage:
    python export_onnx.py --model models/mdbr-leaf-mt-resume-grader --out models/resume-grader-onnx

To use it in the extension, upload the output folder to a HuggingFace model repo
and point MODEL_ID in src/embeddings-worker.js at it.
"""

import argparse
import os
import shutil

from sentence_transformers import SentenceTransformer
from sentence_transformers.backend import export_dynamic_quantized_onnx_model


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--model", required=True, help="path to the fine-tuned sentence-transformers model")
    ap.add_argument("--out", required=True, help="output directory (HF repo layout)")
    args = ap.parse_args()

    # Loading with backend="onnx" converts the PyTorch weights to onnx/model.onnx.
    model = SentenceTransformer(args.model, backend="onnx")
    model.save_pretrained(args.out)

    # Dynamic int8 quantization; avx2 config matches what Transformers.js's
    # default quantized models are built with.
    export_dynamic_quantized_onnx_model(model, "avx2", args.out)

    onnx_dir = os.path.join(args.out, "onnx")
    quant = [
        f for f in os.listdir(onnx_dir)
        if "qint8" in f or "quint8" in f or "quantized" in f
    ]
    if quant and not os.path.exists(os.path.join(onnx_dir, "model_quantized.onnx")):
        shutil.copyfile(os.path.join(onnx_dir, quant[0]),
                        os.path.join(onnx_dir, "model_quantized.onnx"))

    for f in sorted(os.listdir(onnx_dir)):
        size = os.path.getsize(os.path.join(onnx_dir, f)) / 1e6
        print(f"onnx/{f}: {size:.1f} MB")
    print(f"\nExported to {args.out} — upload this folder to a HuggingFace repo "
          f"and update MODEL_ID in src/embeddings-worker.js.")


if __name__ == "__main__":
    main()
