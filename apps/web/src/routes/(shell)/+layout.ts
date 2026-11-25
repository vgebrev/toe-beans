// The service worker's fallback pages (architecture §7): it fetches them once when it installs
// and shows them in place of a page that couldn't load. They show no household data, so they
// can be cached. Not prerendered: app.html's CSP nonce rules that out. They go out as
// `private, no-cache` like every page (security audit R8); the Cache API stores them regardless.
export const prerender = false;
