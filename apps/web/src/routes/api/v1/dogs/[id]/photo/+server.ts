// A dog's photo, streamed after the household check (architecture §3.6, NFR-02), and changing it.
import { backend } from '#lib/server/backend.js';
import { readDogForm } from '#lib/server/dog-form.js';
import { toResponse, unauthenticated } from '#lib/server/respond.js';

export async function GET({ locals, params, request, url }) {
	if (!locals.viewer) return unauthenticated();
	return toResponse(
		await backend().http.dogs.photo(locals.viewer, {
			id: params.id,
			size: url.searchParams.get('size'),
			ifNoneMatch: request.headers.get('if-none-match')
		})
	);
}

export async function PUT({ locals, params, request }) {
	if (!locals.viewer) return unauthenticated();
	return toResponse(
		await backend().http.dogs.changePhoto(locals.viewer, {
			id: params.id,
			ifMatch: request.headers.get('if-match'),
			form: await readDogForm(request)
		})
	);
}
