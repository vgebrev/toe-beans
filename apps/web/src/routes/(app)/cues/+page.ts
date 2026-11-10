// The household's cue dictionary (ui.md §4.6), with each cue's ETag in the list (architecture §3.3).
import { Cues } from '@toe-beans/contracts';
import { createApiClient } from '#lib/api-client/index.js';

export async function load({ fetch }) {
	const cues = await createApiClient(fetch).get('/cues', Cues);
	return { cues: cues.ok ? cues.data.cues : null };
}
