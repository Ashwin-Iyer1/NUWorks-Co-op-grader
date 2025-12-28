// EXPANDED Common skills database for various majors (Finance, Business, Tech, Engineering, etc.)
const SKILL_DB = new Set([
  // --- TECH ---
  "python",
  "javascript",
  "typescript",
  "java",
  "c++",
  "c#",
  "go",
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
]);

class JobMatcher {
  constructor() {
    this.skillDb = SKILL_DB;
  }

  /**
   * Normalize text: lowercase, remove special chars
   */
  normalize(text) {
    return text.toLowerCase().replace(/[^a-z0-9\s+]/g, " ");
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
      explicitScore = (intersection.length / jobSkills.size) * 100;
    } else {
      explicitScore = 50; // Neutral if no DB skills found
    }

    // Part B: Dynamic Keyword Coverage (Broad coverage)
    let keywordScore = 0;
    if (jobKeywords.length > 0) {
      keywordScore = (matchedKeywords.length / jobKeywords.length) * 100;
    }

    // Part C: Vector Similarity (Holistic context)
    const resumeTokens = this.tokenize(resumeText);
    const jobTokens = this.tokenize(jobDescriptionText);
    const vecA = this.computeTFVector(resumeTokens);
    const vecB = this.computeTFVector(jobTokens);
    const cosineScore = this.calculateCosineSimilarity(vecA, vecB) * 100;

    // Weighted Final Score
    // Adjust weights: Explicit skills are most important if present.
    // If few explicit skills (e.g. "General Helper"), rely more on Cosine and Dynamic Keywords.

    let wExplicit = 0.4;
    let wKeyword = 0.3;
    let wCosine = 0.3;

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

if (typeof module !== "undefined" && module.exports) {
  module.exports = JobMatcher;
} else {
  window.JobMatcher = JobMatcher;
}
