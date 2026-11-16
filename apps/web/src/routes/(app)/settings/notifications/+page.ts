// The Notifications screen's server state (ui.md J7): the person's devices, preference and
// latest test. What this browser can do is only known in it, so the page works that out itself.
import { ReminderSettings } from '@toe-beans/contracts';
import { createApiClient } from '#lib/api-client/index.js';

export async function load({ fetch, url }) {
	const settings = await createApiClient(fetch).get('/reminders', ReminderSettings);
	return {
		settings: settings.ok ? settings.data : null,
		/** Opened from the test reminder's tap. */
		testArrived: url.searchParams.get('test') === 'arrived'
	};
}
