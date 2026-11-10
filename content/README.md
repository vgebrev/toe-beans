# Exercise content

The starter exercise library (FR-03), as content rather than data: one YAML file per exercise in
`exercises/`, named after its `id`, and the research behind it in `sources/`. The pipeline,
the safety gate and versioning are in `docs/architecture.md` §3.8.

## Fields

| Field | Required | Notes |
|---|---|---|
| `id` | yes | kebab-case slug, the same as the file name. Logs keep it: never rename a shipped one. |
| `contentVersion` | yes | starts at 1. Bump it on any substantive edit (not typo fixes). |
| `title` | yes | up to 80 characters |
| `skillArea` | yes | `name-recognition`, `recall`, `toileting`, `greetings`, `settling`, `doorbell`, `barking`, `loose-leash` or `cats` |
| `goal`, `setup`, `successCriteria`, `ifStruggling` | yes | plain text; a blank line starts a new paragraph |
| `steps` | yes | 1–15 items |
| `suggestedDurationMin` | yes | whole minutes, 1–60 |
| `safetyNotes` | no | when to stop, and when to see a vet or a qualified trainer (NFR-14) |
| `sources` | yes | at least one `{ title, url, kind: article \| video }`, `https` only. Shown as *Further reading*. |
| `reviewedBy`, `reviewedAt` | to ship | set together by the human reviewer (`reviewedAt` as `YYYY-MM-DD`) |
| `reviewedTerms` | no | flagged terms the reviewer read in context and kept (below) |

## Writing

Original wording only: synthesise the sources, never copy an article or transcript. Reward-based,
gradual, short sessions, and always an easier step in *If your puppy struggles* (NFR-14).

## Review and the gate

`pnpm content:check` (also part of `pnpm test`, so CI runs it) fails when:

- a file breaks the format above;
- an exercise has no `reviewedBy`/`reviewedAt`;
- the text uses a term that often signals an aversive method (`FLAGGED_TERMS` in
  `packages/backend/src/domain/exercise.ts`: "correct", "punish", "alpha", "dominance", "leash
  pop", "scruff", aversive collars, "spray bottle", "shout", "scold" and others). Reword it, or,
  if it's fine in context ("not the right spot" can't always replace it), list the term in
  `reviewedTerms`;
- a skill area has no exercise.

A local server still starts with these problems, logging each, and shows unreviewed exercises
with a *Draft* badge so they can be read in the app while reviewing. A prod server refuses to
start.
