// Copyright (c) 2026 Ashwin Iyer — Licensed under AGPL-3.0

import JobMatcher, { normalizeSchoolYear } from "./matcher.js";
import StorageHelper from "./storage.js";
import ApiHelper from "./api.js";
import UiHelper from "./ui.js";
import { setupThemeToggle } from "./theme.js";
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

  // Theme: default to the OS preference, let the sun/moon toggle override it,
  // and persist the choice so it applies across every extension page.
  setupThemeToggle(document.getElementById("theme-toggle"));

  // Initialize Custom Dropdowns
  UiHelper.initIndustryDropdown();

  // The tab the popup was opened over. Captured by routeBoot() so the retry
  // buttons can reload it — credentials only appear after background.js sees
  // an /api/ request, so a reload is genuinely the fix.
  let currentTab = null;

  // Every scored, eligible job from the last analysis, unfiltered by the min
  // score slider. Lives for the popup session only — lastAnalysisResults is
  // already a large payload and there is no unlimitedStorage permission.
  let lastScoredJobsAll = [];

  const setStatus = (message, isError = false) =>
    UiHelper.setAnalyzeStatus(message, isError);

  /** Let the browser paint a staged progress line before the next await. */
  const nextFrame = () =>
    new Promise((resolve) => requestAnimationFrame(() => resolve()));

  // NUWorks stores class year as a label like "Undergraduate - Junior"; the
  // settings <select id="school-year"> can only hold its own option values.
  // Normalise the label to the canonical year (the same helper the matcher's
  // eligibility gate uses) and map it onto the matching option, returning null
  // when there is no option to hold it — so an unrecognised label is skipped
  // rather than silently blanking the field and persisting schoolYear: "".
  const SCHOOL_YEAR_OPTION = {
    freshman: "Freshman",
    sophomore: "Sophomore",
    junior: "Junior",
    senior: "Senior",
    graduate: "Graduate",
  };
  const toSchoolYearOption = (label) =>
    SCHOOL_YEAR_OPTION[normalizeSchoolYear(label)] || null;

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
        const mapped = toSchoolYearOption(profile.year._label);
        if (mapped) {
          schoolYear = mapped;
          updates.schoolYear = mapped;
        }
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

  // The popup is useful for a quick fetch, but Job Explorer is the primary
  // full-page workspace. Keep its launcher at the top of the main view so the
  // richer filtering, sorting and batch tools are discoverable without first
  // finding the injected button inside NUWorks.
  const openJobExplorerBtn = document.getElementById("open-job-explorer-btn");
  if (openJobExplorerBtn) {
    openJobExplorerBtn.addEventListener("click", () => {
      chrome.tabs.create({ url: chrome.runtime.getURL("custom.html") });
    });
  }

  // PDF Upload Listener
  if (resumeFile) {
    resumeFile.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      if (file.type !== "application/pdf") {
        UiHelper.setResumeError(
          "That file isn't a PDF. Choose a PDF or paste your resume text instead."
        );
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
        UiHelper.setResumeError(
          `Read ${pdf.numPages} ${
            pdf.numPages === 1 ? "page" : "pages"
          } of text from that PDF.`,
          "ok"
        );
      } catch (error) {
        console.error("Error parsing PDF:", error);
        UiHelper.setResumeError(
          "Couldn't read that PDF. Try a different file, or paste your resume text instead."
        );
      }
    });
  }

  // Reveal / hide the resume textarea. This must NOT be gated on the textarea
  // already having text: the textarea is hidden, and this is the only control
  // that reveals it, so an empty-text guard here is a closed loop for anyone
  // who wants to paste rather than upload.
  //
  // The literal `style.display === "none"` comparison and the inline
  // `style="display: none"` attribute in index.html are load-bearing. Swapping
  // the attribute for the .hidden class would make the first click write
  // display:none onto an already-hidden element, permanently stranding the
  // textarea.
  if (debugPdfBtn) {
    debugPdfBtn.addEventListener("click", () => {
      const group = document.getElementById("resume-text-group");
      if (!group) return;

      if (group.style.display === "none") {
        group.style.display = "block";
        debugPdfBtn.textContent = "Hide resume text";
        if (UiHelper.elements.resumeText) UiHelper.elements.resumeText.focus();
      } else {
        group.style.display = "none";
        debugPdfBtn.textContent = "Or paste resume text";
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
      if (typeof creds.gradeIneligible !== "undefined") {
        UiHelper.elements.gradeIneligible.checked = creds.gradeIneligible;
      }
      UiHelper.setResumeError("");
      UiHelper.showResumeView(false);
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
      const gradeIneligible = UiHelper.elements.gradeIneligible.checked;

      if (!text) {
        UiHelper.setResumeError(
          "Add a resume before saving. Upload a PDF or paste the text."
        );
        return;
      }

      Promise.all([
        StorageHelper.saveResume(text),
        StorageHelper.saveUserDemographics(
          schoolYear,
          gradDate,
          autoGrading,
          gradeIneligible
        ),
      ]).then(() => {
        console.log("Settings saved");
        UiHelper.setResumeError("");
        UiHelper.showMainView();
      });
    });
  }

  // Cancel Resume Edit
  if (cancelResumeBtn) {
    cancelResumeBtn.addEventListener("click", async () => {
      const resume = await StorageHelper.getResume();
      if (resume && resume.trim() !== "") {
        UiHelper.setResumeError("");
        UiHelper.showMainView();
      } else {
        // Unreachable in practice — showResumeView(true) removes this button on
        // first run — but kept honest for any other no-resume path.
        UiHelper.setResumeError(
          "Add a resume before saving. Upload a PDF or paste the text."
        );
      }
    });
  }

  // Back Button Listener
  if (backToMainBtn) {
    backToMainBtn.addEventListener("click", () => {
      setStatus("");
      const retryAnalyzeBtn = document.getElementById("retry-analyze-btn");
      if (retryAnalyzeBtn) retryAnalyzeBtn.hidden = true;
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

  // Main Initialization Logic. Named and re-runnable so the retry buttons can
  // route again after reloading the NUWorks tab.
  function routeBoot() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      currentTab = tabs && tabs[0] ? tabs[0] : null;
      const url = (currentTab && currentTab.url) || "";

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
          // First run: there is no resume to cancel back to, so the Cancel
          // button is removed rather than left as a guaranteed dead end.
          UiHelper.showResumeView(true);
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
  }

  /**
   * Reload the NUWorks tab, then re-route. Credentials are only captured once
   * background.js observes an /api/ request, so the reload is the actual fix —
   * the user simply had no button for it.
   */
  function wireRetryButton(btn) {
    if (!btn) return;
    btn.addEventListener("click", () => {
      const originalLabel = btn.textContent;
      const finish = () => {
        window.setTimeout(() => {
          btn.disabled = false;
          btn.textContent = originalLabel;
          if (btn.id === "retry-analyze-btn") {
            setStatus("");
            btn.hidden = true;
          }
          routeBoot();
        }, 1200);
      };

      btn.disabled = true;
      btn.textContent = "Reloading NUWorks...";

      if (!currentTab || typeof currentTab.id !== "number") {
        finish();
        return;
      }

      try {
        chrome.tabs.reload(currentTab.id, {}, () => {
          if (chrome.runtime.lastError) {
            console.error(
              "Could not reload the NUWorks tab:",
              chrome.runtime.lastError.message
            );
          }
          finish();
        });
      } catch (error) {
        console.error("Could not reload the NUWorks tab:", error);
        finish();
      }
    });
  }

  wireRetryButton(document.getElementById("retry-auth-btn"));
  wireRetryButton(document.getElementById("retry-home-btn"));
  wireRetryButton(document.getElementById("retry-analyze-btn"));

  routeBoot();

  /**
   * Resolve a job's eligibility to the engine's {qualified, reason, evidence}
   * shape. Degrades to the boolean isQualified() wrapper if an older matcher
   * without checkEligibility() is bundled.
   */
  async function evaluateEligibility(matcher, jobText, schoolYear, gradDate) {
    if (typeof matcher.checkEligibility === "function") {
      try {
        const verdict = await matcher.checkEligibility(
          jobText,
          schoolYear,
          gradDate
        );
        if (verdict && typeof verdict.qualified === "boolean") {
          return {
            qualified: verdict.qualified,
            reason: verdict.reason || null,
            evidence: verdict.evidence || null,
          };
        }
      } catch (error) {
        console.error("Eligibility check failed:", error);
      }
    }

    const qualified = await matcher.isQualified(jobText, schoolYear, gradDate);
    return { qualified: !!qualified, reason: null, evidence: null };
  }

  // Get Jobs Logic
  if (getJobsBtn) {
    getJobsBtn.addEventListener("click", async () => {
      // NOTE: the button label is assigned as plain text here and in `finally`.
      // It cannot carry icon markup without changing both assignments.
      getJobsBtn.disabled = true;
      getJobsBtn.innerText = "Analyzing...";
      setStatus("");

      const retryAnalyzeBtn = document.getElementById("retry-analyze-btn");
      if (retryAnalyzeBtn) retryAnalyzeBtn.hidden = true;

      let failed = false;

      try {
        // Get resume and credentials
        const storageResult = await StorageHelper.getCredentials();
        const schoolYear = storageResult.schoolYear;
        const gradDate = storageResult.gradDate;
        const gradeIneligible = !!storageResult.gradeIneligible;

        if (!storageResult.resume) {
          UiHelper.setResumeError(
            "Add a resume before analyzing. Upload a PDF or paste the text."
          );
          UiHelper.showResumeView(true);
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
        const fetchedCount = jobs.length;
        setStatus(`Fetched ${fetchedCount} jobs`);
        await nextFrame();

        // Authoritative eligibility. The list payload already carries the
        // verdict inline on each row (`qualified`), so the batch endpoint is
        // only asked about rows that arrived without it.
        const jobIds = jobs
          .filter((j) => j.qualified === undefined || j.qualified === null)
          .map((j) => j.job_id)
          .filter(Boolean);
        setStatus("Checking eligibility...");
        await nextFrame();
        const qualifiedMap = await ApiHelper.getQualifiedStatus(jobIds, creds);

        // --- MATCHING LOGIC ---
        const matcher = new JobMatcher();

        // Accounting: every fetched job either lands in the list, is dropped
        // for eligibility, or is dropped by the min-score slider.
        const reasons = {};
        let scoredCount = 0;

        const countReason = (reason) => {
          const key = reason || "server";
          reasons[key] = (reasons[key] || 0) + 1;
        };
        const tick = () => {
          scoredCount += 1;
          if (scoredCount % 10 === 0 || scoredCount === fetchedCount) {
            setStatus(`Scored ${scoredCount} of ${fetchedCount}`);
          }
        };

        // Use Promise.all for async filtering
        const scoredJobsResults = await Promise.all(
          jobs.map(async (job) => {
            // Inline verdict from the list row first; batch endpoint as
            // fallback. Same rule as api.js: not "Not Qualified" = pass.
            const serverQual =
              job.qualified !== undefined && job.qualified !== null
                ? !/not\s*qualified/i.test(String(job.qualified))
                : qualifiedMap[job.job_id]; // true / false / undefined

            // Server says ineligible → drop it, unless the user asked for
            // ineligible jobs to be graded anyway.
            if (serverQual === false && !gradeIneligible) {
              countReason("server");
              tick();
              return null;
            }

            const description = job.job_desc || "";
            const title = job.job_title || "";
            const jobFullText = `${title} \n ${description}`;

            // Trust the server verdict; fall back to the local gate only when
            // NUWorks gave us no answer for this posting.
            const eligibility =
              serverQual === true
                ? { qualified: true, reason: null, evidence: null }
                : serverQual === false
                  ? { qualified: false, reason: "server", evidence: null }
                  : await evaluateEligibility(
                      matcher,
                      jobFullText,
                      schoolYear,
                      gradDate
                    );

            if (!eligibility.qualified && !gradeIneligible) {
              countReason(eligibility.reason);
              tick();
              return null;
            }

            const result = matcher.calculateScore(resumeText, jobFullText);
            tick();

            return {
              ...job,
              matchScore: result.score,
              matchDetails: result,
              // Kept in the list, but still flagged so the card renders the
              // Ineligible badge next to the match %.
              disqualified: !eligibility.qualified,
              eligibility,
            };
          })
        );

        const scoredJobs = scoredJobsResults.filter((job) => job !== null); // Filter out disqualified jobs
        const droppedIneligible = fetchedCount - scoredJobs.length;

        // Filter by Min Score
        const minScore = UiHelper.getMinMatchScore();
        const filteredJobs = scoredJobs.filter(
          (job) => job.matchScore >= minScore
        );
        const droppedByScore = scoredJobs.length - filteredJobs.length;

        // Sort by score descending
        filteredJobs.sort((a, b) => b.matchScore - a.matchScore);

        // Everything eligible, kept in memory only so "Show all" can re-render
        // without a second round trip and without growing chrome.storage.local.
        lastScoredJobsAll = scoredJobs
          .slice()
          .sort((a, b) => b.matchScore - a.matchScore);

        const showAll = () => {
          UiHelper.renderJobs(lastScoredJobsAll, {
            fetchedCount,
            droppedIneligible,
            droppedByScore: 0,
            minScore: 0,
            reasons,
          });
          StorageHelper.saveState("analysis", lastScoredJobsAll);
        };

        // Render Results
        UiHelper.renderJobs(filteredJobs, {
          fetchedCount,
          droppedIneligible,
          droppedByScore,
          minScore,
          reasons,
          onShowAll: showAll,
        });
        UiHelper.showAnalysisView();

        // PERSIST STATE
        StorageHelper.saveState("analysis", filteredJobs);
      } catch (error) {
        failed = true;
        console.error("Fetch/Analysis error:", error);

        const message = String((error && error.message) || "");
        if (/\b(401|403)\b/.test(message)) {
          setStatus(
            "Your NUWorks session expired. Reload the NUWorks tab and try again.",
            true
          );
          if (retryAnalyzeBtn) retryAnalyzeBtn.hidden = false;
        } else if (
          error instanceof TypeError ||
          /network|failed to fetch|networkerror/i.test(message)
        ) {
          setStatus(
            "Couldn't reach NUWorks. Check your connection and try again.",
            true
          );
        } else {
          setStatus(
            "Something went wrong while analyzing. Reload the NUWorks tab and try again.",
            true
          );
        }
      } finally {
        // The failure message written above owns the status line; only a clean
        // run clears it.
        if (!failed) setStatus("");
        getJobsBtn.disabled = false;
        getJobsBtn.innerText = "Analyze jobs";
      }
    });
  }
});
