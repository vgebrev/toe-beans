# Runbook: Sentry

Sets up error reports for prod (architecture §9, D10; backlog S14.1, S14.4). The app sends unexpected
errors only, from the server (`@sentry/node`) and the browser (`@sentry/browser`, loaded only when a
DSN is set). There's no tracing, replay or breadcrumbs, and both sides drop the request, the user,
cookies and headers and mask sensitive text before sending (`scrubEvent`, `scrubBrowserEvent`).

This file is public. It names settings, never values.

| | |
|---|---|
| Plan | Developer (free): one user, about 5k errors a month, 30 days' retention |
| Data region | **EU** (Frankfurt), like Auth0. Chosen when the organization is created and can't be changed |
| Organization | `toe-beans` |
| Project | `toe-beans`, one project for both server and browser (one `SENTRY_DSN`) |
| Environments | `prod` (Cloud Run), `local` (only if you set a DSN locally, which you shouldn't need to) |
| Release | The commit's first 12 characters (`APP_RELEASE`, set by the deploy workflow) |
| DSN lives in | The GitHub `production` environment's variable `SENTRY_DSN` (it's public: the browser gets it) |

## 1. Create the organization

1. Sign up at sentry.io. When it asks where to store data, choose **European Union**. Name the
   organization `toe-beans`.
2. **User settings → Security:** turn on two-factor authentication. Then **Organization settings →
   General → Security & Privacy:** turn on **Require Two-Factor Authentication**.
3. In the same **Security & Privacy** section:
   - **Data Scrubber:** on. **Use Default Scrubbers:** on.
   - **Prevent Storing of IP Addresses:** on. The app never sends one on purpose, but the SDK and
     ingestion can infer the browser's address (NFR-02).
   - **Scrub Data:** on.

## 2. Create the project

1. **Projects → Create project**, platform **Node.js** (the browser's events arrive in the same
   project and are told apart by their SDK), name `toe-beans`, alert setting **Alert me on high
   priority issues** for now (step 4 sets it properly).
2. Skip Sentry's setup steps, including `npx @sentry/wizard`: the app is already instrumented
   (S0.4). The wizard would rewrite the hooks and `vite.config.ts` with tracing, replay and
   default data collection on, and add a source-map upload with an auth token.
3. **Project settings → General:**
   - **Allowed Domains:** `toebeans.co.za`. Browser events from any other origin are refused, so the
     public DSN can't be used to fill the quota from another site.
4. **Project settings → Inbound Filters:** turn on *browser extensions*, *legacy browsers* (all),
   *web crawlers* and *localhost*.
5. **Project settings → Client Keys (DSN):** on the default key, set a rate limit of 100 events per
   hour, so a loop of errors can't use up the month's quota in an afternoon. Spike protection
   (organization level) stays on, as it is by default.
6. Copy the key's **DSN** (`https://…@o….ingest.de.sentry.io/…`).

## 3. Turn it on in prod

1. GitHub → **Settings → Environments → production → Variables:** add `SENTRY_DSN` with the DSN.
2. Run the deploy (**Actions → Deploy → Run workflow** on `main`, or the next merge). The workflow
   passes the variable to Cloud Run only when it's set; removing it and redeploying turns reporting
   off again.
3. Check both sides send:
   - **Browser:** open `https://toebeans.co.za`, sign in, open DevTools' console and run
     `setTimeout(() => { throw new Error('Sentry check (browser)') })`. The issue appears within a
     minute with environment `prod` and the release.
   - **Server:** no route throws on demand. The first real server error shows it works; until
     then, Cloud Run's logs at startup show the config without errors.
4. Open the browser check's event and confirm it has no IP address, no user, no cookies and no
   request URL. Resolve the issue.

The CSP already allows `https://*.sentry.io` in `connect-src`, which covers the EU ingest host.

## 4. Alerts (S14.4)

1. **Alerts → Create alert → Issues:** environment `prod`, when *a new issue is created* or *an
   issue changes state from resolved to unresolved*, send an email to you. Name it
   `New or regressed issue`.
2. Delete or disable the default alert the project came with, so each error emails once.
3. **User settings → Notifications:** keep *Weekly reports* on; turn off workflow emails you don't
   want.

## Known limits

- **Browser stack traces are minified.** No source maps are uploaded: that needs a Sentry auth token
  in the deploy workflow and the build to emit maps. The release name and the error message are
  usually enough at this size; add the upload if an error can't be placed.
- **The free plan has one user.** Anyone else who needs to see errors gets a screenshot, not a seat.
- **Quota.** At about 5k errors a month, a persistent error in a loop is the risk, hence the key's
  rate limit. Sentry emails when the quota is near.

## Rotating the DSN

If the DSN is abused despite Allowed Domains: create a new key under **Client Keys**, update the
GitHub variable, redeploy, then disable the old key.
