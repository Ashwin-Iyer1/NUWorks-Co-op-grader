import JobMatcher from "./vendor/matcher.mjs";

export const matcher = new JobMatcher();

export function rankJobs(jobs, resume) {
  const resumeSkills = matcher.analyzeResume(resume).allSkills;
  return jobs.map((job) => {
    const result = matcher.calculateScore(resume, job.description);
    const hardSkills = [...matcher.extractExplicitSkills(job.description).hard];
    const inferred = result.details.inferred || [];
    const inferredNames = new Set(inferred.map(({ skill }) => skill));
    const direct = hardSkills.filter((skill) => resumeSkills.has(skill));
    const missing = hardSkills.filter((skill) => !resumeSkills.has(skill) && !inferredNames.has(skill));
    return { ...job, result, direct, inferred, missing };
  }).sort((a, b) => b.result.score - a.result.score || a.title.localeCompare(b.title));
}

export function filterJobs(jobs, { query = "", track = "All", workstyle = "All", minimum = 0, savedOnly = false, saved = [], sort = "match" } = {}) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return jobs.filter((job) => {
    const text = `${job.title} ${job.company} ${job.location} ${job.description}`.toLowerCase();
    return words.every((word) => text.includes(word)) &&
      (track === "All" || job.track === track) &&
      (workstyle === "All" || job.workstyle === workstyle) &&
      job.result.score >= minimum && (!savedOnly || saved.includes(job.id));
  }).sort((a, b) => (sort === "pay" ? b.hourly - a.hourly : b.result.score - a.result.score) || a.title.localeCompare(b.title));
}

export function toggleComparison(ids, id, limit = 3) {
  if (ids.includes(id)) return ids.filter((value) => value !== id);
  return ids.length < limit ? [...ids, id] : ids;
}

function csvCell(value) {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function shortlistCsv(jobs, saved) {
  const rows = [["Scenario", "Company", "Role", "Location", "Work style", "Sample hourly USD", "Lexical score / 100", "Direct skills", "Inferred skills", "Missing required skills", "Other skills to review"]];
  for (const job of jobs.filter((job) => saved.includes(job.id))) {
    rows.push(["Fictional demo - not a real opening", job.company, job.title, job.location, job.workstyle, job.hourly, job.result.score,
      job.direct.join("; "), job.inferred.map(({ skill, via }) => `${skill} via ${via}`).join("; "),
      (job.result.details.missingRequired || []).join("; "),
      job.missing.filter((skill) => !(job.result.details.missingRequired || []).includes(skill)).join("; ")]);
  }
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
