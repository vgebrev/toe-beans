// The service worker reports receipt and clicks here so delivery can be timed with the app closed.
import { error } from '@sveltejs/kit';
import { log } from '#lib/server/push.js';

export async function POST({ request }) {
	const body = await request.json().catch(() => null);
	if (body?.event !== 'received' && body?.event !== 'clicked') error(400, 'bad event');
	const lagMs = body.sentAt ? Date.now() - Date.parse(body.sentAt) : undefined;
	await log({
		event: body.event,
		device: String(body.device ?? '?').slice(0, 40),
		pushId: String(body.pushId ?? '?').slice(0, 16),
		detail: lagMs === undefined ? undefined : `${(lagMs / 1000).toFixed(1)} s after send`
	});
	return new Response(null, { status: 204 });
}
