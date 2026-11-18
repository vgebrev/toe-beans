// Where a back link leads (ui.md §2.1): the page the person came from, not the page's parent in
// the menu. A page opened from Today goes back to Today, the same page opened from Dogs back to
// Dogs. The trail lives in the browser for this visit only; a page loaded afresh (a reload, a
// reminder's tap, a shared link) has no trail, and its back link goes to its parent as before.
import { getContext, setContext } from 'svelte';

export interface Stop {
	/** The page, without its query: a page met again cuts the trail back to it. */
	path: string;
	/** With the query, so going back finds the page as it was left (History's filters, Plan's week). */
	href: string;
	/** The page's title as it was left, e.g. "Today" or the dog's name. */
	label?: string;
	/** A form (add or change): once left, it isn't somewhere to go back to. */
	transient: boolean;
}

/** Enough for any real path through the app; older stops fall off. */
const LIMIT = 20;

/**
 * The trail after arriving at `stop`. A tab starts it afresh; a page already on it cuts it back
 * there (going back, or a form returning to its page after saving); any other page is added.
 */
export function arrive(trail: readonly Stop[], stop: Stop, root: boolean): Stop[] {
	if (root) return [stop];
	const at = trail.findIndex((s) => s.path === stop.path);
	if (at >= 0) return [...trail.slice(0, at), stop];
	return [...trail, stop].slice(-LIMIT);
}

/** The trail on leaving its last page: named by its title, or dropped if it was a form. */
export function leave(trail: readonly Stop[], label: string | undefined): Stop[] {
	const last = trail.at(-1);
	if (!last) return [...trail];
	if (last.transient) return trail.slice(0, -1);
	return [...trail.slice(0, -1), { ...last, label }];
}

/** Where the back link on `path` leads, if the person came from somewhere on the trail. */
export function backFrom(trail: readonly Stop[], path: string): Stop | undefined {
	const at = trail.findLastIndex((s) => s.path === path);
	return at > 0 ? trail[at - 1] : undefined;
}

/** "Bean · Toe Beans" → "Bean"; the app's name alone names nothing. */
export function labelOf(title: string): string | undefined {
	const label = title.replace(/\s*·\s*Toe Beans$/, '').trim();
	return label && label !== 'Toe Beans' ? label : undefined;
}

/** A form's route: adding or changing something. */
export const isForm = (routeId: string | null): boolean => /\/(new|edit)$/.test(routeId ?? '');

export class Trail {
	stops = $state<Stop[]>([]);

	arrive(path: string, href: string, routeId: string | null, root: boolean) {
		this.stops = arrive(this.stops, { path, href, transient: isForm(routeId) }, root);
	}

	leave(title: string) {
		this.stops = leave(this.stops, labelOf(title));
	}

	backFrom(path: string): Stop | undefined {
		return backFrom(this.stops, path);
	}
}

const context = Symbol('trail');
export const setTrail = (trail: Trail) => setContext(context, trail);
export const getTrail = (): Trail | undefined => getContext<Trail | undefined>(context);
