<script lang="ts">
	// Every page: the styles, the connection banner, and the trail of pages visited, so a back link
	// leads where the person came from (ui.md §2.1). The trail lives here, not in the app shell, so
	// pages outside it (the terms and privacy policy, sign-in) keep it too: More → Terms → back
	// returns to More.
	import '../app.css';
	import { onMount } from 'svelte';
	import { onNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import favicon from '#lib/assets/brand/favicon.svg';
	import { tabs } from '#lib/components/shell/nav.js';
	import StatusBanner from '#lib/components/shell/StatusBanner.svelte';
	import { setTrail, Trail } from '#lib/navigation/trail.svelte.js';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

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

	// The service worker's fallback pages say it themselves.
	const fallback = $derived(page.route.id?.startsWith('/(shell)') ?? false);
</script>

<svelte:head>
	<link rel="icon" href={favicon} type="image/svg+xml" />
</svelte:head>

{#if !fallback}<StatusBanner />{/if}
{@render children()}
