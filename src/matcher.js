// EXPANDED Common skills database for various majors
const SKILL_DB = new Set([
  // --- TECH: Languages ---
  "python",
  "javascript",
  "typescript",
  "java",
  "c++",
  "c#",
  "rust",
  "swift",
  "kotlin",
  "go",
  "golang",
  "ruby",
  "php",
  "scala",
  "r",
  "perl",
  "lua",
  "dart",
  "elixir",
  "haskell",
  "objective-c",
  "assembly",
  "fortran",
  "cobol",
  "groovy",
  "clojure",

  // --- TECH: Web ---
  "html",
  "css",
  "sass",
  "less",
  "tailwind",
  "bootstrap",

  // --- TECH: Databases ---
  "sql",
  "nosql",
  "postgresql",
  "mysql",
  "mongodb",
  "redis",
  "cassandra",
  "dynamodb",
  "elasticsearch",
  "neo4j",
  "sqlite",
  "mariadb",
  "couchdb",
  "firebase",
  "supabase",

  // --- TECH: Frameworks ---
  "react",
  "angular",
  "vue",
  "svelte",
  "next.js",
  "nuxt",
  "gatsby",
  "remix",
  "node.js",
  "express",
  "fastapi",
  "flask",
  "django",
  "spring boot",
  "spring",
  "rails",
  "laravel",
  "asp.net",
  ".net",
  "graphql",
  "rest api",
  "grpc",
  "webpack",
  "vite",

  // --- TECH: Cloud & DevOps ---
  "aws",
  "azure",
  "gcp",
  "docker",
  "kubernetes",
  "terraform",
  "ansible",
  "jenkins",
  "github actions",
  "gitlab ci",
  "ci/cd",
  "nginx",
  "apache",
  "linux",
  "unix",
  "bash",
  "powershell",
  "cloudformation",
  "serverless",
  "lambda",
  "microservices",
  "kafka",
  "rabbitmq",
  "prometheus",
  "grafana",
  "datadog",
  "splunk",
  "new relic",
  "vercel",
  "heroku",
  "netlify",

  // --- TECH: Tools ---
  "git",
  "jira",
  "confluence",
  "agile",
  "scrum",
  "kanban",
  "figma",
  "sketch",
  "postman",
  "swagger",
  "storybook",

  // --- TECH: Mobile ---
  "react native",
  "flutter",
  "ios",
  "android",
  "swiftui",
  "jetpack compose",
  "xcode",

  // --- TECH: Testing ---
  "jest",
  "cypress",
  "selenium",
  "playwright",
  "junit",
  "pytest",
  "mocha",
  "chai",
  "testing",
  "unit testing",
  "integration testing",

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
  "hedge fund",
  "derivatives",
  "fixed income",
  "quantitative analysis",
  "compliance",
  "underwriting",
  "credit analysis",
  "financial planning",
  "budgeting",

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
  "product management",
  "a/b testing",
  "google ads",
  "facebook ads",
  "mailchimp",
  "marketo",
  "ppc",
  "content marketing",
  "ux research",
  "user research",

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
  "deep learning",
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
  "spark",
  "hadoop",
  "airflow",
  "dbt",
  "etl",
  "data engineering",
  "data warehousing",
  "natural language processing",
  "nlp",
  "computer vision",
  "reinforcement learning",
  "neural networks",
  "regression",
  "classification",
  "clustering",
  "feature engineering",
  "model deployment",
  "mlops",
  "snowflake",
  "redshift",
  "bigquery",
  "looker",
  "jupyter",
  "openai",
  "langchain",
  "hugging face",

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
  "catia",
  "revit",
  "3d printing",
  "gd&t",
  "fea",
  "cfd",
  "plc",
  "scada",
  "labview",
  "embedded systems",
  "fpga",
  "vhdl",
  "verilog",
  "signal processing",
  "control systems",
  "robotics",
  "mechatronics",

  // --- HEALTHCARE / SCIENCE ---
  "clinical research",
  "fda",
  "gmp",
  "bioinformatics",
  "genomics",
  "proteomics",
  "hplc",
  "mass spectrometry",
  "cell culture",
  "pcr",
  "elisa",
  "clinical trials",
  "regulatory affairs",
  "pharmacology",
  "epidemiology",
  "biostatistics",
  "ehr",
  "hipaa",
]);

// Skills that are too generic and inflate scores
const SOFT_SKILLS = new Set([
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
  "just",
  "don",
  "now",
  "we",
  "us",
  "our",
  "you",
  "your",
  "also",
  "well",
  "make",
  "like",
  "new",
  "one",
  "two",
  "get",
  "got",
  "use",
  "used",
  "using",
  "need",
  "able",
  "etc",
  "per",
  "via",
  // Job-listing filler words
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
  "working",
  "including",
  "required",
  "minimum",
  "years",
  "year",
  "will",
  "must",
  "ideal",
  "includes",
  "skills",
  "based",
  "provide",
  "support",
  "ensure",
  "assist",
  "help",
  "develop",
  "maintain",
  "manage",
  "create",
  "perform",
  "review",
  "participate",
  "collaborate",
  "contribute",
  "learn",
  "understand",
  "environment",
  "office",
  "location",
  "full",
  "time",
  "part",
  "equal",
  "employer",
  "benefits",
  "salary",
  "compensation",
  "program",
  "department",
  "group",
]);

class JobMatcher {
  constructor() {
    this.skillDb = SKILL_DB;
    this.softSkills = SOFT_SKILLS;
  }

  /**
   * Check if user qualifies based on school year and graduation date
   */
  async isQualified(
    jobText,
    userSchoolYear,
    userGradDate,
    currentDate = new Date()
  ) {
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

      const mentionedYears = new Set();
      years.forEach((y) => {
        let pattern;
        if (y === "freshman") {
          pattern = /\bfreshm(a|e)n\b/i;
        } else if (y === "graduate") {
          pattern = /\b(graduate|master(?:'|')?s|ph\.?d|mba)\b/i;
        } else if (y === "bachelors") {
          pattern =
            /\b(bachelor(?:'|')?s|b\.?s\.?|b\.?a\.?|b\.?sc\.?|b\.?eng\.?)\b/i;
        } else if (y === "junior" || y === "senior") {
          const titles =
            "developer|engineer|consultant|associate|manager|designer|analyst|architect|admin|specialist|program|product|software|account|recruiter|writer|editor|vice|director|staff|principal|lead";
          pattern = new RegExp(`\\b${y}(s|es)?(?!\\s+(?:${titles}))\\b`, "i");
        } else {
          pattern = new RegExp(`\\b${y}(s|es)?\\b`, "i");
        }

        if (pattern.test(lowerText)) {
          mentionedYears.add(y);
        }
      });

      if (mentionedYears.size > 0) {
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

        if (isUndergrad && userIsUndergrad) {
          // Qualified by broad category
        } else if (!mentionedYears.has(normalizedUserYear)) {
          return false;
        }
      }
    }

    // 2. Graduation Date Check
    if (userGradDate) {
      const [uYear, uMonth] = userGradDate.split("-").map(Number);
      const userDate = new Date(uYear, uMonth - 1, 1);
      const userGradYearStr = String(uYear);

      // A. Absolute Year Check
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

      // B. Relative Duration Check
      const relativePatterns = [
        /graduating within (?:the )?(?:next )?(\d+|a|an|one|two|three) (year|month)s?/gi,
        /must graduate within (?:the )?(\d+|a|an|one|two|three) (year|month)s?/gi,
      ];

      for (const pattern of relativePatterns) {
        let match;
        while ((match = pattern.exec(lowerText)) !== null) {
          let quantityStr = match[1].toLowerCase();
          const unit = match[2].toLowerCase();

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

          const cutoffDate = new Date(currentDate);
          if (unit.startsWith("year")) {
            cutoffDate.setFullYear(cutoffDate.getFullYear() + quantity);
          } else {
            cutoffDate.setMonth(cutoffDate.getMonth() + quantity);
          }

          if (userDate > cutoffDate) {
            return false;
          }
        }
      }
    }

    return true;
  }

  /**
   * Normalize text: lowercase, remove HTML, special chars
   */
  normalize(text) {
    const noHtml = text.replace(/<[^>]*>?/gm, " ");
    return noHtml.toLowerCase().replace(/[^a-z0-9\s.+#/&-]/g, " ");
  }

  /**
   * Tokenize text into words, removing stop words
   */
  tokenize(text) {
    return this.normalize(text)
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  }

  /**
   * Extract known skills from text using the skill database.
   * Returns { hard: Set, soft: Set }
   */
  extractExplicitSkills(text) {
    const normalized = this.normalize(text);
    const hard = new Set();
    const soft = new Set();

    this.skillDb.forEach((skill) => {
      const escapedSkill = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`\\b${escapedSkill}\\b`, "i");
      if (regex.test(normalized) || normalized.includes(skill)) {
        if (this.softSkills.has(skill)) {
          soft.add(skill);
        } else {
          hard.add(skill);
        }
      }
    });

    return { hard, soft };
  }

  /**
   * Detect if a skill appears in a "required" context vs "preferred/nice to have"
   */
  classifyRequirements(text) {
    const normalized = this.normalize(text);
    const lines = normalized.split(/\n|\.(?:\s)/);

    const requiredContext =
      /required|must have|must be|essential|mandatory|minimum|necessary/i;
    const preferredContext =
      /preferred|nice to have|bonus|plus|desired|ideally|optional|a plus/i;

    const required = new Set();
    const preferred = new Set();

    // Check each line for context
    lines.forEach((line) => {
      const isRequired = requiredContext.test(line);
      const isPreferred = preferredContext.test(line);

      this.skillDb.forEach((skill) => {
        if (line.includes(skill)) {
          if (isPreferred) {
            preferred.add(skill);
          } else if (isRequired) {
            required.add(skill);
          }
        }
      });
    });

    return { required, preferred };
  }

  /**
   * Extract bigrams (two-word phrases) that might represent skills not in DB
   */
  extractBigrams(text) {
    const tokens = this.tokenize(text);
    const bigrams = new Map();

    for (let i = 0; i < tokens.length - 1; i++) {
      const bigram = `${tokens[i]} ${tokens[i + 1]}`;
      bigrams.set(bigram, (bigrams.get(bigram) || 0) + 1);
    }

    // Return bigrams that appear more than once (likely meaningful phrases)
    return [...bigrams.entries()]
      .filter(([, count]) => count > 1)
      .map(([bigram]) => bigram);
  }

  /**
   * Extract top dynamic keywords using TF with some IDF-like weighting.
   * Words that appear in the job but are rare/specific score higher.
   */
  extractDynamicKeywords(jobText, resumeText) {
    const jobTokens = this.tokenize(jobText);
    const resumeTokens = new Set(this.tokenize(resumeText || ""));
    const freqMap = {};

    jobTokens.forEach((t) => {
      freqMap[t] = (freqMap[t] || 0) + 1;
    });

    // Penalize very common tokens (appear in > 30% of the text)
    const threshold = jobTokens.length * 0.3;

    const sortedTokens = Object.entries(freqMap)
      .filter(([, count]) => count <= threshold)
      .sort((a, b) => b[1] - a[1]);

    const dynamicKeywords = [];
    const limit = 20;

    for (const [token, count] of sortedTokens) {
      if (dynamicKeywords.length >= limit) break;
      // Skip single-char tokens and very generic ones
      if (token.length < 3) continue;
      if (count > 1 || jobTokens.length < 50) {
        dynamicKeywords.push(token);
      }
    }

    return dynamicKeywords;
  }

  /**
   * Compute TF-IDF vectors for both documents
   */
  computeTFIDFVectors(tokensA, tokensB) {
    // Build TF for each doc
    const tfA = {};
    const tfB = {};

    tokensA.forEach((t) => {
      tfA[t] = (tfA[t] || 0) + 1;
    });
    tokensB.forEach((t) => {
      tfB[t] = (tfB[t] || 0) + 1;
    });

    // Normalize TF by doc length
    const lenA = tokensA.length || 1;
    const lenB = tokensB.length || 1;

    Object.keys(tfA).forEach((k) => {
      tfA[k] /= lenA;
    });
    Object.keys(tfB).forEach((k) => {
      tfB[k] /= lenB;
    });

    // IDF: treat the two docs as our "corpus"
    const allKeys = new Set([...Object.keys(tfA), ...Object.keys(tfB)]);
    const idf = {};

    allKeys.forEach((key) => {
      const docCount = (tfA[key] ? 1 : 0) + (tfB[key] ? 1 : 0);
      // IDF = log(N/df) where N=2
      idf[key] = Math.log(2 / docCount) + 1; // +1 smoothing
    });

    // Build TF-IDF vectors
    const vecA = {};
    const vecB = {};

    allKeys.forEach((key) => {
      vecA[key] = (tfA[key] || 0) * idf[key];
      vecB[key] = (tfB[key] || 0) * idf[key];
    });

    return { vecA, vecB };
  }

  /**
   * Cosine Similarity
   */
  calculateCosineSimilarity(vecA, vecB) {
    const allKeys = new Set([...Object.keys(vecA), ...Object.keys(vecB)]);

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
   * Calculate Match Score with improved precision
   */
  calculateScore(resumeText, jobDescriptionText) {
    if (!resumeText || !jobDescriptionText) {
      return { score: 0, matches: [], missing: [], details: {} };
    }

    // 1. Explicit Skill Extraction (split hard vs soft)
    const resumeSkillsResult = this.extractExplicitSkills(resumeText);
    const jobSkillsResult = this.extractExplicitSkills(jobDescriptionText);

    const resumeHard = resumeSkillsResult.hard;
    const resumeSoft = resumeSkillsResult.soft;
    const jobHard = jobSkillsResult.hard;
    const jobSoft = jobSkillsResult.soft;

    // All resume skills combined for lookup
    const allResumeSkills = new Set([...resumeHard, ...resumeSoft]);

    // 2. Required vs Preferred classification
    const { required, preferred } = this.classifyRequirements(jobDescriptionText);

    // 3. Dynamic Keyword Extraction
    const jobKeywords = this.extractDynamicKeywords(jobDescriptionText, resumeText);
    const resumeTokensSet = new Set(this.tokenize(resumeText));

    const matchedKeywords = jobKeywords.filter((k) => resumeTokensSet.has(k));

    // 4. Bigram matching
    const jobBigrams = this.extractBigrams(jobDescriptionText);
    const resumeBigramSet = new Set(this.extractBigrams(resumeText));
    const matchedBigrams = jobBigrams.filter((b) => resumeBigramSet.has(b));

    // Build display lists
    // Hard skills matched/missing take priority, then soft, then keywords
    const hardMatched = [...jobHard].filter((s) => allResumeSkills.has(s));
    const hardMissing = [...jobHard].filter((s) => !allResumeSkills.has(s));
    const softMatched = [...jobSoft].filter((s) => allResumeSkills.has(s));

    // Combine for display (hard skills first, then top keywords)
    const displayMatches = [
      ...hardMatched,
      ...softMatched.slice(0, 2),
      ...matchedKeywords.slice(0, 3),
    ];
    const displayMissing = [...hardMissing.slice(0, 5)];

    const uniqueMatches = [...new Set(displayMatches)];
    const uniqueMissing = [...new Set(displayMissing)];

    // --- SCORING ALGORITHM ---

    // Part A: Hard Skill Match (highest weight — these are the real differentiators)
    let hardSkillScore = 0;
    if (jobHard.size > 0) {
      // Give extra weight to "required" skills
      let weightedMatch = 0;
      let weightedTotal = 0;

      jobHard.forEach((skill) => {
        const weight = required.has(skill) ? 1.5 : preferred.has(skill) ? 0.7 : 1.0;
        weightedTotal += weight;
        if (allResumeSkills.has(skill)) {
          weightedMatch += weight;
        }
      });

      // Matching ~65% of weighted skills is considered "perfect"
      const coverage = weightedMatch / (weightedTotal * 0.65);
      hardSkillScore = Math.min(100, coverage * 100);
    } else {
      hardSkillScore = 50; // Neutral if no hard skills detected
    }

    // Part B: Soft Skill Match (low weight — these inflate scores)
    let softSkillScore = 0;
    if (jobSoft.size > 0) {
      const intersection = [...jobSoft].filter((s) => allResumeSkills.has(s));
      softSkillScore = Math.min(100, (intersection.length / jobSoft.size) * 100);
    }

    // Part C: Dynamic Keyword Coverage
    let keywordScore = 0;
    if (jobKeywords.length > 0) {
      const totalMatched = matchedKeywords.length + matchedBigrams.length * 1.5;
      const coverage = totalMatched / (jobKeywords.length * 0.6);
      keywordScore = Math.min(100, coverage * 100);
    }

    // Part D: TF-IDF Cosine Similarity
    const resumeTokens = this.tokenize(resumeText);
    const jobTokens = this.tokenize(jobDescriptionText);
    const { vecA, vecB } = this.computeTFIDFVectors(resumeTokens, jobTokens);
    let cosineScore = this.calculateCosineSimilarity(vecA, vecB) * 100;

    // Scale: raw TF-IDF cosine tends to be higher than raw TF, so scale ~0.4 -> 100%
    cosineScore = Math.min(100, cosineScore * 2.5);

    // --- Weighted Final Score ---
    // Hard skills dominate; soft skills are nearly irrelevant to differentiation
    let wHard, wSoft, wKeyword, wCosine;

    if (jobHard.size === 0) {
      // No hard skills found — rely more on keywords and cosine
      wHard = 0;
      wSoft = 0.05;
      wKeyword = 0.5;
      wCosine = 0.45;
    } else if (jobHard.size <= 3) {
      // Few hard skills — balance with keywords
      wHard = 0.45;
      wSoft = 0.05;
      wKeyword = 0.25;
      wCosine = 0.25;
    } else {
      // Plenty of hard skills — they're the best signal
      wHard = 0.55;
      wSoft = 0.05;
      wKeyword = 0.2;
      wCosine = 0.2;
    }

    const totalScore =
      hardSkillScore * wHard +
      softSkillScore * wSoft +
      keywordScore * wKeyword +
      cosineScore * wCosine;

    return {
      score: Math.round(totalScore),
      matches: uniqueMatches,
      missing: uniqueMissing,
      details: {
        hardSkillScore: Math.round(hardSkillScore),
        softSkillScore: Math.round(softSkillScore),
        keywordScore: Math.round(keywordScore),
        cosineScore: Math.round(cosineScore),
        hardSkillsFound: jobHard.size,
        hardSkillsMatched: hardMatched.length,
      },
    };
  }
}

export default JobMatcher;
