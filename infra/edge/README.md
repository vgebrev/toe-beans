# The app's Cloudflare Worker

Serves `toebeans.co.za` by forwarding every request to the Cloud Run service, and redirects `www`
to the apex (architecture §8.4, D13). It adds a Google ID token, without which Cloud Run turns the
request away (`x-serverless-authorization`, D45; below), the header secret the app requires
(`PROXY_SECRET`, D32) and the phone's address for the rate limits (`x-toe-beans-client`, §7). It
replaces the holding page (`infra/holding-page`).

## Deploy

Needs `gcloud` signed in as the project owner, and `npx wrangler@4 login` once. From this directory:

```sh
# The Worker's copy of the secret, straight from Secret Manager; it never touches a file.
../gcp/app-secrets.sh get PROXY_SECRET | npx wrangler@4 secret put PROXY_SECRET
# Its signing key (below), once; it answers 500 without one.
node edge-key.mjs
npx wrangler@4 deploy
```

The first deploy takes over the custom domains from the holding page's Worker; if wrangler refuses
because they're attached there, delete that one first (`npx wrangler@4 delete --name toe-beans-holding`),
which leaves the site down until this deploy finishes.

After rotating the secret (`infra/gcp/app-secrets.sh generate PROXY_SECRET`), put it here again, then
redeploy the app so it picks up the new version.

## Google's invoker check (D45, security audit R1)

Only Cloud Run's invokers reach the app: this Worker, as the service account `toe-beans-edge`, and
the tick. Google turns everyone else away with a 403 before an instance starts, so a flood sent
straight to `run.app` costs nothing and can't trip the spending cap, and `/readyz` there can't
be used to ping the database.

The Worker has no identity Google knows, and the org refuses service account keys, so it proves
itself through Workload Identity Federation (`google-identity.js`):

1. It signs a five-minute JWT (`iss` `https://toebeans.co.za`, `sub` `toe-beans-edge`) with its
   private key, the Worker secret `EDGE_KEY`.
2. Google's STS checks it against the public key in the provider `toe-beans-edge` of the pool
   `cloudflare`, and returns a federated token.
3. With that token, the IAM Credentials API issues an ID token for `toe-beans-edge`, audience the
   `run.app` URL, valid for an hour.

Each isolate keeps the ID token in memory and gets a new one five minutes before it expires: a
few exchanges an hour, all free. It goes in `x-serverless-authorization`, so a client's own
`Authorization` reaches the app untouched. If Google won't issue a token, or Cloud Run rejects
it (401), the Worker answers 502, which the app's service worker shows as *Can't reach Toe
Beans*, not the paused page.

**The key.** `node edge-key.mjs` makes an RSA pair in memory, puts the public half in the provider
(making it the first time), keeping the previous key so the Worker can still use it until the
new secret is live, and pipes the private half to `wrangler secret put EDGE_KEY`. Nothing is
written to disk or printed. Rotate by running it again (each run retires the key before the
last); do so if `EDGE_KEY` may have leaked. What a leaked key allows: calling the app the way the
Worker does, which is also all `PROXY_SECRET` allows today.

### Switching it on (once, from `allUsers`)

In this order, so the app stays up throughout:

1. `infra/gcp/provision.sh`: makes `toe-beans-edge` and the pool, and adds `toe-beans-edge` and
   `toe-beans-tick` to the app's invokers next to `allUsers`.
2. From here: `node edge-key.mjs`, then `npx wrangler@4 deploy`. The Worker now sends its token;
   with `allUsers` still an invoker, nothing changes yet. `curl -s https://toebeans.co.za/readyz`
   answers `{"status":"ready"}` (a 502 means the exchange failed: check the provider).
3. `infra/spending-cap/provision.sh`: the cap now closes `toe-beans-edge` as well as `allUsers`.
4. Release the app with the deploy's new check, which goes through the Worker, as usual.
5. Take `allUsers` off:

   ```sh
   gcloud run services remove-iam-policy-binding toe-beans --region africa-south1 \
   	--member=allUsers --role=roles/run.invoker
   ```

   It takes a minute or two to bite (`docs/runbooks/spending-cap.md` §5). Then the checks below,
   and within 15 minutes the `toe-beans-tick` heartbeat in Better Stack: Scheduler's token now
   goes through Cloud Run's check before the app checks it again. If the app shows a 502 or the
   heartbeat stays quiet, put `allUsers` back (`add-iam-policy-binding`, same flags) and look.
6. Run the cap's test (`docs/runbooks/spending-cap.md` §2) and reopen it with §4 there.
7. A refusal is free: Cloud Run's pricing page says requests are billed only once they reach the
   container after authenticating, and requests denied by IAM policy aren't (confirmed 25 Nov,
   security audit R1). Done on prod 25 Nov.

`PROXY_SECRET` stays as the app's second lock behind Google's.

## Checks (S14.1)

- `curl -sI https://toebeans.co.za/service-worker.js` shows `cache-control: no-cache` and no
  `cf-cache-status: HIT` (S17.12): Cloudflare would otherwise cache it for hours, and phones
  keep the build before a deploy.

- `curl -sI https://toe-beans-1047834821273.africa-south1.run.app/readyz` answers 403 without
  an `x-request-id`: Google turned it away, not the app. So does every other path, the build's
  static files included (before D45's invoker check, adapter-node served those without the
  secret, backlog S17.13).
- `curl -s https://toebeans.co.za/readyz` answers `{"status":"ready"}`.
- The rate limit keys on the phone, not on Cloudflare (the address is never logged, NFR-02): open
  `https://toebeans.co.za/auth/sign-in` 16 times quickly on mobile data until it says to wait, then
  check a laptop on Wi-Fi still signs in.
- Worker logs stay off (`observability` in `wrangler.jsonc`); Cloudflare's own request analytics
  are visible only to the account owner.

## The maintenance page (S19.5)

When the spending cap takes `toe-beans-edge` off the app's invokers (architecture D45,
`infra/spending-cap`), Cloud Run turns the Worker's fetches away itself, with a 403 (or 404) that
lacks the app's `x-request-id`.
The Worker answers those with *Toe Beans is paused* (503, `no-store`, `x-toe-beans-maintenance`,
which the app's service worker lets through), or plain text to a request that doesn't accept
HTML. `/_app/` files are left as they are, since adapter-node answers a missing one without the
app's header. The page loads nothing from the app, which is closed: the mark is bundled in from
`apps/web/src/lib/assets/brand/mark.ts`, and its fonts (the app's Latin Nunito and Fredoka) are
the Worker's static assets in `assets/edge-fonts/`, which Cloudflare serves before the Worker runs
(`assets/_headers` caches them a day). After a font upgrade in the app, `worker.test.js` fails
until the new files are copied over and the Worker deployed. Nothing to set up here;
`worker.test.js` covers it, and the cap's runbook (`docs/runbooks/spending-cap.md` §2) checks it
live.

## The landing page (S21, architecture D44)

`assets/landing/` is the public page at `/` (ui.md §4.9): `index.html`, `landing.css`, the
favicon and the app's screenshots. The Worker serves it, through its `ASSETS` binding, to a `GET`
or `HEAD` of `/` with no query and no `__Host-tb_session` cookie, before it mints a token, so a
visitor never reaches Cloud Run. Everything else, `/` with the cookie or a query (the installed
app opens on `/?source=pwa`), goes to the app as before. It needs nothing from the app, so it
shows while the spending cap has the app paused too.

- **Changing it:** edit the HTML or CSS and deploy the Worker (§Deploy). `pnpm test infra/edge`
  checks it loads only its own files, and draws the app's mark, outcome icons,
  colours and favicon. Its one script applies the app's theme choice, and the CSP (`worker.js`
  `LANDING_THEME_SCRIPT`, and `assets/_headers`) allows it by its hash: change the script and the
  test gives the new hash.
- **Its pictures of the app:** `pnpm landing:shots` (with Mongo and the mock provider up, as for
  `pnpm test:e2e`) captures Today and the log sheet from the production build and writes the
  `.webp` files here. Take them again after a change to those screens, and commit them.
- **Looking at it locally:** any static server on `assets/` with `/` mapped to
  `/landing/index.html`; the files use absolute paths, so opening the file directly won't style it.

Checks, once deployed:

- In a private window, `https://toebeans.co.za/` shows the page; *Sign in* goes to Auth0, and once
  signed in `/` is Today.
- `curl -sI https://toebeans.co.za/` shows `cache-control: private, no-cache`, `vary: Cookie` and the
  CSP with `default-src 'none'`, and `curl -s https://toebeans.co.za/ | grep -c '<script'` prints `0`.
- The installed app still opens on Today (Chrome picks up the new `start_url` by itself).

### Search and link previews (S21.3)

`assets/robots.txt` and `assets/sitemap.xml` are served by Cloudflare before the Worker, in place
of the app's own `robots.txt` (which shuts crawlers out, for anywhere the edge isn't in front). The
sitemap lists `/`, `/terms` and `/privacy`; `robots.txt` keeps crawlers off `/api/`, `/auth/`,
`/internal/` and `/join/`. The app answers `X-Robots-Tag: noindex` everywhere else. The landing
page's share card, `landing/share.png`, comes from `pnpm landing:shots` with the screenshots.

Checks, once deployed:

- `curl -s https://toebeans.co.za/robots.txt` and `/sitemap.xml` show the files above, and
  `curl -sI https://toebeans.co.za/sign-in | grep -i x-robots-tag` prints `noindex`, while
  `/terms` and `/privacy` have none.
- A link to `https://toebeans.co.za/` pasted into WhatsApp shows the card.
- Optional: add the site to Google Search Console (a DNS TXT record in Cloudflare) and submit the
  sitemap, which shows what it indexed.

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

## HTTPS only (security audit R5, R6)

Cloudflare, not the Worker, keeps the site on https (architecture D32). In the dashboard,
**toebeans.co.za → SSL/TLS → Edge Certificates**:

- **Always Use HTTPS**: on. Plain http gets a 301 before the Worker runs, so it costs no Worker
  request.
- **HTTP Strict Transport Security (HSTS)**: on, **Max Age 12 months**, **Include subdomains** on,
  **Preload** on, No-Sniff header off (the app sends `nosniff`). This header replaces the app's
  own (two years, no subdomains), which comes back if HSTS is turned off here. Never leave Max Age
  at 0: that tells browsers to forget the policy. Every subdomain must serve https (`send` is mail only,
  which browsers never visit). Preload needs a Max Age of at least 12 months; once the domain is on
  Chrome's list, turning HSTS off here doesn't take it off (hstspreload.org's removal form does,
  over months).
- **Minimum TLS Version**: TLS 1.2.

Check after any change there:

```sh
curl -sI http://toebeans.co.za/sign-in | grep -iE '^HTTP|^location'   # 301 to https://toebeans.co.za/sign-in
curl -sI https://toebeans.co.za/ | grep -i strict-transport           # max-age=31536000; includeSubDomains; preload
for v in tls1 tls1_1; do echo | openssl s_client -$v -cipher 'DEFAULT:@SECLEVEL=0' \
  -servername toebeans.co.za -connect toebeans.co.za:443 2>&1 | grep -c 'alert protocol version'; done
```

The last prints `1` twice: the edge refuses TLS 1.0 and 1.1. Keep the `-cipher` option: without it
OpenSSL won't offer the old versions itself, which tests nothing. Checked 25 Nov 2026.

## A rate limit before the Worker (security audit R3)

The Workers Free plan caps the account's requests a day; past that, every request fails until
midnight UTC. A rate-limiting rule (free plan: one rule, expressions on the path only, counted per
IP over 10 seconds) blocks a fast flood from one address before the Worker runs (architecture
D13, R6).

In the dashboard: **toebeans.co.za → Security → Security rules → Create rule → Rate limiting
rule**, name `toe-beans-rate-limit`, expression `(http.request.uri.path wildcard "/*")`, counted
by IP, **200** requests per **10 seconds**, action **Block** for **10 seconds**, deploy.

The threshold sits above a fresh install: 170 requests on 25 Nov, nearly all the service worker's
precache, which fails whole if one file is refused. The precache grows with the build, so recount
when it grows by a lot (Chrome on a desktop, site data cleared, DevTools → Network, open the site
and sign in) and raise the threshold before a fresh load nears it. The sign-in pages on
`auth.toebeans.co.za` aren't proxied (`docs/runbooks/auth0.md` §3), so they don't count.

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
