import { describe, expect, it } from 'vitest';
import type { PlainDate, PlainTime } from '../../domain/calendar.js';
import { photoKey, type Dog } from '../../domain/dog.js';
import type { Exercise } from '../../domain/exercise.js';
import type { Household } from '../../domain/household.js';
import type { Id } from '../../domain/id.js';
import type { SessionLog } from '../../domain/session-log.js';
import type { User } from '../../domain/user.js';
import { memoryUsers } from '../../testing/auth.js';
import { manualClock } from '../../testing/clock.js';
import { memoryPhotoStore } from '../../testing/dogs.js';
import { memoryHouseholds } from '../../testing/household.js';
import { silentLogger } from '../../testing/logger.js';
import { memoryReminderPreferences } from '../../testing/reminders.js';
import type { HouseholdRecordSet, ZipEntry } from '../ports/index.js';
import { createHouseholdExport, EXPORT_SCHEMA_VERSION } from './export.js';

const at = new Date('2026-11-25T22:30:00Z');
const householdId = 'h1' as Id;
const sam: User = {
	id: 'u1' as Id,
	identities: [{ issuer: 'https://auth.example', subject: 'google-oauth2|123', linkedAt: at }],
	email: 'sam@example.com',
	displayName: 'Sam',
	displayNameSource: 'user',
	avatarUrl: 'https://example.com/sam.png',
	termsAccepted: { version: '2026-11-23', at },
	version: 3,
	createdAt: at,
	updatedAt: at
};
const alex: User = { ...sam, id: 'u2' as Id, email: 'alex@example.com', displayName: 'Alex' };
const household: Household = {
	id: householdId,
	name: 'The Does',
	timeZone: 'Africa/Johannesburg',
	memberships: [
		{ userId: sam.id, role: 'owner', joinedAt: at },
		{ userId: alex.id, role: 'caregiver', joinedAt: at }
	],
	version: 4,
	createdAt: at,
	updatedAt: at
};
const dog: Dog = {
	id: 'd1' as Id,
	householdId,
	name: 'Biscuit',
	birth: { date: '2026-06-01' as PlainDate, precision: 'month' },
	photo: { photoId: 'p1' as Id, updatedAt: at },
	accent: 2,
	version: 2,
	createdAt: at,
	updatedAt: at
};
const log: SessionLog = {
	id: 'l1' as Id,
	householdId,
	dogId: dog.id,
	exerciseId: 'recall-basics',
	exerciseContentVersion: 1,
	practisedAt: at,
	outcome: 'not_assessed',
	caregiverId: 'u-gone' as Id,
	updatedBy: sam.id,
	deletedAt: at,
	version: 1,
	createdAt: at,
	updatedAt: at
};
const records: HouseholdRecordSet = {
	dogs: [dog],
	cues: [],
	trainingPlans: [],
	plannedSessions: [],
	sessionLogs: [log],
	behaviourEvents: [],
	careTasks: []
};

async function setup() {
	const households = memoryHouseholds();
	await households.insert(household);
	const users = memoryUsers();
	await users.insert(sam);
	await users.insert(alex);
	const reminderPreferences = memoryReminderPreferences();
	await reminderPreferences.save({
		userId: alex.id,
		training: true,
		trainingLeadMin: 15,
		care: false,
		careLeadDays: 1,
		careTimeOfDay: '08:00' as PlainTime
	});
	const photos = memoryPhotoStore();
	await photos.put(photoKey(dog, dog.photo.photoId, 'large'), new Uint8Array([7, 7]), 'image/webp');
	const read: Id[] = [];
	let written: readonly ZipEntry[] = [];
	const service = createHouseholdExport({
		households,
		users,
		householdRecords: {
			async read(id) {
				read.push(id);
				return records;
			}
		},
		reminderPreferences,
		exercises: {
			all: () => [],
			get: (id) =>
				id === 'recall-basics' ? ({ id, title: 'Recall basics' } as Exercise) : undefined
		},
		photos,
		zip: (entries) => {
			written = entries;
			return new ReadableStream();
		},
		clock: manualClock(at),
		logger: silentLogger
	});
	return { service, photos, read, entries: () => written };
}

const owner = { userId: sam.id, householdId, role: 'owner' as const };

async function contents(entry: ZipEntry | undefined) {
	const opened = await entry?.open();
	if (!opened) return opened;
	return opened instanceof Uint8Array
		? opened
		: new Uint8Array(await new Response(opened).arrayBuffer());
}

describe('the household export (D46)', () => {
	it('is for owners only, and reads nothing for anyone else', async () => {
		const { service, read } = await setup();
		const result = await service.export({ ...owner, userId: alex.id, role: 'caregiver' });
		expect(result).toEqual({ ok: false, error: { kind: 'forbidden' } });
		expect(read).toEqual([]);
	});

	it("reads only the asker's household", async () => {
		const { service, read } = await setup();
		await service.export(owner);
		expect(read).toEqual([householdId]);
	});

	it('names the file by the date on the household’s clocks', async () => {
		const { service } = await setup();
		const result = await service.export(owner);
		// 22:30 UTC is already the next day in Johannesburg.
		expect(result.ok && result.value.filename).toBe('toe-beans-export-2026-11-26.zip');
	});

	it('writes a README, household.json and each dog’s photo', async () => {
		const { service, entries } = await setup();
		await service.export(owner);
		expect(entries().map((e) => [e.name, e.compress])).toEqual([
			['README.txt', true],
			['household.json', true],
			['photos/d1.webp', false]
		]);
		expect([...((await contents(entries()[2])) ?? [])]).toEqual([7, 7]);
	});

	it('leaves out a photo missing from storage', async () => {
		const { service, entries, photos } = await setup();
		await photos.deletePrefix('');
		await service.export(owner);
		expect(await contents(entries()[2])).toBeNull();
	});

	it('holds the records, members and reminder settings, and nothing that signs anyone in', async () => {
		const { service, entries } = await setup();
		await service.export(owner);
		const text = new TextDecoder().decode((await contents(entries()[1])) ?? undefined);
		const doc = JSON.parse(text);

		expect(doc).toMatchObject({
			schemaVersion: EXPORT_SCHEMA_VERSION,
			exportedAt: at.toISOString(),
			exportedBy: sam.id,
			household: {
				id: householdId,
				name: 'The Does',
				timeZone: 'Africa/Johannesburg',
				members: [
					{ id: sam.id, displayName: 'Sam', email: 'sam@example.com', role: 'owner' },
					{ id: alex.id, displayName: 'Alex', email: 'alex@example.com', role: 'caregiver' }
				]
			},
			dogs: [
				{
					id: dog.id,
					name: 'Biscuit',
					birth: { date: '2026-06-01', precision: 'month' },
					photo: 'photos/d1.webp',
					archivedAt: null
				}
			],
			sessionLogs: [
				{ id: log.id, outcome: 'not_assessed', caregiverId: 'u-gone', deletedAt: at.toISOString() }
			],
			reminderSettings: [{ memberId: alex.id, training: true, care: false }],
			exercises: [{ id: 'recall-basics', title: 'Recall basics' }]
		});
		for (const left of [
			'google-oauth2',
			'identities',
			'avatarUrl',
			'householdId',
			'accent',
			'photoId'
		]) {
			expect(text).not.toContain(left);
		}
		// The terms' version is a date; record versions are numbers, and stay out.
		expect(text).not.toMatch(/"version": \d/);
	});
});
