# Fine-tuning `MongoDB/mdbr-leaf-mt` for resume ⇄ job-description grading

This directory contains a complete pipeline to fine-tune
[`MongoDB/mdbr-leaf-mt`](https://huggingface.co/MongoDB/mdbr-leaf-mt) (23M params,
384-dim, Apache-2.0) so that the cosine similarity between a resume embedding and a
job-description embedding becomes a better *match grade* than the off-the-shelf model
produces. The extension currently ships the sibling retrieval model `mdbr-leaf-ir`;
`mdbr-leaf-mt` is the variant MongoDB recommends for semantic-similarity tasks, and
fine-tuning it on labeled resume/JD pairs specializes it for exactly this domain.

## Datasets (Kaggle, downloaded automatically)

`prepare_data.py` downloads these anonymously via `kagglehub` — no Kaggle account needed:

| Dataset | Pairs | Label | Notes |
|---|---|---|---|
| [Resume Dataset (Neuralframe AI)](https://www.kaggle.com/datasets/saugataroyarghya/resume-dataset) | ~9.5k | continuous `matched_score` ∈ [0, 0.97] | Structured resumes (objective, skills, education, experience, certifications) paired with job requirements. **CC BY-NC 4.0** — fine for this non-commercial project, no resale. |
| [resume-job-description-fit](https://huggingface.co/datasets/cnamuangtoun/resume-job-description-fit) (HuggingFace, opt-in via `--include-hf`) | 6.2k | No Fit / Potential Fit / Good Fit → 0 / 0.5 / 1 | The only source with *full-length* real resume and JD texts — closest to what the extension sees in production. Recommended. |
| [Recruitment Dataset](https://www.kaggle.com/datasets/surendra365/recruitement-dataset) (opt-in via `--include-recruitment`) | 10k | binary `Best Match` | **Off by default — the label turned out to be noise.** Every role has ≈48 % positives independent of resume content (keyword-bearing resumes are labeled 1 at the same rate as others), and the base model scores ROC-AUC ≈ 0.52 ≈ random on it. Demographic columns (name, age, gender, race) are dropped during prep. ODbL license. |

Datasets that were evaluated and rejected outright: *Jobsphere ATS Resume Scoring*
(only .docx resume templates, no labeled pairs), *AI-Powered Resume Screening 2025*
(tabular features, no JD text), and two others that have been deleted from Kaggle
(`shamimhasan8/resume-vs-job-description-matching-dataset`,
`shreya2k3/resume-job-description-matching` both 404).

## Method

- **Asymmetric encoding, matching production.** Resumes are encoded with the model's
  built-in `"query"` prompt; job descriptions as plain documents — the same asymmetry
  `src/embeddings.js` uses at inference time. The trainer bakes this in via the
  `prompts` argument.
- **CoSENTLoss** for continuously-scored datasets: it optimizes the *ranking* of
  cosine similarities to match the ranking of human match scores — exactly what a
  0–100 grade needs. **OnlineContrastiveLoss** for binary-labeled datasets.
- **Dense head dropped by default.** The base model is transformer → mean pooling →
  Dense(384→1024), but Transformers.js (the extension runtime) only runs the exported
  transformer plus its own mean pooling — the Dense projection never ships. Training
  therefore optimizes the exact 384-dim embedding the extension computes. Pass
  `--keep-dense` to fine-tune the full 1024-dim model for server-side use instead.
- **MatryoshkaLoss wrapper** keeps embeddings accurate when truncated below 384
  dims, in case the extension ever shrinks vectors further to save memory and
  compute.

## Usage

```bash
cd finetune
# NVIDIA GPU (RTX 50-series needs the CUDA 12.8 wheels, torch >= 2.7):
pip install torch --index-url https://download.pytorch.org/whl/cu128
# CPU-only fallback:  pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt

python prepare_data.py --include-hf     # → data/*_{train,val,test}.csv
python train.py                         # → models/mdbr-leaf-mt-resume-grader
python evaluate.py --model models/mdbr-leaf-mt-resume-grader
```

GPU is auto-detected: bf16 mixed precision, TF32 matmuls, and dataloader workers
switch on automatically when CUDA is available — no flags needed.

### Recommended parameters for an RTX 5080 (16 GB)

```bash
python train.py --epochs 3 --batch-size 128 --lr 3e-5
```

- The model is only 23M params, so at the default 256-token cap a batch of 128 uses
  roughly 4–6 GB of VRAM — nowhere near the 16 GB ceiling.
- To train on full-length texts instead of the production-matched 256-token cap, use
  `--max-seq-length 512 --batch-size 64`.
- Expect the whole run to take ~5–10 minutes.
- A quick pipeline sanity check first: `python train.py --max-samples 200 --epochs 1
  --batch-size 8`.

#### How many epochs?

3 epochs is plenty for ~14k pairs on a 23M-param model; 1–4 is the standard range
for contrastive/CoSENT fine-tuning, and the failure mode past that is memorizing
the training pairs (the Neuralframe set has only 28 distinct job positions and
template-like text, so there is real repetition to latch onto). Trust the
per-epoch `eval_*_loss` values over the epoch count:

- Both eval losses still falling after epoch 3 → 4–5 epochs is fine, gains are
  usually marginal.
- `eval_hf_loss` flat or rising while train loss falls → overfitting; drop to
  `--epochs 2`. Weight the HF eval most heavily — it is the only full-length,
  production-realistic text, and a model that aces synthetic Neuralframe pairs but
  degrades on HF will likely also degrade on real NUWorks postings.
- The final arbiter is `evaluate.py`: if held-out Spearman beats the base model on
  both test sets, the tune is good regardless of epoch count. When training on a
  single dataset, the best epoch's checkpoint is kept automatically.

#### Batch size vs. VRAM

Don't max out batch size just to fill VRAM — batch size changes what the model
learns, not just throughput, and past ~256 the trade turns against you:

- **Bigger helps at first.** CoSENT and the contrastive loss compare pairs *within*
  a batch, so 32 → 128 genuinely strengthens the training signal.
- **You run out of steps, not memory.** At batch 128, ~14k pairs give ~110 optimizer
  steps per epoch; at 512 only ~27 (~80 updates across a whole 3-epoch run). Small
  models fine-tune by taking many small steps; starving the run of updates
  undertrains it, and compensating with a higher LR gets unstable at this size.
- **The time saving is trivial** (a 5–10 minute run becoming 3–4), and large batches
  often shift the bottleneck to CPU-side tokenization anyway, so wall-clock barely
  moves while GPU occupancy climbs.
- **What to actually do:** run `--batch-size 128` and `--batch-size 256` (same
  `--lr 3e-5`), compare held-out Spearman from `evaluate.py`, keep the winner. If
  experimenting with 512, pair it with `--epochs 4` and LR ~4e-5. Maximize the
  test-set correlation, not the VRAM meter.

#### Does fine-tuning grow the ONNX download?

No. Fine-tuning changes weight *values*, not the parameter count or architecture,
so the export stays the same size: ~90 MB fp32 and ~23 MB int8-quantized — identical
to what users download today. Dropping the Dense head changes nothing either; it was
never part of the exported transformer ONNX. Only structural choices (quantization
level, a different base model) move the size.

`evaluate.py` prints Spearman correlation (grading quality), ROC-AUC (binary), and the
cosine percentiles for both the base and fine-tuned model, so you can verify the
fine-tune actually helps before shipping it.

## Shipping the model into the extension

1. Export to ONNX for Transformers.js:
   ```bash
   pip install "optimum[onnxruntime]" onnx
   python export_onnx.py --model models/mdbr-leaf-mt-resume-grader --out models/resume-grader-onnx
   ```
2. Upload the output folder to a HuggingFace model repo (e.g. `you/mdbr-leaf-mt-resume-grader`).
3. Point `MODEL_ID` in `src/embeddings-worker.js` at the new repo.
4. Recalibrate: fine-tuning changes the cosine distribution, so re-run
   `node benchmark-semantic.mjs` and refit the calibration bounds in
   `src/embeddings.js` (the ≈0.07 → 0, ≈0.36 → 100 mapping documented in the README).

## Caveats

- The two Kaggle datasets are largely synthetic with template-like text; the HF
  dataset is the most production-realistic. Treat held-out Spearman on the HF split
  as the primary quality signal.
- The Neuralframe dataset is CC BY-NC 4.0 (non-commercial); a model fine-tuned on it
  inherits that restriction in spirit — fine for this AGPL student project.
- None of these datasets teach seniority/negation understanding ("PhD required");
  the eligibility gate and keyword layer stay authoritative, as documented in the
  main README.
