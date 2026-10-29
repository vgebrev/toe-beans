# Toe Beans — Backlog

**Version:** 0.2 (draft for iteration)
**Date:** 28 October 2026
**Inputs:** `docs/requirements.md` v1.0, `docs/architecture.md` v0.3, `docs/ui.md` v0.4

Work is organised as **vertical slices**: each delivers a usable end-to-end increment through UI → API → application → domain → persistence, with tests. Slices are ordered by **dependency and risk**. The riskiest unknowns (push with the app closed, free hosting) are spiked first, before building on them.

**Status key:** ⬜ not started · 🟨 in progress · ✅ done · ⏸ blocked · ❌ dropped

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

**Next up:** review and accept the decisions in `architecture.md` §2, then S-1 (spikes) and S0 (foundations) in parallel.

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
| S-1.2 | Web Push via VAPID: subscribe, send from the server, receive **with the PWA closed** on the Galaxy S23 FE and Redmi Note 12 Pro. Record battery and optimisation settings needed (especially MIUI/HyperOS). *Built in `spikes/pwa` and verified end to end in desktop Chrome (FCM accepted, service worker received in ~2 s). Waiting on the phone checklist in `spikes/pwa/README.md`.* | 🟨 |
| S-1.0 | Check which South African regions Atlas offers for free clusters (Q7). **Result: AWS `af-south-1` (Cape Town) only.** Topology: Cloud Run Johannesburg + Atlas Cape Town (architecture §8.4). | ✅ |
| S-1.3 | Deploy to Cloud Run (`africa-south1`, Johannesburg), with Cloud Scheduler calling `/internal/tick` every minute. Measure cold start against the **≤ 5 s** budget, tick reliability over 48 h, and confirm **$0** in billing reports for a Tier 2 region (Q9). Budget alert on. Also: the service worker shows a "Can't reach Toe Beans" page when a page load gets a 502/503/504 from the platform (found in S-1.1: gateway error pages bypass the offline fallback). | ⬜ |
| S-1.4 | Atlas free cluster on AWS `af-south-1` (Cape Town). Measure the Cloud Run → Atlas round trip and the warm Today API time (≤ 250 ms p95 budget), plus end-to-end latency from both phones. Confirm transactions work. Set up the access list and least-privilege users as in architecture §8.4. | ⬜ |
| S-1.4b | *Only if S-1.4 misses its budget:* try topology 1b (the same image on AWS Lambda in Cape Town via Lambda Web Adapter, plus an EventBridge tick) and compare | ⬜ |
| S-1.4a | Custom domain `toebeans.gebrev.com` on Cloud Run: try domain mapping, then a Firebase Hosting rewrite (`__session` cookie constraint), then a Cloudflare Worker (Q8). | ⬜ |
| S-1.5 | Fallback check: the same image under docker compose behind IIS (ARR + win-acme), push working end-to-end | ⬜ |
| S-1.6 | Write the outcome into architecture D9 and mark it Accepted | ⬜ |

### S0 Foundations ⬜
*FR: none. NFR-06, 08, 11, 12, 15.*

| # | Task | Status |
|---|---|---|
| S0.1 | pnpm workspace: `apps/web`, `packages/backend`, `packages/contracts`. TypeScript strict. ESLint + Prettier. Layer-boundary lint rules. | ⬜ |
| S0.2 | Backend skeleton: config (validated env), composition root, `Clock`, ID generation, `Result`/error types, problem+json mapping | ⬜ |
| S0.3 | Mongo infrastructure: client lifecycle, `UnitOfWork`, migration runner, household-scoped base repository plus the reusable isolation test suite | ⬜ |
| S0.4 | pino logging with request IDs and redaction. `/healthz`, `/readyz`. Sentry wiring (server + browser). | ⬜ |
| S0.5 | Dockerfile (multi-stage, non-root). `docker compose` for local dev (Mongo replica set + MinIO). | ⬜ |
| S0.6 | GitHub Actions: lint → typecheck → unit → integration (Testcontainers) → image build | ⬜ |
| S0.7 | Vitest + Playwright setup with an Android device profile | ⬜ |
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
| S12.6 | Notifications settings state-machine screen and test notification | ⬜ |
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
| Move to `toebeans.co.za` | Config-only domain switch (architecture §8.4). Devices re-subscribe to push. |

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
