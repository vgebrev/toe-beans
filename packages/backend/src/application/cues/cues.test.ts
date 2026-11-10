import { describe, expect, it } from 'vitest';
import { createIdGenerator, type Id } from '../../domain/id.js';
import type { User } from '../../domain/user.js';
import { memoryUsers } from '../../testing/auth.js';
import { manualClock } from '../../testing/clock.js';
import { memoryCues } from '../../testing/cues.js';
import type { MemberContext } from '../auth/auth.js';
import { createCues, FORMER_MEMBER } from './cues.js';

const at = new Date('2026-11-09T08:00:00Z');
const silent = { debug() {}, info() {}, warn() {}, error() {}, child: () => silent };
const person = (id: string, displayName: string): User => ({
	id: id as Id,
	identities: [],
	email: `${id}@example.com`,
	displayName,
	displayNameSource: 'user',
	version: 1,
	createdAt: at,
	updatedAt: at
});
const sam: MemberContext = { userId: 'sam' as Id, householdId: 'h1' as Id, role: 'owner' };
const alex: MemberContext = { userId: 'alex' as Id, householdId: 'h1' as Id, role: 'caregiver' };
const outsider: MemberContext = { userId: 'out' as Id, householdId: 'h9' as Id, role: 'owner' };

async function setup() {
	const clock = manualClock(at);
	const users = memoryUsers();
	for (const u of [person('sam', 'Sam'), person('alex', 'Alex'), person('out', 'Out')]) {
		await users.insert(u);
	}
	const cues = memoryCues(() => clock.now());
	const ids = createIdGenerator(() => clock.now().getTime());
	const service = createCues({ cues, users, ids, logger: silent });
	const add = async (label = 'Sit', ctx = sam) => {
		const created = await service.create(ctx, { label, meaning: 'Bottom on the floor.' });
		if (!created.ok) throw new Error('could not add the cue');
		return created.value.cue;
	};
	return { clock, cues, service, add };
}

describe('adding a cue', () => {
	it('stores the tidied cue with who added it', async () => {
		const { service } = await setup();
		const created = await service.create(sam, {
			label: ' Sit ',
			meaning: 'Bottom on the floor until released.',
			handSignal: 'Flat hand, palm up, raised',
			rewardConvention: null,
			notes: ''
		});
		expect(created).toEqual({
			ok: true,
			value: {
				cue: {
					id: expect.any(String),
					householdId: 'h1',
					label: 'Sit',
					meaning: 'Bottom on the floor until released.',
					handSignal: 'Flat hand, palm up, raised',
					updatedBy: 'sam',
					version: 1,
					createdAt: at,
					updatedAt: at
				},
				updatedByName: 'Sam'
			}
		});
	});

	it('refuses a cue word the household already has', async () => {
		const { service, add, cues } = await setup();
		await add('Leave it');
		expect(await service.create(alex, { label: 'leave IT', meaning: 'Ignore it.' })).toEqual({
			ok: false,
			error: {
				kind: 'validation',
				message: 'The cue is not valid.',
				fields: { label: ["There's already a cue called “Leave it”."] }
			}
		});
		// Another household can use the same word.
		expect((await service.create(outsider, { label: 'Leave it', meaning: 'Ignore it.' })).ok).toBe(
			true
		);
		expect(cues.all()).toHaveLength(2);
	});

	it('stops at the household limit', async () => {
		const { service, add } = await setup();
		for (let i = 0; i < 200; i++) await add(`Cue ${i}`);
		expect(await service.create(sam, { label: 'One more', meaning: 'm' })).toMatchObject({
			ok: false,
			error: { kind: 'validation', message: expect.stringContaining('up to 200 cues') }
		});
	});
});

describe('listing cues', () => {
	it('sorts by cue word and names who saved each last', async () => {
		const { service, add } = await setup();
		await add('sit');
		await add('Down', alex);
		await add('Cue 10');
		await add('cue 9');
		await add('Mine', outsider);
		const list = await service.list(sam);
		expect(list.map((v) => v.cue.label)).toEqual(['cue 9', 'Cue 10', 'Down', 'sit']);
		expect(list.find((v) => v.cue.label === 'Down')?.updatedByName).toBe('Alex');
	});

	it('names someone whose account is gone as a former member', async () => {
		const { service, add } = await setup();
		await add('Sit', { ...sam, userId: 'gone' as Id });
		expect((await service.list(sam))[0]?.updatedByName).toBe(FORMER_MEMBER);
	});
});

describe('changing a cue', () => {
	it('changes what was sent, clears what was nulled, and records who', async () => {
		const { service, clock } = await setup();
		const { id } = await service
			.create(sam, { label: 'Sit', meaning: 'm', handSignal: 'Palm up', notes: 'n' })
			.then((r) => (r.ok ? r.value.cue : { id: '' }));
		clock.advance(60_000);
		const updated = await service.update(alex, {
			id,
			expectedVersion: 1,
			details: { meaning: 'Bottom down until released.', handSignal: null }
		});
		expect(updated).toMatchObject({
			ok: true,
			value: {
				cue: { label: 'Sit', meaning: 'Bottom down until released.', notes: 'n', version: 2 },
				updatedByName: 'Alex'
			}
		});
		expect(updated.ok && updated.value.cue).not.toHaveProperty('handSignal');
		expect(updated.ok && updated.value.cue.updatedAt).toEqual(new Date(at.getTime() + 60_000));
	});

	it("won't overwrite a change made elsewhere", async () => {
		const { service, add } = await setup();
		const cue = await add();
		await service.update(alex, { id: cue.id, expectedVersion: 1, details: { meaning: 'First' } });
		expect(
			await service.update(sam, { id: cue.id, expectedVersion: 1, details: { meaning: 'Late' } })
		).toEqual({ ok: false, error: { kind: 'stale-version' } });
	});

	it('can change the case of its own word, but not take another cue’s', async () => {
		const { service, add } = await setup();
		const sit = await add('Sit');
		await add('Down');
		const renamed = await service.update(sam, {
			id: sit.id,
			expectedVersion: 1,
			details: { label: 'SIT' }
		});
		expect(renamed).toMatchObject({ ok: true, value: { cue: { label: 'SIT' } } });
		expect(
			await service.update(sam, { id: sit.id, expectedVersion: 2, details: { label: 'down' } })
		).toMatchObject({ ok: false, error: { fields: { label: [expect.stringContaining('Down')] } } });
	});

	it("can't reach another household's cue, or a malformed ID", async () => {
		const { service, add } = await setup();
		const cue = await add();
		const notFound = { ok: false, error: { kind: 'not-found', resource: 'cue' } };
		expect(
			await service.update(outsider, { id: cue.id, expectedVersion: 1, details: { meaning: 'x' } })
		).toEqual(notFound);
		expect(await service.get(outsider, cue.id)).toEqual(notFound);
		expect(await service.get(sam, 'nope')).toEqual(notFound);
	});
});

describe('deleting a cue', () => {
	it('deletes at the current version only, and only in the household', async () => {
		const { service, add, cues } = await setup();
		const cue = await add();
		await service.update(alex, { id: cue.id, expectedVersion: 1, details: { meaning: 'New' } });
		expect(await service.remove(sam, { id: cue.id, expectedVersion: 1 })).toEqual({
			ok: false,
			error: { kind: 'stale-version' }
		});
		expect(await service.remove(outsider, { id: cue.id, expectedVersion: 2 })).toMatchObject({
			ok: false,
			error: { kind: 'not-found' }
		});
		expect(await service.remove(sam, { id: 'nope', expectedVersion: 1 })).toMatchObject({
			ok: false,
			error: { kind: 'not-found' }
		});
		expect(await service.remove(sam, { id: cue.id, expectedVersion: 2 })).toEqual({
			ok: true,
			value: undefined
		});
		expect(cues.all()).toEqual([]);
	});
});
