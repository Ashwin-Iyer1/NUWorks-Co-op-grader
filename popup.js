// Popup logic
document.addEventListener("DOMContentLoaded", () => {
  // UI Elements
  const mainView = document.getElementById("main-view");
  const resumeView = document.getElementById("resume-view");
  const wrongPageView = document.getElementById("wrong-page-view");
  const missingAuthView = document.getElementById("missing-auth-view");

  // Main View Inputs
  const getJobsBtn = document.getElementById("get-jobs-btn");
  const settingsBtn = document.getElementById("settings-btn");

  // Resume View Inputs
  const resumeText = document.getElementById("resume-text");
  const saveResumeBtn = document.getElementById("save-resume-btn");
  const cancelResumeBtn = document.getElementById("cancel-resume-btn");

  // Analysis View Elements
  const analysisView = document.getElementById("analysis-view");
  const analysisResults = document.getElementById("analysis-results");
  const backToMainBtn = document.getElementById("back-to-main-btn");

  // Slider Elements
  const minMatchSlider = document.getElementById("min-match-slider");
  const minMatchValue = document.getElementById("min-match-value");

  // Helper: Switch Views
  const hideAllViews = () => {
    mainView.classList.add("hidden");
    resumeView.classList.add("hidden");
    analysisView.classList.add("hidden");
    wrongPageView.classList.add("hidden");
    missingAuthView.classList.add("hidden");
  };

  const showMainView = () => {
    hideAllViews();
    mainView.classList.remove("hidden");
  };

  const showResumeView = () => {
    hideAllViews();
    resumeView.classList.remove("hidden");
  };

  const showAnalysisView = () => {
    hideAllViews();
    analysisView.classList.remove("hidden");
  };

  const showWrongPageView = () => {
    hideAllViews();
    wrongPageView.classList.remove("hidden");
  };

  const showMissingAuthView = () => {
    hideAllViews();
    missingAuthView.classList.remove("hidden");
  };

  // Main Logic
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentTab = tabs[0];
    const url = currentTab.url || "";

    // 1. Check URL
    if (!url.includes("northeastern-csm.symplicity.com")) {
      showWrongPageView();
      return;
    }

    // 2. Load stored credentials & resume check
    chrome.storage.local.get(
      ["cookie", "authorization", "resume", "viewState", "lastAnalysisResults"],
      (result) => {
        const hasCookie = result.cookie && result.cookie.trim() !== "";
        const hasAuth =
          result.authorization && result.authorization.trim() !== "";

        // Update debug text if element exists (optional/legacy)
        if (!hasCookie) {
          const cookieMsg = document.getElementById("cookie-check");
          if (cookieMsg) cookieMsg.innerText = "Cookie not found";
        }
        if (!hasAuth) {
          const authMsg = document.getElementById("auth-check");
          if (authMsg) authMsg.innerText = "Authorization not found";
        }

        // Check if BOTH are present
        if (!hasCookie || !hasAuth) {
          showMissingAuthView();
          return;
        }

        // 3. Resume check
        if (!result.resume || result.resume.trim() === "") {
          // No resume found, force user to enter one
          showResumeView();
        } else {
          // 4. Persistence Check
          if (result.viewState === "analysis" && result.lastAnalysisResults) {
            renderJobs(result.lastAnalysisResults);
            showAnalysisView();
          } else {
            showMainView();
          }
        }
      }
    );
  });

  // --- Helper: Render Jobs ---
  const renderJobs = (jobs) => {
    analysisResults.innerHTML = ""; // Clear previous

    if (!jobs || jobs.length === 0) {
      analysisResults.innerHTML = `<p>No jobs found.</p>`;
      return;
    }

    jobs.forEach((job) => {
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

      // Color code score
      const score = job.matchScore;
      let color = "#d9534f"; // red
      if (score >= 70) color = "#5cb85c"; // green
      else if (score >= 40) color = "#f0ad4e"; // orange

      scoreLine.innerHTML = `<span style="color: ${color};">${score}% Match</span>`;

      // Optional: details/keywords matched could go here
      const snippets = document.createElement("div");
      snippets.style.fontSize = "0.8em";
      snippets.style.color = "#777";
      snippets.style.marginTop = "5px";
      // Show top 5 matched kws
      const matches =
        job.matchDetails && job.matchDetails.matches
          ? job.matchDetails.matches.slice(0, 5).join(", ")
          : "";
      if (matches) {
        snippets.innerText = `Matched: ${matches}`;
      }

      // Individual Save Button
      const saveBtn = document.createElement("button");
      saveBtn.innerText = "Save";
      saveBtn.style.marginLeft = "10px";
      saveBtn.style.padding = "2px 8px";
      saveBtn.style.cursor = "pointer";
      saveBtn.className = "btn-primary"; // Reuse primary style but smaller if needed
      saveBtn.style.fontSize = "0.8em";
      saveBtn.style.width = "auto"; // Override default full with

      // Context-aware credentials fetch for save button
      saveBtn.onclick = async () => {
        saveBtn.innerText = "Saving...";
        saveBtn.disabled = true;

        // Fetch fresh headers
        chrome.storage.local.get(["cookie", "authorization"], async (creds) => {
          const headers = {
            accept: "application/json, text/plain, */*",
            authorization: creds.authorization,
            "x-requested-system-user": "students",
            Cookie: creds.cookie,
          };
          const success = await favoriteJob(job.job_id, headers);
          if (success) {
            saveBtn.innerText = "Saved!";
            saveBtn.style.backgroundColor = "green";
          } else {
            saveBtn.innerText = "Error";
            saveBtn.disabled = false;
          }
        });
      };

      const actionLine = document.createElement("div");
      actionLine.style.marginTop = "10px";
      actionLine.style.textAlign = "right";
      actionLine.appendChild(saveBtn);

      card.appendChild(title);
      card.appendChild(company);
      card.appendChild(scoreLine);
      if (matches) card.appendChild(snippets);
      card.appendChild(actionLine);

      analysisResults.appendChild(card);
    });

    // Setup "Save All" button listener once per render or handle separately.
    // It's safer to re-attach or ensure existence since we clear the container.
    // But the "Save Results" button is outside the container.

    // We will update the Save All button handler here with closure access to `jobs`
    const saveResultsBtn = document.getElementById("save-results-btn");
    if (saveResultsBtn) {
      const newBtn = saveResultsBtn.cloneNode(true);
      saveResultsBtn.parentNode.replaceChild(newBtn, saveResultsBtn);

      newBtn.addEventListener("click", async () => {
        newBtn.disabled = true;
        newBtn.innerText = "Reading Creds...";

        chrome.storage.local.get(["cookie", "authorization"], async (creds) => {
          const headers = {
            accept: "application/json, text/plain, */*",
            authorization: creds.authorization,
            "x-requested-system-user": "students",
            Cookie: creds.cookie,
          };

          newBtn.innerText = "Saving All...";
          let successCount = 0;
          let failCount = 0;

          for (const job of jobs) {
            // Add a small delay to avoid rate limiting
            await new Promise((r) => setTimeout(r, 500));
            const success = await favoriteJob(job.job_id, headers);
            if (success) successCount++;
            else failCount++;

            newBtn.innerText = `Saving... (${successCount}/${jobs.length})`;
          }

          newBtn.innerText = `Saved ${successCount} jobs (${failCount} failed)`;
          newBtn.disabled = false;
        });
      });
    }
  };

  // Helper to Favorite (moved to outer scope or accessible)
  async function favoriteJob(jobId, headers) {
    const baseUrl = "https://northeastern-csm.symplicity.com";
    const favUrl = `${baseUrl}/api/v2/jobs/${jobId}/favorite`;
    try {
      const response = await fetch(favUrl, {
        method: "POST",
        headers: headers,
      });
      return response.ok;
    } catch (err) {
      console.error("Error saving job:", jobId, err);
      return false;
    }
  }

  // --- Event Listeners ---

  // Open Settings (Resume Edit)
  if (settingsBtn) {
    settingsBtn.addEventListener("click", () => {
      chrome.storage.local.get(["resume"], (result) => {
        if (result.resume) {
          resumeText.value = result.resume;
        }
        showResumeView();
      });
    });
  }

  // Save Resume
  if (saveResumeBtn) {
    saveResumeBtn.addEventListener("click", () => {
      const text = resumeText.value.trim();
      if (!text) {
        alert("Please enter a resume.");
        return;
      }
      chrome.storage.local.set({ resume: text }, () => {
        console.log("Resume saved");
        showMainView();
      });
    });
  }

  // Cancel Resume Edit
  if (cancelResumeBtn) {
    cancelResumeBtn.addEventListener("click", () => {
      // Only allow cancel if we actually have a resume saved
      chrome.storage.local.get(["resume"], (result) => {
        if (result.resume && result.resume.trim() !== "") {
          showMainView();
        } else {
          alert("You must save a resume to continue.");
        }
      });
    });
  }

  // Get Jobs Logic
  if (getJobsBtn) {
    getJobsBtn.addEventListener("click", async () => {
      getJobsBtn.disabled = true;
      getJobsBtn.innerText = "Analyzing...";

      // Get resume and credentials
      chrome.storage.local.get(
        ["resume", "cookie", "authorization"],
        async (storageResult) => {
          const resumeText = storageResult.resume;

          if (!resumeText) {
            alert("Please save a resume first!");
            showResumeView();
            getJobsBtn.disabled = false;
            getJobsBtn.innerText = "Analyze Jobs";
            return;
          }

          const baseUrl = "https://northeastern-csm.symplicity.com";
          const apiUrl = `${baseUrl}/api/v2/jobs`;

          const params = new URLSearchParams({
            perPage: document.getElementById("perPage").value,
            page: 0,
            sort: "!postdate",
            ocr: "f",
            job_type: document.getElementById("job_type").value,
            postdate: document.getElementById("postdate").value,
            json_mode: "read_only",
            exclude_applied_jobs: document.getElementById(
              "exclude_applied_jobs"
            ).checked
              ? "1"
              : "0",
            enable_translation: "False",
          });

          const headers = {
            accept: "application/json, text/plain, */*",
            "accept-language": "en-US,en;q=0.9,es;q=0.8",
            authorization: storageResult.authorization,
            "sec-ch-ua":
              '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"macOS"',
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
            "x-requested-system-user": "students",
            Cookie: storageResult.cookie,
          };

          try {
            const response = await fetch(`${apiUrl}?${params.toString()}`, {
              method: "GET",
              headers: headers,
            });

            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            const jobs = data.models;

            // --- MATCHING LOGIC ---
            const matcher = new JobMatcher();
            const scoredJobs = jobs.map((job) => {
              const description = job.job_desc || ""; // Use empty string if undefined
              const title = job.job_title || "";

              // Combine title and desc for better matching context
              const jobFullText = `${title} \n ${description}`;
              const result = matcher.calculateScore(resumeText, jobFullText);

              return {
                ...job,
                matchScore: result.score,
                matchDetails: result,
              };
            });

            // Filter by Min Score
            const minScore = parseInt(minMatchSlider.value, 10) || 0;
            const filteredJobs = scoredJobs.filter(
              (job) => job.matchScore >= minScore
            );

            // Sort by score descending
            filteredJobs.sort((a, b) => b.matchScore - a.matchScore);

            // Render Results
            renderJobs(filteredJobs);
            showAnalysisView();

            // PERSIST STATE
            chrome.storage.local.set({
              viewState: "analysis",
              lastAnalysisResults: filteredJobs,
            });
          } catch (error) {
            console.error("Fetch/Analysis error:", error);
            alert(`Error: ${error.message}`);
          } finally {
            getJobsBtn.disabled = false;
            getJobsBtn.innerText = "Analyze Jobs";
          }
        }
      );
    });

    // Back Button Listener
    if (backToMainBtn) {
      backToMainBtn.addEventListener("click", () => {
        showMainView();
        // Clear persist state
        chrome.storage.local.remove(["viewState", "lastAnalysisResults"]);
      });
    }

    // Slider Listener
    if (minMatchSlider && minMatchValue) {
      minMatchSlider.addEventListener("input", () => {
        minMatchValue.innerText = minMatchSlider.value;
      });
    }
  }
});
