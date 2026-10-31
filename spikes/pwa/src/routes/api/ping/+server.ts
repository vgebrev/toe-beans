// S-1.4a: the smallest possible same-origin round trip, timed from the device by /latency. No
// database: the proxies' cost is the difference between origins, added to the S-1.4 Today numbers.
export function GET() {
	return new Response('pong', { headers: { 'cache-control': 'no-store' } });
}
