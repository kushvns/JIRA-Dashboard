"use client";

import { useEffect, useMemo, useState } from "react";

const tabs = ["Overview", "Individual details", "Ticket explorer", "Recurring analysis"];

function formatHours(value) {
  if (value === null || value === undefined) return "N/A";
  if (value < 24) return `${value}h`;
  return `${Math.round((value / 24) * 10) / 10}d`;
}

function Kpi({ label, value, note, tone = "blue" }) {
  return (
    <article className={`kpi kpi-${tone}`}>
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{note}</span>
    </article>
  );
}

function MiniBars({ data, valueKey = "count", labelKey = "name" }) {
  const max = Math.max(1, ...data.map((item) => item[valueKey] || 0));
  return (
    <div className="bars">
      {data.map((item) => (
        <div className="bar-row" key={item[labelKey]}>
          <span title={item[labelKey]}>{item[labelKey]}</span>
          <div><i style={{ width: `${((item[valueKey] || 0) / max) * 100}%` }} /></div>
          <b>{item[valueKey]}</b>
        </div>
      ))}
    </div>
  );
}

function TrendChart({ daily }) {
  const width = 760;
  const height = 230;
  const pad = 32;
  const max = Math.max(1, ...daily.flatMap((d) => [d.created, d.resolved, d.breached]));
  const points = (key) => daily.map((d, i) => {
    const x = pad + (i * (width - pad * 2)) / 6;
    const y = height - pad - (d[key] / max) * (height - pad * 2);
    return `${x},${y}`;
  }).join(" ");
  return (
    <div className="chart-wrap">
      <div className="legend"><span className="created-dot">Created</span><span className="closed-dot">Resolved</span><span className="breach-dot">SLA breached</span></div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Daily created, resolved and SLA breach trend">
        {[0, .25, .5, .75, 1].map((p) => <line key={p} x1={pad} x2={width - pad} y1={pad + p * (height - pad * 2)} y2={pad + p * (height - pad * 2)} className="grid" />)}
        <polyline points={points("created")} className="line created-line" />
        <polyline points={points("resolved")} className="line closed-line" />
        <polyline points={points("breached")} className="line breach-line" />
        {daily.map((d, i) => <text key={d.date} x={pad + (i * (width - pad * 2)) / 6} y={height - 7} textAnchor="middle">{d.date.slice(5)}</text>)}
      </svg>
    </div>
  );
}

function ProjectPills({ totals }) {
  return (
    <div className="project-pills">
      {Object.entries(totals).map(([key, value]) => (
        <div key={key}><b>{key}</b><span>{value.open} open</span><span>{value.breached} breached</span></div>
      ))}
    </div>
  );
}

function Overview({ data }) {
  const resolvedBars = data.team.map((member) => ({ name: member.name, count: member.closed }));
  return <>
    <section className="kpi-grid">
      <Kpi label="Created" value={data.totals.created} note="Last 7 days · SE + IN only" />
      <Kpi label="Closed / resolved" value={data.totals.resolved} note="Resolved in last 7 days" tone="green" />
      <Kpi label="Current open" value={data.totals.open} note="SE + IN current backlog" tone="amber" />
      <Kpi label="SLA breached" value={data.totals.breached} note="Breached among tickets resolved in last 7 days · SE + IN" tone="red" />
      <Kpi label="SLA compliance" value={data.totals.slaCompliance === null ? "N/A" : `${data.totals.slaCompliance}%`} note="Resolved in last 7 days · SE + IN only" tone="violet" />
      <Kpi label="Avg. time / closed ticket" value={formatHours(data.totals.averageResolutionHours)} note="Created to resolution" tone="slate" />
    </section>
    <section className="scope-card">
      <div><p className="eyebrow">Hard-restricted project scope</p><h2>SE + IN Project Scope Details</h2></div>
      <ProjectPills totals={data.projectTotals} />
    </section>
    <section className="two-col">
      <article className="panel wide"><div className="panel-head"><div><p className="eyebrow">Operations</p><h2>Daily created vs resolved trend</h2></div><span>Asia/Kolkata</span></div><TrendChart daily={data.daily} /></article>
      <article className="panel"><div className="panel-head"><div><p className="eyebrow">Productivity</p><h2>Resolved by assignee</h2></div><span>7 days</span></div><MiniBars data={resolvedBars} /></article>
      <article className="panel"><div className="panel-head"><div><p className="eyebrow">Demand mix</p><h2>Most common ticket types</h2></div><span>Created</span></div><MiniBars data={data.ticketTypes} /></article>
    </section>
  </>;
}

function Individuals({ data }) {
  return <section className="member-grid">
    {data.team.map((member) => (
      <article className="member-card" key={member.email}>
        <div className="member-head"><div className="avatar">{member.name.slice(0, 2).toUpperCase()}</div><div><h2>{member.name}</h2><p>{member.email}</p></div></div>
        <div className="member-kpis"><div><span>Created</span><b>{member.created}</b></div><div><span>Closed</span><b>{member.closed}</b></div><div><span>Open</span><b>{member.open}</b></div><div><span>SLA breached</span><b>{member.breached}</b></div></div>
        <div className="member-stats"><p><span>Avg. resolution per closed ticket</span><b>{formatHours(member.averageResolutionHours)}</b></p><p><span>Daily productivity</span><b>{member.closedPerDay} closed/day</b></p><p><span>SLA compliance</span><b>{member.slaCompliance === null ? "N/A" : `${member.slaCompliance}%`}</b></p></div>
        <table><thead><tr><th>Project</th><th>Created</th><th>Closed</th><th>Open</th></tr></thead><tbody>{["SE", "IN"].map((key) => <tr key={key}><td><span className={`project-tag ${key.toLowerCase()}`}>{key}</span></td><td>{member.project[key].created}</td><td>{member.project[key].closed}</td><td>{member.project[key].open}</td></tr>)}</tbody></table>
      </article>
    ))}
  </section>;
}

function Tickets({ data, jiraBase }) {
  const [query, setQuery] = useState("");
  const [project, setProject] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const rows = useMemo(() => data.issues.filter((issue) => {
    const search = query.toLowerCase();
    return (!search || `${issue.key} ${issue.summary} ${issue.assignee}`.toLowerCase().includes(search))
      && (project === "ALL" || issue.project === project)
      && (   status === "ALL" ||   (     status === "OPEN"       ? issue.open && issue.createdInWindow       : issue.resolvedInWindow   ) );
  }), [data.issues, query, project, status]);
  const exportCsv = () => {
    const header = ["Key", "Summary", "Project", "Assignee", "Status", "Priority", "Created", "Resolved", "SLA Breached"];
    const csv = [header, ...rows.map((i) => [i.key, i.summary, i.project, i.assignee, i.status, i.priority, i.created, i.resolved || "", i.breached ? "Yes" : "No"])]
      .map((row) => row.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "jira-se-in-dashboard.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return <section className="panel ticket-panel">
    <div className="ticket-tools"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search key, summary or assignee" /><select value={project} onChange={(e) => setProject(e.target.value)}><option value="ALL">All projects</option><option>SE</option><option>IN</option></select><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="ALL">All scoped tickets</option><option value="OPEN">Current open</option><option value="CLOSED">Closed last 7 days</option></select><button onClick={exportCsv}>Export CSV</button></div>
    <p className="result-count">{rows.length} tickets shown</p>
    <div className="table-scroll"><table className="issue-table"><thead><tr><th>Key</th><th>Summary</th><th>Project</th><th>Assignee</th><th>Status</th><th>Priority</th><th>Created</th><th>Resolution time</th><th>SLA</th></tr></thead><tbody>{rows.map((issue) => <tr key={issue.key}><td><a href={`${jiraBase}/browse/${issue.key}`} target="_blank" rel="noreferrer">{issue.key}</a></td><td>{issue.summary}</td><td><span className={`project-tag ${issue.project.toLowerCase()}`}>{issue.project}</span></td><td>{issue.assigneeName}</td><td>{issue.status}</td><td>{issue.priority}</td><td>{new Date(issue.created).toLocaleDateString("en-IN")}</td><td>{formatHours(issue.resolutionHours)}</td><td><span className={issue.breached ? "bad" : "good"}>{issue.breached ? "Breached" : issue.completedSla ? "Within" : "—"}</span></td></tr>)}</tbody></table></div>
  </section>;
}

function Recurring({ data, jiraBase }) {
  return <section className="panel"><div className="panel-head"><div><p className="eyebrow">Estimated / heuristic</p><h2>Recurring ticket clusters</h2></div><span>{data.recurring.reduce((sum, item) => sum + item.count, 0)} tickets</span></div><p className="muted">Groups use normalized summary similarity. Review linked tickets before treating them as duplicates.</p>{data.recurring.length ? <div className="recurring-grid">{data.recurring.map((group) => <article key={group.signature}><div><span>{group.issueType}</span><b>{group.count} tickets</b></div><h3>{group.summaries[0]}</h3><p>{group.keys.map((key, index) => <span key={key}><a href={`${jiraBase}/browse/${key}`} target="_blank" rel="noreferrer">{key}</a>{index < group.keys.length - 1 ? ", " : ""}</span>)}</p></article>)}</div> : <div className="empty">No repeat clusters found in the current 7-day window.</div>}</section>;
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(tabs[0]);
  const load = async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail || body.error || "Could not load Jira data");
      setData(body);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const jiraBase = "https://rategain.atlassian.net";
  return <main>
    <header className="topbar"><div className="brand"><div className="logo">RG</div><div><b>IT JIRA Ticket Dashboard</b><span>SE & IN Team Performance</span></div></div><div className="live"><i /> Live Jira data</div></header>
    <div className="shell">
      <section className="title-row"><div><p className="eyebrow">Service Requests · Incident Request</p><h1>IT JIRA Ticket 7-Days</h1><p>{data ? `${new Date(data.reportingStart).toLocaleDateString("en-IN")} – ${new Date(data.reportingEnd).toLocaleDateString("en-IN")} · ${data.timezone}` : "Loading reporting window…"}</p></div><button className="refresh" onClick={load} disabled={loading}>{loading ? "Refreshing…" : "↻ Refresh live data"}</button></section>
      <nav className="tabs">{tabs.map((tab) => <button key={tab} className={active === tab ? "active" : ""} onClick={() => setActive(tab)}>{tab}</button>)}</nav>
      {error && <section className="error"><b>Dashboard could not load Jira data.</b><span>{error}</span><button onClick={load}>Try again</button></section>}
      {loading && !data && <section className="loading"><i /><h2>Loading fresh Jira data</h2><p>Reading only SE and IN tickets for the selected team.</p></section>}
      {data && <>
        {active === "Overview" && <Overview data={data} />}
        {active === "Individual details" && <Individuals data={data} />}
        {active === "Ticket explorer" && <Tickets data={data} jiraBase={jiraBase} />}
        {active === "Recurring analysis" && <Recurring data={data} jiraBase={jiraBase} />}
        <footer><span>Last refreshed: {new Date(data.generatedAt).toLocaleString("en-IN", { timeZone: data.timezone })}</span><span>Projects: SE + IN only · {data.scope.assignees.length} assignees</span></footer>
      </>}
    </div>
  </main>;
}
