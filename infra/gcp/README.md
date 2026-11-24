# Production on GCP

The prod setup for S14.1 (architecture §8, D9, D15): project `toe-beans-co-za`, Cloud Run in
`africa-south1`, the tick's Cloud Scheduler job in `me-central1` (the nearest region that has it).
This file is public; it names resources, never secret values. Every account and credential is
listed in `docs/runbooks/accounts.md`.

## `provision.sh`

Run once by the project owner (`gcloud auth login` first); safe to re-run, as each step creates only
what's missing. It never prints or reads back a secret value.

| Step | What it makes | Why |
|---|---|---|
| APIs | Run, Artifact Registry, Secret Manager, Scheduler, IAM, IAM Credentials, STS, Billing Budgets | What the steps below use |
| Service accounts | `toe-beans-run` (the app's identity), `toe-beans-tick` (signs the tick's OIDC token; may invoke the app), `toe-beans-deploy` (GitHub Actions, no key ever), `toe-beans-edge` (the Cloudflare Worker, through its own pool; may invoke the app, no key ever) | One identity per job, each with only its own grants. The org refuses service account keys |
| Artifact Registry | Docker repo `toe-beans` in `africa-south1`, keeping the newest 5 images; `toe-beans-deploy` may push to it | Images deployed by digest (D15); 0.5 GB free |
| Secrets | `app-secrets`, empty, in `africa-south1`, readable only by `toe-beans-run`: one JSON object holding all the app's secret values (below) | Runtime secrets stay in GCP (D15); one secret, because Secret Manager bills each version past 6 (D45) |
| Cloud Run | Service `toe-beans` on Cloud Run's sample image, 0–1 instances, 512 MiB, startup CPU boost. Its invokers are `toe-beans-edge` (added only to a new service, or once to one still open to `allUsers`, so a re-run never reopens an app the cap closed) and `toe-beans-tick`. `toe-beans-deploy` gets `run.developer` on this service only, and may act as `toe-beans-run` | The service exists before the first deploy, so the deploy account is scoped to it. Google turns away anyone but its invokers before the app, free (D45, security audit R1); the app still refuses requests without the Worker's header secret (D32), and the tick checks its own token |
| Workload Identity Federation | Pool `github`, provider `toe-beans-github`, accepting only tokens from repo ID 1441749392 (`vgebrev/toe-beans`), environment `production`, ref `main`. Those tokens (bound by repository ID, not by subject) may act as `toe-beans-deploy` | Keyless deploys; without the condition any GitHub repo could get a token (D15) |
| Edge identity | Pool `cloudflare`, whose subject `toe-beans-edge` may act as `toe-beans-edge`. Its provider, holding the Worker's public key, is made by `infra/edge/edge-key.mjs` | The Worker signs its own JWT and swaps it for a Google ID token, with no key in Google (`infra/edge/README.md`) |
| Scheduler | Job `toe-beans-tick`, `*/5 * * * *` UTC, POST `/internal/tick` with an OIDC token from `toe-beans-tick`, audience the service URL. **Created paused** | Resume it after the first real deploy |
| Budget | `toe-beans`, US$1 (`BUDGET_USD`), mails at 50% and 100% of spend and 100% forecast | Cost alarm on the billing account. `infra/spending-cap/provision.sh` then connects it to the cap, which takes the app down at 100% of spend (D45) |
| Checks | Prints log retention, who holds project roles, which of `app-secrets`' values are set, and the app's invokers (warning while `allUsers` is one) | Audit D34: request logs (which can hold invite tokens) readable by the owner only, retention known (30 days) |

App settings that come out of it: `TICK_AUDIENCE=https://toe-beans-1047834821273.africa-south1.run.app`,
`TICK_INVOKER=toe-beans-tick@toe-beans-co-za.iam.gserviceaccount.com`.

## The app's secret

```sh
infra/gcp/app-secrets.sh keys                  # which values are set, never the values
infra/gcp/app-secrets.sh set MONGODB_URI       # prompts without echoing
```

`app-secrets` is a JSON object that Cloud Run mounts as `APP_SECRETS` and the app spreads into its
variables at startup (architecture D45, S19.6). Each change adds a version and disables the one it
replaces, so a mistake can be undone in the console; versions disabled before that are destroyed,
since a disabled version bills like an enabled one. The app reads it when an instance starts, so
redeploy after a change.

| Variable | Value |
|---|---|
| `MONGODB_URI` | Atlas `mongodb+srv://toe-beans-app:…@…/?retryWrites=true&w=majority` (the app picks the database with `MONGODB_DB`) |
| `OIDC_CLIENT_SECRET` | The prod Auth0 application's client secret (`docs/runbooks/auth0.md` §2) |
| `AUTH0_MANAGEMENT_CLIENT_SECRET` | The prod *Toe Beans account deletion* application's client secret (`docs/runbooks/auth0.md` §8) |
| `RESEND_API_KEY` | A Resend key with sending access only, for `toebeans.co.za` |
| `S3_SECRET_ACCESS_KEY` | The R2 API token's secret access key, scoped to the photo bucket |
| `PROXY_SECRET` | `app-secrets.sh generate PROXY_SECRET`; then the Worker's copy (`infra/edge/README.md`) |
| `VAPID_PRIVATE_KEY` | `app-secrets.sh generate VAPID_PRIVATE_KEY`, once for good: it refuses while one is set. The app works out the public key |
| `TICK_HEARTBEAT_URL` | Better Stack's `toe-beans-tick` heartbeat URL (`docs/runbooks/monitoring.md` §3) |

`app-secrets.sh migrate` filled it once from the separate secrets used before S19.6. The nightly
backup's credentials are GitHub secrets of the `backups` environment (`infra/backup/README.md`).

## Free allowances

```sh
infra/gcp/limits.sh                  # read-only
infra/gcp/limits.sh --prune-secrets  # also offers to destroy disabled secret versions
```

It prints Artifact Registry's size against the free 0.5 GB, each secret's versions and what they
cost past the free 6, the Scheduler jobs, each Cloud Run service's instance limit and any storage
buckets (architecture D45, S19.6). Run it at the quarterly review (`accounts.md`).

## After the first deploy

```sh
gcloud scheduler jobs resume toe-beans-tick --location me-central1
```

## Spike leftovers

`toe-beans-build` (with `roles/run.builder` on the project) was S-1.3's; the spending cap's
source deploys now build as it (`infra/spending-cap`), so it stays. The spike's secret `atlas-app-password` was deleted on 17 Nov 2026.
