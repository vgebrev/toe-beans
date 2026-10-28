# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Toe Beans is a mobile-first, installable PWA for puppy training and care, shared by caregivers in one household. The repo is **pre-implementation**: the only source of truth so far is `docs/requirements.md` (baselined v1.0, 25 Oct 2026). There is no product code yet; `spikes/` holds throwaway de-risking spikes (see each spike's README). There is no build tooling or test runner for the product yet. When these are added, update this file with the actual build/lint/test commands, including how to run a single test.

Design docs (drafts under review; each records its own changes in a "Changes in" line under the header): `docs/architecture.md` (decision log, domain model, layering, hosting), `docs/ui.md` (journeys, layouts, interaction conventions), `docs/backlog.md` (vertical slices and current progress). Record technical trade-offs in the architecture decision log against requirement IDs (FR-xx / NFR-xx), not silently in code. Update slice status in the backlog as work lands.

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
