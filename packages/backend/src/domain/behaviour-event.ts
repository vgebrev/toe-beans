// The behaviour journal (architecture §5.2, FR-08): something notable that happened with one dog,
// such as barking at the gate or a toileting accident, recorded without a training session.
// Only what happened and the dog are required; the trigger, the response and notes are optional.
import { validationError, type ValidationError } from './errors.js';
import type { Id } from './id.js';
import { patchText } from './name.js';
import { err, ok, type Result } from './result.js';
import { pastProblem } from './session-log.js';

export const EVENT_CATEGORIES = [
	'barking',
	'cat_interaction',
	'fear',
	'toileting_accident',
	'visitor',
	'other'
] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

/** What a person says about an event, apart from the dog. */
export interface EventDetails {
	category: EventCategory;
	occurredAt: Date;
	trigger?: string;
	/** How the puppy responded. */
	response?: string;
	notes?: string;
}

export interface BehaviourEvent extends EventDetails {
	id: Id;
	householdId: Id;
	dogId: Id;
	/** Who recorded it. */
	recordedBy: Id;
	/** Who changed it last, for "Alex changed this a moment ago" (ui.md §5.2). */
	updatedBy: Id;
	/** Soft delete (§5.3), from S10. */
	deletedAt?: Date;
	version: number;
	createdAt: Date;
	updatedAt: Date;
}

export const TRIGGER_MAX = 200;
export const RESPONSE_MAX = 1000;
export const EVENT_NOTES_MAX = 2000;

const isCategory = (value: unknown): value is EventCategory =>
	EVENT_CATEGORIES.includes(value as EventCategory);

/** What a person sends. In an update, a missing field stays as it was and null clears it. */
export interface EventDetailsInput {
	category?: string | undefined;
	occurredAt?: string | undefined;
	trigger?: string | null | undefined;
	response?: string | null | undefined;
	notes?: string | null | undefined;
}

/**
 * Applies `input` over `base` (a new event's defaults, or the event being edited) and checks the
 * result: a category, when it happened (as for a log: not ahead of `now`, not more than a year
 * back) and the optional text. A new event has no category until one is given. Field errors are
 * keyed by the input's names.
 */
export function cleanEventDetails(
	input: EventDetailsInput,
	base: Omit<EventDetails, 'category'> & { category?: EventCategory },
	now: Date
): Result<EventDetails, ValidationError> {
	const fields: Record<string, string[]> = {};
	const next = { ...base };

	if (input.category !== undefined) {
		if (isCategory(input.category)) next.category = input.category;
		else fields.category = ['Choose what happened.'];
	} else if (!next.category) fields.category = ['Choose what happened.'];

	if (input.occurredAt !== undefined) {
		const at = new Date(input.occurredAt);
		const problem = Number.isNaN(at.getTime()) ? 'Choose when it happened.' : pastProblem(at, now);
		if (problem) fields.occurredAt = [problem];
		else next.occurredAt = at;
	}

	patchText(next, fields, 'trigger', input.trigger, TRIGGER_MAX);
	patchText(next, fields, 'response', input.response, RESPONSE_MAX);
	patchText(next, fields, 'notes', input.notes, EVENT_NOTES_MAX);

	if (Object.keys(fields).length > 0 || !next.category) {
		return err(validationError('The event is not valid.', fields));
	}
	return ok(next as EventDetails);
}
