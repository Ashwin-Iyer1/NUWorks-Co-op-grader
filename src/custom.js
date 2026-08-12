// Copyright (c) 2026 Ashwin Iyer — Licensed under AGPL-3.0

import JobMatcher, { ELIGIBILITY_COPY } from "./matcher.js";
import { setupThemeToggle } from "./theme.js";

// ─── State ───
let allJobs = []; // All fetched + scored jobs
let filteredJobs = []; // After filters applied
let displayedCount = 0;
const BATCH_SIZE = 60; // Jobs rendered per "page"
let isFetching = false;
let shouldStop = false;

// One shared toast element means one shared timer — track it so an earlier
// message's timeout can never clear a later message.
let toastTimer = null;

// The progress bar is hidden again a beat after a run ends, so a finished
// fetch never sits pinned at 100% looking like a hung job.
let progressResetTimer = null;

// Mid-fetch re-render throttle. applyFilters() rebuilds the whole grid, so
// firing it once per fetched page thrashes the DOM on a large run.
const MID_FETCH_RENDER_MS = 1500;
let lastMidFetchRender = 0;
let midFetchRenderTimer = null;

// null | "credentials" | "resume" — set by preflight(), consumed by the
// empty state so a blocked run explains itself persistently.
let preflightIssue = null;

// The Error a run died on, or null. A five-second toast is not an answer to a
// failed run, so this outlives the toast and drives the progress line and the
// empty state until the next run starts.
let lastFetchError = null;

// ─── Helpers ───
const BASE_URL = "https://northeastern-csm.symplicity.com";

// Score bands are fixed product-wide: >=70 high, 40-69 medium, <40 low.
// Single source of truth so the card and the modal can never drift.
function scoreTier(score) {
  const n = Number(score) || 0;
  if (n >= 70) return "high";
  if (n >= 40) return "medium";
  return "low";
}
const TIER_CLASS = { high: "score-high", medium: "score-medium", low: "score-low" };
const TIER_BAR = { high: "var(--green)", medium: "var(--yellow)", low: "var(--red)" };

// Shared low-confidence copy — must stay byte-identical to the popup's.
const THIN_LABEL = "Thin description";
const THIN_TOOLTIP =
  "This posting had almost no description text, so the score is a rough guess.";

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Icons ───
// Feather-style outline glyphs. These replace the emoji that used to prefix the
// job card meta strings — the design system allows no emoji anywhere in the UI.
const ICON_ATTRS =
  'width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

const ICONS = {
  compensation: `<svg ${ICON_ATTRS}><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>`,
  location: `<svg ${ICON_ATTRS}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>`,
  posted: `<svg ${ICON_ATTRS}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`,
  deadline: `<svg ${ICON_ATTRS}><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`,
  term: `<svg ${ICON_ATTRS}><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>`,
  info: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`,
  blocked: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>`,
  alert: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
};

// Turn a thrown fetch error into something a student can act on. The raw
// "HTTP 401" means nothing to them; an expired session is the common cause.
function describeFetchError(err) {
  const msg = String((err && err.message) || err || "");
  if (/\b(401|403)\b/.test(msg)) {
    return "Your NUWorks session has expired. Open NUWorks, sign in again, then retry.";
  }
  if (/\b(429)\b/.test(msg)) {
    return "NUWorks is rate-limiting the request. Wait a minute, then retry.";
  }
  if (/\b5\d\d\b/.test(msg)) {
    return "NUWorks returned a server error. Wait a moment, then retry.";
  }
  if (/failed to fetch|network|load failed/i.test(msg)) {
    return "Couldn't reach NUWorks. Check your connection, then retry.";
  }
  return `The request failed (${msg || "unknown error"}). Retry in a moment.`;
}

function getHeaders(creds) {
  return {
    accept: "application/json, text/plain, */*",
    "accept-language": "en-US,en;q=0.9",
    authorization: creds.authorization,
    "sec-ch-ua-platform": '"macOS"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "x-requested-system-user": "students",
    Cookie: creds.cookie,
  };
}

async function fetchJobPage(params, creds, page) {
  const searchParams = new URLSearchParams({ ...params, page: String(page) });
  const url = `${BASE_URL}/api/v2/jobs?${searchParams.toString()}`;
  const resp = await fetch(url, { method: "GET", headers: getHeaders(creds) });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json();
  return data.models || [];
}

// Currently logged-in student (used to look up the profile id).
async function fetchCurrentUser(creds) {
  try {
    const resp = await fetch(`${BASE_URL}/api/v2/auth/current-user`, {
      headers: getHeaders(creds),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.data || data.user || null;
  } catch {
    return null;
  }
}

// Full student profile: real grad date, class year, major, work auth, skills.
async function fetchStudentProfile(userId, creds) {
  try {
    const url = `${BASE_URL}/api/v2/student/profile?enable_translation=false&id=${encodeURIComponent(
      userId
    )}`;
    const resp = await fetch(url, { headers: getHeaders(creds) });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

// Authoritative, server-side batch eligibility. Returns { jobId: boolean }.
async function fetchQualifiedStatus(jobIds, creds) {
  const result = {};
  if (!jobIds || jobIds.length === 0) return result;
  const CHUNK = 50;
  const headers = getHeaders(creds);
  for (let i = 0; i < jobIds.length; i += CHUNK) {
    const chunk = jobIds.slice(i, i + CHUNK);
    const url = `${BASE_URL}/api/v2/jobs/discovery/qualified-status?jobs=${chunk.join(
      ","
    )}`;
    try {
      const resp = await fetch(url, { headers });
      if (!resp.ok) continue;
      const data = await resp.json();
      const map = data.qualified || {};
      for (const [id, status] of Object.entries(map)) {
        result[id] = !/not\s*qualified/i.test(String(status));
      }
    } catch {
      /* leave unknown ids absent → caller falls back to regex */
    }
  }
  return result;
}

async function fetchJobDescription(jobId, creds) {
  const headers = getHeaders(creds);
  let resp = await fetch(`${BASE_URL}/api/v2/jobs/${jobId}`, { headers });
  if (!resp.ok) {
    resp = await fetch(`${BASE_URL}/api/v3/jobs/${jobId}?expired=1`, { headers });
  }
  if (!resp.ok) return null;
  return resp.json();
}

async function fetchJobDetail(jobId, creds) {
  const headers = getHeaders(creds);
  const resp = await fetch(`${BASE_URL}/api/v3/jobs/${jobId}`, { headers });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

async function favoriteJob(jobId, creds) {
  const resp = await fetch(`${BASE_URL}/api/v2/jobs/${jobId}/favorite`, {
    method: "POST",
    headers: getHeaders(creds),
  });
  return resp.ok;
}

function isExternalApplication(desc, contactBlurb) {
  if (!desc) return false;
  const lower = (desc + " " + (contactBlurb || "")).toLowerCase();
  const kw = ["workday", "smart recruiters", "smartrecruiters", "submit your application", "submit application"];
  if (kw.some((k) => lower.includes(k))) return true;
  const hrefs = lower.match(/href="([^"]+)"/g) || [];
  if (hrefs.some((h) => h.includes("workday") || h.includes("smartrecruiters"))) return true;
  if (contactBlurb && /https?:\/\/|www\./i.test(contactBlurb)) return true;
  return false;
}

function showToast(msg, duration = 3000) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  // A single shared element needs a single tracked timer, otherwise the
  // previous message's timeout hides the one that just replaced it.
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), duration);
}

// ─── Modal ───
function openModal(jobId) {
  const overlay = $("modal-overlay");
  const content = $("modal-content");
  content.innerHTML = `<div class="modal-loading"><span class="spinner spinner-lg"></span>Loading job details...</div>`;
  overlay.classList.add("open");
  document.body.style.overflow = "hidden";

  // The scored record for this job is already in memory — the detail fetch
  // returns the posting, not our analysis of it. May be undefined when the
  // modal is opened for an id that was never scored.
  const scored = allJobs.find((j) => String(j.job_id) === String(jobId));

  (async () => {
    try {
      const creds = await getCredentials();
      const job = await fetchJobDetail(jobId, creds);
      content.innerHTML = renderModalContent(job, scored);
      wireModalActions(job, creds);
    } catch (err) {
      content.innerHTML = `<div class="modal-loading">Failed to load: ${err.message}</div>`;
    }
  })();
}

function closeModal() {
  $("modal-overlay").classList.remove("open");
  document.body.style.overflow = "";
}

// One thin labelled bar inside the Match section.
function renderMatchBar(label, value) {
  const pct = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  return `
    <div class="modal-match-bar">
      <div class="modal-match-bar-label"><b>${esc(label)}</b><span>${pct}%</span></div>
      <div class="card-score-bar"><div class="card-score-fill" style="width:${pct}%"></div></div>
    </div>
  `;
}

// Why this posting scored what it scored — the one thing the modal never showed.
// `scored` is the in-memory analysed record and may be undefined; every field it
// carries is optional, so each block guards independently. `job` is the fresh
// detail response, which carries the server's own non_qualified_reason lines.
function renderMatchSection(scored, job) {
  if (!scored) return "";

  const details = scored.matchDetails?.details;
  const disqualified = scored.disqualified === true;
  if (!details && !disqualified) return "";

  let head = "";
  let bars = "";

  if (disqualified) {
    head += `<span class="disqualified-badge">Ineligible</span>`;
  }
  // Not an else: a job graded despite being ineligible carries both the badge
  // and the match % ("Grade ineligible jobs").
  if (details && (!disqualified || scored.gradedIneligible)) {
    const score = Math.round(Number(scored.matchScore) || 0);
    const tier = scoreTier(score);
    head += `<span class="score-pill ${TIER_CLASS[tier]}">${score}% match</span>`;
  }

  if (details) {
    const found = Number(details.hardSkillsFound) || 0;
    const matched = Number(details.hardSkillsMatched) || 0;
    head +=
      found > 0
        ? `<span class="modal-match-summary">Matched ${matched} of ${found} hard skills</span>`
        : `<span class="modal-match-summary">This posting didn't name specific skills, so the score comes from keyword overlap.</span>`;

    if (details.confidence === "low") {
      head += `<span class="thin-marker" title="${esc(THIN_TOOLTIP)}">${ICONS.info}${THIN_LABEL}</span>`;
    }

    bars = `
      <div class="modal-match-bars">
        ${renderMatchBar("Skills", details.hardSkillScore)}
        ${renderMatchBar("Keywords", details.keywordScore)}
      </div>
    `;
  }

  let ineligible = "";
  if (disqualified) {
    const reason = scored.eligibility?.reason;
    // NUWorks states its own reasons on the detail response ("You do not match
    // the desired Applicant Type…"); those beat our generic server copy.
    const serverReasons =
      reason === "server" && Array.isArray(job?.non_qualified_reason)
        ? job.non_qualified_reason.filter(Boolean)
        : [];
    const copy =
      serverReasons.length > 0
        ? serverReasons.join(" ")
        : (reason && ELIGIBILITY_COPY[reason]) || ELIGIBILITY_COPY.server;
    const evidence = scored.eligibility?.evidence;
    ineligible = `
      <div class="modal-ineligible">
        <div class="modal-ineligible-title">${ICONS.blocked}Why you're not eligible</div>
        <div class="modal-ineligible-reason">${esc(copy)}</div>
        ${evidence ? `<div class="modal-ineligible-evidence">“${esc(evidence)}”</div>` : ""}
      </div>
    `;
  }

  return `
    <div class="modal-section">
      <div class="modal-section-title">Match</div>
      <div class="modal-match">
        ${head ? `<div class="modal-match-head">${head}</div>` : ""}
        ${bars}
        ${ineligible}
      </div>
    </div>
  `;
}

// Cross-reference the employer's own declared skill list against our analysis of
// the resume, so the chips stop being flat and undifferentiated. Matched first.
function renderModalSkills(skills, scored) {
  const matched = new Set(
    (scored?.matchDetails?.matches || []).map((s) => String(s).toLowerCase())
  );
  const missing = new Set(
    (scored?.matchDetails?.missing || []).map((s) => String(s).toLowerCase())
  );

  const decorated = skills.map((name, index) => {
    const key = String(name).toLowerCase();
    if (matched.has(key)) return { name, cls: " matched", rank: 0, index, title: "On your resume" };
    if (missing.has(key)) return { name, cls: " missing", rank: 1, index, title: "Not found on your resume" };
    return { name, cls: "", rank: 2, index, title: "" };
  });
  decorated.sort((a, b) => a.rank - b.rank || a.index - b.index);

  return decorated
    .map(
      (s) =>
        `<span class="modal-skill${s.cls}"${s.title ? ` title="${esc(s.title)}"` : ""}>${esc(s.name)}</span>`
    )
    .join("");
}

function renderModalContent(job, scored) {
  const emp = job.job_emp || {};
  const profile = job.employer_profile || emp.employer_profile || {};
  const logo = job.employer_logo || "";
  const companyName = job.employer_name || emp.name || emp._label || "Unknown";
  const website = profile.website || "";
  const overview = profile.overview || "";
  const industry = (profile.industry || []).map((i) => i._label).join(", ");
  const employeeCount = profile.csm_number_of_employees?._label || "";
  // const orgType = profile.csm_organization_type?._label || "";

  // Location
  const locations = (job.location || []).map((l) => l.address_text || l._label).filter(Boolean).join("; ") || job.job_location || "";

  // Compensation
  let compensation = "";
  if (job.compensation_from && job.compensation_to) {
    const freq = job.compensation_frequency?._label || "";
    if (job.compensation_from === job.compensation_to) {
      compensation = `$${job.compensation_from} ${freq}`;
    } else {
      compensation = `$${job.compensation_from} – $${job.compensation_to} ${freq}`;
    }
  }

  // Job type
  const jobTypes = (job.job_type || []).map((t) => t._label).join(", ");

  // Remote status
  const remote = job.symp_remote_onsite?._label || "";

  // Dates
  const posted = job.created ? new Date(job.created).toLocaleDateString() : "";
  const deadline = job.application_deadline ? new Date(job.application_deadline).toLocaleDateString() : "";
  const startDate = job.job_start ? new Date(job.job_start).toLocaleDateString() : "";
  const endDate = job.job_end ? new Date(job.job_end).toLocaleDateString() : "";

  // Skills
  const skills = (job.skills || []).map((s) => s.skill_name || s._label).filter(Boolean);

  // Contact / apply link
  const contactBlurb = job.contact_blurb || "";
  const applyUrl = contactBlurb.match(/https?:\/\/[^\s<"]+/)?.[0] || "";

  // Qualifications fields. The declared fields are often empty while the
  // screen_* twins carry the real requirement (see gpa "0" vs screen_gpa "3.0"),
  // so each one falls back to its screening counterpart.
  const majors =
    (job.major || []).map((m) => m._label).filter(Boolean).join(", ") ||
    fieldLabel(job.screen_major);
  const classLevels =
    (job.class_level || []).map((c) => c._label).filter(Boolean).join(", ") ||
    fieldLabel(job.screen_class_level);
  const degreeLevels =
    (job.degree_level || []).map((d) => d._label).filter(Boolean).join(", ") ||
    fieldLabel(job.screen_degree_level);
  const workAuth = (job.work_authorization || []).map((w) => w._label).filter(Boolean).join(", ");
  const gpa =
    job.gpa && job.gpa !== "0"
      ? job.gpa
      : job.screen_gpa && job.screen_gpa !== "0"
        ? job.screen_gpa
        : "";

  // Co-op-specific fields from the v3 detail response.
  const workTerm = jobWorkTerm(job);
  const workplace = fieldLabel(job.workplace_type);
  const hours = fieldLabel(job.hours_per_week2);
  const jobLength = fieldLabel(job.job_length_ms);
  const jobFunction = fieldLabel(job.job_function2);
  const expLevel = fieldLabel(job.desired_experience_level);
  const openings = job.num_openings || job.number_of_openings_static || "";
  const positionStart = job.start_date_nu
    ? new Date(job.start_date_nu).toLocaleDateString()
    : "";
  // const colleges = fieldLabel(job.targeted_academic_majors);
  const transit = fieldLabel(job.transportationm);

  // Status tags
  let statusTags = "";
  if (job.favorite) statusTags += `<span class="modal-tag green">Saved</span>`;
  if (job.applied) statusTags += `<span class="modal-tag green">Applied</span>`;
  if (job.expired) statusTags += `<span class="modal-tag danger">Expired</span>`;
  if (workTerm) statusTags += `<span class="modal-tag accent">${esc(workTerm)}</span>`;
  if (remote) statusTags += `<span class="modal-tag">${remote}</span>`;
  if (workplace) statusTags += `<span class="modal-tag">${esc(workplace)}</span>`;
  if (jobTypes) statusTags += `<span class="modal-tag">${jobTypes}</span>`;
  if (jobLength) statusTags += `<span class="modal-tag">${esc(jobLength)}</span>`;
  if (compensation) statusTags += `<span class="modal-tag accent">${compensation}</span>`;
  if (locations) statusTags += `<span class="modal-tag">${locations}</span>`;

  // Info grid items
  let infoItems = "";
  const addInfo = (label, value) => {
    if (value) infoItems += `<div class="modal-info-item"><div class="modal-info-label">${label}</div><div class="modal-info-value">${value}</div></div>`;
  };
  addInfo("Posted", posted);
  addInfo("Posting ends", endDate);
  if (deadline) addInfo("Deadline", deadline);
  if (workTerm) addInfo("Work term", esc(workTerm));
  if (positionStart) addInfo("Position start", positionStart);
  else if (startDate) addInfo("Start date", startDate);
  if (jobLength) addInfo("Job length", esc(jobLength));
  if (hours) addInfo("Hours", esc(hours));
  if (workplace) addInfo("Workplace", esc(workplace));
  if (openings) addInfo("Openings", esc(openings));
  if (jobFunction) addInfo("Job function", esc(jobFunction));
  if (expLevel) addInfo("Experience level", esc(expLevel));
  if (industry) addInfo("Industry", industry);
  // if (orgType) addInfo("Company type", orgType);
  if (employeeCount) addInfo("Employees", employeeCount);
  if (gpa) addInfo("Min GPA", gpa);
  if (classLevels) addInfo("Class level", classLevels);
  if (degreeLevels) addInfo("Degree level", degreeLevels);
  if (majors) addInfo("Majors", majors);
  // if (colleges) addInfo("Colleges", esc(colleges));
  if (workAuth) addInfo("Work authorization", workAuth);
  if (transit) addInfo("Transportation", esc(transit));

  const nuworksUrl = `${BASE_URL}/students/app/jobs/detail/${job.job_id}`;

  return `
    <div class="modal-banner"></div>
    <div class="modal-body">
      <div class="modal-header-row">
        ${logo ? `<img class="modal-logo" src="${logo}" />` : ""}
        <div class="modal-title-group">
          <div class="modal-title">${job.job_title || "Untitled"}</div>
          <div class="modal-company">
            ${website ? `<a href="${website}" target="_blank">${companyName}</a>` : companyName}
            ${job.visual_id ? `<span style="color:var(--text-muted);font-size:0.75rem;margin-left:8px;font-family:var(--font-mono)">#${job.visual_id}</span>` : ""}
          </div>
        </div>
      </div>

      <div class="modal-meta">${statusTags}</div>

      ${renderMatchSection(scored, job)}

      ${infoItems ? `<div class="modal-section"><div class="modal-section-title">Details</div><div class="modal-info-grid">${infoItems}</div></div>` : ""}

      ${skills.length ? `
        <div class="modal-section">
          <div class="modal-section-title">Skills</div>
          <div class="modal-skills">${renderModalSkills(skills, scored)}</div>
        </div>
      ` : ""}

      <div class="modal-section">
        <div class="modal-section-title">Description</div>
        <div class="modal-desc">${job.job_desc || "<p>No description available.</p>"}</div>
      </div>

      ${overview ? `
        <div class="modal-section">
          <div class="modal-section-title">About ${companyName}</div>
          <div class="modal-overview">${overview}</div>
        </div>
      ` : ""}

      <div class="modal-actions">
        <button class="btn btn-primary" id="modal-save-btn" data-id="${job.job_id}">${job.favorite ? "Saved" : "Save job"}</button>
        <a href="${nuworksUrl}" target="_blank" class="btn btn-secondary">Open in NUWorks</a>
        ${applyUrl ? `<a href="${applyUrl}" target="_blank" class="btn btn-secondary">Apply externally</a>` : ""}
      </div>
    </div>
  `;
}

function wireModalActions(job, creds) {
  // Hide the logo if it fails to load (e.g. .eps files browsers can't render).
  // Must be a real listener — the extension page CSP blocks inline onerror
  // attributes. wireModalActions runs synchronously after innerHTML is set,
  // so the listener attaches before any network error can fire.
  const logoEl = document.querySelector(".modal-logo");
  if (logoEl) {
    logoEl.addEventListener("error", () => {
      logoEl.style.display = "none";
    });
  }

  const saveBtn = document.getElementById("modal-save-btn");
  if (saveBtn && !job.favorite) {
    saveBtn.addEventListener("click", async () => {
      saveBtn.disabled = true;
      saveBtn.textContent = "Saving...";
      const ok = await favoriteJob(job.job_id, creds);
      if (ok) {
        saveBtn.textContent = "Saved";
        saveBtn.className = "btn btn-success";
      } else {
        saveBtn.textContent = "Error";
        saveBtn.disabled = false;
      }
    });
  }
}

// ─── Credentials ───
function getCredentials() {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      [
        "cookie",
        "authorization",
        "resume",
        "schoolYear",
        "gradDate",
        "gradeIneligible",
        "profileSkills",
      ],
      (result) => resolve(result)
    );
  });
}

// ─── DOM Refs ───
const $ = (id) => document.getElementById(id);

// ─── Field helpers (defensive — search & discovery responses vary) ───
function jobCompensation(job) {
  const from = job.compensation_from;
  const to = job.compensation_to;
  if (!from && !to) return "";
  const freq =
    (job.compensation_frequency && job.compensation_frequency._label) ||
    job.compensation_frequency ||
    "";
  if (from && to && from !== to) return `$${from}–$${to} ${freq}`.trim();
  return `$${from || to} ${freq}`.trim();
}

function jobRemote(job) {
  const r = job.symp_remote_onsite;
  if (!r) return "";
  if (Array.isArray(r)) return r.map((x) => x._label || x).filter(Boolean).join(", ");
  return r._label || (typeof r === "string" ? r : "");
}

function jobLocation(job) {
  return job.location || job.job_location || "";
}

function jobTypeLabel(job) {
  if (job.job_type_name) return job.job_type_name;
  if (typeof job.job_type === "string") return job.job_type;
  return "";
}

// Symplicity wraps most enum-ish fields as {_id,_label} (or a title'd variant),
// sometimes as an array of them. Flatten any of those shapes to display text.
function fieldLabel(value) {
  if (!value) return "";
  if (Array.isArray(value)) {
    return value
      .map((v) => (v && typeof v === "object" ? v._label || v.title : v))
      .filter(Boolean)
      .join(", ");
  }
  if (typeof value === "object") return value._label || value.title || "";
  return typeof value === "string" ? value : "";
}

// Work term ("2027 - Spring"). Some payloads omit el_work_term; the screening
// applicant-type carries the same term label on co-op postings, so fall back.
function jobWorkTerm(job) {
  const direct = fieldLabel(job.el_work_term);
  if (direct) return direct;
  const screen = Array.isArray(job.screen_applicant_type)
    ? job.screen_applicant_type
    : [];
  return screen.map((s) => s && s._label).find(Boolean) || "";
}

// Chronological order for "YYYY - Season" labels; anything unparseable sorts
// after the parseable terms, alphabetically.
const SEASON_ORDER = { spring: 0, summer: 1, fall: 2, winter: 3 };
function compareWorkTerms(a, b) {
  const parse = (t) => {
    const year = (String(t).match(/\d{4}/) || [])[0];
    const season = Object.keys(SEASON_ORDER).find((s) =>
      String(t).toLowerCase().includes(s)
    );
    return year && season ? Number(year) * 10 + SEASON_ORDER[season] : null;
  };
  const pa = parse(a);
  const pb = parse(b);
  if (pa !== null && pb !== null) return pa - pb;
  if (pa !== null) return -1;
  if (pb !== null) return 1;
  return String(a).localeCompare(String(b));
}

// ─── Render Jobs ───
function renderJobCard(job) {
  const card = document.createElement("div");
  card.className = "job-card";

  const score = job.matchScore ?? 0;
  const tier = scoreTier(score);
  const tierClass = TIER_CLASS[tier];
  const barColor = TIER_BAR[tier];

  const jobUrl = `${BASE_URL}/students/app/jobs/detail/${job.job_id}`;

  let badges = "";
  if (job.isExternal) badges += `<span class="external-badge">External</span> `;
  if (job.disqualified) badges += `<span class="disqualified-badge">Ineligible</span> `;

  const matchedSkills = (job.matchDetails?.matches || []).slice(0, 5);
  const missingSkills = (job.matchDetails?.missing || []).slice(0, 3);

  // Skills the posting states as mandatory get extra weight — these are the
  // dealbreakers, not just gaps. `missing` already arrives required-first.
  const requiredMissing = new Set(
    (job.matchDetails?.details?.missingRequired || []).map((s) =>
      String(s).toLowerCase()
    )
  );

  let skillsHtml = "";
  if (matchedSkills.length || missingSkills.length) {
    skillsHtml = `<div class="skill-tags">`;
    matchedSkills.forEach((s) => { skillsHtml += `<span class="skill-tag matched">${s}</span>`; });
    missingSkills.forEach((s) => {
      const isRequired = requiredMissing.has(String(s).toLowerCase());
      skillsHtml += `<span class="skill-tag missing${isRequired ? " required" : ""}"${
        isRequired ? ` title="This posting lists this skill as required."` : ""
      }>${s}</span>`;
    });
    skillsHtml += `</div>`;
  }

  const postDate = job.postdate ? new Date(job.postdate).toLocaleDateString() : "";
  const compensation = jobCompensation(job);
  const remote = jobRemote(job);
  const location = jobLocation(job);
  const jobType = jobTypeLabel(job);
  const deadline = job.deadline
    ? new Date(job.deadline).toLocaleDateString()
    : "";
  const workTerm = jobWorkTerm(job);
  const workplace = fieldLabel(job.workplace_type);
  const jobLength = fieldLabel(job.job_length_ms);

  card.innerHTML = `
    <div class="job-card-header">
      <div>
        <div class="job-card-title">${job.job_title || "Untitled"}</div>
        <div class="job-card-company">${job.name || "Unknown Employer"}</div>
      </div>
      ${
        !job.disqualified
          ? `<span class="score-pill ${tierClass}">${score}% match</span>`
          : job.gradedIneligible
            ? `<span class="disqualified-badge">Ineligible</span><span class="score-pill ${tierClass}">${score}% match</span>`
            : `<span class="disqualified-badge">Ineligible</span>`
      }
    </div>
    <div class="card-score-bar"><div class="card-score-fill" style="width:${score}%;background:${barColor}"></div></div>
    <div class="job-card-meta">
      ${badges}
      ${workTerm ? `<span title="Work term">${ICONS.term}${esc(workTerm)}</span>` : ""}
      ${compensation ? `<span title="Compensation">${ICONS.compensation}${compensation}</span>` : ""}
      ${remote ? `<span title="Work mode">${ICONS.location}${remote}</span>` : ""}
      ${postDate ? `<span title="Posted">${ICONS.posted}${postDate}</span>` : ""}
      ${deadline ? `<span title="Deadline">${ICONS.deadline}${deadline}</span>` : ""}
      ${jobType ? `<span>${jobType}</span>` : ""}
      ${workplace ? `<span title="Workplace">${esc(workplace)}</span>` : ""}
      ${jobLength ? `<span title="Job length">${esc(jobLength)}</span>` : ""}
      ${location ? `<span>${location}</span>` : ""}
    </div>
    ${skillsHtml}
    <div class="job-card-actions">
      <a class="btn btn-secondary btn-sm" href="${jobUrl}" target="_blank" rel="noopener">Open in NUWorks</a>
      <button class="btn btn-secondary btn-sm btn-details" data-id="${job.job_id}">Details</button>
      <button class="btn btn-primary btn-sm btn-save" data-id="${job.job_id}">Save</button>
    </div>
  `;

  // Wire card click to open modal
  card.style.cursor = "pointer";
  card.addEventListener("click", (e) => {
    // Don't open modal if clicking a button or link
    if (e.target.closest("button") || e.target.closest("a")) return;
    openModal(job.job_id);
  });

  // Wire details button — same target as the whole-card click
  card.querySelector(".btn-details").addEventListener("click", (e) => {
    e.stopPropagation();
    openModal(job.job_id);
  });

  // Wire save button
  const saveBtn = card.querySelector(".btn-save");
  saveBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";
    const creds = await getCredentials();
    const ok = await favoriteJob(job.job_id, creds);
    if (ok) {
      saveBtn.textContent = "Saved";
      saveBtn.className = "btn btn-success btn-sm";
    } else {
      saveBtn.textContent = "Error";
      saveBtn.disabled = false;
    }
  });

  return card;
}

// ─── Empty state ───
// #empty-state's <h2>/<p> are written by both renderJobs and preflight through
// these exact querySelector calls — that shared contract is why the element is
// never restructured. The action host is a sibling, never a wrapper.
function setEmptyActions(actions) {
  const host = $("empty-actions");
  if (!host) return;
  host.innerHTML = "";
  if (!actions || actions.length === 0) {
    host.style.display = "none";
    return;
  }
  actions.forEach((action) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `btn ${action.variant || "btn-secondary"} btn-sm`;
    btn.textContent = action.label;
    btn.addEventListener("click", action.onClick);
    host.appendChild(btn);
  });
  host.style.display = "flex";
}

function refreshEmptyState() {
  const emptyState = $("empty-state");
  const h2 = emptyState.querySelector("h2");
  const p = emptyState.querySelector("p");
  emptyState.style.display = "block";

  // 1. Nothing fetched, and something is stopping a fetch from working.
  if (allJobs.length === 0 && preflightIssue === "credentials") {
    h2.textContent = "Connect to NUWorks first";
    p.textContent =
      "Open NUWorks in a tab and browse any page so the extension can pick up your session, then check again.";
    setEmptyActions([
      { label: "Open NUWorks", variant: "btn-primary", onClick: openNUWorks },
      { label: "Check again", onClick: preflight },
    ]);
    return;
  }
  if (allJobs.length === 0 && preflightIssue === "resume") {
    h2.textContent = "Add your resume first";
    p.textContent =
      "Open the extension popup from the toolbar and save your resume, then check again.";
    setEmptyActions([{ label: "Check again", onClick: preflight }]);
    return;
  }

  // 1b. The last run threw. Nothing loaded, so say why here rather than letting
  //     "No jobs loaded yet" imply a clean run that simply found nothing.
  if (allJobs.length === 0 && lastFetchError) {
    h2.textContent = "The run didn't finish";
    p.textContent = `${describeFetchError(lastFetchError)} No jobs were loaded.`;
    setEmptyActions([
      { label: "Try again", variant: "btn-primary", onClick: startFetch },
      { label: "Open NUWorks", onClick: openNUWorks },
    ]);
    return;
  }

  // 2. Jobs came back, but every one of them was ineligible and the default
  //    "Hide ineligible" filter swallowed the lot. Say that, don't blame filters.
  const hideDisq = $("filter-hide-disqualified").checked;
  if (
    allJobs.length > 0 &&
    hideDisq &&
    allJobs.every((j) => j.disqualified === true)
  ) {
    h2.textContent = "Nothing you're eligible for";
    p.textContent = `All ${allJobs.length} jobs were filtered out by eligibility. Uncheck 'Hide ineligible' to see them anyway.`;
    setEmptyActions([
      {
        label: "Show ineligible jobs",
        variant: "btn-primary",
        onClick: () => {
          $("filter-hide-disqualified").checked = false;
          saveExplorerPrefs();
          applyFilters();
        },
      },
    ]);
    return;
  }

  // 3. Ordinary outcomes.
  if (allJobs.length > 0) {
    h2.textContent = "No jobs match your filters";
    p.textContent = "Try adjusting your filter criteria.";
  } else {
    h2.textContent = "No jobs loaded yet";
    p.textContent =
      'Configure your search above and select "Fetch & analyze" to get started.';
  }
  setEmptyActions(null);
}

function appendJobBatch(grid) {
  const end = Math.min(displayedCount + BATCH_SIZE, filteredJobs.length);
  const fragment = document.createDocumentFragment();
  for (let i = displayedCount; i < end; i++) {
    fragment.appendChild(renderJobCard(filteredJobs[i]));
  }
  grid.appendChild(fragment);
  displayedCount = end;
}

function renderJobs(reset = true) {
  const grid = $("job-grid");
  const emptyState = $("empty-state");
  const loadMoreRow = $("load-more-row");

  // Captured before the wipe: a mid-fetch re-render must not collapse the
  // pages the reader already expanded, nor throw them back to the top.
  const prevDisplayed = displayedCount;
  const prevScroll = window.scrollY;

  if (reset) {
    grid.innerHTML = "";
    displayedCount = 0;
  }

  // Written before the empty-set early return: the stat must never survive as a
  // stale non-zero count sitting above a "No jobs match your filters" grid.
  $("stat-shown").textContent = String(filteredJobs.length);

  if (filteredJobs.length === 0) {
    refreshEmptyState();
    loadMoreRow.style.display = "none";
    return;
  }

  emptyState.style.display = "none";

  appendJobBatch(grid);

  // Re-rendering the full previously-visible set (rather than appending) is
  // deliberate: the sort can interleave a new page's high scorers anywhere.
  if (reset && prevDisplayed > BATCH_SIZE) {
    const target = Math.min(prevDisplayed, filteredJobs.length);
    while (displayedCount < target && displayedCount < filteredJobs.length) {
      appendJobBatch(grid);
    }
    window.scrollTo(0, prevScroll);
  }

  loadMoreRow.style.display = displayedCount < filteredJobs.length ? "block" : "none";
}

function updateStats() {
  const qualified = allJobs.filter((j) => !j.disqualified);
  $("stat-total").textContent = String(allJobs.length);
  $("stat-qualified").textContent = String(qualified.length);
  $("stat-high").textContent = String(qualified.filter((j) => j.matchScore >= 70).length);
  $("stat-medium").textContent = String(qualified.filter((j) => j.matchScore >= 40 && j.matchScore < 70).length);
  $("stats-row").style.display = "flex";
}

// ─── Filtering & Sorting ───

// Rebuild the work-term dropdown from the unique terms present in the fetched
// jobs, chronologically ordered, preserving the current selection. Idempotent,
// so applyFilters can call it every time the job set may have changed.
function updateWorkTermOptions() {
  const select = $("filter-work-term");
  if (!select) return;
  const current = select.value;
  const terms = [...new Set(allJobs.map(jobWorkTerm).filter(Boolean))].sort(
    compareWorkTerms
  );
  select.innerHTML = ['<option value="">All work terms</option>']
    .concat(terms.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`))
    .join("");
  // A selection that vanished with a new fetch falls back to "All work terms".
  if (terms.includes(current)) select.value = current;
}

function applyFilters() {
  updateWorkTermOptions();
  const titleQ = $("filter-title").value.toLowerCase().trim();
  const companyQ = $("filter-company").value.toLowerCase().trim();
  const skillQ = $("filter-skill").value.toLowerCase().trim();
  const minScore = parseInt($("filter-min-score").value) || 0;
  const maxScore = parseInt($("filter-max-score").value) || 100;
  const hideDisq = $("filter-hide-disqualified").checked;
  const hideExt = $("filter-hide-external").checked;
  const workTermQ = $("filter-work-term").value;
  const sortBy = $("filter-sort").value;

  filteredJobs = allJobs.filter((job) => {
    if (hideDisq && job.disqualified) return false;
    if (hideExt && job.isExternal) return false;
    if (workTermQ && jobWorkTerm(job) !== workTermQ) return false;
    const score = job.matchScore ?? 0;
    if (score < minScore || score > maxScore) return false;
    if (titleQ && !(job.job_title || "").toLowerCase().includes(titleQ)) return false;
    if (companyQ && !(job.name || "").toLowerCase().includes(companyQ)) return false;
    if (skillQ) {
      const skills = [
        ...(job.matchDetails?.matches || []),
        ...(job.matchDetails?.missing || []),
      ].map((s) => s.toLowerCase());
      if (!skills.some((s) => s.includes(skillQ))) return false;
    }
    return true;
  });

  // Sort
  filteredJobs.sort((a, b) => {
    switch (sortBy) {
      case "score-desc": return (b.matchScore ?? 0) - (a.matchScore ?? 0);
      case "score-asc": return (a.matchScore ?? 0) - (b.matchScore ?? 0);
      case "date-desc": return new Date(b.postdate || 0) - new Date(a.postdate || 0);
      // Postings with no stated deadline sort to the very end rather than
      // to the front as an Invalid Date would.
      case "deadline-asc": return new Date(a.deadline || "2999-01-01") - new Date(b.deadline || "2999-01-01");
      case "title-asc": return (a.job_title || "").localeCompare(b.job_title || "");
      case "company-asc": return (a.name || "").localeCompare(b.name || "");
      default: return 0;
    }
  });

  renderJobs(true);
  updateStats();
}

// Re-render at most once per MID_FETCH_RENDER_MS while a fetch is streaming in,
// so back-to-back short pages cannot thrash the grid.
function scheduleMidFetchRender() {
  const elapsed = Date.now() - lastMidFetchRender;
  if (elapsed >= MID_FETCH_RENDER_MS) {
    lastMidFetchRender = Date.now();
    applyFilters();
    return;
  }
  if (midFetchRenderTimer) return;
  midFetchRenderTimer = setTimeout(() => {
    midFetchRenderTimer = null;
    lastMidFetchRender = Date.now();
    applyFilters();
  }, MID_FETCH_RENDER_MS - elapsed);
}

// ─── Presets ───
// These only write values into the existing inputs — no new filtering logic and
// no new state, so every preset is expressible by hand.
function applyPreset(name) {
  switch (name) {
    case "best-bets":
      $("filter-min-score").value = "70";
      $("filter-hide-disqualified").checked = true;
      $("filter-hide-external").checked = true;
      $("filter-sort").value = "score-desc";
      break;
    case "closing-soon":
      $("filter-sort").value = "deadline-asc";
      $("filter-min-score").value = "40";
      $("filter-hide-disqualified").checked = true;
      break;
    case "newest":
      $("filter-sort").value = "date-desc";
      $("filter-min-score").value = "";
      break;
    case "reset":
      $("filter-title").value = "";
      $("filter-company").value = "";
      $("filter-skill").value = "";
      $("filter-min-score").value = "0";
      $("filter-max-score").value = "100";
      $("filter-work-term").value = "";
      $("filter-sort").value = "score-desc";
      $("filter-hide-disqualified").checked = true;
      $("filter-hide-external").checked = false;
      break;
    default:
      return;
  }
  saveExplorerPrefs();
  applyFilters();
}

// ─── Persisted control state ───
const PREFS_KEY = "explorerPrefs";
const PREF_VALUE_IDS = [
  "ctl-max-jobs",
  "ctl-job-type",
  "ctl-postdate",
  "ctl-qualification",
  "filter-title",
  "filter-company",
  "filter-skill",
  "filter-min-score",
  "filter-max-score",
  "filter-sort",
];
const PREF_CHECK_IDS = ["filter-hide-disqualified", "filter-hide-external"];

function saveExplorerPrefs() {
  const prefs = {};
  PREF_VALUE_IDS.forEach((id) => {
    const el = $(id);
    if (el) prefs[id] = el.value;
  });
  PREF_CHECK_IDS.forEach((id) => {
    const el = $(id);
    if (el) prefs[id] = el.checked;
  });
  try {
    chrome.storage.local.set({ [PREFS_KEY]: prefs });
  } catch {
    /* storage unavailable — prefs are a convenience, never a dependency */
  }
}

function restoreExplorerPrefs() {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    try {
      chrome.storage.local.get([PREFS_KEY], (result) => {
        const prefs = result && result[PREFS_KEY];
        if (prefs && typeof prefs === "object") {
          PREF_VALUE_IDS.forEach((id) => {
            const el = $(id);
            const stored = prefs[id];
            if (!el || stored === undefined || stored === null) return;
            const value = String(stored);
            // A stale stored value must never leave a <select> blank.
            if (
              el.tagName === "SELECT" &&
              !Array.from(el.options).some((o) => o.value === value)
            ) {
              return;
            }
            el.value = value;
          });
          PREF_CHECK_IDS.forEach((id) => {
            const el = $(id);
            if (el && typeof prefs[id] === "boolean") el.checked = prefs[id];
          });
        }
        done();
      });
    } catch {
      done();
    }
  });
}

// ─── Preflight ───
function openNUWorks() {
  chrome.tabs.create({ url: `${BASE_URL}/students/app/jobs/search` });
}

// Check the two things a run actually needs BEFORE the user commits to it, and
// say so persistently. The guards inside startFetch stay as a backstop, but a
// toast that vanishes in five seconds is not an answer to a blocked tool.
async function preflight() {
  const creds = await getCredentials();
  const btnFetch = $("btn-fetch");

  if (!creds.cookie || !creds.authorization) {
    preflightIssue = "credentials";
  } else if (!creds.resume) {
    preflightIssue = "resume";
  } else {
    preflightIssue = null;
  }

  // A run in flight owns the button's disabled/label state — never fight it.
  if (!isFetching) {
    if (preflightIssue === "credentials") {
      btnFetch.disabled = true;
      btnFetch.title =
        "Connect to NUWorks first — open NUWorks in a tab so the extension can pick up your session.";
    } else if (preflightIssue === "resume") {
      btnFetch.disabled = true;
      btnFetch.title =
        "Add your resume first — open the extension popup from the toolbar and save it.";
    } else {
      btnFetch.disabled = false;
      btnFetch.removeAttribute("title");
    }
  }

  if (filteredJobs.length === 0) refreshEmptyState();
  return preflightIssue === null;
}

// ─── Main Fetch Logic ───
async function startFetch() {
  if (isFetching) return;

  const creds = await getCredentials();
  if (!creds.cookie || !creds.authorization) {
    showToast("Missing credentials. Open NUWorks and browse a page first.", 5000);
    return;
  }
  if (!creds.resume) {
    showToast("No resume saved. Open the extension popup and save your resume first.", 5000);
    return;
  }

  saveExplorerPrefs();

  isFetching = true;
  shouldStop = false;
  allJobs = [];
  filteredJobs = [];
  displayedCount = 0;
  lastMidFetchRender = 0;
  clearTimeout(midFetchRenderTimer);
  midFetchRenderTimer = null;
  clearTimeout(progressResetTimer);
  $("job-grid").innerHTML = "";
  $("empty-state").style.display = "none";

  const maxJobs = parseInt($("ctl-max-jobs").value) || 10000;
  const perPage = Math.min(maxJobs, 500);
  const maxPages = Math.ceil(maxJobs / perPage);

  const params = {
    perPage: String(perPage),
    sort: "!postdate",
    job_type: $("ctl-job-type").value,
    postdate: $("ctl-postdate").value,
    json_mode: "read_only",
    exclude_applied_jobs: $("ctl-exclude-applied").checked ? "1" : "0",
    enable_translation: "False",
  };
  const qualVal = $("ctl-qualification").value;
  if (qualVal) params.ocr = qualVal;

  // UI
  $("btn-fetch").disabled = true;
  $("btn-fetch").innerHTML = `<span class="spinner"></span> Fetching...`;
  $("btn-stop").style.display = "inline-flex";
  $("progress-container").classList.add("active");
  $("filters-panel").classList.add("active");
  $("progress-bar").style.width = "0%";
  $("progress-status").innerHTML = `<span class="spinner"></span> Fetching jobs...`;
  $("progress-count").textContent = "";

  const matcher = new JobMatcher();
  let totalFetched = 0;
  let fetchError = null;
  // Symplicity's `page` param is 1-based — page=0 returns page 1 again, so a
  // 0-based loop fetched, scored and rendered the whole first page twice.
  const seenJobIds = new Set();

  try {
    for (let page = 1; page <= maxPages && !shouldStop; page++) {
      $("progress-status").innerHTML = `<span class="spinner"></span> Fetching batch ${page}...`;
      const jobs = await fetchJobPage(params, creds, page);

      if (!jobs || jobs.length === 0) break;

      // The !postdate sort can shift a boundary job onto two consecutive
      // pages mid-run; drop anything already fetched so no job is ever
      // analyzed or rendered twice.
      const newJobs = jobs.filter((job) => {
        const id = job.job_id || job.id;
        if (!id) return true;
        if (seenJobIds.has(id)) return false;
        seenJobIds.add(id);
        return true;
      });

      totalFetched += newJobs.length;
      $("progress-count").textContent = `${totalFetched} fetched`;
      $("progress-bar").style.width = `${Math.min((totalFetched / maxJobs) * 100, 95)}%`;

      $("progress-status").innerHTML = `<span class="spinner"></span> Analyzing batch ${page} (${newJobs.length} jobs)...`;
      const scoredBatch = await scoreBatch(newJobs, matcher, creds);
      allJobs.push(...scoredBatch);

      scheduleMidFetchRender();

      if (jobs.length < perPage) break; // No more results
    }
  } catch (err) {
    console.error("Fetch error:", err);
    fetchError = err;
    showToast(`Error: ${err.message}`, 5000);
  }

  // Done
  isFetching = false;
  $("btn-fetch").disabled = false;
  $("btn-fetch").innerHTML = "Fetch &amp; analyze";
  $("btn-stop").style.display = "none";
  if (fetchError) {
    // A run that threw must not read as a clean finish. Report it on the
    // progress line (which outlives the 5s toast) and leave the bar where it
    // stopped rather than falsely filling it to 100%.
    $("progress-status").textContent = `Couldn't finish — ${fetchError.message}`;
  } else {
    $("progress-status").innerHTML = shouldStop ? "Stopped" : "Done!";
    $("progress-bar").style.width = "100%";
  }

  // A throttled render may still be pending; the final one below supersedes it.
  clearTimeout(midFetchRenderTimer);
  midFetchRenderTimer = null;

  // Render whatever completed before the throw, but don't claim success.
  applyFilters();
  if (!fetchError) {
    showToast(`Fetched & analyzed ${allJobs.length} jobs`);
  }

  // Re-check: a session can expire mid-run, and the button was just re-enabled
  // unconditionally above.
  preflight();

  // On a clean finish, retire the bar rather than leaving it pinned at 100%
  // "Done!" forever — a permanently visible progress bar reads as a hung job.
  // On error, leave the failure message on screen so it isn't swept away. The
  // filters panel deliberately stays open either way.
  clearTimeout(progressResetTimer);
  if (!fetchError) {
    progressResetTimer = setTimeout(() => {
      if (!isFetching) $("progress-container").classList.remove("active");
    }, 2000);
  }
}

// Fields that usually only exist on the per-job detail response, worth carrying
// onto the scored record so the card, the work-term filter and the modal can
// use them without a second fetch.
const DETAIL_CARRY_FIELDS = [
  "el_work_term",
  "screen_applicant_type",
  "workplace_type",
  "hours_per_week2",
  "job_length_ms",
  "num_openings",
  "start_date_nu",
  "screen_gpa",
  "screen_degree_level",
  "screen_class_level",
  "screen_major",
  "desired_experience_level",
  "job_function2",
  "symp_remote_onsite",
  "application_deadline",
];

async function scoreBatch(jobs, matcher, creds) {
  const schoolYear = creds.schoolYear;
  const gradDate = creds.gradDate;
  const gradeIneligible = !!creds.gradeIneligible;

  // Enrich the resume with the student's authoritative declared skills (pulled
  // from their NUWorks profile). This sharpens matching beyond the PDF text.
  const resumeText = [creds.resume, creds.profileSkills]
    .filter(Boolean)
    .join("\n");

  // One batched, authoritative eligibility check for the whole page. Lets us
  // skip the per-job description fetch for every ineligible listing.
  let qualifiedMap = {};
  if (resumeText) {
    const ids = jobs.map((j) => j.job_id).filter(Boolean);
    qualifiedMap = await fetchQualifiedStatus(ids, creds);
  }

  // Process in mini-batches to avoid blocking UI
  const CONCURRENCY = 10;
  const results = [];

  for (let i = 0; i < jobs.length; i += CONCURRENCY) {
    if (shouldStop) break;

    const chunk = jobs.slice(i, i + CONCURRENCY);
    const chunkResults = await Promise.all(
      chunk.map(async (job) => {
        const serverQual = qualifiedMap[job.job_id]; // true / false / undefined

        // Server says ineligible → badge it without fetching the description.
        // With "Grade ineligible jobs" on we fall through instead, because the
        // description is needed to compute the match %.
        if (resumeText && serverQual === false && !gradeIneligible) {
          return {
            ...job,
            isExternal: false,
            disqualified: true,
            eligibility: { qualified: false, reason: "server", evidence: null },
            matchScore: 0,
            matchDetails: { matches: [], missing: [] },
          };
        }

        let desc = job.job_desc || "";
        let title = job.job_title || "";
        let contactBlurb = job.contact_blurb || "";
        const detailExtras = {};

        // Fetch the full record when the list payload is missing either the
        // description or the detail-only fields (el_work_term etc.) — the list
        // endpoint includes descriptions but not the co-op term, so without
        // this the work-term filter would have nothing to offer.
        const needsDetail = !desc || job.el_work_term === undefined;
        if (needsDetail && job.job_id) {
          try {
            const full = await fetchJobDescription(job.job_id, creds);
            if (full) {
              desc = desc || full.job_desc || "";
              title = title || full.job_title || "";
              contactBlurb = contactBlurb || full.contact_blurb || "";
              DETAIL_CARRY_FIELDS.forEach((f) => {
                if (job[f] === undefined || job[f] === null) {
                  detailExtras[f] = full[f];
                }
              });
            }
          } catch (e) {
            // Skip
          }
        }

        const fullText = `${title}\n${desc}`;
        const external = isExternalApplication(desc, contactBlurb);

        let matchResult = null;
        let disqualified = false;
        let eligibility = null;

        if (resumeText) {
          // Trust the server verdict; fall back to the local gate only when
          // unknown. checkEligibility carries the reason + the phrase that
          // triggered it, which the modal renders.
          if (serverQual === true) {
            eligibility = { qualified: true, reason: null, evidence: null };
          } else if (serverQual === false) {
            eligibility = { qualified: false, reason: "server", evidence: null };
          } else if (typeof matcher.checkEligibility === "function") {
            eligibility = await matcher.checkEligibility(
              fullText,
              schoolYear,
              gradDate
            );
          } else {
            eligibility = {
              qualified: await matcher.isQualified(fullText, schoolYear, gradDate),
              reason: null,
              evidence: null,
            };
          }

          if (eligibility.qualified) {
            matchResult = matcher.calculateScore(resumeText, fullText);
          } else {
            disqualified = true;
            // "Grade ineligible jobs": score it anyway so the card can show
            // the match % next to the Ineligible badge.
            if (gradeIneligible) {
              matchResult = matcher.calculateScore(resumeText, fullText);
            }
          }
        }

        return {
          ...job,
          ...detailExtras,
          job_desc: desc,
          contact_blurb: contactBlurb,
          isExternal: external,
          disqualified,
          // Distinguishes "scored despite being ineligible" from the plain
          // ineligible record whose 0 score is a placeholder, not a grade.
          gradedIneligible: disqualified && !!matchResult,
          eligibility,
          matchScore: matchResult ? matchResult.score : 0,
          matchDetails: matchResult || { matches: [], missing: [] },
        };
      })
    );

    results.push(...chunkResults);
  }

  return results;
}

// ─── Profile Auto-Seed ───
// Pull the student's real grad date / class year / declared skills straight
// from NUWorks so they don't have to be entered by hand. Best-effort.
async function seedProfileFromNUWorks() {
  try {
    const creds = await getCredentials();
    if (!creds.cookie || !creds.authorization) return;

    const user = await fetchCurrentUser(creds);
    if (!user || !user.id) return;
    const profile = await fetchStudentProfile(user.id, creds);
    if (!profile) return;

    const updates = {};
    if (!creds.gradDate && profile.graduation_date) {
      const m = String(profile.graduation_date).match(/^(\d{4})-(\d{2})/);
      if (m) updates.gradDate = `${m[1]}-${m[2]}`;
    }
    if (!creds.schoolYear && profile.year && profile.year._label) {
      updates.schoolYear = profile.year._label;
    }
    if (Array.isArray(profile.skills) && profile.skills.length) {
      const names = profile.skills
        .map((s) => s.skill_name || s._label)
        .filter(Boolean);
      if (names.length) updates.profileSkills = names.join(", ");
    }

    if (Object.keys(updates).length) {
      chrome.storage.local.set(updates);
      console.log("NUWorks: seeded profile from server", updates);
    }
  } catch {
    /* best-effort */
  }
}

// ─── Event Listeners ───
document.addEventListener("DOMContentLoaded", async () => {
  // Theme: OS preference by default, overridable via the sun/moon toggle, and
  // shared with the popup through chrome.storage.local.
  setupThemeToggle($("theme-toggle"));

  seedProfileFromNUWorks();
  $("btn-fetch").addEventListener("click", startFetch);
  $("btn-stop").addEventListener("click", () => { shouldStop = true; });

  // Modal close handlers
  $("modal-close").addEventListener("click", closeModal);
  $("modal-overlay").addEventListener("click", (e) => {
    if (e.target === $("modal-overlay")) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });

  $("btn-open-nuworks").addEventListener("click", openNUWorks);

  $("btn-load-more").addEventListener("click", () => {
    renderJobs(false);
  });

  // Preset chips — one delegated listener over the whole row.
  $("filter-presets").addEventListener("click", (e) => {
    const chip = e.target.closest(".preset-chip");
    if (chip) applyPreset(chip.dataset.preset);
  });

  // Filters — debounced
  let filterTimeout;
  const debouncedFilter = () => {
    clearTimeout(filterTimeout);
    filterTimeout = setTimeout(() => {
      saveExplorerPrefs();
      applyFilters();
    }, 200);
  };
  const onFilterChange = () => {
    saveExplorerPrefs();
    applyFilters();
  };

  $("filter-title").addEventListener("input", debouncedFilter);
  $("filter-company").addEventListener("input", debouncedFilter);
  $("filter-skill").addEventListener("input", debouncedFilter);
  $("filter-min-score").addEventListener("input", debouncedFilter);
  $("filter-max-score").addEventListener("input", debouncedFilter);
  $("filter-work-term").addEventListener("change", onFilterChange);
  $("filter-sort").addEventListener("change", onFilterChange);
  $("filter-hide-disqualified").addEventListener("change", onFilterChange);
  $("filter-hide-external").addEventListener("change", onFilterChange);

  // Save all filtered
  $("btn-save-all-filtered").addEventListener("click", async () => {
    const btn = $("btn-save-all-filtered");
    const toSave = filteredJobs.filter((j) => !j.disqualified);
    if (toSave.length === 0) {
      showToast("No qualified jobs to save");
      return;
    }

    btn.disabled = true;
    btn.textContent = `Saving ${toSave.length}...`;

    const creds = await getCredentials();
    let success = 0;

    // Save in chunks to avoid rate limiting
    for (let i = 0; i < toSave.length; i += 5) {
      const chunk = toSave.slice(i, i + 5);
      const results = await Promise.all(chunk.map((j) => favoriteJob(j.job_id, creds)));
      success += results.filter(Boolean).length;
      btn.textContent = `Saving... ${success}/${toSave.length}`;
    }

    btn.textContent = `Saved ${success} jobs`;
    btn.disabled = false;
    showToast(`Saved ${success}/${toSave.length} jobs`);
    setTimeout(() => { btn.textContent = "Save all filtered"; }, 3000);
  });

  // Controls and filters come back exactly as they were left, before anything
  // reads them — so before the first applyFilters and before preflight.
  await restoreExplorerPrefs();
  await preflight();
});
