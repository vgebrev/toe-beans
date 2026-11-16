// Changing a care task (ui.md J6). Another household's, or one that's gone, is a 404 page.
import { CareTask } from '@toe-beans/contracts';
import { found } from '#lib/api-client/found.js';
import { createApiClient } from '#lib/api-client/index.js';

export async function load({ fetch, params }) {
	const task = await createApiClient(fetch).get(`/care-tasks/${params.id}`, CareTask);
	return { task: found(task) };
}
