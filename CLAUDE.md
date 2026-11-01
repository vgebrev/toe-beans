# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Toe Beans is a mobile-first, installable PWA for puppy training and care, shared by caregivers in one household. The requirements are `docs/requirements.md` (baselined v1.0, 25 Oct 2026). The S-1 spikes and S0 foundations are done; feature slices start with S1 (sign-in, built) in `docs/backlog.md`. `spikes/` holds throwaway de-risking spikes, each installed separately (see each spike's README).

## Commands

Run from the repo root (Node ≥ 24, pnpm 10):

- `pnpm install`, then `cp .env.example .env` for local settings (ports, `MONGODB_URI`, log level). `.env` is gitignored; `.env.example` is public, so it holds sample values only, never secrets. Shell variables win over `.env`. `pnpm dev`, `build`, `test:e2e`, `compose` and the app's `start` read it.
- `pnpm dev`: the web app (Vite dev server) on http://localhost:7877 (`DEV_PORT`; PUPP on a phone keypad; `pnpm dev --host` to reach it from a phone on the same Wi-Fi). It needs MongoDB as a replica set at `MONGODB_URI` (default `localhost:27017`) and an OIDC provider: `pnpm compose up -d --wait` starts Mongo and the mock provider on `localhost:8090` (any subject and claims JSON sign in), which the app uses unless `OIDC_ISSUER` is set (the Auth0 dev tenant, `docs/runbooks/auth0.md`). Behind `--host`, set `PUBLIC_BASE_URL` to the address the phone opens
- `pnpm lint`: ESLint (including the layer rules) and Prettier check; `pnpm format` fixes formatting
- `pnpm check`: type-check every package (`tsc`, and `svelte-check` for `apps/web`)
- `pnpm test`: all Vitest unit tests. One file: `pnpm test packages/backend/src/domain/result.test.ts`; by name: `pnpm test -t 'narrows on ok'`
- `pnpm test:integration`: `*.integration.test.ts` against MongoDB in Docker (Testcontainers; needs Docker running)
- `pnpm test:e2e`: Playwright (`apps/web/e2e`) against the production build on emulated Galaxy S23 FE and Redmi Note 12 Pro. Needs Mongo and the mock provider like `pnpm dev` (database `toe-beans-e2e`; it always signs in through the mock, whatever `.env` says) and Chromium (`pnpm --filter @toe-beans/web exec playwright install chromium`). One project: `pnpm test:e2e --project=galaxy-s23-fe` (keep the `=` when a file or `-g` follows)
- `pnpm build`: production build of `apps/web` (adapter-node, output in `apps/web/build`)
- `pnpm compose …`: `docker compose` on `docker/compose.yaml`. `--profile app up --build -d --wait` also runs the app image on `localhost:3000`. On port clashes set `MONGO_PORT` / `APP_PORT` in `.env` (and the port in `MONGODB_URI` to match). The image alone: `docker build -f docker/Dockerfile .`
- `apps/web` `dependencies` hold only what the server bundle imports at runtime (now just `@opentelemetry/api`); everything bundled is a devDependency, so the image stays small.

Branches: work lands on `develop` (commit there or on a feature branch off it); `main` moves only by pull request from `develop`, and its ruleset requires the CI checks. Never push to `main` directly.

## Layout and layer rules

- `apps/web`: SvelteKit 3 app. Kit 3 specifics: config lives in `vite.config.ts`, internal imports use `#lib/...` with a `.js` extension (no `$lib`), env vars are declared in `src/env.ts`, and links go through `resolve()` from `$app/paths` with a route ID (Kit 3 paths have no leading slash; ESLint enforces `resolve`).
- UI (`ui.md` §6.4): Tailwind 4 and shadcn-svelte, styled only through the brand tokens. Colours live in `src/lib/theme/tokens.ts` and are mirrored in `src/app.css`; change both (a test checks drift and contrast). Add components with `pnpm dlx shadcn-svelte@1.7.1 add <name>` from `apps/web`, then keep touch targets at 48 px (see `ui/button`). Icons only through `<Icon name>` (`src/lib/components/icon/icons.ts`). Pages call the API through `#lib/api-client`, never backend code.
- `packages/backend`: the framework-independent core, in `domain/`, `application/`, `infrastructure/`, `http/`, `worker/` and `composition.ts`. Its README has the import table.
- `packages/contracts`: Zod DTOs and problem types shared with the browser.
- `workspace/`: the owner's local scratchpad (design files, notes), ignored by git, Docker, ESLint and Prettier. Read from it when asked; never make the build or tests depend on it.
- Packages export TypeScript source (no build step); relative imports use `.js` extensions (NodeNext).
- The layer rules (architecture §4.2) are `no-restricted-imports` blocks in `eslint.config.js`. If a lint error says a layer can't import something, fix the design (add a port, move the code) rather than loosening the rule.

Design docs (each records its own changes in a "Changes in" line under the header): `docs/architecture.md` (accepted baseline v1.0: decision log, domain model, layering, hosting; a changed decision is recorded in its decision log), `docs/ui.md` (journeys, layouts, interaction conventions), `docs/backlog.md` (vertical slices and current progress). Record technical trade-offs in the architecture decision log against requirement IDs (FR-xx / NFR-xx), not silently in code. Update slice status in the backlog as work lands.

Doc versioning: a committed "Changes in x.y" line is closed. When a batch of work changes a doc, and its current version's line is already committed (check with `git diff HEAD -- docs/`), bump the minor version, set the date and add a new "Changes in" line. Don't append to an older line. Uncommitted changes in the same batch go into the open new version. Summarise what changed and why, with section and decision references, not a diary. When a doc's version changes, update the "Inputs" versions in the docs that drive work from it (the backlog cites architecture and ui). `requirements.md` is baselined, so it changes only through a recorded scope change.

## Agreed architectural constraints

These are fixed at the product level. Don't deviate without a recorded scope change:

- **Full-stack SvelteKit MVP** in one container. No separate API or static frontend for now.
- **Framework-independent server core (NFR-15, NFR-08):** business rules, validation, persistence access and use-case services live in server modules that don't import SvelteKit request/session types. Route handlers and form actions stay thin adapters with framework-neutral inputs and outputs, so the core can later be extracted to Fastify or Express.
- **Household isolation on every data operation (NFR-01, NFR-02):** OIDC login, tokens validated server-side, and a household authorization check on every read and write. This includes dog profile photo requests, invitations and push subscriptions. Users outside the household must not reach data by changing identifiers (acceptance scenario 9).
- **Multi-dog from day one:** every training session, event and care task belongs to a specific dog. Never merge histories across dogs.
- **Document database** with stable IDs, timestamps and schema versioning. Profile photos go in durable, access-controlled storage, never the container filesystem. No application state in process memory apart from disposable caches.
- **Online-first (NFR-04):** the server is the system of record. Offline writes and sync are out of scope. The UI must show save and connection status, never report an unsaved change as saved, and keep entered data after a failed save so it can be retried.
- **Web Push is P0 (FR-12, NFR-16):** reminders must arrive while the PWA is closed. That requires a persistent server-side scheduler/worker with persisted schedule state, cancellation and rescheduling when tasks are edited, completed or cancelled, retries, and duplicate-send protection. Tapping a notification deep-links to the item.
- **Target platform:** Android + Chrome, installed PWA. The acceptance devices are the Samsung Galaxy S23 FE and Redmi Note 12 Pro. Other browsers and iOS are best effort.
- **Hosting:** free cloud preferred. Otherwise self-host the containers behind an existing IIS reverse proxy.

## Domain rules that are easy to get wrong

- **Session completion and performance are separate.** The outcome is `Successful | Partially successful | Not yet successful | Not assessed`, and it defaults to `Not assessed`. Logging a session must never require claiming success. Reports must never count `Not assessed` as successful.
- Optional session context: emotional state (`Relaxed/confident | Uncertain | Stressed/overwhelmed`), environment, duration and notes. No repetition or success-per-attempt counters in the MVP.
- Skipped or cancelled planned sessions don't count as completed. Rescheduling a session must also update its pending reminders.
- **Training exercises are a curated, read-only starter library** in Phase 1, with no user-authored exercises. The shared **cue dictionary** is editable.
- Invitations come as email invites or shareable links. Links must expire or be revocable, and invitees must authenticate before joining.
- Conflicting edits must not silently overwrite data (NFR-13). Live real-time UI updates aren't required.
- Content must favour reward-based, gradual-exposure training and avoid punitive techniques. Care milestones are configurable and are not medical prescriptions (NFR-14).
- Logs are structured and must contain no sensitive data. Provide a health check endpoint (NFR-12).

Priorities: P0 = first usable MVP, P1 = Phase 1 follow-on, P2 = deferred. Check the P2 list in `docs/requirements.md` before building anything that looks like scope creep (analytics, AI recommendations, offline sync, galleries or document uploads, custom exercises).
