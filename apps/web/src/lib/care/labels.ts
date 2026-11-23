// How the UI names care tasks (ui.md J6, §6.4, FR-10): each category's label, icon and the title
// the form pre-fills, in the order the form offers them, and how the history reads.
import type { CareCategory, CareHistoryEntry, CareTask } from '@toe-beans/contracts';
import type { IconName } from '#lib/components/icon/icons.js';
import { addDays, addMonths, dayPhrase, formatDate } from '#lib/planner/dates.js';

export const careLabels: Record<CareCategory, { label: string; icon: IconName; title: string }> = {
	vaccination: { label: 'Vaccination', icon: 'vaccination', title: 'Vaccination' },
	parasite_prevention: {
		label: 'Parasite prevention',
		icon: 'medication',
		title: 'Parasite prevention'
	},
	vet_appointment: { label: 'Vet appointment', icon: 'vet', title: 'Vet appointment' },
	puppy_school: { label: 'Puppy school', icon: 'care-puppy-school', title: 'Puppy school' },
	sterilisation_consult: {
		label: 'Sterilisation consult',
		icon: 'care-sterilisation',
		title: 'Sterilisation consult'
	},
	other: { label: 'Other', icon: 'care', title: '' }
};

/** In the order the labels list them, so a new category is offered as soon as it's named. */
export const CARE_CATEGORIES = Object.keys(careLabels) as CareCategory[];

/** "today at 09:30", "tomorrow", "Tue 17 Nov". */
export function duePhrase(
	task: Pick<CareTask, 'dueDate' | 'dueTime'>,
	today: string,
	locale?: string
): string {
	const day = dayPhrase(task.dueDate, today, locale);
	return task.dueTime ? `${day} at ${task.dueTime}` : day;
}

const dueText = (due: { date: string; time?: string | undefined }) =>
	`${formatDate(due.date)}${due.time ? ` at ${due.time}` : ''}`;

/** One line of the task's history, e.g. "Moved from Tue 17 Nov to Thu 19 Nov at 14:00". */
export function historyLine(entry: CareHistoryEntry): string {
	switch (entry.kind) {
		case 'created':
			return `Added for ${dueText(entry.due)}`;
		case 'rescheduled':
			return `Moved from ${dueText(entry.from)} to ${dueText(entry.due)}`;
		case 'completed':
			return `Marked done, on ${formatDate(entry.on)}`;
		case 'cancelled':
			return 'Cancelled';
		case 'reopened':
			return 'Put back as upcoming';
	}
}

/**
 * The choices for "Plan the next one" (D30). *Tomorrow* is the day after today; the rest count
 * from the day it was done, so a weekly class done on Tuesday comes back the next Tuesday.
 */
export const NEXT_CHOICES = [
	{ value: 'tomorrow', label: 'Tomorrow', from: 'today', days: 1 },
	{ value: 'week', label: 'Next week', from: 'done', days: 7 },
	{ value: 'month', label: 'In a month', from: 'done', months: 1 },
	{ value: 'year', label: 'In a year', from: 'done', months: 12 }
] as const;
export type NextChoice = (typeof NEXT_CHOICES)[number];

/** The day a choice plans the next one for, given today and the day it was done. */
export function nextDueDate(choice: NextChoice, today: string, completedOn: string): string {
	const from = choice.from === 'today' ? today : completedOn;
	return 'months' in choice ? addMonths(from, choice.months) : addDays(from, choice.days);
}
