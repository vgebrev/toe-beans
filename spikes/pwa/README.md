# Spike S-1.1: installable PWA

Throwaway spike (backlog S-1.1). A minimal SvelteKit 3 app on `adapter-node` that Chrome on Android
can install. S-1.2 (Web Push) and S-1.3 (Cloud Run) will build on it. It is **not** the start of
`apps/web`; S0 sets that up properly.

What it has:

- `static/manifest.webmanifest`: standalone display, Beagle colours, `any` and `maskable` icons.
- `src/service-worker/index.ts`: precaches build output, static files and the prerendered
  `/offline` page. Navigations go network-first, falling back to `/offline`. Nothing else is cached
  (architecture §7).
- `/`: a status page showing display mode, service worker state, connection, build version and
  user agent, with an **Install app** button when Chrome fires `beforeinstallprompt`.
- `/healthz`: plain `ok` for health checks.
- Icons: `scripts/paw.svg` is a placeholder paw print (the real logo is S0.9). Regenerate the PNGs
  with `pnpm icons`.

## Run

```sh
pnpm install
pnpm build
PORT=3000 node build
```

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
