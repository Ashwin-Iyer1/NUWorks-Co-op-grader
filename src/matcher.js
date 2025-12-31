// import nlpProcessor from "./nlp-processor.js";

// EXPANDED Common skills database for various majors (Finance, Business, Tech, Engineering, etc.)
const SKILL_DB = new Set([
  // --- TECH ---
  "python",
  "javascript",
  "typescript",
  "java",
  "c++",
  "c#",
  "rust",
  "swift",
  "kotlin",
  "html",
  "css",
  "sql",
  "nosql",
  "postgresql",
  "mysql",
  "mongodb",
  "redis",
  "react",
  "angular",
  "vue",
  "node.js",
  "express",
  "fastapi",
  "flask",
  "django",
  "spring boot",
  "aws",
  "azure",
  "gcp",
  "docker",
  "kubernetes",
  "git",
  "linux",
  "agile",
  "scrum",
  "rest api",

  // --- FINANCE & BANKING ---
  "financial analysis",
  "financial modeling",
  "accounting",
  "valuation",
  "corporate finance",
  "bloomberg",
  "excel",
  "vba",
  "forecasting",
  "auditing",
  "risk management",
  "investment banking",
  "portfolio management",
  "equity research",
  "capital markets",
  "mergers and acquisitions",
  "m&a",
  "gaap",
  "ifrs",
  "taxation",
  "financial reporting",
  "sap",
  "oracle",
  "quickbooks",

  // --- BUSINESS & MARKETING ---
  "market research",
  "digital marketing",
  "seo",
  "sem",
  "google analytics",
  "content strategy",
  "social media marketing",
  "brand management",
  "crm",
  "salesforce",
  "hubspot",
  "negotiation",
  "project management",
  "strategic planning",
  "business development",
  "public relations",
  "email marketing",
  "copywriting",
  "lead generation",

  // --- DATA & ANALYTICS ---
  "data analysis",
  "tableau",
  "power bi",
  "statistics",
  "sas",
  "spss",
  "big data",
  "data visualization",
  "machine learning",
  "predictive modeling",
  "business intelligence",
  "pandas",
  "numpy",
  "scikit-learn",
  "pytorch",
  "tensorflow",
  "keras",
  "matplotlib",
  "seaborn",
  "simpy",

  // --- ENGINEERING (Non-SW) ---
  "autocad",
  "solidworks",
  "matlab",
  "simulink",
  "cad",
  "cam",
  "ansys",
  "circuit design",
  "pcb design",
  "lean manufacturing",
  "six sigma",
  "dfma",
  "quality control",

  // --- SOFT SKILLS / GENERAL ---
  "communication",
  "teamwork",
  "leadership",
  "problem solving",
  "critical thinking",
  "time management",
  "adaptability",
  "creativity",
  "collaboration",
  "presentation",
  "public speaking",
]);

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "with",
  "by",
  "from",
  "up",
  "about",
  "into",
  "over",
  "after",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "can",
  "could",
  "will",
  "would",
  "shall",
  "should",
  "may",
  "might",
  "must",
  "of",
  "off",
  "as",
  "if",
  "than",
  "then",
  "that",
  "this",
  "these",
  "those",
  "it",
  "its",
  "they",
  "them",
  "their",
  "what",
  "which",
  "who",
  "whom",
  "whose",
  "when",
  "where",
  "why",
  "how",
  "all",
  "any",
  "both",
  "each",
  "few",
  "more",
  "most",
  "other",
  "some",
  "such",
  "no",
  "nor",
  "not",
  "only",
  "own",
  "same",
  "so",
  "too",
  "very",
  "s",
  "t",
  "can",
  "will",
  "just",
  "don",
  "should",
  "now",
  "we",
  "us",
  "our",
  "you",
  "your",
  "job",
  "role",
  "description",
  "requirements",
  "qualifications",
  "experience",
  "work",
  "team",
  "company",
  "looking",
  "seeking",
  "opportunity",
  "candidate",
  "responsibilities",
  "duties",
  "apply",
  "please",
  "contact",
  "proficiency",
  "proficient",
  "knowledge",
  "ability",
  "strong",
  "excellent",
  "good",
  "preferred",
  "plus",
  "students",
  "student",
  "summer",
  "winter",
  "intern",
  "date",
  "position",
  "organization",
]);

class JobMatcher {
  constructor() {
    this.skillDb = SKILL_DB;
  }

  /**
   * Check if user qualifies based on school year and graduation date
   * @param {string} jobText
   * @param {string} userSchoolYear (e.g. "Junior")
   * @param {string} userGradDate (e.g. "2025-05")
   * @returns {boolean} true if qualified or n/a
   */
  /**
   * Check if user qualifies based on school year and graduation date
   * @param {string} jobText
   * @param {string} userSchoolYear (e.g. "Junior")
   * @param {string} userGradDate (e.g. "2025-05")
   * @param {Date} [currentDate] Optional reference date for relative calculations
   * @returns {boolean} true if qualified or n/a
   */
  async isQualified(
    jobText,
    userSchoolYear,
    userGradDate,
    currentDate = new Date()
  ) {
    // Ensure NLP model is loaded
    // await nlpProcessor.loadModel();

    // Get NLP Analysis
    // const nlpResult = await nlpProcessor.process(jobText);
    // if (nlpResult) {
    //   console.log("NLP Analysis for Job:", nlpResult);
    // For now, we just log. In future, we use nlpResult.entities to filter.
    // E.g. const detectedYears = nlpResult.entities.filter(e => e.entity === 'school_year').map(e => e.option);
    // if (detectedYears.length > 0 && !detectedYears.includes(userSchoolYear.toLowerCase())) return false;
    // }

    if (!jobText) return false;
    const lowerText = jobText.toLowerCase();
    const normalizedUserYear = userSchoolYear
      ? userSchoolYear.trim().toLowerCase()
      : null;

    // 1. School Year Check
    if (normalizedUserYear) {
      const years = [
        "freshman",
        "sophomore",
        "junior",
        "senior",
        "graduate",
        "bachelors",
      ];

      // Find which years are mentioned in the job description
      // We look for singular and plural forms
      const mentionedYears = new Set();
      years.forEach((y) => {
        // Handle special case for freshman/freshmen
        let pattern;
        if (y === "freshman") {
          pattern = /\bfreshm(a|e)n\b/i;
        } else if (y === "graduate") {
          // "Graduate" captures: graduate, master's, masters, phd, mba
          pattern = /\b(graduate|master(?:'|’)?s|ph\.?d|mba)\b/i;
        } else if (y === "bachelors") {
          // "Bachelors" captures: bachelors, bachelor's, bs, ba (careful with short ones), bsc, b.s., b.a.
          pattern =
            /\b(bachelor(?:'|’)?s|b\.?s\.?|b\.?a\.?|b\.?sc\.?|b\.?eng\.?)\b/i;
        } else if (y === "junior" || y === "senior") {
          // Exclude job titles (e.g. Junior Developer, Senior Analyst)
          const titles =
            "developer|engineer|consultant|associate|manager|designer|analyst|architect|admin|specialist|program|product|software|account|recruiter|writer|editor";
          pattern = new RegExp(`\\b${y}(s|es)?(?!\\s+(?:${titles}))\\b`, "i");
        } else {
          // Standard assumption: add 's' or 'es' for plural
          pattern = new RegExp(`\\b${y}(s|es)?\\b`, "i");
        }

        if (pattern.test(lowerText)) {
          mentionedYears.add(y);
        }
      });

      // If the job mentions specific school years, check if user is one of them
      if (mentionedYears.size > 0) {
        // Handle "undergraduate" as a catch-all for F/So/J/Sn
        const isUndergrad =
          mentionedYears.has("undergraduate") ||
          mentionedYears.has("undergrad") ||
          mentionedYears.has("bachelors");
        const userIsUndergrad = [
          "freshman",
          "sophomore",
          "junior",
          "senior",
          "bachelors",
        ].includes(normalizedUserYear);

        // If job allows "undergraduate" and user is one, we are good (for this check).
        // But if it *also* lists specific years, "undergraduate" usually overrides or expands.
        // Logic: If "undergraduate" is mentioned, and user is undergrad, PASS.
        //        Else (no "undergraduate" or user not undergrad), check specific year matches.
        if (isUndergrad && userIsUndergrad) {
          // Qualified by broad category
        } else if (!mentionedYears.has(normalizedUserYear)) {
          return false;
        }
      }
    }

    // 2. Graduation Date Check
    if (userGradDate) {
      // Extract user year and month
      const [uYear, uMonth] = userGradDate.split("-").map(Number);
      // Construct user grad date object (defaults to first of month)
      // Note: Month is 0-indexed in JS Date
      const userDate = new Date(uYear, uMonth - 1, 1);
      const userGradYearStr = String(uYear);

      // --- A. Absolute Year Check ---
      // Regex patterns to find graduation year requirements
      const gradPatterns = [
        /class of (\d{4})/gi,
        /graduating (?:in|by) (?:\w+ )?(\d{4})/gi,
        /graduation (?:date )?(?:is )?(?:in |expected )?(?:\w+ )?(\d{4})/gi,
      ];

      const mentionedGradYears = new Set();
      gradPatterns.forEach((pattern) => {
        let match;
        while ((match = pattern.exec(lowerText)) !== null) {
          mentionedGradYears.add(match[1]);
        }
      });

      if (
        mentionedGradYears.size > 0 &&
        !mentionedGradYears.has(userGradYearStr)
      ) {
        return false;
      }

      // --- B. Relative Duration Check ---
      // Phrases like: "graduating within a year", "within the next 18 months"
      // We calculate the deadlines and check if user's date falls WITHIN that range.

      // Capture number or 'a'/'an' -> convert to months
      // Group 1: quantity (digit or word), Group 2: unit (year/month)
      const relativePatterns = [
        /graduating within (?:the )?(?:next )?(\d+|a|an|one|two|three) (year|month)s?/gi,
        /must graduate within (?:the )?(\d+|a|an|one|two|three) (year|month)s?/gi,
      ];

      for (const pattern of relativePatterns) {
        let match;
        // Optimization: Use a clean regex instance or reset lastIndex if global (taken care of by exec loop)
        while ((match = pattern.exec(lowerText)) !== null) {
          let quantityStr = match[1].toLowerCase();
          const unit = match[2].toLowerCase(); // "year" or "month"

          let quantity = 1;
          if (
            quantityStr === "a" ||
            quantityStr === "an" ||
            quantityStr === "one"
          ) {
            quantity = 1;
          } else if (quantityStr === "two") {
            quantity = 2;
          } else if (quantityStr === "three") {
            quantity = 3;
          } else {
            quantity = parseInt(quantityStr, 10);
          }

          if (isNaN(quantity)) continue;

          // Calculate max allowed grad date
          const cutoffDate = new Date(currentDate);
          if (unit.startsWith("year")) {
            cutoffDate.setFullYear(cutoffDate.getFullYear() + quantity);
          } else {
            // months
            cutoffDate.setMonth(cutoffDate.getMonth() + quantity);
          }

          // Verification:
          // "Graduating within X" means CurrentDate <= UserGradDate <= CutoffDate
          // We assume user isn't matching if they already graduated way before (though Co-ops usually for students)
          // Mainly we check if they graduate TOO LATE.
          if (userDate > cutoffDate) {
            return false;
          }
        }
      }
    }

    return true;
  }

  /**
   * Normalize text: lowercase, remove special chars
   */
  normalize(text) {
    // 1. Remove HTML tags
    const noHtml = text.replace(/<[^>]*>?/gm, " ");
    // 2. Lowercase and remove non-alphanumeric
    return noHtml.toLowerCase().replace(/[^a-z0-9\s+]/g, " ");
  }

  /**
   * Tokenize text into words, removing stop words
   */
  tokenize(text) {
    return this.normalize(text)
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w)); // Min length 3 to filter junk
  }

  /**
   * Extract known skills from text + standard db
   */
  extractExplicitSkills(text) {
    const normalized = this.normalize(text);
    const foundSkills = new Set();

    this.skillDb.forEach((skill) => {
      const escapedSkill = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // Look for whole word matches generally
      const regex = new RegExp(`\\b${escapedSkill}\\b`, "i");
      if (regex.test(normalized) || normalized.includes(skill)) {
        foundSkills.add(skill);
      }
    });

    return Array.from(foundSkills);
  }

  /**
   * Dynamically find important keywords in the Job Description that might not be in our DB.
   * Uses simple frequency analysis on the JD.
   */
  extractDynamicKeywords(jobText) {
    const tokens = this.tokenize(jobText);
    const freqMap = {};

    tokens.forEach((t) => {
      freqMap[t] = (freqMap[t] || 0) + 1;
    });

    // Sort by frequency
    const sortedTokens = Object.entries(freqMap).sort((a, b) => b[1] - a[1]);

    // Take top ~15 frequent words that are NOT already found as explicit skills
    // and aren't super common low-value words (filtered by stop words already)
    // In a real NLP lib we'd use TF-IDF with a corpus background, but here raw freq is best proxy
    const dynamicKeywords = [];
    const limit = 15;

    for (const [token, count] of sortedTokens) {
      if (dynamicKeywords.length >= limit) break;
      // If it's not already in our explicit skill extraction (approx check)
      // and has appeared at least twice (unless text is very short)
      if (count > 1 || tokens.length < 50) {
        dynamicKeywords.push(token);
      }
    }

    return dynamicKeywords;
  }

  /**
   * Compute TF Vector
   */
  computeTFVector(tokens) {
    const vec = {};
    tokens.forEach((t) => {
      vec[t] = (vec[t] || 0) + 1;
    });
    return vec;
  }

  /**
   * Cosine Similarity
   */
  calculateCosineSimilarity(vecA, vecB) {
    const keysA = Object.keys(vecA);
    const keysB = Object.keys(vecB);
    const allKeys = new Set([...keysA, ...keysB]);

    let dotProduct = 0;
    let magA = 0;
    let magB = 0;

    allKeys.forEach((key) => {
      const valA = vecA[key] || 0;
      const valB = vecB[key] || 0;
      dotProduct += valA * valB;
      magA += valA * valA;
      magB += valB * valB;
    });

    if (magA === 0 || magB === 0) return 0;
    return dotProduct / (Math.sqrt(magA) * Math.sqrt(magB));
  }

  /**
   * Calculate Major-Agnostic Match Score
   */
  calculateScore(resumeText, jobDescriptionText) {
    if (!resumeText || !jobDescriptionText) {
      return { score: 0, matches: [], missing: [], details: {} };
    }

    // 1. Explicit Skill Extraction (Database Based)
    const resumeSkills = new Set(this.extractExplicitSkills(resumeText));
    const jobSkills = new Set(this.extractExplicitSkills(jobDescriptionText));

    // 2. Dynamic Keyword Extraction (Context Based)
    // Identify top words in JD that represent the "core" of the job
    const jobKeywords = this.extractDynamicKeywords(jobDescriptionText);
    const resumeTokensSet = new Set(this.tokenize(resumeText));

    // Find which dynamic keywords are present in resume
    const matchedKeywords = jobKeywords.filter((k) => resumeTokensSet.has(k));
    const missingKeywords = jobKeywords.filter((k) => !resumeTokensSet.has(k));

    // Combine for display (Explicit Skills + Top 5 Dynamic Keywords that act like skills)
    // We treat DB skills as "Gold Standard" and Dynamic Keywords as "Silver"
    const allJobTerms = Array.from(jobSkills).concat(jobKeywords.slice(0, 5));
    const allResumeTerms = new Set([...resumeSkills, ...resumeTokensSet]);

    const finalMatches = allJobTerms.filter((t) => allResumeTerms.has(t));
    const finalMissing = allJobTerms.filter((t) => !allResumeTerms.has(t));

    // Remove duplicates for display
    const uniqueMatches = [...new Set(finalMatches)];
    const uniqueMissing = [...new Set(finalMissing)];

    // --- SCORING ALGORITHM ---

    // Part A: Explicit Skill Match (High precision)
    let explicitScore = 0;
    if (jobSkills.size > 0) {
      const intersection = [...jobSkills].filter((s) => resumeSkills.has(s));
      // Normalization: Matching ~60% of requested skills is considered "perfect" (100%)
      const coverage = intersection.length / (jobSkills.size * 0.6);
      explicitScore = Math.min(100, coverage * 100);
    } else {
      explicitScore = 50; // Neutral if no DB skills found
    }

    // Part B: Dynamic Keyword Coverage (Broad coverage)
    let keywordScore = 0;
    if (jobKeywords.length > 0) {
      // Normalization: Matching ~60% of dynamic keywords is considered "perfect" (100%)
      const coverage = matchedKeywords.length / (jobKeywords.length * 0.6);
      keywordScore = Math.min(100, coverage * 100);
    }

    // Part C: Vector Similarity (Holistic context)
    const resumeTokens = this.tokenize(resumeText);
    const jobTokens = this.tokenize(jobDescriptionText);
    const vecA = this.computeTFVector(resumeTokens);
    const vecB = this.computeTFVector(jobTokens);
    let cosineScore = this.calculateCosineSimilarity(vecA, vecB) * 100;

    // Normalization: Boost cosine score. Raw similarity is usually low (0.3-0.6).
    // Scaling so that ~0.33 raw similarity becomes 100%
    cosineScore = Math.min(100, cosineScore * 3.0);

    // Weighted Final Score
    // Adjust weights: Explicit skills are most important if present.
    // Normalized to prioritize hard requirements (Languages/Tech) over vague text matches.

    let wExplicit = 0.6;
    let wKeyword = 0.2;
    let wCosine = 0.2;

    if (jobSkills.size === 0) {
      wExplicit = 0;
      wKeyword = 0.5;
      wCosine = 0.5;
    }

    const totalScore =
      explicitScore * wExplicit +
      keywordScore * wKeyword +
      cosineScore * wCosine;

    return {
      score: Math.round(totalScore),
      matches: uniqueMatches,
      missing: uniqueMissing,
      details: {
        explicitScore,
        keywordScore,
        cosineScore,
      },
    };
  }
}

export default JobMatcher;
