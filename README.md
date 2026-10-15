# NUCoop website and interactive explorer

[Try the job explorer](https://nucoop.app/demo/) · [Read the case study](https://ashwiniyer.com/projects/nucoop) · [Visit NUCoop](https://nucoop.app/)

This branch (`chrome-extension-site`) contains the NUCoop website and a portable product demo. Try the extension's real lexical matcher with fictional jobs and editable sample résumés: filter opportunities, inspect skill evidence and gaps, compare roles, and export a shortlist. No account or installation is required.

The demo runs locally in your browser. It does not load live NUWorks data, eligibility checks, or the optional semantic ONNX model. See [the demo documentation](demo/README.md) for implementation details, licensing, and provenance.

Serve this directory with `python -m http.server 4174`, then open `http://localhost:4174/demo/`. Run `npm ci`, `npm test`, and `npm run test:ui` to verify the matcher and browser workflows; Playwright requires its Chromium browser (`npx playwright install chromium`).
