(function () {
  console.log("NUWorks Extension: Interceptor injected");

  // Helper to check if URL matches the job discovery pattern
  function isJobDiscoveryUrl(url) {
    if (!url) return false;

    // Check current page context
    const currentUrl = window.location.href;
    const isHomeOrDiscover =
      currentUrl.includes("/app/home") ||
      currentUrl.includes("/jobs/discovery");

    if (isHomeOrDiscover) {
      // On Home/Discover pages, accept both discovery and standard job endpoints
      return (
        url.includes("/api/v2/jobs/discovery") || url.includes("/api/v2/jobs")
      );
    }

    // On other pages, accept standard job endpoints
    return url.includes("/api/v2/jobs") || url.includes("/api/v3/jobs");
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
