import { json, error } from '@sveltejs/kit';
import { schedule, type Urgency } from '#lib/server/push.js';

const URGENCIES: Urgency[] = ['very-low', 'low', 'normal', 'high'];

export async function POST({ request }) {
	const body = await request.json().catch(() => null);
	const delaySeconds = Number(body?.delaySeconds ?? 0);
	const urgency: Urgency = URGENCIES.includes(body?.urgency) ? body.urgency : 'high';
	if (!body?.deviceId || !Number.isFinite(delaySeconds) || delaySeconds < 0 || delaySeconds > 6 * 3600) {
		error(400, 'deviceId and delaySeconds (0..21600) required');
	}
	const result = await schedule(String(body.deviceId), delaySeconds, urgency);
	if (!result) error(404, 'unknown device; subscribe again');
	return json(result);
}
