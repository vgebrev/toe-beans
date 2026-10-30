<svelte:head><title>Can't reach Toe Beans</title></svelte:head>

<main>
	<h1>Can't reach Toe Beans</h1>
	<p>You're online, but the Toe Beans server didn't answer. This is usually brief. Try again in a minute.</p>
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
