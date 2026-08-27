#!/usr/bin/env python3
"""Fine-tune MongoDB/mdbr-leaf-mt to grade resumes against job descriptions.

Run prepare_data.py first.  The model is trained asymmetrically, matching how
the extension uses it at inference time: resumes are encoded with the model's
built-in "query" prompt, job descriptions as plain documents.

Losses per dataset:
  - Continuous scores (neuralframe, hf)  -> CoSENTLoss: optimizes the *ranking*
    of cosine similarities to agree with the ranking of match scores, which is
    exactly what a 0-100 grading UI needs.
  - Binary labels (recruitment)          -> OnlineContrastiveLoss: pulls
    matched pairs together, pushes hard non-matches apart.
  Every loss is wrapped in MatryoshkaLoss so embeddings stay accurate when
  truncated below 384 dims.

The base model ends with a Dense(384 -> 1024) projection, but the extension's
Transformers.js runtime never runs it (it exports only the transformer and does
its own mean pooling), so by default that head is dropped and the 384-dim
pooled embedding is what gets fine-tuned. Use --keep-dense to train the full
1024-dim model for server-side / sentence-transformers use instead.

Usage:
    python train.py                          # full run, all prepared datasets
    python train.py --datasets neuralframe   # single dataset
    python train.py --max-samples 200 --epochs 1 --batch-size 8   # smoke test
"""

import argparse
from collections import defaultdict, deque
import glob
import math
import os

import torch
from datasets import Dataset
from sentence_transformers import (
    SentenceTransformer,
    SentenceTransformerTrainer,
    SentenceTransformerTrainingArguments,
)
from sentence_transformers.losses import AnglELoss, CoSENTLoss, MatryoshkaLoss, OnlineContrastiveLoss
from sentence_transformers.sampler import DefaultBatchSampler
from sentence_transformers.training_args import BatchSamplers

BASE_MODEL = "MongoDB/mdbr-leaf-mt"
BINARY_DATASETS = {"recruitment"}
FALLBACK_QUERY_PROMPT = "Represent this sentence for searching relevant passages: "


class ResumeGroupedBatchSampler(DefaultBatchSampler):
    """Keep several jobs for the same resume in each ranking-loss batch.

    CoSENT/AnglE learn from comparisons *inside* a batch. The default
    NO_DUPLICATES sampler actively separates repeated resume strings, which
    removes the comparisons that most closely match the extension's task:
    ordering jobs for one resume.
    """

    candidates_per_resume = 16

    def __init__(self, dataset, *args, **kwargs):
        super().__init__(dataset, *args, **kwargs)
        self.dataset = dataset
        groups = defaultdict(list)
        for index, resume in enumerate(dataset["resume"]):
            groups[resume].append(index)
        self.groups = list(groups.values())

    def _resume_units(self, generator):
        units = []
        labels = self.dataset["label"] if "label" in self.dataset.column_names else self.dataset["score"]
        max_candidates = min(self.candidates_per_resume, self.batch_size)
        for indices in self.groups:
            # Interleave score levels so every resume-sized unit is useful to
            # a pairwise ranking loss instead of containing one score only.
            by_label = defaultdict(list)
            for index in indices:
                by_label[float(labels[index])].append(index)
            queues = []
            for label in sorted(by_label):
                bucket = by_label[label]
                order = torch.randperm(len(bucket), generator=generator).tolist()
                queues.append(deque(bucket[i] for i in order))
            ordered = []
            while queues:
                for queue in list(queues):
                    ordered.append(queue.popleft())
                    if not queue:
                        queues.remove(queue)
            units.extend(ordered[start:start + max_candidates] for start in range(0, len(ordered), max_candidates))
        return units

    def __iter__(self):
        generator = torch.Generator()
        generator.manual_seed(self.seed + self.epoch)
        units = self._resume_units(generator)
        order = torch.randperm(len(units), generator=generator).tolist()
        batch = []
        for unit_index in order:
            unit = units[unit_index]
            if batch and len(batch) + len(unit) > self.batch_size:
                if not self.drop_last or len(batch) == self.batch_size:
                    yield batch
                batch = []
            batch.extend(unit)
        if batch and not self.drop_last:
            yield batch

    def __len__(self):
        # Resume units are at most 16 rows, so packing waste is small. Keeping
        # this estimate near the ordinary batch count also keeps warmup sane.
        return math.ceil(len(self.dataset) / self.batch_size)


def embedding_dim(model):
    # Renamed in sentence-transformers 6.x; support both.
    fn = getattr(model, "get_embedding_dimension", None) or model.get_sentence_embedding_dimension
    return fn()


def load_split(data_dir, name, split, max_samples=None):
    path = os.path.join(data_dir, f"{name}_{split}.csv")
    if not os.path.exists(path):
        return None
    ds = Dataset.from_csv(path)
    if name in BINARY_DATASETS:
        ds = ds.rename_column("score", "label")
        ds = ds.map(lambda r: {"label": int(r["label"])})
    if max_samples:
        ds = ds.select(range(min(max_samples, len(ds))))
    return ds


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--data-dir", default=os.path.join(os.path.dirname(__file__) or ".", "data"))
    ap.add_argument("--output", default=os.path.join(os.path.dirname(__file__) or ".", "models", "mdbr-leaf-mt-resume-grader"))
    ap.add_argument("--base-model", default=BASE_MODEL)
    ap.add_argument("--datasets", nargs="*", default=None,
                    help="dataset names to train on (default: every *_train.csv in data dir)")
    ap.add_argument("--epochs", type=int, default=2)
    ap.add_argument("--batch-size", type=int, default=32)
    ap.add_argument("--lr", type=float, default=2e-5)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--loss", choices=("cosent", "angle"), default="cosent")
    ap.add_argument("--batch-sampler", choices=("no_duplicates", "random", "grouped"), default="no_duplicates")
    ap.add_argument("--dataset-weights", default="",
                    help="comma-separated dataset multipliers, e.g. hf=3,neuralframe=1")
    ap.add_argument("--save-total-limit", type=int, default=3)
    ap.add_argument("--trainer-eval", action="store_true",
                    help="also compute loss on validation data each epoch (ranking selection uses evaluate_production.py)")
    ap.add_argument("--dataloader-workers", type=int, default=0)
    ap.add_argument("--max-samples", type=int, default=None, help="cap per-dataset rows (smoke tests)")
    ap.add_argument("--matryoshka-dims", default="384,256,192",
                    help="comma-separated dims to preserve under truncation; empty to disable")
    ap.add_argument("--max-seq-length", type=int, default=256,
                    help="token cap during training; 256 mirrors the extension's runtime "
                         "caps (jobs ~250 tokens, resumes chunked) and is ~4x faster than "
                         "the full 512 window. Set 512 to train on full-length texts.")
    ap.add_argument("--keep-dense", action="store_true",
                    help="keep the 384->1024 Dense projection head (dropped by default, "
                         "because the extension's Transformers.js runtime only runs the "
                         "transformer + mean pooling and never applies the Dense layer)")
    args = ap.parse_args()

    names = args.datasets or sorted(
        os.path.basename(p)[:-len("_train.csv")]
        for p in glob.glob(os.path.join(args.data_dir, "*_train.csv"))
    )
    if not names:
        raise SystemExit(f"No *_train.csv files in {args.data_dir} — run prepare_data.py first.")
    print(f"Training on: {', '.join(names)}")

    use_cuda = torch.cuda.is_available()
    bf16 = use_cuda and torch.cuda.is_bf16_supported()
    if use_cuda:
        # TF32 matmuls are a free speedup on Ampere+ (incl. RTX 50-series).
        torch.backends.cuda.matmul.allow_tf32 = True
        torch.backends.cudnn.allow_tf32 = True
        print(f"CUDA: {torch.cuda.get_device_name(0)} ({'bf16' if bf16 else 'fp16'} mixed precision)")

    model = SentenceTransformer(args.base_model)
    model.max_seq_length = args.max_seq_length
    if not args.keep_dense and len(model) > 2:
        # The base model is transformer -> mean pooling -> Dense(384->1024).
        # Transformers.js (the extension runtime) only runs the exported
        # transformer plus its own mean pooling, so we drop the Dense head and
        # fine-tune the exact 384-dim embedding the extension will compute.
        del model[2]
        print(f"Dropped Dense projection head; embedding dim = {embedding_dim(model)}")
    query_prompt = model.prompts.get("query", FALLBACK_QUERY_PROMPT)
    print(f"Query prompt for resumes: {query_prompt!r}")

    requested_weights = {}
    if args.dataset_weights:
        for item in args.dataset_weights.split(","):
            name, value = item.split("=", 1)
            requested_weights[name.strip()] = int(value)

    train_ds, eval_ds, losses = {}, {}, {}
    dims = [int(d) for d in args.matryoshka_dims.split(",") if d.strip()]
    max_dim = embedding_dim(model)
    if any(d > max_dim for d in dims) or (args.keep_dense and dims):
        # MatryoshkaLoss can't span the Dense head (token embeddings are 384
        # wide while the projected sentence embedding is 1024), so disable it
        # rather than train a mismatched truncation scheme.
        print("Disabling MatryoshkaLoss (incompatible with the Dense projection head).")
        dims = []
    for name in names:
        source_train = load_split(args.data_dir, name, "train", args.max_samples)
        val = load_split(args.data_dir, name, "val", args.max_samples)
        if val is not None:
            eval_ds[name] = val
        if name in BINARY_DATASETS:
            loss = OnlineContrastiveLoss(model)
        else:
            loss = AnglELoss(model) if args.loss == "angle" else CoSENTLoss(model)
        loss = MatryoshkaLoss(model, loss, matryoshka_dims=dims) if dims else loss
        # Eval datasets retain their original names even when the training set
        # is represented by weighted aliases.
        losses[name] = loss
        weight = requested_weights.get(name, 1)
        if weight < 0:
            raise SystemExit(f"Dataset weight for {name!r} must be non-negative")
        # Separate aliases weight the multi-dataset batch schedule without
        # placing duplicated rows together in one batch.
        for repetition in range(weight):
            key = name if weight == 1 else f"{name}__repeat_{repetition + 1}"
            train_ds[key] = source_train
            losses[key] = loss

    sampler = {
        "no_duplicates": BatchSamplers.NO_DUPLICATES,
        "random": BatchSamplers.BATCH_SAMPLER,
        "grouped": ResumeGroupedBatchSampler,
    }[args.batch_sampler]

    train_args = SentenceTransformerTrainingArguments(
        output_dir=os.path.join(args.output, "checkpoints"),
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size,
        learning_rate=args.lr,
        warmup_ratio=0.1,
        fp16=use_cuda and not bf16,
        bf16=bf16,
        dataloader_num_workers=args.dataloader_workers if use_cuda else 0,
        dataloader_persistent_workers=bool(use_cuda and args.dataloader_workers),
        batch_sampler=sampler,
        eval_strategy="epoch" if eval_ds and args.trainer_eval else "no",
        save_strategy="epoch",
        save_total_limit=args.save_total_limit,
        # With several eval datasets the trainer logs eval_<name>_loss instead of
        # a combined eval_loss, so best-model tracking only works with one.
        load_best_model_at_end=len(eval_ds) == 1 and args.trainer_eval,
        metric_for_best_model="eval_loss" if len(eval_ds) == 1 and args.trainer_eval else None,
        logging_steps=25,
        seed=args.seed,
        # Resumes are queries, job descriptions are documents — same asymmetry
        # the extension applies at inference time.
        prompts={"resume": query_prompt},
    )

    trainer = SentenceTransformerTrainer(
        model=model,
        args=train_args,
        train_dataset=train_ds,
        eval_dataset=eval_ds or None,
        loss=losses,
    )
    trainer.train()

    model.save_pretrained(args.output)
    print(f"\nSaved fine-tuned model to {args.output}")
    print("Next: python evaluate.py --model", args.output)


if __name__ == "__main__":
    main()
