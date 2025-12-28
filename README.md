# NUWorks Co-op Search Extension

A powerful Chrome Extension designed to help Northeastern University students optimize their co-op search on NUWorks (Symplicity). This tool adds advanced filtering, resume matching, and bulk automation features to the standard NUWorks interface.

## Features

### Advanced Job Matching

- **Smart Scoring**: Uses a custom matching algorithm that combines **Cosine Similarity**, **Explicit Skill Matching** (from a database of 250+ technical and soft skills), and **Dynamic Keyword Extraction** to score every job against your resume (0-100%).
- **Qualification Checks**: Automatically filters out jobs that don't match your **School Year** (e.g., Freshman, Junior) or **Graduation Date**, saving you from applying to ineligible positions.

### Enhanced Filtering

- **Multi-Select Industry Filter**: searchable dropdown to select multiple industries (e.g., "Software", "Finance", "Robotics") simultaneously.
- **Parametric Search**: Filter by Job Type (Co-op, Internship), Post Date (Last 24h, 7 days, etc.), and exclude jobs you've already applied to.

### Automation & Productivity

- **Bulk Save**: One-click "Save All" feature to add all highly-matched jobs to your Favorites list for later review.
- **Privacy-First Resume Parsing**: Upload your PDF resume or paste text directly. All processing checks happen **locally** in your browser using `pdf.js` and client-side logic—no data leaves your machine.

## Installation

1. **Clone the Repository**

   ```bash
   git clone https://github.com/Ashwin-Iyer1/NUWorks-co-op-extension.git
   ```

2. **Load into Chrome**
   - Open Chrome and navigate to `chrome://extensions/`.
   - Enable **Developer mode** in the top right corner.
   - Click **Load unpacked**.
   - Select the folder where you cloned this repository.

## Usage Guide

1. **Navigate to NUWorks**

   - Go to [northeastern-csm.symplicity.com](https://northeastern-csm.symplicity.com).
   - Log in with your student credentials.
   - _Note: The extension will show a warning if you are not on the correct domain or not logged in._

2. **Setup Profile**

   - Open the extension popup.
   - Upload your Resume (PDF) or paste the text.
   - Select your **Current School Year** and **Expected Graduation Date** to enable qualification filtering.

3. **Search & Analyze**

   - Select your desired **Industries**.
   - Adjust filters (Post Date, Job Type).
   - Set a **Minimum Match Score** (e.g., 50%).
   - Click **Analyze Jobs**.

4. **Review & Save**
   - The extension will fetch jobs, score them against your resume, and display the results sorted by match score.
   - Click **Save** on individual cards or use the **Save All** button to batch-save all displayed jobs to your NUWorks "Favorites".

## Tech Stack

- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **API**: `fetch` API for communicating with Symplicity backend
- **PDF Processing**: `pdf.js` for client-side text extraction
- **Platform**: Chrome Extensions API (Manifest V3)

## Permissions Explained

- `host_permissions`: `*://northeastern-csm.symplicity.com/*` - Required to fetch job data and save favorites on your behalf.
- `storage`: Used to save your resume text, settings, and last search results locally.
- `webRequest`: Used to detect authentication headers (Cookies/Auth tokens) securely from your active session.

## Note

This is an unofficial tool and is not affiliated with Northeastern University or Symplicity.
