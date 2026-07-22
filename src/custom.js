import JobMatcher from "./matcher.js";

// ─── State ───
let allJobs = []; // All fetched + scored jobs
let filteredJobs = []; // After filters applied
let displayedCount = 0;
const BATCH_SIZE = 60; // Jobs rendered per "page"
let isFetching = false;
let shouldStop = false;

// ─── Helpers ───
const BASE_URL = "https://northeastern-csm.symplicity.com";

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
  setTimeout(() => el.classList.remove("show"), duration);
}

// ─── Modal ───
function openModal(jobId) {
  const overlay = $("modal-overlay");
  const content = $("modal-content");
  content.innerHTML = `<div class="modal-loading"><span class="spinner spinner-lg"></span>Loading job details...</div>`;
  overlay.classList.add("open");
  document.body.style.overflow = "hidden";

  (async () => {
    try {
      const creds = await getCredentials();
      const job = await fetchJobDetail(jobId, creds);
      content.innerHTML = renderModalContent(job);
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

function renderModalContent(job) {
  const emp = job.job_emp || {};
  const profile = job.employer_profile || emp.employer_profile || {};
  const logo = job.employer_logo || "";
  const companyName = job.employer_name || emp.name || emp._label || "Unknown";
  const website = profile.website || "";
  const overview = profile.overview || "";
  const industry = (profile.industry || []).map((i) => i._label).join(", ");
  const employeeCount = profile.csm_number_of_employees?._label || "";
  const orgType = profile.csm_organization_type?._label || "";

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

  // Qualifications fields
  const majors = (job.major || []).map((m) => m._label).filter(Boolean).join(", ");
  const classLevels = (job.class_level || []).map((c) => c._label).filter(Boolean).join(", ");
  const degreeLevels = (job.degree_level || []).map((d) => d._label).filter(Boolean).join(", ");
  const workAuth = (job.work_authorization || []).map((w) => w._label).filter(Boolean).join(", ");
  const gpa = job.gpa && job.gpa !== "0" ? job.gpa : "";

  // Status tags
  let statusTags = "";
  if (job.favorite) statusTags += `<span class="modal-tag green">Saved</span>`;
  if (job.applied) statusTags += `<span class="modal-tag green">Applied</span>`;
  if (job.expired) statusTags += `<span class="modal-tag" style="color:var(--red);border-color:rgba(239,68,68,0.25)">Expired</span>`;
  if (remote) statusTags += `<span class="modal-tag">${remote}</span>`;
  if (jobTypes) statusTags += `<span class="modal-tag">${jobTypes}</span>`;
  if (compensation) statusTags += `<span class="modal-tag accent">${compensation}</span>`;
  if (locations) statusTags += `<span class="modal-tag">${locations}</span>`;

  // Info grid items
  let infoItems = "";
  const addInfo = (label, value) => {
    if (value) infoItems += `<div class="modal-info-item"><div class="modal-info-label">${label}</div><div class="modal-info-value">${value}</div></div>`;
  };
  addInfo("Posted", posted);
  addInfo("Posting Ends", endDate);
  if (deadline) addInfo("Deadline", deadline);
  if (startDate) addInfo("Start Date", startDate);
  if (industry) addInfo("Industry", industry);
  if (orgType) addInfo("Company Type", orgType);
  if (employeeCount) addInfo("Employees", employeeCount);
  if (gpa) addInfo("Min GPA", gpa);
  if (classLevels) addInfo("Class Level", classLevels);
  if (degreeLevels) addInfo("Degree Level", degreeLevels);
  if (majors) addInfo("Majors", majors);
  if (workAuth) addInfo("Work Authorization", workAuth);

  const nuworksUrl = `${BASE_URL}/students/app/jobs/detail/${job.job_id}`;

  return `
    <div class="modal-banner"></div>
    <div class="modal-body">
      <div class="modal-header-row">
        ${logo ? `<img class="modal-logo" src="${logo}" onerror="this.style.display='none'" />` : ""}
        <div class="modal-title-group">
          <div class="modal-title">${job.job_title || "Untitled"}</div>
          <div class="modal-company">
            ${website ? `<a href="${website}" target="_blank">${companyName}</a>` : companyName}
            ${job.visual_id ? `<span style="color:var(--text-muted);font-size:0.65rem;margin-left:8px;font-family:var(--font-mono);letter-spacing:1px">#${job.visual_id}</span>` : ""}
          </div>
        </div>
      </div>

      <div class="modal-meta">${statusTags}</div>

      ${infoItems ? `<div class="modal-section"><div class="modal-section-title">Details</div><div class="modal-info-grid">${infoItems}</div></div>` : ""}

      ${skills.length ? `
        <div class="modal-section">
          <div class="modal-section-title">Skills</div>
          <div class="modal-skills">${skills.map((s) => `<span class="modal-skill">${s}</span>`).join("")}</div>
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
        <button class="btn btn-primary" id="modal-save-btn" data-id="${job.job_id}">${job.favorite ? "Saved" : "Save Job"}</button>
        <a href="${nuworksUrl}" target="_blank" class="btn btn-secondary">Open in NUWorks</a>
        ${applyUrl ? `<a href="${applyUrl}" target="_blank" class="btn btn-secondary">Apply Externally</a>` : ""}
      </div>
    </div>
  `;
}

function wireModalActions(job, creds) {
  const saveBtn = document.getElementById("modal-save-btn");
  if (saveBtn && !job.favorite) {
    saveBtn.addEventListener("click", async () => {
      saveBtn.disabled = true;
      saveBtn.textContent = "Saving...";
      const ok = await favoriteJob(job.job_id, creds);
      if (ok) {
        saveBtn.textContent = "Saved!";
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

// ─── Render Jobs ───
function renderJobCard(job) {
  const card = document.createElement("div");
  card.className = "job-card";

  const score = job.matchScore ?? 0;
  let tierClass = "score-low";
  let barColor = "var(--red)";
  if (score >= 70) { tierClass = "score-high"; barColor = "var(--green)"; }
  else if (score >= 40) { tierClass = "score-medium"; barColor = "var(--yellow)"; }

  const jobUrl = `${BASE_URL}/students/app/jobs/detail/${job.job_id}`;

  let badges = "";
  if (job.isExternal) badges += `<span class="external-badge">External</span> `;
  if (job.disqualified) badges += `<span class="disqualified-badge">Ineligible</span> `;

  const matchedSkills = (job.matchDetails?.matches || []).slice(0, 5);
  const missingSkills = (job.matchDetails?.missing || []).slice(0, 3);

  let skillsHtml = "";
  if (matchedSkills.length || missingSkills.length) {
    skillsHtml = `<div class="skill-tags">`;
    matchedSkills.forEach((s) => { skillsHtml += `<span class="skill-tag matched">${s}</span>`; });
    missingSkills.forEach((s) => { skillsHtml += `<span class="skill-tag missing">${s}</span>`; });
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

  card.innerHTML = `
    <div class="job-card-header">
      <div>
        <div class="job-card-title">${job.job_title || "Untitled"}</div>
        <div class="job-card-company">${job.name || "Unknown Employer"}</div>
      </div>
      ${!job.disqualified ? `<span class="score-pill ${tierClass}">${score}%</span>` : `<span class="disqualified-badge">Ineligible</span>`}
    </div>
    <div class="card-score-bar"><div class="card-score-fill" style="width:${score}%;background:${barColor}"></div></div>
    <div class="job-card-meta">
      ${badges}
      ${compensation ? `<span title="Compensation">💰 ${compensation}</span>` : ""}
      ${remote ? `<span title="Work mode">📍 ${remote}</span>` : ""}
      ${postDate ? `<span title="Posted">🗓 ${postDate}</span>` : ""}
      ${deadline ? `<span title="Deadline">⏳ ${deadline}</span>` : ""}
      ${jobType ? `<span>${jobType}</span>` : ""}
      ${location ? `<span>${location}</span>` : ""}
    </div>
    ${skillsHtml}
    <div class="job-card-actions">
      <button class="btn btn-secondary btn-sm btn-save" data-id="${job.job_id}">Save</button>
    </div>
  `;

  // Wire card click to open modal
  card.style.cursor = "pointer";
  card.addEventListener("click", (e) => {
    // Don't open modal if clicking a button or link
    if (e.target.closest("button") || e.target.closest("a")) return;
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
      saveBtn.textContent = "Saved!";
      saveBtn.className = "btn btn-success btn-sm";
    } else {
      saveBtn.textContent = "Error";
      saveBtn.disabled = false;
    }
  });

  return card;
}

function renderJobs(reset = true) {
  const grid = $("job-grid");
  const emptyState = $("empty-state");
  const loadMoreRow = $("load-more-row");

  if (reset) {
    grid.innerHTML = "";
    displayedCount = 0;
  }

  if (filteredJobs.length === 0) {
    emptyState.style.display = "block";
    emptyState.querySelector("h2").textContent = allJobs.length > 0 ? "No jobs match your filters" : "No jobs loaded yet";
    emptyState.querySelector("p").textContent = allJobs.length > 0 ? "Try adjusting your filter criteria." : 'Configure your search above and click "Fetch & Analyze" to get started.';
    loadMoreRow.style.display = "none";
    return;
  }

  emptyState.style.display = "none";

  const end = Math.min(displayedCount + BATCH_SIZE, filteredJobs.length);
  const fragment = document.createDocumentFragment();
  for (let i = displayedCount; i < end; i++) {
    fragment.appendChild(renderJobCard(filteredJobs[i]));
  }
  grid.appendChild(fragment);
  displayedCount = end;

  loadMoreRow.style.display = displayedCount < filteredJobs.length ? "block" : "none";

  // Update stats
  $("stat-shown").textContent = String(filteredJobs.length);
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
function applyFilters() {
  const titleQ = $("filter-title").value.toLowerCase().trim();
  const companyQ = $("filter-company").value.toLowerCase().trim();
  const skillQ = $("filter-skill").value.toLowerCase().trim();
  const minScore = parseInt($("filter-min-score").value) || 0;
  const maxScore = parseInt($("filter-max-score").value) || 100;
  const hideDisq = $("filter-hide-disqualified").checked;
  const hideExt = $("filter-hide-external").checked;
  const sortBy = $("filter-sort").value;

  filteredJobs = allJobs.filter((job) => {
    if (hideDisq && job.disqualified) return false;
    if (hideExt && job.isExternal) return false;
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
      case "title-asc": return (a.job_title || "").localeCompare(b.job_title || "");
      case "company-asc": return (a.name || "").localeCompare(b.name || "");
      default: return 0;
    }
  });

  renderJobs(true);
  updateStats();
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

  isFetching = true;
  shouldStop = false;
  allJobs = [];
  filteredJobs = [];
  displayedCount = 0;
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

  try {
    for (let page = 0; page < maxPages && !shouldStop; page++) {
      $("progress-status").innerHTML = `<span class="spinner"></span> Fetching batch ${page + 1}...`;
      const jobs = await fetchJobPage(params, creds, page);

      if (!jobs || jobs.length === 0) break;

      totalFetched += jobs.length;
      $("progress-count").textContent = `${totalFetched} fetched`;
      $("progress-bar").style.width = `${Math.min((totalFetched / maxJobs) * 100, 95)}%`;

      $("progress-status").innerHTML = `<span class="spinner"></span> Analyzing batch ${page + 1} (${jobs.length} jobs)...`;
      const scoredBatch = await scoreBatch(jobs, matcher, creds);
      allJobs.push(...scoredBatch);

      applyFilters();

      if (jobs.length < perPage) break; // No more results
    }
  } catch (err) {
    console.error("Fetch error:", err);
    showToast(`Error: ${err.message}`, 5000);
  }

  // Done
  isFetching = false;
  $("btn-fetch").disabled = false;
  $("btn-fetch").innerHTML = "Fetch &amp; Analyze";
  $("btn-stop").style.display = "none";
  $("progress-status").innerHTML = shouldStop ? "Stopped" : "Done!";
  $("progress-bar").style.width = "100%";

  applyFilters();
  showToast(`Fetched & analyzed ${allJobs.length} jobs`);
}

async function scoreBatch(jobs, matcher, creds) {
  const schoolYear = creds.schoolYear;
  const gradDate = creds.gradDate;

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
        if (resumeText && serverQual === false) {
          return {
            ...job,
            isExternal: false,
            disqualified: true,
            matchScore: 0,
            matchDetails: { matches: [], missing: [] },
          };
        }

        let desc = job.job_desc || "";
        let title = job.job_title || "";
        let contactBlurb = job.contact_blurb || "";

        // If no description, try to fetch it
        if (!desc && job.job_id) {
          try {
            const full = await fetchJobDescription(job.job_id, creds);
            if (full) {
              desc = full.job_desc || "";
              title = full.job_title || title;
              contactBlurb = full.contact_blurb || "";
            }
          } catch (e) {
            // Skip
          }
        }

        const fullText = `${title}\n${desc}`;
        const external = isExternalApplication(desc, contactBlurb);

        let matchResult = null;
        let disqualified = false;

        if (resumeText) {
          // Trust the server verdict; fall back to regex only when unknown.
          const qualified =
            serverQual === true
              ? true
              : await matcher.isQualified(fullText, schoolYear, gradDate);
          if (qualified) {
            matchResult = matcher.calculateScore(resumeText, fullText);
          } else {
            disqualified = true;
          }
        }

        return {
          ...job,
          job_desc: desc,
          contact_blurb: contactBlurb,
          isExternal: external,
          disqualified,
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
document.addEventListener("DOMContentLoaded", () => {
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

  $("btn-open-nuworks").addEventListener("click", () => {
    chrome.tabs.create({ url: `${BASE_URL}/students/app/jobs/search` });
  });

  $("btn-load-more").addEventListener("click", () => {
    renderJobs(false);
  });

  // Filters — debounced
  let filterTimeout;
  const debouncedFilter = () => {
    clearTimeout(filterTimeout);
    filterTimeout = setTimeout(applyFilters, 200);
  };

  $("filter-title").addEventListener("input", debouncedFilter);
  $("filter-company").addEventListener("input", debouncedFilter);
  $("filter-skill").addEventListener("input", debouncedFilter);
  $("filter-min-score").addEventListener("input", debouncedFilter);
  $("filter-max-score").addEventListener("input", debouncedFilter);
  $("filter-sort").addEventListener("change", applyFilters);
  $("filter-hide-disqualified").addEventListener("change", applyFilters);
  $("filter-hide-external").addEventListener("change", applyFilters);

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
    setTimeout(() => { btn.textContent = "Save All Filtered"; }, 3000);
  });
});
