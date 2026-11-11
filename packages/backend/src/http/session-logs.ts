// /api/v1/session-logs (architecture §5.2, D25, FR-07). Someone with no household gets a 404, as
// if they'd asked for another household's log (§4.4).
import {
	CreateSessionLog,
	UpdateSessionLog,
	type SessionLog as SessionLogDto
} from '@toe-beans/contracts';
import type { MemberViewer, Viewer } from '../application/auth/auth.js';
import { notFound } from '../application/errors.js';
import type { PlannerContext } from '../application/planner/planner.js';
import type { LogView, SessionLogs } from '../application/training-log/session-logs.js';
import { zonedDateTime } from '../domain/calendar.js';
import { etag, versionFromIfMatch } from './etag.js';
import { errorResponse, json, respond, type HttpResponse } from './response.js';
import { parseInput } from './validation.js';

export interface SessionLogsHttp {
	get(viewer: Viewer, input: { id: string }): Promise<HttpResponse>;
	create(viewer: Viewer, input: { body: unknown }): Promise<HttpResponse>;
	update(
		viewer: Viewer,
		input: { id: string; ifMatch: string | null; body: unknown }
	): Promise<HttpResponse>;
}

export const sessionLogDto = (
	{ log, exercise, caregiverName, updatedByName }: LogView,
	timeZone: string
): SessionLogDto => {
	const { date, time } = zonedDateTime(log.practisedAt, timeZone);
	return {
		id: log.id,
		dogId: log.dogId,
		exercise: {
			id: log.exerciseId,
			title: exercise?.title ?? log.exerciseId,
			...(exercise && { minutes: exercise.suggestedDurationMin })
		},
		...(log.plannedSessionId && { plannedSessionId: log.plannedSessionId }),
		practisedAt: log.practisedAt.toISOString(),
		date,
		time,
		outcome: log.outcome,
		...(log.durationMin !== undefined && { durationMin: log.durationMin }),
		...(log.emotionalState && { emotionalState: log.emotionalState }),
		...(log.environment && { environment: log.environment }),
		...(log.environmentNote && { environmentNote: log.environmentNote }),
		...(log.notes && { notes: log.notes }),
		caregiver: caregiverName,
		updatedAt: log.updatedAt.toISOString(),
		updatedBy: updatedByName,
		etag: etag(log.version)
	};
};

const isMember = (viewer: Viewer): viewer is MemberViewer => viewer.member !== null;
const noHousehold = () => errorResponse(notFound('household'));

export function createSessionLogsHttp(logs: SessionLogs): SessionLogsHttp {
	const logResponse = (ctx: PlannerContext, status: number) => (view: LogView) =>
		json(sessionLogDto(view, ctx.timeZone), status, { etag: etag(view.log.version) });

	return {
		async get(viewer, { id }) {
			if (!isMember(viewer)) return noHousehold();
			return respond(await logs.get(viewer.member, id), logResponse(viewer.member, 200));
		},

		async create(viewer, { body }) {
			if (!isMember(viewer)) return noHousehold();
			const input = parseInput(CreateSessionLog, body);
			if (!input.ok) return errorResponse(input.error);
			const created = await logs.create(viewer.member, input.value);
			return respond(created, logResponse(viewer.member, 201));
		},

		async update(viewer, { id, ifMatch, body }) {
			if (!isMember(viewer)) return noHousehold();
			const input = parseInput(UpdateSessionLog, body);
			if (!input.ok) return errorResponse(input.error);
			const version = versionFromIfMatch(ifMatch);
			if (!version.ok) return errorResponse(version.error);
			const updated = await logs.update(viewer.member, {
				id,
				expectedVersion: version.value,
				changes: input.value
			});
			return respond(updated, logResponse(viewer.member, 200));
		}
	};
}
