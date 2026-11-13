// /api/v1/behaviour-events (architecture §5.2, D28, FR-08). Someone with no household gets a 404,
// as if they'd asked for another household's event (§4.4).
import {
	CreateBehaviourEvent,
	UpdateBehaviourEvent,
	type BehaviourEvent as BehaviourEventDto
} from '@toe-beans/contracts';
import type { MemberViewer, Viewer } from '../application/auth/auth.js';
import { notFound } from '../application/errors.js';
import type { BehaviourEvents, EventView } from '../application/journal/behaviour-events.js';
import type { PlannerContext } from '../application/planner/planner.js';
import { zonedDateTime } from '../domain/calendar.js';
import { etag, versionFromIfMatch } from './etag.js';
import { errorResponse, json, respond, type HttpResponse } from './response.js';
import { parseInput } from './validation.js';

export interface BehaviourEventsHttp {
	get(viewer: Viewer, input: { id: string }): Promise<HttpResponse>;
	create(viewer: Viewer, input: { body: unknown }): Promise<HttpResponse>;
	update(
		viewer: Viewer,
		input: { id: string; ifMatch: string | null; body: unknown }
	): Promise<HttpResponse>;
}

export const behaviourEventDto = (
	{ event, recordedByName, updatedByName }: EventView,
	timeZone: string
): BehaviourEventDto => {
	const { date, time } = zonedDateTime(event.occurredAt, timeZone);
	return {
		id: event.id,
		dogId: event.dogId,
		category: event.category,
		occurredAt: event.occurredAt.toISOString(),
		date,
		time,
		...(event.trigger && { trigger: event.trigger }),
		...(event.response && { response: event.response }),
		...(event.notes && { notes: event.notes }),
		recordedBy: recordedByName,
		updatedAt: event.updatedAt.toISOString(),
		updatedBy: updatedByName,
		etag: etag(event.version)
	};
};

const isMember = (viewer: Viewer): viewer is MemberViewer => viewer.member !== null;
const noHousehold = () => errorResponse(notFound('household'));

export function createBehaviourEventsHttp(events: BehaviourEvents): BehaviourEventsHttp {
	const eventResponse = (ctx: PlannerContext, status: number) => (view: EventView) =>
		json(behaviourEventDto(view, ctx.timeZone), status, { etag: etag(view.event.version) });

	return {
		async get(viewer, { id }) {
			if (!isMember(viewer)) return noHousehold();
			return respond(await events.get(viewer.member, id), eventResponse(viewer.member, 200));
		},

		async create(viewer, { body }) {
			if (!isMember(viewer)) return noHousehold();
			const input = parseInput(CreateBehaviourEvent, body);
			if (!input.ok) return errorResponse(input.error);
			const created = await events.create(viewer.member, input.value);
			return respond(created, eventResponse(viewer.member, 201));
		},

		async update(viewer, { id, ifMatch, body }) {
			if (!isMember(viewer)) return noHousehold();
			const input = parseInput(UpdateBehaviourEvent, body);
			if (!input.ok) return errorResponse(input.error);
			const version = versionFromIfMatch(ifMatch);
			if (!version.ok) return errorResponse(version.error);
			const updated = await events.update(viewer.member, {
				id,
				expectedVersion: version.value,
				changes: input.value
			});
			return respond(updated, eventResponse(viewer.member, 200));
		}
	};
}
