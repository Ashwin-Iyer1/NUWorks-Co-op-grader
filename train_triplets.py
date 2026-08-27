#!/usr/bin/env python3
"""Refine a resume/job bi-encoder with MarginMSE hard-negative triplets."""

import argparse
import os

import torch
from datasets import Dataset
from sentence_transformers import SentenceTransformer, SentenceTransformerTrainer, SentenceTransformerTrainingArguments
from sentence_transformers.losses import MarginMSELoss
from sentence_transformers.training_args import BatchSamplers

FALLBACK_QUERY_PROMPT = "Represent this sentence for searching relevant passages: "


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-model", required=True)
    parser.add_argument("--triplets", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--epochs", type=int, default=1)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--lr", type=float, default=1e-5)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    model = SentenceTransformer(args.base_model)
    model.max_seq_length = 256
    if len(model) > 2:
        del model[2]
    prompt = model.prompts.get("query", FALLBACK_QUERY_PROMPT)
    dataset = Dataset.from_csv(args.triplets)
    keep = ["query", "positive", "negative", "label"]
    dataset = dataset.remove_columns([column for column in dataset.column_names if column not in keep])

    use_cuda = torch.cuda.is_available()
    bf16 = use_cuda and torch.cuda.is_bf16_supported()
    training_args = SentenceTransformerTrainingArguments(
        output_dir=os.path.join(args.output, "checkpoints"),
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        learning_rate=args.lr,
        warmup_ratio=0.1,
        fp16=use_cuda and not bf16,
        bf16=bf16,
        batch_sampler=BatchSamplers.BATCH_SAMPLER,
        save_strategy="epoch",
        save_total_limit=args.epochs,
        logging_steps=10,
        seed=args.seed,
        prompts={"query": prompt},
    )
    trainer = SentenceTransformerTrainer(
        model=model,
        args=training_args,
        train_dataset=dataset,
        loss=MarginMSELoss(model),
    )
    trainer.train()
    model.save_pretrained(args.output)
    print(f"Saved refined model to {args.output}")


if __name__ == "__main__":
    main()
