// Push reminders (architecture §6, D27, FR-12): the devices a person has turned reminders on for,
// what they want reminding of, and the ledger of reminders sent. Nothing here sends anything; the
// worker's tick works out from the subjects themselves (planned sessions now, care tasks with S11)
// which reminders are due, and the ledger makes each one go out once.
import type { Id } from './id.js';

/** A browser's push subscription for one person (architecture §5.2 PushSubscription). */
export interface PushDevice {
	id: Id;
	/** Whoever subscribed it last: a phone handed to someone else follows its new owner. */
	userId: Id;
	/** The push service's URL for this browser. A secret (NFR-02): never logged or sent back. */
	endpoint: string;
	keys: PushKeys;
	/** e.g. "Galaxy S23 FE · Chrome", from the browser, so people can tell their devices apart. */
	label: string;
	lastSuccessAt?: Date;
	/** Failed sends in a row; a success resets it. */
	failureCount: number;
	/** Set when the push service says the subscription is gone (404/410). Nothing is sent to it. */
	disabledAt?: Date;
	createdAt: Date;
	updatedAt: Date;
}

export interface PushKeys {
	/** The browser's P-256 public key, base64url. */
	p256dh: string;
	/** The shared auth secret, base64url. */
	auth: string;
}

/** What one member wants reminding of (architecture §5.2 ReminderPreference). */
export interface ReminderPreference {
	userId: Id;
	/** Reminders of planned training sessions. */
	training: boolean;
	/** Minutes before the session; 0 is at the session time (ui.md §8 decision 3). */
	trainingLeadMin: TrainingLead;
	updatedAt?: Date;
}

/** The lead times on offer: multiples of the tick's 5 minutes (architecture §6.3). */
export const TRAINING_LEADS = [0, 5, 10, 15, 30, 60] as const;
export type TrainingLead = (typeof TRAINING_LEADS)[number];

export const defaultPreference = (userId: Id): ReminderPreference => ({
	userId,
	training: true,
	trainingLeadMin: 0
});

export const isTrainingLead = (value: number): value is TrainingLead =>
	(TRAINING_LEADS as readonly number[]).includes(value);

/** What a reminder is about. Care tasks join with S11. */
export type ReminderSubject = { type: 'plannedSession'; id: Id };

export type ReminderKind = 'training' | 'test';

export type ReminderStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'skipped';

/**
 * One reminder for one person: the send ledger (D27). Its unique `key` is the dedupe guard, so
 * however many ticks run at once, a reminder is claimed once.
 */
export interface Reminder {
	id: Id;
	householdId: Id;
	userId: Id;
	kind: ReminderKind;
	/** Absent for a test reminder. */
	subject?: ReminderSubject;
	/** The subject's time when this was planned. A moved session is a new reminder. */
	subjectAt?: Date;
	/** Unique: see `reminderKey` and `testKey`. */
	key: string;
	/** When it should reach the phone. */
	dueAt: Date;
	status: ReminderStatus;
	/** Send attempts so far. */
	attempts: number;
	/** `pending`: not to be tried before this. */
	notBefore?: Date;
	/** `sending`: whoever claimed it owns it until then; after that a tick takes it back. */
	lockedUntil?: Date;
	/** Who holds the claim, so a tick that lost it can't overwrite the one that took it back. */
	claim?: string;
	/** Only this device (a test reminder); otherwise every live device the person has. */
	deviceId?: Id;
	/** Devices it has reached, so a retry doesn't send to them again. */
	delivered: Id[];
	/** Short and scrubbed: a status code or error name, never an endpoint. */
	lastError?: string;
	sentAt?: Date;
	/** A test reminder's arrival, reported by the service worker (ui.md J7). */
	receivedAt?: Date;
	createdAt: Date;
	updatedAt: Date;
}

/** Send attempts before giving up (architecture §6.2). */
export const MAX_ATTEMPTS = 3;
/** How long a claim lasts; a tick that dies holding one loses it after this. */
export const CLAIM_MS = 60_000;
/**
 * A missed tick (a deploy, a cold start that failed) is made up for if it's at most this late. A
 * reminder older than that is no use, and the push service would drop it soon anyway (TTL).
 */
export const LOOKBACK_MS = 30 * 60_000;
/** The test waits this long, so the phone is locked when it arrives (ui.md J7). */
export const TEST_DELAY_MS = 3 * 60_000;
/** After this the settings screen asks whether the battery setting is on (ui.md J7). */
export const TEST_OVERDUE_MS = 10 * 60_000;
/** Push service time-to-live (architecture §6.2): a stale reminder is worse than none. */
export const TTL_SECONDS: Record<ReminderKind, number> = { training: 60 * 60, test: 60 * 60 };
/** Devices one person can register; old phones are removed on the settings screen. */
export const DEVICES_MAX = 10;
export const DEVICE_LABEL_MAX = 60;

/** The dedupe key: the same session at the same time reminds a person once. */
export const reminderKey = (subject: ReminderSubject, subjectAt: Date, userId: Id): string =>
	`${subject.type}:${subject.id}:${subjectAt.toISOString()}:${userId}`;

export const testKey = (id: Id): string => `test:${id}`;

/** When a training reminder is due for someone with this lead time. */
export const trainingDueAt = (scheduledAt: Date, leadMin: number): Date =>
	new Date(scheduledAt.getTime() - leadMin * 60_000);

/**
 * Whether a reminder due at `dueAt` should go out on a tick at `now`. Each tick sends what falls
 * due before the next one, so reminders are up to an interval early and never late (§6.3). A
 * reminder already past is sent if it's within the lookback, but not if its subject was set up or
 * changed after it fell due: scheduling a session for five minutes ago shouldn't buzz anyone.
 */
export function isDue(
	dueAt: Date,
	{ now, intervalMs, changedAt }: { now: Date; intervalMs: number; changedAt: Date }
): boolean {
	const t = dueAt.getTime();
	if (t >= now.getTime() + intervalMs) return false;
	return t >= now.getTime() - LOOKBACK_MS && t >= changedAt.getTime();
}

/** When a failed send is tried again: 1, then 4 minutes later (so within the next ticks). */
export const retryAt = (now: Date, attempts: number): Date =>
	new Date(now.getTime() + 4 ** (attempts - 1) * 60_000);

/**
 * Whether an endpoint is one we may send to: https on one of the allowed push services. A
 * client chooses the endpoint, so without this anyone signed in could make the server post to
 * any URL (SSRF). `allowed` holds origins (`https://fcm.googleapis.com`) or wildcard hosts
 * (`https://*.notify.windows.com`); tests add a local origin.
 */
export function isAllowedEndpoint(endpoint: string, allowed: readonly string[]): boolean {
	let url: URL;
	try {
		url = new URL(endpoint);
	} catch {
		return false;
	}
	if (url.username || url.password || endpoint.length > 2048) return false;
	return allowed.some((pattern) => {
		const wildcard = pattern.match(/^(https?):\/\/\*\.(.+)$/);
		if (wildcard) {
			return url.protocol === `${wildcard[1]}:` && url.hostname.endsWith(`.${wildcard[2]}`);
		}
		return url.origin === pattern;
	});
}

/** The push services Chrome, Firefox, Edge and Safari use. */
export const PUSH_SERVICES = [
	'https://fcm.googleapis.com',
	'https://updates.push.services.mozilla.com',
	'https://*.notify.windows.com',
	'https://web.push.apple.com',
	'https://*.push.apple.com'
] as const;

const base64url = /^[A-Za-z0-9_-]+$/;

/** A P-256 point is 65 bytes (87 base64url characters); the auth secret 16 (22). */
export const arePushKeys = (keys: PushKeys): boolean =>
	base64url.test(keys.p256dh) &&
	base64url.test(keys.auth) &&
	keys.p256dh.length === 87 &&
	keys.auth.length === 22;

/** One line, trimmed, at most DEVICE_LABEL_MAX characters; a fallback when there's nothing left. */
export function cleanDeviceLabel(input: string | undefined): string {
	const label = (input ?? '').replace(/\s+/g, ' ').trim().slice(0, DEVICE_LABEL_MAX).trim();
	return label || 'This device';
}

/** What the service worker receives (ui.md §6.2). Minimal: no notes, nothing sensitive. */
export interface PushPayload {
	reminderId: Id;
	kind: ReminderKind;
	title: string;
	body: string;
	/** A path in the app, without the leading slash (Kit 3 route IDs). */
	path: string;
	/** Replaces an earlier notification for the same item on the phone. */
	tag: string;
}

export function trainingPayload(input: {
	reminderId: Id;
	sessionId: Id;
	exerciseTitle: string;
	dogName: string;
	/** On the household's clocks, `HH:MM`. */
	time: string;
}): PushPayload {
	return {
		reminderId: input.reminderId,
		kind: 'training',
		title: `Training time: ${input.exerciseTitle}`,
		body: `${input.dogName} · ${input.time}`,
		path: `sessions/${input.sessionId}`,
		tag: `session-${input.sessionId}`
	};
}

export const testPayload = (reminderId: Id): PushPayload => ({
	reminderId,
	kind: 'test',
	title: 'Reminders are working',
	body: 'Tap to tell Toe Beans this one arrived.',
	path: 'settings/notifications?test=arrived',
	tag: 'test'
});
