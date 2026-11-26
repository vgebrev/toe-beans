<script lang="ts">
	// The back link at the top of a page (ui.md §2.1): to the page the person came from, named by
	// its title, or else to the page's parent (`href`, `label`), as on a page loaded afresh.
	import { page } from '$app/state';
	import Icon from '#lib/components/icon/Icon.svelte';
	import { getTrail } from '#lib/navigation/trail.svelte.js';

	interface Props {
		/** The parent page, resolved. */
		href: string;
		label: string;
		/** Load the parent afresh, for one the edge serves when signed out (the landing page, D44). */
		reload?: boolean;
	}

	let { href, label, reload = false }: Props = $props();

	const trail = getTrail();
	const from = $derived(trail?.backFrom(page.url.pathname));
</script>

<!-- Either the parent, resolved by the page, or a page on the trail, which was resolved when the
     person was there. -->
<!-- eslint-disable svelte/no-navigation-without-resolve -->
<a
	href={from?.href ?? href}
	data-sveltekit-reload={reload && !from ? '' : undefined}
	class="flex min-h-12 items-center gap-1 self-start font-bold"
>
	<Icon name="back" />
	{from ? (from.label ?? 'Back') : label}
</a>
