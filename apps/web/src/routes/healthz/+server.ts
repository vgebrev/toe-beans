// Liveness: the process is up (architecture §8.1). Readiness, which checks Mongo, is /readyz.
export function GET() {
	return new Response('ok', { headers: { 'cache-control': 'no-store' } });
}
