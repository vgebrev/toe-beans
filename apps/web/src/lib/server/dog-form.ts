// Reads a dog's multipart form (architecture §3.6) into the backend's framework-neutral shape.
import type { DogForm } from '@toe-beans/backend';

/** Null when the body isn't a form. A missing or empty part is null, for the backend to explain. */
export async function readDogForm(request: Request): Promise<DogForm> {
	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		return null;
	}
	const dog = form.get('dog');
	const photo = form.get('photo');
	return {
		dog: typeof dog === 'string' ? dog : null,
		photo:
			photo instanceof File && photo.size > 0 ? new Uint8Array(await photo.arrayBuffer()) : null
	};
}
