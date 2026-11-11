// /api/v1/today (architecture §5.1, D26, FR-06). Someone with no household gets a 404, like every
// household resource (§4.4).
import type { Today as TodayDto } from '@toe-beans/contracts';
import type { Viewer } from '../application/auth/auth.js';
import { notFound } from '../application/errors.js';
import type { Today } from '../application/today/today.js';
import { sessionDto } from './planner.js';
import { errorResponse, json, respond, type HttpResponse } from './response.js';
import { sessionLogDto } from './session-logs.js';

export interface TodayHttp {
	get(viewer: Viewer): Promise<HttpResponse>;
}

export function createTodayHttp(today: Today): TodayHttp {
	return {
		async get(viewer) {
			if (!viewer.member) return errorResponse(notFound('household'));
			const { timeZone } = viewer.member;
			return respond(await today.read(viewer.member), (view) =>
				json({
					date: view.date,
					overdue: view.overdue.map((v) => sessionDto(v, timeZone)),
					planned: view.planned.map((v) => sessionDto(v, timeZone)),
					done: view.done.map((v) => sessionLogDto(v, timeZone)),
					skipped: view.skipped.map((v) => sessionDto(v, timeZone))
				} satisfies TodayDto)
			);
		}
	};
}
