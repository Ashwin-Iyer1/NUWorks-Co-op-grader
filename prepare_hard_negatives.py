#!/usr/bin/env python3
"""Mine within-resume hard negatives and optionally label them with a teacher."""

import argparse
import os

import pandas as pd
from sentence_transformers import CrossEncoder, SentenceTransformer

from evaluate_production import score_dataset


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", required=True, help="bi-encoder used to identify confusing lower-rated jobs")
    parser.add_argument("--input", default="data/hf_train.csv")
    parser.add_argument("--output", required=True)
    parser.add_argument("--negatives-per-resume", type=int, default=2)
    parser.add_argument("--teacher", help="optional CrossEncoder model for distillation margins")
    parser.add_argument("--batch-size", type=int, default=128)
    args = parser.parse_args()

    frame = pd.read_csv(args.input).drop_duplicates(["resume", "job", "score"]).reset_index(drop=True)
    model = SentenceTransformer(args.model)
    model.max_seq_length = 256
    if len(model) > 2:
        del model[2]
    semantic = score_dataset(model, frame, args.batch_size, 1200, 1100)["mean_vector"]
    frame["semantic"] = semantic

    triplets = []
    for resume, group in frame.groupby("resume", sort=False):
        best_label = group["score"].max()
        positives = group[group["score"] == best_label]
        negatives = group[group["score"] < best_label].sort_values("semantic", ascending=False)
        if negatives.empty:
            continue
        # A low-scoring positive embedding is the harder positive to retain.
        positive = positives.sort_values("semantic", ascending=True).iloc[0]
        for _, negative in negatives.head(args.negatives_per_resume).iterrows():
            triplets.append({
                "query": resume,
                "positive": positive["job"],
                "negative": negative["job"],
                "label": float(best_label - negative["score"]),
                "positive_label": float(best_label),
                "negative_label": float(negative["score"]),
                "mined_negative_similarity": float(negative["semantic"]),
            })

    output = pd.DataFrame(triplets)
    if args.teacher:
        teacher = CrossEncoder(args.teacher, max_length=512)
        positive_scores = teacher.predict(
            list(zip(output["query"], output["positive"])),
            batch_size=max(1, args.batch_size // 4),
            show_progress_bar=True,
        )
        negative_scores = teacher.predict(
            list(zip(output["query"], output["negative"])),
            batch_size=max(1, args.batch_size // 4),
            show_progress_bar=True,
        )
        output["gold_label"] = output["label"]
        output["label"] = positive_scores - negative_scores
        output["teacher_positive"] = positive_scores
        output["teacher_negative"] = negative_scores

    os.makedirs(os.path.dirname(args.output) or ".", exist_ok=True)
    output.to_csv(args.output, index=False)
    print(f"Wrote {len(output):,} triplets to {args.output}")
    print(output[["label", "positive_label", "negative_label", "mined_negative_similarity"]].describe())


if __name__ == "__main__":
    main()
