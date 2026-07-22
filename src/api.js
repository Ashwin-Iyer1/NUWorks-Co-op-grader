/**
 * api.js
 * Handles all network requests to Symplicity API
 */

const ApiHelper = {
  BASE_URL: "https://northeastern-csm.symplicity.com",

  /**
   * construct headers for requests
   * @param {Object} creds - {cookie, authorization}
   * @param {string} [referer] - optional referer URL
   */
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
    if (referer) headers.Referer = referer;
    return headers;
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

  /**
   * Unfavorite/Unsave a job
   * @param {string} jobId
   * @param {Object} creds
   * @returns {Promise<boolean>}
   */
  unfavoriteJob: async (jobId, creds) => {
    const unfavUrl = `${ApiHelper.BASE_URL}/api/v2/jobs/${jobId}/favorite`;
    const headers = ApiHelper.getHeaders(creds);

    try {
      const response = await fetch(unfavUrl, {
        method: "DELETE",
        headers: headers,
      });
      return response.ok;
    } catch (err) {
      console.error("Error unfavoriting job:", jobId, err);
      return false;
    }
  },

  /**
   * Get the currently logged-in student. Needed to obtain the internal user id
   * that the profile endpoint requires.
   * @param {Object} creds
   * @returns {Promise<Object|null>} user object ({ id, name, email, fname, ... })
   */
  getCurrentUser: async (creds) => {
    try {
      const resp = await fetch(`${ApiHelper.BASE_URL}/api/v2/auth/current-user`, {
        headers: ApiHelper.getHeaders(creds),
      });
      if (!resp.ok) return null;
      const data = await resp.json();
      return data.data || data.user || null;
    } catch (err) {
      console.error("Error fetching current user:", err);
      return null;
    }
  },

  /**
   * Fetch the student's profile. Returns their real graduation date, class
   * year, major, work authorization, GPA and declared skills — everything the
   * extension currently asks the user to enter by hand.
   * @param {string} userId - id from getCurrentUser()
   * @param {Object} creds
   * @returns {Promise<Object|null>}
   */
  getStudentProfile: async (userId, creds) => {
    try {
      const url = `${ApiHelper.BASE_URL}/api/v2/student/profile?enable_translation=false&id=${encodeURIComponent(
        userId
      )}`;
      const resp = await fetch(url, { headers: ApiHelper.getHeaders(creds) });
      if (!resp.ok) return null;
      return await resp.json();
    } catch (err) {
      console.error("Error fetching student profile:", err);
      return null;
    }
  },

  /**
   * Ask Symplicity itself whether the student qualifies for a batch of jobs.
   * This is the authoritative, server-side eligibility check (the same one the
   * site uses) and covers many jobs in a single request — far more accurate and
   * cheaper than fetching each description and running local regex heuristics.
   * @param {string[]} jobIds
   * @param {Object} creds
   * @returns {Promise<Object>} map of jobId -> boolean (true = qualified)
   */
  getQualifiedStatus: async (jobIds, creds) => {
    const result = {};
    if (!jobIds || jobIds.length === 0) return result;

    const CHUNK = 50; // keep the query string a reasonable length
    const headers = ApiHelper.getHeaders(creds);

    for (let i = 0; i < jobIds.length; i += CHUNK) {
      const chunk = jobIds.slice(i, i + CHUNK);
      const url = `${ApiHelper.BASE_URL}/api/v2/jobs/discovery/qualified-status?jobs=${chunk.join(
        ","
      )}`;
      try {
        const resp = await fetch(url, { headers });
        if (!resp.ok) continue;
        const data = await resp.json();
        const map = data.qualified || {};
        for (const [id, status] of Object.entries(map)) {
          // "" (empty) or anything that isn't "Not Qualified" means eligible.
          result[id] = !/not\s*qualified/i.test(String(status));
        }
      } catch (err) {
        console.error("Error fetching qualified-status chunk:", err);
      }
    }
    return result;
  },

  /**
   * Fetch the live student job-filter definitions (industries, job types, the
   * "Show Me" options, etc.). Lets the UI stay in sync with Symplicity instead
   * of relying on a hardcoded list that can drift over time.
   * @param {Object} creds
   * @returns {Promise<Array|null>}
   */
  fetchFilters: async (creds) => {
    try {
      const resp = await fetch(
        `${ApiHelper.BASE_URL}/api/v2/jobs/filters/students`,
        { headers: ApiHelper.getHeaders(creds) }
      );
      if (!resp.ok) return null;
      return await resp.json();
    } catch (err) {
      console.error("Error fetching filters:", err);
      return null;
    }
  },
};

export default ApiHelper;
