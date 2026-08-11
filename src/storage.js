/**
 * storage.js
 * Handles all interactions with chrome.storage.local
 */

const StorageHelper = {
  /**
   * Get all relevant credentials and state
   * @returns {Promise<Object>}
   */
  getCredentials: () => {
    return new Promise((resolve) => {
      chrome.storage.local.get(
        [
          "cookie",
          "authorization",
          "resume",
          "schoolYear",
          "gradDate",
          "autoGrading",
          "gradeIneligible",
          "profileSkills",
          "viewState",
          "lastAnalysisResults",
        ],
        (result) => resolve(result)
      );
    });
  },

  /**
   * Save user demographics and settings
   * @param {string} schoolYear
   * @param {string} gradDate
   * @param {boolean} autoGrading
   * @param {boolean} gradeIneligible
   * @returns {Promise<void>}
   */
  saveUserDemographics: (schoolYear, gradDate, autoGrading, gradeIneligible) => {
    return new Promise((resolve) => {
      chrome.storage.local.set(
        { schoolYear, gradDate, autoGrading, gradeIneligible },
        () => resolve()
      );
    });
  },

  /**
   * Save resume text
   * @param {string} text
   * @returns {Promise<void>}
   */
  saveResume: (text) => {
    return new Promise((resolve) => {
      chrome.storage.local.set({ resume: text }, () => resolve());
    });
  },

  /**
   * Get just the resume
   * @returns {Promise<string>}
   */
  getResume: () => {
    return new Promise((resolve) => {
      chrome.storage.local.get(["resume"], (result) => resolve(result.resume));
    });
  },

  /**
   * Save the current view state and results for persistence
   * @param {string} viewState
   * @param {Array} results
   */
  saveState: (viewState, results) => {
    chrome.storage.local.set({
      viewState: viewState,
      lastAnalysisResults: results,
    });
  },

  /**
   * Clear persistence state
   */
  clearState: () => {
    chrome.storage.local.remove(["viewState", "lastAnalysisResults"]);
  },
};

export default StorageHelper;
