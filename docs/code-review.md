# Toe Beans — Code Review

**Version:** 0.6
**Date:** 16 November 2026
**Status:** Rounds 1–6 (the backend, the contracts and the web library) done; rounds 7–8 to do (S15.3).
**Inputs:** `docs/architecture.md` v1.22 (§4.2 layering), the code at commit `d7dd854` (`develop`)

**Changes in 0.1:** the review's split into eight rounds, one layer or boundary each, and round 1 (domain) with its fixes.

**Changes in 0.2:** round 2 (application) with its fixes (§4), and the web's copy of History's types carried forward to round 5.

**Changes in 0.3:** round 3 (infrastructure) with its fixes (§5).

**Changes in 0.4:** round 4 (http, worker and wiring) with its fixes (§6).

**Changes in 0.5:** round 5 (contracts) with its fixes (§7), which settle both items carried forward.

**Changes in 0.6:** round 6 (web library) with its fixes (§8); the status helper also reached the routes, ahead of round 7.

---

## 1. How the review works

One layer or boundary per round, in dependency order, so a fix in a lower layer is settled before the layers that use it are read. Each round looks for dead or unused code, overly complex code, unnecessary abstractions, and duplication that deserves an abstraction (three or more copies, or logic that must stay in sync), aiming at a consistent architecture and implementation.

A change qualifies only if it fixes something concrete (genuinely dead code, state or logic defined in more than one place that can drift, a deprecated API, an inconsistency that could mislead a reader, or a real readability cost) and a fresh reviewer wouldn't argue to undo it. Rephrasing, reordering and swapping one reasonable style for another don't qualify; they're listed as taste, at most five a round, and left alone. "Nothing worth doing" is a valid result. Behaviour doesn't change (S15.3).

Each round reports first, the owner decides, and only then are the fixes made.

## 2. Rounds

| # | Layer or boundary | Scope | Status | Verdict |
|---|---|---|---|---|
| 1 | Domain | `packages/backend/src/domain` | ✅ | A couple of small fixes, done |
| 2 | Application | `packages/backend/src/application` | ✅ | A couple of small fixes, done |
| 3 | Infrastructure | `packages/backend/src/infrastructure`, migrations included | ✅ | A couple of small fixes, done |
| 4 | http, worker and wiring | `packages/backend/src/{http,worker}`, `composition.ts`, `config.ts` | ✅ | A couple of small fixes, done |
| 5 | Contracts | `packages/contracts`, and how it lines up with the domain and http | ✅ | Worth a round, done |
| 6 | Web library | `apps/web/src/lib` (api-client, components, stores) | ✅ | Worth a round, done |
| 7 | Web routes | `apps/web/src/routes`, hooks, the service worker | ⬜ | |
| 8 | Tests | unit, integration and e2e helpers (duplication only, not coverage) | ⬜ | |

**Carried forward** (both settled in round 5):

- To round 5: the web forms repeat the domain's text limits as literals (`maxlength={2000}`, `{80}`, `{50}` in `CareForm`, `DogForm`, `CueSheet`, `EventSheet` and `QuickLogSheet`, and `DURATION_MAX = 240` in `training-log/labels.ts`), about 15 numbers that can drift from the domain. The domain may not import `contracts`, so the fix is a design question for that round.
- To round 5: `apps/web/src/lib/history/filters.ts` builds its own list of History's types, the `care-` prefix included, which `application/history/history.ts` also defines as `HISTORY_TYPES`.

## 3. Round 1: Domain

**Verdict:** a couple of small fixes. The layer is in good shape: its imports are clean, `Result` and `ValidationError` are used the same way throughout, and nothing is over-abstracted.

**Fixed:**

| Finding | Problem | Fix |
|---|---|---|
| The 5-minute time-step check in three places | `care-task.ts`, `planner.ts` (`timeProblem`) and `reminders.ts` (`isCareTime`, with a literal `% 5`); the message was typed out again in `application/reminders/reminders.ts`. Changing the step would leave the care reminder time on the old one. | `planner.ts` exports `timeProblem`; the care task and `isCareTime` use it, and the application's message reads `TIME_STEP_MIN`. |
| "Already happened, within a year" copied between the event and the log | `behaviour-event.ts` and `session-log.ts` had the same two checks (and a second spelling of a day in ms); the event borrowed the log's constants to stay in step. | `pastProblem(at, now)` in `session-log.ts`, beside its limits, used by both. |
| Optional text in an update, written three times | Events, logs and care tasks each had "undefined keeps it, null or blank clears it, too long is a field error". | `patchText` in `name.ts`. Cues and dogs have no null-clears case and keep their simpler code. |
| `careWhen` worked out the weekday itself | `reminders.ts` repeated `calendar.weekday()` with `(getUTCDay() + 6) % 7`. | Uses `weekday()`. |
| Dead or misplaced code | `runsOnOrAfter` (`planner.ts`) was used nowhere. `dog.ts` re-exported `isPlainDate`/`PlainDate` from `calendar.ts` for two tests only, and `isPlainDate`'s tests lived in `dog.test.ts`. `name.ts` had the same unsafe-character regex twice. | Removed `runsOnOrAfter` and the re-export; the tests import from `calendar.ts` and `isPlainDate`'s tests moved to `calendar.test.ts`; the regex is one constant. |

**Taste, left alone:**

- Five one-line `list.includes(value as T)` guards (`isCategory`, `isCareCategory`, `isOneOf`, `isCareLead`, `isTrainingLead`), each clear on its own.
- `checkSchedule` returns `{ ok, fields }` rather than `Result<_, ValidationError>` like the `clean*` functions.
- Limit constants (`CUE_TEXT_MAX`, `TRIGGER_MAX` and others) exported but used only in their own file.
- `labelKey` (`cue.ts`) repeats `cleanName`'s whitespace normalisation, deliberately, as a comparison key.

## 4. Round 2: Application

**Verdict:** a couple of small fixes. The use cases share one shape (find in the household, check the version, clean, write, log, return a view) and the ports are consistent; what drifted was small helpers copied into each feature.

**Fixed:**

| Finding | Problem | Fix |
|---|---|---|
| The "who changed it" name lookup in six places | Cues, events, logs, the planner, care tasks and invitations each looked people up and fell back to `FORMER_MEMBER`, which lived in `cues.ts`; invitations typed the text out again. | `application/names.ts`: `FORMER_MEMBER` and `namesOf(users, ids)`, which skips the lookup when there's nobody to name. The household's member list drops unknown people instead, and stays as it was. |
| "One of your current dogs" in four places | `currentDog` was identical in events and care tasks, and the planner and the log wrote the same check inline, each with its own "Choose one of your dogs." | `application/dogs/current-dog.ts`: `currentDog` and `CHOOSE_DOG`, also used for History's dog filter message. |
| Midnight on the household's clocks defined four times | `MIDNIGHT` in history, the planner and the log, and `'00:00'` in the domain's `careSubjectAt`, always to turn a day into instants. | `startOfDay(date, timeZone)` in `domain/calendar.ts`. |
| `PlannerContext` lived in the planner | Care, the journal, History, Today, logs, dogs and four http handlers imported it from `planner.ts`, suggesting a dependency that isn't there. | Moved to `auth/auth.ts` beside `MemberContext`. The journal, which never used the time zone, now takes `MemberContext`. |
| The photo limit typed out again | `dogs.ts` said "under 10 MB" beside `PHOTO_MAX_BYTES`. | The message reads the constant. |

**Taste, left alone:**

- Renaming `PlannerContext` while moving it: the move fixes the misleading import, a new name is preference.
- `type Invalid = ValidationError` in `planner.ts`, a file-local alias.
- `validationError` imported from `domain/errors.js` in some files and from the re-export in `application/errors.js` in others.
- `auth.ts` keeps its own `DAY_MS`.
- Two comment lines past the wrap width (`household.ts`, `planner.ts`).

## 5. Round 3: Infrastructure

**Verdict:** a couple of small fixes, all in the persistence base and its repositories. `HouseholdCollection` scopes every household read and write, and the other adapters (email, photos, push, logging, Sentry, rate limits, OIDC, tick auth, content) are small, consistent and careful about what reaches the logs. Deployed migrations are never edited, so they were read but not changed.

**Fixed:**

| Finding | Problem | Fix |
|---|---|---|
| About 21 `as never` casts on repository filters | `HouseholdCollection` typed filters as `Filter<Fields<T>>`, which has no `_id`, so every filter on an ID or a soft-delete flag was cast and went unchecked (events, logs, care tasks, plans). | Filters are `Filter<T>`; the casts are gone. The household still comes last in `#scope`, so a filter can't widen it. |
| An edit's `$set`/`$unset` built twice | `update` and `updateWhere` each turned `changes` into the update, and had to agree that undefined removes a field. | A private `#edit(changes)`. |
| The duplicate-key check in three places | `isDuplicateKey` in the household and reminder repositories, and `DUPLICATE_KEY = 11000` in the migration runner. | One `isDuplicateKey` in `mongo.ts`. |
| The stored document's type spelled out seven times | Dogs, cues, events, logs, care tasks and invitations each repeated `HouseholdDocument & Omit<…, 'id' \| 'householdId' \| 'version' \| 'createdAt' \| 'updatedAt'>`, a list that must match `HouseholdDocument`; the planner had it as a local `Stored<T>`. | `Stored<E>` exported from `household-collection.ts`. |

The four `as never` left in `household-collection.ts` are on update documents, where the driver's update types don't follow a generic `T`. Checked with the unit tests and `pnpm test:integration` (156 pass; the 11 skipped are the isolation suite's checks for operations a repository doesn't have).

**Taste, left alone:**

- Eight identical `toX` mappers: each is where an older schema is read (§3.5), so one per entity is deliberate.
- The `live` and `deleted` soft-delete filters, once each in events and logs.
- `e instanceof Error ? e.name : 'unknown'` in the Mailpit, Resend and push adapters.
- `sourceOf` in `auth-collections.ts` repeats the domain's email-local-part rule; it reads schema 1 and shouldn't follow later changes.
- A long comment line in `exercise-files.ts`.

## 6. Round 4: http, worker and wiring

**Verdict:** a couple of small fixes. Every handler has the same shape (membership, the contracts' schema, If-Match, the use case, the DTO through `respond`); the tick is well structured and safe to run repeatedly; `config.ts` checks every variable once at startup.

**Fixed:**

| Finding | Problem | Fix |
|---|---|---|
| The "no household, 404" guard in ten places | `isMember` and `noHousehold` were copied into eight handler files, and History and Today wrote the check inline. It's what keeps someone outside a household from its data (§4.4). | `http/member.ts`, used by all ten. |
| What counts as a write, in two places | `SAFE_METHODS` in `auth.ts` (the cross-site check) and `edge.ts` (the write budget), which must agree. | `isSafeMethod` in `edge.ts`, used by both. |
| `recordFailure`'s unused time | The port took `(id, at)` and the worker passed it, but neither the Mongo adapter nor the fake used it. | The parameter is gone. |
| Two imports from `auth.js` in four handlers | Left by round 2's move of `PlannerContext`. | Merged. |
| Stale or misplaced comments | `composition.ts` said later slices would add repositories, the push sender and the worker, which are all there; `signOut` in `http/auth.ts` had two stacked doc comments, of which only the second showed. | Rewritten and merged. |

Checked with the unit tests and `pnpm test:integration`.

**Taste, left alone:**

- `account.update` checks If-Match before the body; the other handlers parse the body first. Only which error wins when both are wrong differs.
- `config.ts` has its prod-only checks in three places, one of them not through `required`.
- The tick has `preferenceOf` and also an inline `?? defaultPreference(...)`.
- `composition.ts` and `createHttp` each make a planner; it holds no state.
- `sessionCookie` reads `Date.now()` rather than the clock.

## 7. Round 5: Contracts

**Verdict:** worth a round. The contracts themselves are consistent (response shapes, then shape-only inputs as `strictObject`, `etag` and `updatedBy` documented the same way); what needed work was the seam either side. The domain may not import `contracts`, so lists and numbers were held in two or three places with only one direction checked.

**Fixed:**

| Finding | Problem | Fix |
|---|---|---|
| The form limits typed out again in the web | About 16 numbers (names, notes, cue text, event and log fields, the duration stepper, times a day, household and display names) were literals in the forms, `DURATION_MAX` in `training-log/labels.ts` and `TIMES_MAX` in `planner/form.ts`. A changed domain limit would leave the form stopping too early or too late. | `limits` in `contracts/limits.ts`, read by every form. |
| Enums held by both the domain and the contracts | Outcome, mood, place, event and care categories, skill areas and the two reminder leads. The DTOs' `satisfies` caught a value only the domain had; nothing caught one only the contract had, which the web would offer and the backend refuse. | `http/contracts.test.ts` checks each pair is equal, in order, along with the limits; date precision and role, which the domain has only as types, are compared as types. |
| History's types built twice | `HISTORY_TYPES` in `application/history/history.ts`, and the web's own list and `HistoryType` in `lib/history/filters.ts`, `care-` prefix included. | `historyTypes` and `HistoryType` in `contracts/history.ts`, used by the web and checked against `HISTORY_TYPES` by the same test. The web's `CARE_KINDS` went with it, as `CARE_CATEGORIES` already gives the order. |
| An exercise reference written three times | `SessionLog.exercise`, `PlannedSession.exercise` and an inline type in `QuickLogSheet`. | `ExerciseRef` in `contracts/exercises.ts`. |

**Taste, left alone:**

- `date` and `time` input caps defined in both `planner.ts` and `care-tasks.ts`, and inline in `dogs.ts` and `history.ts`.
- `UpdateBehaviourEvent` is the same schema as `CreateBehaviourEvent`; the two names say what each is for.
- `Weekday` has no exported type, unlike the other schemas.
- `z.string().max(100)` for an ID, repeated across the inputs.
- The input caps (a dog name up to 500) sit far above the domain's limits; they're a ceiling against abuse, not the rule.

## 8. Round 6: Web library

**Verdict:** worth a round. The API client returns every outcome as a value and throws only on a broken contract; `reveal-errors`, the theme and the caching rules are small and tested; the label maps are `Record`s, so every value has a label. What drifted was small helpers copied across the forms, and a second copy of the date helpers.

**Fixed:**

| Finding | Problem | Fix |
|---|---|---|
| A problem's status read inline about 24 times | `x.error.kind === 'problem' ? x.error.problem.status : null` in 12 places and `… && … .status === 404` in a dozen more, across sheets, detail pages' loads and routes. They must agree that a gateway error has no status; two already said `0` where the rest said `null`. | `problemStatus(error)` in `api-client`, routes included. Where the problem's own fields are read next, the inline narrowing stays. |
| A failed save read twice | `careOutcomeOf` (`care/form.ts`) and `outcomeOf` (`planner/form.ts`) had the same 401, per-field 400 and fallback, and identical outcome unions. | `saveOutcomeOf(error, fieldOf)` and `SaveOutcome<F>` in `forms/save-outcome.ts`; each form keeps only its field mapping. |
| The household's today and a month's clamping, twice each | `todayIn` (`dogs/age.ts`, re-exported by `planner/dates.ts`) was `dayIn` in `cues/edited.ts`; `addMonths` (`care/labels.ts`) and `monthsAgo` (`dogs/age.ts`) clamped to a shorter month separately. | Both in `planner/dates.ts`; `monthsAgo` is `addMonths(today, -months)` and `editedWhen` uses `todayIn`. |
| Five choice lists typed beside their label maps | Event and care categories, outcomes, moods and places: the compiler forces a label for a new value, but nothing put it in the list the form offers. | Each list is `Object.keys` of its labels, as `skillAreas` already was. |
| "A dog no longer here" in nine places | Five cards and four detail pages, the web's counterpart of the backend's former-member name. | `dogNameOf(dog)` in `dogs/name.ts`. |
| Dead file | `lib/index.ts` was SvelteKit's placeholder, imported by nothing. | Removed. |

**Taste, left alone:**

- The save notices ("Couldn't save — check your connection.", "You've been signed out…") in about a dozen components, with deliberate differences in wording.
- The conflict flow (`conflicted`, `seeTheirs`, `overwrite`) in the cue, event and log sheets; it's tied into each sheet's state.
- `LogCard`, `EventCard` and `CareEntryCard` share their card markup.
- `madeWithKey` (`push/browser.ts`) exported but used only in its file.
- `planner/dates.ts` is the app's date module under a planner name.
