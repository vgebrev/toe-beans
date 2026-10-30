# Spikes S-1.1 to S-1.3: installable PWA with Web Push, on Cloud Run

Throwaway spike (backlog S-1.1 to S-1.3). A minimal SvelteKit 3 app on `adapter-node` that Chrome on Android
can install. S-1.2 added Web Push and S-1.3 deploys it to Cloud Run. It is **not** the start of
`apps/web`; S0 sets that up properly.

What it has:

- `static/manifest.webmanifest`: standalone display, Beagle colours, `any` and `maskable` icons.
- `src/service-worker/index.ts`: precaches build output, static files and the prerendered
  `/offline` page. Navigations go network-first, falling back to `/offline`. Nothing else is cached
  (architecture §7).
- `/`: a status page showing display mode, service worker state, connection, build version and
  user agent, with an **Install app** button when Chrome fires `beforeinstallprompt`.
- `/healthz`: plain `ok` for health checks.
- **Push (S-1.2):** a *Push test* panel on `/` subscribes the device (VAPID) and asks the server to
  send a test reminder now or after a delay picked on a slider (10 s steps for the first
  minutes, up to 2 h), with `high` or `normal` urgency. The service worker
  shows the notification, reports `received` and `clicked` back to the server, and a tap opens
  `/sessions/{pushId}` (the deep link). Subscriptions and the delivery log live in `./data`
  (gitignored). Delayed sends wait in an in-memory queue, so **keep the server running until they
  fire**; restarting it drops pending sends but keeps subscriptions. Locally a 5 s loop drains the
  queue; on Cloud Run the scheduler's tick does, so sends go out up to a minute after they're due.
- **Cloud Run (S-1.3):** `POST /internal/tick` accepts only an OIDC token that Cloud Scheduler signs
  as the `toe-beans-tick` service account, and logs each tick's lag. Every response carries
  `x-instance: <id>; age=<s>` and each instance logs `instance started` and `first request`, so
  cold starts show up. A 502/503/504 on a page load shows the cached *Can't reach Toe Beans* page.
- Icons: `scripts/paw.svg` is a placeholder paw print (the real logo is S0.9). Regenerate the PNGs
  with `pnpm icons`.

## Run

```sh
pnpm install
pnpm vapid          # once: writes VAPID keys to .env (keep them, or subscriptions break)
pnpm build
PORT=3000 pnpm start
```

`pnpm start` is `node --env-file=.env build`; plain `node build` won't see the VAPID keys.

## Deploy to Cloud Run (S-1.3)

Once per project (after `gcloud auth login`):

```sh
gcloud config set project toe-beans-co-za
gcloud config set run/region africa-south1
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com cloudscheduler.googleapis.com
scripts/gcp-setup.sh     # service accounts, VAPID private key into Secret Manager
```

Then `scripts/gcp-deploy.sh` builds in Cloud Build (no local Docker needed), deploys
`toe-beans-spike` to `africa-south1` and creates or updates the `toe-beans-tick` job (every minute,
in `me-central1`: Cloud Scheduler isn't offered in Johannesburg). The VAPID keys come from `.env`,
so devices subscribed against the deployed URL keep working across redeploys. State in `./data` is
per instance and lost when Cloud Run recycles it (fine for a spike; S-1.4 brings Atlas).

Measuring:

- **Cold start (≤ 5 s):** pause the tick (`gcloud scheduler jobs pause toe-beans-tick --location
  me-central1`), wait 20+ min, then `pnpm coldstart <url>`. The first line is cold if its instance
  is new with a small `age`. Resume the job afterwards. Also time opening the app on each phone.
- **Tick reliability (48 h):** `pnpm ticks` reads the tick log from Cloud Logging and reports
  missing minutes, lag percentiles and scheduler errors.
- **Cost ($0):** Billing → Reports, filtered to the project, grouped by SKU. Check the cost
  *before* credits is $0, so the free tier (not the trial credit) is what covers it.

## Test on a phone

Installing needs HTTPS (or `localhost`). Two options:

1. **Cloudflare quick tunnel** (no account needed): run `cloudflared tunnel --url http://localhost:3000`
   and open the printed `https://*.trycloudflare.com` URL on the phone. The URL changes on every
   run, and each new URL counts as a different app on the phone.
2. **USB + adb**: `adb reverse tcp:3000 tcp:3000`, then open `http://localhost:3000` on the phone.

Checklist for each phone (Galaxy S23 FE, Redmi Note 12 Pro):

- [ ] **Install app** button appears, or Chrome menu → *Install app* (not just *Add to home screen*).
- [ ] The home-screen icon is the paw on cream, not clipped (maskable icon).
- [ ] Launching from the icon opens without browser UI, and the page shows `standalone (installed)`.
- [ ] Service worker shows `activated`.
- [ ] In flight mode, relaunching shows the *You're offline* page, not Chrome's dinosaur. (Stopping
      the server behind the tunnel doesn't test this: Cloudflare still answers with a 502 page, and
      the service worker passes any real HTTP response through.)
- [ ] Note the user agent and Chrome version from the page.

## S-1.2 push checklist

Use the same tunnel URL for the whole session: a new URL is a new origin, which means a new install
and a new subscription. In the *Push test* panel, enable notifications on each phone (the device name
is pre-filled), then work through these. The delivery log on the page (tap *Refresh*) shows
`sent` / `received` / `clicked` with timings; `received` means the phone's service worker woke up.

| # | Scenario | How |
|---|---|---|
| 1 | App open | *Send now* |
| 2 | App closed (swiped away from recents) | 30 s, then close the app |
| 3 | Screen off | sweep 40 s → 5 min, lock the phone and leave it (find where delivery starts failing) |
| 4 | Idle / Doze | 30 min or 2 h, phone locked and still (not charging) |
| 5 | Normal vs high urgency | repeat 4 with *normal* |
| 6 | After reboot | *5 min*, reboot the phone straight away, don't open the app |
| 7 | Deep link | tap a notification with the app closed: it should open `/sessions/…` in the installed app, not a Chrome tab |

For each, record: arrived (yes/no), how late (the log's `received … after send`), and whether a tap
opened the right screen. If something doesn't arrive, note which settings fixed it, e.g.
Samsung: *Battery → Background usage limits* (Chrome not sleeping); Xiaomi: *Autostart* on for
Chrome, *Battery saver → No restrictions*, lock Chrome in recents.
