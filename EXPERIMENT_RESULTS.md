# Resume Grader Accuracy Experiments

Run on 2026-08-27 with grouped-by-resume train/validation/test splits. Model selection used only the validation split; the test split was evaluated once after choices were frozen.

The production-parity path chunks resumes at about 1,100 characters, prompts each resume chunk, caps jobs at 1,200 characters, truncates at 256 tokens, normalizes embeddings, and averages normalized resume chunk embeddings. The primary dataset is `hf`; NeuralFrame is retained as a secondary out-of-domain check.

## Result

Two configurations are worth keeping:

- Maximum accuracy: `BAAI/bge-small-en-v1.5`, trained with CoSENT, HF weighted 3:1 over NeuralFrame, no Matryoshka, 3 epochs, learning rate `3e-5`, batch size 64. Its int8 ONNX file is 34.0 MB.
- Smaller deployment: the existing `MongoDB/mdbr-leaf-mt` architecture with the same recipe at batch size 128. Its int8 ONNX file is 23.0 MB.

Locked HF test results using production mean-vector inference:

| Model | Spearman | NDCG@10 | Top-1 best | NeuralFrame Spearman |
|---|---:|---:|---:|---:|
| Current shipped fine-tune | 0.5154 | 0.7868 | 58.7% | 0.5928 |
| Weighted `mdbr-leaf-mt` | 0.6334 | 0.8465 | 69.6% | 0.5695 |
| Weighted BGE, FP32 | 0.6640 | 0.8452 | 67.4% | 0.6149 |
| Weighted BGE, int8 ONNX | **0.6655** | **0.8476** | 67.4% | **0.6111** |

The BGE int8 model is the best overall accuracy/robustness result. The weighted `mdbr-leaf-mt` model is a strong alternative when minimizing download size matters.

## OpenAI-labeled NUWorks follow-up

An additional 2,772 NUWorks pairs were labeled by `gpt-5.6-terra`: 11
category-diverse resumes, each scored against 252 unique job descriptions.
`prepare_openai_labels.py` split them by resume identity into 7 train, 2
validation, and 2 test resumes (1,764 / 504 / 504 pairs). No resume text crosses
a split boundary.

Fine-tuning the shipped BGE model on only the OpenAI labels produced excellent
NUWorks ranking but caused catastrophic forgetting: HF test Spearman fell from
0.6640 to 0.5544. The selected model therefore uses two stages:

1. Three epochs on the OpenAI training split with resume-grouped batches,
   CoSENT, batch size 64, and learning rate `3e-5`.
2. One replay epoch on the original HF 3:1 over NeuralFrame mixture with
   no-duplicate batches and learning rate `1e-5`.

Production-parity int8 ONNX test results:

| Model | NUWorks Spearman | NUWorks NDCG@10 | HF Spearman | HF NDCG@10 | HF Top-1 | NeuralFrame Spearman |
|---|---:|---:|---:|---:|---:|---:|
| Current BGE int8 | 0.3710 | 0.5942 | 0.6655 | 0.8476 | 67.4% | 0.6111 |
| OpenAI + replay BGE int8 | **0.7760** | **0.7820** | **0.6670** | **0.8559** | 67.4% | **0.6221** |

The candidate is worth updating: it more than doubles NUWorks held-out
correlation without regressing the existing tests, and its quantized ONNX file
remains 34.0 MB. NUWorks Top-1 stayed 0/2 resumes for both models, so that metric
is too coarsely sampled to support a claim; NDCG and correlation are the useful
signals until more distinct resumes are labeled.

Artifacts:

- PyTorch candidate: `models/experiments/openai_bge_replay`
- Deployment export: `models/experiments/openai_bge_replay_onnx`
- Benchmark JSON: `models/experiments/results/openai_bge_replay_q8_test.json`

## Validation ablations

All rows below use the production mean-vector path unless named otherwise.

| Experiment | HF Spearman | HF NDCG@10 | HF Top-1 | NeuralFrame Spearman |
|---|---:|---:|---:|---:|
| Current fine-tune | 0.3729 | 0.7742 | 65.1% | 0.5873 |
| Combined, no Matryoshka | 0.3937 | 0.7732 | 62.8% | 0.5892 |
| HF only | 0.3783 | 0.7499 | 51.2% | 0.4336 |
| HF 3:1, no-duplicates, CoSENT, `3e-5` | 0.4673 | 0.8176 | 69.8% | 0.5377 |
| HF 3:1, random sampler | **0.4799** | 0.8002 | 62.8% | 0.5975 |
| HF 3:1, resume-grouped sampler | 0.4551 | 0.7947 | 62.8% | 0.5883 |
| HF 3:1, AnglE loss | 0.3427 | 0.7329 | 48.8% | 0.5002 |
| HF 3:1, CoSENT, `1e-5` | 0.3981 | 0.7675 | 62.8% | 0.5485 |
| HF 3:1, CoSENT, `2e-5` | 0.4548 | 0.8014 | 65.1% | 0.5343 |
| Gold hard-negative refinement | 0.4400 | 0.7936 | 62.8% | 0.5456 |
| `mxbai-rerank-base-v1` teacher refinement | 0.4378 | 0.7925 | 62.8% | 0.5463 |
| Best recipe, seed 7 | 0.4661 | **0.8208** | 72.1% | 0.5693 |
| Best recipe, seed 1337 | 0.4610 | 0.8177 | **74.4%** | 0.5507 |
| Larger BGE base | 0.4737 | 0.8109 | 65.1% | 0.5907 |
| Weighted `mdbr-leaf-mt`, int8 ONNX | 0.4631 | 0.8203 | 72.1% | 0.5192 |

The three best-recipe seeds span only 0.4610-0.4673 Spearman and 0.8176-0.8208 NDCG, so the weighting gain is reproducible. Epoch 3 beat epochs 1 and 2 on the selected model, validating checkpoint selection by ranking metrics rather than loss.

## Inference and scoring experiments

On the weighted `mdbr-leaf-mt` validation model:

| Strategy | Spearman | NDCG@10 | Top-1 |
|---|---:|---:|---:|
| Production resume mean + first job section | **0.4673** | 0.8176 | 69.8% |
| Resume max chunk | 0.4671 | **0.8295** | **72.1%** |
| Resume top-2 chunks | 0.4560 | 0.8118 | 67.4% |
| Job head + tail | 0.4168 | 0.8015 | 67.4% |
| Mean resume + max job chunk | 0.3871 | 0.7731 | 60.5% |
| Max across resume/job chunks | 0.3709 | 0.7740 | 65.1% |

Max-chunk resume scoring did not reproduce consistently across seeds or on the locked test set, so mean-vector inference remains the safer default. Job chunking should not be adopted.

The existing keyword blend is actively harmful:

| HF test scoring | Spearman | NDCG@10 | Top-1 |
|---|---:|---:|---:|
| Lexical only | 0.2171 | 0.6525 | 37.0% |
| Weighted `mdbr-leaf-mt` semantic only | **0.6334** | **0.8465** | **69.6%** |
| Current 65% lexical / 35% semantic | 0.4326 | 0.7490 | 54.4% |
| BGE semantic only | **0.6640** | **0.8452** | **67.4%** |
| Current blend/calibration applied to BGE | 0.2331 | 0.6702 | 45.7% |

Use raw semantic similarity for ordering. Keep lexical matching for explanations (matched/missing skills), not for the ranking score. For displayed 0-100 values, the existing `0.80-0.97` calibration remains reasonable for `mdbr-leaf-mt`, but it is invalid for BGE. BGE requires a new calibration; validation-fitted affine parameters were slope `1.9227`, intercept `-0.9569`, and preserved ranking on test, while isotonic calibration slightly improved score MAE but introduced ranking ties.

## What did not help

- Removing NeuralFrame entirely lost useful generalization; weighting HF more heavily was better.
- Resume-grouped batching, AnglE, hard-negative refinement, and cross-encoder distillation all regressed.
- Lower learning rates underfit in three epochs.
- Job head/tail and multi-chunk aggregation regressed.
- Validation-fitted isotonic calibration overfit ranking; calibration should affect display only.

Collecting real labeled NUWorks outcomes remains the highest-value unrun recommendation because those labels do not exist in this repository. The next data experiment should log user corrections or application outcomes and evaluate them as a separate, never-trained-on production test set.

## Reproduction

Key scripts added or extended by this experiment:

- `evaluate_production.py`: production-parity Torch/ONNX evaluation and per-resume ranking metrics.
- `train.py`: dataset weighting, sampler, loss, seed, base-model, and Matryoshka ablations.
- `prepare_hard_negatives.py` and `train_triplets.py`: mined negatives and teacher-margin refinement.
- `evaluate_inference_strategies.py`: resume/job aggregation tests.
- `evaluate_blend.py` and `score_lexical.mjs`: calibration and real extension matcher blend tests.
