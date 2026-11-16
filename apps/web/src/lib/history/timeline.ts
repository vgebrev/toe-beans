// History's list between requests (ui.md §4.4): Back from an entry shows what was loaded,
// scrolled where it was, without asking again; and an entry *Undo* brings back goes into its
// place instead of the page loading afresh.
import type { HistoryEntry } from '@toe-beans/contracts';
import { careKindOf, isCareType, type HistoryFilters } from './filters.js';

export function idOf(entry: HistoryEntry): string {
	switch (entry.kind) {
		case 'training':
			return entry.log.id;
		case 'event':
			return entry.event.id;
		case 'care':
			return entry.task.id;
	}
}

/** The day on the household's clocks: a care task's is the day it was done. */
export function dateOf(entry: HistoryEntry): string {
	switch (entry.kind) {
		case 'training':
			return entry.log.date;
		case 'event':
			return entry.event.date;
		case 'care':
			return entry.task.completedOn ?? entry.task.dueDate;
	}
}

const dogOf = (entry: HistoryEntry) =>
	entry.kind === 'training'
		? entry.log.dogId
		: entry.kind === 'event'
			? entry.event.dogId
			: entry.task.dogId;

/**
 * Newest first, then by ID, as the API pages them. A care task heads its day (architecture D35),
 * so days compare first; within a day care comes before anything with a time.
 */
function before(a: HistoryEntry, b: HistoryEntry) {
	const day = dateOf(a).localeCompare(dateOf(b));
	if (day !== 0) return day > 0;
	if ((a.kind === 'care') !== (b.kind === 'care')) return a.kind === 'care';
	if (a.kind !== 'care' && b.kind !== 'care') {
		const instant = (e: typeof a) =>
			e.kind === 'training' ? e.log.practisedAt : e.event.occurredAt;
		const at = Date.parse(instant(a)) - Date.parse(instant(b));
		if (at !== 0) return at > 0;
	}
	return idOf(a) > idOf(b);
}

/** Whether these filters, with this dog (null for every dog), would list the entry. */
export function matches(entry: HistoryEntry, filters: HistoryFilters, dogId: string | null) {
	if (dogId && dogOf(entry) !== dogId) return false;
	const date = dateOf(entry);
	if ((filters.from && date < filters.from) || (filters.to && date > filters.to)) return false;
	if (entry.kind === 'care') {
		const kind = careKindOf(filters.type);
		return (
			filters.exercise === null &&
			(filters.type === null || filters.type === 'care' || kind === entry.task.category)
		);
	}
	if (entry.kind === 'training') {
		return (
			(filters.type === null || filters.type === 'training') &&
			(filters.exercise === null || entry.log.exercise.id === filters.exercise)
		);
	}
	if (filters.exercise !== null || filters.type === 'training' || isCareType(filters.type)) {
		return false;
	}
	return (
		filters.type === null || filters.type === 'events' || filters.type === entry.event.category
	);
}

/**
 * The list with the entry in its place, replacing any copy. One older than everything loaded
 * stays out while there's more to load: *Load more* brings it in order.
 */
export function placeEntry(
	entries: readonly HistoryEntry[],
	entry: HistoryEntry,
	more: boolean
): HistoryEntry[] {
	const id = idOf(entry);
	const others = entries.filter((e) => idOf(e) !== id);
	const at = others.findIndex((e) => before(entry, e));
	if (at === -1) return more ? others : [...others, entry];
	return [...others.slice(0, at), entry, ...others.slice(at)];
}

interface Kept {
	key: string;
	entries: HistoryEntry[];
	next: string | undefined;
	writes: number;
}

// One list, in memory only: a reload starts afresh.
let kept: Kept | null = null;

export const keepList = (list: Kept) => {
	kept = list;
};

/** The kept list for this query, unless the tab has written anything since it was kept. */
export function keptList(key: string, writes: number): Kept | null {
	return kept && kept.key === key && kept.writes === writes ? kept : null;
}
