/**
 * api.js
 * Handles all network requests to Symplicity API
 */

const ApiHelper = {
  BASE_URL: "https://northeastern-csm.symplicity.com",

  /**
   * construct headers for requests
   * @param {Object} creds - {cookie, authorization}
   */
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

  /**
   * Fetch jobs from API
   * @param {Object} params - search parameters
   * @param {Object} creds - credentials
   * @returns {Promise<Array>}
   */
  fetchJobs: async (params, creds) => {
    const apiUrl = `${ApiHelper.BASE_URL}/api/v2/jobs`;
    const searchParams = new URLSearchParams(params);
    const headers = ApiHelper.getHeaders(creds);

    const response = await fetch(`${apiUrl}?${searchParams.toString()}`, {
      method: "GET",
      headers: headers,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.models;
  },

  /**
   * Favorite/Save a job
   * @param {string} jobId
   * @param {Object} creds
   * @returns {Promise<boolean>}
   */
  favoriteJob: async (jobId, creds) => {
    const favUrl = `${ApiHelper.BASE_URL}/api/v2/jobs/${jobId}/favorite`;
    const headers = ApiHelper.getHeaders(creds);

    try {
      const response = await fetch(favUrl, {
        method: "POST",
        headers: headers,
      });
      return response.ok;
    } catch (err) {
      console.error("Error saving job:", jobId, err);
      return false;
    }
  },
};

window.ApiHelper = ApiHelper;
