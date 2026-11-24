# Runbook: The spending cap

When the month's GCP spend reaches the `toe-beans` budget, the cap takes the app down: the edge
shows *Toe Beans is paused*, Cloud Run turns the edge Worker away (its account `toe-beans-edge` is
off the app's invokers), and the tick's Scheduler job is paused (architecture D45; backlog S19.5). How it works and how it's set up:
`infra/spending-cap/README.md`. This file is public; it names resources, never values.

Coming back is always by hand, after you know why it tripped.

## 1. It tripped

You'll hear from the budget's mail (100% of spend) and from Better Stack (`toe-beans` down,
`toe-beans-tick` quiet). Check it was the cap, not an outage:

```sh
curl -sI https://toebeans.co.za/ | grep -i 'x-toe-beans-maintenance'      # present: the cap
gcloud run services get-iam-policy toe-beans --region africa-south1 --format='value(bindings.members)'
gcloud scheduler jobs describe toe-beans-tick --location me-central1 --format='value(state)'
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="toe-beans-cap" AND severity>=WARNING' \
	--limit 5 --freshness 2d --format='value(timestamp,jsonPayload.message,jsonPayload.cost,jsonPayload.budget)'
```

The access list has no `toe-beans-edge` (and no `allUsers`), the job reads `PAUSED`, and the log
has *spending cap reached*.

## 2. Testing it (on prod, in a quiet hour)

First a message under budget, which must change nothing:

```sh
gcloud pubsub topics publish toe-beans-budget --project toe-beans-co-za \
	--message='{"budgetDisplayName":"toe-beans","costAmount":0.01,"budgetAmount":1,"currencyCode":"USD"}'
```

Within a minute the cap's log (§1's last command, without `severity>=WARNING`) shows *budget
message, no action* with `under budget`, and the app still answers.

Then one at the budget, which takes the app down:

```sh
gcloud pubsub topics publish toe-beans-budget --project toe-beans-co-za \
	--message='{"budgetDisplayName":"toe-beans","costAmount":1,"budgetAmount":1,"currencyCode":"USD"}'
```

Check §1's list, and on a phone: the installed app opens on *Toe Beans is paused*, not *Can't
reach Toe Beans*. Then bring it back with §4 (no need to raise the budget: the real spend is
under it). Record the date in §6.

## 3. Find out why

Don't bring it back until you know, or it trips again and keeps costing.

- **Billing → Reports**, this month, grouped by SKU: which service, and since when.
- Cloud Run `toe-beans` **Metrics**: request count and instance time. A flood shows as requests;
  something stuck awake shows as instance time without requests.
- Cloudflare **toebeans.co.za → Analytics & Logs** and **Security → Events**: where a flood came
  from. A WAF rule (`infra/edge/README.md`) or rate limiting rule stops it at the edge.
- The app's logs: `gcloud logging read 'resource.labels.service_name="toe-beans"' --freshness 1d`.

## 4. Bring it back

Budget figures are for the calendar month (UTC). If this month's spend is still at or over the
budget, the next budget message trips the cap again within hours, so first raise the budget above
what's been spent, and lower it again next month:

```sh
account=$(gcloud billing projects describe toe-beans-co-za --billing-project toe-beans-co-za --format='value(billingAccountName)')
account=${account#billingAccounts/}
budget=$(gcloud billing budgets list --billing-project toe-beans-co-za --billing-account="$account" --filter=displayName=toe-beans --format='value(name)')
gcloud billing budgets update "$budget" --billing-project toe-beans-co-za --billing-account="$account" --budget-amount=5USD
```

Then open the app and resume the tick, in that order:

```sh
gcloud run services add-iam-policy-binding toe-beans --region africa-south1 \
	--member=serviceAccount:toe-beans-edge@toe-beans-co-za.iam.gserviceaccount.com --role=roles/run.invoker
curl -s https://toebeans.co.za/readyz                               # {"status":"ready"}
gcloud scheduler jobs resume toe-beans-tick --location me-central1
```

Check: the app opens on a phone, Better Stack's monitor comes back up, the tick's heartbeat within
15 minutes. Reminders that fell due in the last 30 minutes go out with the first tick; older ones
while it was down are never sent (`LOOKBACK_MS`, architecture §6.3), so tell the household if it
was down for long.

**Next month:** put the budget back to US$1 (`--budget-amount=1USD`) once the 1st's figures are
in.

## 5. Things to know

- **It bites after a minute or two, not at once.** Google takes a while to apply an access-list
  change: on the 24 Nov test the app kept answering, saves included, for about 70 seconds after
  the cap's change, then refused everything at the same moment, open apps included. It can take
  up to about 7 minutes. Check §1 after that, not straight away.
- **Deploying while it's down fails** at *Check it's ready* (the deploy checks `/readyz` through
  the Worker, which shows the paused page), and the app stays closed: a deploy doesn't touch the
  access list. That's on purpose. Neither does `infra/gcp/provision.sh` once the service
  exists, so re-running it doesn't reopen the app.
- The cap only acts on the `toe-beans` budget's messages, and only on spend, never on the
  forecast. A message it can't read is acknowledged and ignored.
- Only the owner can publish to the topic, so nobody else can trip it.
- **Turning it off** (don't, but if it misfires), with `$account` and `$budget` from §4: `gcloud billing budgets update "$budget"
  --billing-project toe-beans-co-za --billing-account="$account" --clear-notifications-rule-pubsub-topic`. The mails
  stay; `infra/spending-cap/provision.sh` reconnects it.

## 6. Log

| Date | What | Notes |
|---|---|---|
| 24 Nov 2026 | §2 test on prod (1.1.0-rc.1) | The first build's ingress change was refused (`actAs`); rebuilt to take `allUsers` off the access list. Then: under budget, no action; at budget, the app closed and the tick paused; the phone showed *Toe Beans is paused*; reopened with §4. |
