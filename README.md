# NUWorks Co-op Extension

A powerful Chrome Extension designed to help Northeastern University students optimize their co-op search on NUWorks (Symplicity). This tool adds validtion, qualification matching (NLP), and advanced filtering to the standard NUWorks interface.

## Features

- **Qualification Matcher**: Automatically analyzes job descriptions to check if you meet the requirements (Graduation Year, School Year).
- **NLP Powered**: Uses a Natural Language Processing model trained on real job descriptions to detect subtle requirements.
- **Smart Filters**: Filter jobs by match score, freshness (days posted), and application status.
- **Resume Parsing**: Upload your PDF resume to automatically extract keywords and profile data.
- **Persistent State**: Remembers your search results and last active view.

## Installation

### 1. Build the Extension

This project uses Parcel to bundle dependencies (like `nlp.js` and `pdfjs-dist`).

1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the extension:
   ```bash
   npm run build
   ```
   This generates a `dist/` folder.

### 2. Load in Chrome

1. Go to `chrome://extensions/`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked**.
4. Select the **`dist`** folder from the project directory.

## Development

- **Source Code**: All source files are in `src/`.
- **Static Assets**: Manifest, icons, and models are in `public/`.
- **Training the NLP Model**:
  - To train manually: Edit `train.js` and run `npm run train`.
  - To auto-train with OpenAI:
    1. Create a `.env` with `OPENAI_API_KEY`.
    2. Run `npm run train:auto`.
  - Both commands update `public/model.nlp`.

## Project Structure

```
├── dist/               # Compiled extension (LOAD THIS IN CHROME)
├── public/             # Static files (Manifest, Icons, Model)
├── src/                # Source code
│   ├── popup.js        # Main logic
│   ├── matcher.js      # Job matching logic
│   └── ...
├── example_jobs.json   # Training data
└── README.md
```

## Credits

Made by [Ashwin Iyer](https://ashwiniyer.com)
