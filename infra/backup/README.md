# Backups

The nightly backup for S14.2 (architecture §10, D36). Atlas's free cluster keeps no backups, so this
is the only copy of prod's data outside Atlas and the photo bucket. This file is public. It names
resources but never secret values.

| What | Where in `toe-beans-backups` (R2) | Kept |
|---|---|---|
| The database (`toe-beans`), `mongodump --archive --gzip`, encrypted with `age` to the owner's key. Sign-in sessions are left out | `mongo/toe-beans-<UTC time>.archive.gz.age` | 30 days (lifecycle rule) |
| The photo bucket (`toe-beans-photos`), synced | `photos/current/` | While the photo exists |
| Photos gone from the source (replaced or deleted) | `photos/replaced/<UTC time>/` | 30 days (lifecycle rule) |

- **How it runs:** `.github/workflows/backup.yml` runs `backup.sh` at 00:17 UTC (02:17 in South
  Africa), and also by hand.
- **Credentials:** it gets them keylessly, through its own Workload Identity pool. The secrets stay
  in Secret Manager, and GitHub holds none.
- **The private key** lives only with the owner. Neither GitHub nor GCP can read a dump.
- **The photo sync stops** rather than move more than 50 photos out of `photos/current/` in one run,
  in case the source has been emptied by mistake. The run fails, and a failed run sends mail.
  After a real mass deletion, run it by hand with a higher `MAX_PHOTO_MOVES`.
- **A night with no run** (a schedule GitHub turned off, say) sends no mail of its own. After each
  run that worked, the workflow calls Better Stack's `toe-beans-backup` heartbeat, which alerts when
  a day passes without one (`docs/runbooks/monitoring.md` §4).
- **What 30 days means:** anything deleted in the app is gone from backups after 30 days. The
  privacy policy (S16.2) relies on that.

Restoring is `docs/runbooks/restore.md` (S14.3).

## Setup (owner, once)

### 1. The age key, on your own machine

```sh
age-keygen -o toe-beans-backup.key   # prints "Public key: age1…"
```

- **Where the private key goes:** keep the file in your password manager, plus one offline copy.
  It must never go into the repo, GitHub or GCP.
- **If it's lost,** every backup is unreadable. Make a new key, then change `AGE_RECIPIENT`.
  Backups made from then on use the new key.
- **The public key** goes into GitHub in step 5.

### 2. The bucket and its retention (Cloudflare)

Check where the photo bucket is, so the backups stay in the same region (the data inventory,
S16.1, lists it). Then create the backup bucket there:

```sh
npx wrangler@4 r2 bucket info toe-beans-photos              # shows its location
npx wrangler@4 r2 bucket create toe-beans-backups --location <same hint, e.g. weur>
npx wrangler@4 r2 bucket lifecycle add toe-beans-backups mongo-30-days mongo/ --expire-days 30 -y
npx wrangler@4 r2 bucket lifecycle add toe-beans-backups replaced-photos-30-days photos/replaced/ --expire-days 30 -y
npx wrangler@4 r2 bucket lifecycle list toe-beans-backups
```

Two R2 API tokens (dashboard: R2 → Manage API tokens → Create Account API token). Each shows an
access key ID and a secret access key once.

| Token | Permission | Bucket |
|---|---|---|
| `toe-beans-backup` | Object Read & Write | `toe-beans-backups` only |
| `toe-beans-photos-read` | Object Read only | `toe-beans-photos` only |

### 3. A read-only database user (Atlas)

Database Access → Add new database user:

- **User:** `toe-beans-backup`, password authentication with a generated password.
- **Privileges:** Specific Privileges → `read` on database `toe-beans`. It has no write access, so
  a leaked backup credential can't change prod.

The connection string is the app's, with this user:
`mongodb+srv://toe-beans-backup:<password>@<cluster host>/`.

### 4. GCP

```sh
infra/gcp/provision.sh          # adds toe-beans-backup, its pool and three empty secrets
infra/gcp/set-secret.sh backup-mongodb-uri                 # the string from step 3
infra/gcp/set-secret.sh backup-r2-secret-access-key        # toe-beans-backup's secret
infra/gcp/set-secret.sh photos-r2-read-secret-access-key   # toe-beans-photos-read's secret
```

### 5. GitHub

1. Make the `backups` environment, open to `main` only and with no reviewers, so it runs
   unattended.
2. Set its variables. None of them is secret.

```sh
gh api -X PUT repos/vgebrev/toe-beans/environments/backups \
	-F 'deployment_branch_policy[protected_branches]=false' \
	-F 'deployment_branch_policy[custom_branch_policies]=true'
gh api -X POST repos/vgebrev/toe-beans/environments/backups/deployment-branch-policies \
	-f name=main -f type=branch
gh variable set AGE_RECIPIENT --env backups --body 'age1…'
gh variable set R2_ACCOUNT_ID --env backups --body '<Cloudflare account ID>'
gh variable set BACKUP_R2_ACCESS_KEY_ID --env backups --body '<toe-beans-backup access key ID>'
gh variable set PHOTOS_R2_ACCESS_KEY_ID --env backups --body '<toe-beans-photos-read access key ID>'
```

### 6. First run

Schedules run from `main`, so the workflow starts once it has been merged there. Then:

```sh
gh workflow run backup.yml --ref main
gh run watch "$(gh run list --workflow=backup.yml --limit 1 --json databaseId -q '.[0].databaseId')"
```

In the dashboard, `toe-beans-backups` should then hold one `mongo/…age` object and
`photos/current/`. Prove that it restores with S14.3 before relying on it.

## Running it by hand

`backup.sh` takes its inputs from the environment (see its header) and works with any rclone remotes.
For example, against the local compose database into a folder:

```sh
MONGODB_URI='mongodb://localhost:27027/?directConnection=true' MONGODB_DB=toe-beans \
AGE_RECIPIENT=age1… BACKUP_DEST=/tmp/backups PHOTOS_SOURCE=/path/to/photos infra/backup/backup.sh
```

## Upkeep

- **A failed run** sends mail to whoever last changed the schedule in `backup.yml`.
- **GitHub turns schedules off** in a repo with no commits for 60 days. S14.4's monitoring is meant
  to catch a night with no backup.
- **Tool versions** are pinned in the workflow, each with its SHA-256. To update one, change the
  version and the hash together.
