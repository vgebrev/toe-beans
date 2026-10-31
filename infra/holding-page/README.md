# Holding page for `toebeans.co.za`

A Cloudflare Worker that serves a static "coming soon" page on the apex and redirects `www` to it,
until the app ships (backlog S14.1). It registers no service worker and sets no cookies, so the
production origin stays clean for the real PWA and its push subscriptions.

```sh
npx wrangler@4 login
npx wrangler@4 deploy
```

S14.1 replaces it with the app's Worker (architecture §8.4); `npx wrangler@4 delete` removes it.
