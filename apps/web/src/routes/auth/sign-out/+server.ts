// Ends the session, then signs out at the identity provider too, so the next sign-in can choose
// another account (architecture §3.4). POST only, so another site can't sign anyone out. With
// `scope=everywhere` it ends all of the person's sessions and stops their reminders (D33);
// otherwise `endpoint`, this browser's push subscription, is the device forgotten (D43).
import { backend } from '#lib/server/backend.js';
import { toResponse } from '#lib/server/respond.js';

export async function POST({ cookies, request }) {
	const form = await request.formData().catch(() => null);
	const endpoint = form?.get('endpoint');
	return toResponse(
		await backend().http.auth.signOut({
			cookie: (name) => cookies.get(name),
			everywhere: form?.get('scope') === 'everywhere',
			endpoint: typeof endpoint === 'string' ? endpoint : undefined
		})
	);
}
