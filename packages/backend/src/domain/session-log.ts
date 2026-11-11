// The quick training log (architecture §5.2, FR-07): a session someone practised with one dog,
// planned or not. Completion is the log's existence; the outcome is a separate field, defaulting
// to not assessed, so logging never asks anyone to claim success.
import { validationError, type ValidationError } from './errors.js';
import type { Id } from './id.js';
import { cleanText } from './name.js';
import { err, ok, type Result } from './result.js';

export const OUTCOMES = ['successful', 'partial', 'not_yet', 'not_assessed'] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const EMOTIONAL_STATES = ['relaxed', 'uncertain', 'stressed'] as const;
export type EmotionalState = (typeof EMOTIONAL_STATES)[number];

export const ENVIRONMENTS = ['home', 'garden', 'public', 'other'] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

/** What a person can say about a practice. Everything but the outcome is optional. */
export interface LogDetails {
	practisedAt: Date;
	outcome: Outcome;
	durationMin?: number;
	emotionalState?: EmotionalState;
	environment?: Environment;
	/** Where exactly, like "the park by the river". Only with an environment. */
	environmentNote?: string;
	notes?: string;
}

export interface SessionLog extends LogDetails {
	id: Id;
	householdId: Id;
	dogId: Id;
	exerciseId: string;
	/** The exercise's content version when it was logged (§5.2 Exercise). */
	exerciseContentVersion: number;
	/** Set when it completes a planned session; that session is then `completed`. */
	plannedSessionId?: Id;
	/** Who practised: whoever logged it. */
	caregiverId: Id;
	/** Who changed it last, for "Alex changed this a moment ago" (ui.md §5.2). */
	updatedBy: Id;
	/** Soft delete (§5.3), from S10. */
	deletedAt?: Date;
	version: number;
	createdAt: Date;
	updatedAt: Date;
}

/** Long enough for a walk; the stepper stops here. */
export const DURATION_MAX_MIN = 240;
export const ENVIRONMENT_NOTE_MAX = 100;
export const LOG_NOTES_MAX = 2000;
/** A phone's clock can run a little ahead of the server's. */
export const FUTURE_SLACK_MS = 5 * 60_000;
/** How far back a practice can be logged or moved to. */
export const LOG_BACK_DAYS = 366;

const isOneOf = <T extends string>(list: readonly T[], value: unknown): value is T =>
	list.includes(value as T);

/** What a person sends. In an update, a missing field stays as it was and null clears it. */
export interface LogDetailsInput {
	practisedAt?: string | undefined;
	outcome?: string | undefined;
	durationMin?: number | null | undefined;
	emotionalState?: string | null | undefined;
	environment?: string | null | undefined;
	environmentNote?: string | null | undefined;
	notes?: string | null | undefined;
}

/**
 * Applies `input` over `base` (a new log's defaults, or the log being edited) and checks the
 * result: when it was practised (not ahead of `now`, not more than a year back), the outcome and
 * the optional context. Field errors are keyed by the input's names.
 */
export function cleanLogDetails(
	input: LogDetailsInput,
	base: LogDetails,
	now: Date
): Result<LogDetails, ValidationError> {
	const fields: Record<string, string[]> = {};
	const next: LogDetails = { ...base };
	const clear = (key: keyof LogDetails) => delete next[key];

	if (input.practisedAt !== undefined) {
		const at = new Date(input.practisedAt);
		if (Number.isNaN(at.getTime())) fields.practisedAt = ['Choose when you practised.'];
		else if (at.getTime() > now.getTime() + FUTURE_SLACK_MS) {
			fields.practisedAt = ["Choose a time that's already happened."];
		} else if (at.getTime() < now.getTime() - LOG_BACK_DAYS * 86_400_000) {
			fields.practisedAt = ['Choose a time within the last year.'];
		} else next.practisedAt = at;
	}

	if (input.outcome !== undefined) {
		if (isOneOf(OUTCOMES, input.outcome)) next.outcome = input.outcome;
		else fields.outcome = ['Choose how it went, or Not assessed.'];
	}

	if (input.durationMin === null) clear('durationMin');
	else if (input.durationMin !== undefined) {
		const d = input.durationMin;
		if (Number.isInteger(d) && d >= 1 && d <= DURATION_MAX_MIN) next.durationMin = d;
		else fields.durationMin = [`Give the minutes, from 1 to ${DURATION_MAX_MIN}.`];
	}

	if (input.emotionalState === null) clear('emotionalState');
	else if (input.emotionalState !== undefined) {
		if (isOneOf(EMOTIONAL_STATES, input.emotionalState)) {
			next.emotionalState = input.emotionalState;
		} else fields.emotionalState = ['Choose one of the moods.'];
	}

	if (input.environment === null) {
		clear('environment');
		clear('environmentNote');
	} else if (input.environment !== undefined) {
		if (isOneOf(ENVIRONMENTS, input.environment)) next.environment = input.environment;
		else fields.environment = ['Choose one of the places.'];
	}

	const text = (key: 'environmentNote' | 'notes', max: number) => {
		const given = input[key];
		if (given === null) return clear(key);
		if (given === undefined) return;
		const cleaned = cleanText(given, max);
		if (cleaned === null) fields[key] = [`Keep this to ${max} characters of text.`];
		else if (cleaned === undefined) clear(key);
		else next[key] = cleaned;
	};
	text('environmentNote', ENVIRONMENT_NOTE_MAX);
	text('notes', LOG_NOTES_MAX);
	if (next.environmentNote && !next.environment && !fields.environment) {
		fields.environmentNote = ['Choose a place first.'];
	}

	if (Object.keys(fields).length > 0) return err(validationError('The log is not valid.', fields));
	return ok(next);
}
