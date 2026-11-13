// The behaviour journal (architecture §5.2, D28, FR-08, scenario 6). Any member records something
// notable that happened with one of the household's dogs, without a training session: what
// happened and when, with the trigger, how the puppy responded and notes if they like. Editing
// carries the version it was based on (NFR-13), and can move the event to another dog when it was
// recorded against the wrong one.
import {
	cleanEventDetails,
	type BehaviourEvent,
	type EventDetailsInput
} from '../../domain/behaviour-event.js';
import { isId, type Id } from '../../domain/id.js';
import { err, ok, type Result } from '../../domain/result.js';
import { FORMER_MEMBER } from '../cues/cues.js';
import {
	notFound,
	staleVersion,
	validationError,
	type NotFoundError,
	type StaleVersionError,
	type ValidationError
} from '../errors.js';
import type { PlannerContext } from '../planner/planner.js';
import type { Ports } from '../ports/index.js';

/** An event with the names of who recorded it and who changed it last. */
export interface EventView {
	event: BehaviourEvent;
	recordedByName: string;
	updatedByName: string;
}

/** The dog and the details; the dog and category are required for a new event. */
export interface EventRequest extends EventDetailsInput {
	dogId?: string | undefined;
}

export type BehaviourEvents = ReturnType<typeof createBehaviourEvents>;

export function createBehaviourEvents({
	behaviourEvents: events,
	dogs,
	users,
	clock,
	ids,
	logger
}: Pick<Ports, 'behaviourEvents' | 'dogs' | 'users' | 'clock' | 'ids' | 'logger'>) {
	const log = logger.child({ component: 'behaviour-events' });
	const chooseDog = { dogId: ['Choose one of your dogs.'] };

	async function view(event: BehaviourEvent): Promise<EventView> {
		const people = await users.findByIds([...new Set([event.recordedBy, event.updatedBy])]);
		const names = new Map(people.map((u) => [u.id, u.displayName]));
		return {
			event,
			recordedByName: names.get(event.recordedBy) ?? FORMER_MEMBER,
			updatedByName: names.get(event.updatedBy) ?? FORMER_MEMBER
		};
	}

	/** One of the household's current dogs, so nothing is recorded against an archived one. */
	async function currentDog(ctx: PlannerContext, dogId: string | undefined): Promise<Id | null> {
		if (dogId === undefined || !isId(dogId)) return null;
		const dog = await dogs.findById(ctx.householdId, dogId);
		return dog && !dog.archivedAt ? dog.id : null;
	}

	const find = async (ctx: PlannerContext, id: string) =>
		isId(id) ? events.findById(ctx.householdId, id) : null;

	return {
		async get(ctx: PlannerContext, id: string): Promise<Result<EventView, NotFoundError>> {
			const event = await find(ctx, id);
			return event ? ok(await view(event)) : err(notFound('event'));
		},

		/** Records an event. It happened now unless `occurredAt` says otherwise. */
		async create(
			ctx: PlannerContext,
			input: EventRequest
		): Promise<Result<EventView, ValidationError>> {
			const now = clock.now();
			const details = cleanEventDetails(input, { occurredAt: now }, now);
			const dogId = await currentDog(ctx, input.dogId);
			if (!details.ok || !dogId) {
				const fields = { ...(details.ok ? {} : details.error.fields), ...(!dogId && chooseDog) };
				return err(validationError('The event is not valid.', fields));
			}
			const event = await events.insert({
				id: ids.next(),
				householdId: ctx.householdId,
				dogId,
				recordedBy: ctx.userId,
				updatedBy: ctx.userId,
				...details.value
			});
			log.info('event recorded', {
				householdId: ctx.householdId,
				eventId: event.id,
				category: event.category
			});
			return ok(await view(event));
		},

		/** Changes what happened, when, the text or the dog (to another current dog). */
		async update(
			ctx: PlannerContext,
			input: { id: string; expectedVersion: number; changes: EventRequest }
		): Promise<Result<EventView, ValidationError | NotFoundError | StaleVersionError>> {
			const event = await find(ctx, input.id);
			if (!event) return err(notFound('event'));
			if (event.version !== input.expectedVersion) return err(staleVersion);
			const details = cleanEventDetails(input.changes, event, clock.now());
			const wanted = input.changes.dogId;
			const dogId =
				wanted === undefined || wanted === event.dogId
					? event.dogId
					: await currentDog(ctx, wanted);
			if (!details.ok || !dogId) {
				const fields = { ...(details.ok ? {} : details.error.fields), ...(!dogId && chooseDog) };
				return err(validationError('The event is not valid.', fields));
			}
			const next = details.value;
			const updated = await events.update(ctx.householdId, event.id, input.expectedVersion, {
				...(dogId !== event.dogId && { dogId }),
				category: next.category,
				occurredAt: next.occurredAt,
				trigger: next.trigger,
				response: next.response,
				notes: next.notes,
				updatedBy: ctx.userId
			});
			if (!updated.ok) return updated;
			log.info('event changed', { householdId: ctx.householdId, eventId: event.id });
			return ok(await view(updated.value));
		}
	};
}
