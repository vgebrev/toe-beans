<script lang="ts">
	// Errors outside a page's own handling (ui.md §5.2). Not found never hints that the item
	// exists elsewhere, such as in another household (NFR-02, scenario 9). A page whose data
	// couldn't be fetched says so rather than blaming the app (§6.1), and loads once back online.
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Logo from '#lib/components/Logo.svelte';
	import { Button } from '#lib/components/ui/button/index.js';

	const notFound = $derived(page.status === 404);
	const offline = $derived(page.error?.offline === true);
	const title = $derived(
		offline ? "You're offline" : notFound ? "We couldn't find that" : 'Something went wrong'
	);

	onMount(() => {
		const retry = () => {
			if (page.error?.offline) location.reload();
		};
		window.addEventListener('online', retry);
		return () => window.removeEventListener('online', retry);
	});
</script>

<svelte:head
	><title>{offline ? 'Offline' : notFound ? 'Not found' : title} · Toe Beans</title></svelte:head
>

<main
	class="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 px-6 text-center"
>
	<Logo size={56} />
	<h1 class="font-display text-[1.75rem] leading-tight font-semibold">{title}</h1>
	<p class="text-muted-foreground">
		{offline
			? 'This page needs a connection. It opens as soon as you’re back online.'
			: notFound
				? 'It may have been moved or deleted, or the link may be wrong.'
				: "It's not you, it's us. Please try again in a moment."}
	</p>
	{#if page.error?.requestId}
		<p class="text-sm text-muted-foreground">Reference: {page.error.requestId}</p>
	{/if}
	{#if offline}
		<Button class="mt-2 w-full" onclick={() => location.reload()}>Try again</Button>
	{:else}
		<Button href={resolve('/(app)')} class="mt-2 w-full">Go to Today</Button>
	{/if}
</main>
