import { describe, expect, it } from 'vitest';
import type { MemberViewer, Viewer } from '../application/auth/auth.js';
import { createDogs } from '../application/dogs/dogs.js';
import { createIdGenerator, type Id } from '../domain/id.js';
import { manualClock } from '../testing/clock.js';
import { fakePhoto, fakePhotoProcessor, memoryDogs, memoryPhotoStore } from '../testing/dogs.js';
import { createDogsHttp } from './dogs.js';

const silent = { debug() {}, info() {}, warn() {}, error() {}, child: () => silent };
const at = new Date('2026-11-08T08:00:00Z');

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

function setup() {
	const clock = manualClock(at);
	const ids = createIdGenerator(() => clock.now().getTime());
	const dogs = createDogs({
		dogs: memoryDogs(() => clock.now()),
		photos: memoryPhotoStore(),
		photoProcessor: fakePhotoProcessor,
		clock,
		ids,
		logger: silent
	});
	const http = createDogsHttp(dogs);
	const add = async () => {
		const created = await http.create(viewer, {
			form: { dog: JSON.stringify({ name: 'Rosie' }), photo: fakePhoto() }
		});
		return created.body as { id: string; photo: { thumb: string } };
	};
	return { http, add };
}

describe('dogs http', () => {
	it('adds a dog from a multipart form and answers with it and its ETag', async () => {
		const { http } = setup();
		const created = await http.create(viewer, {
			form: {
				dog: JSON.stringify({ name: 'Rosie', birth: { date: '2026-06-01', precision: 'month' } }),
				photo: fakePhoto()
			}
		});
		expect(created).toMatchObject({
			status: 201,
			headers: { etag: '"1"', 'cache-control': 'no-store' },
			body: {
				name: 'Rosie',
				birth: { date: '2026-06-01', precision: 'month' },
				accent: 0,
				archived: false,
				etag: '"1"'
			}
		});
		const body = created.body as { id: string; photo: { thumb: string; large: string } };
		expect(body.photo.thumb).toMatch(
			new RegExp(`^/api/v1/dogs/${body.id}/photo\\?size=thumb&v=[0-9a-f-]{36}$`)
		);
		expect(body.photo.large).toContain('size=large');
	});

	it('refuses a request that is not a form, or whose dog part is not JSON', async () => {
		const { http } = setup();
		expect(await http.create(viewer, { form: null })).toMatchObject({ status: 400 });
		expect(
			await http.create(viewer, { form: { dog: '{not json', photo: fakePhoto() } })
		).toMatchObject({ status: 400, body: { type: 'toe-beans/validation' } });
		expect(
			await http.create(viewer, {
				form: { dog: JSON.stringify({ name: 'Rosie', colour: 'brown' }), photo: fakePhoto() }
			})
		).toMatchObject({ status: 400 });
	});

	it('is a 404 for someone without a household', async () => {
		const { http } = setup();
		expect(await http.list(noHousehold)).toMatchObject({ status: 404 });
		expect(
			await http.create(noHousehold, { form: { dog: '{"name":"Rosie"}', photo: fakePhoto() } })
		).toMatchObject({ status: 404 });
	});

	it('lists only the household’s own dogs', async () => {
		const { http, add } = setup();
		const rosie = await add();
		expect(await http.list(viewer)).toMatchObject({
			status: 200,
			body: { dogs: [{ id: rosie.id }] }
		});
		expect(await http.list(outsider)).toMatchObject({ body: { dogs: [] } });
		expect(await http.get(outsider, { id: rosie.id })).toMatchObject({ status: 404 });
	});

	it('updates with If-Match, and archives', async () => {
		const { http, add } = setup();
		const rosie = await add();
		const body = { name: 'Rosie Posie', archived: true };
		expect(await http.update(viewer, { id: rosie.id, ifMatch: null, body })).toMatchObject({
			status: 428
		});
		expect(await http.update(viewer, { id: rosie.id, ifMatch: '"9"', body })).toMatchObject({
			status: 412
		});
		expect(await http.update(viewer, { id: rosie.id, ifMatch: '"1"', body })).toMatchObject({
			status: 200,
			headers: { etag: '"2"' },
			body: { name: 'Rosie Posie', archived: true }
		});
	});

	it('changes the photo, which gives it new URLs', async () => {
		const { http, add } = setup();
		const rosie = await add();
		const changed = await http.changePhoto(viewer, {
			id: rosie.id,
			ifMatch: '"1"',
			form: { dog: null, photo: fakePhoto('new') }
		});
		expect(changed).toMatchObject({ status: 200, headers: { etag: '"2"' } });
		expect((changed.body as typeof rosie).photo.thumb).not.toBe(rosie.photo.thumb);
		expect(
			await http.changePhoto(viewer, {
				id: rosie.id,
				ifMatch: '"2"',
				form: { dog: null, photo: null }
			})
		).toMatchObject({ status: 400, body: { errors: { photo: ['Add a photo of your dog.'] } } });
	});

	describe('photo', () => {
		it('streams the photo, cached privately with an ETag', async () => {
			const { http, add } = setup();
			const rosie = await add();
			const photo = await http.photo(viewer, { id: rosie.id, size: 'thumb', ifNoneMatch: null });
			expect(photo).toMatchObject({
				status: 200,
				headers: {
					'content-type': 'image/webp',
					'content-length': '7',
					'cache-control': 'private, max-age=86400',
					etag: expect.stringMatching(/^"[0-9a-f-]{36}-thumb"$/),
					'x-content-type-options': 'nosniff'
				}
			});
			expect(await new Response(photo.stream).text()).toBe('thumb:3');
		});

		it('is a 304 when the browser has it already', async () => {
			const { http, add } = setup();
			const rosie = await add();
			const first = await http.photo(viewer, { id: rosie.id, size: 'large', ifNoneMatch: null });
			await first.stream?.cancel();
			const again = await http.photo(viewer, {
				id: rosie.id,
				size: 'large',
				ifNoneMatch: `W/${first.headers.etag}`
			});
			expect(again).toEqual({
				status: 304,
				headers: { 'cache-control': 'private, max-age=86400', etag: first.headers.etag }
			});
		});

		it("is a 404 for another household's dog, whatever the ETag", async () => {
			const { http, add } = setup();
			const rosie = await add();
			expect(
				await http.photo(outsider, { id: rosie.id, size: 'thumb', ifNoneMatch: '*' })
			).toMatchObject({ status: 404, body: { title: 'Dog not found' } });
			expect(
				await http.photo(noHousehold, { id: rosie.id, size: 'thumb', ifNoneMatch: null })
			).toMatchObject({ status: 404 });
		});

		it('takes the large size for anything but thumb', async () => {
			const { http, add } = setup();
			const rosie = await add();
			const photo = await http.photo(viewer, { id: rosie.id, size: 'huge', ifNoneMatch: null });
			expect(await new Response(photo.stream).text()).toBe('large:3');
		});
	});
});
