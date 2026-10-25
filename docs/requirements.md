# Toe Beans — Product Requirements

**Version:** 1.0
**Date:** 25 October 2026  
**Status:** Baselined
**Baseline date:** 25 October 2026
**Initial users:** Two caregivers sharing responsibility for one or more dogs

This document represents the agreed requirements baseline for the Toe Beans MVP. Requirements may evolve through implementation, with material scope changes recorded and versioned.

## 1. Purpose and product vision

Toe Beans is an installable, mobile-first puppy training and care companion. It helps caregivers plan short, reward-based training activities, practise consistently, record meaningful results, and keep important puppy-care events in one place.

The product should answer three questions: **What should we do today? How is our puppy progressing? What should we work on next?**

## 2. Scope and priorities

- **P0 — First usable MVP:** Required to support an end-to-end weekly training workflow.
- **P1 — Phase 1 follow-on:** Valuable initial-product features, but not blockers for first use.
- **P2 — Future:** Explicitly out of scope for Phase 1.

**Initial constraints:** One household, **multiple dogs supported from the outset**, and two or more invited caregivers. Data must be shared across their devices. The initial application will be built for a personal-use household, while maintaining appropriate isolation for potential future households. Training is based on positive reinforcement; the app is not a substitute for a veterinarian or a qualified behaviour professional.

### Decisions adopted through v0.3

- Push notifications delivered while the app is not open are **P0**, subject to device/browser support and user permission.
- Implement the MVP as **full-stack SvelteKit**, with a modular backend core designed for later extraction into a standalone Node.js API (e.g. Fastify or Express).
- Support **multiple dogs per household** in the data model and core management flows from the beginning.
- Support both **email invitations** and **shareable invitation links**.
- A **profile photo for every dog** is P0; general photo galleries and document uploads are deferred.
- Users **cannot author custom training exercises** in Phase 1; use a curated starter library. The shared cue dictionary remains editable.
- Prefer a genuinely free cloud deployment; **self-hosted containers behind IIS reverse proxy** are the fallback if cloud options are unsuitable or not free.
- Record **B (qualitative outcome)** with **optional D (emotional state and environment)** for completed training sessions; do not require a success assessment. Quantitative repetition/success counts are deferred.
- The **MVP target platform** is **Android**, using **Google Chrome** and an installable PWA. The primary physical acceptance-test devices are **Samsung Galaxy S23 FE** and **Redmi Note 12 Pro**. Other platforms are best effort rather than release blockers.

## 3. Functional requirements

| ID | Priority | Requirement | Acceptance criteria |
|---|---|---|---|
| **FR-01** | P0 | **Household and caregiver access.** A caregiver can create a household and invite others through **email invitations or shareable invitation links**. | Invitees must authenticate before joining. Invite links must have an expiry or revocation mechanism; an invite cannot grant access to an unintended household. Authorised caregivers share records; unauthorised users cannot see or edit them. |
| **FR-02** | P0 | **Dog profiles.** Create and edit **multiple dogs per household**, each with name, birth date or estimated age, adoption date, a **required profile photo**, and relevant notes. | Every record of training, behaviour, or care relates to the correct dog; caregivers can switch the active dog when more than one exists. Profile photographs upload securely, persist across deployments, and are visible only to authorised household members. |
| **FR-03** | P0 | **Training exercise library.** Supply a curated starter library covering name recognition, recall, toileting, calm greetings, settling, doorbell sounds, barking, loose-leash walking, and appropriate behaviour around cats. | Each exercise states its goal, setup, steps, suggested duration, success criteria, and what to do if the puppy struggles. Creating custom exercises is **out of scope for Phase 1**. |
| **FR-04** | P0 | **Shared cue dictionary.** Record agreed verbal cues, hand signals, and reward conventions so all caregivers train consistently. | Caregivers can view and edit a common list of cues and their intended meanings. |
| **FR-05** | P0 | **Training planner.** Schedule exercises for a selected dog at specific dates and times, including repetition; edit, skip, cancel or reschedule planned sessions. | Sessions are associated with the correct dog and appear on the relevant day. Skipped/cancelled sessions are not counted as completed. Scheduling changes also update pending reminders. |
| **FR-06** | P0 | **Today's dashboard.** Show today's planned sessions, their status, overdue items, and upcoming care events for the household, with the dog clearly identified. | A caregiver can open an exercise and log its outcome directly from the dashboard; multi-dog activities are not conflated. |
| **FR-07** | P0 | **Quick training log.** Record scheduled or ad-hoc completed sessions associated with a dog, exercise, caregiver and timestamp. Offer a one-tap qualitative assessment (**Successful / Partially successful / Not yet successful / Not assessed**); the default is **Not assessed**. Optionally capture duration, emotional state (**Relaxed/confident / Uncertain / Stressed/overwhelmed**), environment (e.g. home, garden, public space), and free-text notes. | Logging completion must **not** require claiming success. A typical session can be saved in under 30 seconds, with all context fields optional. Practice completion and performance assessment remain separate concepts; results are shared, persist across reloads and can be edited. No repetition counters or success-per-attempt metrics are needed for P0. |
| **FR-08** | P0 | **Event and behaviour journal.** Record notable occurrences (e.g., cat interactions, barking, fear, toileting accidents, visitors), including the affected dog, trigger, response and notes. | Events can be added without creating a training session, then reviewed chronologically and filtered by dog. |
| **FR-09** | P0 | **Training history.** View and filter past training sessions and events by dog, date, exercise and event type. | Both caregivers see a consistent timeline; entries can be corrected or deleted with confirmation. |
| **FR-10** | P0 | **Care calendar.** Create, edit and complete dog-specific care tasks such as vaccinations, parasite prevention, vet appointments, puppy school and sterilisation consultations. | Events have dates, dog association and status; they appear among upcoming items and can be updated without losing history. |
| **FR-12** | **P0** | **Scheduled push reminders and notifications.** Allow caregivers to opt in to device **Web Push notifications** for training sessions and care events, including while the installed PWA is closed or not currently loaded. Configure reminders per caregiver/device and schedule; retain an in-app reminder view as fallback. | On a supported, subscribed device with notifications permitted, a due reminder can generate a system notification without the app being open. Tapping a notification opens the relevant item. Editing/completing/cancelling the task prevents obsolete reminders, with appropriate deduplication and error reporting. The app explains when notifications are blocked or unsupported; delivery may be affected by device/network conditions. |
| **FR-11** | P1 | **Goals and milestones.** Define dog-specific, skill-specific goals and record progress stages (e.g., introduced, developing, reliable in a defined context). | Progress is tracked per dog and skill; a goal may be modified without erasing past sessions. |
| **FR-13** | P1 | **Age-aware starter plan.** Offer suggested exercises and care checkpoints per dog, based on approximate age and current training level. | Suggestions can be accepted, edited or dismissed; no veterinary dates are assumed to be universally applicable. |
| **FR-14** | P1 | **Basic progress summary.** Show sessions completed, exercises practised, planned-versus-completed activity, qualitative outcome distribution and recent progress notes. | A weekly view distinguishes practice consistency from behavioural proficiency; **Not assessed** sessions are not counted as successful. Context and emotional-state responses are not flattened into an overall success score. |
| **FR-15** | P1 | **Care records and contacts.** Store vet details, dog-specific weight entries and relevant health notes. Upload of general photographs, training certificates and medical documents is deferred beyond Phase 1. | Authorised caregivers can retrieve and edit essential structured information from their phones. |
| **FR-16** | P1 | **Simple data export.** Allow household owners to export training and care records in a machine-readable format. | An export contains the household's core structured records without exposing authentication secrets. |

### Explicitly deferred (P2)

- AI-generated recommendations or behaviour troubleshooting based on trends.
- Advanced analytics, charts, predictive milestones and adaptive training programmes.
- Dedicated cat-introduction and socialisation programmes beyond Phase 1 exercises and journaling.
- Offline editing with automatic background synchronisation.
- Multi-household administration, public exercise marketplaces, professional trainer accounts, and payments.
- User-authored custom training exercises (deferred until after Phase 1).
- General photo galleries, training certificate uploads and medical document attachments.
- Automated interpretation of medical records or individualised veterinary advice.

## 4. Non-functional requirements

| ID | Priority | Area | Requirement / target |
|---|---|---|---|
| **NFR-01** | Must | **Identity and security** | Authenticate through a standards-compliant external identity provider using **OpenID Connect (OIDC)**, e.g., Auth0; use OAuth 2.0 where relevant for API authorisation. Validate tokens server-side and enforce household-level authorisation on every data operation. |
| **NFR-02** | Must | **Data protection** | HTTPS throughout; no secrets in frontend bundles or source control; sensible input validation; least-privilege access; protect personal data and provide a route to delete it. Validate household access on profile-photo requests; keep invitation tokens and push subscription endpoints protected. |
| **NFR-03** | Must | **Installability and usability** | Mobile-first responsive **Progressive Web App (PWA)**. The **release target is Android + Google Chrome**, including installation and everyday use on the Samsung Galaxy S23 FE and Redmi Note 12 Pro. Accessible labels, readable layouts and large touch targets. Common logging actions should be quick and require minimal typing. Installation and notification permission status must be understandable to users. Other browsers and desktop platforms are best-effort for the personal-use MVP. |
| **NFR-04** | Must | **Connectivity** | **Online-first**: server is the system of record. Under poor/no connectivity, show clear connection and save status; allow access to safely cached non-sensitive/static content where feasible; never claim an unsaved change was persisted. Offline writes and later sync are not required for Phase 1. |
| **NFR-05** | Must | **Persistent data** | Use a durable, persistent **document database**, with stable identifiers, timestamps, basic schema/version management and backup/restore procedures. Store dog profile images in durable, access-controlled storage (not ephemeral container files); retain necessary push subscription and scheduling state. Data must survive container restarts or redeployment. |
| **NFR-06** | Must | **Deployability** | The **MVP is a full-stack SvelteKit application**, deployed in a container, with external environment configuration and durable external persistence. A separate API or separately hosted static frontend is **not** required initially. The frontend should remain separable into a static hosting model after a later API extraction, subject to appropriate architecture decisions. |
| **NFR-07** | Target | **Hosting cost and fallback** | Prefer a genuinely free cloud deployment for the SvelteKit container, document database and durable image storage. Confirm quotas, always-on/background execution, cold starts, storage, egress and pricing at architecture selection. **If suitable free cloud hosting is unavailable, self-host the MVP** as containers behind the existing **IIS reverse proxy**, with HTTPS, durable storage, backups and an operational notification scheduler. |
| **NFR-08** | Must | **Scalability** | Optimise initially for a few users while keeping application state outside process memory (except disposable caches). Isolate API/domain behaviour from SvelteKit adapters to allow later horizontal scaling or extraction to an independently deployed API. No microservices or orchestration are required for the MVP. |
| **NFR-09** | Target | **Performance** | Dashboard and log flows should feel responsive on typical mobile connections. Target under 3 seconds for common views once the service is warm, and provide loading feedback during free-tier cold starts. Validate with measurements rather than assuming an SLA. |
| **NFR-10** | Must | **Reliability and recovery** | Failed writes must be visible and recoverable. Maintain regular backups and document a tested restore process. No formal uptime SLA is required for the personal-use MVP. |
| **NFR-11** | Must | **Maintainability and quality** | Modular structure; automated tests for core domain rules, household isolation and critical create/edit flows; reproducible builds; configuration per environment; lightweight CI checks. |
| **NFR-12** | Must | **Observability** | Structured server logs, meaningful error responses, basic health check and enough diagnostics to investigate failed logins, failed writes and deployment issues, without logging sensitive information. |
| **NFR-13** | Must | **Shared data consistency** | Changes saved by one caregiver are visible to the other after refresh or navigation; conflicting edits must not silently destroy existing data. Real-time **live UI updates** are not required in Phase 1; this is distinct from the P0 device push-notification requirement. |
| **NFR-14** | Must | **Training safety and content quality** | Instructions should favour gradual exposure and reward-based training, acknowledge fear/distress, avoid punitive or coercive techniques, and direct users to a vet or qualified trainer for concerning issues. Care milestones must be configurable and not treated as medical prescriptions. |
| **NFR-15** | Must | **Backend portability** | Put business rules, validation, persistence access and use-case services in framework-independent server modules. Keep SvelteKit route handlers/actions thin, with explicit API/use-case boundaries and framework-neutral inputs/outputs where practical. Avoid coupling the core to SvelteKit's request/session types; document an extraction path to Fastify/Express. |
| **NFR-16** | Must | **Background notification operation** | Push scheduling and dispatch must function without a browser session and cannot depend on an open tab. The deployment must provide a persistent scheduler/worker or equivalent, with persisted schedule state, cancellation/rescheduling, retries or failure handling, and duplicate-send safeguards. Permission and subscription lifecycle must be handled securely. Test with Chrome on both target phones **while the installed PWA is closed**, including permission denied/revoked, rescheduled reminders and notification taps. Device notification settings, power management and network connectivity may prevent or delay delivery; communicate these limitations without promising exact delivery times. |

## 5. Key end-to-end acceptance scenarios

1. **Onboarding and invitations:** Caregiver A signs in, creates a household and dog profile, uploads its photo, and invites Caregiver B using an email invitation. Caregiver B joins and sees the profile. A can alternatively create a revocable/expiring invite link.
2. **Multiple dogs:** A adds a second dog. Sessions, behaviours and care appointments can be created and retrieved for either dog without mixing histories.
3. **Plan and practise:** A schedules a recall session for Ripley; B sees it, follows the instructions and logs practice as **Partially successful**, optionally adding **Relaxed/confident** and **Garden**; A sees the completed record. B can also save a practised session as **Not assessed** without selecting a performance outcome.
4. **Push reminder with app closed:** On **both the Samsung Galaxy S23 FE and Redmi Note 12 Pro**, a caregiver installs Toe Beans in Chrome, explicitly opts in to notifications, and can receive a scheduled training reminder while the PWA is closed. Tapping the notification opens the relevant task. If permission is denied, revoked or unavailable, the app explains that push reminders will not arrive and shows in-app scheduled items instead. Actual delivery remains subject to Android/device restrictions and connectivity.
5. **Change or cancel a reminder:** A reschedules or completes a care task. Previously scheduled notifications for the old time are cancelled or suppressed to avoid stale reminders.
6. **Unscheduled event:** B records a barking incident with its trigger and response, associated with a selected dog, without scheduling a formal exercise.
7. **Care admin:** A records a vaccination appointment for one dog. It appears in the correct calendar and dashboard view and can be marked complete.
8. **Network failure:** The connection drops during a save; the app clearly reports failure and retains entered information so it can be retried.
9. **Security boundary:** A signed-in user outside the household cannot retrieve its records, images or invitations by changing identifiers or requests.
10. **Durability:** After a container restart or deployment, dog profiles, photographs, logged sessions, schedules and subscriptions remain persisted.

## 6. Decisions and outstanding questions

### Resolved through v0.3

| Original question | Decision |
|---|---|
| Q1: Multiple animals? | **Yes.** Model multiple dogs per household; support basic dog selection in MVP flows. |
| Q2: Push while closed? | **Yes. P0**, on supported devices with user permission. |
| Q3: Invitations? | **Both email and shareable links.** |
| Q4: Custom exercises? | **No** user-authored exercises in Phase 1; curate the starter exercise library. |
| Q5: Photo/document uploads? | **Dog profile photos are P0**; other images and documents deferred. |
| Q7: Hosting cost? | Prefer genuinely **free cloud hosting**, otherwise **self-host the MVP** in containers behind IIS reverse proxy. |
| Q6: Session outcome logging? | **Qualitative outcome (B)**, default **Not assessed**; optional **emotional state and environment (D)**; quantitative attempts/successes (C) are deferred. |
| Target devices? | **Android / Google Chrome**, with **Samsung Galaxy S23 FE** and **Redmi Note 12 Pro** as primary acceptance-test devices. |

### Session logging decision: qualitative with optional context (Q6 resolved)

- **Completion** is distinct from **quality**. A session can be completed without claiming the exercise succeeded.
- **Performance outcome (B):** `Successful`, `Partially successful`, `Not yet successful`, or `Not assessed` (the default).
- **Optional comfort/context (D):** `Relaxed/confident`, `Uncertain`, or `Stressed/overwhelmed`; optional environment such as `Home`, `Garden`, or `Public space`; optional notes.
- **No required precision metrics (C) in the MVP:** counting attempts, repetitions or time-to-respond may be considered for specific exercises later without redesigning the logging domain.
- **Reporting:** count completed sessions independently of outcomes, and never count `Not assessed` as a successful result.

### Platform and acceptance-testing decision

The supported personal-use MVP target is **Android running Google Chrome**, on the **Samsung Galaxy S23 FE** and **Redmi Note 12 Pro**. Release acceptance should be exercised on both physical devices, particularly PWA installation, login, photo upload, quick logging, and push reminders with the PWA closed. Android/Chrome versions are those installed on the actual test devices and should be documented at test time. Behaviour on other browsers, desktop platforms or iOS is not a Phase 1 release criterion.

### Further architecture-stage details

Confirm dog-photo limits and storage strategy, service-worker update behaviour, push subscription persistence, device-specific Android notification and battery settings, and cloud service viability. These do not block the product scope.

## 7. Architecture boundary

This document defines **product behaviour and operational constraints**. The following implementation constraints are agreed at the product level: **full-stack SvelteKit MVP**, **Node.js-compatible extractable server-side core**, **Android/Chrome-targeted, online-first PWA with P0 Web Push**, **document-oriented durable storage**, and **free cloud preferred / IIS-reverse-proxy self-host fallback**. The detailed identity vendor, document database product, container topology, notification scheduler, photo storage, cloud provider, deployment pipeline and domain model remain decisions for `docs/architecture.md`, with trade-offs recorded against the requirements above.
