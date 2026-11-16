// /api/v1/behaviour-events (architecture §5.2, D28, FR-08). Someone with no household gets a 404,
// as if they'd asked for another household's event (§4.4).
import {
	CreateBehaviourEvent,
	UpdateBehaviourEvent,
	type BehaviourEvent as BehaviourEventDto
} from '@toe-beans/contracts';
import type { PlannerContext, Viewer } from '../application/auth/auth.js';
import type { BehaviourEvents, EventView } from '../application/journal/behaviour-events.js';
import { zonedDateTime } from '../domain/calendar.js';
import { etag, versionFromIfMatch } from './etag.js';
import { errorResponse, json, noContent, respond, type HttpResponse } from './response.js';
import { isMember, noHousehold } from './member.js';
import { parseInput } from './validation.js';

export interface BehaviourEventsHttp {
	get(viewer: Viewer, input: { id: string }): Promise<HttpResponse>;
	create(viewer: Viewer, input: { body: unknown }): Promise<HttpResponse>;
	update(
		viewer: Viewer,
		input: { id: string; ifMatch: string | null; body: unknown }
	): Promise<HttpResponse>;
	/** Soft delete (§5.3): 204 with the deleted version's ETag, for *Undo*. */
	remove(viewer: Viewer, input: { id: string; ifMatch: string | null }): Promise<HttpResponse>;
	/** *Undo*, with If-Match from the delete. */
	restore(viewer: Viewer, input: { id: string; ifMatch: string | null }): Promise<HttpResponse>;
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
		},

		async remove(viewer, { id, ifMatch }) {
			if (!isMember(viewer)) return noHousehold();
			const version = versionFromIfMatch(ifMatch);
			if (!version.ok) return errorResponse(version.error);
			const removed = await events.remove(viewer.member, { id, expectedVersion: version.value });
			return respond(removed, (deleted) => noContent({ etag: etag(deleted.version) }));
		},

		async restore(viewer, { id, ifMatch }) {
			if (!isMember(viewer)) return noHousehold();
			const version = versionFromIfMatch(ifMatch);
			if (!version.ok) return errorResponse(version.error);
			const restored = await events.restore(viewer.member, { id, expectedVersion: version.value });
			return respond(restored, eventResponse(viewer.member, 200));
		}
	};
}
