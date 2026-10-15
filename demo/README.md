# NUCoop interactive demo

A portable, dependency-free product demo of the real extension's lexical matcher. All nine job postings, employers, pay rates, and three sample résumés are original fictional fixtures. This is not a live job board or a hiring-outcome predictor.

## Run

Serve the site with any static HTTP server, for example `python -m http.server 4174`, then open `/demo/`. ES modules require HTTP; opening `index.html` as a local file is not supported.

Copy this entire `demo` directory to another static host or a subdirectory such as `public/demos/nucoop/`. Every runtime dependency is relative and included; there is no build step, third-party font, telemetry, or API connection.

## What is real

`vendor/matcher.mjs` is an unmodified copy of the extension's `src/matcher.js`. See `vendor/PROVENANCE.json` for its pinned source commit and SHA-256. It implements skill extraction, aliases, required/preferred weighting, related-skill credit, and lexical ranking. The demo adds filtering, detailed evidence, three-role comparison, temporary shortlisting, and CSV export.

The semantic ONNX model, eligibility checks, live NUWorks data, and PDF parsing are not loaded. Résumé text and shortlist state stay in memory and disappear on reload. CSV exports include matching evidence and fictional role data, not the résumé body.

## Verify

From the site root, run `node --test test/demo.test.mjs`. Tests verify upstream integrity, score equivalence, changing profile rankings, required-skill edits, composed filters, comparison limits, and CSV safety.

The matcher is licensed under AGPL-3.0; its complete source and license are distributed in `vendor/`.
