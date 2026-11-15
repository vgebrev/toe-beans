<script lang="ts">
	// Offers installing on Today while the browser does, until it's dismissed here or in the
	// browser's own dialog (ui.md §6.3): once, not a nag.
	import { onMount } from 'svelte';
	import Icon from '#lib/components/icon/Icon.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { install } from '#lib/client/install.svelte.js';

	const KEY = 'toe-beans:install-banner-dismissed';
	let dismissed = $state(true);

	onMount(() => {
		try {
			dismissed = localStorage.getItem(KEY) === '1';
		} catch {
			dismissed = false;
		}
	});

	function dismiss() {
		dismissed = true;
		try {
			localStorage.setItem(KEY, '1');
		} catch {
			// Storage blocked: it shows again next time.
		}
	}

	async function offer() {
		const outcome = await install.prompt();
		if (outcome !== 'accepted') dismiss();
	}
</script>

{#if install.state === 'available' && !dismissed}
	<div class="flex items-center gap-2 rounded-2xl border border-border bg-card py-1 pr-1 pl-4">
		<Icon name="install" class="text-primary" />
		<button
			type="button"
			class="flex min-h-12 flex-1 items-center text-left font-bold"
			onclick={offer}
		>
			Install Toe Beans on this device
		</button>
		<Button variant="ghost" size="icon" aria-label="Not now" onclick={dismiss}>
			<Icon name="close" />
		</Button>
	</div>
{:else if install.state === 'installed' && !dismissed}
	<p role="status" class="rounded-2xl bg-soft px-4 py-3">
		Installed. Open Toe Beans from your home screen or apps list from now on.
	</p>
{/if}
