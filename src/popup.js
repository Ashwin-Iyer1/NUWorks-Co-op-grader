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

  // Pull the student's real grad date / class year / skills from NUWorks so the
  // settings form can pre-fill instead of making them type everything. Returns
  // the fetched profile (or null) and persists any newly-discovered values.
  async function seedProfile(prefillForm = false) {
    try {
      const creds = await StorageHelper.getCredentials();
      if (!creds.cookie || !creds.authorization) return null;

      const user = await ApiHelper.getCurrentUser(creds);
      if (!user || !user.id) return null;
      const profile = await ApiHelper.getStudentProfile(user.id, creds);
      if (!profile) return null;

      const updates = {};
      let gradDate = creds.gradDate;
      let schoolYear = creds.schoolYear;

      if (!gradDate && profile.graduation_date) {
        const m = String(profile.graduation_date).match(/^(\d{4})-(\d{2})/);
        if (m) {
          gradDate = `${m[1]}-${m[2]}`;
          updates.gradDate = gradDate;
        }
      }
      if (!schoolYear && profile.year && profile.year._label) {
        schoolYear = profile.year._label;
        updates.schoolYear = schoolYear;
      }
      if (Array.isArray(profile.skills) && profile.skills.length) {
        const names = profile.skills
          .map((s) => s.skill_name || s._label)
          .filter(Boolean);
        if (names.length) updates.profileSkills = names.join(", ");
      }

      if (Object.keys(updates).length) {
        chrome.storage.local.set(updates);
      }

      if (prefillForm) {
        if (schoolYear && UiHelper.elements.schoolYear && !UiHelper.elements.schoolYear.value) {
          UiHelper.elements.schoolYear.value = schoolYear;
        }
        if (gradDate && UiHelper.elements.gradDate && !UiHelper.elements.gradDate.value) {
          UiHelper.elements.gradDate.value = gradDate;
        }
      }
      return profile;
    } catch {
      return null;
    }
  }

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
      // Fill in any blanks (school year / grad date) straight from NUWorks.
      seedProfile(true);
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
        // Pre-fill school year / grad date from the student's NUWorks profile.
        seedProfile(true);
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
        const schoolYear = storageResult.schoolYear;
        const gradDate = storageResult.gradDate;

        if (!storageResult.resume) {
          alert("Please save a resume first!");
          UiHelper.showResumeView();
          return; // Early return to cleanup in finally
        }

        // Enrich the resume with the student's authoritative declared skills.
        const resumeText = [storageResult.resume, storageResult.profileSkills]
          .filter(Boolean)
          .join("\n");

        const creds = {
          cookie: storageResult.cookie,
          authorization: storageResult.authorization,
        };

        const params = UiHelper.getSearchParams();

        // Fetch Jobs
        const jobs = await ApiHelper.fetchJobs(params, creds);

        // Authoritative, batched eligibility from NUWorks itself.
        const jobIds = jobs.map((j) => j.job_id).filter(Boolean);
        const qualifiedMap = await ApiHelper.getQualifiedStatus(jobIds, creds);

        // --- MATCHING LOGIC ---
        const matcher = new JobMatcher();

        // Use Promise.all for async filtering
        const scoredJobsResults = await Promise.all(
          jobs.map(async (job) => {
            const serverQual = qualifiedMap[job.job_id]; // true / false / undefined

            // Server says ineligible → drop it.
            if (serverQual === false) return null;

            const description = job.job_desc || "";
            const title = job.job_title || "";
            const jobFullText = `${title} \n ${description}`;

            // Trust the server verdict; fall back to regex only when unknown.
            const isQualified =
              serverQual === true
                ? true
                : await matcher.isQualified(jobFullText, schoolYear, gradDate);
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
