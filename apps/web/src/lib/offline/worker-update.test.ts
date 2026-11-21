import { describe, expect, it, vi } from 'vitest';
import { updateWorker } from './worker-update.js';

const container = (registration: unknown) =>
	({ getRegistration: vi.fn(async () => registration) }) as unknown as ServiceWorkerContainer;

describe('updateWorker', () => {
	it('asks the registration to update', async () => {
		const update = vi.fn(async () => undefined);
		await updateWorker(container({ update }));
		expect(update).toHaveBeenCalledOnce();
	});

	it('does nothing without a registration or a service worker', async () => {
		await expect(updateWorker(container(undefined))).resolves.toBeUndefined();
		await expect(updateWorker(undefined)).resolves.toBeUndefined();
	});

	it('swallows a failed update', async () => {
		const update = vi.fn(async () => {
			throw new TypeError('Failed to update');
		});
		await expect(updateWorker(container({ update }))).resolves.toBeUndefined();
	});
});
