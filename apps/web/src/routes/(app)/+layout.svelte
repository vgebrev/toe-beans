<script lang="ts">
	// The app shell (ui.md §2.1): each destination scrolls above the fixed bottom bar. The active
	// dog is shared by every page under it (§2.2). A navigation that takes a while shows a
	// skeleton in place of the page, then "Connecting to Toe Beans…" (§5.2, NFR-09), and Refresh if
	// it hangs: with the app left open, the server may have gone to sleep since the last tap. It
	// keeps the trail of pages visited, so a back link leads where the person came from (§2.1). And
	// it fetches the page's data again whenever it may be out of date (§5.2, NFR-13). With reminders
	// on, it tells the server the device is still in use (architecture D43).
	import { onMount } from 'svelte';
	import { invalidateAll, onNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { navigating, page } from '$app/state';
	import BottomNav from '#lib/components/shell/BottomNav.svelte';
	import LoadingSkeleton, {
		LONG_AFTER_MS,
		WAKE_AFTER_MS
	} from '#lib/components/shell/LoadingSkeleton.svelte';
	import { tabs } from '#lib/components/shell/nav.js';
	import { createApiClient } from '#lib/api-client/index.js';
	import { ActiveDog, setActiveDog } from '#lib/dogs/active-dog.svelte.js';
	import { isForm, setTrail, Trail } from '#lib/navigation/trail.svelte.js';
	import { seenBody } from '#lib/push/browser.js';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	const active = setActiveDog(new ActiveDog());
	onMount(() => active.restore());

	// Once per app open: a device not seen for 30 days is deleted as gone, and one signed out here
	// resumes. A failure only means it's tried again on the next open.
	onMount(() => {
		const api = createApiClient((input, init) => fetch(input, init));
		seenBody()
			.then((body) => body && api.send('POST', '/reminders/devices/seen', { body }))
			.catch(() => undefined);
	});

	// The tabs start the trail afresh.
	const roots = new Set<string>(tabs.map((tab) => resolve(tab.route)));
	const trail = setTrail(new Trail());
	const visit = (url: Pick<URL, 'pathname' | 'search'>, routeId: string | null) =>
		trail.arrive(url.pathname, url.pathname + url.search, routeId, roots.has(url.pathname));
	onMount(() => visit(page.url, page.route.id));
	// Before the new page renders, so its back link is right from the start; the title is still
	// the page being left.
	onNavigate((navigation) => {
		if (!navigation.to || navigation.willUnload) return;
		trail.leave(document.title);
		visit(navigation.to.url, navigation.to.route.id);
	});

	// Fresh data on coming back to the front (another phone may have changed things meanwhile),
	// and on Back to a page Chrome kept whole in its back/forward cache, as after a reminder's tap
	// opened its item as a new page in the app's window. Never on a form or with a sheet open, so
	// nothing being entered is lost.
	onMount(() => {
		const refresh = () => {
			if (document.visibilityState !== 'visible' || isForm(page.route.id)) return;
			if (document.querySelector('[role="dialog"]')) return;
			void invalidateAll();
		};
		const restored = (event: PageTransitionEvent) => {
			if (event.persisted) refresh();
		};
		document.addEventListener('visibilitychange', refresh);
		window.addEventListener('pageshow', restored);
		return () => {
			document.removeEventListener('visibilitychange', refresh);
			window.removeEventListener('pageshow', restored);
		};
	});

	/** A quick navigation just swaps pages; only a slow one shows the skeleton. */
	const SLOW_AFTER_MS = 400;
	let slow = $state(false);
	$effect(() => {
		if (!navigating.to) {
			slow = false;
			return;
		}
		const timer = setTimeout(() => (slow = true), SLOW_AFTER_MS);
		return () => clearTimeout(timer);
	});
</script>

<div class="mx-auto flex min-h-dvh max-w-xl flex-col">
	<!-- Bottom padding: the bar's 4 rem plus the phone's gesture/button area. -->
	<main class="flex-1 pb-[calc(5rem+env(safe-area-inset-bottom))]">
		{#if slow}
			<!-- Refresh loads the page being navigated to, not the one being left. -->
			<LoadingSkeleton
				wakeAfterMs={WAKE_AFTER_MS - SLOW_AFTER_MS}
				longAfterMs={LONG_AFTER_MS - SLOW_AFTER_MS}
				refreshTo={navigating.to?.url.href}
			/>
		{/if}
		<!-- Hidden rather than removed, so the page keeps its state if the navigation stays on it. -->
		<div class={slow ? 'hidden' : 'contents'}>
			{@render children()}
		</div>
	</main>
</div>
<BottomNav />
