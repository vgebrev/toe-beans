// A household with years of records, for measuring the export (backlog S19.7, architecture D46):
// the integration test seeds one into its container, and `pnpm seed:household` into the dev
// database. Written through the repositories, so the documents are the shape the app writes.
//
// The defaults are two dogs over two years at a busy pace: 10 training sessions a day (9 of them
// planned and logged, one planned and skipped, one logged without a plan), 5 care tasks and one
// journal event a week.
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import type { Ports } from '../src/application/ports/index.js';
import { EVENT_CATEGORIES } from '../src/domain/behaviour-event.js';
import {
	addDays,
	instantAt,
	todayIn,
	type PlainDate,
	type PlainTime
} from '../src/domain/calendar.js';
import { CARE_CATEGORIES } from '../src/domain/care-task.js';
import { photoKey, type Dog } from '../src/domain/dog.js';
import type { Household } from '../src/domain/household.js';
import { createIdGenerator, type Id } from '../src/domain/id.js';
import type { PlannedSession } from '../src/domain/planner.js';
import { ENVIRONMENTS, type SessionLog } from '../src/domain/session-log.js';
import type { User } from '../src/domain/user.js';

export interface BigHouseholdOptions {
	owner: User;
	householdName?: string;
	timeZone?: string;
	days?: number;
	dogs?: number;
	/** Planned sessions a day per dog, all logged but the first dog's last one, which is skipped. */
	sessionsPerDogPerDay?: number;
	careTasksPerWeek?: number;
	eventsPerWeek?: number;
	now?: Date;
}

export interface SeededHousehold {
	household: Household;
	dogs: Dog[];
	counts: {
		plannedSessions: number;
		sessionLogs: number;
		careTasks: number;
		behaviourEvents: number;
	};
}

const EXERCISES = [
	'recall-basics',
	'name-game',
	'settle-on-a-mat',
	'loose-lead-first-steps',
	'toilet-routine'
];
const NOTES = [
	'Great focus today, came straight back every time.',
	'Distracted by the neighbour’s dog — shorter session, ended on a win.',
	'Used the high-value treats (chicken). Much better than kibble.',
	'Tired after the walk, so we kept it to three easy reps.',
	'Practised at the café patio 🐾 lots of people, stayed calm.',
	'Raining, so we trained in the hallway instead of the garden.'
];
const TIMES = ['07:00', '09:30', '12:00', '15:30', '18:00', '19:30', '21:00'] as PlainTime[];

/** Runs `work` on every item, `size` at a time. */
async function inBatches<T>(
	items: readonly T[],
	size: number,
	work: (item: T) => Promise<unknown>
) {
	for (let i = 0; i < items.length; i += size) {
		await Promise.all(items.slice(i, i + size).map(work));
	}
}

/** A photo-sized WebP of noise, which compresses about as badly as a real photo. */
async function noisyPhoto(size: number): Promise<Uint8Array> {
	const raw = randomBytes(size * size * 3);
	return sharp(raw, { raw: { width: size, height: size, channels: 3 } })
		.webp({ quality: 80 })
		.toBuffer();
}

export async function seedBigHousehold(
	ports: Pick<
		Ports,
		| 'users'
		| 'households'
		| 'dogs'
		| 'photos'
		| 'cues'
		| 'plans'
		| 'plannedSessions'
		| 'sessionLogs'
		| 'careTasks'
		| 'behaviourEvents'
	>,
	{
		owner,
		householdName = 'The Busy Household',
		timeZone = 'Africa/Johannesburg',
		days = 730,
		dogs: dogCount = 2,
		sessionsPerDogPerDay = 5,
		careTasksPerWeek = 5,
		eventsPerWeek = 1,
		now = new Date()
	}: BigHouseholdOptions
): Promise<SeededHousehold> {
	let at = now.getTime();
	const ids = createIdGenerator(() => at);
	const today = todayIn(now, timeZone);
	const start = addDays(today, -days);
	const by = owner.id;

	const household: Household = {
		id: ids.next(),
		name: householdName,
		timeZone,
		memberships: [{ userId: by, role: 'owner', joinedAt: instantAt(start, TIMES[0]!, timeZone) }],
		version: 1,
		createdAt: now,
		updatedAt: now
	};
	const inserted = await ports.households.insert(household);
	if (!inserted.ok) throw new Error('the owner already has a household');
	const householdId = household.id;

	const dogs: Dog[] = [];
	for (let d = 0; d < dogCount; d++) {
		const photoId = ids.next();
		const dog = await ports.dogs.insert({
			id: ids.next(),
			householdId,
			name: ['Biscuit', 'Pepper', 'Mochi', 'Rolo'][d % 4]!,
			birth: { date: addDays(start, -90) as PlainDate, precision: 'month' },
			photo: { photoId, updatedAt: now },
			accent: d % 6
		});
		await ports.photos.put(photoKey(dog, photoId, 'large'), await noisyPhoto(512), 'image/webp');
		await ports.photos.put(photoKey(dog, photoId, 'thumb'), await noisyPhoto(160), 'image/webp');
		dogs.push(dog);
	}

	for (const [label, meaning] of [
		['Sit', 'Bottom on the floor until released.'],
		['Touch', 'Nose to my open palm.'],
		['Leave it', 'Turn away from whatever it is, and get a treat from me.'],
		['Okay', 'The release: free to move.']
	] as const) {
		await ports.cues.insert({ id: ids.next(), householdId, label, meaning, updatedBy: by });
	}

	// One plan per dog and exercise slot; the sessions are written out below rather than by the
	// planner, so the past is as full as the pace says.
	const times = TIMES.slice(0, sessionsPerDogPerDay);
	const plans = await Promise.all(
		dogs.map((dog, d) =>
			ports.plans.insert({
				id: ids.next(),
				householdId,
				dogId: dog.id,
				exerciseId: EXERCISES[d % EXERCISES.length]!,
				startDate: start,
				times,
				days: [1, 2, 3, 4, 5, 6, 7],
				horizon: addDays(today, 21),
				updatedBy: by
			})
		)
	);

	const sessions: PlannedSession[] = [];
	const logs: SessionLog[] = [];
	let n = 0;
	for (let day = 0; day <= days + 21; day++) {
		const date = addDays(start, day);
		const past = date < today;
		for (const [d, dog] of dogs.entries()) {
			for (const [t, time] of times.entries()) {
				const scheduledAt = instantAt(date, time, timeZone);
				at = scheduledAt.getTime();
				const id = ids.next();
				const skipped = past && d === 0 && t === times.length - 1;
				const logged = past && !skipped;
				const logId = logged ? ids.next() : undefined;
				sessions.push({
					id,
					householdId,
					dogId: dog.id,
					exerciseId: plans[d]!.exerciseId,
					scheduledAt,
					status: logged ? 'completed' : skipped ? 'skipped' : 'planned',
					planId: plans[d]!.id,
					occurrenceKey: `${date}T${time}`,
					...(logId && { sessionLogId: logId }),
					updatedBy: by,
					version: 1,
					createdAt: scheduledAt,
					updatedAt: scheduledAt
				});
				if (logId) logs.push(log(logId, dog.id, plans[d]!.exerciseId, scheduledAt, n++, id));
			}
			// One unplanned session a day for the first dog.
			if (past && d === 0) {
				const practisedAt = instantAt(date, '16:45' as PlainTime, timeZone);
				at = practisedAt.getTime();
				logs.push(log(ids.next(), dog.id, EXERCISES[n % EXERCISES.length]!, practisedAt, n++));
			}
		}
	}

	function log(
		id: Id,
		dogId: Id,
		exerciseId: string,
		practisedAt: Date,
		i: number,
		plannedSessionId?: Id
	): SessionLog {
		const assessed = i % 5 !== 0;
		return {
			id,
			householdId,
			dogId,
			exerciseId,
			exerciseContentVersion: 1,
			practisedAt,
			outcome: assessed ? (['successful', 'partial', 'not_yet'] as const)[i % 3]! : 'not_assessed',
			...(i % 2 === 0 && { durationMin: 5 + (i % 4) * 5 }),
			...(i % 3 === 0 && { emotionalState: 'relaxed' as const }),
			...(i % 4 === 0 && {
				environment: ENVIRONMENTS[i % ENVIRONMENTS.length]!,
				environmentNote: 'the park by the river'
			}),
			...(i % 5 < 2 && { notes: NOTES[i % NOTES.length]! }),
			...(plannedSessionId && { plannedSessionId }),
			caregiverId: by,
			updatedBy: by,
			version: 1,
			createdAt: practisedAt,
			updatedAt: practisedAt
		};
	}

	for (let i = 0; i < sessions.length; i += 1000) {
		await ports.plannedSessions.insertOccurrences(householdId, sessions.slice(i, i + 1000));
	}
	await inBatches(logs, 200, ({ version: _, createdAt: __, updatedAt: ___, ...log }) =>
		ports.sessionLogs.insert(log)
	);

	const weeks = Math.floor(days / 7);
	const tasks = [];
	const events = [];
	for (let w = 0; w <= weeks + 3; w++) {
		for (let c = 0; c < careTasksPerWeek; c++) {
			const dueDate = addDays(start, w * 7 + c);
			const done = dueDate < today;
			const createdAt = instantAt(addDays(dueDate, -14), '08:00' as PlainTime, timeZone);
			tasks.push({
				id: ids.next(),
				householdId,
				dogId: dogs[c % dogs.length]!.id,
				category: CARE_CATEGORIES[c % CARE_CATEGORIES.length]!,
				title: ['Deworming', 'Flea and tick', 'Weigh-in', 'Nail trim', 'Vet check-up'][c % 5]!,
				dueDate,
				...(c % 2 === 0 && { dueTime: '10:00' as PlainTime }),
				...(c === 4 && { notes: 'Ask about the itchy ear; bring the vaccination card.' }),
				status: done ? ('completed' as const) : ('upcoming' as const),
				...(done && { completedOn: dueDate }),
				history: [
					{ kind: 'created' as const, due: { date: dueDate }, at: createdAt, by },
					...(done
						? [
								{
									kind: 'completed' as const,
									on: dueDate,
									at: instantAt(dueDate, '18:00' as PlainTime, timeZone),
									by
								}
							]
						: [])
				],
				createdBy: by,
				updatedBy: by
			});
		}
		for (let e = 0; e < eventsPerWeek && w < weeks; e++) {
			const occurredAt = instantAt(addDays(start, w * 7 + 3), '17:20' as PlainTime, timeZone);
			events.push({
				id: ids.next(),
				householdId,
				dogId: dogs[w % dogs.length]!.id,
				category: EVENT_CATEGORIES[w % EVENT_CATEGORIES.length]!,
				occurredAt,
				trigger: 'Delivery van at the gate',
				response: 'Barked twice, then came to me for a treat.',
				...(w % 3 === 0 && { notes: 'Better than last week.' }),
				recordedBy: by,
				updatedBy: by
			});
		}
	}
	await inBatches(tasks, 200, (task) => ports.careTasks.insert(task));
	await inBatches(events, 200, (event) => ports.behaviourEvents.insert(event));

	return {
		household,
		dogs,
		counts: {
			plannedSessions: sessions.length,
			sessionLogs: logs.length,
			careTasks: tasks.length,
			behaviourEvents: events.length
		}
	};
}
