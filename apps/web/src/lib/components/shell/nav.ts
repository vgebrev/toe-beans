// The five primary destinations (ui.md §2.1), by route ID so links go through resolve() and
// a renamed route fails the type check.
import type { RouteId } from '$app/types';
import type { IconName } from '#lib/components/icon/icons.js';

export interface Tab {
	/** Only routes without parameters can be a tab. */
	route: '/(app)' | '/(app)/plan' | '/(app)/history' | '/(app)/care' | '/(app)/more';
	label: string;
	icon: IconName;
	/** Other routes reached from this tab, which keep it marked. */
	also?: readonly RouteId[];
}

export const tabs: readonly Tab[] = [
	{ route: '/(app)', label: 'Today', icon: 'today' },
	{ route: '/(app)/plan', label: 'Plan', icon: 'plan' },
	{ route: '/(app)/history', label: 'History', icon: 'history' },
	{ route: '/(app)/care', label: 'Care', icon: 'care' },
	{ route: '/(app)/more', label: 'More', icon: 'more', also: ['/(app)/household', '/(app)/dogs'] }
];

/** Whether a tab is the current destination: Today only itself, the others their subtree. */
export function isActive(tab: Tab, routeId: string | null): boolean {
	if (routeId === null) return false;
	if (tab.route === '/(app)') return routeId === tab.route;
	return [tab.route, ...(tab.also ?? [])].some(
		(route) => routeId === route || routeId.startsWith(`${route}/`)
	);
}
