// GET /api/v1/household/export (FR-16, architecture D46): the household's ZIP, for an owner.
// Limited per person, as each one reads the whole household and streams its photos; caregivers
// are refused before they use any of it.
import type { Viewer } from '../application/auth/auth.js';
import { forbidden, rateLimited } from '../application/errors.js';
import type { createHouseholdExport } from '../application/household/export.js';
import type { Logger, RateLimiter } from '../application/ports/index.js';
import { isMember, noHousehold } from './member.js';
import { errorResponse, type HttpResponse } from './response.js';

export interface HouseholdExportHttp {
	download(viewer: Viewer): Promise<HttpResponse>;
}

export function createHouseholdExportHttp(
	exporter: ReturnType<typeof createHouseholdExport>,
	{ rateLimit, logger }: { rateLimit: RateLimiter; logger: Logger }
): HouseholdExportHttp {
	const log = logger.child({ component: 'export' });
	return {
		async download(viewer) {
			if (!isMember(viewer)) return noHousehold();
			if (viewer.member.role !== 'owner') return errorResponse(forbidden);
			const decision = rateLimit.take(viewer.auth.userId);
			if (!decision.allowed) {
				log.warn('export rate limited', {
					userId: viewer.auth.userId,
					retryAfterSeconds: decision.retryAfterSeconds
				});
				const limited = errorResponse(rateLimited);
				return {
					...limited,
					headers: { ...limited.headers, 'retry-after': String(decision.retryAfterSeconds) }
				};
			}
			const made = await exporter.export(viewer.member);
			if (!made.ok) return errorResponse(made.error);
			return {
				status: 200,
				headers: {
					'content-type': 'application/zip',
					'content-disposition': `attachment; filename="${made.value.filename}"`,
					'cache-control': 'no-store',
					'x-content-type-options': 'nosniff'
				},
				stream: made.value.stream
			};
		}
	};
}
