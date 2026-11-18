# Runbook: Monitoring

What tells the owner that prod needs attention (architecture §9, D10, D37; backlog S14.4). This
file is public. It names monitors and settings, never URLs that hold a token.

| Watches | How | Alerts when | Set up |
|---|---|---|---|
| The app answering, end to end | Better Stack monitor `toe-beans` on `https://toebeans.co.za/readyz`, every 3 minutes | Anything but a 2xx: DNS, Cloudflare, the Worker, Cloud Run, or the database (`/readyz` pings Mongo) | §2 |
| Reminders being sent | Better Stack heartbeat `toe-beans-tick`, called by the app after each tick | No tick for 15 minutes: Cloud Scheduler stopped or can't get in, or ticks fail | §3 |
| Backups being made | Better Stack heartbeat `toe-beans-backup`, called by the backup workflow after a run that worked | No good run for a day and 3 hours, including a run that never started | §4 |
| A failed backup run | GitHub's own mail to the owner | At once | Nothing to do |
| Errors in the app | Sentry, `New or regressed issue` | A new kind of error, or one coming back | `sentry.md` §4 |
| Spend | GCP budget `toe-beans` (US$1) | 50% and 100% of spend, 100% forecast | `provision.sh` |

## 1. The account

1. Sign up at betterstack.com (free plan: 10 monitors and heartbeats together, 3-minute checks,
   email alerts). Use the owner's own email address; nobody else needs a seat.
2. Turn on two-factor authentication (profile settings).
3. Name the team `toe-beans`.

Better Stack holds no data from the app: it sees the answer from `/readyz` and when the heartbeats
are called, nothing else.

## 2. The uptime monitor

**Uptime → Monitors → Create monitor:**

- **Alert us when:** URL becomes unavailable.
- **URL:** `https://toebeans.co.za/readyz`. Through the Worker on purpose, so it covers the whole
  path a phone takes. `/readyz` answers 503 when the database doesn't. No rate limit applies to it.
- **Name:** `toe-beans`. **Check frequency:** 3 minutes. **On-call escalation:** email.
- Leave the confirmation period at its default: a cold start answers within a few seconds (§8.4).

Check it: the monitor shows *Up* within a few minutes.

## 3. The tick's heartbeat

**Uptime → Heartbeats → Create heartbeat:**

- **Name:** `toe-beans-tick`. **Expect a heartbeat every:** 5 minutes. **Grace period:** 10 minutes.
- **On-call escalation:** email.

Copy its URL (`https://uptime.betterstack.com/api/v1/heartbeat/…`). The end of it is the token, so
it goes in Secret Manager, not GitHub (D15):

```sh
infra/gcp/provision.sh                        # creates tick-heartbeat-url if it's missing
infra/gcp/set-secret.sh tick-heartbeat-url    # paste the URL
```

The deploy mounts it as `TICK_HEARTBEAT_URL`, so **fill it before the next deploy**, or the deploy
fails on a secret with no version. After the deploy, the startup log line `backend started` shows
`tickHeartbeat: true`, and the heartbeat goes *Up* with the next tick.

## 4. The backup's heartbeat

**Uptime → Heartbeats → Create heartbeat:**

- **Name:** `toe-beans-backup`. **Expect a heartbeat every:** 1 day. **Grace period:** 3 hours
  (GitHub sometimes starts scheduled runs late).
- **On-call escalation:** email.

```sh
infra/gcp/provision.sh                          # creates backup-heartbeat-url, readable by toe-beans-backup only
infra/gcp/set-secret.sh backup-heartbeat-url    # paste its URL
```

Fill it before the next run from `main`: without a value, the run's last step fails and mails you.
Then run **Actions → Backup → Run workflow** on `main`; the heartbeat goes *Up*.

## 5. When an alert comes

| Alert | Look first at |
|---|---|
| `toe-beans` down | Open `https://toebeans.co.za`. Then Cloud Run's logs (`gcloud run services logs read toe-beans --region africa-south1 --project toe-beans-co-za --limit 50`), Atlas's cluster status, and Cloudflare's status page. A 503 from `/readyz` is the database; a 403 is the Worker's header secret (`infra/edge/README.md`) |
| `toe-beans-tick` silent | `gcloud scheduler jobs describe toe-beans-tick --location me-central1 --project toe-beans-co-za`: paused? Its last attempt's status? Then Cloud Run's logs for `tick refused` (the token's audience or invoker) or `heartbeat failed` (Better Stack unreachable, so the ticks themselves ran) |
| `toe-beans-backup` silent | **Actions → Backup**: did it run? GitHub turns schedules off after 60 days without commits; turn it back on there. A failed run has already mailed you |
| Sentry | `sentry.md` |

Once ticks resume, reminders that fell due in the last 30 minutes still go out (the tick's
look-back, architecture §6.3); older ones don't. Today always shows what's due.

## Changing a heartbeat's URL

If a URL leaks, someone could call it and hide a real silence. Delete the heartbeat in Better
Stack, make a new one with the same settings, put its URL in the secret with `set-secret.sh`, and
redeploy (the tick's) or wait for the next run (the backup's).
