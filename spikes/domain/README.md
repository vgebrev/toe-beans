# Spike S-1.4a: `toebeans.co.za` in front of Cloud Run

**Torn down 31 Oct 2026** after S-1.4a: the Worker, `toe-beans-domain-probe` and its images are deleted. Re-running is the two deploy steps below.

Throwaway spike (backlog S-1.4a). Cloud Run domain mapping isn't offered in `africa-south1`, and
Firebase Hosting's Cloud Run rewrites don't support it either (the deploy is refused), so this is a
Cloudflare Worker in front of `toe-beans-domain-probe`. That service is the `spikes/pwa` image
deployed under a second name (`SERVICE=toe-beans-domain-probe scripts/gcp-deploy.sh`), so S-1.3's
`toe-beans-spike` and its tick job are untouched.

| Origin | Front |
|---|---|
| `https://toe-beans-domain-probe-1047834821273.africa-south1.run.app` | none (baseline) |
| `https://cf.toebeans.co.za` | Cloudflare Worker (`worker.js`, `wrangler.jsonc`) |

The probe sits on a subdomain so no spike service worker or push subscription is left on the
production origin.

On each origin, `/latency` times 30 same-origin pings (no database; the difference is added to the
S-1.4 Today numbers) and checks which of `__Host-probe`, `__session` and `probe-plain` survive.
`/` has the S-1.2 push panel (*Send now*; there's no tick job, so delayed sends don't fire).

## Deploy

```sh
npx wrangler@4 login
npx wrangler@4 deploy   # the custom domain creates its DNS record and certificate
```

Teardown: `npx wrangler@4 delete`, and `gcloud run services delete toe-beans-domain-probe --region africa-south1`.
