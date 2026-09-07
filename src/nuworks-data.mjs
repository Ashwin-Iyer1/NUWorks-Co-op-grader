// Copyright (c) 2026 Ashwin Iyer — Licensed under AGPL-3.0
export const NUWORKS_BASE = "https://northeastern-csm.symplicity.com";

export function safeLink(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value, NUWORKS_BASE);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password
      ? url.href : null;
  } catch { return null; }
}

export function flattenFields(value) {
  if (Array.isArray(value)) return value.flatMap(flattenFields);
  if (!value || typeof value !== "object") return [];
  if (value.field_key) return [value];
  return Object.values(value).flatMap(flattenFields);
}

export function navigationLinks(value) {
  const links = new Map();
  function visit(item) {
    if (!item || typeof item !== "object") return;
    const url = safeLink(item.link);
    if (url && new URL(url).origin === NUWORKS_BASE && item.title)
      links.set(url, { title: item.title, url });
    Object.values(item).forEach(visit);
  }
  visit(value);
  return [...links.values()];
}

export function recommendationGroups(data) {
  return Object.entries(data?.models?.jobs || {}).map(([key, group]) => {
    const seen = new Set();
    return { key, title: group.title || key, jobs: (Array.isArray(group.jobs) ? group.jobs : [])
      .filter(job => {
        if (!job?.job_id || seen.has(String(job.job_id))) return false;
        seen.add(String(job.job_id));
        return true;
      }) };
  });
}

export function createNuworksReader(getCredentials, getHeaders, fetcher = fetch) {
  return async function read(path) {
    if (!path.startsWith("/api/")) throw new Error("Unsupported NUWorks path");
    const creds = await getCredentials();
    if (!creds.authorization || !creds.cookie) throw new Error("HTTP 401");
    const response = await fetcher(`${NUWORKS_BASE}${path}`, {
      method: "GET", headers: getHeaders(creds), signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  };
}
