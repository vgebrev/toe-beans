import { describe, expect, it } from 'vitest';
import type { MemberViewer, Viewer } from '../application/auth/auth.js';
import { createCues } from '../application/cues/cues.js';
import { createIdGenerator, type Id } from '../domain/id.js';
import { memoryUsers } from '../testing/auth.js';
import { manualClock } from '../testing/clock.js';
import { memoryCues } from '../testing/cues.js';
import { createCuesHttp } from './cues.js';

const silent = { debug() {}, info() {}, warn() {}, error() {}, child: () => silent };
const at = new Date('2026-11-09T08:00:00Z');

const noHousehold: Viewer = {
	auth: { userId: 'u' as Id },
	displayName: 'Sam',
	email: 'sam@example.com',
	member: null
};
const member = (householdId: string): MemberViewer => ({
	...noHousehold,
	member: {
		userId: 'u' as Id,
		householdId: householdId as Id,
		role: 'caregiver',
		householdName: 'The Does',
		timeZone: 'UTC'
	}
});
const viewer = member('h1');
const outsider = member('h2');

async function setup() {
	const clock = manualClock(at);
	const users = memoryUsers();
	await users.insert({
		id: 'u' as Id,
		identities: [],
		email: 'sam@example.com',
		displayName: 'Sam',
		displayNameSource: 'user',
		version: 1,
		createdAt: at,
		updatedAt: at
	});
	const ids = createIdGenerator(() => clock.now().getTime());
	const http = createCuesHttp(
		createCues({ cues: memoryCues(() => clock.now()), users, ids, logger: silent })
	);
	const add = async (label = 'Sit') =>
		(await http.create(viewer, { body: { label, meaning: 'Bottom down.' } })).body as {
			id: string;
		};
	return { http, add };
}

describe('cues http', () => {
	it('adds a cue and answers with it, who saved it, and its ETag', async () => {
		const { http } = await setup();
		const created = await http.create(viewer, {
			body: { label: 'Sit', meaning: 'Bottom down.', handSignal: 'Palm up', notes: null }
		});
		expect(created).toMatchObject({
			status: 201,
			headers: { etag: '"1"', 'cache-control': 'no-store' },
			body: {
				id: expect.any(String),
				label: 'Sit',
				meaning: 'Bottom down.',
				handSignal: 'Palm up',
				updatedAt: at.toISOString(),
				updatedBy: 'Sam',
				etag: '"1"'
			}
		});
		expect(created.body).not.toHaveProperty('notes');
	});

	it('lists in alphabetical order', async () => {
		const { http, add } = await setup();
		await add('Sit');
		await add('Down');
		const listed = await http.list(viewer);
		expect(listed.status).toBe(200);
		expect((listed.body as { cues: { label: string }[] }).cues.map((c) => c.label)).toEqual([
			'Down',
			'Sit'
		]);
	});

	it('answers a bad body with field errors, and a duplicate the same way', async () => {
		const { http, add } = await setup();
		expect(await http.create(viewer, { body: { label: 'Sit', extra: 1 } })).toMatchObject({
			status: 400
		});
		await add('Sit');
		expect(await http.create(viewer, { body: { label: 'sit', meaning: 'm' } })).toMatchObject({
			status: 400,
			body: { errors: { label: [expect.stringContaining('Sit')] } }
		});
	});

	it('needs If-Match to change or delete, and refuses a stale one', async () => {
		const { http, add } = await setup();
		const { id } = await add();
		const body = { meaning: 'Bottom down until released.' };
		expect(await http.update(viewer, { id, ifMatch: null, body })).toMatchObject({ status: 428 });
		expect(await http.remove(viewer, { id, ifMatch: null })).toMatchObject({ status: 428 });
		expect(await http.update(viewer, { id, ifMatch: '"1"', body })).toMatchObject({
			status: 200,
			headers: { etag: '"2"' },
			body: { meaning: 'Bottom down until released.' }
		});
		expect(await http.update(viewer, { id, ifMatch: '"1"', body })).toMatchObject({ status: 412 });
		expect(await http.remove(viewer, { id, ifMatch: '"1"' })).toMatchObject({ status: 412 });
		expect(await http.remove(viewer, { id, ifMatch: '"2"' })).toMatchObject({ status: 204 });
		expect(await http.get(viewer, { id })).toMatchObject({ status: 404 });
	});

	it("hides another household's cue, and everything from someone with no household", async () => {
		const { http, add } = await setup();
		const { id } = await add();
		expect(await http.get(outsider, { id })).toMatchObject({ status: 404 });
		expect(
			await http.update(outsider, { id, ifMatch: '"1"', body: { meaning: 'x' } })
		).toMatchObject({ status: 404 });
		expect(await http.remove(outsider, { id, ifMatch: '"1"' })).toMatchObject({ status: 404 });
		expect(await http.list(noHousehold)).toMatchObject({ status: 404 });
		expect(await http.create(noHousehold, { body: {} })).toMatchObject({ status: 404 });
	});
});
