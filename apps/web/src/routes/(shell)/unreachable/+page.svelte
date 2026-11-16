<script lang="ts">
	// A page load the platform answered with 502, 503 or 504 (architecture §7): the connection
	// works, but Toe Beans didn't answer.
	import FallbackMessage from '#lib/components/shell/FallbackMessage.svelte';
</script>

<FallbackMessage
	title="Can't reach Toe Beans"
	text="You're online, but Toe Beans didn't answer. This is usually brief, so try again in a minute."
/>
