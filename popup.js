// Popup logic - Refactored
document.addEventListener("DOMContentLoaded", () => {
  const {
    getJobsBtn,
    settingsBtn,
    saveResumeBtn,
    cancelResumeBtn,
    backToMainBtn,
    minMatchSlider,
    minMatchValue,
    resumeText,
  } = UiHelper.elements;

  // --- Event Listeners ---

  // Open Settings (Resume Edit)
  if (settingsBtn) {
    settingsBtn.addEventListener("click", async () => {
      const resume = await StorageHelper.getResume();
      if (resume) {
        UiHelper.elements.resumeText.value = resume;
      }
      UiHelper.showResumeView();
    });
  }

  // Save Resume
  if (saveResumeBtn) {
    saveResumeBtn.addEventListener("click", () => {
      const text = UiHelper.elements.resumeText.value.trim();
      if (!text) {
        alert("Please enter a resume.");
        return;
      }
      StorageHelper.saveResume(text).then(() => {
        console.log("Resume saved");
        UiHelper.showMainView();
      });
    });
  }

  // Cancel Resume Edit
  if (cancelResumeBtn) {
    cancelResumeBtn.addEventListener("click", async () => {
      const resume = await StorageHelper.getResume();
      if (resume && resume.trim() !== "") {
        UiHelper.showMainView();
      } else {
        alert("You must save a resume to continue.");
      }
    });
  }

  // Back Button Listener
  if (backToMainBtn) {
    backToMainBtn.addEventListener("click", () => {
      UiHelper.showMainView();
      StorageHelper.clearState();
    });
  }

  // Slider Listener
  if (minMatchSlider && minMatchValue) {
    minMatchSlider.addEventListener("input", () => {
      minMatchValue.innerText = minMatchSlider.value;
    });
  }

  // Main Initialization Logic
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentTab = tabs[0];
    const url = currentTab.url || "";

    // 1. Check URL
    if (!url.includes("northeastern-csm.symplicity.com")) {
      UiHelper.showWrongPageView();
      return;
    }

    // 2. Load stored credentials & resume check
    StorageHelper.getCredentials().then((result) => {
      const hasCookie = result.cookie && result.cookie.trim() !== "";
      const hasAuth =
        result.authorization && result.authorization.trim() !== "";

      // Update basic checks UI (optional)
      UiHelper.updateDebugStatus(hasCookie, hasAuth);

      // Check if BOTH are present
      if (!hasCookie || !hasAuth) {
        UiHelper.showMissingAuthView();
        return;
      }

      // 3. Resume check
      if (!result.resume || result.resume.trim() === "") {
        UiHelper.showResumeView();
      } else {
        // 4. Persistence Check
        if (result.viewState === "analysis" && result.lastAnalysisResults) {
          UiHelper.renderJobs(result.lastAnalysisResults);
          UiHelper.showAnalysisView();
        } else {
          UiHelper.showMainView();
        }
      }
    });
  });

  // Get Jobs Logic
  if (getJobsBtn) {
    getJobsBtn.addEventListener("click", async () => {
      getJobsBtn.disabled = true;
      getJobsBtn.innerText = "Analyzing...";

      try {
        // Get resume and credentials
        const storageResult = await StorageHelper.getCredentials();
        const resumeText = storageResult.resume;

        if (!resumeText) {
          alert("Please save a resume first!");
          UiHelper.showResumeView();
          return; // Early return to cleanup in finally
        }

        const params = UiHelper.getSearchParams();

        // Fetch Jobs
        const jobs = await ApiHelper.fetchJobs(params, {
          cookie: storageResult.cookie,
          authorization: storageResult.authorization,
        });

        // --- MATCHING LOGIC ---
        const matcher = new JobMatcher();
        const scoredJobs = jobs.map((job) => {
          const description = job.job_desc || "";
          const title = job.job_title || "";
          const jobFullText = `${title} \n ${description}`;

          const result = matcher.calculateScore(resumeText, jobFullText);

          return {
            ...job,
            matchScore: result.score,
            matchDetails: result,
          };
        });

        // Filter by Min Score
        const minScore = UiHelper.getMinMatchScore();
        const filteredJobs = scoredJobs.filter(
          (job) => job.matchScore >= minScore
        );

        // Sort by score descending
        filteredJobs.sort((a, b) => b.matchScore - a.matchScore);

        // Render Results
        UiHelper.renderJobs(filteredJobs);
        UiHelper.showAnalysisView();

        // PERSIST STATE
        StorageHelper.saveState("analysis", filteredJobs);
      } catch (error) {
        console.error("Fetch/Analysis error:", error);
        alert(`Error: ${error.message}`);
      } finally {
        getJobsBtn.disabled = false;
        getJobsBtn.innerText = "Analyze Jobs";
      }
    });
  }
});
