<script lang="ts">
	import LegalPage from '#lib/components/legal/LegalPage.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<LegalPage
	title={data.title}
	description="The terms of service for Toe Beans, the free app for planning, logging and keeping on top of a puppy's training and care, together as a household."
	updated={data.updated}
	html={data.html}
/>
