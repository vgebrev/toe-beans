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
