# Changelog

What changed in each release of Toe Beans, for the people using it. One version covers the
whole repo (architecture D40). Add a line under **Unreleased** when a change lands, under
`### Added`, `### Changed`, `### Fixed`, `### Removed` or `### Security`. `pnpm release` turns
Unreleased into the next version, and the deploy publishes that section as the GitHub Release
(`docs/runbooks/releasing.md`). Versions follow [SemVer](https://semver.org): a major for a
change people must act on (signing in again, a lost setting), a minor for new features, a patch
for fixes. Candidates (`-rc.N`) go to prod for the owner to try before the release.

## Unreleased

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
