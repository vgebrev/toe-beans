// How the UI names care tasks (ui.md J6, §6.4, FR-10): each category's label, icon and the title
// the form pre-fills, in the order the form offers them, and how the history reads.
import type { CareCategory, CareHistoryEntry, CareTask } from '@toe-beans/contracts';
import type { IconName } from '#lib/components/icon/icons.js';
import { dayPhrase, formatDate } from '#lib/planner/dates.js';

export const CARE_CATEGORIES: readonly CareCategory[] = [
	'vaccination',
	'parasite_prevention',
	'vet_appointment',
	'puppy_school',
	'sterilisation_consult',
	'other'
];

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

/** The choices for "Plan the next one" (D30): months after the day it was done. */
export const NEXT_CHOICES = [
	{ months: 1, label: 'In a month' },
	{ months: 3, label: 'In 3 months' },
	{ months: 12, label: 'In a year' }
] as const;

/** The same day `months` later, or the month's last day when it's shorter. */
export function addMonths(date: string, months: number): string {
	const [y, m, d] = date.split('-').map(Number) as [number, number, number];
	const first = new Date(Date.UTC(y, m - 1 + months, 1));
	const lastDay = new Date(
		Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)
	).getUTCDate();
	first.setUTCDate(Math.min(d, lastDay));
	return first.toISOString().slice(0, 10);
}
