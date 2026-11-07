<script lang="ts">
	// A date in the household's time zone and the device's locale (ui.md §5.4). The server can't
	// know the locale, so it fills in on the device.
	import { onMount } from 'svelte';

	interface Props {
		iso: string;
		timeZone: string;
	}

	let { iso, timeZone }: Props = $props();

	let mounted = $state(false);
	onMount(() => (mounted = true));
	const text = $derived(
		mounted
			? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone }).format(new Date(iso))
			: ''
	);
</script>

<time datetime={iso}>{text}</time>
