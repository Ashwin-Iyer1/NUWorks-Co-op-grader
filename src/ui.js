/**
 * ui.js
 * Handles DOM manipulation and View management
 */

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
      backToMainBtn: document.getElementById("back-to-main-btn"),
      saveResumeBtn: document.getElementById("save-resume-btn"),
      cancelResumeBtn: document.getElementById("cancel-resume-btn"),

      minMatchSlider: document.getElementById("min-match-slider"),
      minMatchValue: document.getElementById("min-match-value"),
      resumeText: document.getElementById("resume-text"),
      resumeFile: document.getElementById("resume-file"),
      debugPdfBtn: document.getElementById("debug-pdf-btn"),
      schoolYear: document.getElementById("school-year"),
      gradDate: document.getElementById("grad-date"),

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
      display.textContent = "Select Industries...";
      display.classList.remove("has-selection");
    } else {
      display.textContent = `${size} Industry(s) Selected`;
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

  showResumeView: () => {
    UiHelper.hideAllViews();
    if (UiHelper.elements.resumeView)
      UiHelper.elements.resumeView.classList.remove("hidden");
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

  updateDebugStatus: (hasCookie, hasAuth) => {
    if (!hasCookie && UiHelper.elements.cookieMsg) {
      UiHelper.elements.cookieMsg.innerText = "Cookie not found";
    }
    if (!hasAuth && UiHelper.elements.authMsg) {
      UiHelper.elements.authMsg.innerText = "Authorization not found";
    }
  },

  /**
   * Render individual job card
   */
  /**
   * Render individual job card
   */
  createJobCard: (job) => {
    const card = document.createElement("div");
    card.className = "job-card";

    // Header Section
    const header = document.createElement("div");
    // header.className = "job-header"; // Optional wrapper if we want side-by-side

    const title = document.createElement("div");
    title.className = "job-title";
    title.innerText = job.job_title;

    const company = document.createElement("div");
    company.className = "job-company";
    company.innerText = job.name || "Unknown Employer";

    // Score
    const scoreLine = document.createElement("div");
    const score = job.matchScore;
    let color = "#d9534f"; // red
    if (score >= 70) color = "#5cb85c"; // green
    else if (score >= 40) color = "#f0ad4e"; // orange

    scoreLine.className = "job-score";
    scoreLine.innerHTML = `<span style="color: ${color};">${score}% Match</span>`;

    // Snippets / Matches
    const snippets = document.createElement("div");
    snippets.className = "job-snippets";

    const matches =
      job.matchDetails && job.matchDetails.matches
        ? job.matchDetails.matches.slice(0, 5).join(", ")
        : "";

    if (matches) {
      snippets.innerText = `Matched: ${matches}`;
    }

    // Action Line
    const actionLine = document.createElement("div");
    actionLine.className = "job-actions";

    // Save Button
    const saveBtn = document.createElement("button");
    saveBtn.innerText = "Save";
    saveBtn.className = "btn-primary"; // Re-using existing button class
    saveBtn.style.padding = "6px 16px"; // Specific override for card button to be smaller if needed, or rely on CSS
    saveBtn.style.width = "auto";
    saveBtn.style.fontSize = "0.85rem";

    // Wire up save click
    saveBtn.onclick = async () => {
      saveBtn.innerText = "Saving...";
      saveBtn.disabled = true;

      // Use helper to get fresh creds
      const creds = await StorageHelper.getCredentials();
      const success = await ApiHelper.favoriteJob(job.job_id, creds);

      if (success) {
        saveBtn.innerText = "Saved!";
        saveBtn.style.backgroundColor = "green";
      } else {
        saveBtn.innerText = "Error";
        saveBtn.disabled = false;
      }
    };

    actionLine.appendChild(saveBtn);

    card.appendChild(title);
    card.appendChild(company);
    card.appendChild(scoreLine);
    if (matches) card.appendChild(snippets);
    card.appendChild(actionLine);

    return card;
  },

  /**
   * Render list of jobs
   */
  renderJobs: (jobs) => {
    const container = UiHelper.elements.analysisResults;
    if (!container) return;

    container.innerHTML = ""; // Clear

    if (!jobs || jobs.length === 0) {
      container.innerHTML = `<p>No jobs found.</p>`;
      return;
    }

    jobs.forEach((job) => {
      const card = UiHelper.createJobCard(job);
      container.appendChild(card);
    });

    // Hook up "Save All" button logic here or in main controller?
    // It's cleaner to keep the specific "Save All" logic with reference to this specific `jobs` list here
    // OR expose a setter.
    UiHelper.setupSaveAllButton(jobs);
  },

  setupSaveAllButton: (jobs) => {
    const saveResultsBtn = document.getElementById("save-results-btn");
    if (saveResultsBtn) {
      // Clone to remove old listeners
      const newBtn = saveResultsBtn.cloneNode(true);
      saveResultsBtn.parentNode.replaceChild(newBtn, saveResultsBtn);

      newBtn.addEventListener("click", async () => {
        newBtn.disabled = true;
        newBtn.innerText = "Reading Creds...";

        const creds = await StorageHelper.getCredentials();

        newBtn.innerText = "Saving All...";
        let successCount = 0;
        let failCount = 0;

        for (const job of jobs) {
          // Rate limiting delay
          await new Promise((r) => setTimeout(r, 500));
          const success = await ApiHelper.favoriteJob(job.job_id, creds);
          if (success) successCount++;
          else failCount++;

          newBtn.innerText = `Saving... (${successCount}/${jobs.length})`;
        }

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

window.UiHelper = UiHelper;
