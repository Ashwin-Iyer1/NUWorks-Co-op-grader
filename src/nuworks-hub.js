// Copyright (c) 2026 Ashwin Iyer — Licensed under AGPL-3.0
import { safeLink, navigationLinks, recommendationGroups, flattenFields } from "./nuworks-data.mjs";

function node(tag, text, className) {
  const el = document.createElement(tag);
  if (text != null) el.textContent = String(text);
  if (className) el.className = className;
  return el;
}
function link(text, value) {
  const url = safeLink(value);
  if (!url) return node("span", text);
  const el = node("a", text);
  el.href = url;
  el.target = "_blank";
  el.rel = "noopener noreferrer";
  return el;
}
function plain(value) {
  // Notification templates and help answers can contain server HTML.
  const doc = new DOMParser().parseFromString(String(value || ""), "text/html");
  doc.querySelectorAll("script,style").forEach(el => el.remove());
  return doc.body.textContent.trim();
}
function row(title, detail) {
  const el = node("div", null, "nu-row");
  el.append(node("strong", title));
  if (detail) el.append(node("p", detail, "nu-muted"));
  return el;
}
function emptyState(title, detail) {
  const el = node("div", null, "nu-empty");
  el.append(node("strong", title), node("p", detail, "nu-muted"));
  return el;
}
function facts(entries) {
  const dl = node("dl", null, "nu-facts");
  for (const [label, value] of entries) {
    if (value == null || value === "") continue;
    const group = node("div");
    group.append(node("dt", label), node("dd", value));
    dl.append(group);
  }
  return dl;
}
function displayDate(value) {
  if (!value) return "";
  // Date-only values are calendar dates, not midnight UTC timestamps.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(value))
    ? new Date(`${value}T12:00:00`) : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
function values(value) {
  if (Array.isArray(value)) return value.map(values).filter(Boolean).join(", ");
  if (value && typeof value === "object") return value._label || value.value || "";
  return value == null ? "" : String(value);
}

export function setupNuworksHub({ read, openJob, describeError, useKeyword }) {
  const root = document.getElementById("nuworks-hub");
  const nav = root.querySelector("nav");
  const content = root.querySelector(".nu-content");
  const refresh = root.querySelector(".nu-refresh");
  const status = root.querySelector(".nu-status");
  let active = "Recommendations";
  let generation = 0;
  let loaded = false;
  const views = new Map();
  const buttons = new Map();
  nav.setAttribute("role", "tablist");
  nav.setAttribute("aria-orientation", "vertical");

  async function section(parent, title, path, render) {
    const box = node("section", null, "nu-section");
    box.append(node("h3", title));
    const body = node("div", null, "nu-section-body");
    box.append(body);
    parent.append(box);
    async function load() {
      body.replaceChildren(node("div", "Loading…", "nu-loading"));
      body.setAttribute("aria-busy", "true");
      try {
        const data = await read(path);
        body.replaceChildren();
        await render(body, data);
        if (!body.childNodes.length) body.append(emptyState("Nothing here yet", "Check back later or browse NUWorks for more options."));
      } catch (err) {
        const error = emptyState("Couldn’t load this section", describeError(err));
        error.classList.add("nu-error");
        body.replaceChildren(error);
        const retry = node("button", "Retry", "btn btn-secondary");
        retry.type = "button";
        retry.addEventListener("click", load);
        error.append(retry);
      } finally {
        body.setAttribute("aria-busy", "false");
      }
    }
    await load();
  }

  const tabs = {
    Recommendations: async parent => section(parent, "Recommended by NUWorks", "/api/v2/jobs/discovery?json_mode=read_only", (body, data) => {
      const groups = recommendationGroups(data);
      if (!groups.length) return;
      body.append(node("p", "Explore suggestions from NUWorks. Use the search below for resume match scores.", "nu-intro"));
      const controls = node("div", null, "nu-recommendation-controls");
      const label = node("label", "Suggested for you");
      label.htmlFor = "nu-category";
      const select = node("select", null, "filter-select");
      select.id = "nu-category";
      select.setAttribute("aria-label", "Recommendation category");
      groups.forEach((g, i) => { const option = node("option", `${g.title} (${g.jobs.length})`); option.value = String(i); select.append(option); });
      const jobs = node("div", null, "nu-grid");
      const pagination = node("div", null, "nu-pagination");
      let page = 0;
      const pageSize = 6;
      function render() {
        jobs.replaceChildren();
        pagination.replaceChildren();
        const selectedJobs = groups[Number(select.value)].jobs;
        for (const job of selectedJobs.slice(page * pageSize, (page + 1) * pageSize)) {
          const card = node("article", null, "nu-job");
          card.append(node("p", job.name || "Employer not listed", "nu-job-company"));
          const title = node("h4");
          const button = node("button", job.job_title || "Untitled role", "nu-job-title");
          button.type = "button";
          button.addEventListener("click", () => openJob(String(job.job_id)));
          title.append(button);
          card.append(title, node("p", job.job_location || "Location not listed", "nu-job-location"));
          if (job.deadline) card.append(node("p", `Apply by ${displayDate(job.deadline)}`, "nu-job-deadline"));
          jobs.append(card);
        }
        if (!selectedJobs.length) jobs.append(emptyState("No suggestions in this category", "Try another category or find roles with the search below."));
        if (selectedJobs.length > pageSize) {
          const previous = node("button", "Previous", "btn btn-secondary");
          const next = node("button", "Next", "btn btn-secondary");
          previous.type = next.type = "button";
          previous.disabled = page === 0;
          next.disabled = (page + 1) * pageSize >= selectedJobs.length;
          previous.addEventListener("click", () => { page--; render(); pagination.querySelector("button:not(:disabled)")?.focus(); });
          next.addEventListener("click", () => { page++; render(); pagination.querySelector("button:not(:disabled)")?.focus(); });
          const count = node("span", `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, selectedJobs.length)} of ${selectedJobs.length} suggestions`, "nu-muted");
          count.setAttribute("role", "status");
          pagination.append(count, previous, next);
        }
      }
      select.addEventListener("change", () => { page = 0; render(); });
      controls.append(label, select);
      body.append(controls, jobs, pagination);
      render();
    }),
    "Saved alerts": async parent => section(parent, "Your saved search alerts", "/api/v2/agents?includeDefs=true", async (body, data) => {
      let definitions = [];
      try { definitions = flattenFields(await read("/api/v2/jobs/filters/students")); } catch { /* alerts remain usable without labels */ }
      function filterLabel(key, value) {
        const field = definitions.find(f => f.field_key === key);
        const options = field?.field_type_options?.picklist_options || [];
        const labels = (Array.isArray(value) ? value : [value]).map(v => {
          const option = options.find(o => String(o.id) === String(v));
          return option?.value || values(v);
        });
        return `${field?.field_name || key.replaceAll("_", " ")}: ${labels.join(", ")}`;
      }
      if (!data.models?.length) body.append(emptyState("No saved searches yet", "Save a search in NUWorks to receive alerts for new roles."));
      if (data.total > (data.models?.length || 0)) body.append(node("p", `Showing ${data.models.length} of ${data.total} alerts. View all in NUWorks.`, "nu-muted"));
      for (const alert of data.models || []) {
        const filters = Object.entries(alert.filtersUsed || {}).map(([key, val]) => filterLabel(key, val)).join("; ");
        const item = node("article", null, "nu-alert");
        const heading = node("div", null, "nu-row-heading");
        heading.append(node("h4", alert.label || "Saved search"), node("span", Number(alert.enabled) ? "Active" : "Paused", `nu-badge ${Number(alert.enabled) ? "nu-badge-positive" : ""}`));
        item.append(heading, facts([["Frequency", alert.frequency || alert.period?._label], ["Next update", displayDate(alert.next_run)], ["Latest results", alert.latest_res_count]]));
        if (filters) item.append(node("p", filters, "nu-alert-filters"));
        body.append(item);
      }
      body.append(link("Manage alerts in NUWorks", "/students/app/jobs/search"));
    }),
    Notifications: async parent => section(parent, "Notifications", "/api/v2/my/notifications?includeAggregator=1", (body, data) => {
      body.append(node("p", `${data.totalUnread ?? 0} unread · ${data.total ?? 0} total`, "nu-muted"));
      if (data.total > (data.model?.length || 0)) body.append(node("p", `Showing the latest ${data.model?.length || 0} notifications.`, "nu-muted"));
      if (!data.model?.length) body.append(emptyState("You’re all caught up", "Updates from NUWorks will appear here."));
      for (const item of data.model || []) {
        const el = row(plain(item.template) || "NUWorks notification", displayDate(item.time));
        el.classList.add("nu-notification");
        if (!Number(item.read_flag)) {
          el.classList.add("nu-notification-unread");
          el.prepend(node("span", "Unread", "nu-badge nu-badge-positive"));
        }
        if (safeLink(item.url)) el.append(link("Open notification", item.url));
        body.append(el);
      }
    }),
    "Recent searches": async parent => {
      await Promise.allSettled([
        section(parent, "Recent keywords", "/api/v2//search/recent/keywords?context=students_jobs", (body, data) => {
          body.append(node("p", "Use a recent keyword to filter titles in your analyzed results.", "nu-muted"));
          if (!data?.length) body.append(emptyState("No recent keywords", "Your recent NUWorks searches will appear here."));
          for (const item of data || []) {
            const keyword = item.value || item.label;
            if (!keyword) continue;
            const button = node("button", item.label || keyword, "btn btn-secondary nu-keyword");
            button.type = "button";
            button.addEventListener("click", () => useKeyword(String(keyword)));
            body.append(button);
          }
        }),
        section(parent, "Recent locations", "/api/v2//search/recent/locations?context=students_jobs", (body, data) => {
          if (!data?.length) body.append(emptyState("No recent locations", "Search a location in NUWorks to see it here."));
          for (const item of data || []) body.append(row(item.label || "Location"));
          body.append(link("Search locations in NUWorks", "/students/app/jobs/search"));
        }),
      ]);
    },
    Resources: async parent => {
      await Promise.allSettled([
        section(parent, "Career resources", "/api/v3/related-resources?sections=job", (body, data) => {
          for (const item of data || []) body.append(link(item.label || "Resource", item.link));
        }),
        section(parent, "Job search help", "/api/v2/help?section=jobs&tab=discover", (body, data) => {
          if (!data.models?.length) body.append(node("p", "No additional search guidance from NUWorks at the moment.", "nu-muted"));
          for (const item of data.models || []) body.append(row(plain(item.question), plain(item.answer)));
        }),
        section(parent, "Document policies", "/api/v2/system-settings/all", (body, data) => {
          if (data.maximum_resumes != null) body.append(row("Maximum resumes", data.maximum_resumes));
          if (data.student_documents_allowed) body.append(row("Allowed documents", String(data.student_documents_allowed).split("::").join(", ")));
          body.append(link("Review documents and approvals in NUWorks", "/students/index.php?s=resume&mode=list&ss=resumes"));
        }),
      ]);
    },
    // "NUWorks pages": async parent => {
    //   await Promise.allSettled([
    //     ...[["All pages", "/api/v2/student-site-structure"], ["Main navigation", "/api/v3/my/navigation?json_mode=read_only"], ["Job tools", "/api/v3/my/navigation-tools?section=jobs&subsection=jobs"]].map(([title, path]) =>
    //       section(parent, title, path, (body, data) => { navigationLinks(data).forEach(item => body.append(link(item.title, item.url))); })),
    //     section(parent, "Your account", "/api/v2/auth/current-user", async (body, data) => {
    //       const user = data.data || data.user;
    //       if (!user) return;
    //       body.append(row(user.name || user.fname || "Signed in"));
    //       body.append(link("Open profile", "/students/app/profile"));
    //       if (user.id) {
    //         try {
    //           const image = await read(`/api/v2/student/${encodeURIComponent(user.id)}/image/40?return_url=true`);
    //           const url = safeLink(image.url);
    //           if (url) {
    //             const avatar = node("img");
    //             avatar.alt = "Your NUWorks profile photo";
    //             avatar.width = avatar.height = 40;
    //             avatar.crossOrigin = "anonymous";
    //             avatar.referrerPolicy = "no-referrer";
    //             avatar.addEventListener("error", () => avatar.remove());
    //             avatar.src = url;
    //             body.prepend(avatar);
    //           }
    //         } catch { /* account links work without a photo */ }
    //       }
    //     }),
    //   ]);
    // },
  };

  async function load(force = false) {
    const token = ++generation;
    loaded = true;
    for (const [title, button] of buttons) {
      button.setAttribute("aria-selected", String(title === active));
      button.tabIndex = title === active ? 0 : -1;
    }
    content.setAttribute("aria-labelledby", buttons.get(active).id);
    let entry = views.get(active);
    // Keep selections and pagination when switching sections. Refresh is
    // explicit; snapshots older than five minutes are checked on next visit.
    if (force || !entry || Date.now() - entry.created > 300000) {
      entry = { view: node("div", null, "nu-view"), created: Date.now(), checked: null };
      entry.view.dataset.section = active;
      views.set(active, entry);
      entry.promise = tabs[active](entry.view).finally(() => { entry.checked = new Date(); });
    }
    content.replaceChildren(entry.view);
    content.setAttribute("aria-busy", String(!entry.checked));
    refresh.disabled = !entry.checked;
    status.textContent = entry.checked ? `Checked at ${entry.checked.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Checking NUWorks…";
    try { await entry.promise; }
    finally {
      if (token !== generation) return;
      refresh.disabled = false;
      content.setAttribute("aria-busy", "false");
      status.textContent = entry.view.querySelector(".nu-error") ? "Some information couldn’t be loaded" : `Checked at ${entry.checked.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
    }
  }
  Object.keys(tabs).forEach((title, index) => {
    const button = node("button", title, "nu-tab");
    button.type = "button";
    button.id = `nu-tab-${index}`;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", "nu-panel");
    button.setAttribute("aria-selected", String(title === active));
    button.tabIndex = title === active ? 0 : -1;
    button.addEventListener("click", () => { active = title; load().catch(() => { status.textContent = "Couldn’t load this section. Try Refresh."; }); });
    button.addEventListener("keydown", event => {
      const keys = ["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft", "Home", "End"];
      if (!keys.includes(event.key)) return;
      event.preventDefault();
      const items = [...buttons.values()];
      const offset = ["ArrowDown", "ArrowRight"].includes(event.key) ? 1 : -1;
      const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + offset + items.length) % items.length;
      items[next].focus();
      items[next].click();
    });
    buttons.set(title, button);
    nav.append(button);
  });
  root.addEventListener("toggle", () => { if (root.open && !loaded) buttons.get(active).click(); });
  refresh.addEventListener("click", () => load(true).catch(() => { status.textContent = "Couldn’t refresh. Please try again."; }));
}

// Render only explicitly returned detail fields. Form schemas supply display
// labels, never permission to edit records or infer missing requirements.
export function appendApplicationDetails(parent, job, read) {
  const section = node("section", null, "modal-section nu-application");
  section.append(node("h3", "Application preparation", "modal-section-title"));
  section.append(facts([["Application status", job.application_status || (job.applied === true ? "Applied" : job.applied === false ? "Not applied in NUWorks" : "Not available")]]));
  const required = values(job.documents_required);
  section.append(row("Prepare your documents", required ? "Required for this role" : "Check the posting for document requirements before applying."));
  if (required) {
    const list = node("ul", null, "nu-document-list");
    for (const document of Array.isArray(job.documents_required) ? job.documents_required : [job.documents_required]) list.append(node("li", values(document)));
    section.append(list);
  }
  if (values(job.additional_documents)) section.append(row("Additional documents", values(job.additional_documents)));
  if (job.additional_documents_notes) section.append(row("Document instructions", plain(job.additional_documents_notes)));
  for (const schedule of job.schedules || []) {
    const available = (schedule.timeslots || []).filter(slot => slot.available === true);
    const el = row("Interview availability", [schedule.dt, schedule.virtual_int ? "Virtual" : values(schedule.location), `${available.length} available ${available.length === 1 ? "slot" : "slots"} when checked`].filter(Boolean).join(" · "));
    available.forEach(slot => el.append(node("p", slot._label || "Available slot")));
    section.append(el);
  }
  if (job.schedules?.length) section.append(node("p", "Confirm times and book in NUWorks. Availability can change.", "nu-muted"));
  section.append(link("Review application in NUWorks", `/students/app/jobs/detail/${encodeURIComponent(job.job_id)}`));
  parent.insertBefore(section, parent.querySelector(".modal-actions"));
  const extra = node("details", null, "nu-extra-details");
  extra.append(node("summary", "More posting details"));
  const body = node("div");
  extra.append(body);
  section.append(extra);
  let pending = false;
  extra.addEventListener("toggle", async () => {
    if (!extra.open || pending) return;
    pending = true;
    body.textContent = "Loading…";
    try {
      const schema = await read(`/api/v3/jobs/form-structure?form=student_job_display&apiVersion=v3&object_id=${encodeURIComponent(job.job_id)}`);
      body.replaceChildren();
      const keys = new Set(["internal_status", "status_last_confirmed", "work_authorization", "job_length", "payment_frequency", "payment_range", "compensation_currency_type"]);
      for (const field of flattenFields(schema)) {
        if (!keys.has(field.field_key)) continue;
        const raw = job[field.field_key];
        const value = values(raw);
        if (!value) continue;
        const option = field.field_type_options?.picklist_options?.find(item => String(item.id) === value);
        body.append(row(field.field_name || field.field_key, option?.value || value));
      }
      if (job.attachment?.length) {
        const schema = await read("/api/v3/jobs/form-structure?form=job_attachment_default&class=file");
        const fields = flattenFields(schema).filter(f => ["title", "user_file_name", "size"].includes(f.field_key));
        for (const attachment of job.attachment) for (const field of fields) {
          if (attachment[field.field_key]) body.append(row(field.field_name || field.field_key, values(attachment[field.field_key])));
        }
      }
      if (!body.childNodes.length) body.append(node("p", "No additional details returned."));
    } catch {
      body.replaceChildren(node("p", "Could not load more details. Close and reopen this section to retry."));
      pending = false;
    }
  });
}
