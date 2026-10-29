import { json } from '@sveltejs/kit';
import { readLog } from '#lib/server/push.js';

export async function GET() {
	return json(await readLog(), { headers: { 'cache-control': 'no-store' } });
}
