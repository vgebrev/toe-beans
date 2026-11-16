# Toe Beans — Security Audit

**Version:** 0.2
**Date:** 16 November 2026
**Status:** Every finding fixed or decided (S15.2); the deployed settings are checked in S14.1.
**Inputs:** `docs/requirements.md` v1.0, `docs/architecture.md` v1.21, the code at commit `1ea686e` (`develop`)

**Changes in 0.1:** first audit of the attack surface before release.

**Changes in 0.2:** a resolution under each finding and in the summary: F1–F7 fixed in code (architecture D32, D33), C3 fixed with a per-person write budget, C1, C2 and C4 accepted with checks moved to S14.1 (D34). A seventh advisory, in `@sveltejs/adapter-node`, appeared after the audit and is fixed.

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
