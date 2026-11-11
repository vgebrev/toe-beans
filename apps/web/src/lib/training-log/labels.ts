// How the UI names a log's outcome and context (ui.md §4.2, §6.4, FR-07). Short labels fit the
// segmented control; the full ones are what screen readers and the log page say.
import type { EmotionalState, Environment, Outcome } from '@toe-beans/contracts';
import type { IconName } from '#lib/components/icon/icons.js';

export const OUTCOMES: readonly Outcome[] = ['successful', 'partial', 'not_yet', 'not_assessed'];

export const outcomeLabels: Record<Outcome, { short: string; full: string; icon: IconName }> = {
	successful: { short: 'Successful', full: 'Successful', icon: 'outcome-successful' },
	partial: { short: 'Partly', full: 'Partially successful', icon: 'outcome-partial' },
	not_yet: { short: 'Not yet', full: 'Not yet successful', icon: 'outcome-not-yet' },
	not_assessed: { short: 'Not assessed', full: 'Not assessed', icon: 'outcome-not-assessed' }
};

export const MOODS: readonly EmotionalState[] = ['relaxed', 'uncertain', 'stressed'];

export const moodLabels: Record<EmotionalState, { short: string; full: string }> = {
	relaxed: { short: 'Relaxed', full: 'Relaxed/confident' },
	uncertain: { short: 'Uncertain', full: 'Uncertain' },
	stressed: { short: 'Stressed', full: 'Stressed/overwhelmed' }
};

export const PLACES: readonly Environment[] = ['home', 'garden', 'public', 'other'];

export const placeLabels: Record<Environment, { short: string; full: string }> = {
	home: { short: 'Home', full: 'Home' },
	garden: { short: 'Garden', full: 'Garden' },
	public: { short: 'Public', full: 'Public space' },
	other: { short: 'Other', full: 'Somewhere else' }
};

/** The stepper's range, matching the API's (architecture §5.2). */
export const DURATION_MAX = 240;
