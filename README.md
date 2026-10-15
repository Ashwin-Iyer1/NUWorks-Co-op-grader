# Major-agnostic resume–job matching

The `finetune` branch trains and evaluates compact embedding models for matching
resumes to jobs. The current workflow expands coverage across academic majors and
career stages, obtains separate OpenAI match labels, and compares candidates
against a preserved production baseline. Academic major and student year are
sampling metadata; demonstrated skills and explicit job requirements determine
fit. New data or a completed training run alone is not evidence of improvement.

The October 15 run is complete: selected checkpoint `b_epoch2` improves held-out
JavaScript semantic ranking on all four benchmarks, including diverse mean-resume
Spearman 0.4221 → 0.7682. Local inference packages are in
`models/major_agnostic/selected_model` and `models/major_agnostic/selected_onnx`.
The candidate display calibration regresses on the two legacy OpenAI test resumes
and remains experimental. See the [results and limitations](reports/major_agnostic_20261015/RESULTS.md).

## Current corpus and evaluation boundaries

`prepare_diverse_resumes.py` reproducibly creates **864 fictional resumes**:
24 majors × 6 scenario families × 6 stages (`first_year`, `sophomore`, `junior`,
`senior`, `masters`, and `career_changer`). These are **144 distinct scenario
families**, with correlated career-stage variants inside each family. All variants
remain together: 576 documents train, 144 validation, and 144 test.
Each validation/test major has one held-out scenario family with six correlated
documents. Per-major results are therefore exploratory, not reliable estimates
for the population of students in that major.

- 264 documents describe skills and projects outside their primary academic major;
  `skill_domain` preserves that distinction. Nursing and Education stay within
  their academic pathways.
- 36 first-year documents include substantive prior mentored projects, while
  36 senior documents have coursework but no placement. Year alone therefore
  cannot determine the amount of demonstrated experience.
- `build_diverse_jobs.py` creates 144 independently authored job scenarios across
  the same domains: 96 train, 24 validation, and 24 test. Job and resume scenario
  families are disjoint across splits. Most jobs accept equivalent evidence from
  different majors; required nursing or teaching credentials are explicit.
- University catalogs informed coverage only. The source audit in
  [references/major_agnostic_sources.json](references/major_agnostic_sources.json)
  records URLs and reuse constraints. No university resume bodies were copied
  into the corpus, and these fictional documents are not real applicants or
  real vacancies.

The frozen pair plan contains 9,216 pairs: 4,608 train, 2,304 validation, and
2,304 test. Each training resume has 8 candidate jobs; each evaluation resume has
16. Sampling combines relevant domain/lexical candidates with random alternatives.
Lexical similarity chooses candidates; it does **not** supply match labels.
Evaluate the synthetic corpus separately from the existing real-source holdouts.

## Generate and label the diverse corpus

Run from the repository root on `finetune`, using the configured Python environment.
Install Python dependencies with `pip install -r requirements.txt` (install the
appropriate CUDA-enabled PyTorch build first when using an NVIDIA GPU). Run
`npm ci` to install the pinned Transformers.js runtime before JavaScript evaluation.
The corpus generators make no API calls. Generated data, labels, local model
weights, and `.env` remain ignored by Git; the scripts and source audit are tracked.

```powershell
python prepare_diverse_resumes.py
python build_diverse_jobs.py
python prepare_major_agnostic_pairs.py
Get-Content data/major_agnostic/plan/pair_plan.json

# Review this free dry run before executing the same configuration.
$labelArgs = @(
  '--resume-csv', 'data/major_agnostic/resumes.csv',
  '--jobs-json', 'data/major_agnostic/jobs.json',
  '--selection', 'all',
  '--pairs-jsonl', 'data/major_agnostic/plan/pairs.jsonl',
  '--out-dir', 'openai_labels/major_agnostic',
  '--model', 'gpt-5.6-luna',
  '--workers', '80', '--max-output-tokens', '1200',
  '--token-budget', '25000000', '--budget-scope', 'output',
  '--max-cost-usd', '8.5'
)
python generate_openai_labels.py @labelArgs
Get-Content openai_labels/major_agnostic/plan.json

# OPENAI_API_KEY must already be available locally; never put it in the command.
python generate_openai_labels.py @labelArgs --execute
```

The **$8.50 main-label cap is cumulative for that output directory** and reserves
paid cost without assuming free credits. The separate teacher audit is capped at
**$1.40**, making the combined allowance **$9.90**. There is no automatic
cross-directory account-wide cap: keep these allocations and include any other
runs in the same total. Reuse the exact output directories when resuming. Do not
delete their request records or start a new directory to reset a cap. A token
budget is an additional scheduling limit, not a dollar allowance.

Successful compatible requests are checkpointed and skipped on resume. Model,
rubric, content, and response-configuration fingerprints prevent stale labels
from silently entering a new run; earlier requests still count toward spending.
Unknown-usage failures retain conservative reservations. Re-run the same command
if scheduling stops before every pair is complete, while preserving the cap.
Keep the frozen corpus and pair manifests unchanged after labeling starts.

The separately frozen `teacher_audit_pairs.jsonl` contains a sample selected for a
second teacher review. It is an audit input, not produced by the corpus generator;
preserve its selection and provenance when reproducing this run. An equivalent
audit invocation is:

```powershell
python generate_openai_labels.py `
  --resume-csv data/major_agnostic/resumes.csv `
  --jobs-json data/major_agnostic/jobs.json --selection all `
  --pairs-jsonl data/major_agnostic/plan/teacher_audit_pairs.jsonl `
  --out-dir openai_labels/major_agnostic_teacher_audit `
  --model gpt-5.6-terra --input-price-per-million 2.5 --output-price-per-million 12 `
  --workers 8 --max-output-tokens 1200 --token-budget 200000 `
  --budget-scope output --max-cost-usd 1.4
# Add --execute only for the planned audit; preserve this directory on retries.
```

The explicit price bounds are part of this run's cost accounting. Verify bounds
before using another model or reproducing the run under different pricing.
Teacher agreement is a label-quality diagnostic, not independent human ground
truth. Do not blend audit labels into held-out targets while comparing candidates.

Export training splits only after the main labeling manifest is complete:

```powershell
python prepare_major_agnostic_pairs.py `
  --labels openai_labels/major_agnostic/train.csv --output data
```

This writes `data/diverse_{train,val,test}.csv` plus metadata and a split manifest.
The exporter rejects incomplete plans, unexpected pairs, changed text, and invalid
scores before writing trainer-visible splits.

## Train, select on validation, then finalize once

The experiment helper makes no API calls. It expects the existing `openai`, `hf`,
and `neuralframe` splits, the new `diverse` splits, and two local model snapshots:
`models/production_baseline` and the mean-pooling starting model
`models/major_agnostic/mean_replay`. These local snapshots are not downloaded by
the helper; supply `--baseline-model` and `--base-model` for other prepared paths.

```powershell
# Print the two fixed training configurations without running them.
python run_major_agnostic_experiments.py

# Train and compare both epoch checkpoints, the starting model, and baseline.
python run_major_agnostic_experiments.py --execute
Get-Content models/major_agnostic/experiments/selection.json

# After validation selection, use exactly its selected_id.
$selection = Get-Content models/major_agnostic/experiments/selection.json -Raw | ConvertFrom-Json
python run_major_agnostic_experiments.py --finalize $selection.selected_id
```

Optional `--baseline-results PATH` and `--base-results PATH` reuse compatible
validation JSON results; missing datasets are evaluated separately. Keep the same
options and run directory when resuming or finalizing. Reused files are hashed,
but historical result files may lack hashes of their original evaluated data.

Selection uses the mean of diverse per-resume ranking correlation, HF correlation,
and legacy OpenAI correlation, with fixed regression limits against baseline.
Test data stays unopened by the experiment helper until `--finalize` freezes and
evaluates only the selected candidate and baseline. Once test evaluation starts,
validation selection in that run directory cannot be reopened. Do not select
epochs, hyperparameters, or a replacement winner from final test results.

### Runtime evaluation

`train.py` and `evaluate_production.py` now default to attention-mask **mean
pooling** and a **blank query prompt**, matching the current BGE extension path.
`--pooling model` and `--use-model-query-prompt` explicitly restore historical
SentenceTransformer behavior for comparisons. The Python evaluator uses a
256-token model limit, approximately 1,100-character resume chunks, and a
1,200-character job cap. It remains a useful training comparison, not a complete
browser-equivalence test.

Historical benchmark results, including the earlier CLS-based evaluations in
[EXPERIMENT_RESULTS.md](EXPERIMENT_RESULTS.md), are not measurements of the actual
browser scoring path. In addition to pooling differences, tokenizer behavior and
dynamic q8 quantization can depend on runtime and batch composition.

`evaluate_transformersjs.py` invokes the actual Transformers.js tokenizer and q8
pipeline through `evaluate_transformersjs.mjs`. It reads text helpers and batching
defaults from the `chrome-extension` Git ref and records the corresponding commit
and source hashes. Resume chunks are encoded together; jobs use per-resume batches
of 16. Synthetic `Position:`/`Description:` label wrappers are removed to match
the extension's title-plus-description input.

```powershell
python export_onnx.py --model PATH_TO_SELECTED_MODEL --out models/major_agnostic/selected_onnx
python evaluate_transformersjs.py `
  --model models/major_agnostic/selected_onnx --split val `
  --datasets diverse openai hf neuralframe `
  --json-out models/major_agnostic/results/selected_transformersjs_val.json
```

Run the same runtime evaluation for the baseline with identical inputs and batch
settings. Use `--split test` only after selection is frozen. This evaluator uses
**Node CPU**, so it does not establish bit-for-bit browser WASM equivalence. The
selected export has passed the frozen JavaScript test comparison. Browser checks
and broader real-resume calibration remain outstanding before production use.
For short-input Python/JavaScript numerical checks, match ONNX Runtime versions:
Node 1.24.3 matched isolated Python 1.24.3, while Python 1.29.0 produced different
quantized outputs with identical inputs and weights. The full diagnosis is saved
with the results; primary ranking evidence uses JavaScript directly.

The final artifact, measurements, and remaining limits for this run are recorded in
[the October 15 evaluation report](reports/major_agnostic_20261015/RESULTS.md).

To make a clean copy of a frozen selected checkpoint before ONNX export, run:

```powershell
python package_model_release.py --selection models/major_agnostic/experiments/selection.json `
  --output models/major_agnostic/selected_model `
  --baseline-hf-revision a77f5eb7d1c206088789eab5a270b9943a59304a
```

This verifies the frozen hashes and copies inference files without optimizer
state or generated training examples. Export from this copy so the original
checkpoint remains unchanged. Existing conflicting output is rejected.

## Historical pipeline and datasets

The original experiments used
[`MongoDB/mdbr-leaf-mt`](https://huggingface.co/MongoDB/mdbr-leaf-mt) and later BGE
variants. The commands and dataset notes below document that earlier workflow;
use the explicit major-agnostic workflow above for the current experiment.

### Datasets (Kaggle, downloaded automatically)

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

- **Runtime-aligned defaults.** Resumes and jobs use bare text with mean pooling.
  Older prompted experiments are reproducible with explicit legacy flags, but
  must not be described as matching the current BGE browser path.
- **CoSENTLoss** for continuously-scored datasets: it optimizes the *ranking* of
  cosine similarities to match the ranking of human match scores — exactly what a
  0–100 grade needs. **OnlineContrastiveLoss** for binary-labeled datasets.
- **Dense head dropped by default.** The base model is transformer → mean pooling →
  Dense(384→1024), but Transformers.js (the extension runtime) only runs the exported
  transformer plus its own mean pooling — the Dense projection never ships. Training
  therefore optimizes a 384-dim embedding with the runtime's pooling choice. Pass
  `--keep-dense` to fine-tune the full 1024-dim model for server-side use instead.
- **MatryoshkaLoss wrapper** keeps embeddings accurate when truncated below 384
  dims, in case the extension ever shrinks vectors further to save memory and
  compute.
- **Grouped splits.** Train/val/test are split by *resume group*, not by row:
  an HF resume (they recur against up to 82 different JDs) appears in exactly one
  split, and Neuralframe resumes — which are recombinations of a small pool of
  template fragments (~171 career objectives, ~340 skill lists) — are grouped by
  union-find over shared fragments first. Held-out metrics therefore measure
  performance on resume content the model has never seen, not memorized templates.

## Usage

```bash
# Run from the root of the finetune branch.
# NVIDIA GPU (RTX 50-series needs the CUDA 12.8 wheels, torch >= 2.7):
pip install torch --index-url https://download.pytorch.org/whl/cu128
# CPU-only fallback:  pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt

python prepare_data.py --include-hf     # → data/*_{train,val,test}.csv
python train.py                         # → models/mdbr-leaf-mt-resume-grader
python evaluate.py --model models/mdbr-leaf-mt-resume-grader
```

### Generate OpenAI-labeled NUWorks pairs

Without the new sparse-pair options, `generate_openai_labels.py` selects up to
11 category-diverse resumes from the configured archive and pairs them with jobs
in `exmaplePayload.json`. The default is a free dry run. Counts depend on local
inputs. Current CLI defaults are a 100-million-token scheduling budget and a
cumulative $10 paid-cost cap per output directory; these are separate limits.
For this major-agnostic experiment, use the stricter explicit allocations above.

```powershell
# Review the selected categories, request count, budget, and cost estimate.
python generate_openai_labels.py
Get-Content openai_labels\plan.json

# A separate historical workflow; any execution needs its own allocated budget.
# Keep OPENAI_API_KEY in the local environment, never in source code or chat.
```

The threaded run checkpoints each response to `openai_labels/pairs.jsonl` and
creates `openai_labels/train.csv`, with a normalized `score` from 0 to 1 for the
existing training pipeline. Re-running the same command skips successful pairs.
Contact details are redacted by default, API response storage is disabled, and
strict JSON output captures both the overall grade and diagnostic sub-scores.

For a low-cost pilot, add `--resume-count 2 --max-jobs 10`. To choose backgrounds
explicitly, use a comma-separated option such as
`--categories ENGINEERING,FINANCE,HEALTHCARE`. Run `python
generate_openai_labels.py --help` for all budget, concurrency, and input options.

To add later NUWorks payloads without relabeling exact duplicates, pass the
original file first and reuse the same output directory:

```powershell
python generate_openai_labels.py `
  --jobs-json exmaplePayload.json more_job_descs.json
python generate_openai_labels.py `
  --jobs-json exmaplePayload.json more_job_descs.json --execute
```

The default `--budget-scope run` applies the token scheduling budget to each
invocation. `--budget-scope output` also includes prior token usage. The dollar
cap always includes prior requests in that output directory, regardless of token
scope. Free-token eligibility and quota resets are account-specific; the planner
does not assume complimentary usage. Preserve the output directory and its
request history when resuming.

Prepare leakage-safe splits before training. The default holds out two entire
resume identities for validation and two for testing, so resume text never
crosses a split boundary:

```bash
python prepare_openai_labels.py
python train.py --data-dir data --datasets openai \
  --base-model models/experiments/e14_bge_small_bs64 \
  --output models/experiments/openai_bge_continued \
  --epochs 3 --batch-size 64 --lr 3e-5 \
  --batch-sampler grouped --matryoshka-dims ""

# Replay the original data at a lower rate to prevent catastrophic forgetting.
python train.py --data-dir data --datasets hf neuralframe \
  --dataset-weights hf=3,neuralframe=1 \
  --base-model models/experiments/openai_bge_continued \
  --output models/experiments/openai_bge_replay \
  --epochs 1 --batch-size 64 --lr 1e-5 \
  --batch-sampler no_duplicates --matryoshka-dims ""

python evaluate_production.py --model models/experiments/openai_bge_replay \
  --datasets openai hf neuralframe --split val
```

GPU detection enables bf16/fp16 mixed precision and TF32 where supported.
Data-loader worker count is controlled separately by `--dataloader-workers`.

### Historical MDBR settings for an RTX 5080 (16 GB)

These settings describe the earlier approximately 23M-parameter MDBR experiments.
The current BGE-small model has approximately 33.4M parameters; its experiment
helper fixes batch size 64 and compares two epochs at each of two learning rates.

```bash
python train.py --epochs 3 --batch-size 128 --lr 3e-5
```

- Earlier MDBR runs at a 256-token cap and batch size 128 used roughly 4–6 GB of
  VRAM. Memory and timing estimates do not transfer unchanged to BGE-small.
- To train on full-length texts instead of the production-matched 256-token cap, use
  `--max-seq-length 512 --batch-size 64`.
- Earlier MDBR runs took roughly 5–10 minutes; current runtime depends on the
  model, dataset weighting, and evaluation work.
- A quick pipeline sanity check first: `python train.py --max-samples 200 --epochs 1
  --batch-size 8`.

#### How many epochs?

The earlier MDBR experiments explored a small number of epochs on roughly 14k
pairs. More epochs can memorize repeated training fragments: Neuralframe has only
28 distinct job positions and template-like text. Treat the following as historical
tuning guidance; the current helper keeps its two-epoch schedule fixed and selects
using explicit validation evaluations:

- Both eval losses still falling after epoch 3 → 4–5 epochs is fine, gains are
  usually marginal.
- `eval_hf_loss` flat or rising while train loss falls → overfitting; drop to
  `--epochs 2`. Weight the HF eval most heavily — it is the only full-length,
  production-realistic text, and a model that aces synthetic Neuralframe pairs but
  degrades on HF will likely also degrade on real NUWorks postings.
- Select epochs on validation with a runtime-aligned evaluator. Keep test sets
  reserved for the selected model's final comparison. The current experiment
  helper evaluates saved epoch checkpoints explicitly.

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
  `--lr 3e-5`), compare validation Spearman, and keep the winner. If
  experimenting with 512, pair it with `--epochs 4` and LR ~4e-5. Maximize the
  validation correlation, not the VRAM meter.

#### Does fine-tuning grow the ONNX download?

Fine-tuning the same architecture changes weight values without adding
parameters. The current BGE-small export is approximately **133 MB fp32** and
**34 MB quantized** (decimal MB). The historical MDBR export was approximately
90 MB fp32 and 23 MB quantized; those sizes do not describe the current BGE model.
A different architecture, quantization configuration, or external-data layout can
change the download size. SentenceTransformer pooling/projection modules are not
part of the transformer-only ONNX graph used by the extension.

`evaluate.py` prints Spearman correlation (grading quality), ROC-AUC (binary), and the
cosine percentiles for both the base and fine-tuned model, so you can verify the
fine-tune actually helps before shipping it.

## Shipping the model into the extension

After model selection is frozen, export the selected checkpoint and generate its
actual-JS **validation** predictions. Keep these artifacts separate from test
predictions:

```powershell
pip install "optimum[onnxruntime]" onnx
python export_onnx.py --model PATH_TO_SELECTED_MODEL --out models/major_agnostic/selected_onnx
python evaluate_transformersjs.py `
  --model models/major_agnostic/selected_onnx --split val `
  --datasets diverse openai `
  --predictions-dir models/major_agnostic/selected_val_predictions `
  --json-out models/major_agnostic/results/selected_calibration_inputs.json
python calibrate_model.py --split val --model-release YOUR_FROZEN_RELEASE_ID `
  --predictions models/major_agnostic/selected_val_predictions/diverse_val_mean_vector.csv `
  --predictions models/major_agnostic/selected_val_predictions/openai_val_mean_vector.csv `
  --output models/major_agnostic/selected_onnx/calibration.json
```

`calibrate_model.py` selects a monotone display mapping by leaving whole resume
families out of calibration cross-validation. Each resume receives equal total
weight. It fits the final curve using validation labels only and records source
hashes, source weights, and limitations. Do not fit on test labels or reuse an old
model's cosine-to-grade bounds. Raw cosine remains the ranking score; rounded
display grades can tie.
With the current 144 synthetic and two legacy OpenAI validation resumes, equal
resume weighting gives the synthetic source about 98.6% of calibration weight.
This calibration therefore needs separate validation on representative real resumes.

Package `calibration.json` beside the exact exported weights, then complete the
frozen test comparison and browser checks before publication. On the
`chrome-extension` branch, model location and bundled fallback calibration live in
`src/semantic-model-version.mjs`: update `SEMANTIC_MODEL_ID` if the repository
changes, keep `DEFAULT_SEMANTIC_CALIBRATION` consistent with the release payload,
and verify revision-pinned downloads and cached/offline behavior. Uploading model
weights alone does not update an installed extension or verify its scoring flow.

## Caveats

- The two Kaggle datasets are largely synthetic with template-like text; the HF
  dataset is the most production-realistic. Treat held-out Spearman on the HF split
  as the primary quality signal.
- The Neuralframe source is listed as CC BY-NC 4.0. Review source terms before
  redistributing training data or model artifacts; repository licensing does not
  replace the source dataset's conditions.
- The historical datasets have limited explicit seniority and qualification
  coverage. The new corpus adds stage variation and required-credential examples,
  but those additions still require separate quality checks; embedding similarity
  alone is not proof that every eligibility condition is satisfied.
