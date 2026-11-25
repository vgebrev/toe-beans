# Toe Beans — Security Audit

**Version:** 0.8
**Date:** 25 November 2026
**Status:** §1–§6, the code review: every finding fixed or decided (S15.2). §7, the external pentest: both findings fixed (S18.3). §8, found since: fixed. §9, the second review of code and infrastructure: open, for triage (R2 fixed).
**Inputs:** `docs/requirements.md` v1.0, `docs/architecture.md` v1.21, the code at commit `1ea686e` (`develop`); for §7, prod on 1.0.4 and the repo at `main` `904516e`; for §9, `docs/architecture.md` v1.48, the repo at `develop` `c965642`, and prod on 1.1.0 with its GCP, Cloudflare and GitHub settings as read on 24 November 2026

**Changes in 0.1:** first audit of the attack surface before release.

**Changes in 0.2:** a resolution under each finding and in the summary: F1–F7 fixed in code (architecture D32, D33), C3 fixed with a per-person write budget, C1, C2 and C4 accepted with checks moved to S14.1 (D34). A seventh advisory, in `@sveltejs/adapter-node`, appeared after the audit and is fixed.

**Changes in 0.3:** §7, the first external pentest (S18.2, 22 November 2026), run on prod from outside as `docs/runbooks/pentest.md` describes: no critical, high or medium findings, household isolation confirmed live, one low finding and one informational, and a suspected lockout disproved. Open findings are summarised without detail until fixed (runbook §7).

**Changes in 0.4:** §7: both pentest findings fixed (S18.3, architecture 1.41): P1, now described, by revoking the invitations of someone who leaves or deletes their account (D18); P2 by reading a weakened ETag in `If-Match` (§3.3).

**Changes in 0.5:** §8, findings since the pentest: E1, the edge Worker sending its proxy secret to a host named in the path, found while checking the edge for S19.3 and fixed the same day.

**Changes in 0.6:** §7.4's CI note: since S19.6 the nightly backup holds its own credentials as secrets of GitHub's `backups` environment instead of reading them from Secret Manager through Workload Identity Federation (architecture 1.47, D36). The app's secrets stay in GCP.

**Changes in 0.7:** §9, a second defensive review of the code and the infrastructure after S19 (the spending cap, the single app secret, the backup's move to GitHub secrets): no critical or high findings and household isolation still holds; three medium findings about availability, cost and dependency alerts rather than data (R1 to R3), eight low (R4 to R11), and five items to check where this review couldn't read the setting (C5 to C9). R1 (its IAM fix) and R4 were then built as backlog S19.8, not yet on prod.

**Changes in 0.8:** §9.2 R2 fixed: Dependabot alerts on; automated security updates stay off, since they'd open pull requests against `main`, and alerts go through `develop` by hand (architecture 1.50, D15). The production tree's `glob` advisory and two of the dev ones are fixed by updates; one dev-only path is left.

---

## 1. Summary

No critical or high-severity issues were found, and no way for one household to reach another's data (NFR-01, NFR-02, scenario 9). The real gaps are in rate limiting, missing security headers and an unsafe config default.

| # | Finding | Severity | Confidence | Resolution |
|---|---|---|---|---|
| F1 | Sign-in and invitation rate limits share one global bucket | Medium | Confirmed | Fixed in code (D32); address header in S14.1 |
| F2 | Invite emails can be used as a spam or phishing relay | Medium | Confirmed | Fixed (D32) |
| F3 | Security headers from architecture §7 are not implemented | Medium | Confirmed | Fixed (D32) |
| F4 | `APP_ENV` defaults to `local`, and the image doesn't set it | Low | Confirmed | Fixed (§8.1) |
| F5 | No limiter or quota on photo uploads | Low | Confirmed (memory impact not measured) | Fixed (D32) |
| F6 | Push devices are upserted by endpoint alone | Low | Confirmed | Fixed (D33) |
| F7 | Sessions can't be revoked | Low | Confirmed | Fixed (D33) |
| C1 | Platform request logs may hold invite tokens and sign-in codes | Low | Worth checking | Accepted (D34); retention checked in S14.1 |
| C2 | Trust in Auth0's `email_verified` depends on tenant settings | Low | Worth checking | Accepted (D34); prod tenant checked in S14.1 |
| C3 | Open sign-up with few per-user quotas | Low | Worth checking | Fixed (D32) |
| C4 | Dependency advisories | Low | Worth checking | adapter-node fixed; the rest accepted (D34) |

Fix first: F1, F2, F3 (§6). All are resolved; each finding below ends with its resolution.

## 2. Scope and method

A read-through of the attack surface, not of every file:

- authentication and session handling;
- authorization and household isolation;
- input handling: injection, deserialization, file uploads, redirects;
- secrets and configuration;
- everything internet-facing: API routes, the tick endpoint, CSRF, rate limiting;
- dependencies, with `pnpm audit`.

Limits of the method:

- **"Confirmed"** means the code path was traced by reading it. Nothing was exploited against a running system.
- **"Worth checking"** means plausible but not verified, usually because it depends on deployed settings that aren't in the repo.
- No tests and no build were run. `pnpm audit` was the only command that reached outside the repo.
- The production environment doesn't exist yet (S14.1), so Cloud Run, Cloudflare, Atlas, R2 and Auth0 settings were not inspected. `spikes/` was out of scope.

## 3. Confirmed findings

### F1. Sign-in and invitation rate limits share one global bucket — medium

- **Where:** `packages/backend/src/http/auth.ts:124`, fed by `getClientAddress()` in `apps/web/src/routes/auth/sign-in/+server.ts:11` and `apps/web/src/routes/auth/callback/+server.ts:11`. The invitation limiter at `packages/backend/src/http/household.ts:93` has the same problem.
- **What an attacker could do:** `ADDRESS_HEADER` and `XFF_DEPTH` are set nowhere, so on Cloud Run every request has the same client address and shares one key. About 30 unauthenticated `GET /auth/sign-in` requests per 10 minutes lock everyone out of signing in. The same trick blocks invitation previews and accepts.
- **Already known:** architecture §7 ("Client address") calls this "a nuisance, not a hole", and S14.1 plans the fix. This audit rates it higher, because it is a cheap sign-in outage for all users.
- **Fix:** do the S14.1 work before launch: the Worker forwards `CF-Connecting-IP`, and `ADDRESS_HEADER`/`XFF_DEPTH` are set to match. Also make the app reject requests that lack the Worker's shared-secret header. Otherwise anyone calling `run.app` directly can spoof the address header and rotate keys, which turns the limit off again.
- **Resolution (0.2, D32):** with `PROXY_SECRET` set, which prod requires, the hook refuses any request without the Worker's `x-toe-beans-proxy` header (403), except `/internal/tick` and the probes. S14.1 makes the Worker send the secret and the client's address, sets `ADDRESS_HEADER` to match, and checks from a phone that the app sees the phone's address. Until then the limit stays global, as before.

### F2. Invite emails can be used as a spam or phishing relay — medium

- **Where:** `packages/backend/src/application/household/invitations.ts:163` (the limit is keyed on `householdId`), `:140` (subject and body), `packages/backend/src/composition.ts:138` (10 per hour, in memory).
- **What an attacker could do:** any signed-up user can send mail from `invites@toebeans.co.za` to arbitrary addresses, with a display name and a household name of up to 100 characters each, of their choosing, in the subject and body. The limit is per household, so leaving (which deactivates the household) and creating a new one gives a fresh budget. So does a restart or a second instance, since the counter is in memory. Besides the harm to recipients, this risks the sending domain's reputation.
- **Fix:** key the limit on `userId` as well as the household, add a global daily cap, and consider persisting the counter. Consider keeping user-chosen names out of the subject line.
- **Resolution (0.2, D32):** the in-memory limiter is gone. Caps are counted from the stored invitations of the last 24 hours: 10 per person (across households), 20 per household and 100 in total, so leaving, a restart or a second instance gives no fresh budget. The subject is now *You're invited to Toe Beans*; the names stay in the body.

### F3. Security headers from architecture §7 are not implemented — medium

- **Where:** `apps/web/vite.config.ts:52` has no `csp` option. `apps/web/src/app.html:20` uses `%sveltekit.nonce%`, which renders empty without it. No HSTS, `Referrer-Policy`, `Permissions-Policy` or `frame-ancestors` is set in `apps/web/src/hooks.server.ts` or anywhere else.
- **What an attacker could do:** nothing directly today. No `{@html}` or other script sinks were found, and the `SameSite=Lax` session cookie means a cross-site frame is signed out. But any future XSS would have no second line of defence, and the architecture document says these headers exist.
- **Fix:** add the Kit CSP config (`script-src 'self'` with nonces, `frame-ancestors 'none'`) and set the other headers in `handle`. S15.2 already lists "headers and CSP".
- **Resolution (0.2, D32):** Kit's CSP in nonce mode (`vite.config.ts`) and HSTS, `Referrer-Policy`, `Permissions-Policy`, `nosniff` and COOP from the hook (`packages/backend/src/http/edge.ts`). The e2e smoke tests check the headers and fail on any console error, CSP violations included. There's no `form-action`, because signing out redirects to the provider after a form POST.

### F4. `APP_ENV` defaults to `local`, and the image doesn't set it — low

- **Where:** `packages/backend/src/config.ts:46`, `docker/Dockerfile:28`.
- **What an attacker could do:** nothing directly. If the Cloud Run service omits `APP_ENV=prod`, every prod guard is skipped silently:
  - invite emails, with their tokens and addresses, go to the console and so to Cloud Logging;
  - http origins are allowed;
  - `PUSH_SERVICE_ORIGINS` is accepted, which widens where the server will send push requests;
  - VAPID keys regenerate on each start.
- **Fix:** set `ENV APP_ENV=prod` in the image's runtime stage and override it to `local` in the compose `app` profile. Alternatively, refuse to start when `NODE_ENV=production` and `APP_ENV` is unset.
- **Resolution (0.2):** done as suggested: the image sets `APP_ENV=prod`, and compose's `app` profile sets `local` (architecture §8.1).

### F5. No limiter or quota on photo uploads — low

- **Where:** `packages/backend/src/application/dogs/dogs.ts:28`, `:145`, `:228`; `packages/backend/src/infrastructure/photos/sharp-processor.ts:10`; `apps/web/src/lib/server/dog-form.ts:8`.
- **What an attacker could do:** a signed-in member can send several 10 MB, 50-megapixel uploads in parallel. Each is fully buffered and then decoded, which could exhaust a 512 MB instance and take the app and the reminder tick down with it. The memory use was not measured.
- **Related:** there is no cap on dogs per household, and architecture §7 says "uploads get their own limiter in their slice", but none exists.
- **Fix:** add a per-user upload limiter and a small concurrency cap around `process()`, plus a dogs-per-household maximum.
- **Resolution (0.2, D32):** `PHOTO_RATE_LIMIT` uploads per person an hour (default 20), checked before decoding; the sharp adapter decodes one photo at a time; and a household has up to 50 dogs, archived ones included. The per-person write budget (C3) also counts uploads before the body is read.

### F6. Push devices are upserted by endpoint alone — low

- **Where:** `packages/backend/src/infrastructure/persistence/reminder-collections.ts:62`.
- **What an attacker could do:** a member who knows another user's push endpoint URL can re-register it under their own account, which silently stops the victim's reminders. Endpoints are never returned by the API, so this needs a leak from elsewhere. The attacker gains no data: reminders are sent per user, to that user's own devices.
- **Fix:** if the endpoint already belongs to a different user, require proof it is the same browser, or accept the handover as a logged, deliberate case (a phone handed to someone else).
- **Resolution (0.2, D33):** the proof is the subscription's keys. An endpoint stored for someone else moves only if `p256dh` and `auth` match, which only the browser holding the subscription knows; otherwise the save is refused and logged. A handed-over phone still follows its new owner.

### F7. Sessions can't be revoked — low

- **Where:** `packages/backend/src/application/auth/auth.ts:52-54`.
- **What an attacker could do:** a stolen session cookie works for 90 days idle and up to 400 days absolute. The `userId` index on sessions exists for "sign out everywhere" (migration 0001), but nothing uses it.
- **Fix:** add a sign-out-everywhere action, and consider a shorter idle window.
- **Resolution (0.2, D33):** *Sign out everywhere* on More ends every session of the person and removes their push devices. The 90-day idle window stays, on the owner's call: the app lives on a personal phone.

## 4. Worth checking (not verified)

### C1. Platform request logs may hold tokens — low

The app logs route IDs only, never paths or queries. Cloud Run and Cloudflare request logs record full URLs, though, including `/join/<token>` and `/auth/callback?code=…`. Invitations are single-use for 7 days and sign-in codes are PKCE-bound, so the exposure is small. Check log retention and who can read the logs.

**Resolution (0.2, D34):** accepted. S14.1 checks the retention and that only the owner can read Cloud Run's and Cloudflare's logs.

### C2. Trust in Auth0's `email_verified` — low

Account linking and email invitations depend on it (`packages/backend/src/application/auth/auth.ts:222`). This is safe with only Google and the database connection, as `docs/runbooks/auth0.md` says. Confirm the prod tenant has every other connection turned off.

**Resolution (0.2, D34):** accepted. The Auth0 runbook now says why only Google and the database connection may be on, and S14.1 checks the prod tenant.

### C3. Open sign-up with few per-user quotas — low

Anyone can register, create a household and write unlimited logs, events, link invitations and dogs. That is a storage-exhaustion risk on the Atlas and R2 free tiers. A general per-user write limit would cover it.

**Resolution (0.2, D32):** fixed. Every non-GET API request of a signed-in person counts against `WRITE_RATE_LIMIT` per 10 minutes (default 300), on top of the caps on dogs, cues, series and email invitations.

### C4. Dependency advisories — low

`pnpm audit` reports 6 advisories: 5 moderate and 1 low.

- Two are in the production tree: `glob` (GHSA-3g3m-2fjr-6pw4) and `minimatch` (GHSA-g3hv-75wg-m249), both through `@sentry/node > @sentry/bundler-plugins`. They look like build-time code rather than anything on a request path.
- The rest are in dev tooling, including `deepmerge` (GHSA-gcqx-w48m-w2h4) through `@sveltejs/vite-plugin-svelte`.

**Resolution (0.2, D34):** a later `pnpm audit` also reported `@sveltejs/adapter-node` 6.0.0 (GHSA-rqw3-x7hx-mm3p, a server crash on the request path), now 6.0.1. The `glob`, `minimatch` and `deepmerge` advisories are accepted: none of them is in the server bundle (checked with a grep of `apps/web/build`), and Dependabot brings the fixes.

## 5. Areas that look solid

- **Household isolation:** every household-owned repository goes through `HouseholdCollection`, which puts `householdId` last in the filter so a caller can't replace it. `householdId` comes only from the session's membership, never from a request, and referenced dogs and sessions are looked up inside the household. The only cross-household reads are the worker's.
- **OIDC sign-in:** Authorization Code with PKCE, state and nonce; the ID token's signature is checked; the pending sign-in is one-time and bound to a hashed cookie handle; unverified emails are refused.
- **Sessions and cookies:** 256-bit tokens stored as SHA-256; `__Host-` prefix, `HttpOnly`, `Secure`, `SameSite=Lax`; membership is re-read on every request, so a removed member loses access at once.
- **CSRF:** every non-GET request is checked against `PUBLIC_BASE_URL` in the hook, so Kit's disabled check (`apps/web/vite.config.ts:64`) is covered.
- **Redirects:** `safeReturnTo` blocks off-origin targets and sign-in loops; notification clicks stay inside the app's scope.
- **Invitations:** hashed 256-bit tokens, a single-use claim inside a transaction, the email match enforced, and invitations revoked when a member is removed or the household empties.
- **Injection:** IDs and tokens are regex-checked before they reach a query, bodies go through Zod, and query parameters are strings only.
- **Photos:** re-encoded to WebP with EXIF dropped, a pixel limit, keys built server-side, served with `nosniff` and private caching, and a path-traversal guard on the filesystem store.
- **Push SSRF:** endpoints must match an https allowlist of push services; the test override is refused in prod.
- **`/internal/tick`:** a timing-safe shared secret or a Google-signed JWT with audience and invoker checks; refused when neither is configured.
- **Secrets and logging:** nothing in the repo or its git history; `.env` is ignored by git and Docker; config errors never print values; logs and Sentry scrub emails, connection strings and bearer tokens.
- **CI and image:** a read-only token, no secrets, actions pinned by commit SHA, a Dependabot cooldown; the container runs as a non-root user.

## 6. Fix first

1. **F1, rate-limit keying:** set the client address correctly and require the Worker's header secret, so one person can't lock everyone out of sign-in.
2. **F2, invite email abuse:** limit per user and globally before real mail is switched on.
3. **F3, security headers:** turn on the CSP and set the other headers. It is a small change, and the architecture document already claims it.

## 7. External pentest, 22 November 2026 (S18)

An outside-in assessment of prod on 1.0.4, the public repo with its full history, and CI, run under `docs/runbooks/pentest.md` from its isolated container. The tester had only what any member of the public has: the repo, the app, and three test accounts signed up with email and password (two each owning a household, one in none). Its report stays private (runbook §7); this section carries its findings over.

### 7.1 Summary

No critical, high or medium findings. No way was found for one household, or a person in none, to read or change another household's data: the core promise (NFR-01, NFR-02, scenario 9) holds, confirmed against the running system.

| # | Finding | Severity | Confidence | Resolution |
|---|---|---|---|---|
| P1 | Leaving a household by choice keeps the leaver's invitations open | Low | Confirmed live | Fixed (D18) |
| P2 | `If-Match` refuses the weak form of an ETag the edge has weakened | Info | Confirmed live | Fixed (§3.3) |
| — | A sole owner leaving strands the household with no owner | — | Confirmed live | Not a finding: the longest-standing member takes over (D18) |

"Confirmed live" means exercised against prod as the test accounts; "code only" means traced by reading the code.

### 7.2 Findings

**P1. Leaving a household by choice keeps the leaver's invitations open — low.** `removeMember` (`packages/backend/src/application/household/household.ts`) revoked the invitations a member made or was sent only when an owner removed them, as D18 then said: someone leaving by choice kept theirs, in case they were for a person the household still wanted. Live, a caregiver made a link invitation, left while the owner stayed, and the invitation still previewed as open, with the household's and dogs' names. A link is a bearer token that outlives its maker's membership, so the person who left, or anyone they had handed it to, could join again with no current member acting. Members could see and revoke it in the household's list, which kept it low. Deleting an account while others stayed in the household had the same gap, and someone who signed up again could have used their old link.

- **Resolution (0.4, D18):** leaving by choice and deleting an account now revoke the person's invitations, those they made and those sent to their address, as removal does. The *Leave household* sheet says so, and the household invites anyone it still wants again.

**P2. Weak ETags and `If-Match` — info.** Responses leave the origin with a strong ETag (`"2"`, `packages/backend/src/http/etag.ts`) and can arrive weakened (`W/"2"`), as an edge does when it compresses a body. Sent back as `If-Match: W/"2"`, a change is refused as stale (412, *Someone else changed this*), because `versionFromIfMatch` reads anything but the strong form as a version that can't match. No access is gained; the risk is a legitimate save refused. The app itself echoes the ETag it was sent, so a save could have been refused this way whenever a response was compressed on its way.

- **Resolution (0.4, §3.3):** `versionFromIfMatch` reads the version from `W/"7"` as from `"7"`. Anything else that can't be ours (`*`, a list) is still a 412.

### 7.3 Defences confirmed live

- **Household isolation.** Signed in to another household and to none, the tester sent `GET`, `PATCH` and `DELETE` for the exact IDs of a dog, cue, planned session, session log, behaviour event and care task in the first household, and its dog's photo. Every one was a 404 (a `PATCH` failed the strict body check first, a 400). None read or wrote anything.
- **Scope can't be widened by input.** A `householdId` query parameter was ignored; create bodies carrying `householdId`, `_id`, `id` or `version` were refused by the strict contracts (no mass assignment).
- **CSRF.** A write with a foreign `Origin`, or with `Sec-Fetch-Site: cross-site` and no `Origin`, is a 403; the same-origin control succeeds.
- **Push SSRF.** Device endpoints on an attacker's host, the metadata address, a look-alike of a push service's host and a URL with credentials were all refused (400) and never fetched.
- **Cookies.** `__Host-` session cookie, `HttpOnly`, `Secure`, `SameSite=Lax`; the sign-in cookies are cleared on callback; no tokens in browser storage.
- **The origin behind the Worker (F1).** Cloud Run refuses app routes without the Worker's header secret (403); only the probe and `/internal/tick` answer, and the tick is a 401 without a valid bearer. The rate limits' client address can't be spoofed by going around the edge.
- **Headers (F3).** CSP in nonce mode with `object-src 'none'`, `base-uri 'self'` and `frame-ancestors 'none'`; HSTS for two years, `Referrer-Policy`, `nosniff`, COOP and `Permissions-Policy`.
- **Auth0 (C2).** The hosted login offers only Google and the database connection, with Authorization Code, PKCE (S256), state and nonce; unverified emails are refused at callback.
- **Probes.** Scanner paths are refused at the edge; unknown API paths stay behind sign-in (401); `www` redirects to the apex.
- **Write budget (C3).** A paced run of invalid writes stayed healthy and stored nothing. The limit itself wasn't driven to its threshold.
- **Invitation email (F2).** The subject is fixed server-side and caps are counted from stored invitations.

### 7.4 Reviewed in code, no issue found

- **Secrets:** none in the repo or any commit, pull-request ref or tag GitHub serves; only labelled placeholders and e2e constants.
- **CI:** a read-only token and no secrets in CI, no `pull_request_target` or `workflow_run`; deploy and backup are gated on the owner's approval and use Workload Identity Federation, so GitHub holds no cloud keys (since S19.6 the backup holds its own credentials as `backups` environment secrets instead, D36); actions pinned by commit SHA.
- **`/oops`:** forwards only envelopes for the server's own DSN, only to its ingest host; bounded, rate-limited, and stripped of the sender's address, Referer and cookies.
- **Sign-in and sessions, invitations, photos, injection and role checks:** as §5 describes.

### 7.5 The engagement

The runbook's rules held: writes only to the test accounts' own data, nothing aimed at the providers, no load, nothing published, and no credential found or used. All budgets stayed well inside their limits: about 170 requests to the app (of 5,000), 5 straight to Cloud Run, 3 sign-ins, 1 invitation email, 2 tick requests, no photo uploads or error reports, and about 18 documents. `/readyz` stayed 2xx throughout, so no uptime alert was expected; the platform logs were expected to show the refused origin and tick requests. The tester deleted the three test accounts with *Delete account* at the end, which erased their households.

## 8. Found since the pentest

| # | Finding | Severity | Confidence | Resolution |
|---|---|---|---|---|
| E1 | The edge Worker sends its proxy secret to a host named in the path | Medium | Confirmed in code; the crash on `//` confirmed live | Fixed, secret rotated (23 November 2026) |

**E1. The Worker sends its proxy secret to a host named in the path — medium.** Found on 23 November 2026 while checking the edge for tracking scripts (backlog S19.3): `https://toebeans.co.za//` answered Cloudflare's error 1101, an exception in the Worker. `infra/edge/worker.js` built the upstream URL as `new URL(url.pathname + url.search, ORIGIN)`. A path starting `//` is a scheme-relative reference, so `//attacker.example/x` resolved to `https://attacker.example/x`, and the Worker sent the request there with `x-toe-beans-proxy` (D32) and `x-toe-beans-client` set; a bare `//` threw. Anyone could have collected the secret with one request. With it they could call Cloud Run directly, past the WAF rule (D42), and set `x-toe-beans-client` to anything, getting round the per-address rate limits (§7, F1). Sign-in, the session and the household checks still apply to every route, so it gave no access to data. Confirmed with Node's URL parser rather than against prod, which would have sent the secret out. Whether anyone used it can't be known: Worker logs are off (D34), and Cloud Run sees the Worker's requests and any made with the secret alike. The pentest (§7) tested the origin with no secret and with a wrong one, not how the Worker builds its upstream URL.

- **Resolution:** the Worker joins the origin and path as text (`ORIGIN + url.pathname + url.search`), so the host is always the Cloud Run service; deployed, and `proxy-secret` rotated and the app redeployed onto it. Live afterwards, `//` redirects to sign-in and `//example.com/x` is the app's own 404. The pentest runbook (§5) now has the tester try paths that could change the upstream host.

## 9. Second review, 24 November 2026: code and infrastructure

A read-only review after S19, following a request from the internet to the data: Cloudflare, then Cloud Run and the rest of GCP, then the app, with GitHub alongside. It covers what changed since §7 (the spending cap, D45; one app secret, `app-secrets`; the backup's credentials in GitHub; the terms gate, S19.1; the edge's maintenance page) and re-reads the settings no earlier review could see.

**Method.** `gcloud` describes, lists and IAM reads; `gh api` GETs; Cloudflare API GETs with wrangler's own sign-in; plain browser-style GET and HEAD requests, DNS lookups and TLS handshakes against prod; `pnpm audit`. Nothing was created, changed or deployed, and no secret value was read. No build or tests were run. Limits:

- wrangler's sign-in can read Workers, R2 and Access but not the zone's settings, DNS records, rulesets or DNSSEC. Those were judged from outside (DNS, TLS and response headers), and what can't be seen that way is under §9.3.
- The `gh` token lacks `admin:repo_hook`, so webhooks and secret-scanning alerts weren't listed.
- Atlas and Auth0 have no CLI here; they rest on §7 and on `docs/runbooks/accounts.md`.

"Confirmed" means seen in the live configuration, traced in code, or shown by a live request; how is named in each case.

### 9.1 Summary

No critical or high findings. Nothing found lets one household reach another's data, or anyone reach the app's secrets: the code added since §7 keeps every query inside the viewer's household, and the cloud identities are narrow. What's open is mostly availability and cost. Since S19 the app has a kill switch, the spending cap, and anyone who can send cheap requests to `run.app` can pull it.

| # | Finding | Severity | Confidence |
|---|---|---|---|
| R1 | A flood straight at `run.app` runs up the bill, and the spending cap then closes the app | Medium | Confirmed in config and live; the spend rate is estimated |
| R2 | Dependabot alerts and security updates are off | Medium | Confirmed; fixed 25 Nov (alerts on) |
| R3 | The site fails for the rest of the day after 100,000 Worker requests, a quota shared with two other sites | Medium | Confirmed in config; the quota wasn't exhausted |
| R4 | `/readyz` answers at `run.app` without the proxy secret and pings Atlas on every call | Low | Confirmed live and in code |
| R5 | Plain `http://toebeans.co.za` serves the app; HSTS isn't preloaded | Low | Confirmed live |
| R6 | TLS 1.0 and 1.1 are accepted at the edge | Low | Confirmed live |
| R7 | Firebase leftovers: a service account that can impersonate every other, an API key, a Hosting site | Low | Confirmed in config |
| R8 | Pages carry no `Cache-Control`, and the edge caches any response at a static-looking extension | Low | Caching confirmed live; no leaking page found |
| R9 | `main` doesn't require a pull request, admins bypass it, any action may run, and there's no code scanning | Low | Confirmed |
| R10 | Reads of `app-secrets` aren't audit-logged | Low | Confirmed |
| R11 | No CAA records or DNSSEC | Low | Confirmed live |
| C5 | Cloudflare settings this review couldn't read: rate limiting, WAF rules, SSL mode | — | Worth checking |
| C6 | `send.toebeans.co.za` is a CNAME to `send.forge.rmta.net` | Low | Worth checking |
| C7 | The backup's R2 token can delete every backup; no bucket lock | Low | Worth checking |
| C8 | Atlas is reachable from anywhere, guarded by its password | Low | Known (accounts.md R3); worth checking |
| C9 | Webhooks, secret-scanning alerts and the Auth0 tenant weren't re-read | — | Not checked |

### 9.2 Confirmed findings

**R1. A flood straight at `run.app` runs up the bill, and the spending cap then closes the app — medium.**

- **Where:** Cloud Run `toe-beans`: ingress `all`, `allUsers` holds `roles/run.invoker`, `max-instances=1`, request-based billing. The `toe-beans` budget is US$1 (`infra/gcp/provision.sh`), and the cap acts on it (`infra/spending-cap/cap.js`). `packages/backend/src/http/edge.ts:68` logs a warning for every refused request.
- **What an attacker could do:** send a steady stream of requests to `https://toe-beans-1047834821273.africa-south1.run.app/` (or the hashed `…-bq.a.run.app` URL). Cloudflare isn't in that path, so neither the WAF, the Worker's quota nor any edge rate limit applies. Every request is a 403 (checked live) but still bills. After the free 2 million requests a month, each further million costs US$0.40, and that isn't bounded by `max-instances`. At a few hundred requests a second from one machine, the free allowance and the US$1 budget are both gone within hours. When the late budget figure arrives, the cap takes `allUsers` off and the app shows *Toe Beans is paused* until the owner restores it by hand. Each refused request also writes two log entries (Cloud Run's request log and the app's warning), and Cloud Logging bills ingestion past 50 GiB a month, so a long flood costs more in logs than in requests. No data is exposed. The harm is an outage for everyone, at the attacker's choosing, plus whatever is spent before the budget figure catches up.
- **Also:** D45 says `max-instances=1` bounds Cloud Run "at roughly US$60–100 a month at worst". That bound covers instance time only, not per-request fees or log ingestion, so the cap is the only real bound, and it acts late.
- **Fix:**
  1. Make a refused request cost less. Log the refusal at `debug`, or at most once a minute, in `edge.ts`. Add a log exclusion for the platform's request log of refused direct calls, which costs nothing and stops their ingestion:
     `gcloud logging sinks update _Default --project toe-beans-co-za --add-exclusion=name=origin-refused,filter='resource.type="cloud_run_revision" AND resource.labels.service_name="toe-beans" AND httpRequest.status=403 AND NOT httpRequest.requestUrl:"toebeans.co.za"'`.
     Check the filter in Logs Explorer first: if the request URL doesn't show the public host, filter on `httpRequest.userAgent` or drop that clause and accept losing all 403 request lines.
  2. Correct D45's bound in the decision log, and say there that a flood can trip the cap on purpose. The runbook (`spending-cap.md`) should then expect "someone flooded `run.app`" as a cause.
  3. To close the gap fully, put Google's IAM in front of the app instead of the header secret. Remove `allUsers`, give a dedicated service account `run.invoker`, and have the Worker send a Google ID token for it. Requests without one are refused by Google's front end before any instance starts. Worth checking: whether such refusals bill at all. The cost is a service account key held as a Worker secret (narrow, only able to invoke, but a key, against D15's keyless stance), and the cap would remove that account instead of `allUsers`. Record the choice either way in D32/D45.
- **Status (24 Nov): fix 3 built, not yet on prod (backlog S19.8, architecture 1.49 D45).** The app's invokers become `toe-beans-edge` and `toe-beans-tick`. The org refuses service account keys, so the Worker holds no Google key. It signs its own JWT, which the Workload Identity Federation pool `cloudflare` swaps for an ID token, sent as `x-serverless-authorization`. The cap takes `toe-beans-edge` off instead of `allUsers`, and D45's bound is corrected. Fixes 1 and 2's log measures are left until the switch shows what a refused request still costs: Google's assistant says invoker refusals aren't billed, which the switch's check confirms in the request metrics and billing report (`infra/edge/README.md`).

**R2. Dependabot alerts and security updates are off — medium.**

- **Where:** repository settings: `GET /repos/vgebrev/toe-beans/vulnerability-alerts` answers 404 (off), `automated-security-fixes` is `enabled: false`, and the alerts API answers "Dependabot alerts are disabled for this repository".
- **What an attacker could do:** nothing directly. But D34 accepted the remaining advisories because "Dependabot brings the fixes", and `.github/dependabot.yml` says "security updates aren't delayed". With alerts off, a new advisory in a runtime dependency (adapter-node, `web-push`, the Mongo driver, sharp) only surfaces at the monthly version update, a week's cooldown later, or never if it's ignored there. The 6.0.0 adapter-node crash (§4, C4) is the kind that would be missed. `pnpm audit` today shows only the four accepted moderates (`glob`, `minimatch` twice through `@sentry/bundler-plugins` and dev tooling), none in the server bundle (D34).
- **Fix:** `gh api -X PUT repos/vgebrev/toe-beans/vulnerability-alerts`, then optionally `gh api -X PUT repos/vgebrev/toe-beans/automated-security-fixes`. Security update PRs target `main`, against the develop-first flow; if that's unwanted, keep alerts on and security updates off, and take each alert through `develop` by hand.
- **Status (25 Nov): fixed (architecture 1.50, D15).** Alerts are on (`vulnerability-alerts` answers 204). Automated security updates stay off: GitHub opens them against `main`, which moves only by pull request from `develop`, and they'd fail CI's `pnpm release check`, which wants a new version on every pull request into `main`. GitHub emails the owner on a new alert, and the fix goes through `develop` like any other change. D34's acceptance of the four moderate advisories now rests on alerts that are on. With alerts on, three of the four accepted advisories went at once: `@sentry/node` and `@sentry/browser` to 11.14.0 (its `@sentry/bundler-plugins` takes the fixed `glob` 14), `eslint` to 10.15.0 and `typescript-eslint` to 8.73.0 (the fixed `minimatch` 11), each past the 7-day cooldown. `pnpm audit` now shows only `glob` and its `minimatch` through `testcontainers > archiver-utils`, dev-only, with no fixed release yet.

**R3. The site fails for the rest of the day after 100,000 Worker requests, a quota shared with two other sites — medium.**

- **Where:** Cloudflare account `470d…c05b` on Workers Free (`docs/runbooks/accounts.md` "Billing limits": "requests past the day's allowance fail"). The account runs three Workers on custom domains: `toe-beans-edge`, `gebrev-com` (`gebrev.com`, `veli.gebrev.com`) and `swimwellza` (`swimwellza.co.za`). Every request to `toebeans.co.za` runs the Worker, cached `/_app/` files included, except the WAF's scanner blocks (D42) and the maintenance fonts (static assets).
- **What an attacker could do:** send about 100,000 requests in a day, about 1.2 a second, to any of the three sites. From then until midnight UTC, Cloudflare answers every request on all three with an error page. The installed app shows *Can't reach Toe Beans*, and reminders still go out, since the tick calls `run.app` directly. Unlike R1, this costs nothing and needs no bandwidth to speak of. Cloudflare's automatic DDoS protection acts on far higher rates. Whether a rate-limiting rule exists couldn't be read (C5), and none is in the repo.
- **Fix:**
  1. A rate-limiting rule at the edge. The free plan allows one, and requests it blocks never run the Worker. In the dashboard: **toebeans.co.za → Security → WAF → Rate limiting rules**, matching `http.host eq "toebeans.co.za"`, counting by IP, 10-second period, action Block for 10 seconds. Set the threshold above a cold start of the app (count the requests one phone makes on a fresh install, likely 40 to 80) with margin, for example 150. It slows a single source; a spread-out flood still gets through.
  2. Separate the quota. Move the other two sites to another Cloudflare account, so a flood on them can't take Toe Beans down, or take Workers Paid (US$5 a month, 10 million requests) when the free tier stops being a requirement (NFR-07). Record the choice against D13.

**R4. `/readyz` answers at `run.app` without the proxy secret and pings Atlas on every call — low.**

- **Where:** `apps/web/src/hooks.server.ts:133`: `quietRoutes` skips the proxy check. `packages/backend/src/infrastructure/persistence/mongo.ts:32` runs `db.command({ ping: 1 })` on each call. Live, `GET https://toe-beans-1047834821273.africa-south1.run.app/readyz` answers `{"status":"ready"}` with no secret.
- **What an attacker could do:** turn each request into a command on the M0 cluster, which Atlas throttles at about 100 operations a second for the whole cluster, with no edge, rate limit or session in the way. A modest flood slows every household's reads and writes, and adds to R1. It reveals nothing beyond "ready".
- **Fix:** memoise the result for a few seconds in `createHealthHttp` (or `mongoReadiness`), so a flood costs one ping per interval:

  ```ts
  let last: { at: number; ok: boolean } | null = null;
  async readiness() {
    const now = Date.now();
    if (!last || now - last.at > 5_000) {
      try { await readiness.check(); last = { at: now, ok: true }; }
      catch (err) { logger.warn('not ready', { err }); last = { at: now, ok: false }; }
    }
    return last.ok ? json({ status: 'ready' }) : json({ status: 'unavailable' }, 503);
  }
  ```

  Concurrent first calls can still each ping, which is fine. The uptime monitor already goes through the Worker; the deploy's check could too, after which `/readyz` could require the secret like everything else.
- **Status (24 Nov): built, not yet on prod (backlog S19.8).** `createHealthHttp` answers every call within 5 s from one check (`READINESS_FRESH_MS`). Once R1's switch is made, `run.app` refuses everyone but the invokers, so the exemption stays only for local checks (Playwright's, compose's). The deploy now checks `/readyz` through the Worker.

**R5. Plain `http://toebeans.co.za` serves the app; HSTS isn't preloaded — low.**

- **Where:** Cloudflare's *Always Use HTTPS* is evidently off. `infra/edge/worker.js:117` redirects only a non-apex host (`www`), so a plain-http request to the apex is proxied like any other. Live, `curl http://toebeans.co.za/sign-in` returns 200 with the full sign-in page over plain HTTP. The app's HSTS header goes along, but browsers ignore it over http. HSTS has no `preload` (D32).
- **What an attacker could do:** on a first visit, or any visit after the two-year HSTS lapses, someone on the network path (public Wi-Fi) who intercepts a plain-http request can serve a modified page, such as a look-alike sign-in, and keep the victim on http. The session cookie is `__Host-` and `Secure`, so it never travels over http, and a write from an `http://` origin fails the origin check. Chrome on Android upgrades typed addresses to https by itself, which narrows this to links and to attackers who block https.
- **Fix:** turn on **SSL/TLS → Edge Certificates → Always Use HTTPS**. Or, in the Worker, before the host check: `if (url.protocol === 'http:') return Response.redirect(\`https://${APEX}${url.pathname}${url.search}\`, 301);` Afterwards, consider HSTS preload. It needs `includeSubDomains; preload`, which D32 left out; today's subdomains are `www`, `auth` (Auth0, https) and `send` (mail only), so it would hold.

**R6. TLS 1.0 and 1.1 are accepted at the edge — low.**

- **Where:** the zone's minimum TLS version, Cloudflare's default 1.0. `openssl s_client -tls1` and `-tls1_1` both complete a handshake with `toebeans.co.za`.
- **What an attacker could do:** little in practice, since browsers no longer offer these versions. It's a known-weak protocol on offer, and scanners and compliance checks flag it.
- **Fix:** **SSL/TLS → Edge Certificates → Minimum TLS Version: TLS 1.2**. Every supported phone uses 1.3.

**R7. Firebase leftovers: a service account that can impersonate every other, an API key, a Hosting site — low.**

- **Where:** the project was added to Firebase during S-1.4a (31 Oct 2026), and Firebase was then ruled out. Left behind:
  - `firebase-adminsdk-fbsvc@toe-beans-co-za.iam.gserviceaccount.com` holds `roles/iam.serviceAccountTokenCreator` on the whole project;
  - a *Browser key (auto created by Firebase)* (`279f6a3e-…`) with no referrer restriction, enabled for Identity Toolkit, Firestore, Firebase Storage and others;
  - a default Hosting site, `toe-beans-co-za.web.app` (empty, 404);
  - about a dozen Firebase APIs enabled (`firebase`, `firebasehosting`, `identitytoolkit`, `securetoken`, `firebaserules`, `firebaseinstallations`, `firebaseremoteconfig*`).

  Nothing in the app uses any of it (`git grep -i firebase` finds only docs and a spike).
- **What an attacker could do:** nothing today. The account has no keys and no one but the owner can act as it, and Identity Toolkit isn't configured. But project-wide Token Creator lets it mint tokens as `toe-beans-run` (reads `app-secrets`) and `toe-beans-deploy` (deploys the app). So anything that ever gains use of it, such as a key someone downloads from the Firebase console's *Generate new private key*, holds the whole project. That undoes the narrow roles of D15 and D45.
- **Fix:**

  ```sh
  gcloud projects remove-iam-policy-binding toe-beans-co-za \
    --member=serviceAccount:firebase-adminsdk-fbsvc@toe-beans-co-za.iam.gserviceaccount.com \
    --role=roles/iam.serviceAccountTokenCreator --condition=None
  gcloud iam service-accounts disable firebase-adminsdk-fbsvc@toe-beans-co-za.iam.gserviceaccount.com --project toe-beans-co-za
  gcloud services api-keys delete 279f6a3e-7569-4d14-a139-bfaccf65ba30 --project toe-beans-co-za
  gcloud services disable firebasehosting.googleapis.com identitytoolkit.googleapis.com securetoken.googleapis.com \
    firebaserules.googleapis.com firebaseinstallations.googleapis.com firebaseremoteconfig.googleapis.com \
    firebaseremoteconfigrealtime.googleapis.com --project toe-beans-co-za
  ```

  Leave `fcm.googleapis.com` alone; Web Push doesn't need it in this project, but there's no gain in testing that on prod. The default Hosting site can't be deleted; with the API off, it serves nothing.

**R8. Pages carry no `Cache-Control`, and the edge caches any response at a static-looking extension — low.**

- **Where:** SvelteKit's page responses carry no `Cache-Control`. Only the API (`no-store`, `packages/backend/src/http/response.ts:41`), photos (`private`), probes and a few fixed files set one. The Worker's `fetch` to Cloud Run is cached by Cloudflare by file extension (as `infra/edge/worker.js` notes for `.js`). Live: two plain GETs of `/audit-<n>.png` with `Sec-Fetch-Dest: document` returned the app's HTML 404 as `MISS`, then `HIT`, with Cloudflare adding `cache-control: max-age=14400`.
- **What an attacker could do:** today, nothing found. Cloudflare doesn't cache a response that sets a cookie. An `[id]` page that fails (`/dogs/x.png`) renders the root error page, outside the `(app)` layout, so its HTML holds none of the viewer's name, email, household or dogs. Signed out, those paths redirect, and Cloudflare bypasses the redirect. But the safety is accidental. A route whose page renders successfully at a path ending in `.png`, `.css`, `.js` or similar, or a `(app)/+error.svelte` added later, would be cached with one person's data and served to the next person to ask (web cache deception). A cached page also reuses one CSP nonce for everyone.
- **Fix:** in `handle` (`apps/web/src/hooks.server.ts`), after `resolve`, give any response without a `Cache-Control` the value `private, no-cache`:

  ```ts
  if (!response.headers.has('cache-control')) response.headers.set('cache-control', 'private, no-cache');
  ```

  Build files never reach the hook (adapter-node serves them), so their caching is unchanged. Check that the service worker still caches the `(shell)` pages, since the Cache API ignores the header when it stores a response itself.

**R9. `main` doesn't require a pull request, admins bypass it, any action may run, and there's no code scanning — low.**

- **Where:**
  - Ruleset *Main branch protection* has `deletion`, `non_fast_forward` and the five required checks, but no `pull_request` rule, and Repository admin bypasses with mode `always`. The `production` environment has `can_admins_bypass: true`.
  - Actions permissions are `allowed_actions: all` and `sha_pinning_required: false`. Every workflow pins SHAs today, but nothing enforces it.
  - Code scanning answers "no analysis found".
- **What an attacker could do:** with the owner's GitHub session or a token with `repo` scope (a laptop, a CLI, an agent), push straight to `main`, which starts the deploy. The environment's approval is then the one remaining gate, and an admin can skip it. That's a single control where the docs (CLAUDE.md, D15) promise "main moves only by pull request". An unpinned action added by mistake would run without complaint.
- **Fix:**
  - Add a `pull_request` rule to the ruleset (0 approvals is enough for a sole maintainer), and set the admin bypass to `pull_request` mode, or remove it.
  - Set `production`'s *Allow administrators to bypass* off.
  - Enforce pins and limit actions:
    `gh api -X PUT repos/vgebrev/toe-beans/actions/permissions -F enabled=true -f allowed_actions=selected -F sha_pinning_required=true`,
    then list the owners in use (`actions/*`, `docker/*`, `google-github-actions/*`, `pnpm/*`) under *selected actions*.
  - Turn on CodeQL's default setup (free on a public repo):
    `gh api -X PATCH repos/vgebrev/toe-beans/code-scanning/default-setup -f state=configured`.

**R10. Reads of `app-secrets` aren't audit-logged — low.**

- **Where:** the project's IAM policy has no `auditConfigs`, so Data Access audit logs are off. Admin Activity logs (on by default, 400 days) record IAM and deploy changes, but not `AccessSecretVersion`.
- **What an attacker could do:** someone who read the secret through a misused identity (R7, or the deploy account) would leave no record of the read. Rotation after an incident (§8, E1) would have nothing to scope it by.
- **Fix:** turn on `DATA_READ` for Secret Manager only, which is a handful of entries a day (one per instance start). `gcloud projects get-iam-policy toe-beans-co-za --format=yaml > policy.yaml`, add

  ```yaml
  auditConfigs:
  - service: secretmanager.googleapis.com
    auditLogConfigs:
    - logType: DATA_READ
  ```

  and `gcloud projects set-iam-policy toe-beans-co-za policy.yaml` (the etag in the file guards against a concurrent change).

**R11. No CAA records or DNSSEC — low.**

- **Where:** `dig CAA toebeans.co.za` and `dig DS toebeans.co.za` are both empty.
- **What an attacker could do:** without CAA, any public CA may issue for the domain, so a mis-issuance (a CA fooled by a DNS or BGP attack) has nothing to stop it. Without DNSSEC, a resolver on the path can be fed forged records. Both are low-likelihood attacks, but each control costs a few minutes.
- **Also:** DMARC aggregate reports go to `dmarc_rua@onsecureserver.net`, GoDaddy's collector, a leftover of the registrar. It's harmless, but it's a third party receiving the domain's mail statistics, and the owner never sees them.
- **Fix:**
  - In Cloudflare DNS, add `CAA 0 issue "letsencrypt.org"` and `CAA 0 issue "pki.goog"`; Cloudflare adds its other CAs itself once any CAA record exists. Check that Auth0's custom domain (`auth`, a CNAME to Auth0) still renews, because CAA for a name under a CNAME follows the target first.
  - **DNS → Settings → DNSSEC: Enable**, then add the DS record at GoDaddy.
  - Point DMARC's `rua` at an address the owner reads, or drop it.

### 9.3 Worth checking (not verified)

**C5. Cloudflare settings this review couldn't read.** wrangler's sign-in has no zone-settings or rulesets scope. In the dashboard, confirm:

- whether any rate-limiting rule exists (R3);
- that `toe-beans-scanners` (D42) is the only custom rule and has no *Skip* action;
- that no Page Rules, Cache Rules or Transform Rules exist that touch `/api/` or add `Cache-Control`;
- that Bot Fight Mode is on.

SSL mode (Flexible, Full or Strict) doesn't apply. The Worker fetches `run.app` itself over https, with Cloudflare checking the certificate, and no proxied origin record exists for the apex.

**C6. `send.toebeans.co.za` is a CNAME to `send.forge.rmta.net`.** Through it, that name's SPF (`ip4:52.3.252.119 ip4:44.222.39.36 ip4:199.249.231.0/24`) and MX belong to whoever runs `rmta.net`. Under DMARC's relaxed alignment (`aspf=r`), mail with an envelope sender at `send.toebeans.co.za` from those addresses passes DMARC as `@toebeans.co.za`. Fine if it's Resend's current setup, but nothing in the repo records it. Confirm it matches the records Resend's dashboard shows as verified for the domain, and delete it if not.

**C7. Backups can be deleted with the nightly job's token.** The `toe-beans-backup` R2 token (Object Read & Write on `toe-beans-backups`) is a `backups` environment secret. With it, or a malicious change merged to `main` that runs in that environment, all dumps can be deleted. The bucket has no lock rule. Also check, in **R2 → Manage API tokens**, that the app's token (`S3_ACCESS_KEY_ID`) is limited to `toe-beans-photos`, so the app can't touch backups. Fix: an R2 bucket lock rule on the `mongo/` prefix with a 29-day retention, which keeps within the 30-day lifecycle that D36 and the privacy policy rely on.

**C8. Atlas is reachable from anywhere.** Network access is `0.0.0.0/0` (accounts.md, R3), because Cloud Run has no fixed egress address on the free tier. The database is then guarded by its two users' passwords and Atlas's mandatory TLS. Confirm that the app's user has `readWrite` on `toe-beans` only and the backup user `read` only (accounts.md says so), that no other database users exist, and that the owner's Atlas login uses two-factor authentication.

**C9. Not checked.** Repository webhooks and secret-scanning alerts (the token lacks `admin:repo_hook`; `gh auth refresh -s admin:repo_hook` and `gh api repos/vgebrev/toe-beans/hooks`). The Auth0 tenant's connections (C2), last checked live in §7.

### 9.4 Areas that look solid

- **Household isolation in new code:** S19's terms gate, *closed today* care (`listClosedSince`) and the revocations on leaving all go through `HouseholdCollection` with the session's household.
- **Origin protection, as designed:** without the Worker's secret `run.app` refuses every route (403, live), except `/readyz` (R4), the tick (its own OIDC check) and the build's static files (D32). `ADDRESS_HEADER` is honoured only behind the secret, so the rate limits' address can't be forged directly.
- **The Worker:** the secret and client address overwrite anything the client sent, and the upstream host is fixed (E1's fix holds). `workers.dev` and preview URLs are off, logs are off, the one binding is a secret, and the maintenance page has a `default-src 'none'` CSP.
- **R2:** both buckets are private (no `r2.dev` URL, no custom domain, no CORS), and the backups' 30-day lifecycle rules are in place.
- **Cloud Run identities:** `toe-beans-run` holds no project role, and only it can read `app-secrets`. Only `toe-beans-deploy` can act as it, and that only through WIF pinned to the repository ID, the `production` environment and `refs/heads/main`. No service account has a user-managed key. No primitive roles are held except the owner's.
- **The spending cap:** internal ingress, invokable only by its own account through Pub/Sub's signed push. The budget topic is publishable only by Cloud Billing. Its custom roles hold exactly the five permissions it uses, and the Run one is on the app's service alone. `setIamPolicy` could also add bindings, but none it could add reaches the secrets without `actAs`. It refuses to act if the invoker check is off.
- **Secrets:** one secret, regionally replicated, one enabled version. Config errors name keys, never values; `app-secrets.sh` passes values through the environment, never arguments.
- **GitHub Actions:** read-only default token; no repository secrets; `production` holds no secrets and needs the owner's approval; `backups` runs on `main` only. CI never uses `pull_request_target` or `workflow_run`, actions are pinned by SHA, first-time contributors need approval, no deploy keys, and secret scanning with push protection is on.
- **Dependencies:** `pnpm audit` shows four moderate advisories, all accepted in D34, and none in the server bundle.
- **Headers:** HSTS, CSP with nonces, `frame-ancestors 'none'`, `nosniff`, COOP and `Referrer-Policy` on every app response (live).
- **Logs:** 30-day retention, readable only by the owner (C1 holds).

### 9.5 Fix first

1. **R1 and R4, the cost of a refused request.** Make refusals and `/readyz` cheap (debug-level log, a log exclusion, a memoised ping), and correct D45's bound. Then decide whether the origin should sit behind Google's IAM.
2. **R3, the shared Worker quota.** Add the free rate-limiting rule and move the other two sites off this account, so a cheap flood on any of them doesn't take Toe Beans down for a day.
3. **R2, Dependabot alerts.** One command, and D34's acceptance of the open advisories rests on it. *Done 25 Nov.*
