#!/usr/bin/env python3
"""Export the fine-tuned model to ONNX for Transformers.js (the extension runtime).

Produces the HuggingFace repo layout Transformers.js expects:
    <out>/config.json, tokenizer.json, ...
    <out>/onnx/model.onnx             (fp32)
    <out>/onnx/model_quantized.onnx   (dynamic 8-bit; about 34 MB for current BGE-small)

The current BGE-small fp32 graph is about 133 MB. Historical MDBR exports were
about 90 MB fp32 / 23 MB quantized; file size depends on the selected architecture.

Requires:  pip install "optimum[onnxruntime]" onnx

Usage:
    python export_onnx.py --model models/mdbr-leaf-mt-resume-grader --out models/resume-grader-onnx

To use it in the extension, pair the weights with validation-fitted calibration.json
and configure SEMANTIC_MODEL_ID / fallback calibration in
src/semantic-model-version.mjs on the chrome-extension branch.
"""

import argparse
import os
import shutil
import tempfile
from pathlib import Path


QUANTIZED_SUFFIX = "qint8_avx2"


def install_quantized_alias(onnx_dir):
    """Atomically refresh the runtime filename from this export's exact artifact.

    Selecting any quantized-looking file can accidentally pick an earlier export
    (including the alias itself). A missing/empty expected output is an error,
    even when an old model_quantized.onnx already exists.
    """
    directory = Path(onnx_dir)
    source = directory / f"model_{QUANTIZED_SUFFIX}.onnx"
    target = directory / "model_quantized.onnx"
    if not source.is_file() or source.stat().st_size == 0:
        raise FileNotFoundError(f"Quantization did not produce a nonempty {source}")
    with tempfile.NamedTemporaryFile(prefix=".model_quantized-", suffix=".tmp",
                                     dir=directory, delete=False) as handle:
        temporary = Path(handle.name)
    try:
        shutil.copyfile(source, temporary)
        temporary.replace(target)
    finally:
        temporary.unlink(missing_ok=True)
    return target


def main():
    from sentence_transformers import SentenceTransformer
    from sentence_transformers.backend import export_dynamic_quantized_onnx_model

    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--model", required=True, help="path to the fine-tuned sentence-transformers model")
    ap.add_argument("--out", required=True, help="output directory (HF repo layout)")
    args = ap.parse_args()

    # Loading with backend="onnx" converts the PyTorch weights to onnx/model.onnx.
    model = SentenceTransformer(args.model, backend="onnx")
    model.save_pretrained(args.out)

    # Dynamic int8 quantization; avx2 config matches what Transformers.js's
    # default quantized models are built with.
    export_dynamic_quantized_onnx_model(model, "avx2", args.out,
                                       file_suffix=QUANTIZED_SUFFIX)

    onnx_dir = os.path.join(args.out, "onnx")
    install_quantized_alias(onnx_dir)

    for f in sorted(os.listdir(onnx_dir)):
        size = os.path.getsize(os.path.join(onnx_dir, f)) / 1e6
        print(f"onnx/{f}: {size:.1f} MB")
    print(f"\nExported to {args.out}. Validate the quantized model and calibration "
          "before publishing; extension model configuration lives in "
          "src/semantic-model-version.mjs.")


if __name__ == "__main__":
    main()
