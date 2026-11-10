# IT Ticket JIRA Dashboard (Vercel)

Live dashboard of **Created** and **Closed** tickets for Jira projects **SE** and **IN**
(per-person buckets, DC-OPS / IT-OPS queue SLA, repeated reporters, time spent, ticket list).

- Static frontend in `public/`, served from a fixed Vercel URL.
- Two serverless functions in `api/` talk to Jira. The Jira token stays on the server and is never sent to the browser.
- **Every page load (and the Refresh button) calls `/api/dashboard`, which queries Jira live**, so the page always shows the latest tickets.

```
api/dashboard.js   GET /api/dashboard      created + closed tickets, last 7 days (live, no-store)
api/range.js       GET /api/range?r=1m|1y  per-bucket counts for 1 Month / 1 Year (cached 5 min at the CDN)
api/auth/*.js      login, callback, logout, me  (Microsoft 365 sign-in, @rategain.com only)
lib/config.js      projects, people (Atlassian account IDs), queues, field IDs   <- edit this
lib/jira.js        Jira REST client (pagination, retry on 429/503)
lib/transform.js   issue -> compact row, bucket logic, IST time formatting
lib/http.js        method check, access control (SSO or password), uniform JSON errors
lib/sso.js         Microsoft Entra ID sign-in (OIDC code flow + PKCE), session cookie
lib/session.js     HMAC-signed cookies
public/            index.html, css/styles.css, js/{app,api,format}.js
test/              node --test (mocked Jira)
```

## 1. Create a Jira API token
1. Sign in as an Atlassian account that can browse projects SE and IN.
2. Go to https://id.atlassian.com/manage-profile/security/api-tokens -> **Create API token**.
3. Copy the token.

## 2. Push to GitHub
```bash
cd jira-dashboard-vercel
git init
git add .
git commit -m "IT ticket dashboard"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```
`.env` files are git-ignored. Never commit real secrets.

## 3. Deploy on Vercel
1. https://vercel.com/new -> import the GitHub repo. Framework preset: **Other**. No build command; leave the output directory empty (Vercel serves `public/` and `api/` automatically).
2. Before deploying, add **Environment Variables** (Project Settings -> Environment Variables):

| Name | Value |
|---|---|
| `JIRA_BASE_URL` | `https://rategain.atlassian.net` (no trailing slash) |
| `JIRA_EMAIL` | email of the Atlassian account that owns the token |
| `JIRA_API_TOKEN` | the token from step 1 |
| `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `SESSION_SECRET` | Microsoft sign-in for @rategain.com only (**recommended**, see "Company-only access") |
| `DASHBOARD_PASSWORD` | alternative: one shared password (ignored when Microsoft sign-in is configured) |
| `DASHBOARD_TZ` | optional, default `Asia/Kolkata` |
| `JIRA_QUEUE_FIELD` | optional, default `customfield_15446` |
| `JIRA_SLA_FIELD` | optional, default `customfield_10703` |

3. Deploy. Your static URL is the production domain, e.g. `https://<project>.vercel.app` (you can attach your own domain under Settings -> Domains). Every `git push` to `main` redeploys to the same URL. If you change env vars, redeploy once.

> The dashboard shows internal ticket data. Without Microsoft sign-in or `DASHBOARD_PASSWORD`, anyone who knows the URL can see it.
> The password is checked on the server for every API call. The browser keeps it in `sessionStorage` only until the tab is closed.

## Company-only access (Microsoft 365 sign-in, @rategain.com)
Instead of a shared password, the dashboard can require each person to sign in with their Rategain Microsoft account. Anyone else (other tenant, personal Outlook/Gmail, guest accounts) is refused. It switches on automatically when the `MS_*` variables are set.

1. Open https://entra.microsoft.com (needs an admin, or ask IT) -> **Entra ID -> App registrations -> New registration**.
2. Name: `IT Ticket Dashboard`. Supported account types: **Accounts in this organizational directory only (single tenant)**.
3. Redirect URI: platform **Web**, value `https://<your-project>.vercel.app/api/auth/callback`. Register.
4. On the Overview page copy **Application (client) ID** -> `MS_CLIENT_ID` and **Directory (tenant) ID** -> `MS_TENANT_ID`.
5. **Certificates & secrets -> New client secret** -> copy the **Value** (shown once) -> `MS_CLIENT_SECRET`.
6. Generate a random string for `SESSION_SECRET` (e.g. `openssl rand -base64 32`).
7. Add the four variables in Vercel (Settings -> Environment Variables) and **Redeploy**. Optionally set `APP_URL` to the exact dashboard URL.
8. Share the Vercel URL with colleagues. They click **Sign in with Microsoft** once; the session lasts 12 hours.

How it is enforced: the server (not the browser) checks a signed, HttpOnly session cookie on every `/api/*` call, and the sign-in only succeeds when the token comes from your tenant **and** the e-mail ends with `@rategain.com`. If sign-in is half-configured the API refuses everything rather than opening up. Using a different custom domain later? Add its `/api/auth/callback` URL as an extra Redirect URI in Entra and set `APP_URL`.

## Run locally
```bash
npm i -g vercel
cp .env.example .env.local      # fill in values
vercel dev                      # http://localhost:3000
npm test                        # unit/API tests, no Jira needed
```

## Customising
- **People / buckets:** edit `buckets` in `lib/config.js` (name, Atlassian `accountId`, colour). Unassigned buckets use the queue field value (`Manage-DCOPS`, `Manage-ITOPS`).
- **Queues:** edit `queues` in `lib/config.js`.
- **Projects:** edit `projects` in `lib/config.js`.
- To find an account ID: open the person's Jira profile; the ID is in the URL (`/people/<accountId>`).

## Notes and limits
- 7 Days = rolling last 7 x 24h from the moment of the request. 1 Month = 30 days, 1 Year = 365 days; these two show **counts only** (loaded on click, cached 5 min).
- Ticket lists load up to 20 pages x 100 issues per query; if exceeded the page shows a "truncated" notice.
- Counts for 1 Month / 1 Year use Jira's `approximate-count` endpoint and can be slightly approximate on very large result sets.
- Jira comment text is not copied; the "resolution notes" section uses the resolution field.
- Function run time uses Vercel's default limit for your plan. If you ever see timeouts, add `"functions": {"api/**/*.js": {"maxDuration": 30}}` to `vercel.json` (only works when the `api` folder is present at the repo root).
- Jira Cloud rate-limits per token; the client retries on 429/503 automatically.
