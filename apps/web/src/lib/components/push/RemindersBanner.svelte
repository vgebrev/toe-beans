<script lang="ts">
	// Offers reminders on Today until this browser has been asked, or the banner is dismissed
	// (ui.md J7). It only links to Notifications: permission is asked for there, on a tap.
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import Icon from '#lib/components/icon/Icon.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { pushSupport } from '#lib/push/browser.js';

	const KEY = 'toe-beans:reminders-banner-dismissed';
	let show = $state(false);

	onMount(() => {
		if (pushSupport() !== 'supported' || Notification.permission !== 'default') return;
		try {
			show = localStorage.getItem(KEY) !== '1';
		} catch {
			show = true;
		}
	});

	function dismiss() {
		show = false;
		try {
			localStorage.setItem(KEY, '1');
		} catch {
			// Storage blocked: it shows again next time.
		}
	}
</script>

{#if show}
	<div class="flex items-center gap-2 rounded-2xl border border-border bg-card py-1 pr-1 pl-4">
		<Icon name="notifications" class="text-primary" />
		<a
			href={resolve('/(app)/settings/notifications')}
			class="flex min-h-12 flex-1 items-center font-bold"
		>
			Turn on training reminders
		</a>
		<Button variant="ghost" size="icon" aria-label="Not now" onclick={dismiss}>
			<Icon name="close" />
		</Button>
	</div>
{/if}
