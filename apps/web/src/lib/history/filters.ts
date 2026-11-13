// History's filters (ui.md §4.4, §2.3, FR-09), kept in the URL so they survive a reload and Back:
// `type` (training, events or one kind of event), `exercise`, and `from` / `to` dates. The dog
// is the switcher's (§2.2), not in the URL. Anything the URL holds that isn't a filter is dropped.
import type { EventCategory } from '@toe-beans/contracts';
import { categoryLabels, CATEGORIES } from '#lib/journal/labels.js';
import { addDays, isPlainDate } from '#lib/planner/dates.js';

export type HistoryType = 'training' | 'events' | EventCategory;

export interface HistoryFilters {
	type: HistoryType | null;
	exercise: string | null;
	from: string | null;
	to: string | null;
}

const TYPES: readonly string[] = ['training', 'events', ...CATEGORIES];

export function readFilters(params: Pick<URLSearchParams, 'get'>): HistoryFilters {
	const type = params.get('type');
	const exercise = params.get('exercise');
	const from = params.get('from');
	const to = params.get('to');
	const dates = isPlainDate(from) && isPlainDate(to) && to < from ? {} : { from, to };
	return {
		type: type !== null && TYPES.includes(type) ? (type as HistoryType) : null,
		exercise: exercise && exercise.length <= 100 ? exercise : null,
		from: isPlainDate(dates.from ?? null) ? dates.from! : null,
		to: isPlainDate(dates.to ?? null) ? dates.to! : null
	};
}

/** The query string for these filters, without a leading `?`; empty for none. */
export function filterQuery(filters: HistoryFilters, extra: Record<string, string> = {}): string {
	const params = new URLSearchParams();
	if (filters.type) params.set('type', filters.type);
	if (filters.exercise) params.set('exercise', filters.exercise);
	if (filters.from) params.set('from', filters.from);
	if (filters.to) params.set('to', filters.to);
	for (const [key, value] of Object.entries(extra)) params.set(key, value);
	return params.toString();
}

/** These filters with some changed. An exercise only applies to training, so it drops events. */
export function withFilters(filters: HistoryFilters, change: Partial<HistoryFilters>) {
	const next = { ...filters, ...change };
	if (change.exercise && next.type !== 'training') next.type = null;
	if (change.type && change.type !== 'training') next.exercise = null;
	return next;
}

export const typeOptions: readonly { id: HistoryType | 'all'; label: string }[] = [
	{ id: 'all', label: 'All types' },
	{ id: 'training', label: 'Training' },
	{ id: 'events', label: 'Any event' },
	...CATEGORIES.map((c) => ({ id: c, label: categoryLabels[c].label }))
];

/** The date choices before *Choose dates*: how many days back, today included. */
export const DATE_PRESETS = [
	{ id: '7', label: 'Last 7 days', days: 7 },
	{ id: '30', label: 'Last 30 days', days: 30 },
	{ id: '90', label: 'Last 3 months', days: 90 }
] as const;

/** The preset these dates are, if any, counted back from `today`. */
export function presetOf(filters: HistoryFilters, today: string): string | null {
	if (!filters.from && !filters.to) return 'all';
	if (filters.to !== null && filters.to !== today) return null;
	return DATE_PRESETS.find((p) => filters.from === addDays(today, 1 - p.days))?.id ?? null;
}

export const presetDates = (days: number, today: string) => ({
	from: addDays(today, 1 - days),
	to: null
});

export const anyFilter = (filters: HistoryFilters) =>
	Boolean(filters.type || filters.exercise || filters.from || filters.to);
