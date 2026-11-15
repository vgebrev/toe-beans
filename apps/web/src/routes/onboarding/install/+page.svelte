<script lang="ts">
	// J1 step 7, skippable, last: install, unless this is already the app (ui.md §6.3). Then Today.
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { install } from '#lib/client/install.svelte.js';
	import InstallOffer from '#lib/components/shell/InstallOffer.svelte';
	import { Button } from '#lib/components/ui/button/index.js';

	onMount(() => {
		if (install.state === 'app') void goto(resolve('/(app)'), { replaceState: true });
	});
</script>

<svelte:head><title>Install Toe Beans · Toe Beans</title></svelte:head>

<h1 class="font-display text-[1.75rem] leading-tight font-semibold">Install Toe Beans</h1>
<InstallOffer reason="Installed, it opens like any other app, and reminders are more reliable." />
<Button
	href={resolve('/(app)')}
	variant={install.state === 'installed' ? 'default' : 'ghost'}
	class="w-full"
>
	{install.state === 'installed' ? 'Go to Today' : 'Not now'}
</Button>
