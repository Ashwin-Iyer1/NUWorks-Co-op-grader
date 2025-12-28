/**
 * ui.js
 * Handles DOM manipulation and View management
 */

const UiHelper = {
  get elements() {
    return {
      mainView: document.getElementById("main-view"),
      resumeView: document.getElementById("resume-view"),
      wrongPageView: document.getElementById("wrong-page-view"),
      missingAuthView: document.getElementById("missing-auth-view"),
      analysisView: document.getElementById("analysis-view"),
      analysisResults: document.getElementById("analysis-results"),

      // Inputs
      getJobsBtn: document.getElementById("get-jobs-btn"),
      settingsBtn: document.getElementById("settings-btn"),
      backToMainBtn: document.getElementById("back-to-main-btn"), // Added explicitly if missing before
      saveResumeBtn: document.getElementById("save-resume-btn"),
      cancelResumeBtn: document.getElementById("cancel-resume-btn"),

      minMatchSlider: document.getElementById("min-match-slider"),
      minMatchValue: document.getElementById("min-match-value"),
      resumeText: document.getElementById("resume-text"),
      resumeFile: document.getElementById("resume-file"),
      debugPdfBtn: document.getElementById("debug-pdf-btn"),

      // Status
      cookieMsg: document.getElementById("cookie-check"),
      authMsg: document.getElementById("auth-check"),
    };
  },

  /**
   * Hide all major views
   */
  hideAllViews: () => {
    const {
      mainView,
      resumeView,
      wrongPageView,
      missingAuthView,
      analysisView,
    } = UiHelper.elements;
    [
      mainView,
      resumeView,
      wrongPageView,
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
  createJobCard: (job) => {
    const card = document.createElement("div");
    card.style.border = "1px solid #ddd";
    card.style.marginBottom = "10px";
    card.style.padding = "10px";
    card.style.borderRadius = "5px";
    card.style.backgroundColor = "#fff";

    const title = document.createElement("div");
    title.style.fontWeight = "bold";
    title.style.fontSize = "1.1em";
    title.innerText = job.job_title;

    const company = document.createElement("div");
    company.style.fontSize = "0.9em";
    company.style.color = "#555";
    company.innerText = job.employer ? job.employer.name : "Unknown Employer";

    const scoreLine = document.createElement("div");
    scoreLine.style.marginTop = "5px";
    scoreLine.style.fontWeight = "bold";

    const score = job.matchScore;
    let color = "#d9534f"; // red
    if (score >= 70) color = "#5cb85c"; // green
    else if (score >= 40) color = "#f0ad4e"; // orange

    scoreLine.innerHTML = `<span style="color: ${color};">${score}% Match</span>`;

    const snippets = document.createElement("div");
    snippets.style.fontSize = "0.8em";
    snippets.style.color = "#777";
    snippets.style.marginTop = "5px";

    const matches =
      job.matchDetails && job.matchDetails.matches
        ? job.matchDetails.matches.slice(0, 5).join(", ")
        : "";
    if (matches) {
      snippets.innerText = `Matched: ${matches}`;
    }

    // Action Line
    const actionLine = document.createElement("div");
    actionLine.style.marginTop = "10px";
    actionLine.style.textAlign = "right";

    // Save Button
    const saveBtn = document.createElement("button");
    saveBtn.innerText = "Save";
    saveBtn.style.marginLeft = "10px";
    saveBtn.style.padding = "2px 8px";
    saveBtn.style.cursor = "pointer";
    saveBtn.className = "btn-primary";
    saveBtn.style.fontSize = "0.8em";
    saveBtn.style.width = "auto";

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
    return {
      perPage: document.getElementById("perPage").value,
      page: 0,
      sort: "!postdate",
      ocr: "f",
      job_type: document.getElementById("job_type").value,
      postdate: document.getElementById("postdate").value,
      json_mode: "read_only",
      exclude_applied_jobs: document.getElementById("exclude_applied_jobs")
        .checked
        ? "1"
        : "0",
      enable_translation: "False",
    };
  },

  getMinMatchScore: () => {
    const slider = UiHelper.elements.minMatchSlider;
    return slider ? parseInt(slider.value, 10) : 0;
  },
};

window.UiHelper = UiHelper;
