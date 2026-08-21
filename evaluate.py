#!/usr/bin/env python3
"""Compare base vs fine-tuned model on the held-out test splits.

For each dataset it encodes resumes with the "query" prompt, job descriptions
as documents, takes the cosine similarity, and reports:
  - Spearman/Pearson correlation with the match score (grading quality — this
    is the number that matters for a 0-100 score UI)
  - ROC-AUC for binary datasets
  - The cosine range, which feeds the extension's calibration constants
    (see benchmark-semantic.mjs and CALIB in src/embeddings.js)

Usage:
    python evaluate.py                                  # base model only
    python evaluate.py --model models/mdbr-leaf-mt-resume-grader
    python evaluate.py --model <path> --dims 256        # optionally test truncated embeddings
"""

import argparse
import glob
import os

import numpy as np
import pandas as pd
from scipy import stats
from sentence_transformers import SentenceTransformer

BASE_MODEL = "MongoDB/mdbr-leaf-mt"
FALLBACK_QUERY_PROMPT = "Represent this sentence for searching relevant passages: "


def roc_auc(labels, scores):
    """Rank-based AUC without an sklearn dependency."""
    order = np.argsort(scores)
    ranks = np.empty(len(scores))
    ranks[order] = np.arange(1, len(scores) + 1)
    pos = labels == 1
    n_pos, n_neg = pos.sum(), (~pos).sum()
    if n_pos == 0 or n_neg == 0:
        return float("nan")
    return (ranks[pos].sum() - n_pos * (n_pos + 1) / 2) / (n_pos * n_neg)


def evaluate(model, data_dir, dims=None):
    prompt = model.prompts.get("query", FALLBACK_QUERY_PROMPT)
    for path in sorted(glob.glob(os.path.join(data_dir, "*_test.csv"))):
        name = os.path.basename(path)[:-len("_test.csv")]
        df = pd.read_csv(path)
        r = model.encode(df["resume"].tolist(), prompt=prompt, normalize_embeddings=True,
                         batch_size=64, show_progress_bar=False)
        j = model.encode(df["job"].tolist(), normalize_embeddings=True,
                         batch_size=64, show_progress_bar=False)
        if dims:
            r, j = r[:, :dims], j[:, :dims]
            r /= np.linalg.norm(r, axis=1, keepdims=True)
            j /= np.linalg.norm(j, axis=1, keepdims=True)
        cos = (r * j).sum(axis=1)
        y = df["score"].to_numpy()

        line = (f"{name:>12} | n={len(df):5d} | spearman={stats.spearmanr(cos, y).statistic:.4f} "
                f"| pearson={stats.pearsonr(cos, y).statistic:.4f}")
        if set(np.unique(y)) <= {0.0, 1.0}:
            line += f" | auc={roc_auc(y, cos):.4f}"
        line += (f" | cosine p5={np.percentile(cos, 5):.3f} "
                 f"median={np.median(cos):.3f} p95={np.percentile(cos, 95):.3f}")
        print(line)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--model", default=None, help="fine-tuned model path (default: base model only)")
    ap.add_argument("--data-dir", default=os.path.join(os.path.dirname(__file__) or ".", "data"))
    ap.add_argument("--dims", type=int, default=None, help="truncate embeddings (e.g. 256)")
    ap.add_argument("--skip-base", action="store_true")
    ap.add_argument("--keep-dense", action="store_true",
                    help="keep the base model's Dense(384->1024) head; by default it is "
                         "dropped to mirror the extension's Transformers.js inference path")
    args = ap.parse_args()

    def load(path):
        model = SentenceTransformer(path)
        if not args.keep_dense and len(model) > 2:
            del model[2]
        return model

    if not args.skip_base:
        print(f"=== {BASE_MODEL} (base) ===")
        evaluate(load(BASE_MODEL), args.data_dir, args.dims)
    if args.model:
        print(f"=== {args.model} (fine-tuned) ===")
        evaluate(load(args.model), args.data_dir, args.dims)


if __name__ == "__main__":
    main()
