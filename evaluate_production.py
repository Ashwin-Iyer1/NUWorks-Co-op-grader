#!/usr/bin/env python3
"""Evaluate resume/job embeddings with the extension's production preprocessing.

Unlike evaluate.py, this reproduces the shipped BGE path: resumes are split
into approximately 1,100-character chunks without a query prompt, jobs are
capped at 1,200 characters, and all inputs are truncated to 256 tokens.
Pooling is forced to attention-mask mean, as in Transformers.js, even when
the saved SentenceTransformer config specifies CLS pooling. Historical model
pooling/prompt behavior is available explicitly for comparisons.
"""

import argparse
import json
import math
import os
import re

import numpy as np
import pandas as pd
from scipy import stats
from sentence_transformers import SentenceTransformer
try:
    from sentence_transformers.sentence_transformer.modules import Pooling
except ImportError:  # sentence-transformers < 6
    from sentence_transformers.models import Pooling

FALLBACK_QUERY_PROMPT = "Represent this sentence for searching relevant passages: "


def configure_pooling(model, pooling="mean"):
    """Mutate and return model, aligning its pooling with the extension runtime.

    The positional dimension argument and pooling_mode string work in both
    sentence-transformers 3.x and 6.x. This helper does not remove a Dense head;
    callers choose whether such post-pooling modules belong to their runtime.
    """
    if pooling == "model":
        return model
    if pooling != "mean":
        raise ValueError("pooling must be 'mean' or 'model'")
    if len(model) < 2 or not isinstance(model[1], Pooling):
        raise ValueError("Runtime mean pooling requires a transformer followed by Pooling")
    current = model[1]
    dimension = getattr(current, "embedding_dimension", None)
    if dimension is None:
        dimension = getattr(current, "word_embedding_dimension", None)
    if dimension is None:
        dimension = model[0].get_word_embedding_dimension()
    model[1] = Pooling(dimension, pooling_mode="mean", include_prompt=True)
    return model


def chunk_text(text, target=1100):
    pieces = []
    for para in re.split(r"\n+", str(text)):
        if len(para) <= target:
            pieces.append(para)
            continue
        current = ""
        for sentence in re.split(r"(?<=[.!?])\s+|\s+(?=•)", para):
            if len(current) + len(sentence) + 1 > target and current:
                pieces.append(current)
                current = ""
            current = f"{current} {sentence}".strip()
        if current:
            pieces.append(current)

    output, current = [], ""
    for piece in pieces:
        if len(current) + len(piece) + 1 > target and current:
            output.append(current)
            current = ""
        current = f"{current}\n{piece}".strip()
    if current:
        output.append(current)
    return output or [str(text)]


def normalize_rows(values):
    norms = np.linalg.norm(values, axis=1, keepdims=True)
    return values / np.maximum(norms, 1e-12)


def ndcg(labels, scores, k=10):
    labels = np.asarray(labels)
    scores = np.asarray(scores)
    order = np.argsort(-scores)[:k]
    ideal = np.argsort(-labels)[:k]
    discounts = 1.0 / np.log2(np.arange(2, len(order) + 2))
    ideal_discounts = 1.0 / np.log2(np.arange(2, len(ideal) + 2))
    dcg = np.sum((np.power(2.0, labels[order]) - 1.0) * discounts)
    idcg = np.sum((np.power(2.0, labels[ideal]) - 1.0) * ideal_discounts)
    return float(dcg / idcg) if idcg > 0 else float("nan")


def ranking_metrics(frame, scores):
    grouped_spearman, grouped_ndcg, top1 = [], [], []
    for _, indexes in frame.groupby("resume", sort=False).groups.items():
        indexes = np.asarray(list(indexes), dtype=int)
        labels = frame.loc[indexes, "score"].to_numpy(dtype=float)
        predictions = scores[indexes]
        if len(labels) < 2 or len(np.unique(labels)) < 2:
            continue
        rho = stats.spearmanr(predictions, labels).statistic
        if np.isfinite(rho):
            grouped_spearman.append(float(rho))
        grouped_ndcg.append(ndcg(labels, predictions, 10))
        predicted_best = labels[np.argmax(predictions)]
        top1.append(float(predicted_best == labels.max()))
    return {
        "rankable_resumes": len(grouped_ndcg),
        "mean_resume_spearman": float(np.mean(grouped_spearman)) if grouped_spearman else None,
        "mean_ndcg_at_10": float(np.nanmean(grouped_ndcg)) if grouped_ndcg else None,
        "top1_best_rate": float(np.mean(top1)) if top1 else None,
    }


def score_dataset(model, frame, batch_size, char_cap, chunk_chars, query_prompt=""):
    # An explicit empty prompt suppresses any model.default_prompt_name. The
    # chrome-extension branch's BGE worker encodes bare resumes and jobs.
    prompt = query_prompt
    resumes = frame["resume"].drop_duplicates().tolist()
    chunks_by_resume, flat_chunks = {}, []
    for resume in resumes:
        chunks = [prompt + chunk for chunk in chunk_text(resume, chunk_chars)]
        chunks_by_resume[resume] = (len(flat_chunks), len(chunks))
        flat_chunks.extend(chunks)

    chunk_embeddings = model.encode(
        flat_chunks,
        prompt="",
        normalize_embeddings=True,
        batch_size=batch_size,
        show_progress_bar=False,
    )
    jobs = frame["job"].astype(str).str.slice(0, char_cap).tolist()
    unique_jobs = list(dict.fromkeys(jobs))
    job_indexes = {job: index for index, job in enumerate(unique_jobs)}
    job_embeddings = model.encode(
        unique_jobs,
        prompt="",
        normalize_embeddings=True,
        batch_size=batch_size,
        show_progress_bar=False,
    )

    mean_vectors = {}
    for resume, (start, count) in chunks_by_resume.items():
        vector = chunk_embeddings[start : start + count].mean(axis=0, keepdims=True)
        mean_vectors[resume] = normalize_rows(vector)[0]

    scores = {"mean_vector": [], "max_chunk": [], "top2_chunks": []}
    for row_index, resume in enumerate(frame["resume"]):
        start, count = chunks_by_resume[resume]
        job_embedding = job_embeddings[job_indexes[jobs[row_index]]]
        similarities = chunk_embeddings[start : start + count] @ job_embedding
        ordered = np.sort(similarities)[::-1]
        scores["mean_vector"].append(float(mean_vectors[resume] @ job_embedding))
        scores["max_chunk"].append(float(ordered[0]))
        scores["top2_chunks"].append(float(ordered[:2].mean()))
    return {key: np.asarray(value) for key, value in scores.items()}


def evaluate_model(
    model_path, data_dir, split, batch_size, char_cap, chunk_chars,
    predictions_dir=None, backend=None, model_file=None, dataset_names=None,
    pooling="mean", query_prompt="", use_model_query_prompt=False,
):
    model_kwargs = {"file_name": model_file} if model_file else None
    model = SentenceTransformer(model_path, backend=backend or "torch", model_kwargs=model_kwargs)
    model.max_seq_length = 256
    while len(model) > 2:
        del model[-1]
    configure_pooling(model, pooling)
    if use_model_query_prompt:
        query_prompt = model.prompts.get("query", FALLBACK_QUERY_PROMPT)

    output = {
        "model": model_path, "split": split, "datasets": {},
        "inference": {"pooling": pooling, "query_prompt": query_prompt,
                      "max_seq_length": 256, "job_char_cap": char_cap,
                      "resume_chunk_chars": chunk_chars},
    }
    for name in dataset_names or ("hf", "neuralframe"):
        path = os.path.join(data_dir, f"{name}_{split}.csv")
        if not os.path.exists(path):
            continue
        frame = pd.read_csv(path).reset_index(drop=True)
        labels = frame["score"].to_numpy(dtype=float)
        score_sets = score_dataset(model, frame, batch_size, char_cap, chunk_chars, query_prompt)
        output["datasets"][name] = {}
        for aggregation, scores in score_sets.items():
            metrics = {
                "n": len(frame),
                "spearman": float(stats.spearmanr(scores, labels).statistic),
                "pearson": float(stats.pearsonr(scores, labels).statistic),
                "mae_raw_cosine": float(np.mean(np.abs(scores - labels))),
                **ranking_metrics(frame, scores),
            }
            output["datasets"][name][aggregation] = metrics
            rank = metrics["mean_ndcg_at_10"]
            rank_text = f" ndcg@10={rank:.4f}" if rank is not None else ""
            print(
                f"{name:>12} {aggregation:>12} | spearman={metrics['spearman']:.4f} "
                f"pearson={metrics['pearson']:.4f}{rank_text}"
            )
            if predictions_dir:
                os.makedirs(predictions_dir, exist_ok=True)
                # Keep major/year/source metadata for evaluate_diversity.py.
                prediction_frame = frame.copy()
                prediction_frame["prediction"] = scores
                prediction_frame.to_csv(
                    os.path.join(predictions_dir, f"{name}_{split}_{aggregation}.csv"),
                    index=False,
                )
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", required=True)
    parser.add_argument("--data-dir", default="data")
    parser.add_argument("--split", choices=("val", "test"), default="val")
    parser.add_argument("--batch-size", type=int, default=128)
    parser.add_argument("--char-cap", type=int, default=1200)
    parser.add_argument("--chunk-chars", type=int, default=1100)
    parser.add_argument("--predictions-dir")
    parser.add_argument("--json-out")
    parser.add_argument("--backend", choices=("torch", "onnx"), default="torch")
    parser.add_argument("--model-file", help="backend file, e.g. onnx/model_quantized.onnx")
    parser.add_argument("--pooling", choices=("mean", "model"), default="mean",
                        help="mean matches Transformers.js; model reproduces historical ST pooling")
    parser.add_argument("--query-prompt", default="",
                        help="runtime query prefix; default empty matches the shipped BGE worker")
    parser.add_argument("--use-model-query-prompt", action="store_true",
                        help="reproduce historical evaluator's model query prompt (including blank)")
    parser.add_argument(
        "--datasets",
        nargs="+",
        default=["hf", "neuralframe"],
        help="dataset prefixes to evaluate (default: hf neuralframe)",
    )
    args = parser.parse_args()
    results = evaluate_model(
        args.model,
        args.data_dir,
        args.split,
        args.batch_size,
        args.char_cap,
        args.chunk_chars,
        args.predictions_dir,
        args.backend,
        args.model_file,
        args.datasets,
        args.pooling,
        args.query_prompt,
        args.use_model_query_prompt,
    )
    rendered = json.dumps(results, indent=2)
    if args.json_out:
        os.makedirs(os.path.dirname(args.json_out) or ".", exist_ok=True)
        with open(args.json_out, "w", encoding="utf-8") as handle:
            handle.write(rendered + "\n")
    print(rendered)


if __name__ == "__main__":
    main()
