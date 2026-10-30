// Spike S-1.3: times page loads against the ≤ 5 s cold-start budget (architecture §8.4).
// Usage: pnpm coldstart <url>. Run it after the service has been idle 20+ min with the tick job
// paused (or right after a deploy): the first request is then a cold start, the rest are warm.
const url = process.argv[2];
if (!url) {
	console.error('usage: pnpm coldstart <service url>');
	process.exit(1);
}

for (let i = 0; i < 4; i++) {
	const start = performance.now();
	const res = await fetch(url, { headers: { 'cache-control': 'no-cache' } });
	const headersMs = performance.now() - start;
	await res.arrayBuffer();
	const totalMs = performance.now() - start;
	console.log(
		`${i === 0 ? 'first' : 'next '}  HTTP ${res.status}  headers ${(headersMs / 1000).toFixed(2)} s  ` +
			`body ${(totalMs / 1000).toFixed(2)} s  instance ${res.headers.get('x-instance') ?? '?'}`
	);
}
