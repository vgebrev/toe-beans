<script lang="ts">
	import LegalPage from '#lib/components/legal/LegalPage.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<LegalPage
	title={data.title}
	description="What Toe Beans keeps about you and your household, why, who it's shared with, how long it's kept, and your rights under POPIA."
	updated={data.updated}
	html={data.html}
/>
