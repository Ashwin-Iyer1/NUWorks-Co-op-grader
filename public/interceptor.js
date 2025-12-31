(function () {
  console.log("NUWorks Extension: Interceptor injected");

  // Helper to check if URL matches the job discovery pattern
  function isJobDiscoveryUrl(url) {
    if (!url) return false;
    // Check for base path and json_mode param
    // Handles matches like:
    // https://northeastern-csm.symplicity.com/api/v2/jobs?json_mode=read_only
    // https://northeastern-csm.symplicity.com/api/v2/jobs/?json_mode=read_only
    // /api/v2/jobs?json_mode=read_only
    // Or strictly /api/v2/jobs? (Search page)
    // Or /api/v2/jobs/discovery
    const isDiscovery =
      (url.includes("/api/v2/jobs") ||
        url.includes("/api/v2/jobs/") ||
        url.includes("/api/v3/jobs") ||
        url.includes("/api/v3/jobs/")) &&
      url.includes("json_mode=read_only") &&
      url.includes("enable_translation=false");

    const isSearch =
      url.includes("/api/v2/jobs?") || url.includes("/api/v3/jobs?");
    const isNewDiscovery =
      url.includes("/api/v2/jobs/discovery") ||
      url.includes("/api/v3/jobs/discovery");

    return isDiscovery || isSearch || isNewDiscovery;
  }

  // Intercept Fetch
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    try {
      const url = response.url ? response.url : args[0];
      if (isJobDiscoveryUrl(url)) {
        console.log("NUWorks Extension: Fetch API detected", url);
        const clone = response.clone();
        clone
          .json()
          .then((data) => {
            console.log("NUWorks Extension: Sending Job Data", data);
            window.postMessage(
              { type: "NUWORKS_JOB_DISCOVERY", data: data },
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
              { type: "NUWORKS_JOB_DISCOVERY", data: data },
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
