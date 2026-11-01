# Toe Beans — UI and Interaction Design

**Version:** 0.7 (draft for iteration)
**Date:** 1 November 2026
**Status:** Proposed. Review-round decisions in §8 are accepted.
**Inputs:** `docs/requirements.md` v1.0, `docs/architecture.md` v0.11

**Changes in 0.7:** the logo landed (S0.9). The mark is now a **TB monogram** with four toe beans above it and a heart-shaped bean in the B, from the AI-assisted design board (Monogram Iteration B), replacing the placeholder paw. It was traced from the board and cleaned up rather than redrawn by hand; the variants are the brown-on-cream mark, a cream-on-brown app-icon tile (favicon and maskable) and a white badge. The wordmark uses Fredoka Bold to match the board (§6.4 Logo).

**Changes in 0.6:** S0.8 and S0.9 built the shell and brand. The colour table gains the tokens the build needed: `soft`, `input`, `warn`, `on-danger` and the outcome badge colours from the mock-ups, all contrast-tested (§6.4). Icons are drawn by our own `<Icon>` from the free Hugeicons data, because the `@hugeicons/svelte` component only draws after hydration; the free set has no dog, so a custom one stands in (§6.4). Bottom-bar labels are 14 px, not the mock-ups' 12 px, to meet the type minimum (§6.4). The theme mechanism is recorded (§6.4).

**Changes in 0.5:** S-1.2 push spike results (`architecture.md` §6.4). J7 gains a **Make reminders reliable** step with per-manufacturer battery instructions, and the test notification becomes a **delayed** test, because instant ones always arrive. Notification taps always open the installed app.

**Changes in 0.4:** review round 3. Nunito confirmed. The dark primary is softened to `#C98A4B`, the same tan as the light-theme accent. Hugeicons free (MIT) adopted. Mock-up layouts accepted for the MVP.

**Changes in 0.3:** review round 2. Nunito is the body font, the logo will be AI-assisted, and the theme is chosen per device (defaulting to the system setting). Added an icon library evaluation (Hugeicons preferred, Phosphor as the alternative) and a link to the mock-ups canvas.

**Changes in 0.2:** first review round.
- Care keeps its own tab, and Done sessions show who logged them.
- Reminders default to the session time.
- Delivery diagnostics UI is deferred.
- Brand identity added: paw-print logo, Beagle light theme, German Shepherd dark theme, playful accessible type (§6.4).

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
| Granted + subscribed | "Reminders are on for this device ({device label})". Lead-time settings: training defaults to **at the session time**; care tasks without a time remind at 08:00 on the day. A **Make reminders reliable** card (below) until the user marks it done. | *Test reminders*, *Turn off on this device* |
| Denied / revoked | "Notifications are blocked for Toe Beans" plus step-by-step Chrome/Android instructions | *Check again* |
| Subscription failed | "Couldn't register this device" | *Retry*. The failure is logged server-side; no diagnostics screen in Phase 1. |

**Make reminders reliable.** Without this, Samsung and Xiaomi phones dropped reminders a minute or two after locking (`architecture.md` §6.4). The card explains, in one sentence, that the phone's battery saver can stop reminders, and that the fix is a setting on **Chrome** (not Toe Beans). Then it shows the steps for the user's phone:

| Phone | Steps |
|---|---|
| Samsung | Settings → Apps → Chrome → Battery → **Unrestricted** |
| Xiaomi / Redmi / POCO | Settings → Apps → Manage apps → Chrome → Battery saver → **No restrictions** |
| Other Android | Settings → Apps → Chrome → Battery → **Unrestricted** / *Don't optimise* (wording varies) |

The manufacturer is preselected where Chrome reports the phone model (`navigator.userAgentData` high-entropy `model`), with a picker to change it. An *Open Chrome's settings* shortcut isn't possible from a web app, so the steps are text plus a screenshot per manufacturer. *Done* hides the card; it stays reachable from Settings → Notifications → *Reminder tips*.

**Test reminders** sends a push **3 minutes** later and asks the user to lock the phone and put it down. When it arrives, its tap opens a "Reminders are working" screen. A test that arrives instantly says nothing, because phones only start dropping pushes after a minute or two locked. If nothing arrives within 5 minutes the screen, next time it's opened, says "Didn't get it? Check the battery setting above" (the service worker reports the test's arrival to the server, as in the S-1.2 spike).

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

- Every dog gets an avatar (its required photo) and an auto-assigned accent colour from an accessible palette (light and dark variants), used for the avatar fallback, the switcher chip and calendar dots. Cards don't get coloured side borders.
- Name text always accompanies the colour.

---

## 6. Platform behaviours

### 6.1 Connectivity

- Detect connectivity with `navigator.onLine` plus failed-fetch heuristics.
- The service worker serves an offline shell and static exercise content when feasible (exercise text is non-sensitive). Household data is never cached.

### 6.2 Push notifications

- Ask for permission only after an explicit tap (J7), never on load.
- A tap always opens the item in the **installed app**, never a Chrome tab (`architecture.md` §6.2 step 3).
- Content: title "Training time: Recall basics", body "Ripley · 17:30", badge icon, `tag` per item so updates replace older ones. Care: "Coming up: Vaccination for Miso tomorrow".
- No notes or sensitive text in payloads.

### 6.3 Installation

- Capture `beforeinstallprompt` and offer *Install* in onboarding, in Notifications settings, and once as a dismissible Today banner.
- Show installed state in Settings.
- The manifest uses `display: standalone`, theme colours, maskable icons, `start_url: /`, and `shortcuts` for *Log training* and *Record event* (Android long-press on the icon).

### 6.4 Visual design

- **Toolkit:** Tailwind CSS with shadcn-svelte components (Bits UI primitives for accessible sheets, dialogs and menus), restyled entirely through the brand tokens below.
- **Motion:** subtle 150–200 ms transitions, respecting `prefers-reduced-motion`.
- **Mock-ups:** [Toe Beans mock-ups canvas](https://claude.ai/artifact/BAuRdwCcZ5ULVhbSDMjxVU) (private). It shows Today, the Quick log sheet (interactive) and Exercise detail in both themes, plus a brand sheet. Icons and the logo in the mock-ups are placeholders.

#### Icons

All icons go through one wrapper component (`<Icon name="…">`). That keeps the library swappable and enforces `aria-hidden` for decorative icons and `aria-label` for icon-only buttons.

| Library | Licence | Styles | Pet coverage | Fit |
|---|---|---|---|---|
| **Hugeicons** (free set) — ✅ **chosen** | MIT (free set, per the user in review round 3). Only the free data package is used, `@hugeicons/core-free-icons`, never `@hugeicons-pro/*`. `<Icon>` renders it itself (see below). | Free set: Stroke Rounded only (~4.6k–5.4k icons). Pro: 10 styles. | To check (dog, cat, paw, bone, leash, syringe, vet) | Rounded stroke suits Fredoka/Nunito. Free has no filled style for active states, so the active tab uses a tinted pill, as in the mock-ups. |
| Phosphor | MIT | 6 weights, including **Fill** and Duotone | Dog, Cat, PawPrint, Bone and more | Closest alternative. Fill weight gives clear active and selected states. |
| Lucide | ISC | Single stroke style | dog, cat, paw-print, bone | Solid, but plainer and more geometric than the brand. |
| Tabler | MIT | Outline, plus a partial filled set | Good | Large set, but sharper corners. |
| Material Symbols Rounded | Apache 2.0 | Variable (fill, weight, grade) | Pets, cruelty-free | Most Android-native, least distinctive. |

**Decision (review round 3):** **Hugeicons free (Stroke Rounded)**. Phosphor stays the fallback if the free set has gaps that custom icons can't cover. Don't mix libraries; any gap gets a custom icon drawn to the same 24 px grid and 1.5 px rounded stroke.

**As built (S0.9):** the icons are mapped by meaning in `apps/web/src/lib/components/icon/icons.ts` (nav tabs, actions, More entries, theme choices, and paw, bone, treat, walk, vaccination, medication, vet). `@hugeicons/svelte` was dropped: its component draws the icon only after hydration, so server-rendered pages showed empty icons; `<Icon>` renders the same data on the server. Gaps in the free set: **dog** (a custom floppy-eared head; the logo has no dog to draw it from) and **leash** (*walk*, a walking figure, stands in). There's no cat in the MVP, so it isn't mapped.

#### Logo

- **Mark:** a rounded **TB monogram**, with four toe beans above it (the letters stand in for the main pad) and a heart-shaped bean inside the B, set off by a cream gap. Chunky shapes, no outlines thinner than 2 px at 48 px.
- **Wordmark:** "Toe Beans" in the display font (Fredoka Bold) beside the mark.
- **Variants needed:**
  - Full colour: brown letters with tan beans (light), cream letters with tan beans (dark).
  - **Maskable app icon:** paw centred within the 80% safe zone on a solid background.
  - **Monochrome badge:** white silhouette on transparent, which Android requires for the notification badge.
  - Favicon.
- **Production:** **AI-assisted** design, cleaned up into SVG, with the PNG sizes exported from it. Check that the final mark doesn't resemble an existing trademark. Logo work is a backlog item (S0.9).
- **As built (S0.9):** traced from the board's primary light logo, then cleaned up: the toes are fitted ellipses, and the letters and heart are smoothed curves (about 2 KB of path data). That departs from the earlier "no raster traces" aim; a hand redraw stays open if the traced curves ever show at large sizes. The geometry lives in `apps/web/src/lib/assets/brand/mark.ts`, which `Logo.svelte` draws and the brand SVGs embed (a test checks they match). In the UI the letters use `primary` (light) or `text` (dark) and the beans `accent`. The favicon is the app-icon tile, so it reads on light and dark browser tabs alike. The tile's light tan (`#F2B461`) is used only in icons.

#### Colour themes

Light mode is **Beagle**: white coat with tan and brown patches. Dark mode is **German Shepherd**: black saddle with tan.

**Theme selection is per device.** It defaults to *Match system* (`prefers-color-scheme`), with a Settings override (*System / Light / Dark*) stored in `localStorage`. An inline script in `app.html` applies the stored choice before first paint to avoid a flash of the wrong theme. If storage is unavailable it falls back to the system setting. The choice isn't synced to the user's account. All values are draft. The contrast ratios below are calculated (WCAG 2.x) and must be re-checked by an automated token-contrast test whenever a value changes.

| Token | Beagle (light) | Ratio | German Shepherd (dark) | Ratio |
|---|---|---|---|---|
| `bg` | `#FFFBF5` warm white | — | `#141110` near-black | — |
| `surface` (cards, sheets) | `#FFFFFF` | — | `#211C18` | — |
| `text` | `#2B1D14` dark brown | 15.8 on bg | `#F3EADF` cream | 15.8 on bg, 14.2 on surface |
| `text-muted` | `#6B5444` | 6.8 on bg | `#B5A493` | 7.8 on bg |
| `primary` (buttons, links) | `#8A4B1F` saddle brown | 6.6 on bg | `#C98A4B` soft tan (softened in review round 3, from `#D9944F`) | 6.5 on bg, 5.8 on surface, 5.2 on soft |
| `on-primary` (button text) | `#FFFFFF` | 6.8 on primary | `#1A110A` | 6.4 on primary |
| `accent` (decorative only: illustrations, highlights) | `#C98A4B` tan | 2.8, **not for text or essential UI** | `#C98A4B` (same as primary) | — |
| `border` | `#E6D8C6` | decorative | `#3A312A` | decorative |
| `soft` (tinted fills: active tab pill, secondary buttons) | `#F6EBDD` | text 13.9, primary 5.7 | `#2C2520` | text 12.7, primary 5.2 |
| `input` (form control outlines) | `#94806F` | 3.7 on bg (non-text, ≥ 3) | `#857465` | 4.2 on bg, 3.8 on surface |
| `warn` (attention text, e.g. Overdue) | `#8A5A00` | 5.8 on bg | `#F2C46B` | 11.5 on bg |
| `danger` (destructive only) | `#B3261E` (white text 6.5) | 6.3 on bg | `#F2867D` (`on-danger` `#1A110A`, 7.5) | 7.6 on bg |

**Outcome badges** follow the kind-tone principle. Only destructive actions use red.

| Outcome | Badge style |
|---|---|
| Successful | Green tint |
| Partially successful | Amber tint |
| Not yet successful | Soft blue tint, never red |
| Not assessed | Neutral grey, outlined |

Each badge shows an icon plus a text label. Badge colours (from the mock-ups, label on tint): Successful `#1E5B2E` on `#E3F2E6` (7.0) / `#8FD3A0` on `#1D3324` (7.7); Partially `#6E4A00` on `#FCEFD6` (7.0) / `#F2C46B` on `#3A2E14` (8.2); Not yet `#1F4E79` on `#E4EEF8` (7.4) / `#9CC4EC` on `#1B2A3A` (8.0); Not assessed: `text-muted` label, outline `#CDBFAE` / `#5A4D42`. The dog accent palette (§5.5) is still to define: about 6 colours, each with a light and a dark variant, distinguishable from each other and from `primary` (S3).

**As built (S0.9):** the tokens live in `apps/web/src/lib/theme/tokens.ts`, and `app.css` declares each once as `light-dark(<Beagle>, <German Shepherd>)`. With no override, `color-scheme: light dark` follows the system setting live. An override sets `data-theme` on `<html>`, which pins `color-scheme`; the inline script in `app.html` applies a stored override before first paint and also sets the `theme-color` metas, so Android's status bar matches. A unit test fails if `app.css` drifts from `tokens.ts` or any used pairing drops below AA, and an e2e test checks the override with the app's scripts blocked. The switch is on More → Appearance.

#### Typography

The type pairs a playful display face with a highly legible body face. Both are open-source (SIL OFL), self-hosted as variable WOFF2 through `@fontsource-variable/*`, subset to Latin, `font-display: swap`, and precached by the service worker. That's an estimated ~60–100 KB total. Self-hosting also keeps the CSP at `'self'`.

| Role | Proposed | Why | Alternatives |
|---|---|---|---|
| Display: wordmark, page titles, empty states (≥ 20 px) | **Fredoka** | Rounded and bouncy, matches the paw-print mark; legible at heading sizes | Baloo 2, Grandstander |
| Body and UI (all text < 20 px) | **Nunito** — *confirmed (review round 3)* | Friendly rounded terminals with open, clear letterforms; works at 14–16 px | Atkinson Hyperlegible Next (maximum legibility, less playful), Lexend |

- Base size 16 px, line-height 1.5, minimum 14 px for secondary text. The display font is never used for body text or form controls. The bottom-bar labels follow the 14 px minimum (the mock-ups used 12 px).
- As built: `@fontsource-variable/fredoka` and `@fontsource-variable/nunito`, imported whole. Each subset has a `unicode-range`, so phones download only the subsets the text needs (Latin in practice); S13's precache should take only the Latin files.
- **Nunito is confirmed** after a side-by-side comparison with Atkinson Hyperlegible Next in the mock-ups. The S13.4 accessibility pass still checks it at 200% font scaling on a real phone. Swapping fonts would be a single token change.

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

## 8. UI decisions and open questions

### Resolved in review round 1

| # | Question | Decision |
|---|---|---|
| 1 | Care as its own tab? | **Yes**, its own tab (§2.1). |
| 2 | Show who logged a Done session? | **Yes**: "· by {name}" on Today and History. |
| 3 | Default reminder lead time | **At the session time.** Reminders are a general nudge, not a strict schedule. |
| 4 | Delivery diagnostics screen | **Deferred** beyond Phase 1. Diagnostics go through server logs. |
| 5 | Brand and visual identity | **Yes.** Paw-print logo, Beagle (light) and German Shepherd (dark) themes, playful accessible fonts (§6.4). |

### Resolved in review round 2

| # | Question | Decision |
|---|---|---|
| 6 | Body font | **Nunito**, confirmed in review round 3 after comparing it with Atkinson Hyperlegible Next in the mock-ups. |
| 7 | Logo production | **AI-assisted**, cleaned up into SVG. |
| 8 | Theme override scope | **Per device.** Defaults to the system setting, stored in `localStorage`. |

### Resolved in review round 3

| # | Question | Decision |
|---|---|---|
| 9 | Icon library | **Hugeicons free** (Stroke Rounded, MIT). |
| 10 | Mock-up layouts (Today, Quick log, Exercise detail, badges) | **Accepted for the MVP.** |
| 11 | Dark primary colour | **`#C98A4B`**, softer than `#D9944F` and still AA (≥ 5.2:1 on every dark background). |

### Open

None at present.
