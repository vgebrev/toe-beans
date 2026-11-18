<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import favicon from '#lib/assets/brand/favicon.svg';
	import StatusBanner from '#lib/components/shell/StatusBanner.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// The service worker's fallback pages say it themselves.
	const fallback = $derived(page.route.id?.startsWith('/(shell)') ?? false);
</script>

<svelte:head>
	<link rel="icon" href={favicon} type="image/svg+xml" />
</svelte:head>

{#if !fallback}<StatusBanner />{/if}
{@render children()}
