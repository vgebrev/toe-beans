// The household's dogs (architecture §5.2). Adding one is a multipart form with its photo (§3.6).
import { backend } from '#lib/server/backend.js';
import { readDogForm } from '#lib/server/dog-form.js';
import { toResponse, unauthenticated } from '#lib/server/respond.js';

export async function GET({ locals }) {
	if (!locals.viewer) return unauthenticated();
	return toResponse(await backend().http.dogs.list(locals.viewer));
}

export async function POST({ locals, request }) {
	if (!locals.viewer) return unauthenticated();
	return toResponse(
		await backend().http.dogs.create(locals.viewer, { form: await readDogForm(request) })
	);
}
