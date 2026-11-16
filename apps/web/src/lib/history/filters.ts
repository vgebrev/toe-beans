// History's filters (ui.md §4.4, §2.3, FR-09), kept in the URL so they survive a reload and Back:
// `type` (one of the contracts' `historyTypes`), `exercise`, and `from` / `to` dates. The dog is the
// switcher's (§2.2), not in the URL. Anything the URL holds that isn't a filter is dropped.
import { historyTypes, type CareCategory, type HistoryType } from '@toe-beans/contracts';
import { CARE_CATEGORIES, careLabels } from '#lib/care/labels.js';
import { categoryLabels, CATEGORIES } from '#lib/journal/labels.js';
import { addDays, isPlainDate } from '#lib/planner/dates.js';

/** The kind of care a type picks, if it picks one. */
export const careKindOf = (type: HistoryType | null): CareCategory | null =>
	type?.startsWith('care-') ? (type.slice('care-'.length) as CareCategory) : null;

export const isCareType = (type: HistoryType | null) =>
	type === 'care' || careKindOf(type) !== null;

export interface HistoryFilters {
	type: HistoryType | null;
	exercise: string | null;
	from: string | null;
	to: string | null;
}

export function readFilters(params: Pick<URLSearchParams, 'get'>): HistoryFilters {
	const type = params.get('type');
	const exercise = params.get('exercise');
	const from = params.get('from');
	const to = params.get('to');
	const dates = isPlainDate(from) && isPlainDate(to) && to < from ? {} : { from, to };
	return {
		type:
			type !== null && (historyTypes as readonly string[]).includes(type)
				? (type as HistoryType)
				: null,
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

/** These filters with some changed. An exercise only applies to training, so it drops the rest. */
export function withFilters(filters: HistoryFilters, change: Partial<HistoryFilters>) {
	const next = { ...filters, ...change };
	if (change.exercise && next.type !== 'training') next.type = null;
	if (change.type && change.type !== 'training') next.exercise = null;
	return next;
}

export const typeOptions: readonly { id: HistoryType | 'all'; label: string; divider?: boolean }[] =
	[
		{ id: 'all', label: 'All types' },
		{ id: 'training', label: 'Training', divider: true },
		{ id: 'events', label: 'Any event', divider: true },
		// Both lists have an *Other*; the button shows the choice alone, so each says which.
		...CATEGORIES.map((c) => ({
			id: c,
			label: c === 'other' ? 'Other event' : categoryLabels[c].label
		})),
		{ id: 'care', label: 'Any care', divider: true },
		...CARE_CATEGORIES.map((k) => ({
			id: `care-${k}` as const,
			label: k === 'other' ? 'Other care' : careLabels[k].label
		}))
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
