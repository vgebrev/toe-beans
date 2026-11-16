// The limits a person meets in a form. The backend's domain holds the same numbers and a backend
// test checks they agree (`http/contracts.test.ts`); the web's forms read them from here, so a field
// stops where the API would. The input schemas' own caps are a far higher ceiling against abuse.

export const limits = {
	dogName: 50,
	dogNotes: 2000,
	cueLabel: 50,
	/** A cue's meaning, hand signal and reward. */
	cueText: 500,
	cueNotes: 2000,
	careTitle: 80,
	careNotes: 2000,
	eventTrigger: 200,
	eventResponse: 1000,
	eventNotes: 2000,
	logEnvironmentNote: 100,
	logNotes: 2000,
	/** The stepper's range, in minutes. */
	logDurationMin: 240,
	/** Times a day a repeating session can have (architecture D24). */
	sessionTimes: 6,
	householdName: 100,
	displayName: 100
} as const;
