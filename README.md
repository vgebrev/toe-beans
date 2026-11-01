<p align="center">
  <img src="apps/web/src/lib/assets/brand/mark.svg" alt="Toe Beans logo" width="96">
</p>

<h1 align="center">Toe Beans</h1>

<p align="center">A puppy training and care companion for everyone who looks after the dog.</p>

---

Toe Beans is a mobile-first, installable web app (PWA) for planning short, reward-based training
sessions, recording how they went, and keeping puppy care (vaccinations, medication, vet visits)
in one place. Caregivers in one household share it across their phones, and it supports several
dogs from the start, each with its own history.

It aims to answer three questions: **What should we do today? How is our puppy progressing?
What should we work on next?**

> **Status:** early development. The foundations are in place (app shell, brand, CI, the
> container image, end-to-end tests on the target phones); the first features, starting with
> sign-in, are next. See [the backlog](docs/backlog.md) for progress.

## Principles

- **Practice is not performance.** Logging a session never requires claiming success, and
  "Not assessed" is the default outcome.
- **Kind training.** Content favours reward-based, gradual-exposure methods. Care milestones are
  reminders you configure, not medical advice.
- **Reliable reminders.** Web Push notifications arrive even when the app is closed.
- **Your household's data stays in your household.** Every read and write is checked against it.

## Tech

- [SvelteKit](https://svelte.dev/docs/kit) 3 full-stack app, with a framework-independent server
  core (`packages/backend`) and shared [Zod](https://zod.dev) contracts (`packages/contracts`)
- MongoDB, Tailwind CSS 4 with [shadcn-svelte](https://www.shadcn-svelte.com), Hugeicons
- Vitest, Testcontainers and Playwright; one Docker image for the app
- Android + Chrome as the primary platform; other browsers are best effort

## Getting started

You need Node 24 or later, pnpm 10 and Docker.

```sh
pnpm install
cp .env.example .env                 # local settings; sample values only
pnpm compose up -d --wait            # MongoDB (replica set) and a mock sign-in provider in Docker
pnpm dev                             # http://localhost:7877
```

Signing in locally goes through the mock provider: type any user name, and claims such as `{"email": "sam@example.com", "email_verified": true, "name": "Sam"}`. To sign in with the Auth0 dev tenant instead, set `OIDC_*` in `.env` (see `.env.example` and `docs/runbooks/auth0.md`).

Use `pnpm dev --host` to open the app from a phone on the same Wi-Fi (set `PUBLIC_BASE_URL` to the address you open).

| Command | What it does |
|---|---|
| `pnpm lint` | ESLint (including the architecture layer rules) and Prettier |
| `pnpm check` | Type-check every package |
| `pnpm test` | Unit tests |
| `pnpm test:integration` | Integration tests against MongoDB in Docker |
| `pnpm test:e2e` | Playwright on emulated Galaxy S23 FE and Redmi Note 12 Pro (needs `pnpm --filter @toe-beans/web exec playwright install chromium` once) |
| `pnpm build` | Production build (`apps/web/build`) |
| `pnpm compose --profile app up --build -d --wait` | The app image on http://localhost:3000, with MongoDB |

If port 27017 or 3000 is taken, set `MONGO_PORT` / `APP_PORT` (and the port in `MONGODB_URI`) in
`.env`.

## Repository layout

| Path | Holds |
|---|---|
| `apps/web` | The SvelteKit app: pages, route handlers, UI components |
| `packages/backend` | Domain, use cases, persistence and HTTP handlers; no SvelteKit imports ([layer rules](packages/backend/README.md)) |
| `packages/contracts` | Request/response schemas and problem types shared with the browser |
| `docker` | Dockerfile and local compose |
| `docs` | [Requirements](docs/requirements.md), [architecture](docs/architecture.md), [UI design](docs/ui.md), [backlog](docs/backlog.md) |
| `spikes` | Throwaway de-risking experiments, each with its own README |

## Licence

[MIT](LICENSE) © 2026 Veli Gebrev
