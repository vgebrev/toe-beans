import { describe, expect, it } from 'vitest';
import { createIdGenerator, type Id } from '../../domain/id.js';
import { manualClock } from '../../testing/clock.js';
import { fakePhoto, fakePhotoProcessor, memoryDogs, memoryPhotoStore } from '../../testing/dogs.js';
import type { MemberContext } from '../auth/auth.js';
import { createDogs, PHOTO_MAX_BYTES } from './dogs.js';

const at = new Date('2026-11-08T08:00:00Z');
const silent = { debug() {}, info() {}, warn() {}, error() {}, child: () => silent };
const ctx: MemberContext = { userId: 'u1' as Id, householdId: 'h1' as Id, role: 'caregiver' };
const outsider: MemberContext = { userId: 'u9' as Id, householdId: 'h9' as Id, role: 'owner' };

function setup() {
	const clock = manualClock(at);
	const dogs = memoryDogs(() => clock.now());
	const photos = memoryPhotoStore();
	const ids = createIdGenerator(() => clock.now().getTime());
	const service = createDogs({
		dogs,
		photos,
		photoProcessor: fakePhotoProcessor,
		clock,
		ids,
		logger: silent
	});
	const add = async (name = 'Rosie') => {
		const created = await service.create(ctx, { details: { name }, photo: fakePhoto() });
		if (!created.ok) throw new Error('could not add the dog');
		return created.value;
	};
	return { clock, dogs, photos, service, add };
}

describe('adding a dog', () => {
	it('stores the photo in both sizes and the dog pointing at it', async () => {
		const { service, photos } = setup();
		const created = await service.create(ctx, {
			details: {
				name: ' Rosie ',
				birth: { date: '2026-06-01', precision: 'month' },
				adoptionDate: null,
				notes: ''
			},
			photo: fakePhoto()
		});
		expect(created).toEqual({
			ok: true,
			value: {
				id: expect.any(String),
				householdId: 'h1',
				name: 'Rosie',
				birth: { date: '2026-06-01', precision: 'month' },
				photo: { photoId: expect.any(String), updatedAt: at },
				accent: 0,
				version: 1,
				createdAt: at,
				updatedAt: at
			}
		});
		const dog = created.ok ? created.value : undefined;
		const prefix = `households/h1/dogs/${dog!.id}/${dog!.photo.photoId}`;
		expect(photos.keys()).toEqual([`${prefix}-large.webp`, `${prefix}-thumb.webp`]);
	});

	it("needs a photo, and says so with the other fields' problems", async () => {
		const { service, photos } = setup();
		expect(await service.create(ctx, { details: { name: '' }, photo: null })).toEqual({
			ok: false,
			error: {
				kind: 'validation',
				message: 'The dog is not valid.',
				fields: {
					name: ['Enter a name of up to 50 characters.'],
					photo: ['Add a photo of your dog.']
				}
			}
		});
		expect(photos.keys()).toEqual([]);
	});

	it('refuses a photo too large or not an image', async () => {
		const { service, photos } = setup();
		const huge = new Uint8Array(PHOTO_MAX_BYTES + 1);
		huge.set(fakePhoto());
		expect(await service.create(ctx, { details: { name: 'Rosie' }, photo: huge })).toMatchObject({
			error: { fields: { photo: ['Choose a photo under 10 MB.'] } }
		});
		const text = new TextEncoder().encode('hello');
		expect(await service.create(ctx, { details: { name: 'Rosie' }, photo: text })).toMatchObject({
			error: { fields: { photo: ['Choose a JPEG, PNG or WebP photo.'] } }
		});
		expect(photos.keys()).toEqual([]);
	});

	it('removes a size already stored when the next one fails', async () => {
		const { service, photos } = setup();
		const put = photos.put;
		let calls = 0;
		photos.put = async (...args) => {
			if (++calls === 2) throw new Error('storage is down');
			return put(...args);
		};
		await expect(
			service.create(ctx, { details: { name: 'Rosie' }, photo: fakePhoto() })
		).rejects.toThrow('storage is down');
		expect(calls).toBe(2);
		expect(photos.keys()).toEqual([]);
	});

	it('removes the stored photo when the dog is not saved', async () => {
		const { service, photos, dogs } = setup();
		dogs.insert = async () => {
			throw new Error('database is down');
		};
		await expect(
			service.create(ctx, { details: { name: 'Rosie' }, photo: fakePhoto() })
		).rejects.toThrow('database is down');
		expect(photos.keys()).toEqual([]);
	});

	it('gives each new dog the accent used least by the dogs still here', async () => {
		const { add, service, clock } = setup();
		const rosie = await add('Rosie');
		const milo = await add('Milo');
		expect([rosie.accent, milo.accent]).toEqual([0, 1]);
		clock.advance(1000);
		await service.update(ctx, { id: rosie.id, expectedVersion: 1, details: {}, archived: true });
		expect((await add('Bean')).accent).toBe(0);
	});
});

describe('listing and reading', () => {
	it('lists the household’s dogs in the order they were added, and nobody else’s', async () => {
		const { add, service } = setup();
		const rosie = await add('Rosie');
		const milo = await add('Milo');
		expect((await service.list(ctx)).map((d) => d.id)).toEqual([rosie.id, milo.id]);
		expect(await service.list(outsider)).toEqual([]);
	});

	it("can't read another household's dog, or one with a malformed ID", async () => {
		const { add, service } = setup();
		const rosie = await add();
		expect(await service.get(ctx, rosie.id)).toMatchObject({ ok: true });
		expect(await service.get(outsider, rosie.id)).toEqual({
			ok: false,
			error: { kind: 'not-found', resource: 'dog' }
		});
		expect(await service.get(ctx, 'not-an-id')).toMatchObject({ error: { kind: 'not-found' } });
	});
});

describe('updating a dog', () => {
	it('changes what is given, clears what is null and keeps the rest', async () => {
		const { service, clock } = setup();
		const created = await service.create(ctx, {
			details: { name: 'Rosie', adoptionDate: '2026-08-15', notes: 'Loves cheese.' },
			photo: fakePhoto()
		});
		const rosie = created.ok ? created.value : undefined;
		clock.advance(60_000);
		const updated = await service.update(ctx, {
			id: rosie!.id,
			expectedVersion: 1,
			details: { name: 'Rosie Posie', notes: null, birth: { date: '2026-05-20', precision: 'day' } }
		});
		expect(updated).toMatchObject({
			ok: true,
			value: {
				name: 'Rosie Posie',
				birth: { date: '2026-05-20', precision: 'day' },
				adoptionDate: '2026-08-15',
				version: 2
			}
		});
		expect(updated.ok && updated.value).not.toHaveProperty('notes');
	});

	it('checks the result as a whole', async () => {
		const { service } = setup();
		const created = await service.create(ctx, {
			details: { name: 'Rosie', adoptionDate: '2026-08-15' },
			photo: fakePhoto()
		});
		const id = created.ok ? created.value.id : '';
		expect(
			await service.update(ctx, {
				id,
				expectedVersion: 1,
				details: { birth: { date: '2026-09-01', precision: 'day' } }
			})
		).toMatchObject({
			error: { fields: { adoptionDate: ["The adoption date can't be before the birth date."] } }
		});
	});

	it('archives and brings back, keeping when it was first archived', async () => {
		const { add, service, clock } = setup();
		const rosie = await add();
		const archived = await service.update(ctx, {
			id: rosie.id,
			expectedVersion: 1,
			details: {},
			archived: true
		});
		expect(archived).toMatchObject({ ok: true, value: { archivedAt: at } });
		clock.advance(60_000);
		const again = await service.update(ctx, {
			id: rosie.id,
			expectedVersion: 2,
			details: {},
			archived: true
		});
		expect(again).toMatchObject({ value: { archivedAt: at } });
		const back = await service.update(ctx, {
			id: rosie.id,
			expectedVersion: 3,
			details: {},
			archived: false
		});
		expect(back.ok && back.value).not.toHaveProperty('archivedAt');
	});

	it("refuses a stale version, and can't touch another household's dog", async () => {
		const { add, service } = setup();
		const rosie = await add();
		const rename = (who: MemberContext, expectedVersion: number) =>
			service.update(who, { id: rosie.id, expectedVersion, details: { name: 'Milo' } });
		expect(await rename(ctx, 7)).toEqual({ ok: false, error: { kind: 'stale-version' } });
		expect(await rename(outsider, 1)).toMatchObject({ error: { kind: 'not-found' } });
		expect(await service.get(ctx, rosie.id)).toMatchObject({ value: { name: 'Rosie' } });
	});
});

describe('changing the photo', () => {
	it('stores the new photo, then removes the old one', async () => {
		const { add, service, photos } = setup();
		const rosie = await add();
		const changed = await service.changePhoto(ctx, {
			id: rosie.id,
			expectedVersion: 1,
			photo: fakePhoto('new')
		});
		expect(changed).toMatchObject({ ok: true, value: { version: 2 } });
		const photoId = changed.ok ? changed.value.photo.photoId : '';
		expect(photoId).not.toBe(rosie.photo.photoId);
		expect(photos.keys()).toEqual([
			`households/h1/dogs/${rosie.id}/${photoId}-large.webp`,
			`households/h1/dogs/${rosie.id}/${photoId}-thumb.webp`
		]);
	});

	it('keeps the old photo when the version is stale, and stores nothing', async () => {
		const { add, service, photos } = setup();
		const rosie = await add();
		const before = photos.keys();
		expect(
			await service.changePhoto(ctx, { id: rosie.id, expectedVersion: 5, photo: fakePhoto() })
		).toEqual({ ok: false, error: { kind: 'stale-version' } });
		expect(photos.keys()).toEqual(before);
	});

	it('removes the new objects when the dog changed while the photo was processed', async () => {
		const { add, service, photos, dogs } = setup();
		const rosie = await add();
		const before = photos.keys();
		const update = dogs.update;
		dogs.update = async (...args) => {
			await update(ctx.householdId, rosie.id, 1, { name: 'Changed meanwhile' });
			return update(...args);
		};
		expect(
			await service.changePhoto(ctx, { id: rosie.id, expectedVersion: 1, photo: fakePhoto() })
		).toEqual({ ok: false, error: { kind: 'stale-version' } });
		expect(photos.keys()).toEqual(before);
	});

	it("can't change another household's dog's photo", async () => {
		const { add, service, photos } = setup();
		const rosie = await add();
		const before = photos.keys();
		expect(
			await service.changePhoto(outsider, { id: rosie.id, expectedVersion: 1, photo: fakePhoto() })
		).toMatchObject({ error: { kind: 'not-found' } });
		expect(photos.keys()).toEqual(before);
	});
});

describe('serving the photo', () => {
	it("opens the dog's own photo in the size asked for", async () => {
		const { add, service } = setup();
		const rosie = await add();
		const photo = await service.photo(ctx, { id: rosie.id, size: 'thumb' });
		expect(photo).toMatchObject({ ok: true, value: { photoId: rosie.photo.photoId } });
		const stored = photo.ok ? await photo.value.open() : null;
		expect(await new Response(stored!.body).text()).toBe('thumb:3');
	});

	it("can't reach another household's dog's photo", async () => {
		const { add, service } = setup();
		const rosie = await add();
		expect(await service.photo(outsider, { id: rosie.id, size: 'large' })).toEqual({
			ok: false,
			error: { kind: 'not-found', resource: 'dog' }
		});
	});
});
