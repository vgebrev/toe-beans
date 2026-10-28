<svelte:head><title>Offline · Toe Beans</title></svelte:head>

<main>
	<h1>You're offline</h1>
	<p>Toe Beans needs a connection to load your household's data. Check your signal and try again.</p>
	<button onclick={() => location.reload()}>Try again</button>
</main>

<style>
	main {
		padding: 24px 16px;
	}
	button {
		min-height: 48px;
		padding: 0 24px;
		border: 0;
		border-radius: 24px;
		background: var(--primary);
		color: var(--on-primary);
		font: inherit;
		font-weight: 700;
	}
</style>
