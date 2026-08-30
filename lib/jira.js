const ASSIGNEES = [
  "sandeep.kumar1@rategain.com",
  "kush.kumar@rategain.com",
  "nikhil.rai1@rategain.com",
  "karunanidhi1@rategain.com",
  "sachin@rategain.com",
  "gaurav.chauhan@rategain.com",
];

const PROJECTS = ["SE", "IN"];

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function authHeaders() {
  const email = requiredEnv("JIRA_EMAIL");
  const token = requiredEnv("JIRA_API_TOKEN");
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`,
  };
}

async function jiraFetch(path, options = {}) {
  const base = requiredEnv("JIRA_BASE_URL").replace(/\/$/, "");
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers || {}) },
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Jira API ${response.status}: ${detail.slice(0, 500)}`);
  }
  return response.json();
}

async function getSlaFields() {
  const fields = await jiraFetch("/rest/api/3/field");
  return fields
    .filter((field) => /time to (resolution|first response)/i.test(field.name))
    .map((field) => ({ id: field.id, name: field.name }));
}

async function resolveAssignees() {
  const accounts = [];
  for (const email of ASSIGNEES) {
    const candidates = await jiraFetch(`/rest/api/3/user/search?query=${encodeURIComponent(email)}&maxResults=10`);
    const exact = candidates.find((user) => user.emailAddress?.toLowerCase() === email);
    const selected = exact || (candidates.length === 1 ? candidates[0] : null);
    if (!selected?.accountId) {
      throw new Error(`Could not uniquely resolve Jira account: ${email}`);
    }
    accounts.push({ email, accountId: selected.accountId, name: selected.displayName || email });
  }
  return accounts;
}

function buildJql() {
  return `
    project in ("SE", "IN")
    AND assignee in (
      "712020:d57549f7-9a84-4aba-8f31-037b455a27a9",
      "712020:8d513cb6-82f0-4afb-a2c9-78035336780e",
      "712020:c5853dbe-0855-49e0-b65b-0edcb9530e89",
      "712020:860bafeb-410d-444b-91cb-51d3a1d38386",
      "712020:90df16d8-d633-422c-b8cd-871da176aa67",
      "712020:695d871d-ef29-4b2b-bbda-a4a73db7ab5e",
      membersOf("IT-OPS"),
      membersOf("DC-OPS")
    )
    AND (
      created >= startOfDay(-6d)
      OR resolutiondate >= startOfDay(-6d)
      OR resolution IS EMPTY
    )
    ORDER BY updated DESC
  `;
}

async function searchIssues(slaFields) {
  const standardFields = [
    "summary", "status", "assignee", "project", "created", "updated",
    "resolutiondate", "priority", "issuetype", "labels", "components", "reporter",
  ];
  const fields = [...standardFields, ...slaFields.map((field) => field.id)];
  const issues = [];
  let nextPageToken;

  do {
    const payload = await jiraFetch("/rest/api/3/search/jql", {
      method: "POST",
      body: JSON.stringify({
        jql: buildJql(),
        fields,
        maxResults: 100,
        ...(nextPageToken ? { nextPageToken } : {}),
      }),
    });
    issues.push(...(payload.issues || []));
    nextPageToken = payload.nextPageToken;
    if (payload.isLast === true) nextPageToken = undefined;
  } while (nextPageToken);

  return issues;
}

function cycleBreached(value) {
  if (!value || typeof value !== "object") return false;
  if (value.ongoingCycle?.breached === true) return true;
  return (value.completedCycles || []).some((cycle) => cycle.breached === true);
}

function cycleCompleted(value) {
  return Boolean(value && Array.isArray(value.completedCycles) && value.completedCycles.length);
}

function startOfReportingWindow() {
  const now = new Date();
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - 6);
  return { start, now };
}

function inWindow(dateString, start, end) {
  if (!dateString) return false;
  const date = new Date(dateString);
  return date >= start && date <= end;
}

function resolutionHours(issue) {
  const created = new Date(issue.fields.created);
  const resolved = issue.fields.resolutiondate ? new Date(issue.fields.resolutiondate) : null;
  if (!resolved) return null;
  return Math.max(0, (resolved - created) / 36e5);
}

function dateKey(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(date));
}

function normalizeSummary(summary = "") {
  const stop = new Set(["issue", "request", "help", "error", "please", "user", "ticket"]);
  return summary.toLowerCase()
    .replace(/[a-z]+-\d+/g, " ")
    .replace(/\b\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}\b/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stop.has(word) && !/^\d+$/.test(word))
    .slice(0, 7)
    .sort()
    .join(" ");
}

function publicIssue(issue, slaFields, accountsById, start, now) {
  const f = issue.fields;
  const resolvedAccount = accountsById.get(f.assignee?.accountId);
  const sla = slaFields.map(({ id, name }) => ({
    name,
    breached: cycleBreached(f[id]),
    completed: cycleCompleted(f[id]),
  }));
  const breached = sla.some((item) => item.breached);
  const completedSla = sla.some((item) => item.completed);
  return {
    key: issue.key,
    summary: f.summary || "",
    project: f.project?.key || "",
    assignee: resolvedAccount?.email || f.assignee?.emailAddress || "Unassigned",
    assigneeName: f.assignee?.displayName || f.assignee?.emailAddress || "Unassigned",
    status: f.status?.name || "Unknown",
    priority: f.priority?.name || "None",
    issueType: f.issuetype?.name || "Other",
    created: f.created,
    updated: f.updated,
    resolved: f.resolutiondate,
    createdInWindow: inWindow(f.created, start, now),
    resolvedInWindow: inWindow(f.resolutiondate, start, now),
    open: !f.resolutiondate,
    resolutionHours: resolutionHours(issue),
    breached,
    completedSla,
    sla,
    labels: f.labels || [],
    components: (f.components || []).map((item) => item.name),
  };
}

function groupRecurring(createdIssues) {
  const groups = new Map();
  for (const issue of createdIssues) {
    const signature = normalizeSummary(issue.summary);
    if (!signature || signature.split(" ").length < 2) continue;
    if (!groups.has(signature)) groups.set(signature, []);
    groups.get(signature).push(issue);
  }
  return [...groups.entries()]
    .filter(([, tickets]) => tickets.length >= 2)
    .map(([signature, tickets]) => ({
      signature,
      count: tickets.length,
      issueType: tickets[0].issueType,
      keys: tickets.map((ticket) => ticket.key),
      summaries: [...new Set(tickets.map((ticket) => ticket.summary))].slice(0, 3),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

export async function buildDashboardData() {
  const { start, now } = startOfReportingWindow();
  const [slaFields, accounts] = await Promise.all([getSlaFields(), resolveAssignees()]);
  const accountsById = new Map(accounts.map((account) => [account.accountId, account]));
  const rawIssues = await searchIssues(slaFields);
  const scoped = rawIssues
    .map((issue) => publicIssue(issue, slaFields, accountsById, start, now))
    .filter((issue) => PROJECTS.includes(issue.project));

  const created = scoped.filter((issue) => issue.createdInWindow);
  const resolved = scoped.filter((issue) => issue.resolvedInWindow);
  const open = scoped.filter((issue) => issue.open && issue.createdInWindow);
  const breached = resolved.filter((issue) => issue.breached);
  const completedSla = resolved.filter((issue) => issue.completedSla);
  const resolutionValues = resolved.map((issue) => issue.resolutionHours).filter(Number.isFinite);

  const team = ASSIGNEES.map((email) => {
    const mine = scoped.filter((issue) => issue.assignee.toLowerCase() === email);
    const mineCreated = mine.filter((issue) => issue.createdInWindow);
    const mineResolved = mine.filter((issue) => issue.resolvedInWindow);
    const mineOpen = mine.filter((issue) => issue.open && issue.createdInWindow);
    const mineBreached = mineResolved.filter((issue) => issue.breached);
    const mineSlaCompleted = mineResolved.filter((issue) => issue.completedSla);
    const hours = mineResolved.map((issue) => issue.resolutionHours).filter(Number.isFinite);
    const project = Object.fromEntries(PROJECTS.map((key) => {
      const rows = mine.filter((issue) => issue.project === key);
      return [key, {
        created: rows.filter((issue) => issue.createdInWindow).length,
        closed: rows.filter((issue) => issue.resolvedInWindow).length,
        open: rows.filter((issue) => issue.open && issue.createdInWindow).length,
      }];
    }));
    return {
      email,
      name: mine.find((issue) => issue.assigneeName)?.assigneeName || email.split("@")[0],
      created: mineCreated.length,
      closed: mineResolved.length,
      open: mineOpen.length,
      breached: mineBreached.length,
      slaCompliance: mineSlaCompleted.length
        ? Math.round(((mineSlaCompleted.length - mineSlaCompleted.filter((i) => i.breached).length) / mineSlaCompleted.length) * 100)
        : null,
      averageResolutionHours: hours.length ? Math.round((hours.reduce((a, b) => a + b, 0) / hours.length) * 10) / 10 : null,
      closedPerDay: Math.round((mineResolved.length / 7) * 10) / 10,
      project,
    };
  });

  const days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start);
    day.setUTCDate(day.getUTCDate() + index);
    const key = dateKey(day);
    return {
      date: key,
      created: created.filter((issue) => dateKey(issue.created) === key).length,
      resolved: resolved.filter((issue) => dateKey(issue.resolved) === key).length,
      breached: breached.filter((issue) => dateKey(issue.updated) === key).length,
    };
  });

  const typeCounts = new Map();
  for (const issue of created) typeCounts.set(issue.issueType, (typeCounts.get(issue.issueType) || 0) + 1);

  return {
    generatedAt: now.toISOString(),
    reportingStart: start.toISOString(),
    reportingEnd: now.toISOString(),
    timezone: "Asia/Kolkata",
    scope: { projects: PROJECTS, assignees: ASSIGNEES },
    slaFields: slaFields.map((field) => field.name),
    totals: {
      created: created.length,
      resolved: resolved.length,
      open: open.length,
      breached: breached.length,
      slaCompliance: completedSla.length
        ? Math.round(((completedSla.length - completedSla.filter((i) => i.breached).length) / completedSla.length) * 100)
        : null,
      averageResolutionHours: resolutionValues.length
        ? Math.round((resolutionValues.reduce((a, b) => a + b, 0) / resolutionValues.length) * 10) / 10
        : null,
    },
    projectTotals: Object.fromEntries(PROJECTS.map((key) => {
      const rows = scoped.filter((issue) => issue.project === key);
      return [key, {
        created: rows.filter((issue) => issue.createdInWindow).length,
        resolved: rows.filter((issue) => issue.resolvedInWindow).length,
        open: rows.filter((issue) => issue.open && issue.createdInWindow).length,
        breached: rows.filter((issue) => issue.resolvedInWindow && issue.breached).length,
      }];
    })),
    team,
    daily: days,
    ticketTypes: [...typeCounts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10),
    recurring: groupRecurring(created),
    issues: scoped,
  };
}
