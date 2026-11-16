# Toe Beans — Code Review

**Version:** 0.1
**Date:** 16 November 2026
**Status:** Round 1 (domain) done; rounds 2–8 to do (S15.3).
**Inputs:** `docs/architecture.md` v1.22 (§4.2 layering), the code at commit `d7dd854` (`develop`)

**Changes in 0.1:** the review's split into eight rounds, one layer or boundary each, and round 1 (domain) with its fixes.

---

## 1. How the review works

One layer or boundary per round, in dependency order, so a fix in a lower layer is settled before the layers that use it are read. Each round looks for dead or unused code, overly complex code, unnecessary abstractions, and duplication that deserves an abstraction (three or more copies, or logic that must stay in sync), aiming at a consistent architecture and implementation.

A change qualifies only if it fixes something concrete (genuinely dead code, state or logic defined in more than one place that can drift, a deprecated API, an inconsistency that could mislead a reader, or a real readability cost) and a fresh reviewer wouldn't argue to undo it. Rephrasing, reordering and swapping one reasonable style for another don't qualify; they're listed as taste, at most five a round, and left alone. "Nothing worth doing" is a valid result. Behaviour doesn't change (S15.3).

Each round reports first, the owner decides, and only then are the fixes made.

## 2. Rounds

| # | Layer or boundary | Scope | Status | Verdict |
|---|---|---|---|---|
| 1 | Domain | `packages/backend/src/domain` | ✅ | A couple of small fixes, done |
| 2 | Application | `packages/backend/src/application` | ⬜ | |
| 3 | Infrastructure | `packages/backend/src/infrastructure`, migrations included | ⬜ | |
| 4 | http, worker and wiring | `packages/backend/src/{http,worker}`, `composition.ts`, `config.ts` | ⬜ | |
| 5 | Contracts | `packages/contracts`, and how it lines up with the domain and http | ⬜ | |
| 6 | Web library | `apps/web/src/lib` (api-client, components, stores) | ⬜ | |
| 7 | Web routes | `apps/web/src/routes`, hooks, the service worker | ⬜ | |
| 8 | Tests | unit, integration and e2e helpers (duplication only, not coverage) | ⬜ | |

**Carried forward:**

- To round 5: the web forms repeat the domain's text limits as literals (`maxlength={2000}`, `{80}`, `{50}` in `CareForm`, `DogForm`, `CueSheet`, `EventSheet` and `QuickLogSheet`, and `DURATION_MAX = 240` in `training-log/labels.ts`), about 15 numbers that can drift from the domain. The domain may not import `contracts`, so the fix is a design question for that round.

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
