<script lang="ts">
	// One question at a time, without the app's bottom bar: there's nothing to navigate to yet.
	import Logo from '#lib/components/Logo.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<main class="mx-auto flex min-h-dvh max-w-sm flex-col gap-6 px-6 pt-10 pb-8">
	<Logo size={40} />
	{@render children()}
</main>
