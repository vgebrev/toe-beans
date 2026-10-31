// Holding page for toebeans.co.za until the app ships (backlog S14.1). It deliberately registers
// no service worker and sets no cookies, so nothing lingers on the production origin.
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Toe Beans</title>
<style>
	:root { --bg: #fffbf5; --text: #2b1d14; --muted: #6b5444; --primary: #8a4b1f; }
	@media (prefers-color-scheme: dark) {
		:root { --bg: #1a1310; --text: #f5ebe0; --muted: #c4ad98; --primary: #d9965b; }
	}
	html, body { height: 100%; margin: 0; }
	body {
		display: grid; place-items: center; padding: 16px; box-sizing: border-box;
		background: var(--bg); color: var(--text); text-align: center;
		font: 1.0625rem/1.5 system-ui, sans-serif;
	}
	svg { width: 72px; height: 72px; fill: var(--primary); }
	h1 { margin: 16px 0 4px; font-size: 2rem; }
	p { margin: 0; color: var(--muted); }
</style>
</head>
<body>
<main>
	<svg viewBox="0 0 100 100" aria-hidden="true">
		<ellipse cx="50" cy="68" rx="22" ry="18"/>
		<ellipse cx="22" cy="42" rx="9" ry="12"/><ellipse cx="40" cy="26" rx="9" ry="12"/>
		<ellipse cx="60" cy="26" rx="9" ry="12"/><ellipse cx="78" cy="42" rx="9" ry="12"/>
	</svg>
	<h1>Toe Beans</h1>
	<p>Puppy training and care for the whole household. Coming soon.</p>
</main>
</body>
</html>`;

export default {
	fetch(request) {
		const url = new URL(request.url);
		if (url.hostname === 'www.toebeans.co.za') {
			url.hostname = 'toebeans.co.za';
			return Response.redirect(url.toString(), 301);
		}
		return new Response(html, {
			headers: {
				'content-type': 'text/html; charset=utf-8',
				'cache-control': 'public, max-age=300',
				'x-robots-tag': 'noindex'
			}
		});
	}
};
