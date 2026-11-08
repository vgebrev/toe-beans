# Toe Beans — Backlog

**Version:** 0.20 (draft for iteration)
**Date:** 8 November 2026
**Inputs:** `docs/requirements.md` v1.0, `docs/architecture.md` v1.6, `docs/ui.md` v0.12

**Changes in 0.3:** spike results S-1.0 to S-1.4 and S0.1–S0.2 recorded as they landed (see Current progress). S-1.4b dropped as not needed, S-1.5 parked, S-1.4a retargeted to `toebeans.co.za`.

**Changes in 0.4:** S-1.4a done (Cloudflare Worker chosen; the probe is torn down and `toebeans.co.za` serves a holding page). S0.3 and S0.4 done (see Current progress).

**Changes in 0.5:** S0.5 done without MinIO, whose community edition is no longer published; S3.2 picks the local S3-compatible store.

**Changes in 0.6:** S0.6's CI workflow is written; its first run waits for the GitHub repo. Added S0.10 (publishing the repo safely), and S14.1 gains the deploy security setup from architecture D15.

**Changes in 0.7:** S0.7 done.

**Changes in 0.8:** the Samsung e2e profile uses the measured viewport (see Current progress).

**Changes in 0.9:** S0.8 done. S0.9 built on the placeholder paw; the AI-assisted logo is all that's left of it. S13.1 now also exports the icon PNGs and precaches only the Latin font files.

**Changes in 0.10:** S0.9 done: the TB monogram logo from the AI-assisted design board replaces the placeholder paw (`ui.md` 0.7 §6.4 Logo). The custom dog icon stays as drawn; the new mark has no dog to redraw it from.

**Changes in 0.11:** S0.6 done (first CI run green). S0.10 done: MIT licence, a repository README, a clean gitleaks scan of the full history, the repo published at `github.com/vgebrev/toe-beans`, and a ruleset on `main` requiring CI. Dependabot skips TypeScript 7 and `@types/node` majors (architecture 0.12).

**Changes in 0.12:** the S0 Foundations heading is marked done (all ten tasks were). S1 started: its tasks follow the sign-in design in architecture 0.13 §3.4 (two EU Auth0 tenants with a prod custom domain, Mongo-backed sessions, a mock OIDC provider for e2e), with a new S1.5 for the sign-in page and its e2e tests. Setup steps are in `docs/runbooks/auth0.md`. S1.2–S1.5 done, with account linking by verified email (Q10).

**Changes in 0.13:** S-1.3 done and S-1.6 done (D8 and D9 accepted), so the S-1 spikes story is closed, with S-1.5 still parked as the self-host check. Architecture is accepted as baseline v1.0. Leftovers that named S-1.6 (deploy workflow, registry, trace correlation) belong to S14.1.

**Changes in 0.20:** S3 built (see Current progress), following architecture 1.6 D20 and D21 and `ui.md` 0.12. S3.2 picks SeaweedFS. New S3.5 for the photo flow and share sheet on the phones, which is all that's left of S3.

**Changes in 0.19:** new S2.7 lets a household have several owners (architecture 1.5 D19, `ui.md` 0.11 §4.8).

**Changes in 0.18:** S2 built (see Current progress), following architecture 1.4 D16 and D17 and `ui.md` 0.10 §4.8. S2.1 to S2.5 done, S2.3 with a real invite sent through Resend and accepted on the Redmi Note 12 Pro. New S2.6 adds leaving and removing members (architecture 1.4 D18, `ui.md` 0.10 §4.8). S2 also builds J1's invite step, which no slice named. S3.4's onboarding step is renumbered to 4, and S14.1 gains the Resend key prod now requires.

**Changes in 0.17:** S1.6 done: the Redmi Note 12 Pro passed the real sign-ins, with S1.7's display name holding across sign-in methods (see Current progress). S1 stays open only for the prod tenant in S1.1.

**Changes in 0.16:** S1.6 passed on the Galaxy S23 FE, signing in through a dev server on the LAN over https (see Current progress). It found that the display name changed with each sign-in method, so new S1.7 makes the name the app's and editable on More (architecture 1.3 §5.2, ui 0.9 §4.7), and S2.1 gains J1's new *Your name* step.

**Changes in 0.15:** S1.6's rate limit is built and the ID token signature check is on (architecture 1.2 §3.4, §7); the real sign-ins on the phones remain. S14.1 gains the client-address setup the rate limit needs behind the Worker.

**Changes in 0.14:** inputs moved to architecture 1.1 (5-minute tick) and ui 0.8. The spike stays deployed for the tick-interval check.

Work is organised as **vertical slices**: each delivers a usable end-to-end increment through UI → API → application → domain → persistence, with tests. Slices are ordered by **dependency and risk**. The riskiest unknowns (push with the app closed, free hosting) are spiked first, before building on them.

**Status key:** ⬜ not started · 🟨 in progress · ✅ done · ⏸ blocked or parked · ❌ dropped

---

## Current progress

| Date | Note |
|---|---|
| 2026-10-25 | Requirements baselined (v1.0). Architecture, UI and backlog drafted (v0.1), under review. No code yet. Git repo initialised. |
| 2026-10-28 | Review round 1 applied (v0.2). Hosting questions resolved: billing-enabled GCP is OK, South Africa region, `toebeans.gebrev.com`. Brand direction set. Diagnostics UI deferred. Content pipeline defined. |
| 2026-10-28 | Review round 2: Nunito, AI-assisted logo, per-device theme. Icon library evaluated. First mock-ups published (Today, Quick log, Exercise, brand sheet, both themes). |
| 2026-10-28 | Review round 3: Nunito confirmed as the body font after a side-by-side comparison in the mock-ups. |
| 2026-10-28 | Review round 3 (cont.): dark primary softened to `#C98A4B`, Hugeicons free adopted, mock-up layouts accepted for the MVP. UI design questions closed. |
| 2026-10-28 | S-1.0 done: free Atlas in South Africa only on AWS Cape Town. Architecture v0.3 adopts Cloud Run Johannesburg + Atlas Cape Town, with a database round-trip budget and open-access-list safeguards. |
| 2026-10-28 | S-1.1 started: spike PWA in `spikes/pwa` (SvelteKit 3.1, `adapter-node`, native service worker, manifest with maskable icons, `/offline` fallback). Chrome reports no installability errors. Next: install on both phones. |
| 2026-10-29 | S-1.1 done: installed on both acceptance phones; offline fallback and reconnection confirmed in flight mode. Gateway-error fallback (502/503/504) added to S-1.3. Next: S-1.2 (Web Push with the app closed). |
| 2026-10-29 | S-1.2 started: push test panel, VAPID subscribe/send, delayed sends with `high`/`normal` urgency, notification deep link, and a delivery log fed by the service worker. Works end to end in desktop Chrome. Next: phone checklist. |
| 2026-10-30 | S-1.2 Galaxy S23 FE result: with default settings and the screen locked, pushes arrive up to ~90 s, then fail from ~105 s on, or turn up much later (one arrived 90 min late, when the next push woke Chrome). FCM accepted every send (`HTTP 201`): Samsung freezes Chrome, so urgency `high` doesn't help. *Never sleeping apps* alone wasn't reliable. **Apps → Chrome → Battery → Unrestricted** fixed it: every delay up to 3 min arrived (One UI then drops Chrome from the never-sleeping list, since Unrestricted covers it). Taps open the installed app. Tally (log in `spikes/pwa/results/`): before *Unrestricted*, 5 of 9 sends received, all 4 misses at 105–120 s locked and none turned up later; after, 4 of 4 (120 s and three at 180 s). Redmi settings still to test. |
| 2026-10-30 | S-1.2 Galaxy S23 FE idle run with *Unrestricted*, phone locked, still and unplugged: **4 of 4 received** (pushes at 45, 60, 90 and 120 min, so 15–45 min apart after the first). Lateness tracks idle time: 44 s after 45 min idle, 2 s after 15 min, 74 s and 35 s after 30 min. Nothing dropped. Implications: reminder TTL should be long (≥ 1 h), and the UI shouldn't promise to-the-second timing. Samsung side of S-1.2 done. |
| 2026-10-30 | S-1.2 done. Redmi with Chrome *Battery saver: No restrictions*: 3 of 3, including 45 min locked, still and unplugged (5 s late). Xiaomi doesn't offer *Autostart* for Chrome. Architecture v0.4 (§6.4 findings, send policy, R5) and UI v0.5 (J7 reliability step, delayed test). |
| 2026-10-30 | S-1.3 started: spike deployed to Cloud Run `africa-south1`, tick from Cloud Scheduler in `me-central1` (Scheduler isn't offered in Johannesburg). First hour: 59 of 59 ticks, lag p50 0.33 s, p95 1.05 s, max 1.47 s, one instance, no scheduler errors. Next: cold starts, then the 48 h run and the billing check. |
| 2026-10-30 | S-1.3 cold start, tick paused 22:44–23:11 SAST: the Samsung opening the app at 23:06 started a new instance (the old one had scaled to zero). Node up 0.29 s after process start; first response 0.62 s server-side; under 2 s as seen on the phone. Well inside the 5 s budget. The app resumed from memory (first request was `/api/push/log`), so a fully closed-app cold load is still to do. 48 h tick run: 30 Oct 23:12 → 1 Nov 23:12 SAST (`pnpm ticks 2026-10-30T23:12+02:00`). |
| 2026-10-31 | S0.1 done: pnpm workspace with `apps/web` (SvelteKit 3, adapter-node), `packages/backend` (layer folders, `Result`, composition stub) and `packages/contracts` (problem+json schema). TypeScript 6 strict (7 isn't supported by typescript-eslint or svelte-check yet), ESLint 10 + Prettier, Vitest 5. Layer rules use ESLint `no-restricted-imports` (architecture §4.2), checked against deliberate violations in every layer. S-1.3's 48 h tick run continues. |
| 2026-10-31 | S-1.4 done: probe service (`spikes/db-probe`) on Cloud Run `africa-south1` against Atlas free on AWS `af-south-1`, seeded with a year of two households' data. Server-side: ping p50 21–32 ms; **Today read p50 62 ms, p95 71 ms** (budget ≤ 250 ms); transaction p50 130 ms. Startup connect 0.3 s once the server connects before listening (listening first let the startup probe pass, and the CPU-throttled idle instance then took 5.7–31 s to connect). From devices (total / server, p50): laptop 76 / 62 ms, Samsung Wi-Fi 100 / 63 ms, Samsung mobile data 148 / 75 ms, Redmi Wi-Fi 98 / 75 ms, Redmi mobile data 117 / 75 ms (p95 totals ≤ 226 ms everywhere). Idle gaps of 1–12 min between requests cost nothing: the first read after each gap was 62–78 ms, the same as the warm reads after it. **Passes; topology 1 confirmed, 1b not needed** (architecture §8.4). |
| 2026-10-31 | Domain: `toebeans.co.za` bought (GoDaddy, 2 years) and used from the first release instead of `toebeans.gebrev.com`, so devices never re-subscribe to push after a move. Cloud Run domain mapping isn't offered in `africa-south1`; S-1.4a compares Cloudflare and Firebase Hosting. S-1.5 (self-host check) parked. |
| 2026-10-31 | S0.3 done: the backend connects to Mongo and runs pending migrations in the SvelteKit `init` hook, which adapter-node awaits before listening; with Mongo down the server exits after 15 s without listening, and SIGTERM closes the client. `UnitOfWork` commits on an ok `Result`, rolls back on an error or throw, and carries the session in `AsyncLocalStorage`. Forward-only migration runner with a lease lock. `HouseholdCollection` base (household filter on every call, versioned writes, common fields) and `householdIsolationSuite`, which fails all four checks if the household filter is removed. Integration tests run on Testcontainers with `mongodb/mongodb-atlas-local:8.0` (`pnpm test:integration`, 23 tests). Plain `mongo:8.0.34` won't start on Linux 6.19+ (SERVER-121912); Atlas Local 8.0 (mongod 8.0.20) does. |
| 2026-10-31 | S-1.4a started ahead of S-1.3's write-up, without touching its tick run: the PWA spike deployed again as `toe-beans-domain-probe` with a `/latency` page (30 same-origin pings, cookie check). **Firebase Hosting is out**: its Cloud Run rewrites don't support `africa-south1`. **Cloudflare Worker** on `cf.toebeans.co.za` (`spikes/domain`) works, served from the JNB edge; from the laptop it adds ~20 ms (ping p50 12 → 33 ms, p95 15 → 42 ms). The server sees the `run.app` host behind it, so the app must set `ORIGIN`. Next: phones (latency, cookies, push from the custom origin). |
| 2026-10-31 | S-1.4a Galaxy S23 FE on `cf.toebeans.co.za` vs `run.app` (warm pings, p50 / p95): Wi-Fi 35–37 / 47–49 vs 21–26 / 30–46 ms, mobile data 81–90 / 252–305 vs 56–58 / 187–193 ms, so Cloudflare adds ~12 ms (Wi-Fi) to ~28 ms (mobile) at p50; edge JNB. Push subscribed from `cf.` delivered and a tap opened the installed app (delayed sends need a tick job, which the probe deliberately lacks). Cookies first failed: SvelteKit's CSRF check returned 403 to POSTs from `cf.` because it took `run.app` as the origin, and adapter-node 6 no longer reads `ORIGIN` at runtime. `HOST_HEADER=x-forwarded-host` fixed the probe; the app will set Kit's `paths.origin`. Next: Redmi, cookie recheck on the Samsung. |
| 2026-10-31 | S-1.4a done. Redmi Note 12 Pro, `cf.` vs `run.app` (p50 / p95): Wi-Fi 44–45 / 139–227 vs 23–24 / 67–212 ms, mobile data 69–73 / 105–127 vs 50–53 / 73–81 ms (~18–21 ms added at p50). Cookies pass through the Worker on both phones after the `HOST_HEADER` fix. **Cloudflare Worker chosen** (architecture §8.4, D13, Q8). Push from the custom origin was tested on the Samsung only; push delivery doesn't pass through Cloudflare. |
| 2026-10-31 | S-1.4a probe torn down (Cloud Run service, images, `cf.` Worker). `toebeans.co.za` now serves a holding page from a Cloudflare Worker (`infra/holding-page`: no service worker, no cookies, `noindex`) and `www` redirects to the apex; the GoDaddy-era A/CNAME records that returned 525 are gone. S14.1 replaces it with the app's Worker. |
| 2026-11-01 | S0.4 done: `Logger` and `ErrorReporter` ports with pino and Sentry adapters. Log lines use Cloud Logging's `severity`/`message`/`time`. Every line in a request carries its `requestId` (kept from a well-formed upstream `x-request-id` or generated, returned in the response header and in a 500's body). The access log records the route ID, never the path. Redaction of sensitive keys plus masking of emails, connection strings, bearer tokens and duplicate-key values in error text. `/readyz` pings Mongo (503 with the reason logged only). Sentry: server errors only with all SDK 11 data collection off; browser SDK loaded only when `SENTRY_DSN` is set (~140 KB gz otherwise never fetched). Smoke-tested on the built server: request IDs, route-only access log, masked 500. Sentry itself is untested until a DSN exists. `apps/web` now depends on `@opentelemetry/api`, which Kit keeps outside the bundle. 52 unit and 25 integration tests. |
| 2026-11-01 | S0.5 done: `docker/Dockerfile` (two stages on `node:24.21.0-slim`, runtime is `build/` plus `@opentelemetry/api`, ~13 MB over the base, user `node`, files root-owned) and `docker/compose.yaml` (Atlas Local 8.0 with named volumes; the app behind the `app` profile, healthchecked on `/readyz`), run with `pnpm compose …`. Verified: image builds, the stack comes up healthy in ~7 s, `/readyz` 200, SIGTERM shuts down in 0.4 s, and `pnpm dev` works against the compose Mongo. `apps/web` keeps only runtime imports in `dependencies`. MinIO dropped: its community edition stopped publishing images in October 2025; S3.2 picks a replacement. |
| 2026-11-01 | Repo to be public: security model for CI/CD recorded (architecture D15). S0.6 started: `.github/workflows/ci.yml` (lint, type-check, unit; integration; image build without push; `contents: read`, no secrets, actions pinned to SHAs) and `.github/dependabot.yml` (actions, base image and npm, 7-day cooldown). Not run yet: no GitHub repo exists; S0.10 covers publishing it safely. |
| 2026-11-01 | S0.7 done: Playwright 1.64 (`pnpm test:e2e`) against the production build on database `toe-beans-e2e`, with two Chromium projects for the acceptance phones (Galaxy S23 FE 360 × 740 @3×, Redmi Note 12 Pro 393 × 830 @2.75×; heights approximate, to be measured in S13). Smoke test: the page renders with no console errors and no sideways overflow, and `/readyz` is ready with a request ID. A 380 px element fails it on the Samsung (28 px over) and passes on the Redmi, as intended. CI gains an e2e job with Atlas Local as a service container. |
| 2026-11-01 | Galaxy S23 FE e2e profile corrected to the owner's measured DevTools profile: 384 × 700 CSS px (2.8125×), the area above the phone's navigation buttons, replacing the 360 × 740 @3× estimate. The Redmi's 393 × 830 is still an estimate (S13). |
| 2026-11-01 | S0.8 and S0.9 built together. Shell: Tailwind 4 and shadcn-svelte (Button, resized to 48 px targets), the five destinations under `(app)` with a fixed bottom bar (tinted pill plus bolder label for the active tab, safe-area padding), page headers, empty states and a Not found page. Brand: tokens in `tokens.ts` mirrored in `app.css` as `light-dark()` values, a unit test for drift and AA contrast (21 pairings in each theme), per-device theme switch on More with a pre-paint script (no flash, checked in e2e with the app's scripts blocked), self-hosted Fredoka and Nunito, and `<Icon>` over the free Hugeicons data (rendered on the server; `@hugeicons/svelte` dropped because it draws only after hydration; custom dog icon). Typed API client returning results, not throws. Placeholder paw as logo, favicon and the maskable and badge sources. 34 e2e runs (17 tests × 2 phones), 120 unit tests. Image +2 MB. Releases from <7 days ago skipped (the D15 cooldown): `tailwind-variants` 3.3 not 4.0, `@hugeicons/core-free-icons` 4.3.5. |
| 2026-11-01 | S0.9 done: the logo is the TB monogram from the AI-assisted design board (Monogram Iteration B). Traced from the board's primary light logo, then cleaned up (fitted ellipses for the toes, smoothed letters and heart); the geometry is in `brand/mark.ts`, which `Logo.svelte` draws and the mark, favicon (the app-icon tile), maskable and badge SVGs embed, with a drift test. Wordmark in Fredoka Bold. Still to do for the brand: a trademark-resemblance check, and the PNG exports in S13.1. |
| 2026-11-01 | S0.10: MIT licence and a repository README. gitleaks v8.30.1 (Docker image pinned by digest) scanned the full history, 46 commits: no leaks. Published to `github.com/vgebrev/toe-beans` over SSH; the first CI run passed all four jobs (lint/type-check/unit, integration, image, e2e), so S0.6 is done. Ruleset on `main` added (no deletion or force-push, CI must pass). Dependabot's npm job failed on TypeScript 7.0.2, which typescript-eslint, svelte-check and Kit 3 don't accept yet; it now skips `typescript` and `@types/node` majors. |
| 2026-11-01 | S1 started. Design recorded in architecture 0.13 §3.4: Auth0 dev and prod tenants in the EU region (no African region; only sign-in talks to Auth0), prod on `auth.toebeans.co.za` from the first user because users are keyed by issuer, Mongo-backed sessions, and a mock OIDC provider for e2e instead of a test sign-in route. The tenant setup runbook is `docs/runbooks/auth0.md`. |
| 2026-11-01 | S1.2–S1.5 built. The Auth0 dev tenant `toe-beans-dev` (EU) is set up; the app redirects to it and Auth0 accepts the callback URL. Backend: an `IdentityProvider` port with an `openid-client` 6.8 adapter (lazy discovery, PKCE, state and nonce), login transactions and sessions in Mongo (hashed tokens, TTL indexes, migration `0001-auth`), and `User` with linked identities: Google and email/password with the same verified email are one user, and unverified emails are refused (architecture §3.4, Q10). Web: `/auth/sign-in`, `/auth/callback`, `POST /auth/sign-out`, the viewer in `hooks.server.ts`, the `(app)` layout sending signed-out visits to `/sign-in?returnTo=…`, the Welcome page and Account on More. Kit's CSRF check refused same-origin forms because adapter-node 6 assumes `https`; the hooks Origin check now covers every non-GET request against the runtime `PUBLIC_BASE_URL` instead. The mock provider (`mock-oauth2-server` 6.1.3, pinned by digest) runs in compose, the CI e2e job and an adapter integration test. 186 unit, 42 integration and 51 e2e tests. Still to do (S1.6): the callback rate limit, and real sign-ins on the phones. |
| 2026-11-01 | S-1.3 done. 48 h tick run (30 Oct 23:12 → 1 Nov 23:12 SAST): **2,891 of 2,891 ticks**, 0 duplicates, 0 scheduler errors; lag p50 0.33 s, p95 1.00 s, max 9.15 s. The eight ticks over 4 s all hit warm instances (up 29 min to 25 h), so the delay is Scheduler's, not cold starts. Cloud Run replaced the instance twice during the run without a missed tick (new instances booted in 0.16–0.43 s). Cold start stays at the 30 Oct result (0.62 s server-side, < 2 s on the Samsung); a full cold load of the installed app is measured in S13.3. Gateway fallback: behind a proxy returning each status, a page load that gets 502, 503 or 504 shows the cached *Can't reach Toe Beans* page, a 500 passes through, and the next good load recovers. Billing: $0.00 for the project over the run (Q9). |
| 2026-11-01 | S-1.6 done: D8 and D9 accepted (architecture 1.0 §2, §6.3, §8.2, §8.4). S-1 spikes story closed. Architecture accepted as baseline v1.0: the remaining proposed decisions are accepted, and later changes go through the decision log. |
| 2026-11-02 | S1.6 rate limit built (architecture 1.2 §7): a `RateLimiter` port with an in-memory token bucket per client address, shared by `/auth/sign-in` and `/auth/callback` and checked before any write or provider call; over `AUTH_RATE_LIMIT` (30 steps per 10 minutes) the sign-in page asks the person to wait. The OIDC adapter now verifies the ID token's signature against the JWKS (`enableNonRepudiationChecks`), with an integration test that forges `sub` through a proxy. 195 unit, 43 integration and 53 e2e tests. Still to do: the real sign-ins on both phones. |
| 2026-11-02 | S1.6 Galaxy S23 FE: signed in through the Auth0 dev tenant with Google and with email/password, both linked to one user, on `https://toebeans.test:7877` (the dev server over https on the LAN: mkcert, dnsmasq, README). Found: the display name follows whichever provider signed in last (`vgebrev` from email, `Veli Gebrev` from Google). Redmi still to do. |
| 2026-11-04 | S1.7 built. `User` gains `version` and `displayNameSource` (schema 2; schema 1 documents are read as they were chosen, so no migration). Sign-ins keep the name unless it's still the email fallback and the provider now has a real one, and write only when something changed. `GET`/`PATCH /api/v1/me`, the first versioned resource: ETag `"<version>"`, 428 without `If-Match`, 412 when stale. *Your name* on More with saving, saved, failed and conflict states, plus shadcn `input` and `label` at 48 px. `hooks.server.ts` now keeps `etag` and `x-request-id` on universal loads' responses; without it, the first load to read them failed with a 500. 233 unit, 46 integration and 59 e2e tests. |
| 2026-11-04 | S1.6 done. Redmi Note 12 Pro on `https://toebeans.test:7877` (mkcert CA installed, Wi-Fi DNS pointed at the dev machine): the full sign-up and sign-in flow through the Auth0 dev tenant with Google and email/password works, and the display name holds as S1.7 intends whichever method signs in. |
| 2026-11-06 | S2 built. Households with a unique index holding each person to one (D16), onboarding (*Your name*, *Create household*, *Invite a caregiver*), and a gate sending anyone without a household there. Invitations by link and email on D17's terms (any member invites; one person, 7 days), with `/join/:token` covering every J2 state, and accepting as one transaction with an atomic claim, tested against real Mongo: two people can't share a use, and a failed join doesn't spend it. Household screen with members, pending invites and revoke in a bottom sheet (shadcn `sheet`, its lucide icon swapped for `<Icon>`). E2e covers scenario 1 by link and scenario 9. Found on the way: any API error in a server render was a 500, because the client reads `content-type` and Kit only keeps listed headers. `EMAIL_SENDER` chooses the console, Mailpit or Resend sender, so a key on a dev machine sends nothing by itself. Not yet tried: a real Resend send, and the Android share sheet on the phones. |
| 2026-11-07 | S2.3 done: the owner created a household and followed invites through Mailpit and through real Resend mail, accepting on the Redmi Note 12 Pro, so the golden path is verified. S2.6 built from that review, with D16 and D17 confirmed: leaving, removing, succession, deactivating and rejoining (D18). Migration 0003 was needed, as the unique index refused a second household with no members. Not yet tried: these on a phone, and the Android share sheet. |
| 2026-11-07 | S2.7 built: several owners on D19's terms. |
| 2026-11-08 | S3.1–S3.4 built. Dogs with an exact or estimated birth date, archive and bring back, and an accent picked on adding (architecture §5.2). A dog is added in one multipart request with its photo (D20); `sharp` turns it upright, crops it square and writes WebP at 1024 and 256 px with no metadata, and the photo is streamed only after the household check, cached privately for a day under a URL that changes with it. `PhotoStore` adapters for S3 (`aws4fetch`) and the filesystem; SeaweedFS runs in compose and in the S3 adapter's integration test (D21), and the dogs e2e suite also passed against it. UI: onboarding step 4 with camera or gallery and drag-and-pinch framing, Dogs under More, the profile with *Change photo*, *Edit details* and *Archive*, the switcher on the four main tabs, the dog accent palette, and the dogs' names on the join page. 432 unit, 80 integration and 119 e2e tests. Found on the way: a number input binds to a number in Svelte, which broke *Approximate* until e2e caught it. Not yet tried: any of it on a phone (S3.5). |

**Next up:** S3.5 on the phones, then S4 exercise library. The S-1 spike service and its tick stay up for the tick-interval check: 1 minute until about 9 Nov, then 5 minutes for a week (architecture 1.1 §6.3).

---

## Definition of done (every slice)

- Use cases are covered by unit tests. Repositories are covered by integration tests, **including the household-isolation suite**.
- The API returns problem+json errors and enforces `If-Match` on mutations.
- The UI handles loading, empty, error, offline and conflict states (`ui.md` §5.2), and meets the accessibility conventions (`ui.md` §7).
- Lint (including layer boundaries), type-check and tests pass in CI. The container image builds.
- Logs carry no sensitive data.
- Docs are updated if a decision changed.

---

## P0 — First usable MVP

### S-1 Spikes: de-risk hosting and push ✅
*Goal: decide D9 (hosting) with evidence. Throwaway code is allowed.*

| # | Task | Status |
|---|---|---|
| S-1.1 | Minimal SvelteKit + service worker PWA, installable on both phones. **Result: installs on the Galaxy S23 FE and Redmi Note 12 Pro, shows the offline page in flight mode, and recovers once the connection returns.** Spike in `spikes/pwa`. | ✅ |
| S-1.2 | Web Push via VAPID: subscribe, send from the server, receive **with the PWA closed** on the Galaxy S23 FE and Redmi Note 12 Pro. Record battery and optimisation settings needed (especially MIUI/HyperOS). **Result: works on both, but only reliably after lifting Chrome's battery restriction (Samsung *Unrestricted*, Xiaomi *No restrictions*). Without it, pushes are lost once the phone has been locked for 1–2 min. Deep sleep adds up to ~75 s. Findings in architecture §6.4, risk R5.** | ✅ |
| S-1.0 | Check which South African regions Atlas offers for free clusters (Q7). **Result: AWS `af-south-1` (Cape Town) only.** Topology: Cloud Run Johannesburg + Atlas Cape Town (architecture §8.4). | ✅ |
| S-1.3 | Deploy to Cloud Run (`africa-south1`, Johannesburg), with Cloud Scheduler calling `/internal/tick` every minute. Measure cold start against the **≤ 5 s** budget, tick reliability over 48 h, and confirm **$0** in billing reports for a Tier 2 region (Q9). Budget alert on. Also: the service worker shows a "Can't reach Toe Beans" page when a page load gets a 502/503/504 from the platform (found in S-1.1: gateway error pages bypass the offline fallback). **Result: 2,891 of 2,891 ticks over 48 h (lag p95 1.00 s), cold start 0.62 s server-side, $0 billed, and the gateway fallback works for 502/503/504. Architecture §6.3, §8.4, Q9.** | ✅ |
| S-1.4 | Atlas free cluster on AWS `af-south-1` (Cape Town). Measure the Cloud Run → Atlas round trip and the warm Today API time (≤ 250 ms p95 budget), plus end-to-end latency from both phones. Confirm transactions work. Set up the access list and least-privilege users as in architecture §8.4. | ✅ |
| S-1.4b | *Only if S-1.4 misses its budget:* try topology 1b (the same image on AWS Lambda in Cape Town via Lambda Web Adapter, plus an EventBridge tick) and compare | ❌ not needed |
| S-1.4a | Custom domain `toebeans.co.za` on Cloud Run. Domain mapping isn't offered in `africa-south1`, so compare a Cloudflare Worker (nameservers to Cloudflare) and a Firebase Hosting rewrite (`__session` cookie constraint; ruled out: no `africa-south1` support): latency from both phones against S-1.4, cookies, push from the custom origin (Q8). **Result: Cloudflare Worker, ~12–28 ms added at p50, cookies and push work. The app sets Kit `paths.origin`, or SvelteKit's CSRF check rejects POSTs. Spike in `spikes/domain`.** | ✅ |
| S-1.5 | Fallback check: the same image under docker compose behind IIS (ARR + win-acme), push working end-to-end. **Parked** while Cloud Run stays free; S0.5 keeps the compose setup working (R1). | ⏸ |
| S-1.6 | Write the outcome into architecture D9 and mark it Accepted. **Result: D8 and D9 accepted; architecture accepted as baseline v1.0.** | ✅ |

### S0 Foundations ✅
*FR: none. NFR-06, 08, 11, 12, 15.*

| # | Task | Status |
|---|---|---|
| S0.1 | pnpm workspace: `apps/web`, `packages/backend`, `packages/contracts`. TypeScript strict. ESLint + Prettier. Layer-boundary lint rules. | ✅ |
| S0.2 | Backend skeleton: config (validated env), composition root, `Clock`, ID generation, `Result`/error types, problem+json mapping | ✅ |
| S0.3 | Mongo infrastructure: client lifecycle (connect before the server listens, S-1.4), `UnitOfWork`, migration runner, household-scoped base repository plus the reusable isolation test suite | ✅ |
| S0.4 | pino logging with request IDs and redaction. `/healthz`, `/readyz` (ready only once Mongo is connected). Sentry wiring (server + browser). | ✅ |
| S0.5 | Dockerfile (multi-stage, non-root). `docker compose` for local dev (Mongo replica set; MinIO dropped, see S3.2). | ✅ |
| S0.6 | GitHub Actions: lint → typecheck → unit → integration (Testcontainers) → image build. Fork-safe, no secrets, actions pinned to SHAs, Dependabot with a cooldown (architecture D15). Plus e2e on the acceptance-phone profiles (S0.7). First run green on 1 Nov. | ✅ |
| S0.7 | Vitest + Playwright setup with an Android device profile (Vitest done in S0.1) | ✅ |
| S0.8 | App shell: layout, bottom navigation, theme tokens, shadcn-svelte install, typed API client | ✅ |
| S0.9 | Brand: AI-assisted paw-print logo cleaned into SVG, plus its variants (maskable icon, monochrome badge, favicon). Beagle and German Shepherd tokens with an automated contrast test. Per-device theme switch (system default, `localStorage`, no flash). Self-hosted Fredoka + Nunito (confirmed). Icon library: Hugeicons free (MIT) behind an `<Icon>` wrapper; map the pet/care icons we need (`ui.md` §6.4). Built on the placeholder paw from the mock-ups; Logo: the TB monogram from the AI-assisted design board, traced and cleaned up (`src/lib/assets/brand/`). | ✅ |
| S0.10 | Publish the GitHub repo (public). Before the first push: scan the full history with gitleaks; choose a licence. On creation: secret scanning and push protection, Dependabot alerts and security updates, approval required for first-time contributors' workflows, a ruleset on `main` (no force-push or deletion, CI must pass). Then confirm S0.6's first run is green. Done: MIT licence, README, gitleaks v8.30.1 clean, published, first run green. Ruleset on `main` in place. | ✅ |

### S1 Sign-in and sessions 🟨
*FR-01 (partial), NFR-01, 02. Design: architecture §3.4.*

| # | Task | Status |
|---|---|---|
| S1.1 | Auth0 tenants `toe-beans-dev` and `toe-beans`, EU region, Google and email connections, following `docs/runbooks/auth0.md` (owner). Prod also needs its own Google OAuth client, the custom domain `auth.toebeans.co.za` and an email provider; those can wait for S14.1, but the custom domain must exist before the first real user. Dev tenant done. | 🟨 |
| S1.2 | `IdentityProvider` port with an `openid-client` adapter (lazy discovery). Login transactions in Mongo (10-minute TTL, single use). `/auth/sign-in`, `/auth/callback`, `POST /auth/sign-out` (RP-initiated logout), with a safe `returnTo`. OIDC config validated in `loadConfig`. Mock OIDC provider (`mock-oauth2-server`) in compose and as a CI service. | ✅ |
| S1.3 | Server-side sessions: hashed token as `_id`, 90-day sliding and 400-day absolute expiry, TTL index. `__Host-tb_session` cookie (unprefixed on `http` origins). `AuthContext` resolved in `hooks.server.ts`; signed-out pages redirect to sign-in, `/api` returns 401. Origin check for every non-GET request (replacing Kit's). | ✅ |
| S1.4 | User upsert keyed by `(issuer, subject)`, refreshing email, `email_verified`, name and picture at each sign-in | ✅ |
| S1.5 | Sign-in page (`ui.md` J1 Welcome step) with the retry message, and sign-out on More. E2e through the mock provider: sign in, deep link survives sign-in, sign out, an unknown session goes back to sign-in (expiry is covered by unit tests), a cross-origin POST is refused. | ✅ |
| S1.6 | Rate limit the callback (architecture §7), and a real sign-in on both phones against the dev tenant (Google and email). Done on both phones. | ✅ |
| S1.7 | The display name is the app's (architecture §5.2): sign-ins only replace the email fallback with a provider's real name, and *Your name* on More → Account edits it (`GET`/`PATCH /api/v1/me` with ETag and `If-Match`, `ui.md` §4.7) | ✅ |

### S2 Household and invitations 🟨
*FR-01, scenarios 1 and 9.*

| # | Task | Status |
|---|---|---|
| S2.1 | Create household (name, time zone). Onboarding steps 1–3, including *Your name* (`ui.md` J1 step 2), saved like Account's name field. | ✅ |
| S2.2 | Shareable invite links: create, expiry, revoke, max uses. `/join/:token` flow with all error states. J1 step 5 (*Invite a caregiver*). | ✅ |
| S2.3 | Email invites: `EmailSender` port, Resend adapter, verified-email match on accept. `EMAIL_SENDER` picks console, Mailpit or Resend. Followed end to end through Mailpit, then a real invite through Resend, received and accepted on the Redmi Note 12 Pro. | ✅ |
| S2.4 | Household screen: members, pending invites, revoke | ✅ |
| S2.5 | Isolation end-to-end test: an outsider can't read or accept another household's data or invites by changing IDs | ✅ |
| S2.6 | Leaving and removing members (D18): ownership passes on, the last person out deactivates the household and can rejoin it, and removal revokes the invitations someone could return with. | ✅ |
| S2.7 | Several owners (D19): *Make owner* and *Step down*; owners can't remove or demote each other. | ✅ |

### S3 Dogs and profile photos 🟨
*FR-02, scenario 2.*

| # | Task | Status |
|---|---|---|
| S3.1 | Dog aggregate, CRUD, archive. Exact or estimated birth date. | ✅ |
| S3.2 | `PhotoStore` port with S3 (R2, plus SeaweedFS in compose, D21) and filesystem adapters. Upload pipeline (client framing and downscale, `sharp` re-encode, EXIF strip, 2 sizes). | ✅ |
| S3.3 | Authorised photo serving endpoint with private caching | ✅ |
| S3.4 | Dog switcher and active-dog context. Dog profile screen. Onboarding step 4 (`ui.md` J1), before the invite step. J2's invitation gains the dogs' names. | ✅ |
| S3.5 | On both phones: add a dog with a camera photo (framing by touch, upload over mobile data), change it, and check the Android share sheet for invite links (left over from S2). | ⬜ |

### S4 Exercise library ⬜
*FR-03, NFR-14.*

| # | Task | Status |
|---|---|---|
| S4.1 | Content format and loader (`content/exercises/*.yaml`). Schema validation, coverage check, required review fields and aversive-vocabulary lint at build time (architecture §3.8). | ⬜ |
| S4.2 | Gather sources (articles and videos) per skill area into `content/sources/`. *User-led.* Can start immediately, in parallel with S0. | ⬜ |
| S4.3 | AI-assisted drafting and editing of starter exercises covering all 9 skill areas: original wording, reward-based, each with *If your puppy struggles*, safety notes and `sources[]` | ⬜ |
| S4.3a | **Human review** of each exercise (sets `reviewedBy`/`reviewedAt`) | ⬜ |
| S4.4 | Library list and detail screens | ⬜ |

### S5 Cue dictionary ⬜
*FR-04.*

| # | Task | Status |
|---|---|---|
| S5.1 | Cue CRUD with optimistic concurrency and a conflict UI | ⬜ |

### S6 Training planner ⬜
*FR-05.*

| # | Task | Status |
|---|---|---|
| S6.1 | One-off planned sessions: schedule, reschedule, skip, cancel | ⬜ |
| S6.2 | Recurring plans: recurrence subset, rolling-horizon materialisation (idempotent), edit *this / this and following* | ⬜ |
| S6.3 | Plan week view | ⬜ |

### S7 Quick training log ⬜
*FR-07, scenario 3.*

| # | Task | Status |
|---|---|---|
| S7.1 | SessionLog aggregate: outcome default `not_assessed`, optional context, links to a planned session in one transaction | ⬜ |
| S7.2 | Quick log sheet: scheduled and ad-hoc paths. Measure the < 30 s target in a Playwright scenario. | ⬜ |
| S7.3 | Edit a log | ⬜ |

### S8 Today dashboard ⬜
*FR-06.*

| # | Task | Status |
|---|---|---|
| S8.1 | Today read model (overdue, planned, done, skipped, upcoming care), computed in the household time zone | ⬜ |
| S8.2 | Today screen with per-dog identification and a direct log action | ⬜ |

### S9 Behaviour journal ⬜
*FR-08, scenario 6.*

| # | Task | Status |
|---|---|---|
| S9.1 | BehaviourEvent CRUD, record-event sheet | ⬜ |

### S10 History ⬜
*FR-09.*

| # | Task | Status |
|---|---|---|
| S10.1 | Combined timeline query with filters (dog, type, exercise, dates) and cursor pagination | ⬜ |
| S10.2 | Soft delete with confirmation and undo. Purge job. | ⬜ |

### S11 Care calendar ⬜
*FR-10, scenario 7.*

| # | Task | Status |
|---|---|---|
| S11.1 | CareTask with status history. Create, edit, complete, cancel. | ⬜ |
| S11.2 | Care tab, and Today's *Coming up* integration | ⬜ |

### S12 Push reminders ⬜
*FR-12, NFR-16, scenarios 4 and 5. Builds on the S-1 findings.*

| # | Task | Status |
|---|---|---|
| S12.1 | PushSubscription lifecycle: subscribe, unsubscribe, list devices, disable on 404/410 | ⬜ |
| S12.2 | ReminderPreference per member | ⬜ |
| S12.3 | NotificationJob + `ReminderPlanner.replan` wired transactionally into session and care use cases | ⬜ |
| S12.4 | `worker.tick`: atomic claim, stale-subject guard, retries/backoff, recovery of stuck `sending` jobs. Both trigger modes (HTTP endpoint and inline loop). | ⬜ |
| S12.5 | Service worker `push` + `notificationclick` deep links, including the cancelled-item landing state | ⬜ |
| S12.6 | Notifications settings state-machine screen, *Make reminders reliable* card (per-manufacturer steps) and the **delayed** test reminder (`ui.md` J7) | ⬜ |
| S12.7 | Tests: reschedule/cancel produces no stale sends, concurrent ticks produce no duplicates, denied/revoked permission | ⬜ |

### S13 PWA polish and connectivity ⬜
*NFR-03, 04, 09.*

| # | Task | Status |
|---|---|---|
| S13.1 | Manifest, icons (export the PNG sizes from `src/lib/assets/brand/`), shortcuts, install prompt handling. The service worker precaches only the Latin font files. | ⬜ |
| S13.2 | Offline banner, offline shell, failed-save retention and retry (scenario 8) | ⬜ |
| S13.3 | Cold-start skeletons and the "Waking up" message. Measure view timings on both phones. | ⬜ |
| S13.4 | Accessibility pass (TalkBack, 200% font scaling) | ⬜ |

### S14 Operations and release ⬜
*NFR-05, 07, 10, 12, scenario 10.*

| # | Task | Status |
|---|---|---|
| S14.1 | Production environment provisioned (the platform chosen in S-1). Secrets in the platform store, including `RESEND_API_KEY`, which prod won't start without. Budget alert. Deploy workflow per architecture D15: Workload Identity Federation with an attribute condition pinning this repo and the `production` environment, a least-privilege deploy service account, a `production` environment (main only, owner approval), images in Artifact Registry deployed by digest. The client address for rate limits (architecture §7): the Worker forwards `CF-Connecting-IP`, `ADDRESS_HEADER`/`XFF_DEPTH` are set to match, and a sign-in from a phone confirms the app sees the phone's address. | ⬜ |
| S14.2 | Nightly encrypted `mongodump` to R2, photo bucket copy, retention | ⬜ |
| S14.3 | Restore runbook written **and tested** (`docs/runbooks/restore.md`) | ⬜ |
| S14.4 | Uptime monitor. Sentry alerts. Accounts inventory (`docs/runbooks/accounts.md`). | ⬜ |
| S14.5 | Personal data deletion use case (user and household) | ⬜ |
| S14.6 | Durability check: redeploy or restart and verify all data persists (scenario 10) | ⬜ |
| S14.7 | Release acceptance: run scenarios 1–10 on both physical phones and record Android/Chrome versions | ⬜ |

---

## P1 — Phase 1 follow-on

| Slice | Requirement | Notes | Status |
|---|---|---|---|
| P1-A Goals and milestones | FR-11 | Per dog × skill. Stages: introduced → developing → reliable in context. | ⬜ |
| P1-B Age-aware starter plan | FR-13 | Suggestions with accept/edit/dismiss. No universal vet dates. | ⬜ |
| P1-C Progress summary | FR-14 | Weekly practice consistency vs outcome distribution. `Not assessed` is never counted as success. | ⬜ |
| P1-D Care records and contacts | FR-15 | Vet details, weight entries, health notes | ⬜ |
| P1-E Data export | FR-16 | Owner-only JSON export of household records, with no secrets or push endpoints | ⬜ |
| P1-F Draft persistence | NFR-04 | Unsent form drafts survive an app kill (`ui.md` §5.2) | ⬜ |
| P1-H Quiet hours | FR-12 | Per-member reminder suppression window | ⬜ |

## Later phase (beyond Phase 1, not P2 scope cuts)

| Item | Notes |
|---|---|
| Delivery diagnostics screen | Owner view of recent notification jobs and device failures. Deferred in review round 1; the data already exists in `NotificationJob`. |

## P2 — Deferred (not planned)

See `requirements.md` §3 "Explicitly deferred". Highlights: AI recommendations, analytics and charts, offline sync, custom exercises, galleries and document uploads, multi-household admin.

---

## Suggested sequencing

```
S-1 spikes ─┐
S0 ─────────┴─► S1 ─► S2 ─► S3 ─► S4 ─► S6 ─► S7 ─► S8 ─► S12 ─► S13 ─► S14
                                   └─► S5      └─► S9 ─► S10
                                               └─► S11 ──────┘
```

The first usable checkpoint ("we can train with it") is the end of S8, without push or care. The P0 MVP is complete at S14.
