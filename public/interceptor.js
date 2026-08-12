// Copyright (c) 2026 Ashwin Iyer — Licensed under AGPL-3.0

(function () {
  console.log("NUWorks Extension: Interceptor injected");

  // Helper to check if URL matches the job discovery pattern
  function isJobDiscoveryUrl(url) {
    if (!url) return false;
    return url.includes("/api/v2/jobs") || url.includes("/api/v3/jobs");
  }

  // Intercept Fetch
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    try {
      let url = response.url;
      if (!url) {
        if (typeof args[0] === "string") {
          url = args[0];
        } else if (args[0] && args[0].url) {
          url = args[0].url;
        }
      }
      if (isJobDiscoveryUrl(url)) {
        console.log("NUWorks Extension: Fetch API detected", url);
        const clone = response.clone();
        clone
          .json()
          .then((data) => {
            console.log("NUWorks Extension: Sending Job Data", data);
            window.postMessage(
              { type: "NUWORKS_JOB_DISCOVERY", data: data, url: url },
              "*"
            );
          })
          .catch((err) =>
            console.error("NUWorks Extension: Error parsing JSON", err)
          );
      }
    } catch (e) {
      console.error("NUWorks Extension: Error in fetch interceptor", e);
    }
    return response;
  };

  // Intercept XMLHttpRequest
  const XHR = XMLHttpRequest.prototype;
  const open = XHR.open;
  const send = XHR.send;

  XHR.open = function (method, url) {
    this._url = url;
    return open.apply(this, arguments);
  };

  XHR.send = function (postData) {
    this.addEventListener("load", function () {
      if (isJobDiscoveryUrl(this._url)) {
        console.log("NUWorks Extension: XHR API detected", this._url);
        try {
          // Check content type before parsing
          const contentType = this.getResponseHeader("content-type");
          if (contentType && contentType.includes("application/json")) {
            const data = JSON.parse(this.responseText);
            console.log("NUWorks Extension: Sending Job Data (XHR)", data);
            window.postMessage(
              { type: "NUWORKS_JOB_DISCOVERY", data: data, url: this._url },
              "*"
            );
          }
        } catch (err) {
          console.error("NUWorks Extension: Error parsing XHR JSON", err);
        }
      }
    });
    return send.apply(this, arguments);
  };
})();
