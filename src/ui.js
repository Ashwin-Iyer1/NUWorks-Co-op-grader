/**
 * ui.js
 * Handles DOM manipulation and View management
 */

import ApiHelper from "./api.js";
import StorageHelper from "./storage.js";
import { ELIGIBILITY_COPY } from "./matcher.js";

/**
 * Product-wide score bands. Kept in one place because the badge class
 * (`score-high`) and the bar class (`bar-high`) are mechanically derived from
 * the same token — renaming one family means renaming both.
 */
const scoreTier = (score) => {
  const n = Number(score) || 0;
  if (n >= 70) return "high";
  if (n >= 40) return "medium";
  return "low";
};

/**
 * Resting label of the "Save all results" primary action. The click handler
 * mutates the button text in place, so every re-render has to put this back.
 * Must stay in sync with the literal in index.html.
 */
const SAVE_ALL_LABEL = "Save all results";

/** Clamp an arbitrary engine sub-score into a renderable 0-100 integer. */
const clampScore = (value) => {
  const n = Number(value);
  if (!isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
};

const UiHelper = {
  // Industry Data
  industryMap: {
    "Accounting Services": 74,
    "Advertising / Marketing / Public Relations": 75,
    Aerospace: 11,
    Agriculture: 12,
    "Apparel / Textiles / Fashion": 76,
    "Architecture / Urban Planning": 77,
    "Artifical Intelligence": 112,
    "Arts & Design": 78,
    Assocations: 79,
    Automation: 58,
    Automotive: 118,
    "Biomedical / Medical Devices": 111,
    Chemicals: 102,
    "Computer Software": 147,
    "Construction & Building Trades": 80,
    Consulting: 24,
    "Consumer Products": 22,
    "Cosmetics & Beauty": 139,
    Cybersecurity: 110,
    Defense: 109,
    "Educational Instruction and Administration": 81,
    "Electronic / Electrical Manufacturing": 108,
    "Energy & Environmental Resources": 82,
    Engineering: 30,
    "Engineering Design & Consulting": 107,
    "Entertainment / Performing Arts": 29,
    "Environmental Services": 117,
    "Event Services": 140,
    "Finance / Financial Services": 83,
    "Finance / Fintech (Financial Technology)": 116,
    "Finance / Investment Banking": 141,
    "Finance / Investment Management": 142,
    "Finance / Venture Capital & Private Equity": 143,
    "Food, Beverage and Tobacco": 84,
    Forensics: 122,
    Gaming: 144,
    "Government / Public Sector / Muncipal, State or Federal Agency": 85,
    Healthcare: 86,
    "Healthcare/Medical Equipment": 127,
    "Hospitality / Travel & Leisure": 87,
    "Human Resources & Staffing": 88,
    "Information Technology & Services": 89,
    Insurance: 103,
    "Internet & E-Commerce": 90,
    "Internet of Things": 115,
    Journalism: 121,
    Landscaping: 91,
    "Legal / Law": 92,
    "Logistics / Supply Chain / Transportation": 123,
    "Luxury Goods": 145,
    "Manufacturing / Machinery & Equipment": 93,
    Marine: 114,
    "Market Research": 146,
    "Media / Publishing": 130,
    Other: 101,
    "Pharmaceuticals / Biotechnology": 95,
    "Product Development": 120,
    "Public Health": 113,
    "Real Estate": 57,
    Research: 119,
    "Research & Development": 106,
    "Retail & Wholesale": 96,
    Robotics: 105,
    "Semiconductor Industry": 104,
    "Social Services / Non-Profits": 98,
    "Sports / Fitness / Wellness": 99,
    Technology: 97,
    Telecommunications: 64,
  },
  selectedIndustries: new Set(),

  get elements() {
    return {
      mainView: document.getElementById("main-view"),
      resumeView: document.getElementById("resume-view"),
      wrongPageView: document.getElementById("wrong-page-view"),
      wrongPageViewHome: document.getElementById("wrong-page-view-home"),
      missingAuthView: document.getElementById("missing-auth-view"),
      analysisView: document.getElementById("analysis-view"),
      analysisResults: document.getElementById("analysis-results"),

      // Inputs
      getJobsBtn: document.getElementById("get-jobs-btn"),
      settingsBtn: document.getElementById("settings-btn"),
      removeInactiveBtn: document.getElementById("remove-inactive"),
      backToMainBtn: document.getElementById("back-to-main-btn"),
      saveResumeBtn: document.getElementById("save-resume-btn"),
      cancelResumeBtn: document.getElementById("cancel-resume-btn"),

      retryAuthBtn: document.getElementById("retry-auth-btn"),
      retryHomeBtn: document.getElementById("retry-home-btn"),
      retryAnalyzeBtn: document.getElementById("retry-analyze-btn"),
      analyzeStatus: document.getElementById("analyze-status"),
      resumeError: document.getElementById("resume-error"),

      minMatchSlider: document.getElementById("min-match-slider"),
      minMatchValue: document.getElementById("min-match-value"),
      resumeText: document.getElementById("resume-text"),
      resumeFile: document.getElementById("resume-file"),
      debugPdfBtn: document.getElementById("debug-pdf-btn"),
      schoolYear: document.getElementById("school-year"),
      gradDate: document.getElementById("grad-date"),
      autoGrading: document.getElementById("auto-grading"),

      // Industry Dropdown Elements
      industryDisplay: document.getElementById("industry-selected-display"),
      industryList: document.getElementById("industry-dropdown-list"),
      industrySearch: document.getElementById("industry-search"),
      industryOptions: document.getElementById("industry-options"),

      // Status
      cookieMsg: document.getElementById("cookie-check"),
      authMsg: document.getElementById("auth-check"),
    };
  },

  initIndustryDropdown: () => {
    const { industryDisplay, industryList, industrySearch, industryOptions } =
      UiHelper.elements;

    // Check if elements exist (safety)
    if (
      !industryDisplay ||
      !industryList ||
      !industrySearch ||
      !industryOptions
    )
      return;

    // Populate options
    const industries = Object.entries(UiHelper.industryMap).sort((a, b) =>
      a[0].localeCompare(b[0])
    );

    const renderOptions = (filter = "") => {
      industryOptions.innerHTML = "";
      const lowerFilter = filter.toLowerCase();

      industries.forEach(([name, id]) => {
        if (name.toLowerCase().includes(lowerFilter)) {
          const div = document.createElement("div");
          div.className = "dropdown-item";
          if (UiHelper.selectedIndustries.has(id)) {
            div.classList.add("selected");
          }
          div.textContent = name;
          div.dataset.id = id;
          div.onclick = (e) => {
            e.stopPropagation(); // Prevent closing
            UiHelper.toggleIndustry(id, div);
          };
          industryOptions.appendChild(div);
        }
      });
    };

    // Initial render
    renderOptions();

    // Toggle dropdown visibility
    industryDisplay.onclick = (e) => {
      e.stopPropagation();
      industryList.classList.toggle("hidden");
      if (!industryList.classList.contains("hidden")) {
        industrySearch.focus();
      }
    };

    // Search filter
    industrySearch.oninput = (e) => {
      renderOptions(e.target.value);
    };

    // Click outside to close
    document.addEventListener("click", (e) => {
      if (!industryList.contains(e.target) && e.target !== industryDisplay) {
        industryList.classList.add("hidden");
      }
    });
  },

  toggleIndustry: (id, element) => {
    if (UiHelper.selectedIndustries.has(id)) {
      UiHelper.selectedIndustries.delete(id);
      element.classList.remove("selected");
    } else {
      UiHelper.selectedIndustries.add(id);
      element.classList.add("selected");
    }

    UiHelper.updateIndustryDisplay();
  },

  updateIndustryDisplay: () => {
    const size = UiHelper.selectedIndustries.size;
    const display = UiHelper.elements.industryDisplay;

    if (size === 0) {
      display.textContent = "Select industries...";
      display.classList.remove("has-selection");
    } else {
      display.textContent = `${size} ${
        size === 1 ? "industry" : "industries"
      } selected`;
      display.classList.add("has-selection");
    }
  },

  /**
   * Hide all major views
   */
  hideAllViews: () => {
    const {
      mainView,
      resumeView,
      wrongPageView,
      wrongPageViewHome,
      missingAuthView,
      analysisView,
    } = UiHelper.elements;
    [
      mainView,
      resumeView,
      wrongPageView,
      wrongPageViewHome,
      missingAuthView,
      analysisView,
    ].forEach((el) => {
      if (el) el.classList.add("hidden");
    });
  },

  showMainView: () => {
    UiHelper.hideAllViews();
    if (UiHelper.elements.mainView)
      UiHelper.elements.mainView.classList.remove("hidden");
  },

  /**
   * @param {boolean} isFirstRun When true the user has no saved resume yet, so
   *   the Cancel button is removed entirely — it can only ever reject them.
   *   Uses the `hidden` property rather than the `.hidden` class so it never
   *   collides with the view-switching mechanism.
   */
  showResumeView: (isFirstRun = false) => {
    UiHelper.hideAllViews();
    const cancelBtn = document.getElementById("cancel-resume-btn");
    if (cancelBtn) cancelBtn.hidden = !!isFirstRun;
    if (UiHelper.elements.resumeView)
      UiHelper.elements.resumeView.classList.remove("hidden");
  },

  /**
   * Show an inline message under the resume field. Pass no message to clear.
   * The popup closes whenever it loses focus, so this replaces alert() —
   * a modal the user can dismiss by accident is worse than no message.
   * @param {string} message
   * @param {"error"|"ok"} [tone]
   */
  setResumeError: (message, tone = "error") => {
    const el = document.getElementById("resume-error");
    if (!el) return;
    if (message) {
      el.textContent = message;
      el.classList.toggle("is-ok", tone === "ok");
      el.hidden = false;
    } else {
      el.textContent = "";
      el.classList.remove("is-ok");
      el.hidden = true;
    }
  },

  /** Write the staged progress / failure line under "Analyze jobs". */
  setAnalyzeStatus: (message, isError = false) => {
    const el = document.getElementById("analyze-status");
    if (!el) return;
    el.textContent = message || "";
    el.classList.toggle("is-error", !!message && !!isError);
  },

  showAnalysisView: () => {
    UiHelper.hideAllViews();
    if (UiHelper.elements.analysisView)
      UiHelper.elements.analysisView.classList.remove("hidden");
  },

  showWrongPageView: () => {
    UiHelper.hideAllViews();
    if (UiHelper.elements.wrongPageView)
      UiHelper.elements.wrongPageView.classList.remove("hidden");
  },

  showWrongPageViewHome: () => {
    UiHelper.hideAllViews();
    if (UiHelper.elements.wrongPageViewHome)
      UiHelper.elements.wrongPageViewHome.classList.remove("hidden");
  },

  showMissingAuthView: () => {
    UiHelper.hideAllViews();
    if (UiHelper.elements.missingAuthView)
      UiHelper.elements.missingAuthView.classList.remove("hidden");
  },

  // Both banners are styled to disappear when empty (`:empty`), so the cleared
  // branch is what hides them again after credentials are captured on retry.
  updateDebugStatus: (hasCookie, hasAuth) => {
    if (UiHelper.elements.cookieMsg) {
      UiHelper.elements.cookieMsg.innerText = hasCookie
        ? ""
        : "Cookie not found";
    }
    if (UiHelper.elements.authMsg) {
      UiHelper.elements.authMsg.innerText = hasAuth
        ? ""
        : "Authorization not found";
    }
  },

  /**
   * One labelled mini-bar inside the "Why this score?" breakdown.
   */
  createMetricRow: (label, rawValue) => {
    const value = clampScore(rawValue);

    const row = document.createElement("div");
    row.className = "detail-metric";

    const name = document.createElement("span");
    name.className = "detail-metric-label";
    name.textContent = label;

    const track = document.createElement("div");
    track.className = "score-bar-container";
    const fill = document.createElement("div");
    fill.className = `score-bar bar-${scoreTier(value)}`;
    fill.style.width = `${value}%`;
    track.appendChild(fill);

    const readout = document.createElement("span");
    readout.className = "detail-metric-value";
    readout.textContent = `${value}%`;

    row.appendChild(name);
    row.appendChild(track);
    row.appendChild(readout);
    return row;
  },

  /**
   * Native <details> breakdown of how the score was reached. Keyboard-operable
   * with zero JS state. Every engine field is read defensively so an older or
   * partial matchDetails payload degrades instead of throwing.
   */
  createScoreDetail: (details) => {
    const d = details && typeof details === "object" ? details : {};

    const wrapper = document.createElement("details");
    wrapper.className = "score-detail";

    const summary = document.createElement("summary");
    summary.className = "score-detail-summary";
    summary.textContent = "Why this score?";
    wrapper.appendChild(summary);

    const body = document.createElement("div");
    body.className = "score-detail-body";

    const found = Number(d.hardSkillsFound) || 0;
    const matched = Number(d.hardSkillsMatched) || 0;

    const line = document.createElement("p");
    line.className = "score-detail-line";
    line.textContent =
      found === 0
        ? "This posting didn't name specific skills, so the score comes from keyword overlap."
        : `You have ${matched} of the ${found} skills this posting names.`;
    body.appendChild(line);

    body.appendChild(UiHelper.createMetricRow("Skills", d.hardSkillScore));
    body.appendChild(UiHelper.createMetricRow("Keywords", d.keywordScore));

    if (d.confidence === "low") {
      const thin = document.createElement("span");
      thin.className = "thin-marker";
      thin.textContent = "Thin description";
      thin.title =
        "This posting had almost no description text, so the score is a rough guess.";
      body.appendChild(thin);
    }

    wrapper.appendChild(body);
    return wrapper;
  },

  /**
   * A labelled group of skill chips ("You have" / "They want").
   */
  createSkillGroup: (label, skills, variant, requiredNames) => {
    const group = document.createElement("div");
    group.className = "snippet-group";

    const heading = document.createElement("span");
    heading.className = "snippet-label";
    heading.textContent = label;
    group.appendChild(heading);

    const tags = document.createElement("div");
    tags.className = "snippet-tags";

    skills.forEach((skill) => {
      const tag = document.createElement("span");
      const isRequired =
        variant === "missing" &&
        requiredNames instanceof Set &&
        requiredNames.has(String(skill).toLowerCase());

      tag.className = isRequired
        ? `skill-tag ${variant} required`
        : `skill-tag ${variant}`;
      if (isRequired) tag.title = "This posting lists this skill as required.";
      tag.textContent = skill;
      tags.appendChild(tag);
    });

    group.appendChild(tags);
    return group;
  },

  /**
   * Render individual job card
   */
  createJobCard: (job) => {
    const card = document.createElement("div");
    card.className = "job-card";

    const title = document.createElement("div");
    title.className = "job-title";
    title.innerText = job.job_title;

    const company = document.createElement("div");
    company.className = "job-company";
    company.innerText = job.name || "Unknown Employer";

    // Score badge with tier class. `score-{tier}` and `bar-{tier}` are the same
    // token by construction — see scoreTier() above.
    const score = job.matchScore;
    const tier = scoreTier(score);

    const scoreLine = document.createElement("div");
    scoreLine.className = `job-score score-${tier}`;
    scoreLine.textContent = `${score}%`;

    // Score bar
    const barContainer = document.createElement("div");
    barContainer.className = "score-bar-container";
    const bar = document.createElement("div");
    bar.className = `score-bar bar-${tier}`;
    bar.style.width = `${score}%`;
    barContainer.appendChild(bar);

    // "Why this score?"
    const matchDetails =
      job.matchDetails && typeof job.matchDetails === "object"
        ? job.matchDetails
        : {};
    const details =
      matchDetails.details && typeof matchDetails.details === "object"
        ? matchDetails.details
        : {};
    const scoreDetail = UiHelper.createScoreDetail(details);

    // Skill tags
    const snippets = document.createElement("div");
    snippets.className = "job-snippets";

    const matchedSkills = Array.isArray(matchDetails.matches)
      ? matchDetails.matches.slice(0, 6)
      : [];
    const missingSkills = Array.isArray(matchDetails.missing)
      ? matchDetails.missing.slice(0, 3)
      : [];

    // `missing` already arrives required-first from the engine; this set only
    // decides which chips get the emphasis treatment.
    const requiredNames = new Set(
      (Array.isArray(details.missingRequired) ? details.missingRequired : []).map(
        (name) => String(name).toLowerCase()
      )
    );

    if (matchedSkills.length > 0) {
      snippets.appendChild(
        UiHelper.createSkillGroup("You have", matchedSkills, "matched", null)
      );
    }
    if (missingSkills.length > 0) {
      snippets.appendChild(
        UiHelper.createSkillGroup(
          "They want",
          missingSkills,
          "missing",
          requiredNames
        )
      );
    }

    // Action Line
    const actionLine = document.createElement("div");
    actionLine.className = "job-actions";

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.innerText = "Save";
    saveBtn.className = "btn-primary";

    saveBtn.onclick = async () => {
      saveBtn.innerText = "Saving...";
      saveBtn.disabled = true;

      const creds = await StorageHelper.getCredentials();
      const success = await ApiHelper.favoriteJob(job.job_id, creds);

      if (success) {
        // Single class toggle — the saved look lives in styles.css so it stays
        // on the token palette instead of hardcoded inline greens.
        saveBtn.className = "btn-primary is-saved";
        saveBtn.innerText = "Saved";
      } else {
        saveBtn.innerText = "Try again";
        saveBtn.disabled = false;
      }
    };

    actionLine.appendChild(saveBtn);

    card.appendChild(title);
    card.appendChild(company);
    card.appendChild(scoreLine);
    card.appendChild(barContainer);
    card.appendChild(scoreDetail);
    if (matchedSkills.length > 0 || missingSkills.length > 0)
      card.appendChild(snippets);
    card.appendChild(actionLine);

    return card;
  },

  /**
   * Empty state that names the actual cause instead of "No jobs found."
   * @param {Object} summary { fetchedCount, droppedIneligible, droppedByScore,
   *   minScore, reasons, onShowAll }
   */
  createEmptyState: (summary) => {
    const s = summary && typeof summary === "object" ? summary : {};
    const fetchedCount =
      typeof s.fetchedCount === "number" ? s.fetchedCount : null;
    const droppedByScore = Number(s.droppedByScore) || 0;
    const droppedIneligible = Number(s.droppedIneligible) || 0;
    const minScore = Number(s.minScore) || 0;

    const wrap = document.createElement("div");
    wrap.className = "empty-state";

    const heading = document.createElement("p");
    heading.className = "empty-state-title";
    const body = document.createElement("p");
    body.className = "empty-state-body";

    if (fetchedCount === 0) {
      heading.textContent = "No jobs matched that search";
      body.textContent =
        "Try a longer posted-within window, fewer industries, or a different job type.";
      wrap.appendChild(heading);
      wrap.appendChild(body);
    } else if (droppedByScore > 0) {
      heading.textContent = `No jobs above ${minScore}% match`;
      body.textContent = `${droppedByScore} jobs scored below your minimum. Lower the minimum match slider, or show them all.`;
      wrap.appendChild(heading);
      wrap.appendChild(body);

      if (typeof s.onShowAll === "function") {
        const showAll = document.createElement("button");
        showAll.type = "button";
        showAll.className = "btn btn-secondary btn-sm";
        showAll.textContent = `Show all ${droppedByScore} matches`;
        showAll.addEventListener("click", () => s.onShowAll());
        wrap.appendChild(showAll);
      }
    } else if (droppedIneligible > 0) {
      heading.textContent = "Nothing you're eligible for";
      body.textContent = `All ${droppedIneligible} jobs were filtered out by NUWorks eligibility or by this posting's class-year language.`;
      wrap.appendChild(heading);
      wrap.appendChild(body);

      const reasons =
        s.reasons && typeof s.reasons === "object" ? s.reasons : null;
      const entries = reasons
        ? Object.entries(reasons).filter(([, count]) => Number(count) > 0)
        : [];

      if (entries.length > 0) {
        entries.sort((a, b) => Number(b[1]) - Number(a[1]));
        const list = document.createElement("ul");
        list.className = "empty-reasons";
        entries.forEach(([reason, count]) => {
          const item = document.createElement("li");
          // `reason` can be null/unknown; never render "undefined".
          const copy = ELIGIBILITY_COPY[reason] || ELIGIBILITY_COPY.server;
          item.textContent = `${count} — ${copy}`;
          list.appendChild(item);
        });
        wrap.appendChild(list);
      }
    } else {
      heading.textContent = "No jobs found";
      body.textContent =
        "Nothing came back for this search. Try widening your filters.";
      wrap.appendChild(heading);
      wrap.appendChild(body);
    }

    return wrap;
  },

  /**
   * Render list of jobs
   * @param {Array} jobs
   * @param {Object} [summary] Accounting for where the fetched jobs went.
   *   Omitted when restoring a persisted result set, in which case the count
   *   falls back to a plain total.
   */
  renderJobs: (jobs, summary) => {
    const container = UiHelper.elements.analysisResults;
    if (!container) return;

    container.innerHTML = ""; // Clear

    const list = Array.isArray(jobs) ? jobs : [];
    const s = summary && typeof summary === "object" ? summary : {};
    const fetchedCount =
      typeof s.fetchedCount === "number" ? s.fetchedCount : null;

    // Update count display
    const countEl = document.getElementById("analysis-count");
    if (countEl) {
      if (fetchedCount !== null) {
        countEl.textContent = `${list.length} of ${fetchedCount}`;
      } else if (list.length > 0) {
        countEl.textContent = `${list.length} ${
          list.length === 1 ? "job" : "jobs"
        } found`;
      } else {
        countEl.textContent = "";
      }
    }

    const saveAllBtn = document.getElementById("save-results-btn");

    if (list.length === 0) {
      container.appendChild(UiHelper.createEmptyState(s));
      if (saveAllBtn) saveAllBtn.classList.add("hidden");
      return;
    }

    if (saveAllBtn) saveAllBtn.classList.remove("hidden");

    list.forEach((job) => {
      const card = UiHelper.createJobCard(job);
      container.appendChild(card);
    });

    // Hook up "Save All" button logic here or in main controller?
    // It's cleaner to keep the specific "Save All" logic with reference to this specific `jobs` list here
    // OR expose a setter.
    UiHelper.setupSaveAllButton(list);
  },

  setupSaveAllButton: (jobs) => {
    const saveResultsBtn = document.getElementById("save-results-btn");
    if (saveResultsBtn) {
      // Clone to remove old listeners. The clone inherits whatever label the
      // previous run left behind ("Saved 12 jobs (0 failed)"), so reset it —
      // this button now saves a brand new result set.
      const newBtn = saveResultsBtn.cloneNode(true);
      newBtn.innerText = SAVE_ALL_LABEL;
      newBtn.disabled = false;
      saveResultsBtn.parentNode.replaceChild(newBtn, saveResultsBtn);

      newBtn.addEventListener("click", async () => {
        newBtn.disabled = true;
        newBtn.innerText = "Reading credentials...";

        const creds = await StorageHelper.getCredentials();

        newBtn.innerText = "Saving all...";
        const results = await Promise.all(
          jobs.map((job) => ApiHelper.favoriteJob(job.job_id, creds))
        );

        const successCount = results.filter((s) => s).length;
        const failCount = results.length - successCount;

        newBtn.innerText = `Saved ${successCount} jobs (${failCount} failed)`;
        newBtn.disabled = false;
      });
    }
  },

  // Parameter getters
  getSearchParams: () => {
    const industryIds = Array.from(UiHelper.selectedIndustries).join(",");

    return {
      perPage: document.getElementById("perPage").value,
      page: 0,
      sort: "!postdate",
      ...(document.getElementById("qualifications").value
        ? { ocr: document.getElementById("qualifications").value }
        : {}),
      job_type: document.getElementById("job_type").value,
      postdate: document.getElementById("postdate").value,
      json_mode: "read_only",
      exclude_applied_jobs: document.getElementById("exclude_applied_jobs")
        .checked
        ? "1"
        : "0",
      enable_translation: "False",
      industry: industryIds, // Add selected industries
    };
  },

  getMinMatchScore: () => {
    const slider = UiHelper.elements.minMatchSlider;
    return slider ? parseInt(slider.value, 10) : 0;
  },
};

export default UiHelper;
