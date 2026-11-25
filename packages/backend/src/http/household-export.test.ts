import { describe, expect, it, vi } from 'vitest';
import type { createHouseholdExport } from '../application/household/export.js';
import type { RateLimiter } from '../application/ports/index.js';
import { ok } from '../domain/result.js';
import { silentLogger } from '../testing/logger.js';
import { memberViewer, noHousehold } from '../testing/viewers.js';
import { createHouseholdExportHttp } from './household-export.js';

const allowAll: RateLimiter = { take: () => ({ allowed: true }) };
const owner = (() => {
	const viewer = memberViewer('h1');
	return { ...viewer, member: { ...viewer.member, role: 'owner' as const } };
})();

function setup(rateLimit: RateLimiter = allowAll) {
	const stream = new ReadableStream<Uint8Array>();
	const exporter = {
		export: vi.fn(async () => ok({ filename: 'toe-beans-export-2026-11-25.zip', stream }))
	} as unknown as ReturnType<typeof createHouseholdExport>;
	return {
		stream,
		exporter,
		http: createHouseholdExportHttp(exporter, { rateLimit, logger: silentLogger })
	};
}

describe('the export route (D46)', () => {
	it('streams the ZIP as a download that nothing caches', async () => {
		const { http, stream } = setup();
		expect(await http.download(owner)).toEqual({
			status: 200,
			headers: {
				'content-type': 'application/zip',
				'content-disposition': 'attachment; filename="toe-beans-export-2026-11-25.zip"',
				'cache-control': 'no-store',
				'x-content-type-options': 'nosniff'
			},
			stream
		});
	});

	it('is a 404 without a household', async () => {
		const { http, exporter } = setup();
		expect(await http.download(noHousehold)).toMatchObject({ status: 404 });
		expect(exporter.export).not.toHaveBeenCalled();
	});

	it('refuses a caregiver before using any of the limit', async () => {
		const take = vi.fn<RateLimiter['take']>(() => ({ allowed: true }));
		const { http, exporter } = setup({ take });
		expect(await http.download(memberViewer('h1'))).toMatchObject({ status: 403 });
		expect(take).not.toHaveBeenCalled();
		expect(exporter.export).not.toHaveBeenCalled();
	});

	it('limits each person, saying when to try again', async () => {
		const take = vi.fn<RateLimiter['take']>(() => ({ allowed: false, retryAfterSeconds: 600 }));
		const { http, exporter } = setup({ take });
		expect(await http.download(owner)).toMatchObject({
			status: 429,
			headers: { 'retry-after': '600' }
		});
		expect(take).toHaveBeenCalledWith(owner.auth.userId);
		expect(exporter.export).not.toHaveBeenCalled();
	});
});
