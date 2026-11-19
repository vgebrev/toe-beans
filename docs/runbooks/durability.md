# Runbook: Durability check

Shows that prod's data survives a deployment and a restart (requirements scenario 10, NFR-05;
backlog S14.6). The app keeps no state in its container: Mongo, the photo bucket and the reminder
ledger live outside it (architecture §3, D27). Cloud Run already starts and stops instances many
times a day, so this check confirms the design on prod rather than testing something new. This
file is public. It names resources, never values.

A redeploy from the Deploy workflow does both at once: it builds and deploys a new revision, and
every running instance is replaced by a fresh one.

## 1. Before

1. **Counts.** From the repo root, with the backup user's read-only string:

   ```sh
   SOURCE_URI="$(gcloud secrets versions access latest --secret=backup-mongodb-uri --project=toe-beans-co-za)" \
   	infra/backup/counts.sh > ~/durability-before.txt
   ```

2. **On the phone,** with the installed app, note what you'll look for afterwards:
   - a dog's profile and its photo
   - a logged session in History
   - a planned session or care task with a reminder due **after** the redeploy, about 15–30 minutes
     out
   - More → Notifications shows this device as receiving reminders

## 2. Redeploy

Actions → Deploy → Run workflow on `main`, and approve the `production` environment. When it's
done, check that Cloud Run has a new revision serving 100% of traffic:

```sh
gcloud run services describe toe-beans --region africa-south1 --project toe-beans-co-za \
	--format='value(status.latestReadyRevisionName,status.traffic[0].percent)'
```

## 3. After

1. **Counts again,** into `~/durability-after.txt`, then `diff ~/durability-before.txt
   ~/durability-after.txt`. Nothing should have fewer documents. `reminders`, `sessions` and
   `_locks` may have more, from the tick and sign-ins in between.
2. **On the phone,** close the app fully and open it again. Check the photo, History and the
   planned item from §1.2.
3. **Leave the app closed** until the reminder is due. It should arrive, and tapping it should open
   the item. That shows the push subscription and the schedule both survived.
4. Delete both count files and add a row below.

## 4. The record

| Date | Revision before → after | Result | By |
|---|---|---|---|
| 18 Nov 2026 | `toe-beans-00007-nc8` → `toe-beans-00008-x4l`, by the Deploy workflow | Counts matched, apart from the tick's and sign-ins' writes; photo, History and the planned item there after reopening the app; the reminder arrived with the app closed and opened its item | Owner |
