// Copyright (c) 2026 Ashwin Iyer — Licensed under AGPL-3.0

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
  "ruby",
  "php",
  "scala",
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
  "quality assurance",

  // --- TECH: Concepts ---
  "object oriented programming",
  "ux",

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

/**
 * Surface form -> canonical SKILL_DB entry.
 *
 * Every key is an alternate spelling, abbreviation or expansion that job
 * postings use in the wild. Matching a key credits the *canonical* skill, so
 * "k8s" and "kubernetes" collapse into a single reported entry instead of
 * looking like two separate requirements.
 *
 * `r` deliberately lives here and NOT in SKILL_DB: the bare token matched
 * essentially every English document and was frequently the only "match" shown
 * on a low-quality card. It is only recoverable through unambiguous surfaces.
 */
const SKILL_ALIASES = {
  // Languages
  js: "javascript",
  es6: "javascript",
  ecmascript: "javascript",
  ts: "typescript",
  golang: "go",
  "c sharp": "c#",
  "r programming": "r",
  rstudio: "r",
  "r studio": "r",
  "r language": "r",

  // Runtimes / platforms
  node: "node.js",
  nodejs: "node.js",
  dotnet: ".net",
  ".net core": ".net",
  ps: "powershell",

  // Databases
  postgres: "postgresql",
  psql: "postgresql",
  rdbms: "sql",

  // Cloud & DevOps
  k8s: "kubernetes",
  k8: "kubernetes",
  gcp: "gcp",
  "google cloud": "gcp",
  "google cloud platform": "gcp",
  "ci/cd": "ci/cd",
  "ci cd": "ci/cd",
  cicd: "ci/cd",

  // Data science / ML
  ml: "machine learning",
  dl: "deep learning",
  nlp: "natural language processing",
  tf: "tensorflow",
  nn: "neural networks",
  "neural nets": "neural networks",
  sklearn: "scikit-learn",
  "scikit learn": "scikit-learn",

  // Product / process
  "a/b": "a/b testing",
  qa: "quality assurance",
  oop: "object oriented programming",
  "ui/ux": "ux",
};

/**
 * Specific skill -> the broader skills it demonstrates.
 *
 * Direction matters: having the SPECIFIC skill is evidence of the GENERAL one,
 * never the reverse (a resume with "pytorch" supports a posting asking for
 * "machine learning"; a resume with "machine learning" says nothing about
 * pytorch). Keys and values are canonical SKILL_DB names so extraction and
 * inference share one vocabulary. Inferred matches earn INFERRED_CREDIT, not
 * full credit — the posting asked for the general term, and the specific tool
 * is strong-but-indirect evidence.
 */
const SKILL_IMPLICATIONS = {
  // Web / JS ecosystem
  typescript: ["javascript"],
  react: ["javascript"],
  angular: ["javascript"],
  vue: ["javascript"],
  svelte: ["javascript"],
  "next.js": ["react", "javascript"],
  nuxt: ["vue", "javascript"],
  gatsby: ["react", "javascript"],
  remix: ["react", "javascript"],
  "react native": ["react", "javascript"],
  "node.js": ["javascript"],
  express: ["node.js", "javascript"],
  sass: ["css"],
  less: ["css"],
  tailwind: ["css"],
  bootstrap: ["css"],

  // Python ecosystem
  django: ["python"],
  flask: ["python"],
  fastapi: ["python"],
  pandas: ["python", "data analysis"],
  numpy: ["python"],
  matplotlib: ["python", "data visualization"],
  seaborn: ["python", "data visualization"],
  jupyter: ["python"],

  // ML / data science
  "scikit-learn": ["python", "machine learning"],
  pytorch: ["python", "machine learning", "deep learning"],
  tensorflow: ["python", "machine learning", "deep learning"],
  keras: ["python", "deep learning"],
  "deep learning": ["machine learning"],
  "natural language processing": ["machine learning"],
  "computer vision": ["machine learning"],
  "reinforcement learning": ["machine learning"],
  "neural networks": ["machine learning", "deep learning"],
  regression: ["statistics", "machine learning"],
  classification: ["machine learning"],
  clustering: ["machine learning"],
  "predictive modeling": ["machine learning"],
  biostatistics: ["statistics"],
  statistics: ["data analysis"],

  // JVM / other backends
  "spring boot": ["spring", "java"],
  spring: ["java"],
  rails: ["ruby"],
  laravel: ["php"],
  "asp.net": [".net", "c#"],

  // Mobile
  swiftui: ["swift", "ios"],
  "jetpack compose": ["kotlin", "android"],
  flutter: ["dart"],
  xcode: ["ios"],

  // Databases
  postgresql: ["sql"],
  mysql: ["sql"],
  sqlite: ["sql"],
  mariadb: ["sql"],
  mongodb: ["nosql"],
  redis: ["nosql"],
  cassandra: ["nosql"],
  couchdb: ["nosql"],
  elasticsearch: ["nosql"],
  dynamodb: ["nosql", "aws"],
  snowflake: ["sql", "data warehousing"],
  redshift: ["sql", "data warehousing", "aws"],
  bigquery: ["sql", "data warehousing", "gcp"],

  // Cloud & DevOps
  kubernetes: ["docker"],
  jenkins: ["ci/cd"],
  "github actions": ["ci/cd"],
  "gitlab ci": ["ci/cd"],
  lambda: ["aws"],
  cloudformation: ["aws"],

  // Testing
  jest: ["testing", "javascript"],
  mocha: ["testing", "javascript"],
  chai: ["testing", "javascript"],
  cypress: ["testing"],
  playwright: ["testing"],
  selenium: ["testing"],
  junit: ["testing", "java"],
  pytest: ["testing", "python"],
  "unit testing": ["testing"],
  "integration testing": ["testing"],

  // Data engineering / BI
  spark: ["big data"],
  hadoop: ["big data"],
  airflow: ["etl", "data engineering"],
  dbt: ["etl", "data engineering"],
  tableau: ["data visualization"],
  "power bi": ["data visualization"],
  looker: ["data visualization"],

  // Engineering (non-SW)
  solidworks: ["cad"],
  catia: ["cad"],
  autocad: ["cad"],
  revit: ["cad"],
  simulink: ["matlab"],
  verilog: ["fpga"],
  vhdl: ["fpga"],

  // Finance
  vba: ["excel"],
  "financial modeling": ["excel", "financial analysis"],
  valuation: ["financial analysis"],
  "equity research": ["financial analysis"],

  // Business / marketing
  scrum: ["agile"],
  kanban: ["agile"],
  seo: ["digital marketing"],
  sem: ["digital marketing"],
  "google ads": ["digital marketing"],
  "facebook ads": ["digital marketing"],
  "email marketing": ["digital marketing"],
  "social media marketing": ["digital marketing"],
  "content marketing": ["digital marketing"],
  ppc: ["digital marketing"],
  salesforce: ["crm"],
  hubspot: ["crm"],
};

/** Score credit an inferred (implied) skill match earns vs a direct match. */
const INFERRED_CREDIT = 0.7;

/**
 * Shared, user-facing copy for every reason a posting can be ineligible.
 * Exported so the popup, the explorer and the injected badges all render the
 * exact same sentence for the same reason code.
 */
export const ELIGIBILITY_COPY = {
  server: "NUWorks says you don't meet this posting's stated requirements",
  "school-year": "This posting asks for a different class year",
  "grad-year": "This posting asks for a different graduation year",
  "grad-window": "Your graduation date falls outside this posting's window",
};

/** Canonical class-year vocabulary used by the school-year gate. */
const CANONICAL_SCHOOL_YEARS = new Set([
  "freshman",
  "sophomore",
  "junior",
  "senior",
  "graduate",
  "bachelors",
]);

/** Class years that count as "undergraduate" for the broad-category match. */
const UNDERGRAD_YEARS = [
  "freshman",
  "sophomore",
  "junior",
  "senior",
  "bachelors",
];

const SCHOOL_YEAR_SYNONYMS = {
  "1st year": "freshman",
  "first year": "freshman",
  freshman: "freshman",
  freshmen: "freshman",
  "2nd year": "sophomore",
  "second year": "sophomore",
  sophomore: "sophomore",
  "3rd year": "junior",
  "third year": "junior",
  junior: "junior",
  "4th year": "senior",
  "fourth year": "senior",
  "5th year": "senior",
  "fifth year": "senior",
  senior: "senior",
  masters: "graduate",
  "master's": "graduate",
  "master’s": "graduate",
  master: "graduate",
  phd: "graduate",
  "ph.d": "graduate",
  "ph.d.": "graduate",
  doctorate: "graduate",
  mba: "graduate",
  graduate: "graduate",
  bachelors: "bachelors",
  "bachelor's": "bachelors",
  "bachelor’s": "bachelors",
};

/**
 * Map a Symplicity-style class-year label onto the canonical vocabulary.
 *
 * Handles the "Undergraduate - Sophomore" / "Graduate - Masters" prefixes that
 * NUWorks stores. Returns null when the label is not recognised — callers MUST
 * treat null as "skip the school-year gate entirely" rather than falling
 * through to an exact-membership test, otherwise an unrecognised label makes
 * every posting that mentions any class year look disqualifying.
 */
export function normalizeSchoolYear(label) {
  if (!label) return null;

  let s = String(label).toLowerCase().trim();
  // Strip a leading "undergraduate - " / "graduate - " qualifier.
  s = s.replace(/^(?:under)?graduate\s*[-–—:]\s*/, "").trim();
  // Collapse whitespace and drop trailing punctuation.
  s = s.replace(/\s+/g, " ").replace(/[.,;]+$/, "").trim();

  if (!s) return null;
  if (SCHOOL_YEAR_SYNONYMS[s]) return SCHOOL_YEAR_SYNONYMS[s];
  if (CANONICAL_SCHOOL_YEARS.has(s)) return s;

  // Last resort: look for a known synonym as a whole word inside the label
  // (e.g. "Undergraduate Sophomore Student").
  for (const [surface, canonical] of Object.entries(SCHOOL_YEAR_SYNONYMS)) {
    const pattern = new RegExp(
      `(?:^|\\s)${surface.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|\\s)`
    );
    if (pattern.test(s)) return canonical;
  }

  return null;
}

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

/**
 * Very conservative suffix-stripping stemmer for keyword/bigram matching.
 *
 * Both the resume and the job pass through the SAME function before
 * comparison, so the output only has to be consistent, not linguistically
 * correct — "coding" and "code" both landing on "cod" is a successful match,
 * not a bug. Applies at most ONE rule (plural OR -ing OR -ed) so short stems
 * never get double-stripped into collisions. Raw tokens are still what gets
 * displayed; stems exist purely inside the match sets.
 */
function stemToken(token) {
  if (token.length <= 3) return token;
  if (token.endsWith("ies") && token.length > 4) {
    return token.slice(0, -3) + "y";
  }
  if (token.endsWith("sses")) return token.slice(0, -2);
  if (
    token.endsWith("s") &&
    !token.endsWith("ss") &&
    !token.endsWith("us") &&
    !token.endsWith("is")
  ) {
    return token.slice(0, -1);
  }
  for (const suffix of ["ing", "ed"]) {
    if (!token.endsWith(suffix)) continue;
    let stem = token.slice(0, -suffix.length);
    // Too short to be a real stem ("used" -> "us", "ring" -> "r").
    if (stem.length < 3) return token;
    // Undo consonant doubling: "running" -> "runn" -> "run".
    const last = stem[stem.length - 1];
    if (stem.length > 3 && last === stem[stem.length - 2] && !"aeiou".includes(last)) {
      stem = stem.slice(0, -1);
    }
    return stem;
  }
  return token;
}

/** Stem every word of an "alpha beta" bigram, preserving the space. */
function stemBigram(bigram) {
  return bigram.split(" ").map(stemToken).join(" ");
}

/** Escape a literal string for safe interpolation into a RegExp. */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build the boundary-safe matcher for one skill surface form.
 *
 * `\b` is useless here: it is defined between a word char and a non-word char,
 * so /\bc\+\+\b/ does NOT match "c++ programming" (the boundary after "+" never
 * materialises). That single failure is the reason the old code fell back to a
 * naive substring test, which in turn matched "java" inside "javascript" and
 * "go" inside "algorithms".
 *
 * The lookaround form below defines the boundary against the exact character
 * class that can appear inside a skill token, so "c++", "c#", ".net", "ci/cd",
 * "node.js", "m&a" and "gd&t" all match, while "java" inside "javascript" and
 * "go" inside "algorithms" are correctly refused.
 */
function buildSkillRegex(surface) {
  return new RegExp(
    `(?<![a-z0-9+#./&-])${escapeRegex(surface)}(?![a-z0-9+#./&-])`,
    "i"
  );
}

class JobMatcher {
  constructor() {
    this.skillDb = SKILL_DB;
    this.softSkills = SOFT_SKILLS;
    this.skillAliases = SKILL_ALIASES;

    // Precompile a regex for every skill surface ONCE. Previously
    // extractExplicitSkills built ~316 RegExp objects on every call, and it
    // runs twice per job, so a 500-job batch compiled >300k regexes.
    //
    // One entry per SKILL_DB entry plus one per alias. Alias entries carry the
    // canonical name of their target, so "k8s" reports as "kubernetes".
    const compiled = [];
    for (const skill of SKILL_DB) {
      // Skip DB entries that an alias re-points elsewhere so a surface never
      // produces two competing canonical names.
      if (Object.prototype.hasOwnProperty.call(SKILL_ALIASES, skill)) continue;
      compiled.push({
        canonical: skill,
        surface: skill,
        // Kept for backward compatibility with anything reading `.skill`.
        skill,
        isSoft: SOFT_SKILLS.has(skill),
        regex: buildSkillRegex(skill),
      });
    }
    for (const [surface, canonical] of Object.entries(SKILL_ALIASES)) {
      compiled.push({
        canonical,
        surface,
        skill: canonical,
        isSoft: SOFT_SKILLS.has(canonical),
        regex: buildSkillRegex(surface),
      });
    }
    this.compiledSkills = compiled;

    // canonical name -> every regex that can prove it. Used by
    // classifyRequirements so line-level detection uses the same boundary
    // rules as document-level extraction.
    this.regexByCanonical = new Map();
    for (const entry of compiled) {
      const list = this.regexByCanonical.get(entry.canonical);
      if (list) list.push(entry.regex);
      else this.regexByCanonical.set(entry.canonical, [entry.regex]);
    }

    // Every canonical name the matcher can ever emit (SKILL_DB plus alias
    // targets such as "r" that intentionally live outside the DB).
    this.canonicalSkills = new Set(this.regexByCanonical.keys());

    // general skill -> the specific skills that count as evidence for it.
    // Inverted from SKILL_IMPLICATIONS so scoring can ask "the posting wants
    // X and the resume lacks it — does the resume hold anything that implies
    // X?" in one lookup.
    this.impliedBy = new Map();
    for (const [specific, generals] of Object.entries(SKILL_IMPLICATIONS)) {
      for (const general of generals) {
        const list = this.impliedBy.get(general);
        if (list) list.push(specific);
        else this.impliedBy.set(general, [specific]);
      }
    }

    // Cache the resume-side analysis. The resume is identical for every job in
    // a batch, so its skills/tokens/bigrams only need to be computed once.
    this._resumeCache = null;
  }

  /**
   * Pull a readable snippet out of the ORIGINAL job text around a match.
   * `index`/`length` are measured on the lowercased copy, which is
   * character-for-character aligned with the original for all realistic input.
   */
  _evidenceAt(jobText, index, length) {
    if (typeof index !== "number" || index < 0) return null;
    const start = Math.max(0, index - 40);
    const end = Math.min(jobText.length, index + length + 40);
    let snippet = jobText
      .slice(start, end)
      .replace(/<[^>]*>?/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!snippet) return null;
    if (start > 0) snippet = `...${snippet}`;
    if (end < jobText.length) snippet = `${snippet}...`;
    return snippet;
  }

  /**
   * Explain whether the user qualifies for a posting.
   *
   * Returns { qualified, reason, evidence } where `reason` is one of
   * 'school-year' | 'grad-year' | 'grad-window' | null and `evidence` is the
   * matched phrase plus ~40 characters of surrounding context (or null).
   *
   * `isQualified` stays a plain boolean — see the note on that method.
   */
  async checkEligibility(
    jobText,
    userSchoolYear,
    userGradDate,
    currentDate = new Date()
  ) {
    if (!jobText) {
      return { qualified: false, reason: null, evidence: null };
    }

    const lowerText = jobText.toLowerCase();
    // Unrecognised labels normalize to null, which SKIPS the gate entirely.
    const normalizedUserYear = normalizeSchoolYear(userSchoolYear);

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
      const yearEvidence = new Map();

      years.forEach((y) => {
        let pattern;
        if (y === "freshman") {
          pattern = /\bfreshm(a|e)n\b/i;
        } else if (y === "graduate") {
          // "graduate program", "recent graduate", "new graduate" and
          // "graduate school" are NOT statements that the posting wants a
          // graduate student, so they must not trip the gate.
          pattern =
            /\b(?<!recent )(?<!new )(?<!recent, )graduate(?!\s+(?:program|programme|school|studies|level|student|students|recruit|recruiting|hire|hires|opportunit))\b|\bmaster(?:'|’)?s\b|\bph\.?d\b|\bmba\b/i;
        } else if (y === "bachelors") {
          pattern =
            /\b(bachelor(?:'|’)?s|b\.?s\.?|b\.?a\.?|b\.?sc\.?|b\.?eng\.?)\b/i;
        } else if (y === "junior" || y === "senior") {
          const titles =
            "developer|engineer|consultant|associate|manager|designer|analyst|architect|admin|specialist|program|product|software|account|recruiter|writer|editor|vice|director|staff|principal|lead";
          pattern = new RegExp(`\\b${y}(s|es)?(?!\\s+(?:${titles}))\\b`, "i");
        } else {
          pattern = new RegExp(`\\b${y}(s|es)?\\b`, "i");
        }

        const match = pattern.exec(lowerText);
        if (match) {
          mentionedYears.add(y);
          yearEvidence.set(y, { index: match.index, length: match[0].length });
        }
      });

      if (mentionedYears.size > 0) {
        // The loop can only ever add canonical years, so testing for the
        // literal strings "undergraduate"/"undergrad" here was dead code.
        const isUndergrad = UNDERGRAD_YEARS.some((y) => mentionedYears.has(y));
        const userIsUndergrad = UNDERGRAD_YEARS.includes(normalizedUserYear);

        if (isUndergrad && userIsUndergrad) {
          // Qualified by broad category
        } else if (!mentionedYears.has(normalizedUserYear)) {
          const first = [...mentionedYears][0];
          const ev = yearEvidence.get(first);
          return {
            qualified: false,
            reason: "school-year",
            evidence: ev ? this._evidenceAt(jobText, ev.index, ev.length) : null,
          };
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
      let gradYearEvidence = null;
      gradPatterns.forEach((pattern) => {
        let match;
        while ((match = pattern.exec(lowerText)) !== null) {
          mentionedGradYears.add(match[1]);
          if (!gradYearEvidence) {
            gradYearEvidence = {
              index: match.index,
              length: match[0].length,
            };
          }
        }
      });

      if (
        mentionedGradYears.size > 0 &&
        !mentionedGradYears.has(userGradYearStr)
      ) {
        return {
          qualified: false,
          reason: "grad-year",
          evidence: gradYearEvidence
            ? this._evidenceAt(
                jobText,
                gradYearEvidence.index,
                gradYearEvidence.length
              )
            : null,
        };
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
            return {
              qualified: false,
              reason: "grad-window",
              evidence: this._evidenceAt(
                jobText,
                match.index,
                match[0].length
              ),
            };
          }
        }
      }
    }

    return { qualified: true, reason: null, evidence: null };
  }

  /**
   * Check if user qualifies based on school year and graduation date.
   *
   * Deliberately still returns a BOOLEAN. Every existing call site is written
   * as `if (!(await isQualified(...)))`, and a bare object is truthy, so
   * returning the richer shape here would silently stop disqualifying anything.
   * Callers that want the reason should call checkEligibility directly.
   */
  async isQualified(
    jobText,
    userSchoolYear,
    userGradDate,
    currentDate = new Date()
  ) {
    return (
      await this.checkEligibility(
        jobText,
        userSchoolYear,
        userGradDate,
        currentDate
      )
    ).qualified;
  }

  /**
   * Decode the HTML entities that Symplicity descriptions are full of.
   *
   * Runs AFTER tag stripping on purpose: decoding first would turn a literal
   * "&lt;script&gt;" into a fake tag that the stripper would then eat.
   */
  decodeEntities(text) {
    if (!text) return "";
    return text
      .replace(/&nbsp;/gi, " ")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&apos;/gi, "'")
      .replace(/&rsquo;/gi, "'")
      .replace(/&lsquo;/gi, "'")
      .replace(/&ldquo;/gi, '"')
      .replace(/&rdquo;/gi, '"')
      .replace(/&ndash;/gi, "-")
      .replace(/&mdash;/gi, "-")
      .replace(/&bull;/gi, " ")
      .replace(/&hellip;/gi, " ")
      .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
      // &amp; last so "&amp;lt;" cannot be double-decoded into a tag.
      .replace(/&amp;/gi, "&");
  }

  /**
   * Normalize text: block markup -> line breaks, strip tags, decode entities,
   * lowercase, drop punctuation that is not part of a skill token.
   *
   * The `\n` produced in step 1 survives the final character filter (it is
   * matched by `\s`), which is what classifyRequirements needs to split a
   * bulleted requirements list into individual lines.
   */
  normalize(text) {
    if (!text) return "";
    const withBreaks = text.replace(
      /<\/?(?:li|br|p|div|tr|h[1-6]|ul|ol)[^>]*>/gi,
      "\n"
    );
    const noHtml = withBreaks.replace(/<[^>]*>?/gm, " ");
    const decoded = this.decodeEntities(noHtml);
    return decoded.toLowerCase().replace(/[^a-z0-9\s.+#/&-]/g, " ");
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

    // NOTE: no substring fallback. `normalized.includes(skill)` used to match
    // "java" inside "javascript", "go" inside "algorithms" and "r" inside every
    // English word; the boundary-safe regexes make it unnecessary.
    for (const { canonical, isSoft, regex } of this.compiledSkills) {
      if (regex.test(normalized)) {
        // Always record the CANONICAL name so "k8s" and "kubernetes" collapse
        // into a single reported skill.
        if (isSoft) {
          soft.add(canonical);
        } else {
          hard.add(canonical);
        }
      }
    }

    return { hard, soft };
  }

  /**
   * Analyze the resume once and cache it. Recomputing the resume's skills,
   * tokens and bigrams for every job in a batch is wasted work — the text
   * never changes, so the results are deterministic and safe to reuse.
   */
  analyzeResume(resumeText) {
    if (this._resumeCache && this._resumeCache.text === resumeText) {
      return this._resumeCache;
    }
    const skills = this.extractExplicitSkills(resumeText);
    const allSkills = new Set([...skills.hard, ...skills.soft]);
    const tokens = this.tokenize(resumeText);
    const bigrams = new Set(this.extractBigrams(resumeText, tokens));
    this._resumeCache = {
      text: resumeText,
      skills,
      allSkills,
      tokens,
      tokenSet: new Set(tokens),
      bigrams,
      // Stemmed shadows of the sets above so "designing" on the job side can
      // meet "design"/"designed" on the resume side.
      stemSet: new Set(tokens.map(stemToken)),
      stemmedBigrams: new Set([...bigrams].map(stemBigram)),
    };
    return this._resumeCache;
  }

  /**
   * Detect if a skill appears in a "required" context vs "preferred/nice to have"
   */
  classifyRequirements(text, candidateSkills) {
    const normalized = this.normalize(text);
    const lines = normalized.split(/\n|\.(?:\s)/);

    // Only the skills already found in the text can appear on a line, so
    // restricting to those (instead of the whole 316-entry DB) yields an
    // identical result with far less work. Falls back to the full DB.
    const candidates = candidateSkills || this.canonicalSkills;

    // Resolve each candidate to the same compiled, boundary-safe regexes used
    // by extractExplicitSkills. A plain `line.includes(skill)` reported "java"
    // for a line mentioning JavaScript and "go" for one mentioning algorithms.
    const candidateMatchers = [];
    candidates.forEach((skill) => {
      const regexes = this.regexByCanonical.get(skill);
      if (regexes) candidateMatchers.push({ skill, regexes });
    });

    const requiredContext =
      /required|must have|must be|essential|mandatory|minimum|necessary/i;
    // "plus" on its own fired on "surplus" and "401k plus benefits".
    const preferredContext =
      /preferred|nice to have|bonus|desired|ideally|optional|\b(?:is )?a plus\b/i;

    const required = new Set();
    const preferred = new Set();

    // Check each line for context
    lines.forEach((line) => {
      const isRequired = requiredContext.test(line);
      const isPreferred = preferredContext.test(line);
      if (!isRequired && !isPreferred) return;

      candidateMatchers.forEach(({ skill, regexes }) => {
        if (!regexes.some((re) => re.test(line))) return;
        // A line that reads "Python required, Go a plus" is ambiguous; treat
        // the stronger signal as authoritative so real dealbreakers are never
        // downgraded to "nice to have".
        if (isRequired) {
          required.add(skill);
        } else {
          preferred.add(skill);
        }
      });
    });

    return { required, preferred };
  }

  /**
   * Extract bigrams (two-word phrases) that might represent skills not in DB
   */
  extractBigrams(text, precomputedTokens) {
    const tokens = precomputedTokens || this.tokenize(text);
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
  extractDynamicKeywords(jobText, precomputedTokens) {
    const jobTokens = precomputedTokens || this.tokenize(jobText);
    const freqMap = {};

    jobTokens.forEach((t) => {
      freqMap[t] = (freqMap[t] || 0) + 1;
    });

    // The old `count <= jobTokens.length * 0.3` filter could only ever exclude
    // a token in a ~10-token document, so it never fired on a real posting.
    // STOP_WORDS plus the `count > 1` requirement below are the real filter.
    const sortedTokens = Object.entries(freqMap).sort((a, b) => b[1] - a[1]);

    const dynamicKeywords = [];
    const limit = 20;

    for (const [token, count] of sortedTokens) {
      if (dynamicKeywords.length >= limit) break;
      // Skip single-char tokens and very generic ones
      if (token.length < 3) continue;
      // A repeated token is the only evidence a word matters. The old
      // `|| jobTokens.length < 50` escape promoted all 12 tokens of a
      // title-only "job" to keywords, which made the keyword denominator
      // smaller than 2 and let a single matched word score 100.
      if (count > 1) {
        dynamicKeywords.push(token);
      }
    }

    return dynamicKeywords;
  }

  /**
   * Calculate Match Score with improved precision
   */
  calculateScore(resumeText, jobDescriptionText) {
    if (!resumeText || !jobDescriptionText) {
      return {
        score: 0,
        matches: [],
        missing: [],
        details: {
          required: [],
          preferred: [],
          missingRequired: [],
          requiredCoverage: null,
          confidence: "low",
          jobTokenCount: 0,
        },
      };
    }

    // 0. Tokenize the job ONCE. This used to run three separate times per job
    //    (keywords, bigrams, TF-IDF).
    const jobTokens = this.tokenize(jobDescriptionText);
    const jobTokenCount = jobTokens.length;

    // How much text did we actually get to judge? A title-only listing used to
    // land at 45-49 — indistinguishable from a genuine partial match.
    const confidence =
      jobTokenCount >= 120 ? "high" : jobTokenCount >= 40 ? "medium" : "low";

    // 1. Explicit Skill Extraction (split hard vs soft)
    // Resume side is analyzed once and cached across the whole batch.
    const resumeAnalysis = this.analyzeResume(resumeText);
    const jobSkillsResult = this.extractExplicitSkills(jobDescriptionText);

    const jobHard = jobSkillsResult.hard;
    const jobSoft = jobSkillsResult.soft;

    // All resume skills combined for lookup
    const allResumeSkills = resumeAnalysis.allSkills;

    // 2. Required vs Preferred classification (only the job's own skills can match)
    const jobSkillSet = new Set([...jobHard, ...jobSoft]);
    const { required, preferred } = this.classifyRequirements(
      jobDescriptionText,
      jobSkillSet
    );

    // 3. Dynamic Keyword Extraction
    const jobKeywords = this.extractDynamicKeywords(
      jobDescriptionText,
      jobTokens
    );
    const resumeTokensSet = resumeAnalysis.tokenSet;

    // Exact token match first, stem match as the fallback, so "designing" in
    // the posting still meets "designed" on the resume.
    const resumeStemSet = resumeAnalysis.stemSet;
    const matchedKeywords = jobKeywords.filter(
      (k) => resumeTokensSet.has(k) || resumeStemSet.has(stemToken(k))
    );

    // 4. Bigram matching (also stem-aware)
    const jobBigrams = this.extractBigrams(jobDescriptionText, jobTokens);
    const resumeBigramSet = resumeAnalysis.bigrams;
    const resumeStemmedBigrams = resumeAnalysis.stemmedBigrams;
    const matchedBigrams = jobBigrams.filter(
      (b) => resumeBigramSet.has(b) || resumeStemmedBigrams.has(stemBigram(b))
    );

    // 5. Inferred skills: the posting wants a skill the resume doesn't state,
    //    but the resume holds a specific skill that implies it (pytorch =>
    //    machine learning). Recorded with the evidence skill so the UI can
    //    explain the credit.
    const inferred = [];
    const inferredSet = new Set();
    jobHard.forEach((skill) => {
      if (allResumeSkills.has(skill)) return;
      const sources = this.impliedBy.get(skill);
      if (!sources) return;
      const via = sources.find((s) => allResumeSkills.has(s));
      if (via) {
        inferred.push({ skill, via });
        inferredSet.add(skill);
      }
    });

    // Build display lists
    // Hard skills matched/missing take priority, then soft, then keywords.
    // Inferred skills count as matched (the resume supports them), never as
    // missing.
    const hardMatched = [...jobHard].filter((s) => allResumeSkills.has(s));
    const hardMissing = [...jobHard].filter(
      (s) => !allResumeSkills.has(s) && !inferredSet.has(s)
    );
    const softMatched = [...jobSoft].filter((s) => allResumeSkills.has(s));

    // Combine for display (hard skills first, then top keywords)
    const displayMatches = [
      ...hardMatched,
      ...inferred.map((i) => i.skill),
      ...softMatched.slice(0, 2),
      ...matchedKeywords.slice(0, 3),
    ];
    // Dealbreakers first: a missing skill the posting calls mandatory matters
    // more than one it merely lists.
    const displayMissing = [...hardMissing]
      .sort((a, b) => (required.has(b) ? 1 : 0) - (required.has(a) ? 1 : 0))
      .slice(0, 5);

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
        } else if (inferredSet.has(skill)) {
          weightedMatch += weight * INFERRED_CREDIT;
        }
      });

      // Matching ~65% of weighted skills is considered "perfect"
      const coverage = weightedMatch / (weightedTotal * 0.65);
      hardSkillScore = Math.min(100, coverage * 100);
    }
    // No `else` branch: when jobHard is empty, wHard is 0 below, so any value
    // assigned here is multiplied straight out of the total.

    // Part B: Dynamic Keyword Coverage
    let keywordScore = 0;
    if (jobKeywords.length > 0) {
      const totalMatched = matchedKeywords.length + matchedBigrams.length * 1.5;
      const coverage = totalMatched / (jobKeywords.length * 0.6);
      keywordScore = Math.min(100, coverage * 100);
    }

    // --- Weighted Final Score ---
    // Hard skills dominate; keywords cover the rest
    let wHard, wKeyword;

    if (jobHard.size === 0) {
      // No hard skills found — keywords are the only signal
      wHard = 0;
      wKeyword = 1;
    } else if (jobHard.size <= 3) {
      // Few hard skills — balance with keywords
      wHard = 0.65;
      wKeyword = 0.35;
    } else {
      // Plenty of hard skills — they're the best signal
      wHard = 0.75;
      wKeyword = 0.25;
    }

    const totalScore = hardSkillScore * wHard + keywordScore * wKeyword;

    // A near-empty posting carries almost no evidence either way, so shrink its
    // score toward a neutral prior instead of letting noise land it mid-band
    // where it is indistinguishable from a real partial match.
    let finalScore = totalScore;
    if (confidence === "low") {
      finalScore = 35 + (finalScore - 35) * 0.45;
    }

    return {
      score: Math.round(finalScore),
      matches: uniqueMatches,
      missing: uniqueMissing,
      details: {
        hardSkillScore: Math.round(hardSkillScore),
        keywordScore: Math.round(keywordScore),
        hardSkillsFound: jobHard.size,
        hardSkillsMatched: hardMatched.length,
        // --- Additive explainability fields ---
        required: [...required],
        preferred: [...preferred],
        // [{ skill, via }] — skills credited because the resume holds a more
        // specific skill that implies them.
        inferred,
        missingRequired: [...hardMissing].filter((s) => required.has(s)),
        requiredCoverage: required.size
          ? [...required].filter(
              (s) => allResumeSkills.has(s) || inferredSet.has(s)
            ).length / required.size
          : null,
        confidence,
        jobTokenCount,
      },
    };
  }
}

export default JobMatcher;
