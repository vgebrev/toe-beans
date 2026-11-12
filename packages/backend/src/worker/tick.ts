// The reminder tick (architecture §6, D27, NFR-16). Each run:
//
// 1. extends recurring series whose sessions are running out, so tomorrow's exist to remind of;
// 2. works out from the planned sessions which training reminders fall due before the next tick,
//    for every member who wants them and has a device, and claims each by inserting it into the
//    ledger under a unique key, so concurrent ticks never send one twice;
// 3. takes up what's left: retries, tests that are due, and claims a dead tick left behind.
//
// Before sending, the subject is read again: a session moved, done, skipped or cancelled since
// isn't reminded of (scenario 5). Safe to run at any time and at the same time as itself, so the
// trigger can be Cloud Scheduler's POST, an in-process loop, or both (§6.3).
import type { Planner } from '../application/planner/planner.js';
import type { Ports } from '../application/ports/index.js';
import type { ReminderTick, TickReport } from '../application/ports/tick.js';
import { addDays, todayIn, zonedDateTime } from '../domain/calendar.js';
import type { Id } from '../domain/id.js';
import { HORIZON_DAYS } from '../domain/planner.js';
import {
	CLAIM_MS,
	defaultPreference,
	isDue,
	LOOKBACK_MS,
	MAX_ATTEMPTS,
	reminderKey,
	retryAt,
	testPayload,
	trainingDueAt,
	trainingPayload,
	TRAINING_LEADS,
	TTL_SECONDS,
	type PushDevice,
	type PushPayload,
	type Reminder,
	type ReminderPreference
} from '../domain/reminders.js';

export type { TickReport } from '../application/ports/tick.js';

export interface WorkerOptions {
	/** How often the tick runs; each sends what falls due before the next (§6.3). */
	intervalMs: number;
}

/** The most a tick takes up again in step 3, so one run stays short. */
const BACKLOG_PER_TICK = 200;
const MAX_LEAD_MS = Math.max(...TRAINING_LEADS) * 60_000;

type Outcome = 'sent' | 'retrying' | 'skipped' | 'failed';

export function createWorker(
	{
		households,
		plans,
		plannedSessions,
		dogs,
		exercises,
		pushDevices,
		reminderPreferences,
		reminders,
		push,
		clock,
		ids,
		logger,
		errors
	}: Pick<
		Ports,
		| 'households'
		| 'plans'
		| 'plannedSessions'
		| 'dogs'
		| 'exercises'
		| 'pushDevices'
		| 'reminderPreferences'
		| 'reminders'
		| 'push'
		| 'clock'
		| 'ids'
		| 'logger'
		| 'errors'
	>,
	planner: Pick<Planner, 'extendHorizon'>,
	{ intervalMs }: WorkerOptions
): ReminderTick {
	const log = logger.child({ component: 'worker' });

	/** Logs and reports an unexpected error without stopping the rest of the tick. */
	function failed(message: string, err: unknown, fields: Record<string, string> = {}) {
		log.error(message, { err, ...fields });
		errors.capture(err, { component: 'worker', ...fields });
	}

	async function extendHorizons(now: Date): Promise<number> {
		// A day of slack covers every time zone: the furthest ahead is UTC+14.
		const behind = await plans.householdsBehind(addDays(todayIn(now, 'UTC'), HORIZON_DAYS - 1));
		if (behind.length === 0) return 0;
		let extended = 0;
		for (const household of await households.findByIds(behind)) {
			if (household.memberships.length === 0) continue;
			try {
				await planner.extendHorizon({ householdId: household.id, timeZone: household.timeZone });
				extended++;
			} catch (err) {
				failed('could not extend series', err, { householdId: household.id });
			}
		}
		return extended;
	}

	const preferenceOf = (prefs: Map<Id, ReminderPreference>, userId: Id) =>
		prefs.get(userId) ?? defaultPreference(userId);

	/** Step 2: the training reminders falling due before the next tick, claimed. */
	async function claimTraining(now: Date): Promise<{ reminder: Reminder; claim: string }[]> {
		const due = await plannedSessions.listPlannedAcrossHouseholds(
			new Date(now.getTime() - LOOKBACK_MS),
			new Date(now.getTime() + intervalMs + MAX_LEAD_MS)
		);
		if (due.length === 0) return [];
		const homes = new Map(
			(await households.findByIds([...new Set(due.map((s) => s.householdId))])).map((h) => [
				h.id,
				h
			])
		);
		const members = [...homes.values()].flatMap((h) => h.memberships.map((m) => m.userId));
		const [prefList, deviceList] = await Promise.all([
			reminderPreferences.findMany(members),
			pushDevices.listLive(members)
		]);
		const prefs = new Map(prefList.map((p) => [p.userId, p]));
		const withDevices = new Set(deviceList.map((d) => d.userId));

		const candidates: { key: string; reminder: Omit<Reminder, 'createdAt' | 'updatedAt'> }[] = [];
		for (const session of due) {
			const home = homes.get(session.householdId);
			for (const { userId } of home?.memberships ?? []) {
				const pref = preferenceOf(prefs, userId);
				if (!pref.training || !withDevices.has(userId)) continue;
				const dueAt = trainingDueAt(session.scheduledAt, pref.trainingLeadMin);
				if (!isDue(dueAt, { now, intervalMs, changedAt: session.updatedAt })) continue;
				const subject = { type: 'plannedSession' as const, id: session.id };
				const key = reminderKey(subject, session.scheduledAt, userId);
				candidates.push({
					key,
					reminder: {
						id: ids.next(),
						householdId: session.householdId,
						userId,
						kind: 'training',
						subject,
						subjectAt: session.scheduledAt,
						key,
						dueAt,
						status: 'sending',
						attempts: 0,
						delivered: []
					}
				});
			}
		}
		if (candidates.length === 0) return [];
		const taken = await reminders.existingKeys(candidates.map((c) => c.key));
		const claimed: { reminder: Reminder; claim: string }[] = [];
		for (const { key, reminder } of candidates) {
			if (taken.has(key)) continue;
			const claim = ids.next();
			const lockedUntil = new Date(now.getTime() + CLAIM_MS);
			if (await reminders.claimNew({ ...reminder, claim, lockedUntil })) {
				claimed.push({
					reminder: { ...reminder, claim, lockedUntil, createdAt: now, updatedAt: now },
					claim
				});
			}
		}
		return claimed;
	}

	/** What to send for a reminder, or why it shouldn't go. Reads the subject again (scenario 5). */
	async function payloadFor(r: Reminder): Promise<PushPayload | { skip: string }> {
		const home = await households.find(r.householdId);
		if (!home?.memberships.some((m) => m.userId === r.userId)) return { skip: 'not a member' };
		if (r.kind === 'test') return testPayload(r.id);

		if (!r.subject || !r.subjectAt) return { skip: 'no subject' };
		const session = await plannedSessions.findById(r.householdId, r.subject.id);
		if (
			!session ||
			session.status !== 'planned' ||
			session.scheduledAt.getTime() !== r.subjectAt.getTime()
		) {
			return { skip: 'subject changed' };
		}
		const pref = (await reminderPreferences.find(r.userId)) ?? defaultPreference(r.userId);
		if (!pref.training) return { skip: 'turned off' };
		const dog = await dogs.findById(r.householdId, session.dogId);
		if (!dog || dog.archivedAt) return { skip: 'subject changed' };
		return trainingPayload({
			reminderId: r.id,
			sessionId: session.id,
			exerciseTitle: exercises.get(session.exerciseId)?.title ?? 'Training',
			dogName: dog.name,
			time: zonedDateTime(session.scheduledAt, home.timeZone).time
		});
	}

	/** Sends a claimed reminder to each of the person's devices it hasn't reached, and settles it. */
	async function deliver(r: Reminder, claim: string): Promise<Outcome> {
		const now = clock.now();
		const settle = async (outcome: Parameters<typeof reminders.settle>[2]) => {
			if (!(await reminders.settle(r.id, claim, outcome))) {
				log.warn('reminder claim lost', { reminderId: r.id });
			}
		};
		const fields = { reminderId: r.id, kind: r.kind, householdId: r.householdId };

		if (now.getTime() - r.dueAt.getTime() > TTL_SECONDS[r.kind] * 1000) {
			await settle({
				status: 'failed',
				attempts: r.attempts,
				delivered: r.delivered,
				lastError: 'expired'
			});
			log.warn('reminder expired', fields);
			return 'failed';
		}
		const payload = await payloadFor(r);
		if ('skip' in payload) {
			await settle({
				status: 'skipped',
				attempts: r.attempts,
				delivered: r.delivered,
				lastError: payload.skip
			});
			log.info('reminder skipped', { ...fields, reason: payload.skip });
			return 'skipped';
		}

		const live = await pushDevices.listLive([r.userId]);
		const targets = live.filter(
			(d) => (!r.deviceId || d.id === r.deviceId) && !r.delivered.includes(d.id)
		);
		if (targets.length === 0) {
			const sentBefore = r.delivered.length > 0;
			await settle({
				status: sentBefore ? 'sent' : 'skipped',
				attempts: r.attempts,
				delivered: r.delivered,
				...(!sentBefore && { lastError: 'no devices' })
			});
			if (!sentBefore) log.info('reminder skipped', { ...fields, reason: 'no devices' });
			return sentBefore ? 'sent' : 'skipped';
		}

		const results = await Promise.all(
			targets.map(async (device: PushDevice) => ({
				device,
				outcome: await push.send(device, payload, { ttlSeconds: TTL_SECONDS[r.kind] })
			}))
		);
		const delivered = [...r.delivered];
		const problems: string[] = [];
		for (const { device, outcome } of results) {
			if (outcome.kind === 'sent') {
				delivered.push(device.id);
				await pushDevices.recordSuccess(device.id, now);
			} else if (outcome.kind === 'gone') {
				await pushDevices.disable(device.id, now);
				log.info('push device disabled', { deviceId: device.id, status: outcome.status });
			} else {
				problems.push(outcome.reason);
				await pushDevices.recordFailure(device.id, now);
			}
		}
		const attempts = r.attempts + 1;
		const sentAt = delivered.length > r.delivered.length ? { sentAt: now } : {};
		const late = { lateMs: now.getTime() - r.dueAt.getTime(), devices: delivered.length };

		// Done when every device answered for good, or the attempts are used up. Reaching any one
		// device counts as sent: the person has the reminder.
		if (problems.length === 0 || attempts >= MAX_ATTEMPTS) {
			const status = delivered.length > 0 ? 'sent' : 'failed';
			const lastError = problems[0] ?? (status === 'failed' ? 'every device gone' : undefined);
			await settle({
				status,
				attempts,
				delivered,
				...sentAt,
				...(lastError && { lastError })
			});
			if (status === 'sent') log.info('reminder sent', { ...fields, ...late });
			else log.warn('reminder failed', { ...fields, reason: lastError, attempts });
			return status;
		}
		await settle({
			status: 'pending',
			attempts,
			delivered,
			...sentAt,
			lastError: problems[0],
			notBefore: retryAt(now, attempts)
		});
		log.warn('reminder will be retried', { ...fields, reason: problems[0], attempts });
		return 'retrying';
	}

	async function run(): Promise<TickReport> {
		const now = clock.now();
		const report: TickReport = {
			extended: 0,
			claimed: 0,
			sent: 0,
			retrying: 0,
			skipped: 0,
			failed: 0
		};
		const count = (outcome: Outcome) => void report[outcome]++;
		const attempt = async (r: Reminder, claim: string) => {
			report.claimed++;
			try {
				count(await deliver(r, claim));
			} catch (err) {
				// Its claim runs out and a later tick takes it up again.
				failed('could not deliver a reminder', err, { reminderId: r.id });
			}
		};

		try {
			report.extended = await extendHorizons(now);
		} catch (err) {
			failed('could not extend series', err);
		}
		try {
			const fresh = await claimTraining(now);
			await Promise.all(fresh.map(({ reminder, claim }) => attempt(reminder, claim)));
		} catch (err) {
			failed('could not plan training reminders', err);
		}
		for (let i = 0; i < BACKLOG_PER_TICK; i++) {
			const claim = ids.next();
			const r = await reminders.claimNext(
				clock.now(),
				claim,
				new Date(clock.now().getTime() + CLAIM_MS)
			);
			if (!r) break;
			await attempt(r, claim);
		}
		return report;
	}

	let running: Promise<TickReport> | null = null;

	return {
		/**
		 * One tick. A call while this process is already running one joins it instead of starting
		 * another; other processes' ticks are kept apart by the ledger.
		 */
		tick(): Promise<TickReport> {
			running ??= run()
				.then((report) => {
					const busy = report.claimed > 0 || report.extended > 0;
					(busy ? log.info : log.debug)('tick', { ...report });
					return report;
				})
				.finally(() => {
					running = null;
				});
			return running;
		}
	};
}
