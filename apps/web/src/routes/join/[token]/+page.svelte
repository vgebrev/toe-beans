<script lang="ts">
	// Accepting an invitation (ui.md J2). Outside the app shell: the person may have no household
	// yet, or not be signed in at all.
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Icon from '#lib/components/icon/Icon.svelte';
	import Logo from '#lib/components/Logo.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { createApiClient } from '#lib/api-client/index.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const api = createApiClient((input, init) => fetch(input, init));
	const token = $derived(page.params.token ?? '');
	const signInHref = (prompt?: 'login') => {
		const returnTo = encodeURIComponent(resolve('/join/[token]', { token }));
		return `${resolve('/auth/sign-in')}?returnTo=${returnTo}${prompt ? `&prompt=${prompt}` : ''}`;
	};

	// English like the rest of the copy, and the same on the server and the phone, so hydration
	// doesn't change it.
	const listFormat = new Intl.ListFormat('en', { type: 'conjunction' });

	let status = $state<'idle' | 'joining' | 'failed' | 'too-many' | 'signed-out'>('idle');

	async function accept() {
		status = 'joining';
		const result = await api.send('POST', `/invitations/${token}/accept`);
		if (result.ok) {
			await goto(resolve('/(app)'), { invalidateAll: true });
			return;
		}
		const code = result.error.kind === 'problem' ? result.error.problem.status : 0;
		if (code === 409 || code === 404) {
			// It changed since the page loaded; the preview says how.
			status = 'idle';
			await invalidateAll();
			return;
		}
		status = code === 429 ? 'too-many' : code === 401 ? 'signed-out' : 'failed';
	}

	const dead = {
		expired: {
			title: 'This invite has expired',
			text: 'Ask the person who invited you for a new one.'
		},
		revoked: {
			title: 'This invite was cancelled',
			text: 'Ask the person who invited you for a new one.'
		},
		used: {
			title: 'This invite has already been used',
			text: 'Each invite works once. Ask the person who invited you for a new one.'
		}
	};
	const preview = $derived(data.preview);
	const deadCopy = $derived(
		preview && preview.status in dead ? dead[preview.status as keyof typeof dead] : null
	);
</script>

<svelte:head><title>Join a household · Toe Beans</title></svelte:head>

{#snippet heading(text: string)}
	<h1 class="font-display text-[1.75rem] leading-tight font-semibold">{text}</h1>
{/snippet}

<main
	class="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-5 px-6 text-center"
>
	<Logo wordmark size={56} />

	{#if data.failure === 'unknown'}
		{@render heading("This invite isn't valid")}
		<p class="text-muted-foreground">Check that you opened the whole link, or ask for a new one.</p>
	{:else if data.failure === 'too-many'}
		{@render heading('Too many attempts')}
		<p class="text-muted-foreground">Please wait a few minutes, then open the link again.</p>
	{:else if data.failure === 'unreachable'}
		{@render heading("Couldn't load this invite")}
		<p class="text-muted-foreground">Check your connection, then try again.</p>
		<Button class="w-full" onclick={() => invalidateAll()}>Retry</Button>
	{:else if deadCopy}
		{@render heading(deadCopy.title)}
		<p class="text-muted-foreground">{deadCopy.text}</p>
	{:else if preview?.status === 'already-member'}
		{@render heading(`You're already in ${preview.householdName}`)}
		<Button href={resolve('/(app)')} class="w-full">Go to Today</Button>
	{:else if preview?.status === 'in-another-household'}
		{@render heading('You already have a household')}
		<p class="text-muted-foreground">
			For now each person can be in one household, so you can't join {preview.householdName} with this
			account.
		</p>
		<Button href={signInHref('login')} data-sveltekit-reload variant="outline" class="w-full">
			Use a different account
		</Button>
		<Button href={resolve('/(app)')} variant="ghost" class="w-full">Go to Today</Button>
	{:else if preview?.status === 'email-mismatch'}
		{@render heading(`Join ${preview.householdName}`)}
		<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3 text-left">
			This invite was sent to {preview.emailHint}. Sign in with that address.
		</p>
		<Button href={signInHref('login')} data-sveltekit-reload class="w-full">
			Use a different account
		</Button>
	{:else if preview}
		{@render heading(`You've been invited to join ${preview.householdName}`)}
		{#if preview.dogNames}
			<p class="text-lg">
				to help care for <strong>{listFormat.format(preview.dogNames)}</strong>
			</p>
		{/if}
		<p class="text-muted-foreground">
			Plan training, log practice and keep on top of care together.
		</p>
		{#if !preview.signedIn}
			<!-- A server route, not a page: reload so the browser follows it to the provider. -->
			<Button href={signInHref()} data-sveltekit-reload size="lg" class="w-full">
				Sign in to accept
			</Button>
		{:else}
			{#if status === 'failed'}
				<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3 text-left">
					Couldn't join — check your connection.
				</p>
			{:else if status === 'too-many'}
				<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3 text-left">
					Too many attempts. Please wait a few minutes, then try again.
				</p>
			{:else if status === 'signed-out'}
				<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3 text-left">
					You've been signed out. Sign in again to accept.
				</p>
			{/if}
			{#if status === 'signed-out'}
				<Button href={signInHref()} data-sveltekit-reload size="lg" class="w-full">
					Sign in to accept
				</Button>
			{:else}
				<Button size="lg" class="w-full" disabled={status === 'joining'} onclick={accept}>
					{#if status === 'joining'}
						<Icon name="saving" class="animate-spin" />
						Joining…
					{:else if status === 'failed'}
						Retry
					{:else}
						Accept invite
					{/if}
				</Button>
			{/if}
		{/if}
	{/if}
</main>
