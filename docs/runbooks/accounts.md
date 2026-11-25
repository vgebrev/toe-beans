# Runbook: Accounts and credentials

Every outside account prod depends on, every credential they issue, where each is kept and how to
change it (architecture R2, §8.4; backlog S14.4). This file is public: it names accounts,
resources and secrets, **never values**, and no email addresses. What personal data each service
holds, why, and for how long is the data inventory's job (`docs/data-inventory.md`, S16.1),
which builds on this list.

All accounts belong to the owner, who is the only person with access to any of them. There are no
service account keys anywhere: the deploy reaches GCP through Workload Identity Federation (D15).

## Accounts

| Service | What for | Account and resources | Plan | Region | Runbook |
|---|---|---|---|---|---|
| **Google Cloud** | Hosting, secrets, the tick's scheduler, the budget; the Google sign-in client | Project `toe-beans-co-za`: Cloud Run `toe-beans`, Artifact Registry `toe-beans`, Secret Manager, Cloud Scheduler `toe-beans-tick`, budget `toe-beans`; the spending cap (Cloud Run `toe-beans-cap`, Pub/Sub `toe-beans-budget`); service accounts `toe-beans-run`, `-tick`, `-deploy`, `-cap`, `-build`, `-edge` (the Worker, through the Workload Identity Federation pool `cloudflare`); left from S-1.4a's Firebase trial, unused: `firebase-adminsdk-fbsvc`, disabled with no roles, and the `fcm`, `firebaseinstallations` and `firebase` APIs (security audit R7); the OAuth client and consent screen for Auth0's Google connection | Pay as you go, inside the free tier; US$1 budget, which takes the app down when reached (`spending-cap.md`) | `africa-south1` (Scheduler `me-central1`) | `infra/gcp/README.md`, `infra/spending-cap/README.md` |
| **MongoDB Atlas** | The database | An M0 cluster; database `toe-beans`; users `toe-beans-app` (`readWrite` on `toe-beans`) and `toe-beans-backup` (`read`); network access `0.0.0.0/0` (R3) | Free (M0) | AWS `af-south-1`, Cape Town | architecture §8.4 |
| **Cloudflare** | DNS, the edge, photo and backup storage | Zone `toebeans.co.za`; Worker `toe-beans-edge`; R2 buckets `toe-beans-photos` and `toe-beans-backups`; R2 tokens (below); Email Routing forwards `privacy@toebeans.co.za` and `support@toebeans.co.za` to the owner's inbox | Free | R2 in Europe (location hint) | `infra/edge/README.md`, `infra/backup/README.md` |
| **GoDaddy** | The domain's registration | `toebeans.co.za`, registered 31 Oct 2026 for two years; nameservers point at Cloudflare | Paid yearly | — | — |
| **Auth0** | Sign-in | Tenants `toe-beans` (prod, custom domain `auth.toebeans.co.za`) and `toe-beans-dev`; applications *Toe Beans* and *Toe Beans account deletion* (machine-to-machine, `delete:users` only) in each; Google and database connections only | Free | EU | `auth0.md` |
| **Resend** | Email: invitations from the app, Auth0's verification and password mails, and the owner's replies as `privacy@` and `support@toebeans.co.za`. Invitations go from `invites@` with replies to `support@` (`EMAIL_REPLY_TO`) | Domain `toebeans.co.za` (its DNS records in Cloudflare); three API keys (below) | Free | — | — |
| **Sentry** | Error reports | The owner's organization; project `toe-beans` | Developer (free) | EU (Frankfurt) | `sentry.md` |
| **GitHub** | Code, CI, deploys, nightly backups | Public repo `vgebrev/toe-beans`; ruleset on `main` (pull requests only, merge commits); environments `production` (main only, owner approval, no admin bypass) and `backups` (main only); Actions limited to pinned actions from GitHub, `docker`, `google-github-actions` and `pnpm`; Dependabot; CodeQL default setup | Free | — | `CLAUDE.md`, architecture §10 |
| **Better Stack** | Uptime and heartbeats | Monitor `toe-beans`, heartbeats `toe-beans-tick` and `toe-beans-backup` | Free | — | `monitoring.md` |

**Renewals:** the domain is the one thing that lapses by itself. Keep GoDaddy's auto-renew on and
its payment card current; the registration runs to 31 Oct 2028.

## Billing limits

Which services can bill past their free allowance, and what stops each (architecture D45, backlog
S19.6). Allowances are the providers' published ones as of November 2026; check them at the
quarterly review.

| Service | Can it bill? | Free allowance | What stops it |
|---|---|---|---|
| **Google Cloud**, all of it | Yes, the billing account's card | Per service, below | The `toe-beans` budget (US$1) and the spending cap, which takes the app down at 100% of actual spend (`spending-cap.md`). The rows below keep normal use well under it |
| · Cloud Run | Yes | Requests, CPU and memory time; Tier 1 prices, so about 29% less in `africa-south1` (architecture Q9) | `max-instances=1` on `toe-beans` and on `toe-beans-cap` |
| · Artifact Registry | Yes, storage past 0.5 GB | 0.5 GB across repositories | Cleanup policies: the newest 5 images in `toe-beans` (`infra/gcp/provision.sh`), the newest 2 in `cloud-run-source-deploy` (`infra/spending-cap/provision.sh`). They run about daily, so a burst of deploys can sit over for a day |
| · Secret Manager | Yes, past 6 versions, US$0.06 a month each, enabled or disabled. Until S19.6, 13 secrets cost US$0.42 a month | 6 active versions, 10,000 accesses a month | One secret, `app-secrets`: one version, two just after a change (`app-secrets.sh` keeps the replaced one disabled and destroys older ones). The backup's credentials are GitHub secrets. Counted by `infra/gcp/limits.sh`; `--prune-secrets` destroys disabled versions after asking. Put a new secret value in `app-secrets` rather than a secret of its own |
| · Cloud Scheduler | Yes, past 3 jobs | 3 jobs | One job, `toe-beans-tick` |
| · Pub/Sub, Cloud Build, Logging | Yes | 10 GiB of messages; build minutes; 50 GiB of logs, 30 days kept | A few budget messages a day; a build only when the cap's code changes; the app logs at `info` |
| · Cloud Storage | Yes; no free tier in `africa-south1` | None there | Only `run-sources-toe-beans-co-za-africa-south1`, made by a source deploy and empty. `limits.sh` lists every bucket with its size |
| **Cloudflare R2** | **Yes**, past the free allowance, to the card on the Cloudflare account | 10 GB-month of storage, 1 million Class A and 10 million Class B operations a month | No hard cap exists: Cloudflare's spend limits cover only Workers and Durable Objects. Instead: photos are one small WebP per dog in two sizes; the backups' lifecycle rules delete dumps and replaced photos after 30 days (`infra/backup/README.md` §2); the nightly backup fails, and so mails the owner, when the two buckets hold more than 5 GB together (`STORAGE_ALERT_GB`); and a Cloudflare budget alert at US$1 catches operations, which nothing of ours counts |
| Cloudflare Workers, DNS, Email Routing | No (free plan) | 100,000 Worker requests a day | Requests past the day's allowance fail; nothing bills. A rate-limiting rule slows a flood from one address (`infra/edge/README.md`, security audit R3) |
| MongoDB Atlas | No (M0, no card) | 512 MB of storage | Writes are refused past it |
| Auth0 | No (free plan) | The free plan's monthly active users | Sign-ups stop past it |
| Resend | No (free plan) | 100 emails a day, 3,000 a month | Sends are refused past it |
| Sentry | No (Developer) | The plan's monthly events | Events past it are dropped |
| Better Stack | No (free plan) | The plan's monitors and heartbeats | Nothing more can be added |
| GitHub | No | Actions are free on a public repo | Keep the spending limit for Actions and Packages at US$0 (*Settings → Billing and licensing → Budgets and alerts*) |
| GoDaddy | Yes, the yearly renewal | — | A known amount, once every two years |

### Setup (owner, once)

1. **Cloudflare budget alert** at US$1 under *Manage Account → Billing → Billable Usage*
   (done: it was there, beside Cloudflare's own US$10 one). Account-wide, on actual usage-based
   spend, one mail a billing period; it never blocks anything.
2. **R2's lifecycle rules.** `npx wrangler@4 r2 bucket lifecycle list toe-beans-backups` shows
   `mongo-30-days` and `replaced-photos-30-days` (and Cloudflare's own rule aborting multipart
   uploads after 7 days).
3. **GitHub's spending limit** at US$0 (done).
4. **Thirteen secrets into one,** in this order, so prod and the backups keep running:
   1. **Before merging S19.6 to `main`:** `infra/gcp/provision.sh` (creates `app-secrets`), then
      `infra/gcp/app-secrets.sh migrate`, which copies the eight values in, checking the VAPID
      public key matches the private one. `app-secrets.sh keys` shows all eight set.
   2. **The backup's secrets on GitHub,** piped across so no value reaches the screen:

      ```sh
      from() { gcloud secrets versions access latest --secret="$1" --project toe-beans-co-za; }
      from backup-mongodb-uri | gh secret set BACKUP_MONGODB_URI --env backups
      from backup-r2-secret-access-key | gh secret set BACKUP_R2_SECRET_ACCESS_KEY --env backups
      from photos-r2-read-secret-access-key | gh secret set PHOTOS_R2_SECRET_ACCESS_KEY --env backups
      from backup-heartbeat-url | gh secret set BACKUP_HEARTBEAT_URL --env backups
      ```

      GitHub can't show a secret again, so also put the read-only string
      (`from backup-mongodb-uri`) in your password manager: the restore and durability checks use it.
   3. **Merge and deploy.** The deploy mounts only `app-secrets`. Check: the app answers, the
      startup log's `backend started` shows `tickHeartbeat: true`, and a test reminder arrives (the
      VAPID key carried over). Then **Actions → Backup → Run workflow** on `main`, and the
      `toe-beans-backup` heartbeat goes *Up*.
   4. **Retire the old ones,** once both work:

      ```sh
      for s in mongodb-uri oidc-client-secret auth0-management-client-secret resend-api-key \
      	r2-secret-access-key proxy-secret vapid-public-key vapid-private-key tick-heartbeat-url \
      	backup-mongodb-uri backup-r2-secret-access-key photos-r2-read-secret-access-key backup-heartbeat-url; do
      	gcloud secrets delete "$s" --project toe-beans-co-za --quiet
      done
      gcloud iam workload-identity-pools delete github-backups --location global --project toe-beans-co-za --quiet
      gcloud iam service-accounts delete toe-beans-backup@toe-beans-co-za.iam.gserviceaccount.com --project toe-beans-co-za --quiet
      infra/gcp/limits.sh    # one secret, one version
      ```

      A deleted pool is kept 30 days and can be undeleted; deleted secrets can't come back, which
      is why this waits until the new ones have worked.

### Checking

`infra/gcp/limits.sh` prints Artifact Registry's size, every secret's version count with what
they cost, the Scheduler jobs, each Cloud Run service's instance limit and any storage buckets.
R2's storage and operations are on Cloudflare's *R2 → Overview* page. If Artifact Registry is
over 0.5 GB, lower a `keepCount` and re-run its provision script.

## Credentials

**Secret Manager** (project `toe-beans-co-za`, `africa-south1`): one secret, `app-secrets`, a JSON
object readable only by `toe-beans-run`, which Cloud Run mounts as `APP_SECRETS` and the app
spreads into the variables below (architecture D45). Change one with
`infra/gcp/app-secrets.sh set <VARIABLE>` (or `generate`); `keys` lists what's set, never values.
The app reads it when an instance starts, so redeploy after a change.

| Variable in `app-secrets` | Is | To change it |
|---|---|---|
| `MONGODB_URI` | Atlas connection string as `toe-beans-app` | Atlas: edit the user's password; set it; redeploy. The old password stops working at once, so redeploy straight after |
| `OIDC_CLIENT_SECRET` | The prod Auth0 application's client secret | `auth0.md`, *Rotating the client secret* |
| `AUTH0_MANAGEMENT_CLIENT_SECRET` | The prod *Toe Beans account deletion* application's secret (only `delete:users`); its client ID is the `production` variable `AUTH0_MANAGEMENT_CLIENT_ID` | `auth0.md` §8, *Rotating* |
| `RESEND_API_KEY` | Resend key, sending access, `toebeans.co.za` only | Resend: create a new key; set it; redeploy; delete the old key |
| `S3_SECRET_ACCESS_KEY` | The app's R2 token (Object Read & Write on `toe-beans-photos`); its access key ID is the `production` variable `R2_ACCESS_KEY_ID` | R2: create a new token; set it and the variable; redeploy; delete the old token |
| `PROXY_SECRET` | The Worker's header secret (D32) | `app-secrets.sh generate PROXY_SECRET`, then `infra/edge/README.md`. Between the Worker's update and the app's redeploy every request gets 403, so do both together |
| `VAPID_PRIVATE_KEY` | The Web Push private key; the app works out the public key from it | **Only if leaked** (`generate` refuses while one is set). A new key stops reminders on every device until each opens the app's Notifications screen again |
| `TICK_HEARTBEAT_URL` | Better Stack's tick heartbeat URL | `monitoring.md`, *Changing a heartbeat's URL* |

**GitHub environment secrets** (`backups` only; only that environment's job on `main` can read
them, and GitHub can't show them again):

| Secret | Is | To change it |
|---|---|---|
| `BACKUP_MONGODB_URI` | Atlas connection string as the read-only `toe-beans-backup` user; a copy in the owner's password manager for restore checks | Atlas: edit the user's password; `gh secret set BACKUP_MONGODB_URI --env backups`; update the password manager. The next run uses it |
| `BACKUP_R2_SECRET_ACCESS_KEY` | R2 token `toe-beans-backup` (Object Read & Write on `toe-beans-backups`); its key ID is the `backups` variable `BACKUP_R2_ACCESS_KEY_ID` | R2: new token; set the secret and the variable; delete the old token |
| `PHOTOS_R2_SECRET_ACCESS_KEY` | R2 token `toe-beans-photos-read` (Object Read on `toe-beans-photos`); key ID in `PHOTOS_R2_ACCESS_KEY_ID` | As above |
| `BACKUP_HEARTBEAT_URL` | Better Stack's backup heartbeat URL | `monitoring.md` |

**Held in the services themselves:**

| Credential | Lives in | To change it |
|---|---|---|
| Google OAuth client secret (Auth0's Google connection) | GCP *APIs & Services → Credentials*, pasted into Auth0's Google connection (prod) | Add a new secret on the client in GCP, paste it into Auth0, then delete the old one |
| Resend SMTP key (Auth0's email provider) | Resend, pasted into Auth0 *Branding → Email Provider* (prod) | New key in Resend, paste into Auth0, send a test mail, delete the old key |
| Resend SMTP key (replies as `privacy@` and `support@`) | Resend (sending access only), pasted into Gmail *Settings → Accounts → Send mail as* for both addresses, through `smtp.resend.com`, port 465, user `resend` | New key in Resend, edit the address in Gmail, send a test reply, delete the old key |
| `PROXY_SECRET` (the Worker's) | The Worker's secret, a copy of `PROXY_SECRET` in `app-secrets` | With it |
| `EDGE_KEY` | The Worker's secret: the private key it signs its JWTs with, to act as `toe-beans-edge` (D45). Only its public half is in GCP, in the pool `cloudflare`'s provider | `node infra/edge/edge-key.mjs` (`infra/edge/README.md`): a new pair, the previous public key kept for one rotation. No downtime |
| The age private key | Offline only: the owner's password manager and one offline copy. Never in the repo, GitHub or GCP | `infra/backup/README.md` §1. A new key reads only backups made after the change |

**Not secret, kept as GitHub environment variables.** Only the owner can edit them, but anyone can
read them in a step's log, so nothing secret ever goes here:

| Environment | Variables |
|---|---|
| `production` | `OIDC_CLIENT_ID`, `AUTH0_MANAGEMENT_CLIENT_ID`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `SENTRY_DSN` |
| `backups` | `AGE_RECIPIENT`, `R2_ACCOUNT_ID`, `BACKUP_R2_ACCESS_KEY_ID`, `PHOTOS_R2_ACCESS_KEY_ID` |

**Local only:** `.env` holds the dev Auth0 client secret, a dev VAPID pair and any local keys. It's
gitignored and never holds prod values.

## Sign-in hygiene (owner)

Each account above has two-factor authentication on and the owner as its only member. When a
service adds a person (a new caregiver helping run prod, say), add them here with their role.

If a credential may have leaked, change it as above, then look at the service's own access log
where it has one (Atlas, Cloudflare, GCP audit logs, Auth0 logs). In GCP, each read of
`app-secrets` is a Data Access entry (`AccessSecretVersion`, with the caller), kept 30 days; the
query is in security audit R10.

## Reviews

Quarterly, with the restore test (`restore.md` §4) and the cost review (R1): read this list
against each service's dashboard, remove what's gone, add what's new, and check the domain's
renewal and the budget. Run `infra/gcp/limits.sh` and read *Billing limits* against each
provider's current free allowance. Review `disaster-recovery.md` at the same time (§7 there).
