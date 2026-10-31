# @toe-beans/backend

The framework-independent server core (NFR-15). Nothing here imports SvelteKit; `apps/web` mounts
it through `createBackend()` and the `http` handlers, and a Fastify app could later do the same.

| Layer | May import | Holds |
|---|---|---|
| `domain/` | other domain files, `node:crypto` | entities, value objects, domain services |
| `application/` | `domain` | use cases, ports (`Clock`, repositories, `PushSender`, …) |
| `infrastructure/` | `application`, `domain`, any driver | Mongo, R2, web-push, OIDC, email adapters |
| `http/` | `application`, `domain`, `@toe-beans/contracts` | framework-neutral handlers: (ctx, input) → Result |
| `worker/` | `application`, `domain` | the notification tick |
| `testing/` | `application`, `domain` | test doubles for the ports (`manualClock`) |
| `config.ts` | Zod | `loadConfig(env)`: validated env vars, fails fast |
| `composition.ts` | everything | `createBackend(config, overrides?)` |

ESLint enforces the table (`eslint.config.js` at the repo root). See architecture §4.2.
