import JobMatcher from "./matcher.js";
import StorageHelper from "./storage.js";
import ApiHelper from "./api.js";
import UiHelper from "./ui.js";
const pdfjsLib = require("pdfjs-dist");
// Set worker source to the file in public/ folder
pdfjsLib.GlobalWorkerOptions.workerSrc =
  chrome.runtime.getURL("pdf.worker.min.mjs");

// Popup logic - Refactored
document.addEventListener("DOMContentLoaded", () => {
  const {
    getJobsBtn,
    settingsBtn,
    removeInactiveBtn,
    saveResumeBtn,
    cancelResumeBtn,
    backToMainBtn,
    minMatchSlider,
    minMatchValue,
    resumeText,
    resumeFile,
    debugPdfBtn,
  } = UiHelper.elements;

  // Initialize Custom Dropdowns
  UiHelper.initIndustryDropdown();

  // --- Event Listeners ---

  // PDF Upload Listener
  if (resumeFile) {
    resumeFile.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      if (file.type !== "application/pdf") {
        alert("Please upload a PDF file.");
        return;
      }

      try {
        const arrayBuffer = await file.arrayBuffer();
        // pdfjsLib is imported
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = "";

        // Extract text from each page
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item) => item.str).join(" ");
          fullText += pageText + "\n";
        }

        // Set to textarea
        UiHelper.elements.resumeText.value = fullText.trim();
        alert("Resume text extracted from PDF!");
      } catch (error) {
        console.error("Error parsing PDF:", error);
        alert("Error parsing PDF. See console for details.");
      }
    });
  }

  // Debug PDF Text
  if (debugPdfBtn) {
    debugPdfBtn.addEventListener("click", () => {
      const text = UiHelper.elements.resumeText.value;
      if (!text) {
        alert("No resume text found. Upload a PDF or paste text first.");
      } else {
        if (
          document.getElementById("resume-text-group").style.display === "none"
        ) {
          document.getElementById("resume-text-group").style.display = "block";
        } else {
          document.getElementById("resume-text-group").style.display = "none";
        }
      }
    });
  }

  // Open Settings (Resume Edit)
  if (settingsBtn) {
    settingsBtn.addEventListener("click", async () => {
      const creds = await StorageHelper.getCredentials();
      if (creds.resume) {
        UiHelper.elements.resumeText.value = creds.resume;
      }
      if (creds.schoolYear) {
        UiHelper.elements.schoolYear.value = creds.schoolYear;
      }
      if (creds.gradDate) {
        UiHelper.elements.gradDate.value = creds.gradDate;
      }
      if (typeof creds.autoGrading !== "undefined") {
        UiHelper.elements.autoGrading.checked = creds.autoGrading;
      }
      UiHelper.showResumeView();
    });
  }

  // Remove Inactive Jobs
  if (removeInactiveBtn) {
    removeInactiveBtn.addEventListener("click", async () => {
      const creds = await StorageHelper.getCredentials();
      // open a new tab with the url
      chrome.tabs.create({
        url: "https://bos1225.northeastern.edu/student/applicationhistory",
      });
    });
  }

  // Save Resume
  if (saveResumeBtn) {
    saveResumeBtn.addEventListener("click", () => {
      const text = UiHelper.elements.resumeText.value.trim();
      const schoolYear = UiHelper.elements.schoolYear.value;
      const gradDate = UiHelper.elements.gradDate.value;
      const autoGrading = UiHelper.elements.autoGrading.checked;

      if (!text) {
        alert("Please enter a resume.");
        return;
      }

      Promise.all([
        StorageHelper.saveResume(text),
        StorageHelper.saveUserDemographics(schoolYear, gradDate, autoGrading),
      ]).then(() => {
        console.log("Settings saved");
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

    if (!url.includes("northeastern-csm.symplicity.com/students")) {
      UiHelper.showWrongPageViewHome();
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
        const schoolYear = storageResult.schoolYear;
        const gradDate = storageResult.gradDate;

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
        // --- MATCHING LOGIC ---
        const matcher = new JobMatcher();

        // Use Promise.all for async filtering
        const scoredJobsResults = await Promise.all(
          jobs.map(async (job) => {
            const description = job.job_desc || "";
            const title = job.job_title || "";
            const jobFullText = `${title} \n ${description}`;

            // Check Qualifications (ASYNC now)
            const isQualified = await matcher.isQualified(
              jobFullText,
              schoolYear,
              gradDate
            );
            if (!isQualified) {
              return null;
            }

            const result = matcher.calculateScore(resumeText, jobFullText);

            return {
              ...job,
              matchScore: result.score,
              matchDetails: result,
            };
          })
        );

        const scoredJobs = scoredJobsResults.filter((job) => job !== null); // Filter out disqualified jobs

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
