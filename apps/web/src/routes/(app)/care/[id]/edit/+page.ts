// Changing a care task (ui.md J6). Another household's, or one that's gone, is a 404 page.
import { error } from '@sveltejs/kit';
import { CareTask } from '@toe-beans/contracts';
import { createApiClient, problemStatus } from '#lib/api-client/index.js';

export async function load({ fetch, params }) {
	const task = await createApiClient(fetch).get(`/care-tasks/${params.id}`, CareTask);
	if (!task.ok && problemStatus(task.error) === 404) {
		error(404, 'Not found');
	}
	return { task: task.ok ? task.data : null };
}
