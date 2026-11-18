import { describe, expect, it, vi } from 'vitest';
import type { TickReport } from '../application/ports/tick.js';
import { withHeartbeat } from './heartbeat.js';

const report: TickReport = { extended: 0, claimed: 1, sent: 1, retrying: 0, skipped: 0, failed: 0 };

describe('withHeartbeat', () => {
	it('beats after a tick and passes its report on', async () => {
		const beat = vi.fn(async () => undefined);
		const worker = withHeartbeat({ tick: async () => report }, { beat });
		expect(await worker.tick()).toEqual(report);
		expect(beat).toHaveBeenCalledOnce();
	});

	it("doesn't beat when the tick throws", async () => {
		const beat = vi.fn(async () => undefined);
		const worker = withHeartbeat(
			{
				tick: async () => {
					throw new Error('database gone');
				}
			},
			{ beat }
		);
		await expect(worker.tick()).rejects.toThrow('database gone');
		expect(beat).not.toHaveBeenCalled();
	});
});
