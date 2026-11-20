// Storage and delivery for push reminders (architecture §6, D27). Devices and preferences belong
// to a person, not a household: whose reminders they get follows from the household they're in
// when the tick runs, so leaving one stops its reminders without touching these.
import type { Id } from '../../domain/id.js';
import type {
	PushDevice,
	PushKeys,
	PushPayload,
	Reminder,
	ReminderPreference
} from '../../domain/reminders.js';

export interface NewPushDevice {
	id: Id;
	userId: Id;
	endpoint: string;
	keys: PushKeys;
	label: string;
}

export interface PushDeviceRepository {
	/**
	 * Saves the browser's subscription, seen now. The endpoint identifies it: one already stored
	 * becomes this person's, live again (neither disabled nor signed out), with these keys and
	 * label, and keeps its ID; otherwise `id` is used.
	 * One stored for someone else moves only if the keys match, which only the browser holding the
	 * subscription knows (security audit F6); otherwise nothing changes and it returns null.
	 */
	save(device: NewPushDevice): Promise<PushDevice | null>;
	/** Their devices, disabled ones too, newest first. */
	listForUser(userId: Id): Promise<PushDevice[]>;
	findForUser(userId: Id, id: Id): Promise<PushDevice | null>;
	/** Whoever's device this endpoint is, if anyone's. */
	findByEndpoint(endpoint: string): Promise<PushDevice | null>;
	/** Devices neither disabled nor signed out, of any of these people. For the worker. */
	listLive(userIds: readonly Id[]): Promise<PushDevice[]>;
	/** False if they have no device with that ID. */
	remove(userId: Id, id: Id): Promise<boolean>;
	/**
	 * Signing out in that browser: their device with this endpoint gets nothing until it's saved
	 * again (D43). False if they have none.
	 */
	signOut(userId: Id, endpoint: string, at: Date): Promise<boolean>;
	/** *Sign out everywhere*: all of their devices, as `signOut`; returns how many. */
	signOutAll(userId: Id, at: Date): Promise<number>;
	/** Removes all of the person's devices, for deleting the account; returns how many. Joins a transaction. */
	removeAllForUser(userId: Id): Promise<number>;
	/** It took a reminder, so it's in use: it won't be deleted for `DEVICE_UNUSED_MS`. */
	recordSuccess(id: Id, at: Date): Promise<void>;
	recordFailure(id: Id): Promise<void>;
	/**
	 * The push service said it's gone: nothing more is sent to it, and it's deleted after
	 * `DEVICE_STOPPED_MS` unless the browser saves it again.
	 */
	disable(id: Id, at: Date): Promise<void>;
}

export interface ReminderPreferenceRepository {
	/** Null until they first change one: the defaults apply. */
	find(userId: Id): Promise<ReminderPreference | null>;
	findMany(userIds: readonly Id[]): Promise<ReminderPreference[]>;
	/** Last write wins: only the person themselves changes theirs. */
	save(preference: ReminderPreference): Promise<ReminderPreference>;
	/** For deleting the account. Joins a transaction. */
	delete(userId: Id): Promise<void>;
}

export type NewReminder = Omit<Reminder, 'createdAt' | 'updatedAt'>;

/** What a tick writes once it has tried to send a reminder it claimed. */
export type ReminderOutcome = Pick<Reminder, 'status' | 'attempts' | 'delivered'> &
	Partial<Pick<Reminder, 'lastError' | 'sentAt' | 'notBefore'>>;

export interface ReminderRepository {
	/**
	 * Inserts a reminder already claimed (`sending`). False if one with its key exists: another
	 * tick claimed it first, or it went out earlier. The unique key makes this the atomic claim.
	 */
	claimNew(reminder: NewReminder): Promise<boolean>;
	/** Inserts one to be sent later (`pending`), such as a test. */
	insert(reminder: NewReminder): Promise<Reminder>;
	/** Which of these keys already have a reminder, so a tick doesn't try to claim them again. */
	existingKeys(keys: readonly string[]): Promise<Set<string>>;
	/**
	 * Claims the next reminder that's `pending` and due by `now` (a retry, or a test), or
	 * `sending` with its claim run out (a tick died holding it). Null when there are none.
	 */
	claimNext(now: Date, claim: string, lockedUntil: Date): Promise<Reminder | null>;
	/** Writes the outcome, if `claim` still holds it. False if another tick has taken it. */
	settle(id: Id, claim: string, outcome: ReminderOutcome): Promise<boolean>;
	/** Their most recent test reminder. */
	latestTest(userId: Id): Promise<Reminder | null>;
	/** Records that it reached their phone, the first time only. False if it isn't theirs. */
	markReceived(userId: Id, id: Id, at: Date): Promise<boolean>;
	/**
	 * Deletes the person's entries, for deleting the account. Their household's go with it when
	 * it's erased. Joins a transaction.
	 */
	deleteForUser(userId: Id): Promise<number>;
}

export type PushOutcome =
	| { kind: 'sent' }
	/** 404 or 410: the subscription has gone, e.g. the app was uninstalled. */
	| { kind: 'gone'; status: number }
	| { kind: 'failed'; reason: string };

export interface PushOptions {
	ttlSeconds: number;
}

/** Web Push with VAPID (architecture §6.2). Urgency is always `high`: reminders are time-bound. */
export interface PushSender {
	/** The VAPID public key, base64url, which browsers subscribe with. */
	readonly publicKey: string;
	send(
		device: Pick<PushDevice, 'endpoint' | 'keys'>,
		payload: PushPayload,
		options: PushOptions
	): Promise<PushOutcome>;
}
