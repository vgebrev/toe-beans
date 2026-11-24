# Toe Beans — Security Audit

**Version:** 0.6
**Date:** 23 November 2026
**Status:** §1–§6, the code review: every finding fixed or decided (S15.2). §7, the external pentest: both findings fixed (S18.3). §8, found since: fixed.
**Inputs:** `docs/requirements.md` v1.0, `docs/architecture.md` v1.21, the code at commit `1ea686e` (`develop`); for §7, prod on 1.0.4 and the repo at `main` `904516e`

**Changes in 0.1:** first audit of the attack surface before release.

**Changes in 0.2:** a resolution under each finding and in the summary: F1–F7 fixed in code (architecture D32, D33), C3 fixed with a per-person write budget, C1, C2 and C4 accepted with checks moved to S14.1 (D34). A seventh advisory, in `@sveltejs/adapter-node`, appeared after the audit and is fixed.

**Changes in 0.3:** §7, the first external pentest (S18.2, 22 November 2026), run on prod from outside as `docs/runbooks/pentest.md` describes: no critical, high or medium findings, household isolation confirmed live, one low finding and one informational, and a suspected lockout disproved. Open findings are summarised without detail until fixed (runbook §7).

**Changes in 0.4:** §7: both pentest findings fixed (S18.3, architecture 1.41): P1, now described, by revoking the invitations of someone who leaves or deletes their account (D18); P2 by reading a weakened ETag in `If-Match` (§3.3).

**Changes in 0.5:** §8, findings since the pentest: E1, the edge Worker sending its proxy secret to a host named in the path, found while checking the edge for S19.3 and fixed the same day.

**Changes in 0.6:** §7.4's CI note: since S19.6 the nightly backup holds its own credentials as secrets of GitHub's `backups` environment instead of reading them from Secret Manager through Workload Identity Federation (architecture 1.47, D36). The app's secrets stay in GCP.

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
