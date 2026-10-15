---
library_name: sentence-transformers
pipeline_tag: sentence-similarity
base_model: BAAI/bge-small-en-v1.5
language:
- en
tags:
- sentence-transformers
- transformers.js
- feature-extraction
- resume-job-matching
---

# Major-diverse resume–job matcher — October 15, 2026 r2

This is the main release of the selected B-epoch-2 weights, continued from the
August model at `a77f5eb7d1c206088789eab5a270b9943a59304a`.
It improves semantic ranking on the evaluated diverse and real-resume tests.
**Absolute numeric grading is mixed:** the extra real-resume test shows no
improvement in grade error, and legacy-rubric error worsens.
[Full evaluation and reproducible code](https://github.com/Ashwin-Iyer1/NUWorks-Co-op-grader/blob/finetune/reports/major_agnostic_20261015/MAIN_RELEASE.md).

## Inference

The repository includes complete `model.safetensors`, SentenceTransformers
configuration, FP32 `onnx/model.onnx`, 34 MB q8 `onnx/model_quantized.onnx`, and
root `calibration.json`. Use normalized 384-dimensional mean pooling, blank
query prompts and maximum sequence length 256. SentenceTransformers configuration
uses the version 6 format. Tested JavaScript: Transformers.js 4.2.0 / Node ONNX
Runtime 1.24.3 CPU. Pin a commit SHA for reproducibility.

```python
from sentence_transformers import SentenceTransformer

model = SentenceTransformer("turtlecap/mdbr-leaf-mt-resume-grader", revision="main")
model.max_seq_length = 256
vectors = model.encode(["Built a Python and SQL inventory report."],
                       prompt="", normalize_embeddings=True)
```

```javascript
import { pipeline } from '@huggingface/transformers';
const encode = await pipeline('feature-extraction', 'turtlecap/mdbr-leaf-mt-resume-grader', {
  revision: 'main', dtype: 'q8', device: 'cpu'
});
const vector = await encode('Built a Python and SQL inventory report.', {
  pooling: 'mean', normalize: true
});
```

The extension chunks resumes at about 1,100 characters, normalizes each chunk,
averages in Float32 and normalizes again. Jobs use title plus description capped
at 1,200 characters, in ordered batches of 16. Dynamic quantization depends on
runtime version and batch composition. Browser WASM parity is not asserted.

## Evaluation

| Metric | August baseline | r2 |
|---|---:|---:|
| Diverse fictional test: macro Spearman | 0.4221 | 0.7682 |
| Diverse fictional test: NDCG@10 | 0.8644 | 0.9408 |
| Extra real-resume test, current rubric: macro Spearman | 0.6812 | 0.7978 |
| Extra real-resume test, current rubric: NDCG@10 | 0.8370 | 0.8845 |
| Extra real-resume test, current rubric: grade MAE | 13.06 | 13.36 |
| Extra real-resume test, legacy rubric: grade MAE | 12.50 | 13.92 |
| Previously inspected diverse test: grade MAE | 36.01 | 17.69 |
| Previously inspected two-resume OpenAI test: grade MAE | 11.93 | 11.16 |
| Fixed default 65/35 UI blend simulation: grade MAE | 15.38 | 14.01 |

The additional test has 24 real archive resumes / 24 occupational categories
and 40 jobs (960 pairs). Resumes do not overlap any current training, validation
or test set; jobs recur in legacy training. Fresh labels use the current
major-neutral rubric. Weights and calibration were frozen before those labels
were requested. The old labels remain reported; this benchmark was previously
used to report August models. It is not an independent-source or new-job test.

Current-rubric macro Spearman gain has paired resume-bootstrap 95% CI
[+0.0937, +0.1428]. Grade-error reduction CI is [-1.3385, +0.8125], providing
no evidence of improved absolute grades. The top-labeled job ranks first in
25.00% versus 33.33% of resumes; its change CI includes zero. Old-rubric grade
error worsens 1.41 points, CI [0.21, 2.54]. Both rubrics are teacher judgments,
not human hiring outcomes. Complete metrics, uncertainty and blend simulation
are in `evaluation.json` and the linked report.

The fixed default keyword/semantic blend's grade MAE improves by 1.3625 points
(paired 95% CI [0.7656, 2.0365]). Its macro Spearman changes 0.5805 to 0.6035
and NDCG@10 changes 0.7592 to 0.7510; both ranking-change intervals include
zero. The simulation uses actual extension functions, no eligibility flags and
no weight tuning. It does not establish live browser behavior.

## Calibration, training and limits

r2 calibration uses validation only: 50% per synthetic/legacy source and equal
resume weight within each source. Leave-family/resume-out CV selected a
nonnegative affine interpolation. It clamps beyond observed validation support:
**the maximum semantic grade is 70**. High scores can tie; this is not a hiring
probability or an eligibility determination. Numeric calibration remains a
limitation despite better overall ranking. The UI combines lexical and semantic
scores, and simulated text-only results do not verify live eligibility or browser
WASM behavior.

Training adds 4,608 teacher-labeled pairs to replayed HF, OpenAI and NeuralFrame
data. The new corpus contains 864 original fictional resumes across 24 majors
and six stages, including 264 cross-major skill profiles. Only 576 new resume
documents enter training; validation/test each have 144 documents and 24
independent families. Resume families and job scenarios are split separately.
Model selection used validation only. r2 changed calibration source weighting
after r1's already-published tests exposed a legacy grade regression, without
fitting to test labels; old test rechecks are not fresh confirmation.

One held-out family per major, synthetic data, shared legacy jobs, and a small
major/year stress suite do not prove universal major independence. Simultaneous
major/year changes were less stable even though single-label changes improved.

Source datasets retain their terms; the NeuralFrame source is listed as
CC BY-NC 4.0. This card does not relicense data or establish redistribution
rights. The package excludes private resumes, training examples, credentials,
API logs and optimizer states. `publication_manifest.json` binds files and
source code; `release_provenance.json` preserves the original weight selection.
