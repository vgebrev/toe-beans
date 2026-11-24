# The app's Cloudflare Worker

Serves `toebeans.co.za` by forwarding every request to the Cloud Run service, and redirects `www`
to the apex (architecture §8.4, D13). It adds the header secret the app requires (`PROXY_SECRET`,
D32) and the phone's address for the rate limits (`x-toe-beans-client`, §7). It replaces the
holding page (`infra/holding-page`).

## Deploy

Needs `gcloud` signed in as the project owner, and `npx wrangler@4 login` once. From this directory:

```sh
# The Worker's copy of the secret, straight from Secret Manager; it never touches a file.
../gcp/app-secrets.sh get PROXY_SECRET | npx wrangler@4 secret put PROXY_SECRET
npx wrangler@4 deploy
```

The first deploy takes over the custom domains from the holding page's Worker; if wrangler refuses
because they're attached there, delete that one first (`npx wrangler@4 delete --name toe-beans-holding`),
which leaves the site down until this deploy finishes.

After rotating the secret (`infra/gcp/app-secrets.sh generate PROXY_SECRET`), put it here again, then
redeploy the app so it picks up the new version.

## Checks (S14.1)

- `curl -sI https://toebeans.co.za/service-worker.js` shows `cache-control: no-cache` and no
  `cf-cache-status: HIT` (S17.12): Cloudflare would otherwise cache it for hours, and phones
  keep the build before a deploy.

- `curl -sI https://toe-beans-1047834821273.africa-south1.run.app/` answers 403: no page or API
  call goes round the Worker. The build's static files (`/_app/`, `/service-worker.js`, icons)
  still answer there, as adapter-node serves them before the app checks the secret (backlog
  S17.13).
- `curl -s https://toebeans.co.za/readyz` answers `{"status":"ready"}`.
- The rate limit keys on the phone, not on Cloudflare (the address is never logged, NFR-02): open
  `https://toebeans.co.za/auth/sign-in` 16 times quickly on mobile data until it says to wait, then
  check a laptop on Wi-Fi still signs in.
- Worker logs stay off (`observability` in `wrangler.jsonc`); Cloudflare's own request analytics
  are visible only to the account owner.

## The maintenance page (S19.5)

When the spending cap closes Cloud Run's ingress (architecture D45, `infra/spending-cap`), Cloud
Run turns the Worker's fetches away itself, with a 404 or 403 that lacks the app's `x-request-id`.
The Worker answers those with *Toe Beans is paused* (503, `no-store`, `x-toe-beans-maintenance`,
which the app's service worker lets through), or plain text to a request that doesn't accept
HTML. `/_app/` files are left as they are, since adapter-node answers a missing one without the
app's header. Nothing to set up here; `worker.test.js` covers it, and the cap's runbook
(`docs/runbooks/spending-cap.md` §2) checks it live.

## No scripts added at the edge (S19.3)

Cloudflare can add a script to the app's pages without any change in our code: Web Analytics
(its beacon, `static.cloudflareinsights.com`, which sends page views and timings to
`cloudflareinsights.com`), Real User Measurements (the same beacon), Zaraz and Rocket Loader.
All of them stay off; Toe Beans tracks nobody (privacy policy). The app's CSP would block their scripts anyway
(`script-src 'self'` with a nonce, `connect-src 'self'`; `e2e/smoke.spec.ts` keeps it so), but
then each page would log a CSP error, so turn them off rather than rely on the block.

In the dashboard:

- **Account home → Analytics & Logs → Web Analytics**: `toebeans.co.za` is not listed, or its
  *Manage site* shows it disabled (not *Enable* or *Enable, excluding visitor data in the EU*).
  On a proxied zone it can be switched on there automatically, with no snippet in our pages.
- **toebeans.co.za → Speed → Observatory**: Real User Measurements (RUM) are off; they use the
  same beacon.
- **toebeans.co.za → Zaraz** has no tools, and **Speed → Settings** has Rocket Loader off.

Email address obfuscation (**Scrape Shield**) is left at Cloudflare's default, on. It isn't
tracking: its script is served from our own address under `/cdn-cgi/` and sends nothing. It doesn't
touch the Worker's responses either: the terms and privacy policy show `support@` and `privacy@` in
plain text. If it ever did, those pages would hide the addresses until the script ran.

Then, after any change at Cloudflare, check the pages carry nothing extra:

```sh
for p in terms privacy; do curl -s https://toebeans.co.za/$p | grep -c 'cloudflareinsights\|zaraz\|rocket-loader'; done
```

Each line prints `0`. Checked 23 Nov 2026, after Web Analytics (it was on for the zone) and RUM
were turned off.

What stays without the beacon: the zone's request analytics (**toebeans.co.za → Analytics &
Logs**: requests, bandwidth, status codes, countries, cache), counted at the edge with no script
and seen only by the account owner; the Worker's request and error counts; Cloud Run's metrics and
logs; and Sentry for errors in the browser and on the server.

## Scanners blocked before the Worker (S17.3)

Bots probe for secrets and other software's admin pages. The app answers them with a plain 404,
but each one still costs a Worker request and wakes Cloud Run. A WAF custom rule (free plan: 5
rules, no regex) blocks the obvious ones at Cloudflare, before the Worker runs.

In the dashboard: **toebeans.co.za → Security → Security rules → Create rule → Custom rule**,
name `toe-beans-scanners`, *Edit expression*, paste the expression below, action **Block**, deploy.

```
(lower(http.request.uri.path) contains "/." and not starts_with(http.request.uri.path, "/.well-known/"))
or ends_with(lower(http.request.uri.path), ".php")
or lower(http.request.uri.path) contains ".php/"
or ends_with(lower(http.request.uri.path), ".asp")
or ends_with(lower(http.request.uri.path), ".aspx")
or ends_with(lower(http.request.uri.path), ".jsp")
or ends_with(lower(http.request.uri.path), ".cgi")
or ends_with(lower(http.request.uri.path), ".env")
or ends_with(lower(http.request.uri.path), ".ini")
or ends_with(lower(http.request.uri.path), ".sql")
or ends_with(lower(http.request.uri.path), ".bak")
or ends_with(lower(http.request.uri.path), ".yml")
or ends_with(lower(http.request.uri.path), ".yaml")
or starts_with(lower(http.request.uri.path), "/wp-")
or starts_with(lower(http.request.uri.path), "/wordpress")
or starts_with(lower(http.request.uri.path), "/phpmyadmin")
or starts_with(lower(http.request.uri.path), "/cgi-bin")
or starts_with(lower(http.request.uri.path), "/actuator")
or starts_with(lower(http.request.uri.path), "/graphql")
or starts_with(lower(http.request.uri.path), "/v2/_catalog")
or starts_with(lower(http.request.uri.path), "/vendor/")
or starts_with(lower(http.request.uri.path), "/boaform")
```

None of the app's paths fall under it: its routes, `/_app/…` build files, `/icons/…`,
`/fonts/…` (the login page's font, S19.2), `/manifest.webmanifest`, `/robots.txt` and `/.well-known/security.txt` (a `/.` anywhere else is a
dotfile or `..`). A route added later under one of those prefixes would need the rule changed.

Checks, once deployed:

- `curl -s -o /dev/null -w '%{http_code}\n' https://toebeans.co.za/.env` answers 403, and so does
  `/wp-login.php`.
- `curl -s https://toebeans.co.za/.well-known/security.txt` gives the contact, and
  `curl -s https://toebeans.co.za/readyz` `{"status":"ready"}`.
- Opening the app and a reminder on a phone still works.
- **Security → Events** lists what the rule blocked.

What it misses reaches the app, which gives anything that isn't a browser's page load and matches
no route a short `Not found` 404, without a session lookup and logged at debug only.
