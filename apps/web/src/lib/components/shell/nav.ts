// The five primary destinations (ui.md §2.1), by route ID so links go through resolve() and
// a renamed route fails the type check.
import type { RouteId } from '$app/types';
import type { IconName } from '#lib/components/icon/icons.js';

export interface Tab {
	route: RouteId;
	label: string;
	icon: IconName;
}

export const tabs: readonly Tab[] = [
	{ route: '/(app)', label: 'Today', icon: 'today' },
	{ route: '/(app)/plan', label: 'Plan', icon: 'plan' },
	{ route: '/(app)/history', label: 'History', icon: 'history' },
	{ route: '/(app)/care', label: 'Care', icon: 'care' },
	{ route: '/(app)/more', label: 'More', icon: 'more' }
];

/** Whether a tab is the current destination: Today only itself, the others their subtree. */
export function isActive(tab: Tab, routeId: string | null): boolean {
	if (routeId === null) return false;
	if (tab.route === '/(app)') return routeId === tab.route;
	return routeId === tab.route || routeId.startsWith(`${tab.route}/`);
}
