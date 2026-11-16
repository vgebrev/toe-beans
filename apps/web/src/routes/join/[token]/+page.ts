// What this invitation is, for whoever is looking (ui.md J2). A page of its own rather than an
// error: every outcome here needs a plain-language explanation.
import { InvitationPreview } from '@toe-beans/contracts';
import { createApiClient, problemStatus } from '#lib/api-client/index.js';

export async function load({ fetch, params }) {
	const result = await createApiClient(fetch).get(
		`/invitations/${params.token}`,
		InvitationPreview
	);
	if (result.ok) return { preview: result.data, failure: null };
	const status = problemStatus(result.error);
	const failure = status === 404 ? 'unknown' : status === 429 ? 'too-many' : 'unreachable';
	return { preview: null, failure } as const;
}
