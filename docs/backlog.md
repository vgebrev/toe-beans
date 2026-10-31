# Toe Beans — Backlog

**Version:** 0.3 (draft for iteration)
**Date:** 31 October 2026
**Inputs:** `docs/requirements.md` v1.0, `docs/architecture.md` v0.5, `docs/ui.md` v0.5

**Changes in 0.3:** spike results S-1.0 to S-1.4 and S0.1–S0.3 recorded as they landed (see Current progress). S-1.4b dropped as not needed, S-1.5 parked, S-1.4a retargeted to `toebeans.co.za`.

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

**Next up:** S-1.3 write-up after its 48 h tick run ends (1 Nov 23:12 SAST), and the GCP billing check (Q9), then S-1.6 (D9 accepted). S0 foundations in parallel (S0.1–S0.3 done; S0.4 next).

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

### S-1 Spikes: de-risk hosting and push 🟨
*Goal: decide D9 (hosting) with evidence. Throwaway code is allowed.*

| # | Task | Status |
|---|---|---|
| S-1.1 | Minimal SvelteKit + service worker PWA, installable on both phones. **Result: installs on the Galaxy S23 FE and Redmi Note 12 Pro, shows the offline page in flight mode, and recovers once the connection returns.** Spike in `spikes/pwa`. | ✅ |
| S-1.2 | Web Push via VAPID: subscribe, send from the server, receive **with the PWA closed** on the Galaxy S23 FE and Redmi Note 12 Pro. Record battery and optimisation settings needed (especially MIUI/HyperOS). **Result: works on both, but only reliably after lifting Chrome's battery restriction (Samsung *Unrestricted*, Xiaomi *No restrictions*). Without it, pushes are lost once the phone has been locked for 1–2 min. Deep sleep adds up to ~75 s. Findings in architecture §6.4, risk R5.** | ✅ |
| S-1.0 | Check which South African regions Atlas offers for free clusters (Q7). **Result: AWS `af-south-1` (Cape Town) only.** Topology: Cloud Run Johannesburg + Atlas Cape Town (architecture §8.4). | ✅ |
| S-1.3 | Deploy to Cloud Run (`africa-south1`, Johannesburg), with Cloud Scheduler calling `/internal/tick` every minute. Measure cold start against the **≤ 5 s** budget, tick reliability over 48 h, and confirm **$0** in billing reports for a Tier 2 region (Q9). Budget alert on. Also: the service worker shows a "Can't reach Toe Beans" page when a page load gets a 502/503/504 from the platform (found in S-1.1: gateway error pages bypass the offline fallback). | ⬜ |
| S-1.4 | Atlas free cluster on AWS `af-south-1` (Cape Town). Measure the Cloud Run → Atlas round trip and the warm Today API time (≤ 250 ms p95 budget), plus end-to-end latency from both phones. Confirm transactions work. Set up the access list and least-privilege users as in architecture §8.4. | ✅ |
| S-1.4b | *Only if S-1.4 misses its budget:* try topology 1b (the same image on AWS Lambda in Cape Town via Lambda Web Adapter, plus an EventBridge tick) and compare | ❌ not needed |
| S-1.4a | Custom domain `toebeans.co.za` on Cloud Run. Domain mapping isn't offered in `africa-south1`, so compare a Cloudflare Worker (nameservers to Cloudflare) and a Firebase Hosting rewrite (`__session` cookie constraint; ruled out: no `africa-south1` support): latency from both phones against S-1.4, cookies, push from the custom origin (Q8). **Result: Cloudflare Worker, ~12–28 ms added at p50, cookies and push work. The app sets Kit `paths.origin`, or SvelteKit's CSRF check rejects POSTs. Spike in `spikes/domain`.** | ✅ |
| S-1.5 | Fallback check: the same image under docker compose behind IIS (ARR + win-acme), push working end-to-end. **Parked** while Cloud Run stays free; S0.5 keeps the compose setup working (R1). | ⏸ |
| S-1.6 | Write the outcome into architecture D9 and mark it Accepted | ⬜ |

### S0 Foundations 🟨
*FR: none. NFR-06, 08, 11, 12, 15.*

| # | Task | Status |
|---|---|---|
| S0.1 | pnpm workspace: `apps/web`, `packages/backend`, `packages/contracts`. TypeScript strict. ESLint + Prettier. Layer-boundary lint rules. | ✅ |
| S0.2 | Backend skeleton: config (validated env), composition root, `Clock`, ID generation, `Result`/error types, problem+json mapping | ✅ |
| S0.3 | Mongo infrastructure: client lifecycle (connect before the server listens, S-1.4), `UnitOfWork`, migration runner, household-scoped base repository plus the reusable isolation test suite | ✅ |
| S0.4 | pino logging with request IDs and redaction. `/healthz`, `/readyz` (ready only once Mongo is connected). Sentry wiring (server + browser). | ⬜ |
| S0.5 | Dockerfile (multi-stage, non-root). `docker compose` for local dev (Mongo replica set + MinIO). | ⬜ |
| S0.6 | GitHub Actions: lint → typecheck → unit → integration (Testcontainers) → image build | ⬜ |
| S0.7 | Vitest + Playwright setup with an Android device profile (Vitest done in S0.1) | ⬜ |
| S0.8 | App shell: layout, bottom navigation, theme tokens, shadcn-svelte install, typed API client | ⬜ |
| S0.9 | Brand: AI-assisted paw-print logo cleaned into SVG, plus its variants (maskable icon, monochrome badge, favicon). Beagle and German Shepherd tokens with an automated contrast test. Per-device theme switch (system default, `localStorage`, no flash). Self-hosted Fredoka + Nunito (confirmed). Icon library: Hugeicons free (MIT) behind an `<Icon>` wrapper; map the pet/care icons we need (`ui.md` §6.4). | ⬜ |

### S1 Sign-in and sessions ⬜
*FR-01 (partial), NFR-01, 02.*

| # | Task | Status |
|---|---|---|
| S1.1 | Auth0 tenant (dev + prod), Google and email connections | ⬜ |
| S1.2 | OIDC login/callback/logout via `openid-client`. Server-side sessions with a TTL. `__Host-` cookie. | ⬜ |
| S1.3 | `AuthContext` resolution in `hooks.server.ts`. Origin check for mutations. | ⬜ |
| S1.4 | User upsert keyed by `(issuer, subject)` | ⬜ |

### S2 Household and invitations ⬜
*FR-01, scenarios 1 and 9.*

| # | Task | Status |
|---|---|---|
| S2.1 | Create household (name, time zone). Onboarding steps 1–2. | ⬜ |
| S2.2 | Shareable invite links: create, expiry, revoke, max uses. `/join/:token` flow with all error states. | ⬜ |
| S2.3 | Email invites: `EmailSender` port, Resend adapter, verified-email match on accept | ⬜ |
| S2.4 | Household screen: members, pending invites, revoke | ⬜ |
| S2.5 | Isolation end-to-end test: an outsider can't read or accept another household's data or invites by changing IDs | ⬜ |

### S3 Dogs and profile photos ⬜
*FR-02, scenario 2.*

| # | Task | Status |
|---|---|---|
| S3.1 | Dog aggregate, CRUD, archive. Exact or estimated birth date. | ⬜ |
| S3.2 | `PhotoStore` port with S3 (R2/MinIO) and filesystem adapters. Upload pipeline (client downscale, `sharp` re-encode, EXIF strip, 2 sizes). | ⬜ |
| S3.3 | Authorised photo serving endpoint with private caching | ⬜ |
| S3.4 | Dog switcher and active-dog context. Dog profile screen. Onboarding step 3. | ⬜ |

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
| S13.1 | Manifest, icons, shortcuts, install prompt handling | ⬜ |
| S13.2 | Offline banner, offline shell, failed-save retention and retry (scenario 8) | ⬜ |
| S13.3 | Cold-start skeletons and the "Waking up" message. Measure view timings on both phones. | ⬜ |
| S13.4 | Accessibility pass (TalkBack, 200% font scaling) | ⬜ |

### S14 Operations and release ⬜
*NFR-05, 07, 10, 12, scenario 10.*

| # | Task | Status |
|---|---|---|
| S14.1 | Production environment provisioned (the platform chosen in S-1). Secrets in the platform store. Budget alert. | ⬜ |
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
