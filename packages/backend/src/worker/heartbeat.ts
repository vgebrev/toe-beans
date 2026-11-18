// Beats a Heartbeat after each tick that ran to the end (backlog S14.4). A tick that throws (the
// database gone, say) doesn't beat, so the monitor's silence alert covers it too.
import type { Heartbeat, ReminderTick } from '../application/ports/tick.js';

export function withHeartbeat(worker: ReminderTick, heartbeat: Heartbeat): ReminderTick {
	return {
		async tick() {
			const report = await worker.tick();
			await heartbeat.beat();
			return report;
		}
	};
}
