// How the UI names a log's outcome and context (ui.md §4.2, §6.4, FR-07). Short labels fit the
// segmented control; the full ones are what screen readers and the log page say. Each list is in
// its labels' order, so a new choice is offered as soon as it's named.
import type { EmotionalState, Environment, Outcome } from '@toe-beans/contracts';
import type { IconName } from '#lib/components/icon/icons.js';

export const outcomeLabels: Record<Outcome, { short: string; full: string; icon: IconName }> = {
	successful: { short: 'Successful', full: 'Successful', icon: 'outcome-successful' },
	partial: { short: 'Partly', full: 'Partially successful', icon: 'outcome-partial' },
	not_yet: { short: 'Not yet', full: 'Not yet successful', icon: 'outcome-not-yet' },
	not_assessed: { short: 'Not assessed', full: 'Not assessed', icon: 'outcome-not-assessed' }
};

export const OUTCOMES = Object.keys(outcomeLabels) as Outcome[];

export const moodLabels: Record<EmotionalState, { short: string; full: string }> = {
	relaxed: { short: 'Relaxed', full: 'Relaxed/confident' },
	uncertain: { short: 'Uncertain', full: 'Uncertain' },
	stressed: { short: 'Stressed', full: 'Stressed/overwhelmed' }
};

export const MOODS = Object.keys(moodLabels) as EmotionalState[];

export const placeLabels: Record<Environment, { short: string; full: string }> = {
	home: { short: 'Home', full: 'Home' },
	garden: { short: 'Garden', full: 'Garden' },
	public: { short: 'Public', full: 'Public space' },
	other: { short: 'Other', full: 'Somewhere else' }
};

export const PLACES = Object.keys(placeLabels) as Environment[];
