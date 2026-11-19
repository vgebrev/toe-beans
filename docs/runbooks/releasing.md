# Runbook: Releasing

How a change gets from develop to prod as a numbered release (architecture D40; backlog S14.8).
The whole repo shares one version, the same in every `package.json`. `CHANGELOG.md` holds the
notes, and each deploy to prod tags `vX.Y.Z` and publishes a GitHub Release. This file is public.

| | |
|---|---|
| Version | SemVer, `X.Y.Z` or a candidate `X.Y.Z-rc.N`. Major: people must act (sign in again, a lost setting). Minor: new features. Patch: fixes |
| Notes | `CHANGELOG.md`, under *Unreleased*, one line per change people would notice, as it lands |
| Tool | `pnpm release` (`tools/release`) |
| Gate | CI's *Version and release notes* job: on a PR into main, a version above every tag, with notes |
| Published by | The Deploy workflow's *Tag and publish the release* job, once prod is ready |

## 1. As work lands

Add a line under `## Unreleased` in `CHANGELOG.md`, under `### Added`, `### Changed`, `### Fixed`,
`### Removed` or `### Security`. Write it for someone using the app, not as a diary: what they'll
see, not how it was built. Internal work with nothing to notice (docs, runbooks, CI) needs no line.

## 2. Cutting a release

On develop, with Unreleased filled in:

| From | To | Command |
|---|---|---|
| `1.0.0-rc.1` | `1.0.0-rc.2` (another candidate) | `pnpm release rc` |
| `1.0.0-rc.2` | `1.0.0` (the release, notes from every rc) | `pnpm release final` |
| `1.0.0` | `1.0.1` / `1.1.0` / `2.0.0` | `pnpm release patch` / `minor` / `major` |
| `1.0.0` | `1.1.0-rc.1` (try it on prod first) | `pnpm release minor --rc` |
| any | a named version above it | `pnpm release 1.2.0` |

The tool changes nothing if it refuses (no notes, a version not above the current one). It sets
every `package.json` and turns Unreleased into `## X.Y.Z - date`. Then:

1. Review the diff, commit (`Release 1.0.0-rc.2`) and push develop.
2. Open the PR from develop to main. CI's *Version and release notes* job fails if the version
   isn't above the last tag or has no notes.
3. Merge, then approve the deploy. Once `/readyz` answers, the release job tags `vX.Y.Z` on the
   merge commit and publishes the GitHub Release: the changelog section, then the PRs and a
   compare link. A candidate is a pre-release; a final release becomes *Latest*.
4. More shows the version, and Sentry groups errors under it.

`pnpm release check` runs the CI job's checks locally (`--new` compares against the tags as well;
`git fetch --tags` first).

## 3. When it goes wrong

- **The deploy refuses the version** ("already released from …"): main got a commit without a
  bump. Run `pnpm release patch` (or `rc`) on develop and merge again.
- **The deploy failed after the build:** nothing is tagged. Fix it and run the Deploy workflow
  again on main, or merge a fix with a new version.
- **The release job failed after a good deploy:** prod runs the version, but nothing is tagged.
  Re-run the failed job from the workflow run. A re-run of the whole workflow on the same commit
  redeploys the same release and publishes it if it's missing.
- **A redeploy** of the same commit (Deploy workflow, *Run workflow* on main) is the same release:
  the tag already points there, and nothing new is published.
- **Rolling back:** deploy the earlier revision in Cloud Run (it keeps the old revisions), then fix
  forward with a new patch. Tags are never moved or reused.
- **A Dependabot security PR against main:** change its base to develop. It ships with the next
  release.

## 4. Setup (done once)

- main's ruleset requires the *Version and release notes* check, beside the others
  (*Settings → Rules → Rulesets*).
- The deploy's release job uses the workflow's own token with `contents: write`, so no secrets.
