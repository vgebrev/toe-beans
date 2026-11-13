// History's list between requests (ui.md §4.4): Back from a log or event shows what was loaded,
// scrolled where it was, without asking again; and an entry *Undo* brings back goes into its
// place instead of the page loading afresh.
import type { HistoryEntry } from '@toe-beans/contracts';
import type { HistoryFilters } from './filters.js';

const instant = (entry: HistoryEntry) =>
	entry.kind === 'training' ? entry.log.practisedAt : entry.event.occurredAt;
const idOf = (entry: HistoryEntry) => (entry.kind === 'training' ? entry.log.id : entry.event.id);
const dateOf = (entry: HistoryEntry) =>
	entry.kind === 'training' ? entry.log.date : entry.event.date;

/** Newest first, then by ID, as the API pages them. */
function before(a: HistoryEntry, b: HistoryEntry) {
	const at = Date.parse(instant(a)) - Date.parse(instant(b));
	return at !== 0 ? at > 0 : idOf(a) > idOf(b);
}

/** Whether these filters, with this dog (null for every dog), would list the entry. */
export function matches(entry: HistoryEntry, filters: HistoryFilters, dogId: string | null) {
	const dog = entry.kind === 'training' ? entry.log.dogId : entry.event.dogId;
	if (dogId && dog !== dogId) return false;
	const date = dateOf(entry);
	if ((filters.from && date < filters.from) || (filters.to && date > filters.to)) return false;
	if (entry.kind === 'training') {
		return (
			(filters.type === null || filters.type === 'training') &&
			(filters.exercise === null || entry.log.exercise.id === filters.exercise)
		);
	}
	if (filters.exercise !== null || filters.type === 'training') return false;
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
