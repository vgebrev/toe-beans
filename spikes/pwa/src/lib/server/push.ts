// Spike S-1.2 push plumbing. Deliberately crude: JSON files under ./data and setTimeout for
// delayed sends. The real design (NotificationJob collection, worker.tick) is architecture §6.
import webpush, { type PushSubscription, WebPushError } from 'web-push';
import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import { VAPID_PRIVATE_KEY, VAPID_SUBJECT } from '$app/env/private';
import { VAPID_PUBLIC_KEY } from '$app/env/public';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const DATA = 'data';
const SUBS = `${DATA}/subscriptions.json`;
const LOG = `${DATA}/log.jsonl`;

export type Device = { id: string; label: string; subscription: PushSubscription; createdAt: string };
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
	await log({ event: 'scheduled', device: device.label, pushId, detail: `due ${dueAt}, urgency ${urgency}` });
	setTimeout(() => void send(device, pushId, urgency), delaySeconds * 1000);
	return { pushId, dueAt };
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
		const res = await webpush.sendNotification(device.subscription, payload, { TTL: 3600, urgency });
		await log({ event: 'sent', device: device.label, pushId, detail: `HTTP ${res.statusCode}` });
	} catch (e) {
		const status = e instanceof WebPushError ? e.statusCode : undefined;
		await log({ event: 'send-failed', device: device.label, pushId, detail: `HTTP ${status ?? '?'} ${String(e)}`.slice(0, 300) });
		if (status === 404 || status === 410) {
			await writeDevices((await readDevices()).filter((d) => d.id !== device.id));
		}
	}
}
