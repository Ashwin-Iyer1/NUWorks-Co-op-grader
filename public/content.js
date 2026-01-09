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

  // Poll for application history page injection
  if (currentUrl.includes("/student/applicationhistory")) {
    handleApplicationHistoryPage();
  }

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
handleApplicationHistoryPage();

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

// === NEW LOGIC FOR APPLICATION HISTORY ===

function injectApplicationHistoryButton() {
  // Target class: font-bold text-lg mb-2
  // We'll search for all elements with these classes
  const targetSelector = ".font-bold.text-lg.mb-2";
  const targets = document.querySelectorAll(targetSelector);

  console.log(
    `[HistoryDebug] Searching for targets with selector '${targetSelector}'. Found: ${targets.length}`
  );

  if (targets.length === 0) {
    // Retry if content is dynamic
    // setTimeout(injectApplicationHistoryButton, 1000);
    // Commented out to avoid infinite loops if generic selector fails,
    // relying on checkUrl interval to retry since it runs every 1s
    return;
  }

  targets.forEach((target) => {
    // Check if we already injected a button next to this specific target
    if (
      target.nextSibling &&
      target.nextSibling.classList &&
      target.nextSibling.classList.contains("nuworks-history-btn")
    ) {
      return;
    }

    const btn = document.createElement("button");
    btn.innerText = "Find Inactive Jobs"; // Placeholder
    btn.className = "nuworks-history-btn";

    // Style it to look decent
    Object.assign(btn.style, {
      marginLeft: "10px",
      backgroundColor: "#007bff",
      color: "white",
      border: "none",
      borderRadius: "4px",
      padding: "5px 10px",
      cursor: "pointer",
      fontWeight: "bold",
      fontSize: "14px",
    });

    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      //get the page as html
      const html = document.documentElement.outerHTML;
      const jobCards = document.querySelectorAll(
        ".bg-white.rounded-xl.m-1.text-xs.shadow.w-full.mx-auto"
      );
      console.log(`Found ${jobCards.length} job cards.`);

      const jobs = [];

      jobCards.forEach((jobCard) => {
        const getLabelValue = (labelText) => {
          const elements = jobCard.querySelectorAll(".font-semibold");
          for (let el of elements) {
            if (el.innerText.includes(labelText)) {
              const valueEl =
                el.nextElementSibling || el.parentElement.nextElementSibling;
              return valueEl ? valueEl.innerText.trim() : "N/A";
            }
          }
          // Fallback for "App Status" which might be a div not a span, or slightly different class
          const allDivs = jobCard.querySelectorAll("div");
          for (let el of allDivs) {
            if (el.innerText.includes(labelText)) {
              // check if it is the label container
              const valueEl = el.nextElementSibling;
              return valueEl ? valueEl.innerText.trim() : "N/A";
            }
          }
          return "N/A";
        };

        const anchor = jobCard.querySelector("a");
        let job_id = "unknown";
        if (anchor && anchor.href) {
          try {
            const urlObj = new URL(anchor.href, window.location.origin);
            const pathSegments = urlObj.pathname.split("/");
            job_id = pathSegments[pathSegments.length - 1];
          } catch (e) {
            console.error("Error parsing job ID from URL:", anchor.href);
            job_id = anchor.href.split("/").pop().split("?")[0]; // Fallback cleanup
          }
        }

        const jobStatus = getLabelValue("Job Status");
        const appStatus = getLabelValue("App Status");
        const activeApp = getLabelValue("Active Application");

        jobs.push({
          job_id,
          jobStatus,
          appStatus,
          activeApp,
        });
      });

      console.log("Extracted Jobs:", jobs);
      // save to chrome.storage.local
      chrome.storage.local.set({ job_applications_history: jobs }, () => {
        console.log("Saved job history to chrome.storage.local");
        // Notify user via alert or button text change
        btn.innerText = "Saved!";
        setTimeout(() => (btn.innerText = "Action"), 2000);
      });

      // go to the job applications page https://northeastern-csm.symplicity.com/students/app/jobs/applied
      window.location.href =
        "https://northeastern-csm.symplicity.com/students/app/jobs/applied";
    };
    target.parentNode.style.justifyContent = "flex-start";

    target.parentNode.insertBefore(btn, target.nextSibling);
    const tutorial_btn = document.createElement("button");
    tutorial_btn.id = "nuworks-tutorial-btn";
    tutorial_btn.innerText = "Tutorial";
    // Symplicity styling classes - try to blend in but stand out
    tutorial_btn.className = "btn btn-default btn-primary";

    Object.assign(tutorial_btn.style, {
      // make smaller
      fontSize: "12px",
      padding: "2px 6px",
      borderRadius: "4px",
      fontWeight: "bold",
      cursor: "pointer",
      marginRight: "10px",
    });

    tutorial_btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.open("https://nucoop.app/#ineligible-video", "_blank");
    };

    // append to the right of the button we just added
    btn.parentNode.insertBefore(tutorial_btn, btn.nextSibling);
  });
}

function handleApplicationHistoryPage() {
  // We can run this periodically or just once per checkUrl tick
  injectApplicationHistoryButton();
}

// === NEW LOGIC FOR APPLIED JOBS BADGING ===

let cachedJobHistory = null;
let isFetchingHistory = false;

function injectApplicationBadges() {
  // If we already have data, use it. If not, fetch it.
  if (!cachedJobHistory) {
    if (isFetchingHistory) return;
    isFetchingHistory = true;
    chrome.storage.local.get(["job_applications_history"], (result) => {
      isFetchingHistory = false;
      const historyData = result.job_applications_history;
      if (!historyData) {
        // No data found, stop trying for a bit or log once
        return;
      }
      cachedJobHistory = historyData;
      // Re-trigger injection now that we have data
      injectApplicationBadges();
    });
    return;
  }

  // Create a map for faster lookup: job_id -> full job object
  const jobMap = {};
  cachedJobHistory.forEach((job) => {
    if (job.job_id) {
      jobMap[job.job_id] = job;
    }
  });

  // Find all job links on the page
  const jobLinks = document.querySelectorAll(
    "a[href*='/students/app/jobs/detail/'], a[href*='/students/app/jobs/view/']"
  );

  // Optimization: Check if there is work to do before logging or iterating
  let unbadgedLinks = [];
  jobLinks.forEach((link) => {
    // Check if badge already exists in parent or on link
    if (
      !link.querySelector(".nuworks-app-badge") &&
      !link.parentNode.querySelector(".nuworks-app-badge")
    ) {
      // Check if this link corresponds to a known job
      const href = link.getAttribute("href");
      try {
        const urlObj = new URL(href, window.location.origin);
        const pathSegments = urlObj.pathname.split("/");
        const jobId = pathSegments[pathSegments.length - 1];
        if (jobMap.hasOwnProperty(jobId)) {
          unbadgedLinks.push({ link, jobId });
        }
      } catch (e) {}
    }
  });

  if (unbadgedLinks.length === 0) {
    return;
  }

  unbadgedLinks.forEach((item) => {
    const { link, jobId } = item;
    const job = jobMap[jobId];

    // LOGIC: Determine Badge Status
    let badgeText = "Applied";
    let badgeColor = "#17a2b8"; // Default Blue/Info

    // Priority 1: Inactive indicators
    if (job.appStatus.includes("Not Selected") || job.activeApp === "No") {
      badgeText = "Inactive";
      badgeColor = "#c90014ff"; // Red
    } else if (
      ["Expired", "Filled", "Pending or Draft Placements"].some((s) =>
        job.jobStatus.includes(s)
      )
    ) {
      badgeText = "Job Closed";
      badgeColor = "#6c757d"; // Gray/Red-ish
    }
    // Priority 2: Positive indicators
    else if (job.appStatus.includes("Employer Interested")) {
      badgeText = "Interested";
      badgeColor = "#28a745"; // Green
    } else if (job.activeApp === "Yes") {
      badgeText = "Active";
      badgeColor = "#28a745"; // Green
    }

    const badge = document.createElement("span");
    badge.className = "nuworks-app-badge";
    badge.innerText = badgeText;

    // Style based on status
    Object.assign(badge.style, {
      marginLeft: "8px",
      padding: "2px 6px",
      borderRadius: "4px",
      fontSize: "11px",
      fontWeight: "bold",
      color: "white",
      backgroundColor: badgeColor,
      verticalAlign: "middle",
      display: "inline-block",
    });

    // Insert badge after the link text (or append to link)
    link.appendChild(badge);
  });
}

function injectHistoryNavButton() {
  // Selector strategy: Try multiple potential selectors for the bottom bar
  const targetSelectors = [
    ".buttonbar.buttonbar-bottom.fixed-action-bar",
    ".buttonbar.buttonbar-bottom",
    ".list-bottom-buttons",
    "div[class*='buttonbar-bottom']",
  ];

  let target = null;
  for (let sel of targetSelectors) {
    target = document.querySelector(sel);
    if (target) {
      console.log(`[NavBtn] Found target bar with selector: ${sel}`);
      break;
    }
  }

  if (!target) {
    // console.log("[NavBtn] Button bar not found yet");
    return;
  }

  if (document.getElementById("nuworks-history-nav-btn")) {
    return;
  }

  const btn = document.createElement("button");
  btn.id = "nuworks-history-nav-btn";
  btn.innerText = "Fetch Inactive Jobs";
  // Symplicity styling classes - try to blend in but stand out
  btn.className = "btn btn-default btn-primary";

  Object.assign(btn.style, {
    marginLeft: "10px",
    backgroundColor: "#007bff",
    color: "white",
    border: "1px solid #0056b3",
    borderRadius: "4px",
    padding: "6px 12px",
    fontWeight: "bold",
    cursor: "pointer",
    marginRight: "10px",
  });

  btn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.location.href =
      "https://bos1225.northeastern.edu/student/applicationhistory";
  };

  // Append to target. If target has children, append at the end.
  target.appendChild(btn);

  const tutorial_btn = document.createElement("button");
  tutorial_btn.id = "nuworks-tutorial-btn";
  tutorial_btn.innerText = "Tutorial";
  // Symplicity styling classes - try to blend in but stand out
  tutorial_btn.className = "btn btn-default btn-primary";

  Object.assign(tutorial_btn.style, {
    // make smaller
    fontSize: "12px",
    padding: "2px 6px",
    borderRadius: "4px",
    fontWeight: "bold",
    cursor: "pointer",
    marginRight: "10px",
  });

  tutorial_btn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.open("https://nucoop.app/#ineligible-video", "_blank");
  };

  target.appendChild(tutorial_btn);

  console.log("[NUWorks] History navigation button injected successfully.");
}

function handleAppliedJobsPage() {
  injectHistoryNavButton();
  injectApplicationBadges();
}

function checkUrl() {
  const currentUrl = location.href;

  // Poll for application history page injection
  if (currentUrl.includes("/student/applicationhistory")) {
    handleApplicationHistoryPage();
  }

  // Poll for Applied Jobs page
  if (currentUrl.includes("/students/app/jobs/applied")) {
    handleAppliedJobsPage();
  }

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
handleApplicationHistoryPage();
// Initial check for applied page (if user reloads on that page)
if (location.href.includes("/students/app/jobs/applied")) {
  handleAppliedJobsPage();
}

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
