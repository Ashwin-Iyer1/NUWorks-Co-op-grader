const ApiHelper = {
  BASE_URL: "https://northeastern-csm.symplicity.com",
  getHeaders: (creds) => {
    return {
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
  },
};

const onSendHeadersListener = function (details) {
  if (
    details.url.includes(
      "northeastern-csm.symplicity.com/api/v2/auth/current-user"
    )
  ) {
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
  const apiUrl = `${ApiHelper.BASE_URL}/api/v2/jobs/${jobId}`;
  const headers = ApiHelper.getHeaders(creds);

  const response = await fetch(apiUrl, {
    method: "GET",
    headers: headers,
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  return data.job_desc;
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (
    changeInfo.status === "complete" &&
    tab.url &&
    tab.url.includes(
      "northeastern-csm.symplicity.com/students/app/jobs/favorites"
    )
  ) {
    console.log("Favorites Page Detected:", tab.url);

    try {
      // 1. Scrape Job IDs from the page
      const results = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: () => {
          const links = document.querySelectorAll(".ListPrimaryLink");
          const jobIds = [];
          links.forEach((link) => {
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

        // 2. Retrieve credentials
        const data = await chrome.storage.local.get([
          "cookie",
          "authorization",
        ]);

        if (data.cookie && data.authorization) {
          console.log(`Processing ${jobIds.length} jobs in parallel...`);

          // 3. Process all jobs in parallel
          const jobResults = await Promise.all(
            jobIds.map(async (jobId) => {
              try {
                const desc = await fetchJobDescription(jobId, data);
                const isExternal = isExternalApplication(desc);
                if (isExternal) {
                  console.log(`Job ID: ${jobId} is an External Application`);
                }
                return { jobId, isExternal };
              } catch (e) {
                console.error(`Failed to fetch description for ${jobId}`, e);
                return { jobId, isExternal: false };
              }
            })
          );

          // 4. Filter for external jobs
          const externalJobIds = jobResults
            .filter((r) => r.isExternal)
            .map((r) => r.jobId);

          // 5. Batch update the DOM
          if (externalJobIds.length > 0) {
            chrome.scripting.executeScript({
              target: { tabId: tabId },
              args: [externalJobIds],
              func: (externalIds) => {
                const links = document.querySelectorAll(".ListPrimaryLink");
                links.forEach((link) => {
                  const id = link.href.split("/").pop();
                  if (externalIds.includes(id)) {
                    // Check if badge already exists to avoid duplicates
                    if (
                      !link.nextElementSibling ||
                      !link.nextElementSibling.innerText.includes(
                        "External Application"
                      )
                    ) {
                      link.insertAdjacentHTML(
                        "afterend",
                        '<span style="margin-left: 15px; color: white;background-color: red;border-radius: 12px;font-size: 12px;padding: 5px;">External Application</span>'
                      );
                    }
                  }
                });
              },
            });
          }
        } else {
          console.log(
            "Credentials (cookie/auth) not found in storage. Please browse Symplicity to capture them."
          );
        }
      }
    } catch (err) {
      console.error("Script execution failed:", err);
    }
  }
});
