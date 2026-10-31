// Liveness: the process is up (architecture §8.1). Readiness (/readyz, Mongo ping) comes with S0.3.
export function GET() {
	return new Response('ok', { headers: { 'cache-control': 'no-store' } });
}
