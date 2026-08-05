# NUWorks Grader Design System

Design system for **NUWorks Co-op Grader** — an unofficial Chrome extension (by Ashwin Iyer) that helps Northeastern University students optimize their co-op search on NUWorks (Symplicity). It adds NLP-powered qualification matching, auto-grading with color-coded badges, resume parsing, smart filters, and a full "Job Explorer" browsing surface. The visual direction is **"Natural Professional"**: warm, editorial, calm, trustworthy.

## Sources
- GitHub (marketing site): https://github.com/Ashwin-Iyer1/NUWorks-Co-op-grader/tree/chrome-extension-site — `index.html`, `style.css`
- GitHub (extension source): https://github.com/Ashwin-Iyer1/NUWorks-Co-op-grader/tree/chrome-extension — `src/styles.css` (popup), `src/index.html` (popup markup), `src/custom.html` (Job Explorer, self-contained CSS)

Explore these repos further to ground new designs — the extension branch also contains `content.js` (injected badges), `popup.js`, and `custom.js` behavior.

## Products / surfaces
1. **Marketing site** — single landing page (hero, logo carousel, feature grid, video duo, 3-step "how it works", footer).
2. **Extension popup** — 400px-wide "Job Matcher" panel (search config form, resume settings, results list).
3. **Job Explorer** — full-page app tab (controls bar, stat cards, filters, job card grid, detail modal, toast).

## CONTENT FUNDAMENTALS
- **Voice**: direct, confident, benefit-first. "Supercharge Your Co-op Search." "Stop wasting time on jobs that don't match your profile." Speaks to "you", refers to the product as "we/our" sparingly ("Let our smart algorithms do the heavy lifting").
- **Technical credibility as a selling point**: NLP, match scores, latency stats ("0ms Server Latency", "250+ Skills Tracked", "100% Privacy First"). Numbers are big and specific.
- **Casing**: headings render uppercase (via CSS `text-transform`, written in Title Case in copy). Labels/meta/buttons are ALL-CAPS mono with wide letter-spacing ("JOBS TO SCRAPE", "FETCH & ANALYZE", "MIN MATCH SCORE").
- **Microcopy** is terse and imperative: "Analyze Jobs", "Save All Results", "Back to Search", "Hide Ineligible". Hints are short and friendly: "A good score is around 40-50%", "It's free!".
- **No emoji** in product copy. Honest disclaimers in the footer: "Unofficial tool. Not affiliated with Northeastern University or Symplicity."
- Errors are plain and actionable: "Not signed in — Please Login to NUWorks to use this extension."

## VISUAL FOUNDATIONS
The brand is **Natural Professional**: warm, editorial, calm — a well-crafted tool that doesn't shout. Depth comes from soft shadows, not borders or rules.

- **Color**: warm linen surfaces (`#faf7f2` base, `#f1ece3` tinted bands, white cards) with a single **clay accent `#b4400f`** (hover `#983508`) and a quiet **moss green `#4d6a4a`** as a secondary tint. LIGHT is the DEFAULT theme; dark mode ("ember by lamplight": `#1d1a15` base, `#26221b` cards, softened clay `#d96a35`) activates via `[data-theme="dark"]`. Semantic colors are natural tones — moss/amber/brick — used ONLY for match scoring and status.
- **Type**: Source Sans 3 is the default voice (UI, body, labels — sentence case, no letter-spacing). Source Serif 4 at weight 500 with -0.015em carries display headings, stat numbers, and step numerals; *italic serif accent words in clay* are a signature. The ONE uppercase style is the eyebrow: 0.72rem, 600, 0.14em tracking, usually moss.
- **Backgrounds**: flat warm color; alternate sections with the `--bg-surface` tinted band between hairline borders. No patterns, no gradients, no dot grids.
- **Cards**: white fill, 1px warm hairline (`--border`), **14px radius, `--shadow-sm`**. Hover: `--shadow-md` + translateY(-2px). No accent left/top borders.
- **Corners**: 8px controls, 10px mid, 14px cards/modals, **fully-round pills** for badges and score chips. Round close buttons and slider thumbs.
- **Shadows over borders**: three-step soft shadow scale (`--shadow-sm/md/lg`, warm-tinted in light mode). Modals and toasts use `--shadow-lg`.
- **Buttons**: sans 600, sentence case. Primary = solid clay, hover deepens + `--shadow-md`, active scales 0.98. Secondary = quiet outline (`--border-hover` → `--border-strong` on hover). Ghost = text-only. Danger/success = tinted semantic. Disabled = 0.45 opacity.
- **Inputs**: white field, warm hairline, 8px radius; focus = clay border + soft 3px glow ring (`--accent-glow`). Labels sit 6px above, sans 600 sentence case.
- **Score encoding**: high ≥70% moss, medium 40–69% amber, low <40% brick — rounded pill (tint bg + colored text, no border) plus a 5px rounded score bar. Skill tags: matched = clay tint, missing = brick tint.
- **Motion**: gentle — `0.2s cubic-bezier(0.25,0.46,0.45,0.94)` on interactive elements; hovers lift 2px with shadow; buttons scale 0.98 on press. No bounces, one ambient animation per page max.
- **Transparency & blur**: backdrop-blur only on the sticky nav (12px, `--navbar-bg`) and modal overlay (4px).
- **Imagery**: real product screenshots with 1px warm border, 14px radius, `--shadow-lg`; a soft moss radial glow may sit behind the hero shot.

## ICONOGRAPHY
- **Feather/Lucide-style outline SVGs** (2px stroke, round caps/joins, 15–17px) inlined directly in markup — no icon fonts, no emoji, no filled glyphs. Common glyphs: graduation cap (brand), file, lock, bar chart, search, bookmark, clock, gear, moon/sun (theme toggle).
- Feature icons sit in a **38px tinted chip** (10px radius): clay tint by default, alternating with moss tint.
- **No brand logo exists.** The wordmark is "NUWorks Grader" in Source Serif 4 600 with a 26px clay rounded chip holding the white grad-cap glyph. The Chrome extension icon (`assets/extension_icon128.png`) is the only raster mark — use it only where an app icon is expected.
- The legacy site used Font Awesome 6.4 + unicode glyphs; the Natural Professional restyle replaces all of that with inline stroke SVGs.

## Index
- `styles.css` — global entry; imports everything in `tokens/`
- `tokens/` — `fonts.css` (Google Fonts CDN: Source Serif 4 + Source Sans 3), `colors.css`, `typography.css`, `layout.css`
- `assets/` — `extension_icon128.png`, `extension_icon48.png`, product screenshots (`feature_screenshot.png`, `job_explorer_screenshot.png`)
- `components/forms/` — Button, Input, Select, Checkbox, RangeSlider
- `components/display/` — Badge, ScoreBar, StatCard, JobCard, FeatureCard, ProgressBar, Toast
- `components/overlay/` — Modal
- `ui_kits/website/` — landing page recreation
- `ui_kits/popup/` — extension popup recreation (400px)
- `ui_kits/job_explorer/` — Job Explorer app recreation
- `guidelines/` — foundation specimen cards
- `SKILL.md` — agent skill entry point

### Intentional additions
None — the component inventory maps 1:1 to patterns in the source CSS/HTML.

### Notes / caveats
- **The design system intentionally departs from the shipped product's current "terminal" look** — the owner redesigned toward this "Natural Professional" direction (July 2026); the repo branches still show the old style.
- Fonts ship via Google Fonts CDN; no font binaries in-repo.
- Videos referenced by the site were not in the repo; UI kit uses a screenshot placeholder.
- Company carousel logos are third-party marks hotlinked by the site; not copied in.
