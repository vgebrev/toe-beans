// The domain can't import the contracts (architecture §4.2), so the lists and limits both hold are
// checked here. The DTOs' `satisfies` catches a value only the domain has; these catch the rest,
// such as a form offering a choice, or allowing a length, that the backend then refuses.
import {
	CareCategory,
	CareLead,
	EmotionalState,
	Environment,
	EventCategory,
	historyTypes,
	limits,
	Outcome,
	SkillArea,
	TrainingLead,
	type DatePrecision,
	type Role
} from '@toe-beans/contracts';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { HISTORY_TYPES } from '../application/history/history.js';
import {
	EVENT_CATEGORIES,
	EVENT_NOTES_MAX,
	RESPONSE_MAX,
	TRIGGER_MAX
} from '../domain/behaviour-event.js';
import { CARE_CATEGORIES, CARE_NOTES_MAX, CARE_TITLE_MAX } from '../domain/care-task.js';
import { CUE_LABEL_MAX, CUE_NOTES_MAX, CUE_TEXT_MAX } from '../domain/cue.js';
import {
	DOG_NAME_MAX,
	DOG_NOTES_MAX,
	type DatePrecision as DomainPrecision
} from '../domain/dog.js';
import { SKILL_AREAS } from '../domain/exercise.js';
import { HOUSEHOLD_NAME_MAX, type Role as DomainRole } from '../domain/household.js';
import { TIMES_MAX } from '../domain/planner.js';
import { CARE_LEADS, TRAINING_LEADS } from '../domain/reminders.js';
import {
	DURATION_MAX_MIN,
	EMOTIONAL_STATES,
	ENVIRONMENT_NOTE_MAX,
	ENVIRONMENTS,
	LOG_NOTES_MAX,
	OUTCOMES
} from '../domain/session-log.js';
import { DISPLAY_NAME_MAX } from '../domain/user.js';

describe('contracts and the domain', () => {
	it('share the form limits', () => {
		expect(limits).toEqual({
			dogName: DOG_NAME_MAX,
			dogNotes: DOG_NOTES_MAX,
			cueLabel: CUE_LABEL_MAX,
			cueText: CUE_TEXT_MAX,
			cueNotes: CUE_NOTES_MAX,
			careTitle: CARE_TITLE_MAX,
			careNotes: CARE_NOTES_MAX,
			eventTrigger: TRIGGER_MAX,
			eventResponse: RESPONSE_MAX,
			eventNotes: EVENT_NOTES_MAX,
			logEnvironmentNote: ENVIRONMENT_NOTE_MAX,
			logNotes: LOG_NOTES_MAX,
			logDurationMin: DURATION_MAX_MIN,
			sessionTimes: TIMES_MAX,
			householdName: HOUSEHOLD_NAME_MAX,
			displayName: DISPLAY_NAME_MAX
		});
	});

	it('list the same choices, in the same order', () => {
		expect(Outcome.options).toEqual(OUTCOMES);
		expect(EmotionalState.options).toEqual(EMOTIONAL_STATES);
		expect(Environment.options).toEqual(ENVIRONMENTS);
		expect(EventCategory.options).toEqual(EVENT_CATEGORIES);
		expect(CareCategory.options).toEqual(CARE_CATEGORIES);
		expect(SkillArea.options).toEqual(SKILL_AREAS);
		expect(TrainingLead.options.map((o) => o.value)).toEqual(TRAINING_LEADS);
		expect(CareLead.options.map((o) => o.value)).toEqual(CARE_LEADS);
		expect(historyTypes).toEqual(HISTORY_TYPES);
	});

	it('agree on the choices the domain has only as types', () => {
		expectTypeOf<DatePrecision>().toEqualTypeOf<DomainPrecision>();
		expectTypeOf<Role>().toEqualTypeOf<DomainRole>();
	});
});
