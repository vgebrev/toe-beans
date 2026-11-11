// /api/v1/planned-sessions and /api/v1/training-plans (architecture §5.2, D24, FR-05). Someone
// with no household gets a 404, as if they'd asked for another household's session (§4.4).
import {
	EndTrainingPlan,
	ScheduleSession,
	UpdatePlannedSession,
	UpdateTrainingPlan,
	type PlannedSession as SessionDto,
	type PlannedSessions as SessionsDto
} from '@toe-beans/contracts';
import type { MemberViewer, Viewer } from '../application/auth/auth.js';
import { notFound } from '../application/errors.js';
import type { Planner, PlannerContext, SessionView } from '../application/planner/planner.js';
import { zonedDateTime } from '../domain/calendar.js';
import { etag, versionFromIfMatch } from './etag.js';
import { errorResponse, json, noContent, respond, type HttpResponse } from './response.js';
import { parseInput } from './validation.js';

export interface PlannerHttp {
	list(viewer: Viewer, input: { from: string | null; to: string | null }): Promise<HttpResponse>;
	get(viewer: Viewer, input: { id: string }): Promise<HttpResponse>;
	create(viewer: Viewer, input: { body: unknown }): Promise<HttpResponse>;
	update(
		viewer: Viewer,
		input: { id: string; ifMatch: string | null; body: unknown }
	): Promise<HttpResponse>;
	/** *This and following*: `id` is the series. */
	updateSeries(
		viewer: Viewer,
		input: { id: string; ifMatch: string | null; body: unknown }
	): Promise<HttpResponse>;
	endSeries(
		viewer: Viewer,
		input: { id: string; ifMatch: string | null; body: unknown }
	): Promise<HttpResponse>;
}

export const sessionDto = (
	{ session, plan, exercise, updatedByName }: SessionView,
	timeZone: string
): SessionDto => {
	const { date, time } = zonedDateTime(session.scheduledAt, timeZone);
	return {
		id: session.id,
		dogId: session.dogId,
		exercise: {
			id: session.exerciseId,
			title: exercise?.title ?? session.exerciseId,
			...(exercise && { minutes: exercise.suggestedDurationMin })
		},
		scheduledAt: session.scheduledAt.toISOString(),
		date,
		time,
		status: session.status,
		...(plan && {
			plan: {
				id: plan.id,
				exerciseId: plan.exerciseId,
				startDate: plan.startDate,
				time: plan.time,
				days: plan.days,
				...(plan.until && { until: plan.until }),
				etag: etag(plan.version)
			}
		}),
		updatedAt: session.updatedAt.toISOString(),
		updatedBy: updatedByName,
		etag: etag(session.version)
	};
};

const isMember = (viewer: Viewer): viewer is MemberViewer => viewer.member !== null;
const noHousehold = () => errorResponse(notFound('household'));

export function createPlannerHttp(planner: Planner): PlannerHttp {
	const sessionResponse = (ctx: PlannerContext, status: number) => (view: SessionView) =>
		json(sessionDto(view, ctx.timeZone), status, { etag: etag(view.session.version) });

	return {
		async list(viewer, { from, to }) {
			if (!isMember(viewer)) return noHousehold();
			const ctx = viewer.member;
			const found = await planner.list(ctx, { from: from ?? '', to: to ?? '' });
			return respond(found, (views) =>
				json({ sessions: views.map((v) => sessionDto(v, ctx.timeZone)) } satisfies SessionsDto)
			);
		},

		async get(viewer, { id }) {
			if (!isMember(viewer)) return noHousehold();
			return respond(await planner.get(viewer.member, id), sessionResponse(viewer.member, 200));
		},

		async create(viewer, { body }) {
			if (!isMember(viewer)) return noHousehold();
			const input = parseInput(ScheduleSession, body);
			if (!input.ok) return errorResponse(input.error);
			const created = await planner.schedule(viewer.member, input.value);
			return respond(created, sessionResponse(viewer.member, 201));
		},

		async update(viewer, { id, ifMatch, body }) {
			if (!isMember(viewer)) return noHousehold();
			const input = parseInput(UpdatePlannedSession, body);
			if (!input.ok) return errorResponse(input.error);
			const version = versionFromIfMatch(ifMatch);
			if (!version.ok) return errorResponse(version.error);
			const updated = await planner.update(viewer.member, {
				id,
				expectedVersion: version.value,
				changes: input.value
			});
			return respond(updated, sessionResponse(viewer.member, 200));
		},

		async updateSeries(viewer, { id, ifMatch, body }) {
			if (!isMember(viewer)) return noHousehold();
			const input = parseInput(UpdateTrainingPlan, body);
			if (!input.ok) return errorResponse(input.error);
			const version = versionFromIfMatch(ifMatch);
			if (!version.ok) return errorResponse(version.error);
			const { fromSessionId, ...changes } = input.value;
			const first = await planner.updateSeries(viewer.member, {
				planId: id,
				expectedVersion: version.value,
				fromSessionId,
				changes
			});
			return respond(first, sessionResponse(viewer.member, 200));
		},

		async endSeries(viewer, { id, ifMatch, body }) {
			if (!isMember(viewer)) return noHousehold();
			const input = parseInput(EndTrainingPlan, body);
			if (!input.ok) return errorResponse(input.error);
			const version = versionFromIfMatch(ifMatch);
			if (!version.ok) return errorResponse(version.error);
			const ended = await planner.endSeries(viewer.member, {
				planId: id,
				expectedVersion: version.value,
				fromSessionId: input.value.fromSessionId
			});
			return respond(ended, () => noContent());
		}
	};
}
