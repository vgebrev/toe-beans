<script lang="ts">
	// Welcome and sign-in (ui.md J1 step 1). The provider's own page offers Google or email; this
	// page explains what Toe Beans is and says plainly when a sign-in didn't work.
	import { resolve } from '$app/paths';
	import Logo from '#lib/components/Logo.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const signInHref = (prompt?: 'login') => {
		const query = [
			...(data.returnTo !== '/' ? [`returnTo=${encodeURIComponent(data.returnTo)}`] : []),
			...(prompt ? [`prompt=${prompt}`] : [])
		].join('&');
		return resolve('/auth/sign-in') + (query ? `?${query}` : '');
	};
</script>

<svelte:head><title>Sign in · Toe Beans</title></svelte:head>

<main
	class="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-5 px-6 text-center"
>
	<Logo wordmark size={56} />
	<h1 class="font-display text-[1.75rem] leading-tight font-semibold">Welcome to Toe Beans</h1>
	<p class="text-muted-foreground">
		Plan training, log practice and keep on top of care, together with everyone who looks after your
		dog.
	</p>

	{#if data.error === 'unverified'}
		<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3 text-left">
			Please verify your email first. We've sent you a link: open it, then sign in again.
		</p>
	{:else if data.error === 'too-many'}
		<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3 text-left">
			Too many sign-in attempts. Please wait a few minutes, then try again.
		</p>
	{:else if data.error === 'failed'}
		<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3 text-left">
			Signing in didn't work. Please try again.
		</p>
	{/if}

	<!-- A server route, not a page: reload so the browser follows the redirect to the provider. -->
	<Button href={signInHref()} data-sveltekit-reload size="lg" class="w-full">Sign in</Button>
	{#if data.error === 'unverified'}
		<Button href={signInHref('login')} data-sveltekit-reload variant="outline" class="w-full">
			Use a different account
		</Button>
	{/if}
	<p class="text-sm text-muted-foreground">With Google, or with your email and a password.</p>
</main>
