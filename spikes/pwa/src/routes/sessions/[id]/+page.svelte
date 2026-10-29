<script lang="ts">
	import { page } from '$app/state';
</script>

<svelte:head><title>Session · Toe Beans</title></svelte:head>

<main>
	<a href="/">← Back</a>
	<h1>Recall basics</h1>
	<p>Deep link from notification <strong>{page.params.id}</strong> worked.</p>
	<p class="muted">In the real app this is the planned session for Ripley.</p>
</main>

<style>
	main {
		padding: max(24px, env(safe-area-inset-top)) 16px 24px;
		max-width: 480px;
		margin: 0 auto;
	}
	a {
		color: var(--primary);
		font-weight: 700;
	}
	.muted {
		color: var(--muted);
	}
</style>
