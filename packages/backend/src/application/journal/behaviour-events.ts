// The behaviour journal (architecture §5.2, D28, FR-08, scenario 6). Any member records something
// notable that happened with one of the household's dogs, without a training session: what
// happened and when, with the trigger, how the puppy responded and notes if they like. Editing
// carries the version it was based on (NFR-13), and can move the event to another dog when it was
// recorded against the wrong one. Deleting is a soft delete that can be undone until the purge
// (§5.3, FR-09).
import {
	cleanEventDetails,
	type BehaviourEvent,
	type EventDetailsInput
} from '../../domain/behaviour-event.js';
import { isId } from '../../domain/id.js';
import { err, ok, type Result } from '../../domain/result.js';
import type { MemberContext } from '../auth/auth.js';
import { CHOOSE_DOG, currentDog } from '../dogs/current-dog.js';
import {
	notFound,
	staleVersion,
	validationError,
	type NotFoundError,
	type StaleVersionError,
	type ValidationError
} from '../errors.js';
import { namesOf } from '../names.js';
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
	const chooseDog = { dogId: [CHOOSE_DOG] };

	/** One lookup for every name the events need. */
	async function views(entries: readonly BehaviourEvent[]): Promise<EventView[]> {
		const name = await namesOf(
			users,
			entries.flatMap((e) => [e.recordedBy, e.updatedBy])
		);
		return entries.map((event) => ({
			event,
			recordedByName: name(event.recordedBy),
			updatedByName: name(event.updatedBy)
		}));
	}
	const view = async (event: BehaviourEvent) => (await views([event]))[0]!;

	const find = async (ctx: MemberContext, id: string) =>
		isId(id) ? events.findById(ctx.householdId, id) : null;

	return {
		/** Events with their names, in one lookup (History, architecture §5.1). */
		views,

		async get(ctx: MemberContext, id: string): Promise<Result<EventView, NotFoundError>> {
			const event = await find(ctx, id);
			return event ? ok(await view(event)) : err(notFound('event'));
		},

		/** Records an event. It happened now unless `occurredAt` says otherwise. */
		async create(
			ctx: MemberContext,
			input: EventRequest
		): Promise<Result<EventView, ValidationError>> {
			const now = clock.now();
			const details = cleanEventDetails(input, { occurredAt: now }, now);
			const dogId = (await currentDog(dogs, ctx.householdId, input.dogId))?.id;
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
			ctx: MemberContext,
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
					: (await currentDog(dogs, ctx.householdId, wanted))?.id;
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
		},

		/** Soft-deletes the event (§5.3). The result carries the version `restore` needs. */
		async remove(
			ctx: MemberContext,
			input: { id: string; expectedVersion: number }
		): Promise<Result<BehaviourEvent, NotFoundError | StaleVersionError>> {
			if (!isId(input.id)) return err(notFound('event'));
			const removed = await events.softDelete(
				ctx.householdId,
				input.id,
				input.expectedVersion,
				ctx.userId
			);
			if (removed.ok)
				log.info('event deleted', { householdId: ctx.householdId, eventId: input.id });
			return removed;
		},

		/** Brings a deleted event back: the snackbar's *Undo* (ui.md J8). */
		async restore(
			ctx: MemberContext,
			input: { id: string; expectedVersion: number }
		): Promise<Result<EventView, NotFoundError | StaleVersionError>> {
			if (!isId(input.id)) return err(notFound('event'));
			const restored = await events.restore(
				ctx.householdId,
				input.id,
				input.expectedVersion,
				ctx.userId
			);
			if (!restored.ok) return restored;
			log.info('event restored', { householdId: ctx.householdId, eventId: input.id });
			return ok(await view(restored.value));
		}
	};
}
