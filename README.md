# NUWorks Co-op Extension

A Chrome extension that helps Northeastern University students optimize their co-op search on NUWorks (Symplicity). It scores every posting against your resume, flags the ones you're not eligible for, and adds a full-page Job Explorer with filtering, sorting, and batch actions on top of the standard NUWorks interface.

## Features

- **Resume Match Scoring**: Every job gets a 0–100 match score. Under the hood it's a two-layer engine:
  - **Eligibility gate** — trusts NUWorks's own server-side eligibility verdict when available, and falls back to a local rules engine that reads class-year, graduation-year, and graduation-window requirements out of the description.
  - **Skill & keyword matching** — a curated ~320-entry skills database (tech, data, finance, engineering, healthcare, marketing) with alias handling (`k8s` → Kubernetes), required-vs-preferred weighting, and TF-style keyword/bigram overlap. Explains itself with "You have / They want" skill chips.
  - **Implied skills** — a specific skill on your resume credits the general skill a posting asks for (PyTorch → machine learning, React → JavaScript, PostgreSQL → SQL). Strictly one-directional, and shown with a tooltip explaining the inference.
  - **Stem-aware matching** — "designing" in a posting meets "designed" on your resume.
- **Semantic AI matching (opt-in)**: An on-device language model re-reads each posting and scores it by *meaning*, not just keywords. See [Semantic AI](#semantic-ai-optional) below.
- **Job Explorer**: A full-page view that fetches hundreds of postings in one go and scores them instantly from the list payload — no per-job requests before results appear. Filter by score, title, company, skill, work term, and eligibility; sort; apply presets ("Best bets", "Closing soon"); open a detail modal with a "Why this score?" breakdown; and "Save all filtered" in one click. Extra fields (work terms, external-application links) load in the background with a visible status strip.
- **Auto-Grading & Visual Badging**: Grades jobs on the NUWorks search page and injects color-coded badges (Match %, External Application, Ineligible) directly into the job list.
- **Manual Trigger**: A "Grade N jobs on this page" button for pages that aren't auto-graded.
- **Batch Actions**: "Save All" matches from the popup; "Unfavorite All" on the Saved Jobs page.
- **Resume Parsing**: Upload a PDF resume; text is extracted locally with pdf.js. Your NUWorks profile's declared skills are merged in automatically.
- **Settings**: Toggle automatic grading, grade-ineligible-jobs, and update profile details.

## Semantic AI (optional)

Keyword matching can't see that "built REST services in Flask" satisfies "backend web development experience." Semantic AI can. It is **off by default** and the extension ships without it; enabling it is a one-time opt-in from the Job Explorer.

### How it works

- **The model** is [`turtlecap/mdbr-leaf-mt-resume-grader`](https://huggingface.co/turtlecap/mdbr-leaf-mt-resume-grader), a 33.36M-parameter `BAAI/bge-small-en-v1.5` fine-tune trained on 26,677 weighted resume/job pairs (384 dimensions, 256-token window). It runs entirely on your device via [Transformers.js](https://huggingface.co/docs/transformers.js) and the ONNX WebAssembly runtime; **your resume and the job text never leave your computer.**
- **Scoring is geometric, not rule-based.** Your resume (chunked to fit the model window and averaged into one vector) and each job description (capped to approximately the model's 256-token window) are converted into 384-dimensional vectors encoding their meaning. The raw score is the **cosine similarity** between the two vectors: how close the two texts sit in the model's learned meaning-space. This fine-tune uses bare resume and job text, without the previous retrieval query prefix.
- **Calibration**: the displayed AI score uses a validation-fitted affine mapping for the BGE fine-tune (`1.9227 × cosine − 0.9569`, clipped to 0–100). Calibration changes only the displayed value; cosine similarity still determines semantic rank.
- **Blending**: the visible match score becomes **65% keyword score + 35% semantic score**. Each card shows both ingredients ("Keyword 65 · AI 72"), and the detail modal gets a "Semantic (AI)" bar. The keyword layer stays in charge of the deterministic, explainable parts; the AI catches paraphrased fit.
- **What it does *not* do**: it doesn't understand seniority, hard requirements, or negation — a "PhD required" posting can still score high on topic. That's exactly why it's weighted at 35% and why the eligibility gate and keyword layer remain authoritative.

### Enabling it

1. Open the Job Explorer and tick **Semantic AI** in the fetch controls.
2. A consent dialog explains the feature and warns that scoring is CPU-intensive on low-powered machines (MacBook Air, Chromebooks): a large batch may take several minutes in the background, and may spin fans or use battery. Scores stay usable throughout — the AI refinement simply arrives later.
3. Accept to download the ONNX runtime (~23 MB, served from this repo) and the model weights (~34 MB, from the Hugging Face CDN). A progress dialog shows the download; both files are cached on your device. Unticking the box disables scoring but keeps the files, so re-enabling is instant and never re-prompts.

When an opted-in user opens the Job Explorer, the extension checks the model repository's latest commit SHA without downloading model weights. If that SHA differs from the installed revision, an **AI upgrade** badge appears beside the Semantic AI checkbox. Clicking it removes the old cached model assets, downloads the new revision, and re-scores jobs already on screen. Updates are never downloaded automatically.

Semantic scoring runs in a dedicated Web Worker after keyword scores are already on screen, uses at most half your CPU cores (capped at 4), and shows its progress in the status strip. If the model can't load (offline first run, unsupported browser), the extension silently keeps keyword-only scores.

### Benchmarking

- `node benchmark-semantic.mjs` — scores a resume (`resumeText.txt`) against a saved job batch (`exmaplePayload.json`), prints the cosine distribution used for calibration, the top/bottom rankings, the biggest keyword-vs-semantic disagreements, and the blended scores. Re-run it to refit the calibration constants if the model changes.
- `bench.html` — not part of the release build; run `npm run build:bench` to include it, then open `chrome-extension://<id>/bench.html`. It drives the exact production worker and sweeps thread count, batch size, and document length cap, projecting the time for a 253-job run. Use DevTools CPU throttling to simulate a slower machine.

## Installation

### 1. Build the Extension

This project uses Parcel to bundle dependencies (`@huggingface/transformers`, `pdfjs-dist`).

1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the extension:
   ```bash
   npm run build
   ```
   This generates a `dist/` folder (~2.6 MB — the AI model is not bundled).

To test the model-upgrade UI without publishing another Hugging Face revision:

```bash
npm run build:test-model-update
```

This also writes to `dist/`, but compiles in a deliberately stale installed
revision and renames the unpacked extension to **Model Update Test**. Open
`custom.html` while Semantic AI is enabled and the upgrade badge will appear.
The spoof exists only in this test build. Run `npm run build` afterward to
replace `dist/` with the production-safe build.

### 2. Load in Chrome

1. Go to `chrome://extensions/`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked**.
4. Select the **`dist`** folder from the project directory.

## Development

- **Source Code**: All source files are in `src/`.
- **Static Assets**: Manifest, icons, the pdf.js worker, and the ONNX runtime loader are in `public/`. Content scripts (`content.js`, `interceptor.js`) live in `src/` and are minified by Parcel.
- **`public/ort/ort-wasm-simd-threaded.asyncify.wasm`** is deliberately excluded from the built package but must stay committed on the `chrome-extension` branch: the extension downloads it at runtime from this repo's raw GitHub URL when a user opts into Semantic AI. Renaming or removing it breaks that download.
- **Manifest notes**: the extension declares `wasm-unsafe-eval` in its CSP and sets COOP/COEP headers so extension pages are cross-origin isolated — required for multithreaded WebAssembly. MV3 forbids inline scripts and remotely hosted code, so the (tiny) ORT `.mjs` loader ships in the package while the `.wasm` binary and model weights are fetched as data.

## Project Structure

```
├── dist/                     # Compiled extension (LOAD THIS IN CHROME)
├── public/                   # Static files (manifest, icons, ORT runtime)
├── src/
│   ├── background.js         # Service worker: credential capture, auto-grading, badges
│   ├── popup.js / index.html # Popup UI
│   ├── custom.js / custom.html # Job Explorer
│   ├── matcher.js            # Eligibility gate + skill/keyword scoring engine
│   ├── embeddings.js         # Semantic AI: text helpers, calibration, worker client
│   ├── embeddings-worker.js  # Semantic AI: model loading + inference (Web Worker)
│   ├── semantic-model-version.mjs # Hub SHA checks and targeted cache maintenance
│   ├── content.js / interceptor.js # Content scripts (NUWorks page + fetch interceptor)
│   ├── bench.js / bench.html # In-browser performance benchmark (npm run build:bench)
│   ├── api.js / storage.js / ui.js / theme.js
│   └── ...
├── benchmark-semantic.mjs    # Node benchmark: resume vs. job batch, calibration
└── README.md
```

## License

This project is licensed under the [GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE).

- Copyright (c) 2026 Ashwin Iyer.
- Copyright notices must be preserved in all forks and derivative works, as required by the license.
- The names **"NUWorks Grader"** and **"nucoop.app"** are not licensed for use by forks or derivatives. Forks must use their own name and domain.

## Credits

Made by [Ashwin Iyer](https://ashwiniyer.com)

Semantic matching uses [`turtlecap/mdbr-leaf-mt-resume-grader`](https://huggingface.co/turtlecap/mdbr-leaf-mt-resume-grader), fine-tuned from [`BAAI/bge-small-en-v1.5`](https://huggingface.co/BAAI/bge-small-en-v1.5), via [Transformers.js](https://huggingface.co/docs/transformers.js).
