const ApiHelper = {
  BASE_URL: "https://northeastern-csm.symplicity.com",
  getHeaders: (creds, referer) => {
    const headers = {
      accept: "application/json, text/plain, */*",
      "accept-language": "en-US,en;q=0.9,es;q=0.8",
      authorization: creds.authorization,
      "sec-ch-ua":
        '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"macOS"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "x-requested-system-user": "students",
      Cookie: creds.cookie,
    };

    if (referer) {
      headers["Referer"] = referer;
    }

    return headers;
  },
};

const onSendHeadersListener = function (details) {
  if (details.url.includes("northeastern-csm.symplicity.com/api/")) {
    console.log("Symplicity Request Detected:", details.url);
    console.log("Request Headers:", details.requestHeaders);
    if (details.requestHeaders) {
      const cookie = details.requestHeaders.find(
        (header) => header.name.toLowerCase() === "cookie"
      );
      const authorization = details.requestHeaders.find(
        (header) => header.name.toLowerCase() === "authorization"
      );
      if (cookie) {
        console.log("cookie:", cookie.value);
        chrome.storage.local.set({ cookie: cookie.value }, () => {
          console.log("Cookie saved to storage");
        });
      }
      if (authorization) {
        console.log("authorization:", authorization.value);

        chrome.storage.local.set({ authorization: authorization.value }, () => {
          console.log("Authorization saved to storage");
        });
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

  // Text-based checks
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

  // Link-based checks (looking for hrefs to specific domains)
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
  let apiUrl = `${ApiHelper.BASE_URL}/api/v3/jobs/${jobId}`;
  const referer = `${ApiHelper.BASE_URL}/students/app/jobs/detail/${jobId}`;
  const headers = ApiHelper.getHeaders(creds, referer);

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
    title: data.job_title || data.title, // Fallback just in case
  };
}

// Shared function to process a list of jobs
async function processJobs(jobList, tabId) {
  if (!jobList || jobList.length === 0) return;

  const data = await chrome.storage.local.get(["cookie", "authorization"]);
  if (!data.cookie || !data.authorization) {
    console.log("Credentials missing for processJobs");
    return;
  }

  console.log(`Processing ${jobList.length} jobs...`);

  const results = await Promise.all(
    jobList.map(async (job) => {
      try {
        let desc = job.job_desc || job.description;
        let title = job.job_title; // From intercepted data

        // Handle both object-with-id and simple-id-string (from DOM scrape)
        let jobId =
          job.job_id || job.id || (typeof job === "string" ? job : null);

        // Clean query params if present in ID
        if (jobId && jobId.includes("?")) {
          jobId = jobId.split("?")[0];
        }

        if (!jobId) {
          console.log("Skipping job with no ID:", job);
          return { jobId: null, title: null, isExternal: false };
        }

        if (!desc || !title) {
          try {
            // If we don't have desc or title (e.g. fallback scraping), fetch them
            console.log(`Fetching description for job ${jobId}...`);
            const fetched = await fetchJobDescription(jobId, data);
            desc = fetched.desc;
            title = fetched.title;
            console.log(
              `Fetched description for ${jobId}. Length: ${
                desc ? desc.length : 0
              }`
            );
          } catch (err) {
            console.error(
              `Failed to fetch description/title for ${jobId}`,
              err
            );
          }
        }

        if (desc) {
          const isExternal = isExternalApplication(desc);
          console.log(`Job ${jobId} isExternal: ${isExternal}`);
          if (isExternal)
            console.log(`Job ${jobId} (${title}) is external (MATCHED)`);
          return { jobId, title, isExternal };
        } else {
          console.log(`Job ${jobId} has no description after fetch attempt.`);
        }
        return { jobId, title, isExternal: false };
      } catch (e) {
        console.error("Error processing job", job, e);
        return { jobId: job?.id, title: null, isExternal: false };
      }
    })
  );

  const externalJobs = results
    .filter((r) => r.isExternal && r.jobId)
    .map((r) => ({ id: r.jobId, title: r.title }));

  if (externalJobs.length > 0) {
    console.log("Injecting badges for jobs:", externalJobs);
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      args: [externalJobs],
      func: (jobs) => {
        const runCheck = () => {
          jobs.forEach((job) => {
            // --- Strategy 1: ID-based matching (for discovery/carousel) ---
            const selector = `a[href*="${job.id}"]`;
            const elements = document.querySelectorAll(selector);

            elements.forEach((el) => {
              if (el.querySelector(".nuworks-badge")) return;

              // Avoid injecting into action buttons (like potential "Remove from Saved" links on favorites page)
              if (
                el.closest(".actions-toggle-wrap") ||
                el.classList.contains("icn-favorite") ||
                el.classList.contains("icn-favorite-hi")
              ) {
                return;
              }

              // Case 1: Carousel Card
              const titleEl = el.querySelector(".carousel-card-content-title");
              if (titleEl) {
                if (
                  titleEl.nextElementSibling &&
                  titleEl.nextElementSibling.classList.contains("nuworks-badge")
                )
                  return;

                const badge = createBadge();
                titleEl.insertAdjacentElement("afterend", badge);
                return;
              }

              // Case 2: Standard List or other views
              if (
                el.nextElementSibling &&
                el.nextElementSibling.classList.contains("nuworks-badge")
              )
                return;

              const badge = createBadge();
              // Adjust styling for this case if needed
              badge.style.marginLeft = "10px";
              el.insertAdjacentElement("afterend", badge);
            });

            // --- Strategy 2: Title-based matching (for search page list items) ---
            if (job.title) {
              const listItems = document.querySelectorAll(
                'div[role="listitem"]'
              );
              listItems.forEach((item) => {
                // Avoid double injection
                if (item.querySelector(".nuworks-badge")) return;

                // Find the title container. Based on user snippet:
                // <div class="list-item-title ..."> ... <span>Title</span> ... </div>
                // referencing the snippet, the text is deep inside .list-item-title
                const titleContainer = item.querySelector(".list-item-title");
                if (titleContainer) {
                  const text = titleContainer.textContent.trim();
                  // Check if the text contains the job title
                  // using includes because sometimes there's extra whitespace or "New" badges
                  if (text.includes(job.title)) {
                    // Inject into the actions area or next to the title?
                    // User asked to "insert the element into the item"
                    // The screenshot/snippet suggests a good place might be next to the title or in the actions column.
                    // Let's try appending to the title container first as it's most visible.

                    // However, the snippet shows the title is in a flex container potentially.
                    // Let's look for a specific place.
                    // <div class="list-item-body"> ... <div class="list-item-title">

                    const badge = createBadge();
                    // On the search page, the title often has its own row.
                    // Let's try to append it to the title div, or right after the specific span if possible.

                    // Use a slightly different style for the list item to ensure it fits
                    badge.style.marginLeft = "8px";

                    // Find the specific span with the text if possible to be precise
                    const spans = Array.from(
                      titleContainer.querySelectorAll("span")
                    );
                    const targetSpan = spans.find((s) =>
                      s.textContent.includes(job.title)
                    );

                    if (targetSpan) {
                      targetSpan.parentNode.insertBefore(
                        badge,
                        targetSpan.nextSibling
                      );
                      console.log(
                        `Injected badge for ${job.title} (Title Match)`
                      );
                    } else {
                      // Fallback: append to title container
                      titleContainer.appendChild(badge);
                      console.log(
                        `Injected badge for ${job.title} (Container Match)`
                      );
                    }
                  }
                }
              });
            }
          });
        };

        function createBadge() {
          const badge = document.createElement("span");
          badge.innerText = "External Application";
          badge.className = "nuworks-badge";
          badge.style.marginLeft = "0px";
          badge.style.marginTop = "0px"; // Reset
          badge.style.display = "inline-block";
          badge.style.color = "white";
          badge.style.backgroundColor = "red";
          badge.style.borderRadius = "12px";
          badge.style.fontSize = "11px";
          badge.style.padding = "2px 6px";
          badge.style.verticalAlign = "middle";
          badge.style.fontWeight = "bold";
          return badge;
        }

        // Run immediately
        runCheck();

        // Run on mutations (race condition handling)
        const observer = new MutationObserver((mutations) => {
          runCheck();
        });

        observer.observe(document.body, { childList: true, subtree: true });

        // Stop after 10 seconds to save resources
        setTimeout(() => observer.disconnect(), 10000);
      },
    });
  }
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (
    changeInfo.status === "complete" &&
    tab.url &&
    (tab.url.includes("northeastern-csm.symplicity.com/students/app/") ||
      tab.url.includes("northeastern-csm.symplicity.com/students/index"))
  ) {
    console.log("Jobs Page Detected:", tab.url);

    if (
      tab.url.includes(
        "northeastern-csm.symplicity.com/students/app/jobs/discover"
      )
    ) {
      console.log("Discover Page Detected:", tab.url);
    } else if (
      tab.url.includes(
        "northeastern-csm.symplicity.com/students/app/jobs/search"
      )
    ) {
      console.log("Search Page Detected:", tab.url);
    }
  }
});

// Move message listener outside to avoid multiple registrations
// Move message listener outside to avoid multiple registrations
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "JOBS_DATA") {
    // Send immediate response to avoid "message port closed before a response was received"
    sendResponse({ received: true });

    // Use sender.tab.id if available, otherwise ignore or handle appropriately
    const targetTabId = sender.tab ? sender.tab.id : null;
    if (targetTabId) {
      console.log(
        "Background received Job Data via sniffing:",
        message.payload
      );

      let jobs = [];
      const m = message.payload.models;

      if (Array.isArray(m)) {
        // Old/Search API
        jobs = m;
      } else if (m && m.jobs) {
        if (Array.isArray(m.jobs)) {
          // Discovery API (maybe?)
          jobs = m.jobs;
        } else if (m.jobs.major && Array.isArray(m.jobs.major.jobs)) {
          // Home/Dashboard API
          jobs = m.jobs.major.jobs;
        }
      }

      if (jobs.length > 0) {
        processJobs(jobs, targetTabId).catch((err) =>
          console.error("Error in processJobs:", err)
        );
      }
    }
  }
  // Return true to indicate we might respond asynchronously (though we responded sync above, keeping it standard is fine, or arguably unnecessary if we responded sync)
  // Actually if we responded sync, we don't strictly need return true, but it doesn't hurt.
  // Ideally: if we respond sync, we don't return true.
});

// Independent DOM scraping logic (kept as fallback/supplement)
// Use a separate listener or just trigger it on update
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (
    changeInfo.status === "complete" &&
    tab.url &&
    (tab.url.includes("northeastern-csm.symplicity.com/students/app/") ||
      tab.url.includes("northeastern-csm.symplicity.com/students/index"))
  ) {
    try {
      // Scrape Job IDs from the page as fallback
      const results = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: () => {
          const allLinks = document.querySelectorAll("a");
          const jobIds = [];
          allLinks.forEach((link) => {
            if (
              link.href.includes(
                "northeastern-csm.symplicity.com/students/app/jobs/detail"
              )
            ) {
              jobIds.push(link.href.split("/").pop());
            }
          });
          return jobIds;
        },
      });

      if (results && results[0] && results[0].result) {
        const jobIds = results[0].result;
        // Reuse processJobs with list of strings
        await processJobs(jobIds, tabId);
      }
    } catch (err) {
      console.error("Script execution failed:", err);
    }
  }
});
