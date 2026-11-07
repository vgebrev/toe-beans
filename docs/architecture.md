# Toe Beans — Architecture

**Version:** 1.5 (accepted baseline)
**Date:** 7 November 2026
**Status:** Accepted as the baseline on 1 November 2026, once the S-1 spikes closed. From here on a change of decision is recorded in the decision log (§2) with what prompted it, and a change that moves scope goes through `requirements.md` as a recorded scope change.
**Inputs:** `docs/requirements.md` v1.0 (baselined)

**Changes in 0.2:** first review round. A billing-enabled GCP account is acceptable. The region is South Africa where possible, and cold starts of a few seconds are acceptable. The domain is `toebeans.gebrev.com`. The exercise content pipeline is defined, and the delivery diagnostics UI is deferred. Added D13–D14 (§8.4, §3.8) and new open questions Q7–Q9.

**Changes in 0.3:** S-1.0 result: Atlas offers a free South African cluster only on **AWS Cape Town (`af-south-1`)**, not on GCP Johannesburg. The topology is now Cloud Run Johannesburg + Atlas AWS Cape Town (cross-provider). Added a database round-trip budget, the database network-access approach (§8.4) and an AWS-only fallback topology. Q7 resolved.

**Changes in 0.4:** S-1.1 and S-1.2 results. The PWA installs on both acceptance phones. Web Push reaches both phones with the app closed, but **only reliably once Chrome's battery restriction is lifted** (§6.4). Added a send policy (urgency `high`, TTL per reminder type), the notification-tap rule, Android delivery findings (§6.4) and risk R5. Q4 resolved.

**Changes in 0.5:** S-1.4 result: Cloud Run Johannesburg → Atlas Cape Town is well inside budget on both phones, so topology 1 is confirmed, the AWS fallback is not needed and R4 is retired (§8.4). The domain is `toebeans.co.za` from the first release, replacing `toebeans.gebrev.com`. Cloud Run domain mapping isn't offered in `africa-south1`, so S-1.4a compares Cloudflare and Firebase Hosting (§8.4, Q5, Q8). S0.1 and S0.2 built: layer rules enforced with ESLint `no-restricted-imports` (§4.2), and backend config validation, the error-to-problem mapping and monotonic IDs (§7). D1–D4, D6, D13 and D14 accepted; Node 24.

**Changes in 0.6:** S-1.4a result: Firebase Hosting's Cloud Run rewrites don't support `africa-south1`, so a **Cloudflare Worker** fronts Cloud Run on `toebeans.co.za`, adding ~12–28 ms at p50 on the phones (§8.4, D13; Q8 resolved). The app sets its public origin at build time (Kit `paths.origin`), because behind the Worker SvelteKit's CSRF check took `run.app` as the origin (§8.4). S0.3 built: the Mongo client connects and migrates before the server listens, `UnitOfWork` carries its session in `AsyncLocalStorage`, a lease-locked migration runner, and the household-scoped base collection with its isolation suite (§3.5, §4.4, §7). Integration tests run on Atlas Local 8.0 (§10). S0.4 built: pino logs in Cloud Logging's format with a request ID on every line, redaction and error-text masking, `/readyz`, and Sentry on the server (behind an `ErrorReporter` port) and in the browser (loaded only when a DSN is set) (§8.1, §9).

**Changes in 0.7:** S0.5 built: the app image (`docker/Dockerfile`) and a local compose file (`docker/compose.yaml`) with Atlas Local and, behind a profile, the app (§8.1). `apps/web`'s `dependencies` are now exactly what the server bundle imports at runtime. MinIO is dropped: its community edition is no longer published, so local object storage waits for S3.2 (§3.6, §8.2, §8.3).

**Changes in 0.8:** The repo will be public. Added D15, how CI and deploys stay safe on a public repo: fork-safe CI with no secrets, keyless deploys through Workload Identity Federation pinned to this repo and a gated `production` environment, runtime secrets only in Secret Manager, and supply-chain rules (§10). S0.6's CI workflow is written; its first run waits for the GitHub repo.

**Changes in 0.9:** S0.7 built: Playwright end-to-end tests against the production build, on emulated profiles of the two acceptance phones, with a CI job (§10).

**Changes in 0.10:** The Galaxy S23 FE test profile is now the owner's measured 384 × 700 CSS px at 2.8125×, replacing an estimate (§10).

**Changes in 0.11:** S0.8 built the typed API client: every outcome is a value (problem details, another HTTP error, or no response), and only a response that breaks its contract throws (§3.3). The build is named after `APP_RELEASE` or the git commit, so browser error reports and the More page show the same release (§9). Local settings come from a gitignored `.env` at the repo root, with a public `.env.example` of sample values (§7). New e2e suites for the shell and the theme (§10). The UI toolkit itself (Tailwind 4, shadcn-svelte, tokens, fonts, icons) is recorded in `ui.md` §6.4.

**Changes in 0.12:** Dependabot skips major updates of `typescript` (7 is outside the peer ranges of typescript-eslint, svelte-check and SvelteKit, so the update failed the whole npm run) and `@types/node` (which follows the Node major we run) (§10, D15). Work lands on `develop`, and `main` moves by pull request from it, so the ruleset's required CI checks gate every change to `main`; CI also runs on pushes to `develop` (§10).

**Changes in 0.13:** S1 design. Auth0 runs as two tenants, dev and prod, both in the **EU** region: Auth0 has no African region, Europe is the nearest, and only sign-in talks to it, so its distance never touches normal requests. Prod signs in on `auth.toebeans.co.za` from the first user, because users are keyed by issuer (D5, §3.4, §8.4). The identity provider is the one exception to D13's same-country rule: account email and name sit in the EU, which POPIA §72 allows (GDPR-adequate protection). §3.4 now specifies the sign-in flow, the login transaction, server-side sessions (90-day sliding, 400-day absolute), cookies on http origins, logout, and a mock OIDC provider for e2e and offline dev, so no test-only sign-in backdoor exists. S1.2–S1.5 built: one person's Google and email/password sign-ins become one user, linked in the app by verified email, and sign-in with an unverified email is refused (§3.4, §5.2; Q10 raised and resolved). Kit's CSRF check is off and the hooks Origin check covers every non-GET request against the runtime `PUBLIC_BASE_URL`, because adapter-node assumes `https` and behind the Worker sees `run.app`; this replaces the planned build-time `paths.origin`, so the origin stays runtime config (§3.4, §8.4). The e2e suite gains `auth`, and the other suites start signed in (§10).

**Changes in 1.0:** S-1.3 result and baseline. Cloud Run in `africa-south1` with Cloud Scheduler meets every spike target: 2,891 of 2,891 ticks over 48 h with no errors (lag p50 0.33 s, p95 1.00 s, max 9.15 s, the slow ones on warm instances, so the delay is Scheduler's), two instance replacements without a missed tick, a cold container serving its first response in 0.62 s against the 5 s budget, and $0 billed for the Tier 2 region (§6.3, §8.2, §8.4; Q9 resolved). The service worker's *Can't reach Toe Beans* page for platform 502/503/504 works (§7). D8 and D9 accepted on these results (S-1.6). The remaining proposed decisions (D5, D7, D10–D12, D15) are accepted as the baseline; D5, D10, D12 and the CI half of D15 are already built. Leftovers that named S-1.6 move to S14.1 (deploy workflow, registry, trace correlation), and §8.1 and §8.4 no longer mention a build-time origin, which 0.13 replaced with the runtime `PUBLIC_BASE_URL`.

**Changes in 1.5:** D19: a household can have several owners. Owners make caregivers owners and can step down, but can't remove or demote each other. `PATCH /api/v1/household/members/:id` changes a role (FR-01, §5.2).

**Changes in 1.4:** S2: households and invitations. D16 keeps a person to one household, enforced by a unique index, so an invite to someone already in one is refused (FR-01). D17 sets who invites and on what terms: any member invites, an owner or the inviter revokes, and each invitation lets one person in for 7 days (FR-01, NFR-02). `AuthContext` is now `MemberContext` inside a household, resolved in parallel with the user to stay within the round-trip budget (§3.4, §8.4). A household document has no `householdId` of its own (§3.5). Invite tokens sit briefly in a pending sign-in's `returnTo` (§3.4). `EMAIL_SENDER` chooses among the console, Mailpit and Resend senders, and prod accepts only Resend (§3.7). New problem types `rate-limited` and `unavailable` (§7), and `content-type` joins the headers kept for universal loads, without which any API error in a server render was a 500 (§3.3). D18 adds leaving and removing members: ownership passes to the longest-standing member, the last person out deactivates the household, and only they can bring it back (FR-01, NFR-02, §5.2). Migration 0003 narrows the one-household index to households with members, as a second empty household would otherwise collide on a null key.

**Changes in 1.3:** S1.7: the display name is the app's, not the provider's. A sign-in no longer replaces it with the provider's latest name (it changed with each sign-in method), and only fills in a real name over the email fallback; the person edits it on More, and a name they set is never replaced (§3.4, §5.2). `GET`/`PATCH /api/v1/me` is the first versioned resource, which settles the ETag format (`"<version>"`), what a malformed `If-Match` means (412), and that `hooks.server.ts` lets universal loads read `etag` and `x-request-id` (§3.3, NFR-13). A sign-in writes the user only when something changed, so signing in elsewhere doesn't make an open edit stale.

**Changes in 1.2:** S1.6 rate limit built: sign-in and its callback share one in-memory budget per client address, `AUTH_RATE_LIMIT` steps per 10 minutes (default 30), checked before any write or provider call. §7 now says where the client address comes from and why, behind Cloud Run and the Worker, it needs S14.1's proxy settings and the Worker's header secret to be per person (NFR-01, NFR-02). The ID token's signature is checked against the provider's JWKS: `openid-client` skips that by default, as OIDC Core §3.1.3.7 allows for a token fetched over TLS, and the adapter now turns it on (§3.4).

**Changes in 1.1:** the tick runs every **5 minutes** instead of every minute, sending each reminder due before the next tick, so reminders go out up to 5 minutes early and never late; the *Test reminders* push is the exception and never goes early (D9, §6.2, §6.3, §8.2). The interval is configuration. Q9 gains how the free tier is billed: a spending-based discount at Tier 1 prices, confirmed by Google Cloud Assist against the October bill.

This document records the technical decisions, domain model and system structure for the Toe Beans MVP. Every decision weighs alternatives against the requirement IDs (FR-xx / NFR-xx). Free-tier figures were checked against public sources in October 2026. They change often, so re-verify them before committing (see §11).

---

## 1. Architectural drivers

These requirements shape the architecture most. Everything else is fairly conventional CRUD.

| Driver | Source | Consequence |
|---|---|---|
| Push reminders while the PWA is closed | FR-12, NFR-16 | Something on the server must wake up on a schedule, find due reminders and send Web Push. This isn't a simple "free web host" problem, because most free hosts sleep. |
| Household isolation on every operation | NFR-01, NFR-02, scenario 9 | Authorization must be structural (enforced in repositories), not remembered per endpoint. |
| Extractable backend | NFR-06, NFR-08, NFR-15 | The backend is a separate package with no SvelteKit imports. The frontend talks to it only over HTTP. |
| Free hosting, self-host fallback | NFR-07 | All infrastructure sits behind ports so the cloud and self-hosted deployments differ only in adapters and config. |
| Durable data and photos | NFR-05, NFR-10, scenario 10 | External database and object storage, with backups that we schedule ourselves (the free database tier has no backups). |
| Concurrent caregivers | NFR-13 | Optimistic concurrency on every mutable aggregate. |
| Android/Chrome PWA | NFR-03 | Web Push via VAPID works in Chrome without a native wrapper. No need for an iOS-driven design. |

---

## 2. Decision log

Status: **P** = proposed, **A** = accepted (with what settled it; *baseline* = accepted with v1.0 and confirmed as it's built), **R** = rejected/superseded. Each decision is detailed in the section noted.

| # | Decision | Recommendation | Status | § |
|---|---|---|---|---|
| D1 | Language | TypeScript end-to-end on Node 24 LTS | A (S0.1) | 3.1 |
| D2 | Frontend framework | SvelteKit 3 (Svelte 5) with `adapter-node` | A (S-1.1, S0.1) | 3.2 |
| D3 | Frontend ↔ backend contract | Versioned JSON HTTP API (`/api/v1`) in `+server.ts` routes. No form actions or remote functions for domain operations. | A (review rounds, S0.2) | 3.3 |
| D4 | Backend structure | DDD-layered package in a pnpm workspace, with boundaries enforced by lint | A (S0.1) | 4 |
| D5 | Identity provider | Auth0 (free plan), via the OIDC Authorization Code + PKCE flow handled by the server (BFF). Two tenants (dev, prod) in the EU region; prod on the custom domain `auth.toebeans.co.za`. Mongo-backed server sessions. | A (baseline; built in S1.2–S1.5) | 3.4 |
| D6 | Database | MongoDB (Atlas free cluster), official driver, no ODM | A (S-1.0, S-1.4) | 3.5 |
| D7 | Photo storage | Cloudflare R2 (S3 API) | A (baseline) | 3.6 |
| D8 | Push scheduling | Mongo-backed job collection plus an idempotent `tick` that both external cron and an in-process loop can trigger | A (S-1.3) | 6 |
| D9 | Hosting | Google Cloud Run (`africa-south1`, min-instances 0) + Cloud Scheduler calling the tick every 5 minutes (§6.3). Self-host behind IIS stays the fallback (R1). A billing-enabled account is acceptable (review round 1). | A (S-1.3, S-1.6) | 8 |
| D10 | Observability | pino JSON logs to the platform log sink, Sentry for errors, an external uptime monitor. OpenTelemetry deferred. | A (baseline; logs and Sentry built in S0.4, uptime monitor in S14.4) | 9 |
| D11 | Email for invitations | Resend (free tier) behind an `EmailSender` port | A (baseline) | 3.7 |
| D12 | UI toolkit | Tailwind CSS + shadcn-svelte (Bits UI primitives), themed with Toe Beans brand tokens | A (baseline; built in S0.8) | `ui.md` §6.4 |
| D13 | Region and domain | South Africa: Cloud Run in `africa-south1` (Johannesburg) + Atlas free on AWS `af-south-1` (Cape Town), the only free South African Atlas option. App and database stay in the same country; cross-continent is never acceptable (the identity provider, Auth0 EU, is the one exception: sign-in only, §3.4). Served at `toebeans.co.za` through a Cloudflare Worker in front of Cloud Run (S-1.4a). | A (S-1.4, S-1.4a) | 8.4 |
| D15 | CI/CD on a public repo | Untrusted PR code runs only with no secrets and a read-only token. Deploys use keyless Workload Identity Federation pinned to this repo and the `production` environment (main only, owner approval). Runtime secrets live only in GCP Secret Manager. Actions pinned to SHAs. | A (baseline; CI built in S0.6, deploy in S14.1) | 10 |
| D14 | Exercise content pipeline | Curated from online sources, AI-assisted editing, mandatory human review, sources recorded per exercise | A (review round 1, Q6) | 3.8 |
| D16 | Households per person | One. A unique multikey index on `memberships.userId` enforces it across documents, which also covers a double tap and two invites accepted at once. An invite to someone already in a household is refused, not merged (FR-01). Allowing more later means dropping the index and adding a household switcher. | A (S2) | 5.2 |
| D17 | Invitation terms | Any member can invite, as FR-01 says a caregiver can. An owner can revoke any invitation, a caregiver only their own. Each invitation lets one person in and lasts 7 days, so a leaked link admits at most one stranger; a second person gets their own link, revocable on its own. Both are constants, with no choice in the UI yet (FR-01, NFR-02). | A (S2) | 5.2 |
| D18 | Leaving a household | Anyone can leave, and an owner can remove a caregiver; a household keeps an owner, so if the only one goes, the longest-standing member takes over. Removing someone also revokes the invitations they made or were sent, which they could otherwise return with. Someone who leaves by choice keeps theirs: they may be for a person the household still wants. The last person out deactivates the household: its records stay, every open invitation is revoked (accepted then, a link would hand a stranger the household and its history), and only that person can bring it back, as owner, from onboarding. Limiting it to them means nobody regains data they'd already walked away from. If they've left several, the latest is offered. Later versions can sweep long-inactive ones (FR-01, NFR-02). | A (S2) | 5.2 |
| D19 | Several owners | A household can have more than one, so a couple stand equal: with one, either partner could be at the other's mercy. Any owner can make a caregiver an owner. Owners can't remove or demote each other, so neither can lock the other out, which makes promoting someone a step only they can undo, and the sheet says so. An owner can step down to caregiver while another owner stays. If owners fall out, each can still leave (FR-01). | A (S2) | 5.2 |

---

## 3. Technology choices and alternatives

### 3.1 Language: TypeScript

| Option | For | Against |
|---|---|---|
| **TypeScript on Node** ✅ | One language and toolchain. Shared request/response schemas between UI and API. Matches the agreed SvelteKit and "Node-compatible core" constraint. Mature `web-push`, `openid-client`, Mongo driver and `sharp`. | Weaker runtime type guarantees, so validation must be explicit at boundaries. |
| C# / .NET (minimal APIs) | Excellent DDD ergonomics, strong typing, first-class on IIS (the fallback host). | Two languages and two build pipelines. Breaks the "single full-stack SvelteKit container" baseline (NFR-06). No shared types without code generation. |
| Go | Tiny images, fast cold starts (nice for scale-to-zero). | Two languages. Less ergonomic for rich domain modelling. Same NFR-06 conflict. |

TypeScript wins mainly because it's the only option that satisfies the baseline without a scope change. If extraction ever happens, the extracted API stays on Node (Fastify) under NFR-15. A .NET rewrite is not part of the plan.

### 3.2 Frontend: SvelteKit

| Option | For | Against |
|---|---|---|
| **SvelteKit** ✅ | Small bundles (good for mid-range Android). Built-in service worker support. Can build both SSR and static, which makes the later split realistic. Already agreed. | Smaller component ecosystem than React. |
| Next.js (React) | Largest ecosystem. | Heavier client. Server Components/actions pull logic into the framework, the opposite of NFR-15. Static export is constrained. |
| Nuxt (Vue) | Comparable to SvelteKit. | No advantage that justifies reopening the decision. |
| Angular | Strong structure. | Heavy for a small PWA. Not a full-stack framework. |

**Rendering mode:** SSR on, with universal `load` functions (`+page.ts`) that call the API through SvelteKit's `fetch`. Because pages never call backend code directly, switching to `adapter-static` later is mostly a config change (`ssr = false`, set an API base URL). Server-only `+page.server.ts` loads are allowed only for auth/session bootstrapping.

### 3.3 Frontend ↔ backend contract

- REST-style JSON under `/api/v1/...`, implemented in `src/routes/api/v1/**/+server.ts`.
- Each route handler does four things: parse the request → call `backend.http.<handler>(ctx, input)` → map the result to a `Response`. It contains no business logic.
- Request/response schemas (Zod) live in `packages/contracts`. Both the API and a typed client in the web app import them.
- Errors use RFC 9457 `application/problem+json`, with stable `type` codes (e.g. `toe-beans/conflict`, `toe-beans/forbidden`).
- Optimistic concurrency: `GET` returns an `ETag` holding the aggregate version. Mutations require `If-Match`, and a stale version returns `412`, which the UI shows as "someone else changed this" (NFR-13). The ETag is the version in quotes (`"7"`, `http/etag.ts`). A missing `If-Match` is a 428; one that can't be ours (`*`, a list, a weak tag) can't match either, so it's a 412. Kit serialises a server render's fetch responses for hydration and drops their headers unless told, so `hooks.server.ts` keeps `content-type`, `etag` and `x-request-id` for universal loads. Reading any other header in one throws, so the client's `content-type` check needs it to report an API error during a server render.

**Typed client (S0.8, `apps/web/src/lib/api-client`).** `createApiClient(fetch, base = '/api/v1')` gives `get(path, schema)` and `send(method, path, { body, ifMatch, schema })`. Universal loads pass SvelteKit's `fetch`; moving the API later only changes `base` (§4.3). Each call returns `{ ok: true, data, etag }` or `{ ok: false, error }`, where the error is `problem` (validated RFC 9457 details plus the request ID), `http` (an error without problem details, such as a gateway 502 during a cold start) or `network` (no response). The UI maps these to `ui.md` §5.2 without try/catch. A 2xx body that fails its schema throws `ContractError`: that's a bug, so error reporting should see it. Schemas are anything with Zod's `safeParse`, so the client doesn't import Zod itself.

**Why not SvelteKit form actions or remote functions?** They're more ergonomic, but they bind the client to SvelteKit's server runtime, so the static split would need a rewrite. The HTTP API costs a little boilerplate and keeps the split cheap.

### 3.4 Identity: OIDC via a server-side BFF

**Pattern:** the SvelteKit server is a confidential OIDC client (Authorization Code + PKCE). After the callback it validates the ID token, upserts the `User`, and creates a server-side session (a Mongo `sessions` collection with a TTL index). The browser holds only an opaque `__Host-` cookie (`HttpOnly; Secure; SameSite=Lax`). No tokens reach the browser.

The library is **`openid-client`** (framework-agnostic, certified), used inside `backend/infrastructure/auth`. Auth.js/SvelteKitAuth was considered and rejected because it couples sessions to SvelteKit (NFR-15).

| Provider | Free tier (Oct 2026, verify) | Notes |
|---|---|---|
| **Auth0** ✅ | ~25k MAU, social + database connections, Universal Login | Mature standards-compliant OIDC, named in the requirements. Big price jump if ever outgrown, which is irrelevant at 2–5 users. |
| Logto Cloud | Reports conflict: 5k or 50k MAU. Self-hostable OSS. | Good OIDC, nice UI. Self-host is a fallback path. |
| Zitadel Cloud | Free tier exists, not verified | Strong OIDC, OSS, self-hostable. |
| Clerk | ~50k MRU | SDK-centric, so we'd adopt their components and session model rather than plain OIDC. Poor fit for a portable backend. |
| WorkOS AuthKit | ~1M MAU | Generous, OIDC-capable, but tuned for B2B. |
| Keycloak / Authentik (self-host) | Free, no caps | One more stateful service to run and patch. Only sensible on the self-host path. |
| Google sign-in directly | Free | Simplest of all, but every caregiver needs a Google account (likely, on Android) and it locks out other login methods. Keep it as a connection *inside* Auth0 instead. |

Auth0 is recommended with Google and email/password connections enabled. The design only depends on generic OIDC discovery, so changing provider is a config change plus a user-identity migration (users are keyed by `(issuer, subject)`).

**Tenants and region (S1).** Two Auth0 tenants: `toe-beans-dev` (tagged Development) for local work and `toe-beans` (tagged Production) for prod. Keeping them apart keeps localhost callback URLs and test users out of prod, and lets connection or branding changes be tried safely; a second free tenant costs nothing. A tenant's name and region can't be changed later. Setup steps are in `docs/runbooks/auth0.md`.

- **Region: EU.** Auth0 offers Australia, Canada, Europe, Japan, the UK and the USA; none is in Africa. Europe is the nearest to Johannesburg (~150–170 ms, against ~250 ms or more for the USA). Because the server is the OIDC client, Auth0 is contacted only during sign-in (the redirect, the code exchange and a cached discovery document and JWKS); every other request uses our own session, so the distance never affects normal use.
- **Data location.** This is the one exception to D13's "app and database in the same country": Auth0 holds each caregiver's email, name, avatar URL and (for email sign-in) password hash in the EU. POPIA §72 allows transfers to a country with comparable protection, which the EU's GDPR is. Toe Beans data (dogs, sessions, events) never goes to Auth0.
- **Prod custom domain from the first user.** Users are keyed by `(issuer, subject)`, and the issuer is the domain sign-in runs on, so moving from `toe-beans.eu.auth0.com` to a custom domain later would orphan every account unless migrated. The free plan includes one custom domain (a card must be on file for verification, with no charge). Prod therefore uses `auth.toebeans.co.za` (a DNS-only CNAME in Cloudflare; Auth0 manages the certificate) from the start. Users also see our domain on the sign-in page. The dev tenant keeps its default domain.

**Sign-in flow.** All routes are thin SvelteKit adapters over framework-neutral handlers in `backend/http`; `openid-client` sits behind an `IdentityProvider` port in `infrastructure/auth` (`beginSignIn`, `completeSignIn`, `signOutUrl`). Discovery is fetched on the first sign-in, not at startup (no cold-start cost, and boot doesn't depend on Auth0), then cached in memory.

1. `GET /auth/sign-in?returnTo=…` creates a **login transaction** (`state`, `nonce`, PKCE verifier, `returnTo`) in a Mongo `loginTransactions` collection with a 10-minute TTL, puts its random handle in a short-lived `HttpOnly` cookie, and redirects to the IdP. `returnTo` must be a same-origin path (`/` followed by a non-`/`, non-`\` character), otherwise `/`, so notification and invite deep links survive sign-in without an open redirect. An invite's `returnTo` holds its raw token, so the token sits in Mongo for up to the transaction's 10 minutes; that's the one exception to storing only hashes, and it's accepted because the person holds the same token and accepting still needs a session.
2. `GET /auth/callback` takes the transaction by its handle (single use: `findOneAndDelete`), lets `openid-client` exchange the code and validate the ID token (signature via JWKS, `iss`, `aud`, `exp`, `nonce`, PKCE), upserts the `User` by `(issuer, subject)` with the latest `email`, `email_verified` and `picture` (the display name follows the rule in §5.2), writing only when something changed, creates a session and redirects to `returnTo`. Any failure (unknown or expired handle, `error=access_denied`, a validation failure) lands on the sign-in page with a generic retry message; the reason is logged without token or code values. The callback is rate-limited (§7).
3. `POST /auth/sign-out` deletes the session, clears the cookie and redirects to the IdP's end-session endpoint (`client_id` and `post_logout_redirect_uri`, no ID token kept), so the next sign-in can pick another account. It is a POST so another site can't sign a user out.

No access or refresh tokens are kept: the ID token is used once at the callback, and the app calls no IdP APIs.

**Sessions.** The cookie holds a random 256-bit token; Mongo stores only its SHA-256 as the session `_id` (as with invitation tokens), with `userId`, `createdAt`, `expiresAt` and `absoluteExpiresAt`, and a TTL index on `expiresAt`. Lifetimes suit a family PWA where signing in again is friction and notification taps must land signed in: **90 days sliding, 400 days absolute** (Chrome's cap on cookie lifetime). The sliding expiry is pushed forward at most once a day, so reads don't write on every request. A new session is created at every sign-in (no fixation), and a session whose user is soft-deleted is refused. Nothing about the device (IP, full user agent) is stored.

**Cookies.** The session cookie is `__Host-tb_session` (`HttpOnly; Secure; SameSite=Lax; Path=/`), and the transaction cookie `__Host-tb_signin` with `Max-Age` 600. `Secure` cookies aren't stored over plain `http`, except on `localhost`, so when the public origin is `http` (`pnpm dev --host` from a phone on the LAN) the names drop the `__Host-` prefix and `Secure`. Prod refuses an `http` origin.

**Request handling.** `hooks.server.ts` resolves the cookie to a `Viewer` through the backend, never by reading Mongo itself: an `AuthContext` (`userId`), and a `MemberContext` (`userId`, `householdId`, `role`) once the person has a household. The user and the membership are read in parallel, so the session costs two sequential round trips, not three (§8.4). Signed-in pages without a household redirect to `/onboarding`, and household API routes answer 404. `GET /api/v1/invitations/{token}` is the one API route that works signed out, so the join page can say what the invitation is for (`ui.md` J2); the token is what allows it, and a dead invitation doesn't name its household. Unauthenticated page requests redirect to `/sign-in?returnTo=…`; unauthenticated `/api` requests get a `toe-beans/unauthenticated` 401. Every non-GET request must carry an `Origin` equal to the public origin, or, with no `Origin`, `Sec-Fetch-Site: same-origin`; anything else gets a 403 before any route runs. This is the app's only CSRF check: Kit's own is turned off (`csrf.trustedOrigins: ['*']`), because it compares with the request URL's origin, which adapter-node 6 assumes is `https` and which behind the Cloudflare Worker is `run.app` (§8.4), and it only covers form content types. Page loads check the viewer in the `(app)` layout's server load, so client-side navigation is redirected properly too.

**Configuration.** `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` (Secret Manager in prod) and `PUBLIC_BASE_URL`, from which the callback and post-logout URLs derive. The client authenticates with a client secret (Auth0's private-key JWT needs a paid plan).

**Testing without Auth0.** End-to-end tests and offline development use a **mock OIDC provider** in Docker (`ghcr.io/navikt/mock-oauth2-server`, pinned by digest) as a compose service and a CI service container. With interactive login on, it shows a form where a test types the subject and claims, so Playwright runs the real flow through `openid-client` against a real issuer. This avoids a test-only "sign me in" route, which would be a backdoor if it were ever enabled in prod. The dev tenant is for checking the real Auth0 setup by hand (Google, email, branding).

**One user per person (Q10).** Auth0 treats Google and email/password sign-ins with the same email as two users with different subjects. The app links them itself rather than in an Auth0 Action, which would need a Management API client and its secret and would tie linking to Auth0: a `User` holds a list of identities (`issuer`, `subject`) and a unique, normalised, verified email. At the callback the user is found by identity; failing that, a user with the same email gets the new identity added; failing that, a user is created.

- **Only verified emails link.** Otherwise someone could register email/password with another person's address and reach their account before that address was ever verified. So a sign-in whose ID token lacks `email_verified=true` is refused with no user or session made, and the sign-in page asks the person to verify and try again (with "Use a different account", which sends `prompt=login`). Google emails arrive verified; Auth0 sends email/password users a verification link.
- If the provider's email for a known identity changes to one another user already has, the old email is kept and a warning logged, rather than merging two users silently.
- Linking runs in a `UnitOfWork`. Unique indexes on `identities.key` (`issuer` + space + `subject`, one string so the multikey unique index works across users) and on `email` back it up against a race between two first sign-ins.

**Rules:**
- Email invitations require the IdP's `email_verified=true` and a matching email (FR-01).
- CSRF protection comes from `SameSite=Lax` cookies plus an `Origin` check in `hooks.server.ts` for all non-GET `/api` requests.
- **After extraction:** the standalone API keeps cookie sessions if it's same-site (e.g. `api.` subdomain), or switches to bearer access tokens validated against JWKS. The `AuthContext` port hides which one is in use.

### 3.5 Database: MongoDB

| Option | For | Against |
|---|---|---|
| **MongoDB (Atlas free)** ✅ | Document model fits the aggregates. The free cluster is a 3-node replica set, so **multi-document transactions work**. Can run in GCP regions next to Cloud Run. Trivial to self-host in Docker. | Free cluster: ~512 MB, **no backups**, shared resources, may be paused if idle. |
| PostgreSQL + JSONB (Neon / Supabase free) | Relational integrity for memberships/invites, JSONB for flexible bits, excellent tooling. | Requirements specify a *document database* (NFR-05). Neon scales to zero (cold queries). Supabase pauses idle free projects. |
| Firestore | Generous free quota, serverless, same GCP project as Cloud Run. | Proprietary query model, hard to self-host, so it fails the fallback path. |
| Self-hosted MongoDB | Full control, backups via volume snapshots. | Only on the self-host path. |

**Usage rules:**
- Official `mongodb` driver. **No Mongoose**: domain entities are plain TypeScript classes, and repository mappers convert to and from persistence documents. This keeps the domain free of persistence concerns.
- Every document has `_id` (UUIDv7 string: sortable, generated in the domain), `householdId` (except `users`, and `households`, which are the boundary itself), `version`, `createdAt`, `updatedAt` and `schemaVersion`.
- Optimistic concurrency: `findOneAndUpdate({_id, householdId, version}, {$set..., $inc:{version:1}})`. Zero matches means a conflict: a follow-up count tells `stale-version` (the document exists) from `not-found`. Repositories build on `HouseholdCollection` (`backend/infrastructure/persistence`), which does this and fills in the common fields. Setting a field to `undefined` in an update unsets it; the client sets `ignoreUndefined`, so absent optional fields are never stored as `null`. A partial update leaves `schemaVersion` as it was.
- Migrations: a small runner (`backend/infrastructure/persistence/migrations`) records applied migrations in a `_migrations` collection and runs on startup, before the server listens. It's forward-only. Concurrent starts are serialised by a lease in `_locks` (5 min, so a crashed instance's lock expires); the others wait for it, then find nothing left to do. Startup only takes the lock when something is pending. Migrations don't run in a transaction and are recorded after they finish, so each must be safe to repeat. Documents also carry `schemaVersion` so mappers can read old shapes lazily.
- Size check: 2 dogs × ~10 sessions/day × 5 years ≈ 36k small documents, which fits easily in 512 MB. Photos are **not** stored in Mongo.

### 3.6 Photo storage

| Option | For | Against |
|---|---|---|
| **Cloudflare R2** ✅ | ~10 GB free, zero egress, S3-compatible API. | One more vendor account. |
| Backblaze B2 | ~10 GB free, S3-compatible. | Egress rules more complex. |
| Google Cloud Storage | Same project as Cloud Run. | Free tier only in US regions. Egress billed. |
| GridFS in Atlas | No extra vendor. | Eats into the 512 MB. |
| Local volume, or a self-hosted S3-compatible store | Self-host path. MinIO's community edition stopped publishing Docker images in October 2025 and its repo is archived, so it is no longer a candidate. The local S3-compatible service (SeaweedFS, Garage or RustFS) is chosen in S3.2. | No durability on serverless hosts. |

Code depends on a `PhotoStore` port (`put`, `getStream`, `delete`). The adapters are S3-compatible (R2, B2, a local S3-compatible store) and local-filesystem (self-host/dev).

**Upload pipeline:**
1. The client downscales the image before upload, so Android camera photos stay small on mobile data.
2. The server validates type and size (≤ 10 MB in).
3. `sharp` re-encodes to WebP, which **strips EXIF and GPS location**. It produces two sizes: 1024 px and 256 px thumbnails.
4. Files are stored under random keys (`households/{hid}/dogs/{dogId}/{photoId}-{size}.webp`).

**Serving:** `GET /api/v1/dogs/{id}/photo?size=thumb` authorizes household membership and then streams the bytes with `Cache-Control: private, max-age=86400` and an ETag (NFR-02, scenario 9). Presigned redirects were considered. Streaming is simpler and keeps object URLs out of the client entirely. Revisit only if bandwidth becomes an issue.

### 3.7 Email (invitations)

Email invitations need a transactional sender. The options are Resend (free tier, ~100/day), Brevo (free, ~300/day) and Auth0's built-in email (only for auth flows, so it doesn't fit). They sit behind an `EmailSender` port with a console adapter for dev. Volume is a handful of emails ever. Shareable invite links work without any email provider, so links ship first (see backlog).

**Built in S2.3.** The Resend adapter is one `fetch` to its HTTP API with a 10-second timeout, so it adds no dependency. Messages are plain text: household and display names go in as typed, and with no HTML there's nothing to escape. 

**Choosing a sender.** `EMAIL_SENDER` picks the adapter, and `createEmailSender` (`infrastructure/email`) builds it, so use cases only know the port. `console` (the local default) prints the message. `mailpit` posts to a local Mailpit's HTTP API (`MAILPIT_URL`), which shows it in an inbox and relays nothing, so workflows can be followed through a real message without any risk of mailing someone. `resend` sends real email. Having a key never selects Resend: a dev machine holds one for real tests, and only `EMAIL_SENDER=resend` uses it. Prod defaults to Resend and refuses the others, because the console sender would put invite links in the logs, and it needs `RESEND_API_KEY` to start. E2e pins `console`, whatever `.env` says.

The email is sent after the invitation is stored, outside any transaction; if it can't be sent the invitation is removed and the person sees a `toe-beans/unavailable` 503 suggesting a link instead. A household can send 10 an hour, so it can't be used to mail people at will.

### 3.8 Exercise content pipeline

The starter library is code-owned content in `content/exercises/`, one YAML file per exercise. It's validated against a schema at build time.

```
research (articles, videos) ──► source notes ──► AI-assisted draft/edit ──► human review ──► merge
   content/sources/*.md          per exercise       PR against content/          reviewedBy/At set
```

- **Original wording, attributed.** AI editing is used to synthesise and rewrite, not to copy. Exercises must not reproduce articles or video transcripts verbatim. Each exercise lists its `sources[]` (shown in the app as "Further reading").
- **Safety gate (NFR-14).** The build fails if an exercise lacks `ifStruggling`, `reviewedBy` or `reviewedAt`. A lint step flags punitive or aversive vocabulary (e.g. "correct", "punish", "alpha", "dominance", "leash pop") for the human reviewer to check.
- **Versioning.** Any substantive edit bumps `contentVersion`. Session logs keep the version they were practised against.
- **Coverage check.** The build verifies that every one of the 9 skill areas in FR-03 has at least one exercise.

---

## 4. System structure

### 4.1 Repository layout (pnpm workspace)

```
toe-beans/
├─ apps/
│  └─ web/                      SvelteKit app: UI + thin /api/v1 adapter + service worker
│     ├─ src/routes/(app)/…     pages
│     ├─ src/routes/api/v1/…    +server.ts adapters → backend http handlers
│     ├─ src/lib/api-client/    typed fetch client built on @toe-beans/contracts
│     ├─ src/hooks.server.ts    composition root wiring, session → AuthContext, origin check
│     └─ src/service-worker.ts  static asset caching, push + notificationclick handlers
├─ packages/
│  ├─ contracts/                Zod request/response DTOs, problem codes, shared enums
│  └─ backend/                  framework-independent backend (no SvelteKit imports)
│     ├─ src/domain/            entities, value objects, domain services, domain events
│     ├─ src/application/       use cases (commands/queries), ports (interfaces), AuthContext
│     ├─ src/infrastructure/    Mongo repositories, R2/S3 store, OIDC, web-push, email, clock
│     ├─ src/http/              framework-neutral handlers: (ctx, validatedInput) → Result
│     ├─ src/worker/            notification tick/dispatcher
│     └─ src/composition.ts     createBackend(config) → { http, worker, auth }
├─ content/exercises/           curated exercise library (YAML/Markdown, versioned)
├─ docker/                      Dockerfile, compose files (dev, self-host)
└─ docs/
```

### 4.2 Layer rules

```
 apps/web (SvelteKit adapter) ──► backend/http ──► backend/application ──► backend/domain
                                                         ▲
                                   backend/infrastructure ┘ (implements application ports)
```

- **domain** depends on nothing: no driver types, no Zod, no Node built-ins except `crypto` for IDs.
- **application** depends on domain and declares ports (`DogRepository`, `PhotoStore`, `PushSender`, `Clock`, `UnitOfWork`, `EmailSender`). Use cases receive an `AuthContext {userId, householdId, role}` explicitly. They never read a request.
- **infrastructure** implements the ports. It's the only layer that imports `mongodb`, `@aws-sdk/client-s3`, `web-push` or `openid-client`.
- **http** maps validated DTOs ↔ use-case inputs and Results ↔ status codes. It can be mounted by SvelteKit now and Fastify later.
- **apps/web** may import only `@toe-beans/backend` (the `composition` and `http` exports) and `@toe-beans/contracts`. Client-side code may import only `contracts`.
- Enforced in CI by ESLint's built-in `no-restricted-imports`, one rule set per layer (`eslint.config.js`). Chosen over `eslint-plugin-boundaries` in S0.1: each layer's rule is a couple of regexes over the import string, which covers relative paths, workspace packages and libraries alike (e.g. drivers only in infrastructure, no SvelteKit anywhere in the backend), with no plugin element model to configure.

### 4.3 Extraction path (later, if needed)

1. Add `apps/api` (Fastify) that calls the same `createBackend()` and mounts `backend/http` handlers. Each route is about 10 lines of glue.
2. Switch `apps/web` to `adapter-static` with `ssr = false` and point the API client at `PUBLIC_API_BASE_URL`.
3. Move session cookies to a shared parent domain, or switch to bearer tokens (§3.4).
4. Run the worker as its own process (`node dist/worker.js`). It's already separate code.

### 4.4 Household isolation by construction

- Repositories for household-owned data take `householdId` as a **required argument on every method** and always include it in the filter. No method looks up by `_id` alone.
- `householdId` comes only from `AuthContext`, which is resolved from the session's membership, never from the request body or URL.
- Cross-household access returns **404, not 403**, so IDs don't leak (scenario 9).
- A shared repository test suite runs against every repository: "data written for household A is invisible via household B". It's `householdIsolationSuite` (`backend/testing`): each repository passes a small adapter (create, read, and list/update/remove where it has them), and the suite checks that B can't read, list, update or remove A's item even with its ID and current version. Removing the household filter from `HouseholdCollection` fails all four checks.

---

## 5. Domain model

### 5.1 Bounded contexts

| Context | Aggregates | Requirements |
|---|---|---|
| **Identity & Household** | `User`, `Household` (with `Membership`s), `Invitation` | FR-01 |
| **Dogs** | `Dog` (with `ProfilePhoto` reference) | FR-02 |
| **Training** | `Exercise` (read-only library), `Cue`, `TrainingPlan` (series), `PlannedSession`, `SessionLog` | FR-03, 04, 05, 07 |
| **Journal** | `BehaviourEvent` | FR-08 |
| **Care** | `CareTask` | FR-10 |
| **Notifications** | `PushSubscription`, `ReminderPreference`, `NotificationJob` | FR-12 |
| *Read models* | Today, History timeline | FR-06, FR-09 (queries across contexts, no own aggregate) |

The contexts are modules in one package, not services. Contexts reference each other by ID only.

### 5.2 Aggregates (P0)

Common fields (`_id`, `householdId`, `version`, timestamps, `schemaVersion`) are omitted below.

**User** — `identities[]: {issuer, subject, linkedAt}` (each pair unique across users), `email` (verified by the provider, normalised, unique), `displayName`, `displayNameSource` (`provider | email | user`), `avatarUrl?`, `defaultHouseholdId?`, `deletedAt?`
- Several sign-in methods with the same verified email are one user (§3.4, Q10).
- The display name is what the household sees, so the app owns it. A new user starts with the provider's name, or the email's local part when there isn't one (Auth0 email/password sign-ups have none). A sign-in replaces it only to swap that fallback for a provider's real name. The person changes it on More (`PATCH /api/v1/me`, `ui.md` §4.7), after which no sign-in touches it. Before S1.7 every sign-in copied the provider's name, so it changed with each sign-in method. Schema 1 documents have no `displayNameSource`: the reader takes `email` when the name is the email's local part, `provider` otherwise, which is how schema 1 chose it, so no migration is needed.

**Household** — `name`, `timeZone` (IANA, used for all scheduling), `memberships[]: {userId, role: owner|caregiver, joinedAt}`
- Invariant: at least one owner while it has members.
- One household per person (D16). The memberships array could hold more, but the unique index on `memberships.userId` refuses it. The index is partial, covering households with members: a unique multikey index treats an empty array as a null key, so a second deactivated household would collide with the first.
- `deactivated?: {at, by}` is set when the last person leaves, emptying `memberships` (D18). That is the one state without an owner, and nothing inside a household can reach it, as nobody has a `MemberContext` for it.
- `DELETE /api/v1/household/members/:id` with If-Match is leaving when the ID is the caller's own, and removing a caregiver otherwise (owners only). `PATCH` on the same route changes a role on D19's terms. `GET` and `POST /api/v1/household/former` read and bring back the deactivated household; they take no ID, so they only reach the one recorded against the caller.
- The household's own document is the isolation boundary, so it has no `householdId` and doesn't run `householdIsolationSuite`: its ID only ever comes from the `MemberContext` (§4.4).

**Invitation** — `kind: email|link`, `email?`, `tokenHash` (SHA-256; the raw token is shown once), `expiresAt`, `maxUses` (email = 1), `useCount`, `revokedAt?`, `createdBy`
- Accepting requires authentication, a valid unexpired unrevoked token, and for email invites `email_verified` with a matching email. The household comes from the invitation and is never client-supplied.
- Terms are D17: `maxUses` 1 for both kinds, 7 days. A use is taken and the member added in one transaction, with an atomic `useCount < maxUses` claim, so a failed join doesn't spend the invitation and two people can't share its last use.
- `findByTokenHash` is the only lookup without a household: holding the token is the authority. Everything else is scoped through `HouseholdCollection`.
- A TTL index clears an invitation 30 days after `expiresAt` (NFR-02: the invitee's address isn't kept for long). Until then an expired link says so; afterwards it says it isn't valid.

**Dog** — `name`, `birthDate?` | `estimatedBirthDate?` (`{date, precision: month|year}`), `adoptionDate?`, `notes?`, `photo: {photoId, updatedAt}` (required), `archivedAt?`
- Archiving rather than deleting keeps history intact.

**Exercise** (library, content-owned) — `id` (stable slug, e.g. `recall-basic`), `contentVersion`, `title`, `skillArea` (name-recognition | recall | toileting | greetings | settling | doorbell | barking | loose-leash | cats), `goal`, `setup`, `steps[]`, `suggestedDurationMin`, `successCriteria`, `ifStruggling`, `safetyNotes?`, `sources[]: {title, url, kind: article|video}`, `reviewedBy`, `reviewedAt` (see §3.8)
- Loaded from `content/exercises/` at startup into an in-memory catalogue (disposable cache, allowed by NFR-08). Not stored in Mongo.
- Logs record `exerciseId` + `contentVersion`.

**Cue** — `label` (spoken word), `meaning`, `handSignal?`, `rewardConvention?`, `notes?`
- Household-wide, editable by any caregiver (FR-04).

**TrainingPlan** (recurring series) — `dogId`, `exerciseId`, `recurrence` (subset of RFC 5545: `FREQ=DAILY|WEEKLY; BYDAY; INTERVAL; UNTIL|COUNT`), `timeOfDay`, `startDate`, `endedAt?`

**PlannedSession** — `dogId`, `exerciseId`, `scheduledAt` (UTC instant derived from the household time zone), `planId?`, `occurrenceKey?`, `status: planned|completed|skipped|cancelled`, `sessionLogId?`
- Recurring plans **materialise occurrences over a rolling horizon** (e.g. 21 days, extended by the tick). Each occurrence can then be edited, skipped or rescheduled individually and get its own reminders.
- Unique index on `(planId, occurrenceKey)` makes materialisation idempotent.
- Skipped and cancelled sessions never count as completed (FR-05).

**SessionLog** — `dogId`, `exerciseId`, `exerciseContentVersion`, `plannedSessionId?`, `caregiverId`, `practisedAt`, `outcome: successful|partial|not_yet|not_assessed` (default `not_assessed`), `durationMin?`, `emotionalState?: relaxed|uncertain|stressed`, `environment?: home|garden|public|other` + `environmentNote?`, `notes?`, `deletedAt?`
- Completion is the existence of the log. Outcome is a separate field (FR-07, §6 of requirements).
- Logging against a `PlannedSession` sets that session to `completed` in the same transaction.

**BehaviourEvent** — `dogId`, `occurredAt`, `category` (cat-interaction | barking | fear | toileting-accident | visitor | other), `trigger?`, `response?`, `notes?`, `recordedBy`, `deletedAt?`

**CareTask** — `dogId`, `category` (vaccination | parasite-prevention | vet-appointment | puppy-school | sterilisation-consult | other), `title`, `dueAt` (date or date-time), `status: upcoming|completed|cancelled`, `completedAt?`, `notes?`, `history[]` (status changes, append-only)
- Updating never erases history (FR-10). No veterinary dates are assumed (NFR-14).

**PushSubscription** — `userId`, `endpoint` (unique), `keys`, `deviceLabel`, `userAgent`, `createdAt`, `lastSuccessAt?`, `failureCount`, `disabledAt?`
- The endpoint is treated as a secret (NFR-02). It's never logged in full.

**ReminderPreference** (per member) — `trainingLeadMin` (**default 0**: remind at the session time, since reminders are a general nudge and not a strict schedule), `careLeadDays` (default 0) / `careTimeOfDay` (default 08:00, used when a care task has a date but no time), `enabled`, `quietHours?` (P1)

**NotificationJob** — see §6.

### 5.3 Deletion and soft delete

- Logs and events: soft delete (`deletedAt`) after UI confirmation, hidden from queries. Purged after 30 days, which gives undo and recovery.
- Personal data deletion route (NFR-02): deleting a user removes memberships, push subscriptions and sessions, and anonymises `caregiverId` references. Deleting a household removes all its documents and photo objects. Implemented as a use case with a test.

---

## 6. Notifications and scheduling

### 6.1 Model

```
NotificationJob {
  _id, householdId, userId, subscriptionId,
  subject: { type: 'plannedSession' | 'careTask', id },
  subjectVersion,               // version of the subject when the job was created
  dueAt,                        // UTC
  status: 'pending' | 'sending' | 'sent' | 'cancelled' | 'failed',
  attempts, lockedUntil?, lastError?, sentAt?,
  dedupeKey                     // unique: subject.type:subject.id:subjectVersion:subscriptionId
}
```

### 6.2 Lifecycle

1. **Plan.** Whenever a subject is created, rescheduled, completed, skipped or cancelled, the use case calls `ReminderPlanner.replan(subject)` **in the same Mongo transaction**. That cancels `pending` jobs for the subject and inserts new ones for each subscribed member device, using their `ReminderPreference`.
2. **Tick.** `worker.tick(now)`:
   1. Extend the recurring-plan horizon.
   2. Claim due jobs atomically with `findOneAndUpdate({status:'pending', dueAt ≤ now + interval (now for exact jobs)}, {status:'sending', lockedUntil: now+60s})`, so concurrent ticks never double-claim (§6.3 send-ahead).
   3. Re-load the subject and **skip if its version or status changed** (a second guard against stale reminders, scenario 5).
   4. Send via `web-push` (VAPID) with **`Urgency: high`** (reminders are time-sensitive and always show a notification, so Android doesn't demote them) and a **TTL** so stale notifications expire in the push service: **1 h** for training reminders, **12 h** for care reminders. A deep-sleeping phone can take over a minute to collect a push (§6.4), so TTLs must never be short. Add a `tag` so the OS replaces duplicates.
   5. Mark `sent`, or on failure `pending` with backoff (max 3 attempts), then `failed`. A `404/410` response from the push service disables the subscription.
   6. Recover `sending` jobs whose `lockedUntil` has passed.
3. **Click.** The service worker's `notificationclick` handler always calls `clients.openWindow('/{deep-link}')` (e.g. `/sessions/{id}`) from the payload. It never focuses an existing client: the Clients API can't tell a Chrome tab from the installed app's window, and in S-1.2 focusing opened the link in a browser tab. Android routes in-scope URLs to the installed app, and the manifest's `launch_handler: navigate-existing` reuses its window. Payloads carry minimal data: dog name, exercise title and link, no notes.

### 6.3 Triggering the tick (host-independent)

The tick is idempotent and safe to call concurrently, so it can run from any trigger:

| Trigger | When used |
|---|---|
| `POST /internal/tick` authenticated with an OIDC token from Cloud Scheduler (or a shared secret header) | Scale-to-zero hosts (Cloud Run, Render). Runs every 5 minutes (`TICK_INTERVAL_MINUTES`). |
| In-process `setInterval` loop (`WORKER_MODE=inline`) | Always-on hosts (self-host, Oracle VM, dev) |
| Separate worker process (`node worker.js`) | After extraction or at scale |

Measured in S-1.3 (Scheduler in `me-central1`, the nearest region offering it, calling Cloud Run in Johannesburg): 2,891 of 2,891 ticks over 48 h, no scheduler errors, lag from the scheduled minute p50 0.33 s, p95 1.00 s, max 9.15 s. Cloud Run replaced the instance twice during the run without a missed tick. Scheduler delivery isn't the limit, so the interval is a cost choice.

**Interval: 5 minutes, sending ahead (1.1).** Each tick sends every reminder due before the next tick, so a reminder goes out up to 5 minutes **early, never late**: the 1:00 tick sends a 1:03 reminder. That's 8,600 tick requests a month instead of 43k, about a fifth of the tick's Cloud Run cost, which the free tier covers either way (Q9). Times are picked in 5-minute steps and reminder offsets are multiples of 5, so in practice reminders land on time or a few minutes early. The phone adds up to ~1–2 minutes in deep sleep (§6.4), and the UI never promises exact times (NFR-16).
- The interval and the send-ahead window are configuration (`TICK_INTERVAL_MINUTES`, default 5), so going back to 1 minute is a deploy, not a code change. The send-ahead window equals the interval.
- **Exact jobs** are never sent early: the *Test reminders* push (`ui.md` J7) must arrive only after the phone has been locked a while, so it is sent by the first tick at or after its due time.
- **To confirm:** the spike runs at 1 minute until about 9 Nov 2026, then at 5 minutes for a week, comparing Cloud Run cost and how often a person (rather than a tick) starts a cold instance (`spikes/pwa`, `pnpm ticks --every=5`). If people hit cold starts noticeably more often, revisit the interval.

Agenda, Bree and BullMQ were considered. Agenda adds little over ~150 lines of our own code against the same collection. BullMQ needs Redis, one more free-tier dependency.

### 6.4 Delivery on Android (spike S-1.2 findings)

Tested on both acceptance phones with the spike harness in `spikes/pwa`, urgency `high`, phone locked. Raw logs are in `spikes/pwa/results/`.

| Phone, Chrome battery setting | Short delays (≤ 3 min) | Long idle (30 min – 2 h, still, unplugged) |
|---|---|---|
| Galaxy S23 FE, default (and *Never sleeping apps* alone) | 5 of 9. Every miss was at 105–120 s locked. Misses were lost, or arrived much later (one 90 min late, when the next push woke Chrome). | 0 of 1 at 30 min (the 90-min-late one) |
| Galaxy S23 FE, **Unrestricted** | 4 of 4, 2–4 s late | 4 of 4, 2–74 s late |
| Redmi Note 12 Pro, default | 2 of 3 (missed one at 5 min) | 2 of 2 (30 min, 2 h); the phone was in use around the 2 h one, so not a clean idle test |
| Redmi Note 12 Pro, **Battery saver: No restrictions** | 2 of 2, 4–30 s late | 1 of 1 at 45 min, 5 s late |

What this shows:

- **The push service is not the problem.** FCM accepted every send (`201`). Losses happen on the phone, when the manufacturer's battery management freezes Chrome so it can't wake the service worker. Urgency `high` gets the message to the phone but can't unfreeze Chrome.
- **The setting that matters is on Chrome, not on Toe Beans.** The installed app is a WebAPK shell, and pushes are received and handled inside Chrome. Samsung: *Apps → Chrome → Battery → Unrestricted* (this also takes Chrome off the sleeping lists). Xiaomi: *Apps → Manage apps → Chrome → Battery saver → No restrictions* (a per-app policy that is always active, despite the name). Xiaomi's *Autostart* isn't offered for Chrome on the Redmi.
- **With those settings, nothing was dropped**, but deep sleep adds up to ~75 s.
- **An instant test notification proves nothing.** Every phone delivers while awake; failures start a minute or two after locking. A meaningful self-test asks the user to lock the phone and waits about 3 minutes.
- Samples are small (13 sends on the S23 FE with the fix, 3 on the Redmi). Recheck during S12 and early household use.

Consequences for the design: the reminders setup includes a "make reminders reliable" step with per-manufacturer instructions and a delayed test (`ui.md` J7), Today remains the source of truth for what's due, and TTLs are generous (§6.2). If reliability with these settings proves poor in real use, see R5.

---

## 7. Cross-cutting concerns

- **Validation:** Zod at the HTTP boundary (shape). The domain enforces invariants itself (meaning). Both return typed errors that map to problem+json.
- **Errors:** use cases return `Result<T, AppError>`; anything thrown is a bug and becomes `toe-beans/internal` 500 with no detail. Mapping (`backend/http/problem.ts`): `validation` 400 (with field `errors`), `unauthenticated` 401, `forbidden` 403, `not-found` 404 (also for another household's data, §4.4), `conflict` 409, `stale-version` 412, `precondition-required` 428. `rate-limited` 429, `unavailable` 503 (a dependency such as the email provider failed, and trying again may work). A 409 and a 412 share the `toe-beans/conflict` type, since the client handles both by reloading before it retries (`ui.md` §5.2). A refused invitation is a plain 409 too: the join page reloads the preview, which says why.
- **Time:** all instants are stored in UTC. Recurrence and "today" are computed in `Household.timeZone` using `Temporal` (polyfill until native) or `date-fns-tz`. A `Clock` port makes tests deterministic.
- **IDs:** UUIDv7 generated in the domain, so no round trip is needed and they sort by time. A 12-bit counter keeps them strictly increasing within a process, even within one millisecond or if the clock steps back (RFC 9562 §6.2 method 1). The generator reads time through `Clock`, so tests are deterministic.
- **Transactions:** a `UnitOfWork` port wraps a Mongo session. It's used for log + session status, subject + reminder replan, and invitation accept + membership. `run(work)` commits when `work` returns an ok `Result` and rolls back on an error result or a throw. The session travels in `AsyncLocalStorage`, so repository ports don't take a transaction parameter, and a nested `run` joins the outer transaction. The driver retries `work` on transient errors, so it must not send pushes or emails; those happen after `run` returns.
- **Configuration:** env vars only, validated at startup with Zod. The process fails fast on missing config, naming each bad variable but never its value. The schema lives in the backend (`loadConfig`), not in SvelteKit's `src/env.ts`, so a Fastify host or a separate worker process reuses it (NFR-15). Secrets come from the platform secret store (Cloud Run secrets / Docker secrets) and never sit in the image or the repo. Locally, the dev server, the e2e run, `pnpm start` and compose read an optional, gitignored `.env` at the repo root; shell variables win over it. Its template, `.env.example`, is committed and public (D15), so it holds sample values only, never secrets. The image never contains a `.env` (`.dockerignore`).
- **Rate limiting:** in memory and per instance, which is acceptable at this scale: a `RateLimiter` port with a token bucket per key (at most 10,000 keys, so a flood of addresses can't grow memory). Looking at and accepting invitations share `INVITE_RATE_LIMIT` per client address per 10 minutes (default 30); the token's 256 bits are the real protection, so this only stops hammering. Uploads get their own limiter in their slice. Sign-in and the callback share one budget per client address, `AUTH_RATE_LIMIT` steps per 10 minutes (default 30, so 15 attempts; e2e raises it, since every test signs in from localhost). It's checked before the pending sign-in is written or taken, so a refused step costs no database write and no token request to Auth0, whose own limits are per tenant and would otherwise lock everyone out. Over the limit the person lands on the sign-in page with a wait-and-retry message. The address is never logged (NFR-02).
- **Client address (NFR-01, NFR-02):** handlers take it from the host, `getClientAddress()` in SvelteKit, which on adapter-node is the TCP peer unless `ADDRESS_HEADER` and `XFF_DEPTH` say otherwise. On Cloud Run the peer is Google's front end, so without them every request shares one key and the limit is global: a nuisance, not a hole. Behind the Worker, the entry Google's front end appends to `X-Forwarded-For` is Cloudflare's egress address, so the Worker has to forward the client's address (Cloudflare's `CF-Connecting-IP`) itself; S14.1 sets that up and checks which address the app sees. Any header the Worker sets can also be sent by a client calling `run.app` directly (§10), so until the app requires the Worker's header secret, a determined attacker can rotate the key. The limit then only slows casual abuse; the single-use, PKCE-bound login transaction is what stops a forged callback.
- **Security headers:** a CSP with `script-src 'self'` (SvelteKit CSP config with nonces), HSTS, `Referrer-Policy: same-origin`, `Permissions-Policy` limited to notifications and camera.
- **PWA caching:** the service worker precaches only build assets and two fallback pages: *You're offline* when a page load gets no response, and *Can't reach Toe Beans* when the platform answers 502, 503 or 504 (a gateway error page would otherwise bypass the offline fallback; checked in S-1.3 behind a proxy returning each status, while a 500 from the app passes through). **API responses and photos are never cached by the service worker** (NFR-04: no stale personal data, no false "saved").

---

## 8. Deployment and hosting

### 8.1 Container

- One multi-stage Dockerfile (Node 24 slim or distroless). Output: the `adapter-node` server, which also serves `/internal/tick` and optionally runs the inline worker.
- Runs as a non-root user and listens on `PORT`. The public origin is runtime config (`PUBLIC_BASE_URL`, §3.4, §8.4), so the same image runs locally and in prod. `GET /healthz` is the liveness check (process up). `GET /readyz` is the readiness check (Mongo ping, config loaded).
- Built from the repo root: `docker build -f docker/Dockerfile .`. Two stages on `node:24.21.0-slim`: the build stage installs the workspace (pnpm via corepack, store cached by BuildKit) and runs `pnpm build`, then `pnpm deploy --prod` collects `apps/web`'s runtime dependencies. The runtime stage holds only `package.json`, that `node_modules` and `build/` (~13 MB over the base image), runs as the image's `node` user with root-owned files, and listens on `PORT` (default 8080, as Cloud Run sets). adapter-node handles SIGTERM, and the backend then closes Mongo and flushes Sentry (0.4 s in compose).
- `apps/web`'s `dependencies` are exactly what the server bundle imports at runtime; everything bundled, the workspace packages included, is a devDependency, so the deploy step stays small. Check with a grep of `build/` for bare imports when adding one.
- The image ships `apps/web`'s production dependencies next to the build, not just the bundle: SvelteKit deliberately leaves `@opentelemetry/api` (pulled in by `@sentry/node`) outside the bundle so instrumentation and the runtime share one copy, so `apps/web` depends on it directly (S0.4).
- The image is built in CI and pushed to GHCR (free for public images; private images use Artifact Registry's free 0.5 GB on the Cloud Run path).

### 8.2 Hosting options

Free always-on compute has largely disappeared. This matters because of NFR-16.

| Option | Cost reality (Oct 2026, verify) | Push scheduling | Verdict |
|---|---|---|---|
| **A. Google Cloud Run + Cloud Scheduler** | Free tier: ~2M requests, 180k vCPU-s, 360k GiB-s per month. Cloud Scheduler: 3 free jobs. **Needs a billing account (card)**, so set a low budget alert (e.g. $1). | Scheduler hits `/internal/tick` every 5 minutes: ~8.6k requests/month, well within the free tier. | ✅ **Chosen (D9, S-1.3).** Cold start 0.62 s server-side, ticks reliable over 48 h, $0 billed. Keep NFR-09 loading feedback for slower cold loads on the phone. |
| B. Oracle Cloud Always Free VM | Ampere A1 allowance reportedly cut to 2 OCPU / 12 GB in June 2026. Idle instances can be reclaimed. Capacity is often unavailable. | Inline worker, always on. Could also run Mongo and photo storage locally. | Strong runner-up for an "always-on and free" setup, but it carries account and reclamation risk and is a VM we have to patch. |
| C. Render free web service | 750 h/month, sleeps after 15 min idle, ~30–60 s cold start. | External cron (cron-job.org / GitHub Actions) pinging tick every minute. Effectively keeps it awake, which is against the spirit of the tier. | Fallback. Cold starts hurt UX if it does sleep. |
| D. Koyeb / Fly.io / Railway | Free compute removed or now needs a card plus a trial (reports conflict). | — | Not recommended. |
| E. **Self-host: Docker behind IIS** | Hardware and electricity already paid for. | Inline worker. Mongo + a photo volume (or a local S3-compatible store) in compose. | ✅ **Agreed fallback** (NFR-07). |

**Recommended topology (option A):**

```
Android Chrome PWA ──HTTPS (toebeans.co.za)──► Cloud Run (africa-south1, Johannesburg, min-instances 0)
                                 │  ├─► MongoDB Atlas free (AWS af-south-1, Cape Town; TLS, see §8.4)
                                 │  ├─► Cloudflare R2 (photos)
                                 │  ├─► Auth0 (OIDC)
                                 │  ├─► FCM via Web Push (VAPID)
                                 │  └─► Resend (invite emails)
Cloud Scheduler ──every 1 min──► POST /internal/tick (OIDC-authenticated)
GitHub Actions ──nightly──► mongodump → encrypted → R2 backups bucket

```

**Self-host topology (option E):** IIS with URL Rewrite + ARR reverse-proxies `https://toebeans.co.za` to `localhost:3000`. TLS comes from win-acme (Let's Encrypt). `docker compose` runs `app` (with `WORKER_MODE=inline`), `mongo` (a single-node replica set so transactions work) with a named volume, and a bind-mounted photo directory (or a local S3-compatible store). A scheduled `mongodump` writes to an external drive or R2. ARR must pass `X-Forwarded-Proto/Host`; set SvelteKit `ORIGIN`, `PROTOCOL_HEADER` and `HOST_HEADER` accordingly. Web Push needs only outbound HTTPS.

The S-1 spikes chose A: it met the cold-start, tick-reliability and cost targets (S-1.3) and the latency budget from both phones (S-1.4, S-1.4a). E stays maintained as the fallback (R1); its end-to-end check (S-1.5) is parked while A stays free.

### 8.3 Environments

`local` (docker compose: Mongo, optionally the app image; sign-in through the Auth0 dev tenant, or the mock OIDC provider offline and in e2e, §3.4), `prod` (Auth0 prod tenant). A separate staging environment isn't justified at this scale. Preview deploys are optional later.

### 8.4 Region, latency and domain

**Co-location rule.** The app and the database must be as close as possible. A request makes several database round trips but only one user round trip. So "user → distant app + DB" is fast, while "user → nearby app → distant DB" is slow on every query.

**S-1.0 finding (28 Oct 2026):** Atlas's free tier offers a South African region only on **AWS Cape Town (`af-south-1`)**. GCP Johannesburg isn't offered for free clusters.

| Priority | Topology | Expected user RTT |
|---|---|---|
| 1 ✅ **chosen, confirmed by S-1.4** | Cloud Run `africa-south1` (Johannesburg) + Atlas free on AWS `af-south-1` (Cape Town). Cross-provider, over the public internet with TLS. | User → app ~10–30 ms. App → DB **21–32 ms per round trip** (measured, S-1.4). |
| 1b fallback | Everything on AWS in Cape Town: Lambda running the **same container image** via AWS Lambda Web Adapter, EventBridge Scheduler for the tick, a Lambda function URL behind CloudFront for the custom domain | App → DB ~1–2 ms. But it reworks D9 (different platform, IAM, deploy pipeline). Only considered if option 1 misses its budget. |
| 2 | Both Cloud Run and Atlas in the nearest region with free Atlas on GCP (likely Europe) | ~150–200 ms per user request. Last resort. |
| 3 | Self-host in South Africa behind IIS (option E) | Local |

Never put the app and the database on different continents.

**Overseas single-region alternatives (rejected, review round 4).** We considered putting both Cloud Run and Atlas in `europe-west1` or `southamerica-east1`. That makes database calls ~1–2 ms, but every phone ↔ app round trip rises to ~150–170 ms (Europe) or an unpredictable ~120–300+ ms (São Paulo, depending on mobile-network routing). Connection setup, photos and every API call pay that cost, while the local topology only pays ~25 ms per *sequential* database call (≤ 3 per request). Europe would only win at about 6 or more sequential database calls per request. **Decision: stay in South Africa.** Revisit if the app gains meaningful usage outside the founding household, a signal the user will track; a move is then a redeploy plus a database migration. Europe's genuine advantages (Tier 1 pricing, Cloud Run domain mapping, a single provider) are noted for that review.

**Database round-trip budget (option 1).** At about 25 ms per round trip, *sequential* database calls are the main latency cost.
- Aim for at most **3 sequential round trips** per API request.
- Read models (Today, History) use one aggregation or a few `$in` batch lookups, never N+1 queries.
- Run independent queries in parallel (`Promise.all`).
- Reuse a single pooled `MongoClient` per instance. TLS setup to Cape Town only happens on cold start.
- Spike pass mark: **warm** Today API server time ≤ 250 ms p95. If it's missed after optimisation, evaluate option 1b.

**S-1.4 result (31 Oct 2026): passed.** Probe service on Cloud Run `africa-south1` against an Atlas M0 on AWS `af-south-1`, seeded with a year of two households' data (~19.5k documents). The Today read was one parallel batch plus one `$in` lookup (two sequential round trips).

| Measure | p50 | p95 |
|---|---|---|
| Ping (one round trip) | 21–32 ms | — |
| Today read, server-side | 62 ms | 71 ms (budget 250 ms) |
| Transaction (log + planned-session version bump) | 130 ms | — |
| Startup connect (SRV + TLS + auth) | 0.3 s | — |

| Device (30 Today calls) | Total p50 / p95 | Server p50 / p95 |
|---|---|---|
| Laptop | 76 / 83 ms | 62 / 68 ms |
| Galaxy S23 FE, Wi-Fi | 100 / 206 ms | 63 / 68 ms |
| Galaxy S23 FE, mobile data | 148 / 226 ms | 75 / 79 ms |
| Redmi Note 12 Pro, Wi-Fi | 98 / 106 ms | 75 / 76 ms |
| Redmi Note 12 Pro, mobile data | 117 / 197 ms | 75 / 87 ms |

Findings:
- A user waits ~100–150 ms for the Today API at p50 and ≤ ~230 ms at p95 on either phone, either network. Option 1b is not needed.
- Idle gaps of 1–12 min between requests cost nothing: the first read after a gap matched warm reads (62–78 ms). Cloud Run's request-based CPU throttling doesn't drop pooled connections.
- **Connect to Mongo before the server listens.** Listening first let Cloud Run's startup probe pass early; the instance then had almost no CPU outside requests and the TLS connect to Cape Town took 5.7–31 s instead of 0.3 s. So the app connects during startup (with CPU boost), and `/readyz` reports ready only once connected (S0.3, S0.4).
- Multi-document transactions work on M0 at ~130 ms for a typical `UnitOfWork`.
- The app database is **`toe-beans`**, used by the `toe-beans-app` user (`readWrite` on that database only).

**Database network access.** The Atlas IP access list can't be pinned to Cloud Run. Cloud Run has no stable outbound IP unless it gets a Serverless VPC connector plus Cloud NAT, which isn't free. Lambda (option 1b) has the same problem. So the access list is `0.0.0.0/0`, compensated by:
- TLS, which Atlas enforces.
- A long random SCRAM password held in Secret Manager, never in the repo or image.
- A dedicated app user with `readWrite` on the app database only, and a separate read-only user for the backup job.
- Credential rotation as a runbook step (`docs/runbooks/accounts.md`).
- Atlas's own access alerts left on.

This is recorded as risk R3.

**Other region notes:**
- R2 has no African location; use the nearest location hint (Europe). Photos are cached privately by the browser after the first load, so this matters little.
- Cloud Scheduler should be in the same region as Cloud Run, or the nearest region available.

**Cold start budget.** At most 5 s from a cold container to the first response (review round 1: "a handful of seconds").
- Mitigations: a small image, Cloud Run startup CPU boost, lazy initialisation of non-critical clients, and a pooled Mongo connection reused across requests.
- The tick also keeps an instance warm for much of the day, though Cloud Run doesn't guarantee that. At 1 minute it did for the whole S-1.3 run; at 5 minutes, the spike's second week measures it (§6.3).
- If the budget is missed, `min-instances=1` fixes it but isn't free. That would reopen D9.
- **Measured (S-1.3):** with the tick paused until the instance had scaled to zero, opening the app on the Galaxy S23 FE started a new instance; Node was up 0.29 s after process start and served the first response 0.62 s later, under 2 s as seen on the phone. Later instance starts took 0.16–0.43 s to boot. Cold starts aren't a concern; S13.3 still measures full cold loads of the installed app on both phones.

**Domain.** The app is served at `https://toebeans.co.za` from the first release (registered 31 Oct 2026 at GoDaddy for two years, alongside the user's other domains). It replaces the earlier plan of `toebeans.gebrev.com` first and a move later, because a move isn't free: push subscriptions are tied to the origin and every device would re-subscribe. `www.toebeans.co.za` redirects to the apex. The origin still stays pure configuration, so any later move is config only:
- `PUBLIC_BASE_URL` (runtime)
- OIDC callback and logout URLs registered in Auth0 (the Auth0 custom domain `auth.toebeans.co.za` is *not* pure config: it is the issuer users are keyed by, §3.4)
- the cookie domain (host-only `__Host-` cookies need no domain)
- the VAPID `subject`

Push subscriptions are tied to the origin, so a domain move would mean devices re-subscribe. The Notifications screen handles that as the "not yet asked" state.

**Custom domain on Cloud Run (Q8)** — options, to be tried in this order during S-1:
1. ~~**Cloud Run domain mapping**~~. Free, with a Google-managed certificate, but **not offered in `africa-south1`** (Cloud Run locations page, checked 31 Oct 2026). Out.
2. ~~**Firebase Hosting rewrite to Cloud Run.**~~ Its Cloud Run rewrites **don't support `africa-south1`** (the deploy is refused: "Cloud Run region `africa-south1` is not supported", S-1.4a, 31 Oct 2026). It would also have forwarded only a cookie named `__session`. Out.
3. **Cloudflare proxy** (DNS proxied, plus a free Worker to rewrite the Host header to the `run.app` URL). This adds another dependency in the request path, but Cloudflare has a Johannesburg point of presence and doesn't restrict cookies. It needs the domain's nameservers moved to Cloudflare (free plan); the registration stays at GoDaddy.

That leaves **Cloudflare**: a Worker on `toebeans.co.za` forwards to the `run.app` URL (`spikes/domain`). S-1.4a results (warm same-origin pings without a database, so the cost adds to the S-1.4 device numbers; the server-side budget is unaffected):

| Device | Network | `run.app` p50 / p95 | via Cloudflare p50 / p95 | Added at p50 |
|---|---|---|---|---|
| Laptop | Wi-Fi | 12 / 15 ms | 33 / 42 ms | ~20 ms |
| Galaxy S23 FE | Wi-Fi | 21–26 / 30–46 ms | 35–37 / 47–49 ms | ~12 ms |
| Galaxy S23 FE | Mobile data | 56–58 / 187–193 ms | 81–90 / 252–305 ms | ~28 ms |
| Redmi Note 12 Pro | Wi-Fi | 23–24 / 67–212 ms | 44–45 / 139–227 ms | ~21 ms |
| Redmi Note 12 Pro | Mobile data | 50–53 / 73–81 ms | 69–73 / 105–127 ms | ~18 ms |

(Second and third runs of each set; the first includes connection setup. Phone p95s are noisy on both origins.) Cloudflare answers from its Johannesburg edge and adds roughly 12–28 ms at p50. On mobile data that puts a Today load at roughly 180 ms p50 on the Samsung and 135 ms on the Redmi (148 and 117 ms in S-1.4). **Decision: Cloudflare Worker** (Q8 resolved). Cookies pass both ways unchanged, including `__Host-` cookies. Push subscribed from the custom origin is delivered, and a tap opens the installed app.

**Public origin behind the Worker.** Cloud Run sees the `run.app` host, so SvelteKit takes `run.app` as its origin and its CSRF check rejects same-origin POSTs from `toebeans.co.za` with 403 (found in S-1.4a). adapter-node 6 has no runtime `ORIGIN` variable any more, and it assumes `https` unless `PROTOCOL_HEADER` says otherwise. The plan was to set Kit's `paths.origin` at build time. S1 does better: Kit's check is off and the app's own Origin check compares with the runtime `PUBLIC_BASE_URL` (§3.4), so the image doesn't depend on the origin. Callback and sign-out URLs are built from `PUBLIC_BASE_URL` too, never from the request URL.

The global external load balancer works everywhere but costs money, so it's rejected.

On the self-host path, `toebeans.co.za` points at the IIS host, with a win-acme certificate.

---

## 9. Observability

| Need | Choice | Alternatives considered |
|---|---|---|
| Structured logs (NFR-12) | **pino** JSON to stdout, collected by Cloud Logging (free allotment) or `docker logs` with rotation. Lines carry Cloud Logging's `severity`, `message` and `time`. Per-request `requestId`. Redacts tokens, cookies, push endpoints and emails. | Grafana Cloud Loki (free ~50 GB, 14-day retention) if self-hosting needs a hosted UI. |
| Errors | **Sentry** free Developer plan (~5k errors/month, 1 user), server + browser SDK, PII scrubbing on. Off when `SENTRY_DSN` is unset. | GlitchTip (self-host, Sentry-compatible), Grafana Cloud. |
| Uptime and health | UptimeRobot or Better Stack free, hitting `/healthz` | Cloud Monitoring uptime checks. |
| Metrics and traces | **Deferred.** Code is instrumented through a thin `Telemetry` port so OpenTelemetry → Grafana Cloud can be added without touching use cases. | — |
| Notification diagnostics | `NotificationJob` records double as an audit trail, with structured logs for each send and failure (no endpoints or payload text). **No diagnostics UI in Phase 1** (review round 1). Investigation is done through logs and the database. | An owner-facing "Delivery log" screen in a later phase. |

**How it's built (S0.4):**

- **Ports.** The backend logs through a `Logger` port and reports bugs through an `ErrorReporter` port, both in `application/ports`. The adapters are `infrastructure/logging/pino-logger.ts` and `infrastructure/error-reporting/sentry.ts`. A Fastify host or the worker gets both from `createBackend` with no SvelteKit involved (NFR-15). `@sentry/sveltekit` was considered and not used: its server side would tie error reporting to the framework, and the tick worker runs outside requests.
- **Request IDs.** The `handle` hook keeps a well-formed upstream `x-request-id` (8–128 characters from `[A-Za-z0-9._:-]`), so a proxy's logs can line up. Otherwise it generates a UUID. It runs the request inside `backend.withRequestContext`, an `AsyncLocalStorage`, so every log line and Sentry event from that request carries the ID without passing it around. The ID goes back in the `x-request-id` response header and in the body of a 500 (`App.Error.requestId`).
- **Access log.** One `request` line per request with method, **route ID** (`/join/[token]`, never the path or query, which can carry invite tokens), status and duration. `/healthz` and `/readyz` log at `debug`.
- **Redaction**, a safety net rather than a licence to log anything. pino censors a fixed list of keys (credentials, cookies, `email`, push `endpoint`/`keys`, `uri`, `notes`) at the top level and up to two objects down. Error messages and stacks go through `scrubText`, which masks emails, MongoDB connection strings, bearer tokens and the value MongoDB quotes in duplicate-key errors.
- **Sentry, server.** Errors only: no tracing, no breadcrumbs. SDK 11's `dataCollection` collects user info, cookies, headers, bodies and query strings by default, so each is switched off. `beforeSend` also drops `request` and `user`. Events are tagged with the request ID and route. `handleError` reports only `unknown` errors; 404s and `error()` throws are expected outcomes.
- **Sentry, browser.** `@sentry/browser`, imported dynamically in `hooks.client.ts` `init` only when `SENTRY_DSN` is set (one DSN for both sides, declared public in `src/env.ts`). Without a DSN the ~140 KB gzipped SDK is never fetched. Events keep the user agent (phone and Chrome version) and drop the URL, user and breadcrumbs. This is the one place the app imports an SDK, so the lint rules allow `@sentry/browser` in `lib/client/error-reporting.ts` only.
- **Release name (S0.8).** The build's Kit `version.name` is `APP_RELEASE` when the pipeline sets it, else the short git commit, else Kit's timestamp (`vite.config.ts`). The browser reports errors under it and the More page shows it, so a bug report can name the build. The deploy should set `APP_RELEASE` for both the build and the server, so server and browser events share a release.
- **Readiness.** `/readyz` pings Mongo with a 2 s timeout: 200 `{"status":"ready"}`, or 503 `{"status":"unavailable"}` with the reason logged and not returned.
- **Not done yet:** correlating with Cloud Run's request logs through `logging.googleapis.com/trace` (needs the project ID; revisit in S14.1), and source-map upload to Sentry (with S0.6 CI).

---

## 10. Quality and delivery

- **Tests:**
  - Vitest for domain and application, using in-memory adapters.
  - Integration tests for repositories against real MongoDB: Testcontainers running `mongodb/mongodb-atlas-local:8.0` (the Atlas major version, already a single-node replica set), shared by the run, with a fresh database per test file (`pnpm test:integration`, `*.integration.test.ts`). `MONGO_TEST_IMAGE` overrides the image. Newer MongoDB 8.0 releases refuse to start on Linux 6.19+ (SERVER-121912); the cached Atlas Local 8.0 image (mongod 8.0.20) predates that check, so a refreshed pull on a new kernel may need a pinned tag.
  - Playwright end-to-end for the critical flows (`apps/web/e2e`, `pnpm test:e2e`), in Chromium, against the production build (`pnpm build && node build`) on its own database (`toe-beans-e2e`), so tests exercise what ships. Two projects emulate the acceptance phones, built from Playwright's Pixel 7 (Chrome for Android) profile: Galaxy S23 FE at 384 × 700 CSS px, 2.8125× DPR (measured: the owner's DevTools profile matched to the phone, the area above its navigation buttons), and Redmi Note 12 Pro at 393 × 830, 2.75× (estimated; measure the same way in S13). The 384 px Samsung is the binding width. `ui.md` still designs for 360–412 dp, so layouts shouldn't rely on the extra 24 px. The smoke test fails on any sideways overflow there.
  - End-to-end suites so far: `smoke` (every destination renders with no console errors, no sideways overflow and no third-party requests), `shell` (bottom-bar navigation and `aria-current`, 48 px targets, content clear of the bar, self-hosted fonts, server-rendered icons with JavaScript off, the Not found page) `theme` (follows the system setting, the per-device override, and no flash of the wrong theme with the app's scripts blocked) and `auth` (sign-in through the mock provider with the deep link kept, the sign-in page's layout, an unverified email refused, a callback with no sign-in in progress, sign-out ending the session even for a kept copy of the cookie, a made-up cookie, 401 from the API, cross-site writes refused). A `sign-in` setup project signs in once through the mock provider and saves the session, so the other suites start signed in. The tests always use the mock provider (compose, or a CI service container), whatever `.env` says. Run one phone with `pnpm test:e2e --project=galaxy-s23-fe` (with `=` when other arguments follow).
  - Mandatory suites: household isolation for every repository and endpoint (§4.4), reminder replan/dedupe, outcome counting rules.
- **CI (GitHub Actions, `.github/workflows/ci.yml`):** on pull requests (forks included) and pushes to `main` and `develop`, four parallel jobs: lint → type-check → unit, integration (Testcontainers), end-to-end (Playwright, with Atlas Local as a service container; the HTML report is uploaded on failure, so it must only ever hold test data), and the image build (not pushed). Deploying is a separate workflow, added with S14.1.
- **CI/CD security on a public repo (D15, NFR-01, NFR-02, NFR-12).** The repo will be open source, so anyone can open a PR and read the workflows and CI logs.
  - *Untrusted code never meets secrets.* CI runs on `pull_request`, which gives fork PRs a read-only token and no secrets. It holds no secrets at all, and the workflow sets `permissions: contents: read`. `pull_request_target` and `workflow_run` are never used to build or test PR code. Event fields such as PR titles and branch names are passed to `run:` steps through `env:`, never interpolated. Checkout doesn't persist credentials. No self-hosted runners. First-time contributors' workflows need approval.
  - *Keyless deploys.* The deploy job authenticates to GCP with Workload Identity Federation (GitHub's OIDC token), never a service-account key. The provider's attribute condition pins `repository` to this repo and the `production` environment; without it, any GitHub repo could get credentials. The deploy service account gets only `run.developer` on the one service, `iam.serviceAccountUser` on the runtime account and write access to one Artifact Registry repo. The `production` environment allows `main` only and needs the owner's approval. It is the only job with `id-token: write`.
  - *Runtime secrets stay in GCP.* `MONGODB_URI`, the VAPID private key, the OIDC client secret and the Sentry DSN live in Secret Manager and are mounted by Cloud Run. GitHub holds no secrets. Deploy rights still amount to running code as the runtime account, which can read them, so `main` gets a ruleset (no force-push or deletion, CI must pass) and deploys stay gated.
  - *Supply chain.* Actions are pinned to commit SHAs. Dependabot proposes updates to actions, the base image and npm packages after a 7-day cooldown; security updates aren't delayed. It skips major updates of `typescript` until the toolchain's peer ranges accept them, and of `@types/node`, which moves with the Node runtime major. `--frozen-lockfile` is used, and install scripts are blocked except esbuild's (`onlyBuiltDependencies`). Images are deployed by digest. Build-provenance attestation can be added later. Buildx's GitHub cache is scoped by branch, so a PR can't poison `main`'s.
  - *Registry.* Images go to Artifact Registry, which Cloud Run pulls from directly (0.5 GB free). Public GHCR images would work for the self-host path, but Cloud Run would need an Artifact Registry remote repository in front of them; verify in S14.1.
  - *Exposure from being public.* The architecture is public (the Atlas `0.0.0.0/0` list, R3; the `run.app` origin; `/internal/tick`), so nothing relies on secrecy: OIDC login, household checks on every operation, strong database credentials over TLS, and an OIDC-authenticated tick. Anyone can reach `run.app` directly and skip the Cloudflare Worker. That's acceptable while the Worker adds no security; if it ever does (WAF, rate limits), the app must reject requests without a header secret only the Worker sends. CI logs are public too, which is one more reason logs carry no sensitive data (§9).
- **Manual acceptance:** scenario checklist on both physical phones per release (backlog slice S-14), recording Android/Chrome versions.
- **Backups and restore (NFR-10):**
  - Nightly `mongodump --archive --gzip`, encrypted with `age`, stored in a dedicated R2 bucket with a 30-day lifecycle.
  - Weekly `rclone` copy of the photo bucket.
  - A restore runbook at `docs/runbooks/restore.md`, tested before go-live and quarterly after.

---

## 11. Open questions and risks

| # | Item | Plan |
|---|---|---|
| Q1 | ~~Is a billing-enabled GCP account acceptable?~~ | **Resolved:** yes. A budget alert is mandatory (S14.1). |
| Q2 | Atlas free cluster idle pausing; acceptable cold-start time | **Resolved:** cold starts of a few seconds are acceptable. The spike target is **≤ 5 s** for the first response from cold (§8.4). The tick keeps Atlas active. |
| Q3 | ~~Which region?~~ | **Resolved:** South Africa where possible. See §8.4 and Q7. |
| Q4 | ~~Android battery optimisation delaying push~~ | **Resolved (S-1.2):** both phones drop pushes at default settings once locked for a minute or two; lifting Chrome's battery restriction fixed it on both (§6.4). Guidance goes into the reminders setup (`ui.md` J7). Residual risk is R5. |
| Q5 | ~~Custom domain?~~ | **Resolved:** `toebeans.co.za` from the first release (bought 31 Oct 2026), replacing `toebeans.gebrev.com`. The origin stays pure config (§8.4). See Q8. |
| Q6 | ~~Exercise content authorship~~ | **Resolved:** the user aggregates the catalogue from online articles and videos, edited with AI, and reviews it. Pipeline in §3.8. |
| Q7 | ~~Free Atlas cluster in South Africa?~~ | **Resolved (S-1.0):** only on AWS `af-south-1` (Cape Town). Topology 1 in §8.4. |
| Q8 | Cloud Run custom domain mapping may not be available in `africa-south1`, and the paid load balancer isn't free | **Resolved by S-1.4a:** domain mapping and Firebase Hosting rewrites are both unavailable for `africa-south1`, so a Cloudflare Worker fronts Cloud Run. It adds ~12–28 ms at p50 on the phones; cookies and push work from the custom origin (§8.4). |
| Q9 | ~~`africa-south1` is a Tier 2 Cloud Run pricing region. Confirm the free allowance applies and the expected monthly cost is $0.~~ | **Resolved (S-1.3):** billing reports show $0.00 for the project over the 48 h run, so the free allowance covers Tier 2. Each service's list cost is cancelled by its own spending-based discount, with promotional (trial) credits untouched; Google Cloud Assist confirms that's the free tier, applied as a monthly discount valued at Tier 1 prices, so in Johannesburg it covers roughly 29% less usage than in `us-central1`. Costs are reviewed quarterly (R1), and a budget alert is part of the prod setup (S14.1). |
| Q10 | ~~Should one person's Google and email/password sign-ins be the same user?~~ Auth0 makes them separate users with different subjects. | **Resolved (S1):** yes. The app links identities that share a verified email to one user, and refuses sign-ins whose email isn't verified (§3.4). |
| R1 | Free-tier terms change without notice (e.g. Oracle, Koyeb in 2026) | Everything sits behind ports, the self-host compose is maintained and tested, and costs are reviewed quarterly. |
| R2 | Multi-vendor sprawl (GCP, Atlas, R2, Auth0, Resend, Sentry) | Accepted for a free setup. Secrets are listed in `docs/runbooks/accounts.md` (names only, no values). |
| R3 | Atlas access list open to all IPs (`0.0.0.0/0`), because serverless hosts have no fixed outbound IP (§8.4) | TLS, strong rotated credentials, least-privilege users, Atlas alerts. Revisit if a free static-egress option appears, or on self-host (where the database isn't exposed at all). |
| R4 | ~~Cross-provider latency between Johannesburg and Cape Town is higher than estimated~~ | **Retired by S-1.4:** 21–32 ms per round trip, Today p95 71 ms server-side against a 250 ms budget (§8.4). |
| R5 | Push reliability depends on each user lifting Chrome's battery restriction, which they may skip or which an OS update may reset. A PWA can't request the exemption itself or schedule notifications on the device. | Setup step with per-manufacturer instructions and a delayed test (`ui.md` J7). Today always shows what's due. If real use is still unreliable, the escalation is a thin Android wrapper (Capacitor or a Trusted Web Activity) that schedules reminders on the device with exact alarms. That is a **scope change** (the requirements assume no native wrapper) and needs a recorded decision. |
