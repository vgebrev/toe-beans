<p align="center">
  <img src="apps/web/src/lib/assets/brand/mark.svg" alt="Toe Beans logo" width="96">
</p>

<h1 align="center">Toe Beans</h1>

<p align="center">A puppy training and care companion for everyone who looks after the dog.</p>

<p align="center">
  <a href="https://github.com/vgebrev/toe-beans/actions/workflows/ci.yml"><img src="https://github.com/vgebrev/toe-beans/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/vgebrev/toe-beans/actions/workflows/deploy.yml"><img src="https://github.com/vgebrev/toe-beans/actions/workflows/deploy.yml/badge.svg" alt="Deploy"></a>
  <a href="https://incidents.betterstack.com/?utm_source=status_badge"><img src="https://incidents.betterstack.com/status-badges/v1/monitor/34qmp.svg" alt="Better Stack Badge"></a>
</p>

---

Toe Beans is a mobile-first, installable web app (PWA) for planning short, reward-based training
sessions, recording how they went, and keeping puppy care (vaccinations, medication, vet visits)
in one place. Caregivers in one household share it across their phones, and it supports several
dogs from the start, each with its own history.

It aims to answer three questions: **What should we do today? How is our puppy progressing?
What should we work on next?**

> **Status:** the first usable MVP is built and live at [toebeans.co.za](https://toebeans.co.za)
> (since 17 Nov 2026), ahead of release. Still to come: backups and restore, monitoring,
> the privacy policy and terms, account deletion, and release acceptance on both phones. See
> [the backlog](docs/backlog.md) for progress.

## What it does

- **Sign-in and households:** Google or email sign-in, a household shared by several caregivers,
  invitations by email or by a link that expires and can be revoked, owners and members.
- **Dogs:** several dogs per household, each with a profile photo and its own history.
- **Exercise library:** a curated, reviewed set of reward-based exercises across nine skill areas,
  plus a shared cue dictionary the household edits.
- **Plan:** one-off and repeating training sessions, up to several times a day, in a week view.
- **Today:** what's planned, overdue, done and skipped, with care coming up in the next week.
- **Quick log:** record a session in under 30 seconds, with an optional outcome, emotional state,
  environment, duration and notes.
- **Behaviour journal and History:** events alongside training logs and done care, filtered by
  dog, type, exercise and date, with soft delete and *Undo*.
- **Care calendar:** vaccinations, medication, vet visits and other care, with the next one planned
  when you mark one done.
- **Reminders:** Web Push for planned sessions and care, delivered while the app is closed;
  tapping one opens the item.
- **Installable PWA:** shortcuts, an offline shell and banner, failed saves kept for retry, and
  edits from two phones that never silently overwrite each other.

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

In production the app runs on Google Cloud Run in Johannesburg behind a Cloudflare Worker on
`toebeans.co.za`, with MongoDB Atlas in Cape Town, photos in Cloudflare R2, sign-in through Auth0,
email through Resend and error reports in Sentry. Cloud Scheduler calls the reminder tick every
5 minutes. Pushes to `main` (by pull request from `develop`, once CI passes) deploy through the
[Deploy workflow](.github/workflows/deploy.yml) after the owner approves; it signs in to GCP by
Workload Identity Federation, so GitHub holds no secrets. [`infra/`](infra) has the provisioning
script and the Worker.

## Getting started

You need Node 24 or later, pnpm 10 and Docker.

```sh
pnpm install
cp .env.example .env                 # local settings; sample values only
pnpm compose up -d --wait            # MongoDB (replica set), a mock sign-in provider and SeaweedFS in Docker
pnpm dev                             # http://localhost:7877
```

Signing in locally goes through the mock provider: type any user name, and claims such as `{"email": "sam@example.com", "email_verified": true, "name": "Sam"}`. To sign in with the Auth0 dev tenant instead, set `OIDC_*` in `.env` (see `.env.example` and `docs/runbooks/auth0.md`).

Use `pnpm dev --host` to open the app from a phone on the same Wi-Fi, at one URL on every device:

1. Point `toebeans.test` at the dev machine: `address=/toebeans.test/<LAN IP>` in the network's dnsmasq. If dnsmasq runs on the dev machine and you add a hosts-file entry, give it the LAN IP, not `127.0.0.1`: dnsmasq serves `/etc/hosts` to the network too, and phones would get their own loopback address.
2. Serve https, so phones get a secure context (the service worker, install and push need one): `mkcert -cert-file .certs/toebeans.test.pem -key-file .certs/toebeans.test-key.pem toebeans.test localhost 127.0.0.1 ::1`, then set `DEV_HTTPS_CERT` and `DEV_HTTPS_KEY` in `.env` (`.env.example`). Install mkcert's root CA (`mkcert -CAROOT`/`rootCA.pem`) on each phone as a CA certificate (Android: Settings → Security → Encryption & credentials → Install a certificate). Never share that CA's key.
3. Set `PUBLIC_BASE_URL=https://toebeans.test:7877` and sign in through the Auth0 dev tenant, since the mock provider only listens on localhost.
4. For reminders, put a lasting key pair in `.env`: `pnpm --silent vapid >> .env`. Without one, each server start makes a new pair and phones must turn reminders on again. The dev server sends due reminders itself every 5 minutes (`TICK_INTERVAL_MINUTES`).

Without step 2 it works over http (`PUBLIC_BASE_URL=http://…`), but only pages and sign-in.

Dog photos go to `apps/web/.data/photos` unless `PHOTO_STORE=s3` points them at the compose
SeaweedFS (an R2 stand-in), and email is printed to the terminal unless `EMAIL_SENDER` says
otherwise (`mailpit` for a local inbox, `resend` for real mail). `.env.example` explains each
setting.

| Command | What it does |
|---|---|
| `pnpm lint` | ESLint (including the architecture layer rules) and Prettier |
| `pnpm check` | Type-check every package |
| `pnpm test` | Unit tests, including the exercise library gate |
| `pnpm content:check` | The exercise library gate alone ([authoring guide](content/README.md)) |
| `pnpm test:integration` | Integration tests against MongoDB in Docker |
| `pnpm test:e2e` | Playwright on emulated Galaxy S23 FE and Redmi Note 12 Pro (needs `pnpm --filter @toe-beans/web exec playwright install chromium` once) |
| `pnpm build` | Production build (`apps/web/build`) |
| `pnpm vapid` | Print a new VAPID key pair for Web Push, for `.env` |
| `pnpm compose --profile app up --build -d --wait` | The app image on http://localhost:3000, with MongoDB |

If port 27017 or 3000 is taken, set `MONGO_PORT` / `APP_PORT` (and the port in `MONGODB_URI`) in
`.env`.

## Repository layout

| Path | Holds |
|---|---|
| `apps/web` | The SvelteKit app: pages, route handlers, UI components |
| `packages/backend` | Domain, use cases, persistence and HTTP handlers; no SvelteKit imports ([layer rules](packages/backend/README.md)) |
| `packages/contracts` | Request/response schemas and problem types shared with the browser |
| `content` | The exercise library (YAML) and its sources ([authoring guide](content/README.md)) |
| `docker` | Dockerfile and local compose |
| `infra` | Production: [GCP provisioning](infra/gcp/README.md), the [Cloudflare Worker](infra/edge/README.md) in front of Cloud Run, and the retired holding page |
| `.github` | [CI](.github/workflows/ci.yml), [deploy](.github/workflows/deploy.yml) and Dependabot |
| `docs` | [Requirements](docs/requirements.md), [architecture](docs/architecture.md), [UI design](docs/ui.md), [backlog](docs/backlog.md), the [security audit](docs/security-audit.md), the [code review](docs/code-review.md) and [runbooks](docs/runbooks) (Auth0, Sentry) |
| `spikes` | Throwaway de-risking experiments, each with its own README |

## Licence

[MIT](LICENSE) © 2026 Veli Gebrev
