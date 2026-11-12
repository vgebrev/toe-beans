// In-memory doubles for the reminder ports, for unit tests of the settings and the tick. The Mongo
// adapters have their own integration test.
import type {
	PushDeviceRepository,
	PushOutcome,
	PushSender,
	ReminderPreferenceRepository,
	ReminderRepository
} from '../application/ports/index.js';
import type { Id } from '../domain/id.js';
import type { PushDevice, PushPayload, Reminder, ReminderPreference } from '../domain/reminders.js';

export function memoryPushDevices(now: () => Date): PushDeviceRepository & { all(): PushDevice[] } {
	const devices = new Map<Id, PushDevice>();
	return {
		all: () => structuredClone([...devices.values()]),
		async save({ id, endpoint, ...fields }) {
			const existing = [...devices.values()].find((d) => d.endpoint === endpoint);
			const at = now();
			const device: PushDevice = existing
				? { ...existing, ...fields, failureCount: 0, updatedAt: at }
				: { id, endpoint, ...fields, failureCount: 0, createdAt: at, updatedAt: at };
			delete device.disabledAt;
			devices.set(device.id, device);
			return structuredClone(device);
		},
		listForUser: async (userId) =>
			structuredClone(
				[...devices.values()]
					.filter((d) => d.userId === userId)
					.sort((a, b) => b.id.localeCompare(a.id))
			),
		async findForUser(userId, id) {
			const d = devices.get(id);
			return d?.userId === userId ? structuredClone(d) : null;
		},
		listLive: async (userIds) =>
			structuredClone(
				[...devices.values()].filter((d) => userIds.includes(d.userId) && !d.disabledAt)
			),
		async remove(userId, id) {
			if (devices.get(id)?.userId !== userId) return false;
			return devices.delete(id);
		},
		async recordSuccess(id, at) {
			const d = devices.get(id);
			if (d) Object.assign(d, { lastSuccessAt: at, failureCount: 0 });
		},
		async recordFailure(id) {
			const d = devices.get(id);
			if (d) d.failureCount++;
		},
		async disable(id, at) {
			const d = devices.get(id);
			if (d) Object.assign(d, { disabledAt: at, updatedAt: at });
		}
	};
}

export function memoryReminderPreferences(): ReminderPreferenceRepository {
	const prefs = new Map<Id, ReminderPreference>();
	return {
		find: async (userId) => structuredClone(prefs.get(userId) ?? null),
		findMany: async (userIds) =>
			structuredClone([...prefs.values()].filter((p) => userIds.includes(p.userId))),
		async save(pref) {
			prefs.set(pref.userId, structuredClone(pref));
			return structuredClone(pref);
		}
	};
}

export function memoryReminders(now: () => Date): ReminderRepository & { all(): Reminder[] } {
	const ledger = new Map<Id, Reminder>();
	const keys = () => new Set([...ledger.values()].map((r) => r.key));
	const stamp = (r: Parameters<ReminderRepository['insert']>[0]): Reminder => ({
		...structuredClone(r),
		createdAt: now(),
		updatedAt: now()
	});
	return {
		all: () => structuredClone([...ledger.values()].sort((a, b) => a.id.localeCompare(b.id))),
		async claimNew(reminder) {
			if (keys().has(reminder.key)) return false;
			ledger.set(reminder.id, stamp(reminder));
			return true;
		},
		async insert(reminder) {
			if (keys().has(reminder.key)) throw new Error('duplicate key');
			const r = stamp(reminder);
			ledger.set(r.id, r);
			return structuredClone(r);
		},
		existingKeys: async (list) => new Set(list.filter((k) => keys().has(k))),
		async claimNext(at, claim, lockedUntil) {
			const next = [...ledger.values()]
				.filter(
					(r) =>
						(r.status === 'pending' && r.notBefore && r.notBefore <= at) ||
						(r.status === 'sending' && r.lockedUntil && r.lockedUntil < at)
				)
				.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())[0];
			if (!next) return null;
			Object.assign(next, { status: 'sending', claim, lockedUntil, updatedAt: now() });
			return structuredClone(next);
		},
		async settle(id, claim, outcome) {
			const r = ledger.get(id);
			if (!r || r.claim !== claim || r.status !== 'sending') return false;
			delete r.claim;
			delete r.lockedUntil;
			delete r.notBefore;
			Object.assign(r, structuredClone(outcome), { updatedAt: now() });
			return true;
		},
		latestTest: async (userId) =>
			structuredClone(
				[...ledger.values()]
					.filter((r) => r.userId === userId && r.kind === 'test')
					.sort((a, b) => b.id.localeCompare(a.id))[0] ?? null
			),
		async markReceived(userId, id, at) {
			const r = ledger.get(id);
			if (r?.userId !== userId) return false;
			r.receivedAt ??= at;
			return true;
		}
	};
}

export interface FakePushSender extends PushSender {
	/** Every push sent, in order. */
	sent: { endpoint: string; payload: PushPayload; ttlSeconds: number }[];
	/** What sending to an endpoint returns; `sent` unless set. */
	answers: Map<string, PushOutcome>;
}

export function fakePushSender(): FakePushSender {
	const fake: FakePushSender = {
		publicKey: 'BPublicKeyForTests',
		sent: [],
		answers: new Map(),
		async send(device, payload, { ttlSeconds }) {
			const answer = fake.answers.get(device.endpoint) ?? { kind: 'sent' };
			if (answer.kind === 'sent') {
				fake.sent.push({
					endpoint: device.endpoint,
					payload: structuredClone(payload),
					ttlSeconds
				});
			}
			return answer;
		}
	};
	return fake;
}
