<script lang="ts">
	// A fallback page stands in for whatever page was asked for, so it keeps to the middle of
	// the screen like the error page, without the app's bottom bar.
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<main class="mx-auto flex min-h-dvh max-w-xl flex-col">
	{@render children()}
</main>
