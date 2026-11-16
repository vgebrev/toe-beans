// The service worker's fallback pages (architecture §7): it fetches them once when it installs
// and shows them in place of a page that couldn't load. They show no household data, so they
// can be cached. Not prerendered: app.html's CSP nonce rules that out.
export const prerender = false;
