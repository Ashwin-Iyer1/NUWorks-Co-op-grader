// Copyright (c) 2026 Ashwin Iyer — Licensed under AGPL-3.0

// Shared light/dark theming for the extension's own pages (the popup and the
// Job Explorer). The design tokens define `:root` (light) and `[data-theme="dark"]`
// (dark); this module decides which is active and writes `data-theme` onto <html>.
//
// The user's choice is persisted in chrome.storage.local under THEME_KEY so it is
// shared across every extension page and browser tab. An absent preference means
// "follow the operating system" (prefers-color-scheme); once the user taps the
// sun/moon toggle, an explicit "light"/"dark" is stored and pinned.

export const THEME_KEY = "theme";

export function systemPrefersDark() {
  return !!(
    window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

/** Resolve a stored preference (possibly absent) to a concrete "light" | "dark". */
export function resolveTheme(stored) {
  return stored === "light" || stored === "dark"
    ? stored
    : systemPrefersDark()
    ? "dark"
    : "light";
}

export function applyTheme(resolved) {
  document.documentElement.setAttribute("data-theme", resolved);
}

/**
 * Wire a page up to the shared theme. Applies the current preference (falling
 * back to the OS), flips + persists it when `button` is clicked, and keeps the
 * page in sync when another extension surface changes it or — while no explicit
 * preference is pinned — when the OS setting changes. The sun/moon icon swap is
 * handled in CSS off the `data-theme` attribute, so no render callback is needed.
 *
 * @param {HTMLElement|null} button The sun/moon toggle, if the page has one.
 */
export function setupThemeToggle(button) {
  // undefined until the async storage read resolves; "light"/"dark" once pinned.
  let stored;

  const paint = () => applyTheme(resolveTheme(stored));

  // Apply the OS preference synchronously first so a dark-preferring user never
  // sees a flash of light before the async storage read comes back.
  paint();

  chrome.storage.local.get([THEME_KEY], (res) => {
    stored = res && res[THEME_KEY];
    paint();
  });

  if (button) {
    button.addEventListener("click", () => {
      stored = resolveTheme(stored) === "dark" ? "light" : "dark";
      paint();
      chrome.storage.local.set({ [THEME_KEY]: stored });
    });
  }

  // Another page (or this one, in another tab) changed the preference.
  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes[THEME_KEY]) {
        stored = changes[THEME_KEY].newValue;
        paint();
      }
    });
  }

  // Track the OS setting live, but only while the user hasn't pinned a choice.
  if (window.matchMedia) {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (stored !== "light" && stored !== "dark") paint();
    };
    if (mq.addEventListener) mq.addEventListener("change", handler);
    else if (mq.addListener) mq.addListener(handler);
  }
}
