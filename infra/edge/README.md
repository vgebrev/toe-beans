# The app's Cloudflare Worker

Serves `toebeans.co.za` by forwarding every request to the Cloud Run service, and redirects `www`
to the apex (architecture §8.4, D13). It adds the header secret the app requires (`PROXY_SECRET`,
D32) and the phone's address for the rate limits (`x-toe-beans-client`, §7). It replaces the
holding page (`infra/holding-page`).

## Deploy

Needs `gcloud` signed in as the project owner, and `npx wrangler@4 login` once. From this directory:

```sh
# The Worker's copy of the secret, straight from Secret Manager; it never touches a file.
gcloud secrets versions access latest --secret=proxy-secret --project=toe-beans-co-za |
	npx wrangler@4 secret put PROXY_SECRET
npx wrangler@4 deploy
```

The first deploy takes over the custom domains from the holding page's Worker; if wrangler refuses
because they're attached there, delete that one first (`npx wrangler@4 delete --name toe-beans-holding`),
which leaves the site down until this deploy finishes.

After rotating the secret (`infra/gcp/set-secret.sh proxy-secret`), put it here again, then
redeploy the app so it picks up the new version.

## Checks (S14.1)

- `curl -sI https://toe-beans-1047834821273.africa-south1.run.app/` answers 403: nothing goes round
  the Worker.
- `curl -s https://toebeans.co.za/readyz` answers `{"status":"ready"}`.
- The rate limit keys on the phone, not on Cloudflare (the address is never logged, NFR-02): open
  `https://toebeans.co.za/auth/sign-in` 16 times quickly on mobile data until it says to wait, then
  check a laptop on Wi-Fi still signs in.
- Worker logs stay off (`observability` in `wrangler.jsonc`); Cloudflare's own request analytics
  are visible only to the account owner.

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
`/manifest.webmanifest`, `/robots.txt` and `/.well-known/security.txt` (a `/.` anywhere else is a
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
