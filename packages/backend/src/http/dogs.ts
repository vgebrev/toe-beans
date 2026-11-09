// /api/v1/dogs and each dog's photo (architecture §3.6, §5.2). Someone with no household gets a
// 404, as if they'd asked for another household's dog (§4.4).
import {
	CreateDog,
	UpdateDog,
	type Dog as DogDto,
	type Dogs as DogsDto
} from '@toe-beans/contracts';
import type { MemberViewer, Viewer } from '../application/auth/auth.js';
import type { Dogs } from '../application/dogs/dogs.js';
import { notFound, validationError } from '../application/errors.js';
import type { Dog, PhotoSize } from '../domain/dog.js';
import { etag, versionFromIfMatch } from './etag.js';
import { errorResponse, json, respond, type HttpResponse } from './response.js';
import { parseInput } from './validation.js';

/**
 * A multipart form as the host read it: the `dog` part's text and the `photo` part's bytes, each
 * null when missing. The form itself is null when the request wasn't one.
 */
export type DogForm = { dog: string | null; photo: Uint8Array | null } | null;

export interface DogsHttp {
	list(viewer: Viewer): Promise<HttpResponse>;
	get(viewer: Viewer, input: { id: string }): Promise<HttpResponse>;
	create(viewer: Viewer, input: { form: DogForm }): Promise<HttpResponse>;
	update(
		viewer: Viewer,
		input: { id: string; ifMatch: string | null; body: unknown }
	): Promise<HttpResponse>;
	changePhoto(
		viewer: Viewer,
		input: { id: string; ifMatch: string | null; form: DogForm }
	): Promise<HttpResponse>;
	photo(
		viewer: Viewer,
		input: { id: string; size: string | null; ifNoneMatch: string | null }
	): Promise<HttpResponse>;
}

const API = '/api/v1';

/** The URL names the photo, so a new one is a new URL and the browser's day-long copy can't go stale. */
const photoUrl = (dog: Dog, size: PhotoSize) =>
	`${API}/dogs/${dog.id}/photo?size=${size}&v=${dog.photo.photoId}`;

export const dogDto = (dog: Dog): DogDto => ({
	id: dog.id,
	name: dog.name,
	...(dog.birth && { birth: dog.birth }),
	...(dog.adoptionDate && { adoptionDate: dog.adoptionDate }),
	...(dog.notes && { notes: dog.notes }),
	accent: dog.accent,
	archived: dog.archivedAt !== undefined,
	photo: { thumb: photoUrl(dog, 'thumb'), large: photoUrl(dog, 'large') },
	etag: etag(dog.version)
});

const dogResponse = (status: number) => (dog: Dog) =>
	json(dogDto(dog), status, { etag: etag(dog.version) });

const isMember = (viewer: Viewer): viewer is MemberViewer => viewer.member !== null;
const noHousehold = () => errorResponse(notFound('household'));
const notAForm = () =>
	errorResponse(validationError('Send the dog and its photo as multipart/form-data.'));

/** Private: only the viewer's browser keeps a copy, for a day (architecture §3.6, NFR-02). */
const PHOTO_CACHE = 'private, max-age=86400';

/** Whether If-None-Match names this ETag, weakly or in a list. */
function matches(ifNoneMatch: string | null, tag: string): boolean {
	if (!ifNoneMatch) return false;
	return ifNoneMatch.split(',').some((t) => {
		const candidate = t.trim().replace(/^W\//, '');
		return candidate === tag || candidate === '*';
	});
}

export function createDogsHttp(dogs: Dogs): DogsHttp {
	return {
		async list(viewer) {
			if (!isMember(viewer)) return noHousehold();
			const all = await dogs.list(viewer.member);
			return json({ dogs: all.map(dogDto) } satisfies DogsDto);
		},

		async get(viewer, { id }) {
			if (!isMember(viewer)) return noHousehold();
			return respond(await dogs.get(viewer.member, id), dogResponse(200));
		},

		async create(viewer, { form }) {
			if (!isMember(viewer)) return noHousehold();
			if (!form) return notAForm();
			let fields: unknown;
			try {
				fields = form.dog === null ? undefined : JSON.parse(form.dog);
			} catch {
				fields = undefined;
			}
			const details = parseInput(CreateDog, fields);
			if (!details.ok) return errorResponse(details.error);
			const created = await dogs.create(viewer.member, {
				details: details.value,
				photo: form.photo
			});
			return respond(created, dogResponse(201));
		},

		async update(viewer, { id, ifMatch, body }) {
			if (!isMember(viewer)) return noHousehold();
			const input = parseInput(UpdateDog, body);
			if (!input.ok) return errorResponse(input.error);
			const version = versionFromIfMatch(ifMatch);
			if (!version.ok) return errorResponse(version.error);
			const { archived, ...details } = input.value;
			const updated = await dogs.update(viewer.member, {
				id,
				expectedVersion: version.value,
				details,
				...(archived !== undefined && { archived })
			});
			return respond(updated, dogResponse(200));
		},

		async changePhoto(viewer, { id, ifMatch, form }) {
			if (!isMember(viewer)) return noHousehold();
			if (!form) return notAForm();
			const version = versionFromIfMatch(ifMatch);
			if (!version.ok) return errorResponse(version.error);
			const changed = await dogs.changePhoto(viewer.member, {
				id,
				expectedVersion: version.value,
				photo: form.photo
			});
			return respond(changed, dogResponse(200));
		},

		async photo(viewer, { id, size, ifNoneMatch }) {
			if (!isMember(viewer)) return noHousehold();
			const photoSize: PhotoSize = size === 'thumb' ? 'thumb' : 'large';
			const found = await dogs.photo(viewer.member, { id, size: photoSize });
			if (!found.ok) return errorResponse(found.error);
			const tag = `"${found.value.photoId}-${photoSize}"`;
			const headers = { 'cache-control': PHOTO_CACHE, etag: tag };
			if (matches(ifNoneMatch, tag)) return { status: 304, headers };
			const stored = await found.value.open();
			if (!stored) return errorResponse(notFound('photo'));
			return {
				status: 200,
				headers: {
					...headers,
					'content-type': 'image/webp',
					'content-length': String(stored.size),
					'x-content-type-options': 'nosniff'
				},
				stream: stored.body
			};
		}
	};
}
