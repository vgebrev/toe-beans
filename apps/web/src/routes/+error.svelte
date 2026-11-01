<script lang="ts">
	// Errors outside a page's own handling (ui.md §5.2). Not found never hints that the item
	// exists elsewhere, such as in another household (NFR-02, scenario 9).
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Logo from '#lib/components/Logo.svelte';
	import { Button } from '#lib/components/ui/button/index.js';

	const notFound = $derived(page.status === 404);
</script>

<svelte:head
	><title>{notFound ? 'Not found' : 'Something went wrong'} · Toe Beans</title></svelte:head
>

<main
	class="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 px-6 text-center"
>
	<Logo size={56} />
	<h1 class="font-display text-[1.75rem] leading-tight font-semibold">
		{notFound ? "We couldn't find that" : 'Something went wrong'}
	</h1>
	<p class="text-muted-foreground">
		{notFound
			? 'It may have been moved or deleted, or the link may be wrong.'
			: "It's not you, it's us. Please try again in a moment."}
	</p>
	{#if page.error?.requestId}
		<p class="text-sm text-muted-foreground">Reference: {page.error.requestId}</p>
	{/if}
	<Button href={resolve('/(app)')} class="mt-2 w-full">Go to Today</Button>
</main>
