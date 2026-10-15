# October 15 r2 main release

The selected B-epoch-2 weights improve semantic ranking on the new diverse test and on an additional 24 real resumes. **The additional real-resume test does not establish better absolute numeric grades.** This release publishes those weights with a source-balanced validation calibration to [Hugging Face main](https://huggingface.co/turtlecap/mdbr-leaf-mt-resume-grader/tree/main). The earlier `major-agnostic-2026-10-15` branch retains the original r1 candidate.

## Additional real-resume test

We evaluated 24 archive resumes, one per occupational category, against 40 NUWorks jobs: 960 pairs. Normalized resumes and pairs have zero overlap with all 12 current HF, NeuralFrame, OpenAI and diverse train/validation/test files. All 40 jobs recur in the legacy OpenAI splits. This tests new resumes from a known archive against shared jobs; occupational categories do not establish academic-major or student-year coverage.

The set was previously reported for August models. It is newly evaluated for these candidate weights, not a never-inspected dataset. We report both its original labels and 960 fresh GPT-5.6 Luna grades under the current major-neutral rubric. Fresh labels use exactly the training rubric fingerprint. Model weights and r2 calibration were frozen before these fresh grading requests, and neither was adjusted using these outcomes. The generator names its CSV `train.csv`; this output was used only for testing and never passed to training or calibration.

| Current-rubric test metric | August baseline | r2 release |
|---|---:|---:|
| Mean per-resume Spearman, higher is better | 0.68124 | 0.79779 |
| Mean per-resume NDCG@10, higher is better | 0.83697 | 0.88445 |
| Best-labeled job ranked first | 33.33% | 25.00% |
| Displayed semantic grade MAE, lower is better | 13.0604 | 13.3604 |

Paired bootstrap resamples whole resumes (10,000 draws), conditional on the fixed job pool. Spearman gain is +0.11654, 95% CI [+0.09370, +0.14280]; NDCG gain is +0.04748, CI [+0.02961, +0.06578]. Top-1 change is -8.33 percentage points, CI [-29.17, +12.50], so the overall ranking gain does not imply improved first choice. Numeric error is 0.30 points higher; the CI for baseline-minus-release error is [-1.33854, +0.81253]. There is no evidence of better absolute grades on this set.

Against the original legacy-rubric labels, mean per-resume Spearman improves from 0.68381 to 0.79066, but grade MAE worsens from 12.5042 to 13.9167. The error increase is 1.4125 points, CI [0.20727, 2.53854]. The old rubric permits a different domain to imply low fit, while the current rubric explicitly credits transferable skills and projects and forbids inferring skills from major/year. Both results are retained; the more favorable rubric is not substituted silently.

[Current-rubric metrics](main_release_real_fresh_labels.json), [legacy-rubric metrics](main_release_real_legacy_labels.json), and [frozen protocol](main_release_protocol.json) include hashes and evaluation details. Labels are teacher judgments, not independently reviewed human hiring outcomes.

## Calibration and prior test recheck

r1 assigned 98.63% of calibration weight to 144 synthetic validation resumes and 1.37% to two legacy real validation resumes. r2 prespecifies 50% per source and equal resume weight within each source. Leave-family/resume-out validation selects nonnegative affine interpolation over weighted isotonic interpolation: CV MAE 15.0902 versus 15.1804 points. Only validation predictions fit the knots. This fixed source mixture is not an estimate of deployment prevalence.

| Previously inspected test, displayed grade MAE | August baseline | r2 release |
|---|---:|---:|
| Diverse fictional test, 144 documents / 24 families | 36.01 | 17.69 |
| Legacy OpenAI test, two real resumes | 11.93 | 11.16 |

These are rechecks on already inspected tests, not fresh confirmation. r2 sacrifices some of r1's synthetic accuracy to improve its legacy calibration. Its interpolation intentionally clamps outside the validation support: **the maximum semantic grade is 70**, reached at cosine 0.8022639657. This conservative ceiling can tie high-scoring matches and means the display score does not use the full 0–100 range. No known-test cosine exceeded that upper knot. The full lexical/semantic blend is a separate score.

The original diverse-test semantic Spearman remains 0.42207 → 0.76820, NDCG@10 0.86437 → 0.94080. Model weights are unchanged from the selected candidate. [Known-test recheck](main_release_known_tests.json), [r2 calibration](calibration_main_r2.json), and [original training/evaluation](RESULTS.md).

The corpus includes 864 fictional resumes spanning 24 majors and six stages, with 264 profiles showing skills outside their named major. Only 576 documents entered training; validation/test each contain 144 documents. Major-only and year-only sensitivity improved in a small stress suite, but simultaneous major/year changes worsened. Neither those results nor the archive test proves universal major independence.

## Runtime, artifacts and cost

The fixed default UI formula (65% keyword / 35% semantic) was also simulated with the actual extension functions on all 960 current-rubric pairs. **Blended grade MAE improves from 15.375 to 14.0125 points**, a reduction of 1.3625 (paired 95% CI [0.7656, 2.0365]). Macro Spearman changes 0.58049 → 0.60351, with gain CI [-0.00056, 0.05056]; NDCG@10 changes 0.75919 → 0.75103, with change CI [-0.02743, 0.01282]. Blend-ranking changes are inconclusive, despite its improved grade error. These results use full title/description lexical scoring and frozen semantic predictions, with no eligibility flags or weight tuning. [Blend report](main_release_blend.json) records the exact code and inputs. This is a Node text-scoring simulation, not a live browser/NUWorks eligibility test.

Inference uses the actual pinned extension text helpers, Transformers.js 4.2.0, Node ONNX Runtime 1.24.3 CPU, mean pooling, normalized 384-dimensional vectors, 256 tokens, approximately 1,100-character resume chunks, and 1,200-character jobs in ordered batches of 16. Browser WASM numerical parity and live eligibility behavior remain unverified.

- Frozen PyTorch weights SHA-256: `18a7d4c4b5dd344deac05e3180e7ee7f8ba3962eee7df09aefa0e670d2cde8b7`.
- q8 ONNX SHA-256: `63a361e5cef37f169e77d8ba4a6130dc0b70cdde83ba68b3812ad689c5d77613`.
- r2 calibration SHA-256: `3424ce9d3f94df53f5f12d962859408d07543fd2c6d8d38a9fb410cf7a65da6e`.
- The package includes full PyTorch and ONNX inference files, model card, aggregate evaluation and hash manifest. Private examples, API logs, credentials and optimizer state are excluded.
- Validation passed: 96 Python tests and eight JavaScript evaluation tests; the extension compatibility fix separately passed 21 tests and its production build. New checks cover source-balanced calibration, exact pair alignment, actual display rounding, blend behavior, and revision-bound offline calibration.
- The extra 960 API grades succeeded with no failures, consuming 2,608,998 reported tokens. Conservative cost: $0.879822. Entire improvement run: 10,240 successful requests, 12,679,086 tokens, **$5.745847 before credits**, within the authorized $10. The new run used a persistent $3 cap. Calculations use [official pricing](https://developers.openai.com/api/docs/pricing), including an input cache-write bound; free credits were not assumed and final account billing was not inspected.

Historical reports and the r1 candidate remain available. Prefer this r2 report for the current main release's calibration and numeric-grade limitations.
