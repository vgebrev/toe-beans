// Spike S-1.2/S-1.3 push plumbing. Deliberately crude: JSON files under ./data and an in-memory
// queue of delayed sends, drained by dispatchDue(). On Cloud Run the scheduler's /internal/tick
// drives it; locally a 5 s loop does. The real design (NotificationJob collection, worker.tick)
// is architecture §6.
import webpush, { type PushSubscription, WebPushError } from 'web-push';
import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import { VAPID_PRIVATE_KEY, VAPID_SUBJECT } from '$app/env/private';
import { VAPID_PUBLIC_KEY } from '$app/env/public';

const DATA = 'data';
const SUBS = `${DATA}/subscriptions.json`;
const LOG = `${DATA}/log.jsonl`;

export type Device = { id: string; label: string; subscription: PushSubscription; createdAt: string };
type Pending = { device: Device; pushId: string; urgency: Urgency; dueAt: number };
const pending: Pending[] = [];

// Cloud Run sets K_SERVICE. Elsewhere there's no scheduler, so tick in-process (architecture §6.3).
if (!process.env.K_SERVICE) setInterval(() => void dispatchDue(new Date()), 5000).unref();

export type Urgency = 'very-low' | 'low' | 'normal' | 'high';
export type LogEntry = {
	at: string;
	event: 'subscribed' | 'scheduled' | 'sent' | 'send-failed' | 'received' | 'clicked';
	device?: string;
	pushId?: string;
	detail?: string;
};

async function readDevices(): Promise<Device[]> {
	try {
		return JSON.parse(await readFile(SUBS, 'utf8'));
	} catch {
		return [];
	}
}

async function writeDevices(devices: Device[]) {
	await mkdir(DATA, { recursive: true });
	await writeFile(SUBS, JSON.stringify(devices, null, 2));
}

export async function log(entry: Omit<LogEntry, 'at'>) {
	const line: LogEntry = { at: new Date().toISOString(), ...entry };
	await mkdir(DATA, { recursive: true });
	await appendFile(LOG, JSON.stringify(line) + '\n');
	console.log(JSON.stringify(line));
}

export async function readLog(limit = 50): Promise<LogEntry[]> {
	try {
		const lines = (await readFile(LOG, 'utf8')).trim().split('\n');
		return lines.slice(-limit).reverse().map((l) => JSON.parse(l));
	} catch {
		return [];
	}
}

export async function subscribe(label: string, subscription: PushSubscription): Promise<Device> {
	const devices = await readDevices();
	const existing = devices.find((d) => d.subscription.endpoint === subscription.endpoint);
	const device = existing ?? {
		id: crypto.randomUUID().slice(0, 8),
		label,
		subscription,
		createdAt: new Date().toISOString()
	};
	device.label = label;
	if (!existing) devices.push(device);
	await writeDevices(devices);
	await log({ event: 'subscribed', device: device.label });
	return device;
}

export async function schedule(deviceId: string, delaySeconds: number, urgency: Urgency) {
	const device = (await readDevices()).find((d) => d.id === deviceId);
	if (!device) return null;
	const pushId = crypto.randomUUID().slice(0, 8);
	const dueAt = new Date(Date.now() + delaySeconds * 1000).toISOString();
	await log({ event: 'scheduled', device: device.label, pushId, detail: `delay ${delaySeconds} s, due ${dueAt}, urgency ${urgency}` });
	if (delaySeconds === 0) await send(device, pushId, urgency);
	else pending.push({ device, pushId, urgency, dueAt: Date.parse(dueAt) });
	return { pushId, dueAt };
}

/** Sends every queued push that's due. Returns how many it sent. */
export async function dispatchDue(now: Date): Promise<number> {
	const due = pending.filter((p) => p.dueAt <= now.getTime());
	if (!due.length) return 0;
	for (const p of due) pending.splice(pending.indexOf(p), 1);
	await Promise.all(due.map((p) => send(p.device, p.pushId, p.urgency)));
	return due.length;
}

async function send(device: Device, pushId: string, urgency: Urgency) {
	const sentAt = new Date().toISOString();
	const payload = JSON.stringify({
		pushId,
		device: device.label,
		sentAt,
		title: 'Time to train Ripley',
		body: `Recall basics · test ${pushId}`,
		url: `/sessions/${pushId}`
	});
	try {
		const res = await webpush.sendNotification(device.subscription, payload, {
			TTL: 3600,
			urgency,
			vapidDetails: { subject: VAPID_SUBJECT, publicKey: VAPID_PUBLIC_KEY, privateKey: VAPID_PRIVATE_KEY }
		});
		await log({ event: 'sent', device: device.label, pushId, detail: `HTTP ${res.statusCode}` });
	} catch (e) {
		const status = e instanceof WebPushError ? e.statusCode : undefined;
		await log({ event: 'send-failed', device: device.label, pushId, detail: `HTTP ${status ?? '?'} ${String(e)}`.slice(0, 300) });
		if (status === 404 || status === 410) {
			await writeDevices((await readDevices()).filter((d) => d.id !== device.id));
		}
	}
}
