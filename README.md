# Jira SE & IN Live Team Dashboard

Vercel-ready Next.js dashboard for live Jira Cloud data. It is hard-scoped to the `SE` and `IN` projects and these six assignees:

- sandeep.kumar1@rategain.com
- kush.kumar@rategain.com
- nikhil.rai1@rategain.com
- karunanidhi1@rategain.com
- sachin@rategain.com
- gaurav.chauhan@rategain.com

## Local setup

```bash
cp .env.example .env.local
npm install
npm run dev
```

Fill `.env.local` with a Jira account email and Atlassian API token. The account must have permission to browse both projects and view Jira Service Management SLA fields.

## Deploy on Vercel

1. Push this folder to a private GitHub repository.
2. Import the repository at https://vercel.com/new.
3. Add these Production environment variables:
   - `JIRA_BASE_URL=https://rategain.atlassian.net`
   - `JIRA_EMAIL=<dedicated read-only Jira account email>`
   - `JIRA_API_TOKEN=<Atlassian API token>`
   - `JIRA_CACHE_SECONDS=0`
4. Deploy and enable Vercel Deployment Protection or your organization SSO.

Never prefix the Jira secrets with `NEXT_PUBLIC_`. Jira is queried only from the server-side `/api/dashboard` route.

## Metric definitions

- Created: ticket created in the last 7 calendar days and currently assigned to a scoped assignee.
- Closed: resolution date occurred during the last 7 days.
- Current open: unresolved scoped tickets, regardless of created date.
- Average resolution time: calendar time from created timestamp to resolution timestamp for tickets resolved in the reporting window.
- SLA breached: based on Jira's actual Time to Resolution / Time to First Response cycle data when those fields are available.
- Recurring analysis: estimated from normalized summary similarity and clearly labeled as heuristic.
