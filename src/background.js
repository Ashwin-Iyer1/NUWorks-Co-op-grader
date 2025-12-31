import ApiHelper from "./api.js";
import StorageHelper from "./storage.js";
import JobMatcher from "./matcher.js";

const onSendHeadersListener = function (details) {
  if (details.url.includes("northeastern-csm.symplicity.com/api/")) {
    console.log("Symplicity Request Detected:", details.url);
    if (details.requestHeaders) {
      const cookie = details.requestHeaders.find(
        (header) => header.name.toLowerCase() === "cookie"
      );
      const authorization = details.requestHeaders.find(
        (header) => header.name.toLowerCase() === "authorization"
      );
      if (cookie) {
        chrome.storage.local.set({ cookie: cookie.value });
      }
      if (authorization) {
        chrome.storage.local.set({ authorization: authorization.value });
      }
    }
  }
};

chrome.webRequest.onSendHeaders.addListener(
  onSendHeadersListener,
  { urls: ["https://northeastern-csm.symplicity.com/*"] },
  ["requestHeaders", "extraHeaders"]
);

// Helper function to check if a job description implies an external application
function isExternalApplication(jobDesc) {
  if (!jobDesc) return false;
  const lowerDesc = jobDesc.toLowerCase();
  const keywords = [
    "workday",
    "smart recruiters",
    "submit your application",
    "smartrecruiters",
    "submit application",
  ];

  if (keywords.some((keyword) => lowerDesc.includes(keyword))) {
    return true;
  }

  const hrefs = lowerDesc.match(/<a[^>]*href="([^"]+)"[^>]*>/g);
  if (hrefs) {
    for (const href of hrefs) {
      if (href.includes("workday") || href.includes("smartrecruiters")) {
        return true;
      }
    }
  }
  return false;
}

// Function to fetch a single job's description
async function fetchJobDescription(jobId, creds) {
  let apiUrl = `${ApiHelper.BASE_URL}/api/v2/jobs/${jobId}`;
  const referer = `${ApiHelper.BASE_URL}/students/app/jobs/detail/${jobId}`;
  const headers = ApiHelper.getHeaders(creds, referer); // Using imported ApiHelper

  let response = await fetch(apiUrl, {
    method: "GET",
    headers: headers,
  });

  if (!response.ok) {
    console.log(`Fetch failed for ${jobId}, retrying with expired=1...`);
    apiUrl = `${ApiHelper.BASE_URL}/api/v3/jobs/${jobId}?expired=1`;
    response = await fetch(apiUrl, {
      method: "GET",
      headers: headers,
    });
  }

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  return {
    desc: data.job_desc,
    title: data.job_title || data.title,
  };
}

// Shared function to process a list of jobs
async function processJobs(jobList, tabId) {
  if (!jobList || jobList.length === 0) return;

  const creds = await StorageHelper.getCredentials();
  if (!creds.cookie || !creds.authorization) {
    console.log("Credentials missing for processJobs");
    return;
  }

  console.log(`Processing ${jobList.length} jobs...`);

  // Initialize Matcher if Auto-Grading is enabled
  let matcher = null;
  let resumeText = null;
  let schoolYear = null;
  let gradDate = null;

  if (creds.autoGrading && creds.resume && creds.gradDate && creds.schoolYear) {
    matcher = new JobMatcher();
    resumeText = creds.resume;
    schoolYear = creds.schoolYear;
    gradDate = creds.gradDate;
    console.log("Auto-Grading Enabled: Matcher initialized.");
  } else {
    console.log("Auto-Grading Disabled or missing details.");
  }

  const results = await Promise.all(
    jobList.map(async (job) => {
      try {
        let desc = job.job_desc || job.description;
        let title = job.job_title;

        let jobId =
          job.job_id || job.id || (typeof job === "string" ? job : null);

        if (jobId && jobId.includes("?")) {
          jobId = jobId.split("?")[0];
        }

        if (!jobId) {
          return { jobId: null };
        }

        if (!desc || !title) {
          try {
            console.log(`Fetching description for job ${jobId}...`);
            const fetched = await fetchJobDescription(jobId, creds);
            desc = fetched.desc;
            title = fetched.title;
          } catch (err) {
            console.error(`Failed to fetch for ${jobId}`, err);
          }
        }

        if (desc) {
          const isExternal = isExternalApplication(desc);
          let matchResult = null;

          if (matcher) {
            const fullText = `${title || ""} \n ${desc}`;
            const qualified = await matcher.isQualified(
              fullText,
              schoolYear,
              gradDate
            );
            if (qualified) {
              matchResult = matcher.calculateScore(resumeText, fullText);
            } else {
              // Mark as disqualified? Or just don't score?
              // Providing a low score or explicit disqualified status
              matchResult = { score: 0, disqualified: true };
            }
          }

          return { jobId, title, isExternal, matchResult };
        }
        return { jobId, title, isExternal: false, matchResult: null };
      } catch (e) {
        console.error("Error processing job", job, e);
        return { jobId: job?.id };
      }
    })
  );

  const jobsToBadge = results
    .filter((r) => r.jobId && (r.isExternal || r.matchResult))
    .map((r) => ({
      id: r.jobId,
      title: r.title,
      isExternal: r.isExternal,
      matchResult: r.matchResult,
    }));

  if (jobsToBadge.length > 0) {
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      args: [jobsToBadge],
      func: (jobs) => {
        const createBadge = (text, color) => {
          const badge = document.createElement("span");
          badge.innerText = text;
          badge.className = "nuworks-badge";
          badge.style.marginLeft = "10px";
          badge.style.display = "inline-block";
          badge.style.color = "white";
          badge.style.backgroundColor = color;
          badge.style.borderRadius = "12px";
          badge.style.fontSize = "11px";
          badge.style.padding = "2px 6px";
          badge.style.verticalAlign = "middle";
          badge.style.fontWeight = "bold";
          // Add a margin right to separate from other badges if multiple
          badge.style.marginRight = "4px";
          return badge;
        };

        const runCheck = () => {
          jobs.forEach((job) => {
            // Try matching by href (standard) or by ID if present in DOM (some carousels use specific IDs related to job)
            const selector = `a[href*="${job.id}"]`;
            const elements = document.querySelectorAll(selector);

            elements.forEach((el) => {
              // Avoid action buttons
              if (
                el.closest(".actions-toggle-wrap") ||
                el.classList.contains("icn-favorite") ||
                el.classList.contains("icn-favorite-hi")
              ) {
                return;
              }

              // Identify target container
              let targetContainer = null;
              let insertPosition = "afterend"; // default

              // Case 1: Carousel
              const titleEl = el.querySelector(".carousel-card-content-title");
              if (titleEl) {
                targetContainer = titleEl;
                insertPosition = "afterend";
              }
              // Case 2: Standard List
              else {
                targetContainer = el;
              }

              // Check if badges already exist to avoid dupes
              // We check specifically for the TYPE of badge
              let existingBadges = [];
              if (targetContainer && targetContainer.parentNode) {
                // Look at siblings
                let sib = targetContainer.nextElementSibling;
                while (sib && sib.classList.contains("nuworks-badge")) {
                  existingBadges.push(sib);
                  sib = sib.nextElementSibling;
                }
              }

              // External Badge
              if (job.isExternal) {
                const hasExternal = existingBadges.some(
                  (b) => b.innerText === "External Application"
                );
                if (!hasExternal && targetContainer) {
                  const badge = createBadge("External Application", "red");
                  targetContainer.insertAdjacentElement(insertPosition, badge);
                  // Update reference if we are appending sequentially?
                  // Actually insertAdjacentElement 'afterend' puts it after target.
                  // If we do multiple, the order depends on insertion order.
                  // If we insert External first, it's closest to title.
                }
              }

              // Match Badge
              if (job.matchResult) {
                let text = "Ineligible";
                let color = "gray";
                if (!job.matchResult.disqualified) {
                  const score = job.matchResult.score;
                  text = `${score}% Match`;
                  if (score >= 70) color = "#5cb85c"; // green
                  else if (score >= 40) color = "#f0ad4e"; // orange
                  else color = "#d9534f"; // red
                }
                const hasMatch = existingBadges.some(
                  (b) =>
                    b.innerText.includes("Match") ||
                    b.innerText.includes("Qualified") ||
                    b.innerText.includes("Ineligible")
                );
                if (!hasMatch && targetContainer) {
                  const badge = createBadge(text, color);
                  targetContainer.insertAdjacentElement(insertPosition, badge);
                }
              }
            });

            // --- Strategy 2: Title-based matching (for search page list items) ---
            if (job.title) {
              const listItems = document.querySelectorAll(
                'div[role="listitem"]'
              );
              listItems.forEach((item) => {
                // Avoid double injection
                if (item.querySelector(".nuworks-badge")) return;

                // Find potential title containers.
                const titleCandidates = Array.from(
                  item.querySelectorAll(".list-item-title")
                );
                const normalizedJobTitle = job.title
                  .toLowerCase()
                  .replace(/\s+/g, " ")
                  .trim();

                const match = titleCandidates.find((el) => {
                  const text = el.textContent
                    .toLowerCase()
                    .replace(/\s+/g, " ")
                    .trim();
                  return text.includes(normalizedJobTitle);
                });

                if (match) {
                  let target = match;
                  // Try to find the inner inline-block if possible
                  const distinctCandidates = titleCandidates
                    .reverse()
                    .find((el) => {
                      const text = el.textContent
                        .toLowerCase()
                        .replace(/\s+/g, " ")
                        .trim();
                      return text.includes(normalizedJobTitle);
                    });
                  if (distinctCandidates) {
                    target = distinctCandidates;
                  }

                  if (target.querySelector(".nuworks-badge")) return;

                  if (job.isExternal) {
                    const badge = createBadge("External Application", "red");
                    target.appendChild(badge);
                  }

                  if (job.matchResult) {
                    let text = "Ineligible";
                    let color = "gray";

                    if (!job.matchResult.disqualified) {
                      const score = job.matchResult.score;
                      text = `${score}% Match`;
                      color = "#d9534f"; // red
                      if (score >= 70) color = "#5cb85c"; // green
                      else if (score >= 40) color = "#f0ad4e"; // orange
                    }

                    const existingText = target.textContent;
                    if (
                      !existingText.includes("Match") &&
                      !existingText.includes("Ineligible")
                    ) {
                      const badge = createBadge(text, color);
                      target.appendChild(badge);
                    }
                  }
                }
              });
            }
          });
        };

        const observer = new MutationObserver(() => {
          observer.disconnect();
          runCheck();
          observer.observe(document.body, { childList: true, subtree: true });
        });
        observer.observe(document.body, { childList: true, subtree: true });
        runCheck();
        // Extended timeout to handle lazy loaded carousels
        setTimeout(() => observer.disconnect(), 30000);
      },
    });
  }
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (
    changeInfo.status === "complete" &&
    tab.url &&
    tab.url.includes("northeastern-csm.symplicity.com")
  ) {
    if (
      tab.url.includes("students/app/jobs/favorites") ||
      tab.url.includes("students/index.php")
    ) {
      if (tab.url.includes("students/index.php")) {
        const active_tab =
          document.getElementsByClassName("active is-selected")[0];
        if (active_tab.children[0].textContent !== "Saved") {
          return;
        }
      }
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: () => {
          const createBadge = () => {
            const badge = document.createElement("button");
            badge.innerText = "unfavorite all";
            badge.className = "nuworks-badge";
            badge.style.marginLeft = "10px";
            badge.style.display = "inline-block";
            badge.style.color = "white";
            badge.style.backgroundColor = "red";
            badge.style.borderRadius = "12px";
            badge.style.fontSize = "11px";
            badge.style.padding = "2px 6px";
            badge.style.verticalAlign = "middle";
            badge.style.fontWeight = "bold";
            badge.style.marginRight = "4px";
            return badge;
          };

          const unfavoriteAllButton = createBadge();
          document
            .querySelector(".lst-head-l")
            .appendChild(unfavoriteAllButton);
        },
      });
    }
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "JOBS_DATA") {
    sendResponse({ received: true });
    const targetTabId = sender.tab ? sender.tab.id : null;
    if (targetTabId && message.payload) {
      let jobs = [];
      const m = message.payload.models;
      if (Array.isArray(m)) jobs = m;
      else if (m && m.jobs) {
        if (Array.isArray(m.jobs)) jobs = m.jobs;
        else if (m.jobs.major && Array.isArray(m.jobs.major.jobs))
          jobs = m.jobs.major.jobs;
      }
      if (jobs.length > 0) {
        processJobs(jobs, targetTabId);
      }
    }
  }
});

// Fallback scraping
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (
    changeInfo.status === "complete" &&
    tab.url &&
    tab.url.includes("northeastern-csm.symplicity.com/students")
  ) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: () => {
          return Array.from(document.querySelectorAll("a"))
            .filter((a) => a.href.includes("/jobs/detail"))
            .map((a) => a.href.split("/").pop());
        },
      });
      if (results && results[0] && results[0].result) {
        processJobs(results[0].result, tabId);
      }
    } catch (err) {}
  }
});
