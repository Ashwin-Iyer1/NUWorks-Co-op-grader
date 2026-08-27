#!/usr/bin/env python3
"""Compare production and alternative resume/job aggregation strategies."""

import argparse
import json
import os

import numpy as np
import pandas as pd
from scipy import stats
from sentence_transformers import SentenceTransformer

from evaluate_production import FALLBACK_QUERY_PROMPT, chunk_text, normalize_rows, ranking_metrics


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", required=True)
    parser.add_argument("--split", choices=("val", "test"), default="val")
    parser.add_argument("--data-dir", default="data")
    parser.add_argument("--batch-size", type=int, default=128)
    parser.add_argument("--json-out")
    args = parser.parse_args()

    frame = pd.read_csv(os.path.join(args.data_dir, f"hf_{args.split}.csv")).reset_index(drop=True)
    model = SentenceTransformer(args.model)
    model.max_seq_length = 256
    if len(model) > 2:
        del model[2]
    prompt = model.prompts.get("query", FALLBACK_QUERY_PROMPT)

    resume_spans, resume_inputs = {}, []
    for resume in frame["resume"].drop_duplicates():
        chunks = [prompt + chunk for chunk in chunk_text(resume, 1100)]
        resume_spans[resume] = (len(resume_inputs), len(chunks))
        resume_inputs.extend(chunks)
    resume_embeddings = model.encode(resume_inputs, normalize_embeddings=True, batch_size=args.batch_size)

    first_jobs = frame["job"].astype(str).str.slice(0, 1200).tolist()
    head_tail_jobs = [job if len(job) <= 1200 else job[:600] + "\n" + job[-600:] for job in frame["job"].astype(str)]
    job_spans, job_chunks = [], []
    for job in frame["job"].astype(str):
        chunks = chunk_text(job, 1100)
        job_spans.append((len(job_chunks), len(chunks)))
        job_chunks.extend(chunks)
    first_embeddings = model.encode(first_jobs, normalize_embeddings=True, batch_size=args.batch_size)
    head_tail_embeddings = model.encode(head_tail_jobs, normalize_embeddings=True, batch_size=args.batch_size)
    job_chunk_embeddings = model.encode(job_chunks, normalize_embeddings=True, batch_size=args.batch_size)

    scores = {name: [] for name in (
        "production_mean_first", "resume_max_first", "resume_top2_first",
        "mean_head_tail", "mean_job_max", "cross_max", "cross_top2",
    )}
    for row_index, resume in enumerate(frame["resume"]):
        rstart, rcount = resume_spans[resume]
        rchunks = resume_embeddings[rstart:rstart + rcount]
        rmean = normalize_rows(rchunks.mean(axis=0, keepdims=True))[0]
        first = first_embeddings[row_index]
        resume_sims = rchunks @ first
        jstart, jcount = job_spans[row_index]
        jchunks = job_chunk_embeddings[jstart:jstart + jcount]
        cross = (rchunks @ jchunks.T).ravel()
        scores["production_mean_first"].append(float(rmean @ first))
        scores["resume_max_first"].append(float(resume_sims.max()))
        scores["resume_top2_first"].append(float(np.sort(resume_sims)[-2:].mean()))
        scores["mean_head_tail"].append(float(rmean @ head_tail_embeddings[row_index]))
        scores["mean_job_max"].append(float((jchunks @ rmean).max()))
        scores["cross_max"].append(float(cross.max()))
        scores["cross_top2"].append(float(np.sort(cross)[-2:].mean()))

    labels = frame["score"].to_numpy(dtype=float)
    results = {}
    for name, values in scores.items():
        values = np.asarray(values)
        metrics = {
            "spearman": float(stats.spearmanr(values, labels).statistic),
            "pearson": float(stats.pearsonr(values, labels).statistic),
            **ranking_metrics(frame, values),
        }
        results[name] = metrics
        print(f"{name:>24}: spearman={metrics['spearman']:.4f} ndcg@10={metrics['mean_ndcg_at_10']:.4f} top1={metrics['top1_best_rate']:.4f}")
    if args.json_out:
        os.makedirs(os.path.dirname(args.json_out) or ".", exist_ok=True)
        with open(args.json_out, "w", encoding="utf-8") as handle:
            json.dump(results, handle, indent=2)


if __name__ == "__main__":
    main()
