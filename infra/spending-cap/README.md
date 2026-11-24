# The spending cap

Takes the app down when the month's GCP spend reaches the `toe-beans` budget (US$1), instead of
only mailing the owner (architecture D45, backlog S19.5). Bringing it back is by hand:
`docs/runbooks/spending-cap.md`. This file is public; it names resources, never values.

```
budget toe-beans ──▶ topic toe-beans-budget ──push (OIDC)──▶ Cloud Run toe-beans-cap
                                                               │ spend ≥ budget?
                                    ┌──────────────────────────┴───────────────┐
                                    ▼                                          ▼
              Cloud Run toe-beans: allUsers off the invokers      Scheduler toe-beans-tick: paused
                                    │
            Worker gets Cloud Run's 403 (no x-request-id) ──▶ maintenance page, 503
```

- **When.** Cloud Billing publishes the budget's state several times a day, crossed or not. The
  cap acts when `costAmount ≥ budgetAmount`: actual spend, never the forecast. Billing's figures
  lag the spend by hours to a day, so the cap stops a runaway, not the first cents over.
- **What it does** (`cap.js`). The app's service loses its public invoker (`allUsers`): the
  Worker's fetches are turned away by Cloud Run itself, no instance starts, and nothing bills. Then the
  tick's job is paused, since Scheduler is the one caller from inside Google. The access change
  takes effect for every request after a minute or two (about 70 s on prod). Each step looks
  first, so the repeated messages change nothing. A failed step answers 500 and Pub/Sub tries
  again, backing off to every 10 minutes.
- **What people see.** The Worker (`infra/edge/worker.js`) shows *Toe Beans is paused* with a
  503 when Cloud Run refuses a request before the app sees it (a 404 or 403 without the app's
  `x-request-id`), and plain text to API calls. The app's service worker shows that page as it
  is, rather than its own *Can't reach Toe Beans* (`x-toe-beans-maintenance`). Reminders stop.
- **How the owner hears.** The budget's own mail at 100%, then Better Stack: the `toe-beans`
  monitor goes down (`/readyz` gets the 503) and the `toe-beans-tick` heartbeat goes quiet.
- **Why the access list, not a flag at the edge.** A flag the Worker reads would need a Cloudflare
  token in GCP and a KV read per request. The app is public through its access list (`allUsers`
  may invoke it, with Cloud Run's invoker check on), and the cap can take `allUsers` off with a
  role scoped to the one service. The deploy doesn't touch the access list, and a deploy while
  it's closed fails at *Check it's ready* rather than quietly reopening the app.
- **Why not ingress** (the first build, S19.5): Cloud Run checks `actAs` on the runtime account
  (`toe-beans-run`) for any change to a service, ingress included, and the test on prod failed
  without it. With `actAs` the cap could deploy code that reads the app's secrets; editing the
  access list needs none.

## `provision.sh`

Run after `infra/gcp/provision.sh`, as the project owner; safe to re-run, and re-run it to deploy
a change to the cap's code.

| Step | What it makes | Why |
|---|---|---|
| APIs | Pub/Sub, Run, Cloud Build, Artifact Registry, Scheduler, Billing Budgets | What the steps below use |
| Service accounts | `toe-beans-cap` (the cap); `toe-beans-build` (Cloud Build for the cap's source deploys, `roles/run.builder`) | One identity per job. `toe-beans-build` was the S-1.3 spike's, kept for this |
| Roles | Custom `toe_beans_cap_scheduler` (`cloudscheduler.jobs.get`, `.pause`) on the project; custom `toe_beans_cap_run` (`run.services.get`, `.getIamPolicy`, `.setIamPolicy`) on service `toe-beans` only | Only what `cap.js` calls. Scheduler has no per-job IAM. No `.update` and no `actAs` on `toe-beans-run`, so the cap can't deploy a revision that runs with the app's secrets; a role it grants on the service can't either |
| Service | Cloud Run `toe-beans-cap` in `africa-south1`, built from this directory: internal ingress, no unauthenticated calls, 0–1 instances, 256 MiB | Only the push below reaches it; Cloud Run checks the push's token |
| Images | Cleanup policy on `cloud-run-source-deploy` (keeps 2) | The 0.5 GB free tier is shared with the app's images |
| Pub/Sub | Topic `toe-beans-budget` (Cloud Billing may publish); push subscription `toe-beans-cap`, OIDC as `toe-beans-cap`, audience the cap's URL, retries 10 s to 10 min, a day's retention | The push's account may invoke the cap and nothing else |
| Budget | `toe-beans` publishes to the topic, mails unchanged | From here on the cap is live |

**Before the first run** look at the month's spend (**Billing → Reports**): if it's already at the
budget, the first message takes the app down.

## Tests

`cap.test.js` (the decision and the API calls against a fake) and `infra/edge/worker.test.js`
(the maintenance page) run in `pnpm test`. On prod: the runbook's §2.
