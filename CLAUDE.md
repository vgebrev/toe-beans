# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Toe Beans is a mobile-first, installable PWA for puppy training and care, shared by caregivers in one household. The requirements are `docs/requirements.md` (baselined v1.0, 25 Oct 2026). The product is at the foundations stage (backlog S0): a pnpm workspace with no features yet. `spikes/` holds throwaway de-risking spikes, each installed separately (see each spike's README).

## Commands

Run from the repo root (Node ≥ 24, pnpm 10):

- `pnpm install`
- `pnpm dev`: the web app (Vite dev server). It needs MongoDB as a replica set on `localhost:27017` (or set `MONGODB_URI`); start one with `pnpm compose up -d --wait mongo`
- `pnpm lint`: ESLint (including the layer rules) and Prettier check; `pnpm format` fixes formatting
- `pnpm check`: type-check every package (`tsc`, and `svelte-check` for `apps/web`)
- `pnpm test`: all Vitest unit tests. One file: `pnpm test packages/backend/src/domain/result.test.ts`; by name: `pnpm test -t 'narrows on ok'`
- `pnpm test:integration`: `*.integration.test.ts` against MongoDB in Docker (Testcontainers; needs Docker running)
- `pnpm test:e2e`: Playwright (`apps/web/e2e`) against the production build on emulated Galaxy S23 FE and Redmi Note 12 Pro. Needs MongoDB like `pnpm dev` (database `toe-beans-e2e`) and Chromium (`pnpm --filter @toe-beans/web exec playwright install chromium`). One project: `pnpm test:e2e --project galaxy-s23-fe`
- `pnpm build`: production build of `apps/web` (adapter-node, output in `apps/web/build`)
- `pnpm compose …`: `docker compose` on `docker/compose.yaml`. `--profile app up --build -d --wait` also runs the app image on `localhost:3000`. On port clashes set `MONGO_PORT` / `APP_PORT` (and `MONGODB_URI` for `pnpm dev`). The image alone: `docker build -f docker/Dockerfile .`
- `apps/web` `dependencies` hold only what the server bundle imports at runtime (now just `@opentelemetry/api`); everything bundled is a devDependency, so the image stays small.

## Layout and layer rules

- `apps/web`: SvelteKit 3 app. Kit 3 specifics: config lives in `vite.config.ts`, internal imports use `#lib/...` with a `.js` extension (no `$lib`), env vars are declared in `src/env.ts`.
- `packages/backend`: the framework-independent core, in `domain/`, `application/`, `infrastructure/`, `http/`, `worker/` and `composition.ts`. Its README has the import table.
- `packages/contracts`: Zod DTOs and problem types shared with the browser.
- Packages export TypeScript source (no build step); relative imports use `.js` extensions (NodeNext).
- The layer rules (architecture §4.2) are `no-restricted-imports` blocks in `eslint.config.js`. If a lint error says a layer can't import something, fix the design (add a port, move the code) rather than loosening the rule.

Design docs (drafts under review; each records its own changes in a "Changes in" line under the header): `docs/architecture.md` (decision log, domain model, layering, hosting), `docs/ui.md` (journeys, layouts, interaction conventions), `docs/backlog.md` (vertical slices and current progress). Record technical trade-offs in the architecture decision log against requirement IDs (FR-xx / NFR-xx), not silently in code. Update slice status in the backlog as work lands.

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
