// Injector logic moved to manifest.json (world: MAIN)
console.log("Content script loaded (Manifest Injection Mode).");

// Store job data locally separated by context
let searchJobData = null; // Data for the Search Page
let discoveryJobData = null; // Data for Discover/Home
let gradeButton = null;
let lastUrl = location.href;

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

// Function to inject the grade button
function injectGradeButton() {
  if (document.getElementById("nuworks-grade-btn")) {
    // Check if we need to update state even if button exists
    if (
      discoveryJobData &&
      gradeButton &&
      gradeButton.innerText !== "Processing..."
    ) {
      gradeButton.innerText = "Grade Jobs On Page";
      gradeButton.style.backgroundColor = "#5cb85c";
      gradeButton.disabled = false;
    }
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
    gradeButton.innerText = discoveryJobData
      ? "Grade Jobs On Page"
      : "Waiting for jobs...";
    gradeButton.className = "nuworks-btn";

    // Initial style
    Object.assign(gradeButton.style, {
      marginLeft: "10px",
      backgroundColor: discoveryJobData ? "#5cb85c" : "#d9534f",
      color: "white",
      border: "none",
      borderRadius: "4px",
      padding: "5px 10px",
      cursor: "pointer",
      fontWeight: "bold",
    });

    gradeButton.onclick = function () {
      if (!discoveryJobData) {
        alert(
          "No job data captured yet. Please scroll or reload to capture jobs."
        );
        return;
      }

      gradeButton.innerText = "Processing...";
      gradeButton.disabled = true;

      triggerAutoGrade(discoveryJobData, () => {
        if (gradeButton) {
          gradeButton.innerText = "Grade Jobs On Page";
          gradeButton.disabled = false;
        }
      });
    };

    target.parentNode.insertBefore(gradeButton, target.nextSibling);
    console.log("NUWorks: Grade button injected");
  } else {
    // Retry if target not found yet (dynamic loading)
    setTimeout(injectGradeButton, 1000);
  }
}

function removeGradeButton() {
  const btn = document.getElementById("nuworks-grade-btn");
  if (btn) {
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

function checkUrl() {
  const currentUrl = location.href;
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
}

// Start trying to inject the button
injectGradeButton();

// Monitor URL changes
setInterval(checkUrl, 1000);

// Listen for messages from the interceptor
window.addEventListener("message", function (event) {
  // We only accept messages from ourselves
  if (event.source !== window) return;

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
            gradeButton.innerText = "Grade Jobs On Page";
            gradeButton.style.backgroundColor = "#5cb85c";
            gradeButton.disabled = false;
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
