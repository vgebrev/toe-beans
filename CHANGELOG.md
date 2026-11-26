# Changelog

What changed in each release of Toe Beans, for the people using it. One version covers the
whole repo (architecture D40). Add a line under **Unreleased** when a change lands, under
`### Added`, `### Changed`, `### Fixed`, `### Removed` or `### Security`. `pnpm release` turns
Unreleased into the next version, and the deploy publishes that section as the GitHub Release
(`docs/runbooks/releasing.md`). Versions follow [SemVer](https://semver.org): a major for a
change people must act on (signing in again, a lost setting), a minor for new features, a patch
for fixes. Candidates (`-rc.N`) go to prod for the owner to try before the release.

## Unreleased

## 1.4.2 - 2026-11-26

### Fixed

- Toe Beans no longer drops out for a few seconds every few minutes with *Can't reach Toe
  Beans* or a "can't reach its server" page.
- The back link on the terms and privacy policy now goes back where you came from, such as More,
  rather than to Today. (1.4.1's notes listed this, but it shipped here.)

## 1.4.1 - 2026-11-26

### Changed

- The page about Toe Beans now explains it as plan, track and discover, and shows in light or
  dark to match the theme you chose in the app on that phone.

### Fixed

- The back link on the terms and privacy policy now goes back where you came from, such as More,
  rather than to Today, and to the page about Toe Beans when you're signed out, rather than to
  sign-in.
- The paw-print beans behind the phone on the page about Toe Beans are no longer cut off, and the
  page no longer scrolls sideways on a phone.

## 1.4.0 - 2026-11-25

### Added

- A link to toebeans.co.za now shows a preview with the app, in chats and on social media, and
  search engines find the landing page, the terms and the privacy policy, but none of your
  household's pages.

## 1.3.0 - 2026-11-25

### Added

- toebeans.co.za now has a page about Toe Beans for anyone who isn't signed in: what it does,
  how it looks, and a way to get started. The installed app still opens straight on Today, and
  the sign-in page links to it as *About Toe Beans*.

## 1.2.0 - 2026-11-25

### Added

- Owners can download a copy of their household's data from More → Your data: a ZIP file with
  every record in JSON, a note on reading it, and the dogs' photos.
- Three new exercises: *Stop-go on walks* for a puppy that pulls on the lead, *Car rides,
  calmly* for a puppy that's anxious or sick in the car, and *A first Stay*.

## 1.1.2 - 2026-11-25

### Security

- Toe Beans' pages now tell the network between you and the server not to keep a copy, so nobody
  else could ever be shown a page meant for you.

## 1.1.1 - 2026-11-24

### Security

- Toe Beans' server now only answers requests that come through toebeans.co.za, so nobody can
  slow it down, run up its costs or get it paused by calling the server directly.

## 1.1.0 - 2026-11-24

### Added

- Toe Beans now asks you to confirm you're 18 or older and accept the terms of service before you
  start. If you already use it, you're asked once the next time you open it, and again only when
  the terms change.
- If Toe Beans ever has to be stopped to keep its costs in check, it shows *Toe Beans is paused*
  instead of saying it can't be reached. Your records stay safe while it's paused.

### Security

- Fixed a flaw at Toe Beans' edge that could give away a key its servers share. The key is
  replaced.

### Changed

- The terms of service say how to tell us about content that infringes your rights.
- The sign-in page now loads its font from Toe Beans itself, so Google no longer sees your
  device's address when you open it. The privacy policy no longer lists Google Fonts.
- The privacy policy now says that your browser tells Cloudflare when a request to Toe Beans fails,
  so it can find network problems.
- A care task you mark done or cancel stays on Today for the rest of the day, under *Done* or
  *Skipped*, instead of disappearing straight away.
- When you mark a care task done, you can plan the next one for tomorrow or next week, handy
  for a weekly puppy school class. *In 3 months* is gone; *Pick a date* still covers it.

## 1.1.0-rc.1 - 2026-11-24

### Added

- Toe Beans now asks you to confirm you're 18 or older and accept the terms of service before you
  start. If you already use it, you're asked once the next time you open it, and again only when
  the terms change.
- If Toe Beans ever has to be stopped to keep its costs in check, it shows *Toe Beans is paused*
  instead of saying it can't be reached. Your records stay safe while it's paused.

### Security

- Fixed a flaw at Toe Beans' edge that could give away a key its servers share. The key is
  replaced.

### Changed

- The terms of service say how to tell us about content that infringes your rights.
- The sign-in page now loads its font from Toe Beans itself, so Google no longer sees your
  device's address when you open it. The privacy policy no longer lists Google Fonts.
- The privacy policy now says that your browser tells Cloudflare when a request to Toe Beans fails,
  so it can find network problems.

- A care task you mark done or cancel stays on Today for the rest of the day, under *Done* or
  *Skipped*, instead of disappearing straight away.
- When you mark a care task done, you can plan the next one for tomorrow or next week, handy
  for a weekly puppy school class. *In 3 months* is gone; *Pick a date* still covers it.

## 1.0.5 - 2026-11-23

### Security

- Leaving a household, or deleting your account while others stay in it, now stops the invites
  you sent, as being removed already did. Your household can invite anyone it still wants
  again.

### Fixed

- Saving a change is no longer at risk of a false *Someone else changed this* when the response
  was compressed on its way to your phone.

## 1.0.4 - 2026-11-21

### Fixed

- A new version's offline files reach your phone within minutes of opening Toe Beans, instead
  of up to a day later.
- With no connection, opening Toe Beans goes straight to *Can't reach Toe Beans* rather than a
  loading screen that keeps flashing.

## 1.0.3 - 2026-11-20

### Fixed

- Toe Beans no longer gets stuck on *Connecting to Toe Beans…* when it opens: it carries on to
  your page as soon as it gets through, and says it can't reach Toe Beans rather than waiting
  forever.

### Added

- More shows the version of the app files saved on your phone next to the app's version.

## 1.0.2 - 2026-11-20

### Added

- If Toe Beans is still loading after 20 seconds, it offers *Refresh*, so you're never left
  waiting on the loading screen.

## 1.0.1 - 2026-11-20

### Changed

- When Toe Beans can't be reached, the app now says *Can't reach Toe Beans* whether your
  connection or the app is down, instead of sometimes saying you're offline when you weren't.
- A slow start says *Connecting to Toe Beans…* instead of *Waking up Toe Beans…*.
- Signing out no longer turns reminders off. They pause while you're signed out and come back
  by themselves when you sign in on that device again. Someone else signing in on it doesn't
  get your reminders, and gets their own only once they turn them on.

### Fixed

- The devices listed under *Notifications* stay up to date. Reinstalling the app replaces its
  old entry instead of adding a second one, and a device that's uninstalled or no longer used
  drops off the list by itself.
- After an update, an app left open on the previous version keeps loading its pages until you
  refresh, instead of failing to find their files.

## 1.0.0 - 2026-11-19

### Added

- The first release of Toe Beans, the P0 MVP, live at toebeans.co.za since 17 Nov 2026.
- Sign in with Google or email, and a household shared by its caregivers, joined by email
  invitation or an expiring link.
- Dogs with profile photos, each with its own training and care history.
- A curated, reward-based exercise library and the household's shared cue dictionary.
- A training planner with one-off and weekly sessions, a quick training log whose outcome
  defaults to *Not assessed*, and a behaviour journal.
- Today, History and a care calendar for vaccinations, deworming and other care.
- Push reminders that arrive with the app closed, and opening one goes to the item.
- An installable app with connection and save status, and a banner offering the new version
  after a deploy.
- Deleting your account or household from More, and public privacy policy and terms pages.
- The version on More, and a GitHub Release for each deploy.

### Fixed

- A sign-in finished in another browser, such as from an email's verification link, starts
  again in this browser instead of failing.
- Tapping a reminder while Toe Beans was asleep could show a blank page saying *Loading…*
  until you pulled to refresh. It now wakes up and opens the reminder's item.

## 1.0.0-rc.2 - 2026-11-19

### Fixed

- Tapping a reminder while Toe Beans was asleep could show a blank page saying *Loading…*
  until you pulled to refresh. It now wakes up and opens the reminder's item.

## 1.0.0-rc.1 - 2026-11-19

### Added

- The first release candidate of the P0 MVP, live at toebeans.co.za since 17 Nov 2026.
- Sign in with Google or email, and a household shared by its caregivers, joined by email
  invitation or an expiring link.
- Dogs with profile photos, each with its own training and care history.
- A curated, reward-based exercise library and the household's shared cue dictionary.
- A training planner with one-off and weekly sessions, a quick training log whose outcome
  defaults to *Not assessed*, and a behaviour journal.
- Today, History and a care calendar for vaccinations, deworming and other care.
- Push reminders that arrive with the app closed, and opening one goes to the item.
- An installable app with connection and save status, and a banner offering the new version
  after a deploy.
- Deleting your account or household from More, and public privacy policy and terms pages.
- The version on More, and a GitHub Release for each deploy.

### Fixed

- A sign-in finished in another browser, such as from an email's verification link, starts
  again in this browser instead of failing.
