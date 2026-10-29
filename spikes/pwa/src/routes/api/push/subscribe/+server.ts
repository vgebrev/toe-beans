import { json, error } from '@sveltejs/kit';
import { subscribe } from '#lib/server/push.js';

export async function POST({ request }) {
	const body = await request.json().catch(() => null);
	if (!body?.subscription?.endpoint || !body?.subscription?.keys) error(400, 'subscription required');
	const label = String(body.label ?? 'unnamed').slice(0, 40);
	const device = await subscribe(label, body.subscription);
	return json({ id: device.id, label: device.label });
}
