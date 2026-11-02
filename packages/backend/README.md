# @toe-beans/backend

The framework-independent server core (NFR-15). Nothing here imports SvelteKit; `apps/web` mounts
it through `createBackend()` and the `http` handlers, and a Fastify app could later do the same.

| Layer | May import | Holds |
|---|---|---|
| `domain/` | other domain files, `node:crypto` | entities, value objects, domain services |
| `application/` | `domain` | use cases, ports (`Clock`, `Logger`, `ErrorReporter`, `Readiness`, repositories, `PushSender`, …) |
| `infrastructure/` | `application`, `domain`, any driver | Mongo (`persistence/`: client, `UnitOfWork`, `HouseholdCollection`, migrations, readiness), `logging/` (pino, `scrubText`), `error-reporting/` (Sentry), `rate-limit/` (in-memory token buckets), the request context, R2, web-push, OIDC, email adapters |
| `http/` | `application`, `domain`, `@toe-beans/contracts` | framework-neutral handlers: (ctx, input) → Result |
| `worker/` | `application`, `domain` | the notification tick |
| `testing/` | `application`, `domain` | test doubles for the ports (`manualClock`) and `householdIsolationSuite` |
| `config.ts` | Zod | `loadConfig(env)`: validated env vars, fails fast |
| `composition.ts` | everything | `createBackend(config, overrides?)`: builds the logger and error reporter, connects to Mongo and migrates |

ESLint enforces the table (`eslint.config.js` at the repo root). See architecture §4.2.

`test/` holds the integration-test harness: an Atlas Local container (Testcontainers) started once per
run (`mongo-setup.ts`) and `useTestDatabase()`, which gives each test file its own database. Every
household-owned repository runs `householdIsolationSuite` in its integration test (architecture §4.4).
