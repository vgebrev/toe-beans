# Toe Beans — UI and Interaction Design

**Version:** 0.1 (draft for iteration)
**Date:** 25 October 2026
**Status:** Proposed
**Inputs:** `docs/requirements.md` v1.0, `docs/architecture.md` v0.1

This document covers user journeys, information architecture, screen layouts and interaction conventions. The design target is an **installed PWA in Chrome on Android**, roughly 360–412 dp wide (Galaxy S23 FE, Redmi Note 12 Pro), used one-handed, often mid-training with treats in the other hand.

---

## 1. Design principles

1. **Answer the three questions:** *What should we do today?* (Today), *How is our puppy progressing?* (History, P1 Progress), *What should we work on next?* (Plan, Library).
2. **Thumb-first.** Primary actions sit in the bottom half of the screen. Touch targets are at least 48 × 48 dp. Use bottom sheets rather than centred dialogs.
3. **Log in under 30 seconds** (FR-07). One tap to open, sensible defaults, everything optional except the dog and the exercise.
4. **Practice is not performance.** The UI never implies that logging means success. `Not assessed` is the pre-selected, neutral-styled default. It is never coloured as a failure.
5. **Always know which dog.** Every session, event, care item and notification shows the dog's avatar and name. Colour is supplementary, never the only signal.
6. **Honest state.** Saving, saved, failed, offline, notifications blocked: always visible, never optimistic about persistence (NFR-04).
7. **Kind tone.** Encouraging, reward-based language. Struggling is normal ("Not yet" rather than "Failed"), and the app points to a vet or trainer when something is concerning (NFR-14).

---

## 2. Information architecture

### 2.1 Primary navigation (bottom bar, 5 destinations)

| Tab | Purpose | Requirements |
|---|---|---|
| **Today** | Planned, overdue and done sessions for today; upcoming care; quick log | FR-06, FR-07 |
| **Plan** | Week view of planned sessions; schedule, reschedule, skip, cancel | FR-05 |
| **History** | Combined timeline of session logs and behaviour events, with filters | FR-08, FR-09 |
| **Care** | Upcoming and past care tasks per dog | FR-10 |
| **More** | Dogs, Exercise library, Cue dictionary, Household & invites, Notifications, Account | FR-01–04, FR-12 |

A **floating "+" button** on Today, Plan and History opens a chooser: *Log training*, *Record event*, *Add care task*, *Schedule session*.

### 2.2 Dog context

- The top app bar shows a **dog switcher**: avatar chips for each dog, plus **All dogs** when there's more than one.
- The selection filters Today, Plan, History and Care, and pre-fills new records. It persists per device in `localStorage`, a convenience only.
- With a single dog, the switcher collapses to that dog's avatar (it opens the dog profile).
- In **All dogs** mode every list item carries an avatar and name. Multi-dog items are never merged into one card (FR-06).

### 2.3 Routes (indicative)

```
/                       → Today
/plan?week=2026-W44
/history?dog=&type=&exercise=&from=&to=
/care
/sessions/:id           planned session detail (notification deep link target)
/logs/:id               session log detail / edit
/events/:id
/care/:id
/library, /library/:exerciseId
/cues
/dogs, /dogs/new, /dogs/:id
/household, /household/invites
/settings/notifications
/join/:token            invitation acceptance
/onboarding/*           first-run flow
```

---

## 3. User journeys

Each journey maps to a requirements acceptance scenario (§5 there).

### J1 — First run and onboarding (scenario 1)

1. **Welcome.** Short value statement. **Sign in** → IdP (Google or email).
2. **Create household:** name and time zone (detected from the device, editable).
3. **Add your dog:** photo first (camera or gallery, crop to a circle preview), then name, birth date or estimated age (toggle *I know the date* / *Approximate: months old*), adoption date, notes. A dog can't be saved without a photo. The UI explains why ("helps everyone see at a glance which dog an entry is for").
4. **Invite a caregiver** (skippable):
   - *Send email invite*, or *Share link* through the Android share sheet (`navigator.share`), with copy as the fallback.
   - Shows the link's expiry (default 7 days).
5. **Turn on reminders** (skippable). See J7.
6. **Install prompt** if not yet installed (§6.3). Then land on **Today**, with an empty state that suggests scheduling a first exercise from the library.

### J2 — Accepting an invitation (scenario 1)

`/join/:token` → if signed out: "You've been invited to join **{household}** to help care for **{dogs}**" → *Sign in to accept* → IdP → back to `/join/:token`.

- **Accept** → Today.
- **Error states** (all plain-language, no technical detail):
  - expired
  - revoked
  - already used
  - email mismatch ("This invite was sent to j•••@gmail.com. Sign in with that address.")
  - already a member

### J3 — Plan and practise (scenario 3)

1. Plan → **+ Schedule**. Pick the dog (pre-filled), the exercise (library picker with search and skill-area chips), the date and time, and repeat (*Never / Daily / Weekdays / Custom days*, with an end date).
2. The session appears on Plan and on Today on the day.
3. Caregiver B opens Today → taps the session card → **exercise instructions** (goal, setup, steps, duration, success criteria, *If your puppy struggles*). A sticky bottom button reads **Log practice**.
4. **Quick log sheet** (§5.2) → choose *Partially successful* → *Add details* → *Relaxed/confident*, *Garden* → **Save**.
5. Caregiver A sees the card as **Done** with the outcome after refreshing or navigating (NFR-13: no live updates).

### J4 — Ad-hoc log (scenario 3, the "not assessed" path)

FAB → **Log training** → exercise picker (*Recent* first, then *Planned today*, then the full library) → Quick log sheet with **Not assessed** pre-selected → **Save**. That's three taps after choosing the exercise.

### J5 — Record an unscheduled event (scenario 6)

FAB → **Record event**. Dog (pre-filled), category chips (*Barking, Cat interaction, Fear, Toileting accident, Visitor, Other*), when (defaults to now; quick chips *Now / 15 min ago / 1 h ago / Pick*), then optional *Trigger*, *How your puppy responded*, *Notes* → Save.

### J6 — Care admin (scenarios 5, 7)

Care → **+ Add**. Dog, category, title (pre-filled from the category, e.g. "Vaccination"), date with optional time, notes.

- The task shows in Care and in Today's *Coming up* section (within 7 days).
- **Mark complete** asks for the completion date (defaults to today). Reschedule and complete both re-plan reminders automatically. No user action is needed and the UI says nothing about it.
- The detail view shows the change history.

### J7 — Enable reminders (scenario 4)

Settings → Notifications (also offered during onboarding and via a Today banner if not set). It's a **state machine screen** that shows exactly one of these states:

| State | What the user sees | Action |
|---|---|---|
| Unsupported browser | "This browser can't show reminders. Use Chrome on Android." | — |
| Not installed (Chrome, browser tab) | "Install Toe Beans for the most reliable reminders" | *Install* (or instructions) |
| Permission not yet asked | Explanation of what will be sent and that times are approximate | **Turn on reminders**. Requests permission *only* on this tap. |
| Granted + subscribed | "Reminders are on for this device ({device label})". Lead-time settings. | *Send test notification*, *Turn off on this device* |
| Denied / revoked | "Notifications are blocked for Toe Beans" plus step-by-step Chrome/Android instructions, with a device note for Xiaomi battery settings | *Check again* |
| Subscription failed | "Couldn't register this device" | *Retry*, link to diagnostics |

The screen also lists **other devices** of the current user, so they can be removed. A note always says: "Reminders can be delayed by your phone's battery or network settings. Today always shows what's due."

**Tapping a notification** opens `/sessions/:id` or `/care/:id`. If that item was cancelled meanwhile, the app shows "This session was cancelled" with a link to Today, never a blank page.

### J8 — Correct or delete (FR-09)

From any detail view: **Edit** (the same form as create), or overflow menu → **Delete** → bottom-sheet confirmation naming the item ("Delete Ripley's recall log from Tue 14:05?"). After deletion a snackbar offers **Undo** (soft delete, see architecture §5.3).

### J9 — Network failure (scenario 8)

See §6.1. The form keeps all input. The save button becomes **Retry**, and an inline banner explains the failure.

---

## 4. Screen layouts

Layout sketches are indicative and assume a ~400 dp width.

### 4.1 Today

```
┌──────────────────────────────────────┐
│ Today · Sat 25 Oct     (🐶R)(🐶M)(All)│  ← dog switcher
├──────────────────────────────────────┤
│ ⚠ Overdue (1)                         │
│ ┌──────────────────────────────────┐ │
│ │ 🐶 Ripley · Recall basics   08:00 │ │
│ │ Missed this morning     [ Log ]   │ │
│ └──────────────────────────────────┘ │
│ Planned                               │
│ ┌──────────────────────────────────┐ │
│ │ 🐶 Miso · Settle on mat     17:30 │ │
│ │ 5 min                   [ Log ]   │ │
│ └──────────────────────────────────┘ │
│ Done                                  │
│ ┌──────────────────────────────────┐ │
│ │ 🐶 Ripley · Name game  ✓ 07:10   │ │
│ │ Partially successful · by Alex    │ │
│ └──────────────────────────────────┘ │
│ Coming up (care)                      │
│  💉 Miso · Vaccination · Tue 28 Oct   │
│                                  (+)  │  ← FAB
├──────────────────────────────────────┤
│ Today  Plan  History  Care  More      │
└──────────────────────────────────────┘
```

- Order: Overdue → Planned (by time) → Done → Coming up. Skipped and cancelled sessions are collapsed under "Skipped (n)".
- Tapping a card opens the instructions. **[Log]** opens the quick log sheet directly.
- Long-press or overflow on a planned card: *Reschedule*, *Skip*, *Cancel*.

### 4.2 Quick log sheet (bottom sheet)

```
┌──────────────────────────────────────┐
│ ─────                                 │
│ Log practice                          │
│ 🐶 Ripley · Recall basics             │
│ How did it go?            (optional)  │
│ [Successful][Partly][Not yet][Not assessed✓]│
│ ▸ Add details                         │
│    Mood:  (Relaxed)(Uncertain)(Stressed)│
│    Where: (Home)(Garden)(Public)(Other)│
│    Duration: [ − 5 min + ]            │
│    Notes: [                       ]   │
│ When: Now ▾                           │
│            [        Save        ]     │
└──────────────────────────────────────┘
```

- The outcome control is a single-select segmented group. Labels are short on screen, with the full text for screen readers.
- `Stressed/overwhelmed` adds a gentle inline tip with a link to the exercise's *If your puppy struggles* section (NFR-14).
- *Add details* stays collapsed by default and remembers if a user prefers it expanded.

### 4.3 Plan (week)

The header shows a week strip (Mon–Sun) with dots for days that have sessions, and swipes or arrows to change week. Below it is the list for the selected day, grouped by time, plus a **Schedule** action. A recurring item shows ↻. Editing asks *This session only* or *This and following*.

### 4.4 History

- Filter chips at the top: dog, type (*Training / Events*), exercise, date range.
- Below that, a reverse-chronological timeline grouped by day. Training rows show the outcome badge (neutral for *Not assessed*). Event rows show the category icon.
- Loading uses cursor pagination with a "Load more" button, not infinite scroll, to keep it accessible.

### 4.5 Dog profile

- Large circular photo with a *Change photo* action, name, age (computed, with "approx." where estimated), time since adoption, notes.
- Sections: *Recent training*, *Recent events*, *Upcoming care*, each with "See all" linking to the filtered view.
- Archive is in the overflow menu, with confirmation.

### 4.6 Library and cues

- **Library:** skill-area chips, then exercise cards (title, goal, duration). The detail page holds the full instructions and a **Schedule** / **Log practice** pair at the bottom. It's read-only, and no "create exercise" is offered in Phase 1.
- **Cues:** a simple editable list (cue word, meaning, hand signal, reward convention), with tap-to-edit in a sheet. It shows "Last edited by Sam, 2 days ago" for shared awareness.

---

## 5. Component and interaction conventions

### 5.1 Forms

- Labels sit above fields and are always visible, never placeholder-only. Optional fields are marked "(optional)". Required fields are not marked with asterisks.
- Use native inputs where Android does them well (`type=date`, `type=time`, `inputmode`, `capture` for camera).
- Prefer chips and segmented controls over dropdowns for short option sets. Use dropdowns or searchable pickers for exercises.
- Validate on blur and on submit. Errors appear inline under the field with `aria-describedby`.
- The primary action is a full-width button at the bottom of sheets and forms, kept above the keyboard.

### 5.2 Feedback and status

| Situation | Convention |
|---|---|
| Saving | Button shows a spinner + "Saving…". Inputs stay editable but submit is disabled. |
| Saved | Sheet closes, then a snackbar "Saved" (with *Undo* for deletes). |
| Failed (network/5xx) | Sheet stays open with all input kept. Banner: "Couldn't save — check your connection." Button → **Retry**. |
| Conflict (412) | "Alex changed this a moment ago." Options: *See their version* / *Overwrite with mine* (the latter only for simple records like cues). |
| Validation (400/422) | Inline field errors from problem+json `errors`. |
| Forbidden / not found | A "Not found" page. There's never a hint that the item exists in another household. |
| Offline | Persistent top banner "You're offline. Changes can't be saved right now." Save buttons stay enabled but fail fast with the offline message. |
| Cold start (slow first load) | Skeleton screens immediately. After 3 s: "Waking up Toe Beans…" (NFR-09). |

**Draft retention:** open log, event and care forms keep their state in memory across failures. P1 decision: also persist unsent drafts to `sessionStorage` so that an accidental app kill doesn't lose them.

### 5.3 Destructive actions

All deletes, archives, invite revocations and "turn off reminders" go through a bottom-sheet confirmation naming the object. Never use `window.confirm`. Deletes of logs and events are undoable for 30 days (admin) or via a snackbar (immediately).

### 5.4 Dates and times

- Use the household time zone. Format with `Intl.DateTimeFormat` in the device locale.
- Today-relative wording: "Today 17:30", "Yesterday", "Tue 28 Oct", "in 3 days".
- Approximate ages: "about 4 months".

### 5.5 Dog identity

- Every dog gets an avatar (its required photo) and an auto-assigned accent colour from an accessible palette, used for the card's left border and calendar dots.
- Name text always accompanies the colour.

---

## 6. Platform behaviours

### 6.1 Connectivity

- Detect connectivity with `navigator.onLine` plus failed-fetch heuristics.
- The service worker serves an offline shell and static exercise content when feasible (exercise text is non-sensitive). Household data is never cached.

### 6.2 Push notifications

- Ask for permission only after an explicit tap (J7), never on load.
- Content: title "Training time: Recall basics", body "Ripley · 17:30", badge icon, `tag` per item so updates replace older ones. Care: "Coming up: Vaccination for Miso tomorrow".
- No notes or sensitive text in payloads.

### 6.3 Installation

- Capture `beforeinstallprompt` and offer *Install* in onboarding, in Notifications settings, and once as a dismissible Today banner.
- Show installed state in Settings.
- The manifest uses `display: standalone`, theme colours, maskable icons, `start_url: /`, and `shortcuts` for *Log training* and *Record event* (Android long-press on the icon).

### 6.4 Visual design

- **Toolkit:** Tailwind CSS with shadcn-svelte components (Bits UI primitives for accessible sheets, dialogs and menus).
- **Theme:** a warm, friendly palette (the name nods to paw pads, so soft pinks and browns with a calm neutral base). Light and dark themes follow the system.
- **Type:** system font stack (Roboto on Android) for speed. Base size 16 px, line-height 1.5.
- **Icons:** Lucide.
- **Motion:** subtle 150–200 ms transitions, respecting `prefers-reduced-motion`.

---

## 7. Accessibility

Target **WCAG 2.2 AA**:

- Colour contrast ≥ 4.5:1 for text.
- 48 dp targets, visible focus rings.
- Every icon button has an `aria-label`. Segmented controls use radio-group semantics. Sheets trap focus and return it on close.
- Status messages use `role="status"` / `aria-live="polite"`.
- Works at 200% font scaling (Android font size settings) without horizontal scrolling.
- Test with TalkBack on at least one target phone before release.

---

## 8. Open UI questions

1. Should the bottom bar have **Care** as its own tab, or fold it into Plan as a calendar with both types? (Proposed: own tab, since the cadence differs.)
2. Should a "Done" session on Today show *who* logged it? (Proposed: yes, since it's useful with two caregivers.)
3. Default reminder lead time: at the session time, or 10 minutes before?
4. Should the household owner see the delivery diagnostics screen in P0, or only through logs?
5. Should we add brand and visual identity work (logo, palette) as a backlog item, or use a simple placeholder for MVP?
