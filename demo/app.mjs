import { jobs, profiles } from "./data.mjs";
import { matcher, rankJobs, filterJobs, toggleComparison, shortlistCsv } from "./model.mjs";

const $ = (id) => document.getElementById(id);
const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const state = { profile: profiles[0], ranked: [], saved: [], compare: [], savedOnly: false };
const tag = (text, type = "") => `<span class="tag ${type}">${escape(text)}</span>`;
const tags = (values, type = "", empty = "None identified") => values.length ? values.map((value) => tag(value, type)).join("") : `<span class="muted">${empty}</span>`;
const score = (job) => `<div class="score-row"><span class="score-number">${job.result.score}<small> /100</small></span><div class="score-label">Lexical match score<div class="score-track" aria-hidden="true"><div class="score-fill" style="width:${job.result.score}%"></div></div></div></div>`;
const company = (job) => `<div class="company"><span class="company-mark" aria-hidden="true">${escape(job.initials)}</span><span>${escape(job.company)}</span></div>`;
const metadata = (job) => `<div class="job-meta"><span>${escape(job.location)}</span><span>${escape(job.workstyle)}</span><span>$${job.hourly}/hr · sample</span></div>`;
function announce(message) { $("announcement").textContent = message; }

function card(job) {
  const saved = state.saved.includes(job.id);
  const compared = state.compare.includes(job.id);
  const matches = job.direct.slice(0, 3);
  const gap = (job.result.details.missingRequired || [])[0] || job.missing[0];
  return `<article class="job-card" data-id="${job.id}" data-selected="${compared}" aria-labelledby="title-${job.id}">
    <div class="card-top">${company(job)}<button type="button" class="save-button" data-action="save" data-id="${job.id}" aria-pressed="${saved}" aria-label="${saved ? "Remove" : "Save"} ${escape(job.title)} ${saved ? "from" : "to"} shortlist">${saved ? "Saved ✓" : "+ Save"}</button></div>
    <h3 id="title-${job.id}">${escape(job.title)}</h3>${metadata(job)}<p class="job-summary">${escape(job.summary)}</p>${score(job)}
    <p class="skills-caption">${matches.length ? "Evidence in the sample résumé" : "No direct hard-skill overlap found"}</p><div class="tags">${tags(matches, "matched", "Review this role’s requirements")}${job.direct.length > 3 ? tag(`+${job.direct.length - 3} more`) : ""}</div>
    <p class="skills-caption">${gap ? `Worth reviewing: ${escape(gap)}` : "All recognized hard skills have supporting evidence"}</p>
    <div class="card-bottom"><label class="compare-label"><input type="checkbox" data-action="compare" data-id="${job.id}" ${compared ? "checked" : ""} aria-label="Compare ${escape(job.title)}"> Compare</label><button type="button" class="details-button" data-action="details" data-id="${job.id}" aria-label="Why this match: ${escape(job.title)}">Why this match <span aria-hidden="true">↗</span></button></div></article>`;
}

function renderJobs() {
  const active = document.activeElement;
  const focusAction = active?.dataset.action;
  const focusId = active?.dataset.id;
  const hasResume = $("resume").value.trim().length > 0;
  const visible = hasResume ? filterJobs(state.ranked, { query: $("search").value, track: document.querySelector('[name="track"]:checked').value, workstyle: $("workstyle").value, minimum: Number($("minimum").value), savedOnly: state.savedOnly, saved: state.saved, sort: $("sort").value }) : [];
  $("result-count").textContent = `${visible.length} of ${jobs.length} fictional roles${state.savedOnly ? " · shortlist" : ""}`;
  $("saved-count").textContent = state.saved.length;
  $("saved-only").setAttribute("aria-pressed", String(state.savedOnly));
  $("export").disabled = state.saved.length === 0 || !hasResume;
  $("minimum-value").value = $("minimum").value;
  $("job-list").innerHTML = visible.length ? visible.map(card).join("") : `<div class="empty-state"><h3>${!hasResume ? "Start with a little context." : state.savedOnly && !state.saved.length ? "Make room for the good fits." : "No roles in this view."}</h3><p>${!hasResume ? "Choose a sample résumé or add text in the editor to calculate matches." : state.savedOnly && !state.saved.length ? "Save a role as you explore. Your shortlist stays here until you reload this page." : "Try another field, a lower minimum score, or clear your search to see more of the fictional dataset."}</p><button class="button secondary" type="button" data-action="reset">${!hasResume ? "Restore sample résumé" : "Show all roles"}</button></div>`;
  $("compare-tray").hidden = state.compare.length === 0;
  $("compare-count").textContent = `${state.compare.length} role${state.compare.length === 1 ? "" : "s"} selected`;
  $("open-compare").disabled = state.compare.length < 2 || !hasResume;
  if (focusAction && focusId) document.querySelector(`#job-list [data-action="${focusAction}"][data-id="${focusId}"]`)?.focus({ preventScroll: true });
}

function recalculate() {
  const text = $("resume").value;
  state.ranked = rankJobs(jobs, text);
  const skills = [...matcher.analyzeResume(text).allSkills].sort();
  $("skill-count").textContent = skills.length;
  $("resume-skills").innerHTML = tags(skills, "", "Add sample text to see recognized skills.");
  $("profile-focus").textContent = text === state.profile.text ? state.profile.focus : "Your edited sample";
  renderJobs();
}

function resetFilters() {
  $("search").value = ""; $("workstyle").value = "All"; $("minimum").value = "0"; $("sort").value = "match";
  document.querySelector('[name="track"][value="All"]').checked = true;
  state.savedOnly = false;
  renderJobs();
}

function showDialog(id) {
  $(id).showModal();
  document.body.style.overflow = "hidden";
  $(id).querySelector("[data-close]").focus();
}

function detail(job) {
  const details = job.result.details;
  const hardWeight = details.hardSkillsFound > 3 ? 75 : details.hardSkillsFound ? 65 : 0;
  const requiredMissing = details.missingRequired || [];
  const otherMissing = job.missing.filter((skill) => !requiredMissing.includes(skill));
  $("detail-content").innerHTML = `<div class="detail-header">${company(job)}<h2 id="detail-title">${escape(job.title)}</h2>${metadata(job)}<p class="muted">${escape(job.term)} · fictional opening</p></div>
    <div class="detail-score"><div class="detail-score-number">${job.result.score}<small>out of 100<br>lexical match</small></div><div><div class="component-label"><span>Weighted hard skills · ${hardWeight}% of blend</span><strong>${details.hardSkillScore ?? 0}/100</strong></div><div class="score-track"><div class="score-fill" style="width:${details.hardSkillScore || 0}%"></div></div><div class="component-label"><span>Keywords &amp; phrases · ${100 - hardWeight}%</span><strong>${details.keywordScore ?? 0}/100</strong></div><div class="score-track"><div class="score-fill" style="width:${details.keywordScore || 0}%"></div></div><p class="detail-explanation">${job.direct.length} direct matches among ${details.hardSkillsFound ?? 0} recognized hard skills. ${escape(details.confidence)} text coverage (${details.jobTokenCount} meaningful tokens).${details.confidence === "low" ? " Short text pulls the blend toward a neutral score of 35." : ""}</p></div></div>
    <div class="detail-note">This score measures text overlap, not hiring likelihood. Required skills deserve a closer look even when the overall score is high.</div>
    <section class="detail-section"><h3>Direct hard-skill evidence</h3><div class="tags">${tags(job.direct, "matched", "No direct hard-skill matches identified.")}</div></section>
    ${job.inferred.length ? `<section class="detail-section"><h3>Related skills, with the evidence attached</h3><div class="tags">${tags(job.inferred.map(({ skill, via }) => `${skill} ← ${via}`), "inferred")}</div><p>The résumé names the more specific skill. The matcher gives 70% credit for the implied skill; it is not a direct claim in the résumé.</p></section>` : ""}
    <section class="detail-section"><h3>Required skills without evidence</h3><div class="tags">${tags(requiredMissing, "missing", "No gaps among recognized required skills.")}</div><p>Absence in the text does not prove absence of experience. Check the original requirements before making a decision.</p></section>
    <section class="detail-section"><h3>Other skills to review</h3><div class="tags">${tags(otherMissing, "", "No other recognized hard-skill gaps.")}</div></section>
    <section class="detail-section"><h3>The fictional posting</h3><p class="detail-description">${escape(job.description)}</p></section>
    <button class="button secondary" type="button" data-action="detail-save" data-id="${job.id}">${state.saved.includes(job.id) ? "Remove from shortlist" : "Save to shortlist"}</button>`;
}

function compare() {
  const selected = state.compare.map((id) => state.ranked.find((job) => job.id === id)).filter(Boolean);
  $("comparison-content").innerHTML = `<div class="comparison-grid" style="--columns:${selected.length}">${selected.map((job) => `<article class="comparison-card">${company(job)}<h3>${escape(job.title)}</h3>${metadata(job)}${score(job)}<div class="comparison-row"><h4>Direct hard-skill evidence</h4><div class="tags">${tags(job.direct, "matched")}</div></div><div class="comparison-row"><h4>Inferred from related skills</h4><div class="tags">${tags(job.inferred.map(({ skill, via }) => `${skill} ← ${via}`), "inferred")}</div></div><div class="comparison-row"><h4>Missing required evidence</h4><div class="tags">${tags(job.result.details.missingRequired || [], "missing", "No recognized required gaps")}</div></div><div class="comparison-row"><h4>Other skills to review</h4><div class="tags">${tags(job.missing.filter((skill) => !(job.result.details.missingRequired || []).includes(skill)))}</div></div><div class="comparison-row"><h4>Sample work term</h4><p>${escape(job.term)}</p></div></article>`).join("")}</div><p class="compare-disclaimer">All roles and pay are fictional. Scores are recomputed from the current résumé text with the real lexical matcher. No eligibility checks or semantic inference run in this demo.</p>`;
  showDialog("comparison-dialog");
}

function save(id) {
  const exists = state.saved.includes(id);
  state.saved = exists ? state.saved.filter((value) => value !== id) : [...state.saved, id];
  renderJobs();
  announce(`${exists ? "Removed from" : "Added to"} shortlist. ${state.saved.length} saved.`);
}

$("profile").addEventListener("change", () => { state.profile = profiles.find((profile) => profile.id === $("profile").value); $("resume").value = state.profile.text; recalculate(); announce(`Now matching the ${state.profile.name} sample. Shortlisted roles are preserved and rescored.`); });
$("restore-profile").addEventListener("click", () => { $("resume").value = state.profile.text; recalculate(); announce("Sample résumé restored."); });
let editTimer;
$("resume").addEventListener("input", () => { clearTimeout(editTimer); editTimer = setTimeout(recalculate, 180); });
for (const id of ["search", "minimum"]) $(id).addEventListener("input", renderJobs);
for (const id of ["workstyle", "sort"]) $(id).addEventListener("change", renderJobs);
document.querySelectorAll('[name="track"]').forEach((input) => input.addEventListener("change", renderJobs));
$("reset-filters").addEventListener("click", resetFilters);
$("saved-only").addEventListener("click", () => { state.savedOnly = !state.savedOnly; renderJobs(); });
$("clear-compare").addEventListener("click", () => { state.compare = []; renderJobs(); document.querySelector('[data-action="compare"]')?.focus({ preventScroll: true }); announce("Comparison selection cleared."); });
$("open-compare").addEventListener("click", compare);
$("export").addEventListener("click", () => {
  const url = URL.createObjectURL(new Blob([shortlistCsv(state.ranked, state.saved)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = "nucoop-fictional-shortlist.csv"; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  announce(`Exported ${state.saved.length} fictional roles with their current matching evidence.`);
});
document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const { action, id } = button.dataset;
  if (action === "save") save(id);
  if (action === "detail-save") { save(id); detail(state.ranked.find((job) => job.id === id)); $("detail-content").querySelector('[data-action="detail-save"]').focus(); }
  if (action === "compare") {
    if (!state.compare.includes(id) && state.compare.length >= 3) { button.checked = false; announce("Compare up to three roles. Deselect a role before adding another."); return; }
    state.compare = toggleComparison(state.compare, id); renderJobs(); announce(`${state.compare.length} roles selected for comparison.`);
  }
  if (action === "details") { detail(state.ranked.find((job) => job.id === id)); showDialog("detail-dialog"); }
  if (action === "reset") { if (!$("resume").value.trim()) { $("resume").value = state.profile.text; recalculate(); } resetFilters(); $("search").focus(); }
});
document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => $(button.dataset.close).close()));
document.querySelectorAll("dialog").forEach((dialog) => {
  dialog.addEventListener("close", () => { document.body.style.overflow = ""; });
  dialog.addEventListener("click", (event) => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });
});
$("resume").value = state.profile.text;
recalculate();
