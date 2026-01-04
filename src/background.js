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
  {
    urls: [
      "https://northeastern-csm.symplicity.com/*",
      "https://bos1225.northeastern.edu/*",
    ],
  },
  ["requestHeaders", "extraHeaders"]
);

// Helper function to check if a job description implies an external application
function isExternalApplication(jobDesc, contactBlurb) {
  if (!jobDesc) return false;
  contactBlurb = contactBlurb || "";
  const lowerDesc = jobDesc.toLowerCase();
  const lowerContactBlurb = contactBlurb.toLowerCase();
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
  const contactHrefs = lowerContactBlurb.match(/<a[^>]*href="([^"]+)"[^>]*>/g);
  if (hrefs) {
    for (const href of hrefs) {
      if (href.includes("workday") || href.includes("smartrecruiters")) {
        return true;
      }
    }
  }

  if (contactHrefs) {
    for (const href of contactHrefs) {
      if (href.includes("workday") || href.includes("smartrecruiters")) {
        return true;
      }
    }
  }

  // if contact blurb contains https, www, or http, return true
  if (
    contactBlurb.includes("https") ||
    contactBlurb.includes("www") ||
    contactBlurb.includes("http")
  ) {
    return true;
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
    contactBlurb: data.contact_blurb,
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
        let contactBlurb = job.contact_blurb;
        let title = job.job_title;

        let jobId =
          job.job_id || job.id || (typeof job === "string" ? job : null);

        if (jobId && jobId.includes("?")) {
          jobId = jobId.split("?")[0];
        }

        if (!jobId) {
          return { jobId: null };
        }

        if (!desc || !title || !contactBlurb) {
          try {
            console.log(`Fetching description for job ${jobId}...`);
            const fetched = await fetchJobDescription(jobId, creds);
            desc = fetched.desc;
            contactBlurb = fetched.contactBlurb;
            title = fetched.title;
          } catch (err) {
            console.error(`Failed to fetch for ${jobId}`, err);
          }
        }

        if (desc) {
          const isExternal = isExternalApplication(desc, contactBlurb);
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

        console.log(
          `[BadgeDebug] Injected script running for ${jobs.length} jobs.`
        );

        const runCheck = () => {
          jobs.forEach((job) => {
            // Selector strategy:
            // 1. Links containing the job ID
            // 2. Elements specifically formatted as job cards with the ID (e.g. id="job_card_12345" or similar patterns if observed)
            // 3. Data attributes
            const selectors = [
              `a[href*="${job.id}"]`,
              `[id*="${job.id}"]`, // Broad ID check
              `[data-job-id="${job.id}"]`,
            ];

            const elements = document.querySelectorAll(selectors.join(","));

            elements.forEach((el) => {
              // Filter out non-relevant elements if using broad ID selector
              // e.g. if we matched a container that ISN'T the card itself or a link
              // But generally, we want to find the CARD or the TITLE.

              // Avoid action buttons/favorites
              if (
                el.closest(".actions-toggle-wrap") ||
                el.classList.contains("icn-favorite") ||
                el.classList.contains("icn-favorite-hi") ||
                el.classList.contains("list_rows") ||
                el.tagName === "SCRIPT" ||
                el.tagName === "STYLE"
              ) {
                return;
              }

              // Identify target container
              let targetContainer = null;
              let insertPosition = "afterend"; // default

              // Case 1: Carousel Card
              // If 'el' is the card itself or inside it
              const carouselCard = el.closest(".carousel-card");
              if (carouselCard) {
                const titleEl = carouselCard.querySelector(
                  ".carousel-card-content-title"
                );
                if (titleEl) {
                  targetContainer = titleEl;
                  insertPosition = "afterend";
                } else {
                  // If no title found inside (weird), fallback to el
                  targetContainer = el;
                }
              }
              // Case 2: Standard List
              else {
                // If matches a link, use it
                targetContainer = el;
              }

              if (!targetContainer) return;

              // Check if badges already exist specifically on THIS target container's typical badge location
              // We check siblings usually
              let existingBadges = [];
              if (targetContainer.parentNode) {
                let sib = targetContainer.nextElementSibling;
                while (sib && sib.classList.contains("nuworks-badge")) {
                  existingBadges.push(sib);
                  sib = sib.nextElementSibling;
                }
                // Also check children if we appendChild later (Strategy 2 legacy)
                const childBadges =
                  targetContainer.querySelectorAll(".nuworks-badge");
                childBadges.forEach((b) => existingBadges.push(b));
              }

              // External Badge
              if (job.isExternal) {
                const hasExternal = existingBadges.some(
                  (b) => b.innerText === "External Application"
                );
                if (!hasExternal) {
                  const badge = createBadge("External Application", "red");
                  targetContainer.insertAdjacentElement(insertPosition, badge);
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

                if (!hasMatch) {
                  const badge = createBadge(text, color);
                  targetContainer.insertAdjacentElement(insertPosition, badge);
                }
              }
            });

            // --- Strategy 2: Title-based matching (for search page list items & Discovery cards) ---
            if (job.title) {
              // Target both Search list items and Discovery carousel/grid items
              const listItems = document.querySelectorAll(
                'div[role="listitem"], .carousel-card, .job-tile, .list-item, .card'
              );
              // console.log(`[BadgeDebug] Strategy 2: Checking ${listItems.length} UI items for job "${job.title}"`);

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
    (tab.url.includes("northeastern-csm.symplicity.com") ||
      tab.url.includes("bos1225.northeastern.edu"))
  ) {
    if (
      tab.url.includes("students/app/jobs/favorites") ||
      tab.url.includes("students/index.php")
    ) {
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: () => {
          if (window.location.href.includes("students/index.php")) {
            const activeTab = document.querySelector(".active.is-selected");
            if (
              !activeTab ||
              !activeTab.children[0] ||
              activeTab.children[0].textContent.trim() !== "Saved"
            ) {
              return;
            }
          }

          const createBadge = () => {
            const badge = document.createElement("button");
            badge.type = "button"; // Prevent form submission
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

          const jobs = [];
          const jobElements = document.querySelectorAll(".list-item.list_rows");
          jobElements.forEach((jobElement) => {
            const jobId = jobElement.id.replace("row_", "");
            if (jobId) {
              jobs.push({ job_id: jobId });
            }
          });

          const unfavoriteAllButton = createBadge();
          const target = document.querySelector(".lst-head-l");
          if (target) {
            target.appendChild(unfavoriteAllButton);
            unfavoriteAllButton.addEventListener("click", (e) => {
              e.preventDefault();
              e.stopPropagation();
              unfavoriteAllButton.innerText = "Processing...";

              chrome.runtime.sendMessage(
                { type: "UNFAVORITE_JOBS", jobs: jobs },
                (response) => {
                  if (chrome.runtime.lastError) {
                    console.error(chrome.runtime.lastError);
                    unfavoriteAllButton.innerText = "Error";
                    return;
                  }
                  if (response) {
                    unfavoriteAllButton.innerText = `Unfavorited ${response.success} jobs (${response.fail} failed)`;
                  }
                }
              );
            });
          }
        },
      });
    }
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "JOBS_DATA") {
    (async () => {
      const targetTabId = sender.tab ? sender.tab.id : null;
      if (targetTabId && message.payload) {
        let jobs = [];
        const payload = message.payload;

        // Robust extraction of job list from various potential API response structures
        if (Array.isArray(payload)) {
          jobs = payload;
        } else if (payload.models && Array.isArray(payload.models)) {
          jobs = payload.models;
        } else if (
          payload.models &&
          payload.models.jobs &&
          typeof payload.models.jobs === "object"
        ) {
          // Handle models -> jobs -> [category] -> jobs
          Object.values(payload.models.jobs).forEach((category) => {
            if (category && Array.isArray(category.jobs)) {
              jobs.push(...category.jobs);
            }
          });
        } else if (payload.data && Array.isArray(payload.data)) {
          jobs = payload.data;
        } else if (payload.results && Array.isArray(payload.results)) {
          jobs = payload.results;
        } else if (payload.jobs) {
          if (Array.isArray(payload.jobs)) jobs = payload.jobs;
        }

        // Deduplicate jobs based on ID
        if (jobs.length > 0) {
          const uniqueJobsMap = new Map();
          jobs.forEach((job) => {
            const id =
              job.job_id || job.id || (typeof job === "string" ? job : null);
            if (id && !uniqueJobsMap.has(id)) {
              uniqueJobsMap.set(id, job);
            }
          });
          const uniqueJobs = Array.from(uniqueJobsMap.values());
          await processJobs(uniqueJobs, targetTabId);
        }
      }
      sendResponse({ received: true });
    })();
    return true; // Keep channel open for async response
  } else if (message.type === "UNFAVORITE_JOBS") {
    (async () => {
      try {
        const creds = await StorageHelper.getCredentials();
        const results = await Promise.all(
          message.jobs.map((job) => ApiHelper.unfavoriteJob(job.job_id, creds))
        );
        const successCount = results.filter((s) => s).length;
        const failCount = results.length - successCount;
        sendResponse({ success: successCount, fail: failCount });
      } catch (err) {
        console.error("Error in UNFAVORITE_JOBS handler:", err);
        sendResponse({ success: 0, fail: message.jobs.length });
      }
    })();
    return true; // Keep channel open for async response
  }
});

// Fallback scraping
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (
    changeInfo.status === "complete" &&
    tab.url &&
    (tab.url.includes("northeastern-csm.symplicity.com/students") ||
      tab.url.includes("bos1225.northeastern.edu/student"))
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
