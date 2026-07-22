// Injector logic moved to manifest.json (world: MAIN)
console.log("Content script loaded (Manifest Injection Mode).");

// Context validity check — stops all activity if extension reloads
let checkUrlIntervalId = null;
function isContextValid() {
  try {
    return !!(chrome.runtime && chrome.runtime.id);
  } catch (e) {
    return false;
  }
}

// Store job data locally separated by context
let searchJobData = null; // Data for the Search Page
let discoveryJobData = null; // Data for Discover/Home
let gradeButton = null;
let lastUrl = location.href;

// === DESIGN SYSTEM FOR INJECTED UI ("Natural Professional") ===
// This script runs inside Symplicity's own page, so the extension's CSS custom
// properties are NOT available here. We inject a single <style> element that
// re-declares the design tokens under a `--nuwg-` prefix and namespaces every
// class with `nuwg-`, so nothing can collide with (or be clobbered by) host CSS.
// Light theme values only: NUWorks renders on a white page.

const NUWG_STYLE_ID = "nuwg-styles";

const NUWG_STYLES = `
/* Tokens — light ("warm linen"), values copied from the design system token set.
   Prefixed with --nuwg- so Symplicity's own custom properties can never collide. */
:root {
  --nuwg-bg-base: #faf7f2;
  --nuwg-bg-surface: #f1ece3;
  --nuwg-bg-card: #ffffff;
  --nuwg-bg-elevated: #ffffff;
  --nuwg-overlay-bg: rgba(38, 34, 27, 0.4);
  --nuwg-accent: #b4400f;
  --nuwg-accent-hover: #983508;
  --nuwg-accent-secondary: #983508;
  --nuwg-accent-muted: #f6e8e0;
  --nuwg-accent-glow: rgba(180, 64, 15, 0.12);
  --nuwg-focus-bg: rgba(180, 64, 15, 0.05);
  --nuwg-on-accent: #ffffff;
  --nuwg-moss: #4d6a4a;
  --nuwg-moss-tint: #e9efe7;
  --nuwg-text: #26221c;
  --nuwg-text-secondary: #5f584d;
  --nuwg-text-muted: #948c7d;
  --nuwg-border: #e8e1d5;
  --nuwg-border-hover: #d8cfbf;
  --nuwg-border-strong: #c4b9a4;
  --nuwg-dropdown-hover-bg: rgba(60, 50, 35, 0.05);
  --nuwg-green: #4d6a4a;
  --nuwg-green-muted: rgba(77, 106, 74, 0.12);
  --nuwg-yellow: #a16207;
  --nuwg-yellow-muted: rgba(161, 98, 7, 0.11);
  --nuwg-red: #b3261e;
  --nuwg-red-muted: rgba(179, 38, 30, 0.08);
  --nuwg-score-high-text: #3f5d3c;
  --nuwg-score-high-border: rgba(77, 106, 74, 0.25);
  --nuwg-score-med-text: #8a6116;
  --nuwg-score-med-border: rgba(161, 98, 7, 0.25);
  --nuwg-score-low-text: #b3261e;
  --nuwg-score-low-border: rgba(179, 38, 30, 0.22);
  --nuwg-skill-matched-text: #983508;
  --nuwg-skill-matched-border: rgba(180, 64, 15, 0.22);
  --nuwg-shadow-sm: 0 1px 2px rgba(60, 50, 35, 0.05);
  --nuwg-shadow-md: 0 2px 8px rgba(60, 50, 35, 0.06), 0 1px 2px rgba(60, 50, 35, 0.04);
  --nuwg-shadow-lg: 0 16px 40px -12px rgba(60, 50, 35, 0.12), 0 2px 6px rgba(60, 50, 35, 0.04);
  /* Source Sans 3 cannot be fetched from inside the host page (its CSP owns the
     network), so the stack degrades to the platform UI sans where it is absent. */
  --nuwg-font-sans: 'Source Sans 3', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --nuwg-font-serif: 'Source Serif 4', Georgia, serif;
  --nuwg-radius-sm: 8px;
  --nuwg-radius: 10px;
  --nuwg-radius-lg: 14px;
  --nuwg-radius-pill: 999px;
  --nuwg-transition: 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

/* Buttons. Selectors are intentionally doubled (0,2,0) / tripled (0,3,0): three of
   the injected buttons also carry Symplicity's own .btn .btn-default .btn-primary
   classes so they keep the host action-bar layout, and those host rules must lose. */
.nuwg-btn.nuwg-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: 2px 4px 2px 10px;
  padding: 7px 16px;
  border: 1px solid transparent;
  border-radius: var(--nuwg-radius-sm);
  background: var(--nuwg-bg-card);
  background-image: none;
  box-shadow: var(--nuwg-shadow-sm);
  color: var(--nuwg-text);
  font-family: var(--nuwg-font-sans);
  font-size: 0.85rem;
  font-weight: 600;
  line-height: 1.4;
  letter-spacing: 0;
  text-align: center;
  text-transform: none;
  text-decoration: none;
  text-shadow: none;
  white-space: nowrap;
  vertical-align: middle;
  cursor: pointer;
  transition: all var(--nuwg-transition);
  -webkit-font-smoothing: antialiased;
}
.nuwg-btn.nuwg-btn:hover {
  transform: translateY(-2px);
  box-shadow: var(--nuwg-shadow-md);
}
.nuwg-btn.nuwg-btn:active {
  transform: scale(0.98);
}
.nuwg-btn.nuwg-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--nuwg-accent-glow);
}
.nuwg-btn.nuwg-btn:disabled,
.nuwg-btn.nuwg-btn[disabled] {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
  box-shadow: var(--nuwg-shadow-sm);
}
.nuwg-btn.nuwg-btn.nuwg-btn--primary {
  background: var(--nuwg-accent);
  border-color: transparent;
  color: var(--nuwg-on-accent);
}
.nuwg-btn.nuwg-btn.nuwg-btn--primary:hover {
  background: var(--nuwg-accent-hover);
  color: var(--nuwg-on-accent);
}
.nuwg-btn.nuwg-btn.nuwg-btn--secondary {
  background: transparent;
  border-color: var(--nuwg-border-hover);
  color: var(--nuwg-text);
}
.nuwg-btn.nuwg-btn.nuwg-btn--secondary:hover {
  background: var(--nuwg-bg-card);
  border-color: var(--nuwg-border-strong);
  color: var(--nuwg-text);
}
.nuwg-btn.nuwg-btn.nuwg-btn--success {
  background: var(--nuwg-green-muted);
  border-color: var(--nuwg-score-high-border);
  color: var(--nuwg-score-high-text);
}
.nuwg-btn.nuwg-btn.nuwg-btn--success:hover {
  background: var(--nuwg-green-muted);
  color: var(--nuwg-score-high-text);
}
/* Solid moss fill — the grade button's "ready" and "done" states. Distinct from
   --success (the tinted transient confirmation used on the history button). */
.nuwg-btn.nuwg-btn.nuwg-btn--moss {
  background: var(--nuwg-green);
  border-color: transparent;
  color: var(--nuwg-on-accent);
}
.nuwg-btn.nuwg-btn.nuwg-btn--moss:hover {
  background: var(--nuwg-score-high-text);
  color: var(--nuwg-on-accent);
}
/* Inert states (waiting / grading). Reads as "not yet", never as a failure —
   red is reserved for real errors and for the lowest score tier. */
.nuwg-btn.nuwg-btn.nuwg-btn--muted {
  background: var(--nuwg-bg-surface);
  border-color: var(--nuwg-border);
  color: var(--nuwg-text-muted);
  box-shadow: none;
}
.nuwg-btn.nuwg-btn.nuwg-btn--muted:hover {
  background: var(--nuwg-bg-surface);
  color: var(--nuwg-text-muted);
}
/* The muted palette already reads as inactive, so skip the 0.45 dim that would
   otherwise make a disabled muted button nearly invisible on Symplicity's white. */
.nuwg-btn.nuwg-btn.nuwg-btn--muted:disabled,
.nuwg-btn.nuwg-btn.nuwg-btn--muted[disabled] {
  opacity: 1;
  box-shadow: none;
}
.nuwg-btn.nuwg-btn.nuwg-btn--danger {
  background: var(--nuwg-red-muted);
  border-color: var(--nuwg-score-low-border);
  color: var(--nuwg-score-low-text);
}
.nuwg-btn.nuwg-btn.nuwg-btn--ghost {
  background: transparent;
  border-color: transparent;
  box-shadow: none;
  color: var(--nuwg-text-secondary);
}
.nuwg-btn.nuwg-btn.nuwg-btn--ghost:hover {
  background: var(--nuwg-dropdown-hover-bg);
  color: var(--nuwg-text);
}
.nuwg-btn.nuwg-btn .nuwg-btn__label {
  font: inherit;
  color: inherit;
}
.nuwg-icon {
  flex: 0 0 auto;
  display: block;
  width: 15px;
  height: 15px;
}
.nuwg-icon--spin {
  transform-origin: 50% 50%;
  animation: nuwg-spin 0.6s linear infinite;
}
@keyframes nuwg-spin {
  to { transform: rotate(360deg); }
}

/* Badges — pills. Colors come from the score/flag variants below; the base owns
   shape and type so a badge reads the same inside a host link or a host title. */
.nuwg-badge.nuwg-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  margin: 0;
  padding: 3px 12px;
  border: 1px solid transparent;
  border-radius: var(--nuwg-radius-pill);
  background: var(--nuwg-bg-surface);
  color: var(--nuwg-text-secondary);
  font-family: var(--nuwg-font-sans);
  font-size: 0.78rem;
  font-weight: 600;
  line-height: 1.5;
  letter-spacing: 0;
  text-transform: none;
  text-decoration: none;
  text-shadow: none;
  white-space: nowrap;
  vertical-align: middle;
  box-shadow: none;
  -webkit-font-smoothing: antialiased;
}
.nuwg-badge.nuwg-badge--sm {
  padding: 2px 10px;
  font-size: 0.72rem;
}
.nuwg-badge.nuwg-badge--inline {
  margin-left: 8px;
  margin-right: 4px;
}
.nuwg-badge.nuwg-badge.nuwg-badge--score-high {
  background: var(--nuwg-green-muted);
  color: var(--nuwg-score-high-text);
}
.nuwg-badge.nuwg-badge.nuwg-badge--score-medium {
  background: var(--nuwg-yellow-muted);
  color: var(--nuwg-score-med-text);
}
.nuwg-badge.nuwg-badge.nuwg-badge--score-low {
  background: var(--nuwg-red-muted);
  color: var(--nuwg-score-low-text);
}
.nuwg-badge.nuwg-badge.nuwg-badge--external {
  background: var(--nuwg-red-muted);
  color: var(--nuwg-score-low-text);
}
.nuwg-badge.nuwg-badge.nuwg-badge--disqualified {
  background: var(--nuwg-bg-surface);
  border-color: var(--nuwg-border);
  color: var(--nuwg-text-muted);
}
.nuwg-badge.nuwg-badge.nuwg-badge--accent {
  background: var(--nuwg-accent-muted);
  color: var(--nuwg-accent);
}
.nuwg-badge.nuwg-badge.nuwg-badge--moss {
  background: var(--nuwg-moss-tint);
  color: var(--nuwg-moss);
}
.nuwg-badge.nuwg-badge.nuwg-badge--neutral {
  background: var(--nuwg-bg-surface);
  color: var(--nuwg-text-secondary);
}
`;

function injectDesignTokens(attempt) {
  if (document.getElementById(NUWG_STYLE_ID)) return;
  const tries = attempt || 0;
  // Prefer <head> so our rules sit after the host stylesheets and win ties.
  const host = document.head || (tries > 20 ? document.documentElement : null);
  if (!host) {
    if (isContextValid()) setTimeout(() => injectDesignTokens(tries + 1), 50);
    return;
  }
  const style = document.createElement("style");
  style.id = NUWG_STYLE_ID;
  style.textContent = NUWG_STYLES;
  host.appendChild(style);
}

// Feather/Lucide-style outline glyphs, built with createElementNS so no markup
// string ever touches the host page. 2px stroke, round caps and joins, 15px.
const NUWG_SVG_NS = "http://www.w3.org/2000/svg";

const NUWG_ICON_PATHS = {
  zap: ["M13 2 3 14h9l-1 8 10-12h-9l1-8z"],
  clock: ["M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20", "M12 6.5V12l3.5 2"],
  spinner: ["M12 2a10 10 0 1 0 10 10"],
  grid: ["M3 3h7v7H3z", "M14 3h7v7h-7z", "M14 14h7v7h-7z", "M3 14h7v7H3z"],
  play: ["M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20", "M10 8.5 16 12l-6 3.5z"],
  search: ["M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14", "m20.5 20.5-3.6-3.6"],
  download: [
    "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",
    "m7 10 5 5 5-5",
    "M12 15V3",
  ],
  check: ["m20 6-11 11-5-5"],
};

function nuwgIcon(name, spin) {
  const paths = NUWG_ICON_PATHS[name];
  if (!paths) return null;
  const svg = document.createElementNS(NUWG_SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "15");
  svg.setAttribute("height", "15");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", spin ? "nuwg-icon nuwg-icon--spin" : "nuwg-icon");
  paths.forEach((d) => {
    const path = document.createElementNS(NUWG_SVG_NS, "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  });
  return svg;
}

// Buttons hold an icon + a label span, so labels are swapped through this helper
// instead of innerText (which would wipe the glyph).
function nuwgSetButtonContent(button, label, iconName, spin) {
  button.textContent = "";
  const icon = nuwgIcon(iconName, spin);
  if (icon) button.appendChild(icon);
  const text = document.createElement("span");
  text.className = "nuwg-btn__label";
  text.textContent = label;
  button.appendChild(text);
}

// Score/flag badges are created by background.js with legacy inline colors.
// Re-skin them in place: classes and text are left alone because background.js
// dedupes on `.nuworks-badge` and on the badge's own innerText.
function restyleInjectedBadges() {
  const badges = document.querySelectorAll(
    "span.nuworks-badge:not([data-nuwg-styled])"
  );
  if (badges.length === 0) return;

  badges.forEach((badge) => {
    const text = (badge.textContent || "").trim();
    let variant = "neutral";
    let small = false;

    if (/external application/i.test(text)) {
      variant = "external";
      small = true;
    } else if (/ineligible/i.test(text)) {
      variant = "disqualified";
      small = true;
    } else {
      const match = text.match(/(\d+)\s*%/);
      if (match) {
        const score = parseInt(match[1], 10);
        // Fixed product-wide thresholds: >=70 high, 40-69 medium, <40 low.
        if (score >= 70) variant = "score-high";
        else if (score >= 40) variant = "score-medium";
        else variant = "score-low";
      }
    }

    badge.removeAttribute("style");
    badge.classList.add(
      "nuwg-badge",
      "nuwg-badge--" + variant,
      "nuwg-badge--inline"
    );
    if (small) badge.classList.add("nuwg-badge--sm");
    badge.setAttribute("data-nuwg-styled", variant);
  });
}

let nuwgBadgeObserver = null;
let nuwgBadgeRestylePending = false;

function watchInjectedBadges() {
  if (
    nuwgBadgeObserver ||
    !document.body ||
    typeof MutationObserver === "undefined"
  ) {
    return;
  }
  nuwgBadgeObserver = new MutationObserver(() => {
    if (nuwgBadgeRestylePending) return;
    nuwgBadgeRestylePending = true;
    requestAnimationFrame(() => {
      nuwgBadgeRestylePending = false;
      restyleInjectedBadges();
    });
  });
  // childList only: attribute changes are what we write, watching them would loop.
  nuwgBadgeObserver.observe(document.body, { childList: true, subtree: true });
  restyleInjectedBadges();
}

function sendMessageSafe(message, callback) {
  if (!chrome.runtime?.id) {
    return;
  }
  try {
    chrome.runtime.sendMessage(message, (response) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        if (!lastError.message.includes("Extension context invalidated")) {
          console.error("Error sending message:", lastError);
        }
      }
      if (callback) callback(response);
    });
  } catch (e) {
    // Context invalidated synchronously
  }
}

function isSearchApiUrl(url) {
  if (!url) return false;
  // Search API requests usually have parameters like perPage, page, sort
  return url.includes("perPage=") || url.includes("per_page=");
}

function isIgnoredUrl(url) {
  if (!url) return false;
  const ignorePatterns = [
    "/recent/",
    "/filters/",
    "/help",
    "/settings/",
    "/notifications",
    "/image/",
    "/profile",
    "/form-structure",
    "/related-resources",
    "/system-settings/",
  ];
  return ignorePatterns.some((pattern) => url.includes(pattern));
}

function isJobList(data) {
  // Check if data is a list of jobs
  // Usually Symplicity returns { models: [...] } or just [...]
  if (!data) return false;
  if (Array.isArray(data)) return true;
  if (data.models && Array.isArray(data.models)) return true;
  if (data.jobs && Array.isArray(data.jobs)) return true;
  if (data.results && Array.isArray(data.results)) return true;
  if (data.data && Array.isArray(data.data)) return true;
  return false;
}

// Trigger auto-grading logic
function triggerAutoGrade(data, onComplete) {
  if (!data) return;
  console.log("Auto-sending job data to background...");
  sendMessageSafe(
    {
      type: "JOBS_DATA",
      payload: data,
    },
    () => {
      console.log("Auto-grading started/completed.");
      if (onComplete) onComplete();
    }
  );
}

// === GRADE BUTTON STATE MACHINE ===
// Every write to the grade button goes through setGradeButtonState(). The state
// lives in `dataset.nuwgState`, never in the label text, so re-wording a label can
// never break the "already processing" guard.
const NUWG_GRADE_STATES = {
  waiting: {
    label: () => "Waiting for jobs",
    icon: "clock",
    variant: "muted",
    disabled: true,
    title:
      "Scroll or reload the page so the extension can capture this page's jobs.",
  },
  ready: {
    label: (count) =>
      `Grade ${count} ${count === 1 ? "job" : "jobs"} on this page`,
    icon: "zap",
    variant: "moss",
    disabled: false,
    title: "Score every job captured on this page against your resume.",
  },
  processing: {
    label: () => "Grading...",
    icon: "spinner",
    variant: "muted",
    disabled: true,
    title: "Scoring the jobs captured on this page.",
  },
  done: {
    label: (count) => `Graded ${count} ${count === 1 ? "job" : "jobs"}`,
    icon: "check",
    variant: "moss",
    disabled: false,
    // Honest copy: the send callback fires when the message channel closes, not
    // when the badges are painted, so this promises a request, not a repaint.
    title: "Grading sent. Scores appear on the list as they come back.",
  },
};

// Timer that walks 'done' back to 'ready'. Held at module scope so any later
// state write cancels it instead of being clobbered 2s afterwards.
let gradeDoneTimerId = null;

function gradeJobCount() {
  return Array.isArray(discoveryJobData) ? discoveryJobData.length : 0;
}

function setGradeButtonState(state, count) {
  if (!gradeButton) return;

  const resolved = NUWG_GRADE_STATES[state] ? state : "waiting";
  const config = NUWG_GRADE_STATES[resolved];

  if (gradeDoneTimerId !== null) {
    clearTimeout(gradeDoneTimerId);
    gradeDoneTimerId = null;
  }

  const n =
    typeof count === "number" && isFinite(count) && count >= 0
      ? count
      : gradeJobCount();

  gradeButton.dataset.nuwgState = resolved;
  // `nuworks-btn` is kept — it is the historical hook for this button.
  gradeButton.className = "nuworks-btn nuwg-btn nuwg-btn--" + config.variant;
  gradeButton.disabled = config.disabled;
  gradeButton.title = config.title;
  nuwgSetButtonContent(
    gradeButton,
    config.label(n),
    config.icon,
    resolved === "processing"
  );

  if (resolved === "done") {
    gradeDoneTimerId = setTimeout(() => {
      gradeDoneTimerId = null;
      if (!gradeButton || gradeButton.dataset.nuwgState !== "done") return;
      setGradeButtonState(gradeJobCount() > 0 ? "ready" : "waiting");
    }, 2000);
  }
}

// Idle-state refresh used by the injector and the interceptor listener: bump the
// button to 'ready' with the current count, but never interrupt a run in flight
// or stomp on the 'done' confirmation before it has been read.
function refreshGradeButtonReady() {
  if (!gradeButton) return;
  const state = gradeButton.dataset.nuwgState;
  if (state === "processing" || state === "done") return;
  if (gradeJobCount() === 0) {
    setGradeButtonState("waiting");
    return;
  }
  setGradeButtonState("ready");
}

// Function to inject the grade button
function injectGradeButton() {
  injectDesignTokens();

  if (document.getElementById("nuworks-grade-btn")) {
    // Button already present — just keep its label/count in sync with the data.
    if (discoveryJobData) refreshGradeButtonReady();
    return;
  }

  // Auto-run on search page, do not inject button
  if (window.location.href.includes("/students/app/jobs/search")) {
    return;
  }

  var targetSelector =
    ".display-mobile-none.display-md-none.display-sm-none.ng-star-inserted";
  var target = document.querySelector(targetSelector);

  if (target) {
    gradeButton = document.createElement("button");
    gradeButton.id = "nuworks-grade-btn";
    gradeButton.type = "button";
    // Label changes are the only progress feedback, so announce them.
    gradeButton.setAttribute("aria-live", "polite");
    setGradeButtonState(gradeJobCount() > 0 ? "ready" : "waiting");

    gradeButton.onclick = function () {
      // 'waiting' and 'processing' are disabled states, so these are belt-and-
      // braces: a synthetic click can still reach a disabled onclick handler.
      if (gradeButton.dataset.nuwgState === "processing") return;
      if (gradeJobCount() === 0) {
        // The waiting state's tooltip already explains the fix (scroll/reload).
        setGradeButtonState("waiting");
        return;
      }

      // Freeze the count at dispatch time so 'done' reports what was actually
      // sent, even if the interceptor swaps in a new list mid-flight.
      const sentCount = gradeJobCount();
      const sentJobs = discoveryJobData;
      setGradeButtonState("processing", sentCount);

      triggerAutoGrade(sentJobs, () => {
        if (!gradeButton) return;
        setGradeButtonState("done", sentCount);
      });
    };

    target.parentNode.insertBefore(gradeButton, target.nextSibling);

    // Inject the "Job explorer" button next to grade button
    if (!document.getElementById("nuworks-custom-btn")) {
      var customBtn = document.createElement("button");
      customBtn.id = "nuworks-custom-btn";
      customBtn.type = "button";
      // Clay primary — replaces the old purple gradient. No gradients anywhere.
      customBtn.className = "nuwg-btn nuwg-btn--primary";
      nuwgSetButtonContent(customBtn, "Job explorer", "grid");
      customBtn.onclick = function () {
        try {
          if (isContextValid() && chrome.runtime.getURL) {
            var url = chrome.runtime.getURL("custom.html");
            window.open(url, "_blank");
          }
        } catch (e) {
          console.log("NUWorks: Extension context invalidated.");
        }
      };
      gradeButton.parentNode.insertBefore(customBtn, gradeButton.nextSibling);
    }

    console.log("NUWorks: Grade button injected");
  } else {
    // Retry if target not found yet (dynamic loading)
    if (isContextValid()) setTimeout(injectGradeButton, 1000);
  }
}

function removeGradeButton() {
  const btn = document.getElementById("nuworks-grade-btn");
  if (btn) {
    if (gradeDoneTimerId !== null) {
      clearTimeout(gradeDoneTimerId);
      gradeDoneTimerId = null;
    }
    btn.remove();
    gradeButton = null;
    console.log("NUWorks: Grade button removed");
  }
}

// Helper to identify specific discovery endpoint
function isDiscoveryApiUrl(url) {
  if (!url) return false;
  return url.includes("/api/v2/jobs/discovery");
}

// === NEW LOGIC FOR APPLICATION HISTORY ===

function injectApplicationHistoryButton() {
  // Target class: font-bold text-lg mb-2
  // We'll search for all elements with these classes
  const targetSelector = ".font-bold.text-lg.mb-2";
  const targets = document.querySelectorAll(targetSelector);

  console.log(
    `[HistoryDebug] Searching for targets with selector '${targetSelector}'. Found: ${targets.length}`
  );

  if (targets.length === 0) {
    // Retry if content is dynamic
    // setTimeout(injectApplicationHistoryButton, 1000);
    // Commented out to avoid infinite loops if generic selector fails,
    // relying on checkUrl interval to retry since it runs every 1s
    return;
  }

  targets.forEach((target) => {
    // Check if we already injected a button next to this specific target
    if (
      target.nextSibling &&
      target.nextSibling.classList &&
      target.nextSibling.classList.contains("nuworks-history-btn")
    ) {
      return;
    }

    // `nuworks-history-btn` must stay on the button itself and the button must stay
    // the immediate next sibling of the target — that pair is the dedupe guard.
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "nuworks-history-btn nuwg-btn nuwg-btn--primary";
    nuwgSetButtonContent(btn, "Find inactive jobs", "search");

    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      //get the page as html
      const html = document.documentElement.outerHTML;
      const jobCards = document.querySelectorAll(
        ".bg-white.rounded-xl.m-1.text-xs.shadow.w-full.mx-auto"
      );
      console.log(`Found ${jobCards.length} job cards.`);

      const jobs = [];

      jobCards.forEach((jobCard) => {
        const getLabelValue = (labelText) => {
          const elements = jobCard.querySelectorAll(".font-semibold");
          for (let el of elements) {
            if (el.innerText.includes(labelText)) {
              const valueEl =
                el.nextElementSibling || el.parentElement.nextElementSibling;
              return valueEl ? valueEl.innerText.trim() : "N/A";
            }
          }
          // Fallback for "App Status" which might be a div not a span, or slightly different class
          const allDivs = jobCard.querySelectorAll("div");
          for (let el of allDivs) {
            if (el.innerText.includes(labelText)) {
              // check if it is the label container
              const valueEl = el.nextElementSibling;
              return valueEl ? valueEl.innerText.trim() : "N/A";
            }
          }
          return "N/A";
        };

        const anchor = jobCard.querySelector("a");
        let job_id = "unknown";
        if (anchor && anchor.href) {
          try {
            const urlObj = new URL(anchor.href, window.location.origin);
            const pathSegments = urlObj.pathname.split("/");
            job_id = pathSegments[pathSegments.length - 1];
          } catch (e) {
            console.error("Error parsing job ID from URL:", anchor.href);
            job_id = anchor.href.split("/").pop().split("?")[0]; // Fallback cleanup
          }
        }

        const jobStatus = getLabelValue("Job Status");
        const appStatus = getLabelValue("App Status");
        const activeApp = getLabelValue("Active Application");

        jobs.push({
          job_id,
          jobStatus,
          appStatus,
          activeApp,
        });
      });

      console.log("Extracted Jobs:", jobs);
      // save to chrome.storage.local
      chrome.storage.local.set({ job_applications_history: jobs }, () => {
        console.log("Saved job history to chrome.storage.local");
        // Notify user via a transient success state on the button
        btn.className = "nuworks-history-btn nuwg-btn nuwg-btn--success";
        nuwgSetButtonContent(btn, "Saved", "check");
        setTimeout(() => {
          btn.className = "nuworks-history-btn nuwg-btn nuwg-btn--primary";
          nuwgSetButtonContent(btn, "Find inactive jobs", "search");
        }, 2000);
      });

      // go to the job applications page https://northeastern-csm.symplicity.com/students/app/jobs/applied
      window.location.href =
        "https://northeastern-csm.symplicity.com/students/app/jobs/applied";
    };
    target.parentNode.style.justifyContent = "flex-start";

    target.parentNode.insertBefore(btn, target.nextSibling);
    const tutorial_btn = document.createElement("button");
    tutorial_btn.id = "nuworks-tutorial-btn";
    tutorial_btn.type = "button";
    // Symplicity's own classes are kept so the button stays inside the host's
    // action-bar layout; the nuwg- classes out-specify their look.
    tutorial_btn.className =
      "btn btn-default btn-primary nuwg-btn nuwg-btn--secondary";
    nuwgSetButtonContent(tutorial_btn, "Tutorial", "play");

    tutorial_btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.open("https://nucoop.app/#ineligible-video", "_blank");
    };

    // append to the right of the button we just added
    btn.parentNode.insertBefore(tutorial_btn, btn.nextSibling);
  });
}

function handleApplicationHistoryPage() {
  // We can run this periodically or just once per checkUrl tick
  injectApplicationHistoryButton();
}

// === NEW LOGIC FOR APPLIED JOBS BADGING ===

let cachedJobHistory = null;
let isFetchingHistory = false;

function injectApplicationBadges() {
  // If we already have data, use it. If not, fetch it.
  if (!cachedJobHistory) {
    if (isFetchingHistory) return;
    isFetchingHistory = true;
    chrome.storage.local.get(["job_applications_history"], (result) => {
      isFetchingHistory = false;
      const historyData = result.job_applications_history;
      if (!historyData) {
        // No data found, stop trying for a bit or log once
        return;
      }
      cachedJobHistory = historyData;
      // Re-trigger injection now that we have data
      injectApplicationBadges();
    });
    return;
  }

  // Create a map for faster lookup: job_id -> full job object
  const jobMap = {};
  cachedJobHistory.forEach((job) => {
    if (job.job_id) {
      jobMap[job.job_id] = job;
    }
  });

  // Find all job links on the page
  const jobLinks = document.querySelectorAll(
    "a[href*='/students/app/jobs/detail/'], a[href*='/students/app/jobs/view/']"
  );

  // Optimization: Check if there is work to do before logging or iterating
  let unbadgedLinks = [];
  jobLinks.forEach((link) => {
    // Check if badge already exists in parent or on link
    if (
      !link.querySelector(".nuworks-app-badge") &&
      !link.parentNode.querySelector(".nuworks-app-badge")
    ) {
      // Check if this link corresponds to a known job
      const href = link.getAttribute("href");
      try {
        const urlObj = new URL(href, window.location.origin);
        const pathSegments = urlObj.pathname.split("/");
        const jobId = pathSegments[pathSegments.length - 1];
        if (jobMap.hasOwnProperty(jobId)) {
          unbadgedLinks.push({ link, jobId });
        }
      } catch (e) {}
    }
  });

  if (unbadgedLinks.length === 0) {
    return;
  }

  unbadgedLinks.forEach((item) => {
    const { link, jobId } = item;
    const job = jobMap[jobId];

    // LOGIC: Determine Badge Status
    let badgeText = "Applied";
    let badgeVariant = "accent"; // Default: application on file

    // Priority 1: Inactive indicators
    if (job.appStatus.includes("Not Selected") || job.activeApp === "No") {
      badgeText = "Inactive";
      badgeVariant = "score-low";
    } else if (
      ["Expired", "Filled", "Pending or Draft Placements"].some((s) =>
        job.jobStatus.includes(s)
      )
    ) {
      badgeText = "Job Closed";
      badgeVariant = "disqualified";
    }
    // Priority 2: Positive indicators
    else if (job.appStatus.includes("Employer Interested")) {
      badgeText = "Interested";
      badgeVariant = "score-high";
    } else if (job.activeApp === "Yes") {
      badgeText = "Active";
      badgeVariant = "score-high";
    }

    // `nuworks-app-badge` is the sole re-injection guard for these badges.
    const badge = document.createElement("span");
    badge.className =
      "nuworks-app-badge nuwg-badge nuwg-badge--sm nuwg-badge--inline nuwg-badge--" +
      badgeVariant;
    badge.textContent = badgeText;

    // Insert badge after the link text (or append to link)
    link.appendChild(badge);
  });
}

function injectHistoryNavButton() {
  // Selector strategy: Try multiple potential selectors for the bottom bar
  const targetSelectors = [
    ".buttonbar.buttonbar-bottom.fixed-action-bar",
    ".buttonbar.buttonbar-bottom",
    ".list-bottom-buttons",
    "div[class*='buttonbar-bottom']",
  ];

  let target = null;
  for (let sel of targetSelectors) {
    target = document.querySelector(sel);
    if (target) {
      console.log(`[NavBtn] Found target bar with selector: ${sel}`);
      break;
    }
  }

  if (!target) {
    // console.log("[NavBtn] Button bar not found yet");
    return;
  }

  if (document.getElementById("nuworks-history-nav-btn")) {
    return;
  }

  const btn = document.createElement("button");
  btn.id = "nuworks-history-nav-btn";
  btn.type = "button";
  // Symplicity's own classes are kept so the button stays inside the host's
  // action-bar layout; the nuwg- classes out-specify their look.
  btn.className = "btn btn-default btn-primary nuwg-btn nuwg-btn--primary";
  nuwgSetButtonContent(btn, "Fetch inactive jobs", "download");

  btn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.location.href =
      "https://bos1225.northeastern.edu/student/applicationhistory";
  };

  // Append to target. If target has children, append at the end.
  target.appendChild(btn);

  const tutorial_btn = document.createElement("button");
  tutorial_btn.id = "nuworks-tutorial-btn";
  tutorial_btn.type = "button";
  // Symplicity's own classes are kept so the button stays inside the host's
  // action-bar layout; the nuwg- classes out-specify their look.
  tutorial_btn.className =
    "btn btn-default btn-primary nuwg-btn nuwg-btn--secondary";
  nuwgSetButtonContent(tutorial_btn, "Tutorial", "play");

  tutorial_btn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.open("https://nucoop.app/#ineligible-video", "_blank");
  };

  target.appendChild(tutorial_btn);

  console.log("[NUWorks] History navigation button injected successfully.");
}

function handleAppliedJobsPage() {
  injectHistoryNavButton();
  injectApplicationBadges();
}

let lastProcessedJobId = null;

function handleJobDetailPage() {
  const currentUrl = location.href;
  // Match .../jobs/detail/:jobId
  if (currentUrl.includes("/students/app/jobs/detail/")) {
    const parts = currentUrl.split("/");
    const jobId = parts[parts.length - 1].split("?")[0]; // handle query params

    if (jobId && jobId !== lastProcessedJobId) {
      console.log(`Job Detail Page Detected: ${jobId}. Triggering auto-grade...`);
      lastProcessedJobId = jobId;

      // Construct a single-item job list to send to background
      // The background script expects a list of objects (with job_id)
      const jobData = [{ job_id: jobId }];

      triggerAutoGrade(jobData, () => {
        console.log(`Auto-grade triggered for single job: ${jobId}`);
      });
    }
  } else {
    // Reset if we leave the page so we can re-trigger if we come back to a different one (or same)
    if (!currentUrl.includes("/students/app/jobs/detail/")) {
       lastProcessedJobId = null;
    }
  }
}

function checkUrl() {
  // Stop polling if extension context is gone
  if (!isContextValid()) {
    if (checkUrlIntervalId) {
      clearInterval(checkUrlIntervalId);
      checkUrlIntervalId = null;
    }
    console.log("NUWorks: Extension context invalidated, stopping polling.");
    return;
  }

  // Keep the injected design tokens present even if the host SPA wipes <head>,
  // and pick up any score badges background.js added since the last tick.
  injectDesignTokens();
  watchInjectedBadges();
  restyleInjectedBadges();

  const currentUrl = location.href;

  // Poll for application history page injection
  if (currentUrl.includes("/student/applicationhistory")) {
    handleApplicationHistoryPage();
  }

  // Poll for Applied Jobs page
  if (currentUrl.includes("/students/app/jobs/applied")) {
    handleAppliedJobsPage();
  }

  if (currentUrl !== lastUrl) {
    console.log("URL changed to:", currentUrl);

    // Check if we are transitioning FROM a non-search page (like Discovery) TO the search page
    const wasSearch = lastUrl.includes("/students/app/jobs/search");
    const isSearch = currentUrl.includes("/students/app/jobs/search");

    lastUrl = currentUrl;

    if (isSearch) {
      removeGradeButton();

      // If we came from Discovery/Home, FORCE RELOAD to clear stale state and trigger auto-run
      if (!wasSearch) {
        console.log(
          "Transition from Discovery to Search detected. Reloading to force clean state..."
        );
        // window.location.reload();
        return;
      }

      // Auto-trigger if we have search data already and didn't just reload
      if (searchJobData) {
        console.log("Search page detected with cached data. Triggering...");
        triggerAutoGrade(searchJobData);
      }
    } else {
      // Discover or Home page
      injectGradeButton();
      // Button state will be updated by injection or listener
    }
  }

  // Always check for job detail page logic
  handleJobDetailPage();
}

// Publish the design tokens before anything is injected
injectDesignTokens();
watchInjectedBadges();

// Start trying to inject the button
injectGradeButton();
handleApplicationHistoryPage();
// Initial check for applied page (if user reloads on that page)
if (location.href.includes("/students/app/jobs/applied")) {
  handleAppliedJobsPage();
}

// Monitor URL changes
checkUrlIntervalId = setInterval(checkUrl, 1000);

// Listen for messages from the interceptor
window.addEventListener("message", function (event) {
  // We only accept messages from ourselves
  if (event.source !== window) return;
  if (!isContextValid()) return;

  if (event.data.type && event.data.type === "NUWORKS_JOB_DISCOVERY") {
    const data = event.data.data;
    const url = event.data.url;

    console.log("Interceptor Message Received. URL:", url);
    if (!data) {
      console.error("Data is null/undefined for URL:", url);
      return;
    }

    // Detailed structure inspection
    const keys = Object.keys(data);
    const isArray = Array.isArray(data);
    console.log(`Analyzing data from ${url}`);
    // console.log(`DEBUG: IsArray=${isArray}, Keys=${keys.join(", ")}`);

    // 1. Filter ignored URLs
    if (isIgnoredUrl(url)) {
      // console.log("Ignored irrelevant API URL:", url);
      return;
    }

    // 2. Validate & Normalize Data
    // Discovery Endpoint has a unique, deep structure:
    // { models: { jobs: { category1: { jobs: [...] }, category2: { jobs: [...] } } } }
    let dataToUse = null;

    if (isDiscoveryApiUrl(url)) {
      console.log("Parsing Discovery-specific data structure...");
      try {
        if (data?.models?.jobs) {
          const allJobs = [];
          Object.values(data.models.jobs).forEach((category) => {
            if (category && Array.isArray(category.jobs)) {
              allJobs.push(...category.jobs);
            }
          });
          if (allJobs.length > 0) {
            dataToUse = allJobs;
            console.log(
              `Discovery Normalization: Extracted ${allJobs.length} jobs from categories.`
            );
          }
        }
      } catch (e) {
        console.error("Error parsing discovery data:", e);
      }

      if (!dataToUse) {
        console.log(
          "Discovery data structure did not match expected format or contained no jobs."
        );
        // Fallback to basic check just in case, or return?
        // If we failed to parse specific structure, we should probably fail safe.
        // But let's check isJobList as a hail mary if the structure changed.
        if (isJobList(data)) {
          dataToUse = data; // Very unlikely based on the user report
        } else {
          return;
        }
      }
    } else {
      // GENERIC / SEARCH ENDPOINTS
      if (!isJobList(data)) {
        console.log("Ignored non-list data from URL:", url);
        return;
      }

      // Generic normalization (e.g. { models: [...] })
      if (data.models && Array.isArray(data.models)) {
        dataToUse = data.models;
      } else {
        dataToUse = data;
      }
    }

    // 3. Route Data
    if (isSearchApiUrl(url)) {
      // It's Search Data OR Generic Job Data (e.g. from widgets)
      searchJobData = dataToUse;
      console.log("Updated SEARCH/GENERIC job data from:", url);
      console.log("Triggering auto-grade for generic data immediately.");

      // AUTO-TRIGGER ALWAYS for generic data, regardless of page
      triggerAutoGrade(searchJobData);
    } else {
      // It's Discovery / Home Data OR generic data that didn't look like search (no perPage)
      const isDiscoverySpecific = isDiscoveryApiUrl(url);

      if (isDiscoverySpecific) {
        discoveryJobData = dataToUse;
        console.log(
          `Updated DISCOVERY job data from PRIORITY endpoint (${dataToUse.length} jobs).`
        );

        // If currently NOT on search page, update the button
        if (!window.location.href.includes("/students/app/jobs/search")) {
          // If button exists, update it. If not, inject it.
          if (gradeButton) {
            refreshGradeButtonReady();
          } else {
            injectGradeButton();
          }
        }
      } else {
        // If it fell through here, it's a generic job list on the discovery page that didn't match isSearchApiUrl.
        // Treated as generic auto-run data.
        console.log(
          `Generic job data detected on Discovery (fallback). URL: ${url}`
        );
        console.log("Triggering auto-grade for generic fallback data.");
        triggerAutoGrade(dataToUse);
      }
    }
  }
});
