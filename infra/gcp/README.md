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
| Service accounts | `toe-beans-run` (the app's identity), `toe-beans-tick` (signs the tick's OIDC token, holds no roles), `toe-beans-deploy` (GitHub Actions, no key ever), `toe-beans-backup` (the nightly backup workflow, no key ever) | One identity per job, each with only its own grants |
| Artifact Registry | Docker repo `toe-beans` in `africa-south1`, keeping the newest 5 images; `toe-beans-deploy` may push to it | Images deployed by digest (D15); 0.5 GB free |
| Secrets | `mongodb-uri`, `oidc-client-secret`, `auth0-management-client-secret`, `resend-api-key`, `r2-secret-access-key`, `tick-heartbeat-url` (empty, for the owner), `proxy-secret` (generated), `vapid-public-key` + `vapid-private-key` (a fresh prod pair, generated; the spike's private key version is disabled, not destroyed). All in `africa-south1`, readable only by `toe-beans-run` | Runtime secrets stay in GCP; GitHub holds none (D15) |
| Cloud Run | Service `toe-beans` on Cloud Run's sample image: public with no invoker IAM check, 0–1 instances, 512 MiB, startup CPU boost. `toe-beans-deploy` gets `run.developer` on this service only, and may act as `toe-beans-run` | The service exists before the first deploy, so the deploy account is scoped to it. Public because the app refuses requests without the Worker's header secret (D32), and the tick checks its own token |
| Workload Identity Federation | Pool `github`, provider `toe-beans-github`, accepting only tokens from repo ID 1441749392 (`vgebrev/toe-beans`), environment `production`, ref `main`. Those tokens (bound by repository ID, not by subject) may act as `toe-beans-deploy` | Keyless deploys; without the condition any GitHub repo could get a token (D15) |
| Backups (S14.2) | Secrets `backup-mongodb-uri`, `backup-r2-secret-access-key`, `photos-r2-read-secret-access-key`, `backup-heartbeat-url` (empty, for the owner), readable only by `toe-beans-backup`. Pool `github-backups`, provider `toe-beans-backups`, accepting only tokens from the same repo ID, environment `backups`, ref `main`; those may act as `toe-beans-backup` | Keyless nightly backups (`infra/backup/README.md`, D36). A pool of its own, because a binding names a pool, not a provider: in the deploy's pool, backup tokens could act as the deploy account |
| Scheduler | Job `toe-beans-tick`, `*/5 * * * *` UTC, POST `/internal/tick` with an OIDC token from `toe-beans-tick`, audience the service URL. **Created paused** | Resume it after the first real deploy |
| Budget | `toe-beans`, US$1 (`BUDGET_USD`), mails at 50% and 100% of spend and 100% forecast | Cost alarm on the billing account |
| Checks | Prints log retention, who holds project roles, and which secrets are still empty | Audit D34: request logs (which can hold invite tokens) readable by the owner only, retention known (30 days) |

App settings that come out of it: `TICK_AUDIENCE=https://toe-beans-1047834821273.africa-south1.run.app`,
`TICK_INVOKER=toe-beans-tick@toe-beans-co-za.iam.gserviceaccount.com`.

## Filling a secret

```sh
infra/gcp/set-secret.sh mongodb-uri
```

It prompts without echoing, adds a version and disables the older ones.

| Secret | Value |
|---|---|
| `mongodb-uri` | Atlas `mongodb+srv://toe-beans-app:…@…/?retryWrites=true&w=majority` (the app picks the database with `MONGODB_DB`) |
| `oidc-client-secret` | The prod Auth0 application's client secret (`docs/runbooks/auth0.md` §2) |
| `auth0-management-client-secret` | The prod *Toe Beans account deletion* application's client secret (`docs/runbooks/auth0.md` §8) |
| `resend-api-key` | A Resend key with sending access only, for `toebeans.co.za` |
| `r2-secret-access-key` | The R2 API token's secret access key, scoped to the photo bucket |
| `backup-mongodb-uri` | Atlas, as the read-only `toe-beans-backup` user (`infra/backup/README.md` §3) |
| `backup-r2-secret-access-key` | The `toe-beans-backup` R2 token's secret (Object Read & Write on `toe-beans-backups`) |
| `photos-r2-read-secret-access-key` | The `toe-beans-photos-read` R2 token's secret (Object Read on `toe-beans-photos`) |
| `tick-heartbeat-url` | Better Stack's `toe-beans-tick` heartbeat URL (`docs/runbooks/monitoring.md` §3) |
| `backup-heartbeat-url` | Better Stack's `toe-beans-backup` heartbeat URL (`docs/runbooks/monitoring.md` §4) |

## After the first deploy

```sh
gcloud scheduler jobs resume toe-beans-tick --location me-central1
```

## Spike leftovers

`toe-beans-build` (with `roles/run.builder` on the project) is from S-1.3 and unused by prod.
Delete it once prod runs. The spike's secret `atlas-app-password` was deleted on 17 Nov 2026.
