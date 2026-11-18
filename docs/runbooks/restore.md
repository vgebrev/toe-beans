# Runbook: Restore

Brings prod's data back from the nightly backup (architecture §10, D36; backlog S14.3; NFR-10,
scenario 10). What's backed up and where is in `infra/backup/README.md`. This file is public. It
names resources, never values.

| | |
|---|---|
| Backups | R2 bucket `toe-beans-backups`: `mongo/toe-beans-<UTC time>.archive.gz.age` nightly, `photos/current/`, `photos/replaced/<UTC time>/` |
| Kept | 30 days for dumps and replaced photos |
| Most you can lose | A day of data: everything since the last 00:17 UTC run |
| Key | The owner's age private key (`toe-beans-backup.key`, password manager plus an offline copy) |
| Not in a dump | Sign-in sessions and sign-ins in progress: after a restore everyone signs in again |
| Test | Before go-live, then quarterly (§4) |

## 1. What you need

On your own machine, never a shared one, since the dump decrypts to everyone's data:

- `age` (`sudo apt install age`, or a release from github.com/FiloSottile/age), plus the private key.
- **MongoDB Database Tools** (`mongorestore`) and `mongosh`.
- `npx wrangler@4`, signed in to the Cloudflare account. For photos you also need `rclone`.
- `gcloud`, signed in as the project owner, for a real restore.

## 2. Get a dump

Find the dump in the dashboard (R2 → `toe-beans-backups` → `mongo/`): the newest for a full
restore, or the last one from before the mistake. Then:

```sh
mkdir -p ~/toe-beans-restore && cd ~/toe-beans-restore
npx wrangler@4 r2 object get "toe-beans-backups/mongo/<file>" --remote --file dump.age
```

The file is encrypted, so it's safe on disk. It's only decrypted while being piped into
`mongorestore`, as below. Delete it when you're done.

## 3. Restore into a scratch database (the test, and a first step every time)

This works against the local compose database (`pnpm compose up -d --wait`). Prod is never touched.

```sh
LOCAL='mongodb://localhost:27027/?directConnection=true'   # MONGO_PORT from .env
age -d -i /path/to/toe-beans-backup.key dump.age |
	mongorestore --uri="$LOCAL" --archive --gzip --drop \
		--nsFrom='toe-beans.*' --nsTo='restore-check.*'
```

Compare it with prod, using the backup user's read-only string (Secret Manager
`backup-mongodb-uri`). Run this from the repo root:

```sh
SOURCE_URI="$(gcloud secrets versions access latest --secret=backup-mongodb-uri --project=toe-beans-co-za)" \
SOURCE_DB=toe-beans RESTORED_URI="$LOCAL" RESTORED_DB=restore-check infra/backup/compare.sh
```

Every collection should have the same indexes. Document counts should match, apart from writes
since the dump: `reminders` and today's logs are the usual ones. Then remove the copy:

```sh
mongosh --quiet "$LOCAL" --eval 'db.getSiblingDB("restore-check").dropDatabase()'
```

## 4. The test record

Run §2 and §3 before go-live, and then each quarter. Add a row each time. A failed test is
an S17 item, fixed before anything else.

| Date | Dump | Result | By |
|---|---|---|---|
| 18 Nov 2026 | The first prod dump, 18 Nov | Restored into a scratch database on the owner's machine; `compare.sh` matched prod. Copy, dump and key file cleared up afterwards | Owner |

## 5. A real restore into prod

Do §3 first, so you know the dump is good before prod changes.

1. **Stop writes.** Pause the tick, so no reminders go out against data that's about to change.
   People using the app meanwhile will lose what they enter, so pick a quiet hour.

   ```sh
   gcloud scheduler jobs pause toe-beans-tick --location me-central1 --project toe-beans-co-za
   ```

2. **Restore the database.** Use the app's own user, `toe-beans-app`, which can write to `toe-beans`
   (Secret Manager `mongodb-uri`). `--drop` replaces each collection in the dump with its backed-up
   contents, indexes included. `_migrations` comes back too, so the app won't migrate again.

   ```sh
   PROD="$(gcloud secrets versions access latest --secret=mongodb-uri --project=toe-beans-co-za)"
   age -d -i /path/to/toe-beans-backup.key dump.age |
   	mongorestore --uri="$PROD" --archive --gzip --drop --nsInclude='toe-beans.*'
   unset PROD
   ```

   - **To drop old sessions too,** so everyone signs in again against the restored data: run
     `db.sessions.deleteMany({})` in `mongosh`.
   - **To restore only part of the data,** say one household's dogs: restore into a scratch
     database as in §3 and copy back just those documents by hand. Don't use `--drop` against prod
     for that.

3. **Photos, if the bucket lost them.** Copy them back with a token that can write to
   `toe-beans-photos`. The app's own token can (its secret is `r2-secret-access-key`, its key ID
   the `production` environment's `R2_ACCESS_KEY_ID`). Copying leaves photos already in the bucket
   alone:

   ```sh
   export RCLONE_CONFIG=/dev/null \
   	RCLONE_CONFIG_R2_TYPE=s3 RCLONE_CONFIG_R2_PROVIDER=Cloudflare RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true \
   	RCLONE_CONFIG_R2_ENDPOINT="https://<account ID>.r2.cloudflarestorage.com" \
   	RCLONE_CONFIG_R2_ACCESS_KEY_ID='<app token key ID>'
   read -rs RCLONE_CONFIG_R2_SECRET_ACCESS_KEY && export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY
   rclone copy r2:toe-beans-backups/photos/current r2:toe-beans-photos --dry-run   # check, then without --dry-run
   ```

   This assumes the app's token also reads `toe-beans-backups`. If it's scoped to the photo bucket
   only, make a temporary Object Read & Write token for both buckets and delete it afterwards. A
   single photo deleted by mistake within 30 days is in `photos/replaced/<time>/` under the same
   key.

4. **Start again.** Resume the tick. Open the app, check Today, a dog's photo and History, and
   mark something done to see a write go through.

   ```sh
   gcloud scheduler jobs resume toe-beans-tick --location me-central1 --project toe-beans-co-za
   ```

5. Delete `dump.age`, and add a row to §4 noting it was a real restore.

## 6. If the Atlas cluster itself is gone

1. **Rebuild the cluster.** Create a new free cluster on AWS `af-south-1` (architecture §8.4). Recreate:
   - the network access entry
   - `toe-beans-app` with `readWrite` on `toe-beans`
   - `toe-beans-backup` with `read` on `toe-beans`
2. **Update the secrets** with the new connection strings:
   `infra/gcp/set-secret.sh mongodb-uri` and `infra/gcp/set-secret.sh backup-mongodb-uri`.
3. **Restore.** Follow §5 steps 1, 2 and 4, against the new string.
4. **Redeploy.** Re-run the Deploy workflow on `main` (Actions → Deploy → Run workflow). Cloud Run
   reads `mongodb-uri:latest` when an instance starts, and the redeploy makes sure none still holds
   the old one.
