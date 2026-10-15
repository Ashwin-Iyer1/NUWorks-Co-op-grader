# Major-agnostic resume model experiment — 2026-10-15

The selected model improves held-out semantic ranking across all four evaluated datasets. It is saved locally as `models/major_agnostic/selected_model` (PyTorch) and `models/major_agnostic/selected_onnx` (Transformers.js). The 34 MB quantized model is the tested release artifact. At the end of the evaluation run, the model was local and had not been deployed. The code and evaluation evidence are now being published on `finetune`; publishing this report does not activate the candidate model in the extension.

The candidate grade calibration has a material tradeoff: it improves the new diverse set but worsens the two legacy OpenAI test resumes. It is experimental and is not a general production grading recommendation. Better ranking is the strongest supported result.

This GitHub publication includes the training/evaluation code and evaluation evidence. Raw datasets, API response logs, credentials and model weights remain local and Git-ignored. Frozen JSON reports retain the experiment-time model status and original command/path metadata for provenance; their local-model status does not describe whether this report has been published.

## Held-out results

These scores use actual Transformers.js 4.2.0, Node ONNX Runtime 1.24.3 CPU, q8 mean pooling, bare input, extension chunking and per-resume batching. Both models use identical inputs, preprocessing, batch order and runtime. This tests semantic scores; browser WASM kernels and the extension's final semantic/lexical blend were not exercised.

| Test metric | Published baseline | Selected model |
|---|---:|---:|
| New diverse corpus: mean per-resume Spearman | 0.4221 | 0.7682 |
| New diverse corpus: global Spearman | 0.4036 | 0.8163 |
| Legacy OpenAI: global Spearman | 0.7603 | 0.8898 |
| HF real-source resumes: global Spearman | 0.6288 | 0.6545 |
| NeuralFrame: global Spearman | 0.6063 | 0.6290 |

The new set contains 2,304 pairs, 144 resume documents, **24 independent scenario families**, and 24 held-out job scenarios. The mean per-resume Spearman gain is **+0.3461**, with a paired family-bootstrap 95% interval **[0.2832, 0.4136]** (10,000 draws). NDCG@10 rises from 0.8644 to 0.9408; pairwise accuracy improves by 0.1843. These intervals are conditional on the sampled job pool.

HF has 820 pairs and 57 distinct resumes, of which 46 have rankable labels. All 248 unique HF test job texts occur in HF training, so this tests held-out resumes against seen jobs, not unseen-job generalization. Its per-resume Spearman gain is +0.0183, with 95% interval [-0.0563, 0.0906]; the positive point estimate is not conclusive evidence of population improvement. The legacy OpenAI test has only two resumes across 1,944 pairs and shares jobs with its training split. NeuralFrame has 962 pairs and no multi-label resume groups for per-resume ranking. Do not treat pair counts as independent applicant counts.

No new held-out resume or job text overlaps any of the four training datasets. No rankable group has collapsed constant predictions. [Full paired diversity report](diverse_js_test_paired.json), [HF uncertainty](hf_js_test_paired.json), and [machine-readable summary](run_summary.json) retain the details.

## Data and API usage

- 864 original fictional resumes: 24 majors × six scenario families × six career stages. The stages are first year, sophomore, junior, senior, master's and career changer. They represent 144 independent families, not 864 independent people.
- 264 profiles demonstrate skills outside the named major. First-year strong-project and senior coursework-only cases reduce a simple year shortcut. Explicit nursing/teaching credentials remain meaningful eligibility requirements.
- 144 fictional job scenarios; train/validation/test split by both resume family and job scenario. The labeled split is 4,608 / 2,304 / 2,304 pairs, covering 576 / 144 / 144 resumes.
- Public university catalogs informed coverage; no university resume bodies were copied. [Source audit](../../references/major_agnostic_sources.json) records provenance. Existing HF, OpenAI and NeuralFrame datasets were replayed alongside the new data.
- 9,216 new Luna labels plus 64 independent Terra audit labels: **9,280 successful requests**, **10,070,088 reported tokens**, zero failed requests. Teacher agreement on the audit was Spearman 0.9500, mean difference 7.33 points and maximum difference 24 points. Audit labels were not substituted into training.
- Conservative full-price usage estimate: **$4.8660 before credits**, below the user's $10 maximum. Separate persistent caps were allocated $8.50 and $1.40 (combined $9.90). Account free-token eligibility, remaining allowance and final billing were not inspected; the cost guards assumed no credits. See [OpenAI's sharing program](https://help.openai.com/en/articles/10306912-sharing-feedback-evaluation-and-fine-tuning-data-and-api-inputs-and-outputs-with-openai), [Luna pricing](https://developers.openai.com/api/docs/models/gpt-5.6-luna), and [Terra pricing](https://developers.openai.com/api/docs/models/gpt-5.6-terra). Pricing bounds include the input cache-write multiplier.

This new benchmark measures agreement with synthetic teacher judgments, not human hiring decisions. Each validation/test major has only one held-out family; its six stage variants do not establish broad major independence. Per-major slices are explicitly marked insufficient.

## Training and selection

Started on `finetune` at `7e9951bc30b02083d3f50857acafe6505480904e`; fetch showed it already matched GitHub. The preserved published baseline is `turtlecap/mdbr-leaf-mt-resume-grader` at revision `a77f5eb7d1c206088789eab5a270b9943a59304a`.

Corrected mean pooling and blank query prompts to match the extension. The prior Python evaluator inherited CLS pooling and prompted inputs, so historical tables in `EXPERIMENT_RESULTS.md` are not directly comparable to this JavaScript evaluation. Also fixed grouped sampler length/drop behavior and stale quantized export aliases.

After one low-rate legacy replay epoch, two fixed training recipes used learning rates 1e-5 and 3e-5, two epochs, grouped batches of 64, seed 20261015, and dataset weights diverse=3, OpenAI=1, HF=2, NeuralFrame=1. Four epoch checkpoints plus the replay control and unchanged baseline were compared. Selection used the equal mean of diverse macro Spearman, HF global Spearman and OpenAI global Spearman, subject to prespecified regression floors. **B, epoch 2** won with validation composite 0.68907; A, epoch 2 was very close at 0.68875. This is the highest observed validation score among these candidates, not proof it is uniquely best.

Selection and artifact hashes were frozen before final test scoring. No model or calibration retuning used test outcomes. The interrupted B run was restarted with the same seed/configuration; completed A steps were reused. [Selection record](selection.json) preserves the candidates and hashes.

## Calibration and major/year stress tests

The exported `calibration.json` is a **candidate** curve fit only on selected-model JavaScript validation predictions. Leave-family/resume-out validation selected weighted isotonic interpolation (110 knots; CV MAE 8.27 points). Equal resume weighting assigns 98.63% of calibration influence to the 144 synthetic validation resumes and 1.37% to the two legacy resumes. CV selected the curve and is not an independent final test estimate.

| Held-out displayed-grade MAE (0–100 points; lower is better) | Baseline with its shipped curve | Selected with candidate curve |
|---|---:|---:|
| New diverse set, 144 resumes | 36.01 | 9.88 |
| Legacy OpenAI set, two resumes | 11.93 | 19.30 |

This legacy regression prevents a blanket claim of improved numeric grading. The curve remains available for review, with its source hashes and validation provenance, and was not activated in the extension. Rounded calibrated grades are blended with lexical scores in the current UI; even monotone calibration can change final UI ordering. Scores are match judgments, not calibrated hiring probabilities.

A separate four-scenario, 24-document stress suite holds skills/job evidence fixed while changing major/year labels. It was not used to select or train the model. Mean absolute raw-cosine change:

| Changed label | Baseline | Selected |
|---|---:|---:|
| major | 0.01470 | 0.01084 |
| year | 0.00663 | 0.00356 |
| major_and_year | 0.00717 | 0.01257 |

Major-only and year-only sensitivity decreased, while the combined-label cases worsened. This small stress suite is not a population fairness assessment. [Full counterfactual results](counterfactual/report.json).

## Runtime verification and artifacts

- PyTorch inference files: `models/major_agnostic/selected_model`; optimizer state and private generated training examples are excluded.
- Quantized model: `models/major_agnostic/selected_onnx/onnx/model_quantized.onnx` (384 dimensions; 256 token cap). SHA-256: `63a361e5cef37f169e77d8ba4a6130dc0b70cdde83ba68b3812ad689c5d77613`.
- Candidate display curve: `models/major_agnostic/selected_onnx/calibration.json`; release manifest binds model, calibration, source and result hashes.
- 87 Python tests and four JavaScript tests pass. Focused follow-up tests cover the mixed legacy/annotated validation CSV fix, export freshness and clean packaging. Whitespace and ignore checks pass; data, API labels, credentials and model weights remain Git-ignored.
- The short-input Python/JavaScript check initially failed with Python ONNX Runtime 1.29.0 versus Node 1.24.3. Identical tokens, masks, CPU execution and weights ruled out preprocessing. An isolated Python 1.24.3 run passed unchanged thresholds (maximum difference 8.94e-8). The main environment was not replaced. [Version diagnosis](runtime_version_diagnosis.json) preserves both results. Match runtime versions for numerical comparisons; the actual-JavaScript ranking tests are primary evidence.

The next meaningful evaluation is a larger set of independently reviewed real resumes and job requirements, especially numeric grade calibration and the browser's final blended ordering. Current results support broader semantic matching, while those production claims remain unverified.
