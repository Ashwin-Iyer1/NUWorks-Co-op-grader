// Copyright (c) 2026 Ashwin Iyer — Licensed under AGPL-3.0

import ApiHelper from "./api.js";
import StorageHelper from "./storage.js";
import JobMatcher from "./matcher.js";

/**
 * Resolved colour values for the badges we inject into NUWorks itself.
 *
 * Injected nodes inherit from Symplicity's own `:root`, where our CSS custom
 * properties do not exist, and `chrome.scripting.executeScript` structured-
 * clones its `args` — the injected function cannot close over module scope.
 * Passing this object through `args` is therefore the only way to get token
 * values into the payload.
 *
 * Values are copied verbatim from the LIGHT block of the design tokens. These
 * badges sit on NUWorks's white page, so the dark theme is never applied here.
 */
const BADGE_THEME = {
  high: { bg: "rgba(77,106,74,0.12)", text: "#3f5d3c", border: "rgba(77,106,74,0.25)" },
  medium: { bg: "rgba(161,98,7,0.11)", text: "#8a6116", border: "rgba(161,98,7,0.25)" },
  low: { bg: "rgba(179,38,30,0.08)", text: "#b3261e", border: "rgba(179,38,30,0.22)" },
  external: { bg: "#f6e8e0", text: "#983508", border: "rgba(180,64,15,0.22)" },
  disqualified: { bg: "#f1ece3", text: "#5f584d", border: "#d8cfbf" },
};

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

// Track which jobs have already been processed per tab to prevent duplicate badge injection
const processedJobsByTab = new Map();

// Shared function to process a list of jobs
async function processJobs(jobList, tabId) {
  if (!jobList || jobList.length === 0) return;

  // Deduplicate against previously processed jobs for this tab
  if (!processedJobsByTab.has(tabId)) processedJobsByTab.set(tabId, new Set());
  const processedIds = processedJobsByTab.get(tabId);
  jobList = jobList.filter((job) => {
    const id = job.job_id || job.id || (typeof job === "string" ? job : null);
    if (id && processedIds.has(String(id))) return false;
    if (id) processedIds.add(String(id));
    return true;
  });

  if (jobList.length === 0) return;

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
  const gradeIneligible = !!creds.gradeIneligible;

  if (creds.autoGrading && creds.resume && creds.gradDate && creds.schoolYear) {
    matcher = new JobMatcher();
    resumeText = creds.resume;
    schoolYear = creds.schoolYear;
    gradDate = creds.gradDate;
    console.log("Auto-Grading Enabled: Matcher initialized.");
  } else {
    console.log("Auto-Grading Disabled or missing details.");
  }

  // Ask Symplicity which of these jobs the student actually qualifies for, in a
  // single batched request. This is authoritative and lets us skip the
  // expensive per-job description fetch for every ineligible listing.
  let qualifiedMap = {};
  if (matcher) {
    const ids = jobList
      .map((j) => {
        let id = j.job_id || j.id || (typeof j === "string" ? j : null);
        if (id && String(id).includes("?")) id = String(id).split("?")[0];
        return id;
      })
      .filter(Boolean);
    qualifiedMap = await ApiHelper.getQualifiedStatus(ids, creds);
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

        // Server says the student is not eligible → badge as Ineligible without
        // fetching the description. When "Grade ineligible jobs" is on we fall
        // through instead: the description is needed to compute the match %.
        if (matcher && qualifiedMap[jobId] === false && !gradeIneligible) {
          return {
            jobId,
            title: title || null,
            isExternal: false,
            matchResult: { score: 0, disqualified: true },
            eligibility: {
              qualified: false,
              reason: "server",
              evidence: null,
            },
          };
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
          let eligibility = null;

          if (matcher) {
            const fullText = `${title || ""} \n ${desc}`;
            // Trust the server's eligibility verdict when we have it; only fall
            // back to the local regex heuristic when the server didn't answer.
            const serverQual = qualifiedMap[jobId];
            eligibility =
              serverQual === true
                ? { qualified: true, reason: null, evidence: null }
                : serverQual === false
                  ? { qualified: false, reason: "server", evidence: null }
                  : await matcher.checkEligibility(
                      fullText,
                      schoolYear,
                      gradDate
                    );

            if (eligibility.qualified) {
              matchResult = matcher.calculateScore(resumeText, fullText);
            } else if (gradeIneligible) {
              // Still ineligible, but the user wants the match % anyway.
              // `graded` tells the badge to render both.
              matchResult = {
                ...matcher.calculateScore(resumeText, fullText),
                disqualified: true,
                graded: true,
              };
            } else {
              // Explicit disqualified status; the reason lives on `eligibility`.
              matchResult = { score: 0, disqualified: true };
            }
          }

          return { jobId, title, isExternal, matchResult, eligibility };
        }
        return {
          jobId,
          title,
          isExternal: false,
          matchResult: null,
          eligibility: null,
        };
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
      matches: (r.matchResult?.matches || []).slice(0, 3),
      missing: (r.matchResult?.missing || []).slice(0, 3),
      reason: r.eligibility?.reason || null,
    }));

  if (jobsToBadge.length > 0) {
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      args: [jobsToBadge, BADGE_THEME],
      func: (jobs, T) => {
        // `kind` is the machine-readable dedupe key ('match' | 'external').
        // The label text is the human-readable part and must NOT be relied on
        // for dedupe alone — see the guards below.
        const createBadge = (text, variant, tooltip, kind) => {
          const badge = document.createElement("span");
          badge.innerText = text;
          badge.className = "nuworks-badge";
          badge.dataset.nuworksKind = kind;
          if (tooltip) {
            // The native title attribute is the only safe hover affordance
            // inside a third-party page: no injected CSS, no positioned
            // element, no layout impact.
            badge.title = tooltip;
            badge.setAttribute("aria-label", tooltip);
          }
          const tone = T[variant] || T.disqualified;
          badge.style.display = "inline-block";
          badge.style.verticalAlign = "middle";
          badge.style.marginLeft = "10px";
          badge.style.marginRight = "4px";
          badge.style.padding = "2px 8px";
          badge.style.borderRadius = "999px";
          badge.style.fontSize = "11px";
          badge.style.fontWeight = "600";
          badge.style.lineHeight = "1.5";
          badge.style.fontFamily =
            "'Source Sans 3', system-ui, -apple-system, 'Segoe UI', sans-serif";
          badge.style.border = "1px solid " + tone.border;
          badge.style.backgroundColor = tone.bg;
          badge.style.color = tone.text;
          return badge;
        };

        const REASON_COPY = {
          server:
            "NUWorks says you don't meet this posting's stated requirements",
          "school-year": "This posting asks for a different class year",
          "grad-year": "This posting asks for a different graduation year",
          "grad-window":
            "Your graduation date falls outside this posting's window",
        };

        const EXTERNAL_TOOLTIP =
          "Application appears to be hosted on the employer's own site";

        const scoreTooltip = (job) => {
          const matched = job.matches || [];
          const missing = job.missing || [];
          const parts = [];
          if (matched.length) parts.push("Matched: " + matched.join(", "));
          if (missing.length) parts.push("Missing: " + missing.join(", "));
          return parts.length
            ? parts.join(" — ")
            : "Scored from the posting text";
        };

        // Resolve the match badge's label, colour variant and tooltip in one
        // place so Strategy 1 and Strategy 2 can never drift apart.
        const matchBadgeSpec = (job) => {
          if (job.matchResult.disqualified) {
            const reasonCopy = REASON_COPY[job.reason] || REASON_COPY.server;
            // "Grade ineligible jobs": the score was computed anyway, so the
            // badge carries both the verdict and the match %.
            if (job.matchResult.graded) {
              return {
                text: `Ineligible · ${job.matchResult.score}% Match`,
                variant: "disqualified",
                tooltip: `${reasonCopy} — ${scoreTooltip(job)}`,
              };
            }
            return {
              text: "Ineligible",
              variant: "disqualified",
              tooltip: reasonCopy,
            };
          }
          const score = job.matchResult.score;
          let variant = "low";
          if (score >= 70) variant = "high";
          else if (score >= 40) variant = "medium";
          return {
            text: `${score}% Match`,
            variant,
            tooltip: scoreTooltip(job),
          };
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
            let strategy1Handled = false;

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
                  (b) =>
                    b.dataset.nuworksKind === "external" ||
                    b.innerText === "External Application"
                );
                if (!hasExternal) {
                  const badge = createBadge(
                    "External Application",
                    "external",
                    EXTERNAL_TOOLTIP,
                    "external"
                  );
                  targetContainer.insertAdjacentElement(insertPosition, badge);
                }
              }

              // Match Badge
              if (job.matchResult) {
                const spec = matchBadgeSpec(job);

                const hasMatch = existingBadges.some(
                  (b) =>
                    b.dataset.nuworksKind === "match" ||
                    b.innerText.includes("Match") ||
                    b.innerText.includes("Qualified") ||
                    b.innerText.includes("Ineligible")
                );

                if (!hasMatch) {
                  const badge = createBadge(
                    spec.text,
                    spec.variant,
                    spec.tooltip,
                    "match"
                  );
                  targetContainer.insertAdjacentElement(insertPosition, badge);
                }
              }

              // Mark the closest list item so Strategy 2 skips this job
              const listItem = targetContainer.closest('div[role="listitem"], .carousel-card, .job-tile, .list-item, .card');
              if (listItem) listItem.setAttribute("data-nuworks-badged", job.id);
              strategy1Handled = true;
            });

            // --- Strategy 2: Title-based matching (for search page list items & Discovery cards) ---
            // Skip Strategy 2 entirely if Strategy 1 already found and badged elements for this job
            if (job.title && !strategy1Handled) {
              // Target both Search list items and Discovery carousel/grid items
              const listItems = document.querySelectorAll(
                'div[role="listitem"], .carousel-card, .job-tile, .list-item, .card'
              );
              // console.log(`[BadgeDebug] Strategy 2: Checking ${listItems.length} UI items for job "${job.title}"`);

              listItems.forEach((item) => {
                // Skip if Strategy 1 already badged this item (for any job)
                if (item.hasAttribute("data-nuworks-badged")) return;
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
                    const hasExternal = target.querySelector(
                      '[data-nuworks-kind="external"]'
                    );
                    if (!hasExternal) {
                      const badge = createBadge(
                        "External Application",
                        "external",
                        EXTERNAL_TOOLTIP,
                        "external"
                      );
                      target.appendChild(badge);
                    }
                  }

                  if (job.matchResult) {
                    const spec = matchBadgeSpec(job);

                    const existingText = target.textContent;
                    const hasMatch =
                      target.querySelector('[data-nuworks-kind="match"]') !==
                        null ||
                      existingText.includes("Match") ||
                      existingText.includes("Ineligible");

                    if (!hasMatch) {
                      const badge = createBadge(
                        spec.text,
                        spec.variant,
                        spec.tooltip,
                        "match"
                      );
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

          // Primary button, clay accent. Values are the resolved light-theme
          // token values — injected nodes cannot read our custom properties.
          const createBadge = () => {
            const badge = document.createElement("button");
            badge.type = "button"; // Prevent form submission
            badge.innerText = "Unfavorite all";
            badge.className = "nuworks-badge";
            badge.dataset.nuworksKind = "action";
            badge.style.display = "inline-block";
            badge.style.verticalAlign = "middle";
            badge.style.marginLeft = "10px";
            badge.style.marginRight = "4px";
            badge.style.padding = "4px 12px";
            badge.style.border = "none";
            badge.style.borderRadius = "8px";
            badge.style.backgroundColor = "#b4400f";
            badge.style.color = "#ffffff";
            badge.style.fontSize = "12px";
            badge.style.fontWeight = "600";
            badge.style.lineHeight = "1.5";
            badge.style.fontFamily =
              "'Source Sans 3', system-ui, -apple-system, 'Segoe UI', sans-serif";
            badge.style.cursor = "pointer";
            badge.style.boxShadow = "0 1px 2px rgba(60, 47, 35, 0.08)";
            badge.style.transition =
              "all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)";
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
  // Clear processed jobs tracking on new page load
  if (changeInfo.status === "loading") {
    processedJobsByTab.delete(tabId);
  }
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
