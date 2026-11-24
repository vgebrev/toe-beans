<script lang="ts">
	// The terms, accepted with the age confirmation (backlog S19.1, ui.md J1). Outside the app
	// shell: the person may have no household yet. Someone who won't agree can sign out, or delete
	// their account: from More if they're in a household (it stays open to them), or here if not.
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Icon from '#lib/components/icon/Icon.svelte';
	import Logo from '#lib/components/Logo.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import { createApiClient, problemStatus } from '#lib/api-client/index.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const api = createApiClient((input, init) => fetch(input, init));

	const copy = $derived(
		{
			new: {
				title: 'Before you start',
				text: 'Toe Beans is for adults. Please read the terms of service and the privacy policy.'
			},
			member: {
				title: 'Please accept our terms',
				text: "We now ask everyone to accept the terms of service and confirm they're 18 or older."
			},
			updated: {
				title: "We've updated our terms",
				text: `The terms of service changed on ${data.updated}. Please read them and accept them to carry on.`
			}
		}[data.reason]
	);

	let agreed = $state(false);
	let status = $state<'idle' | 'saving' | 'failed' | 'changed'>('idle');

	async function accept() {
		status = 'saving';
		const result = await api.send('POST', '/me/terms', { body: { version: data.version } });
		if (result.ok) {
			// Every load the gate ran in must see the acceptance. `returnTo` is a path the server
			// already checked as our own (safeReturnTo), not a route ID resolve() could build.
			// eslint-disable-next-line svelte/no-navigation-without-resolve
			await goto(data.returnTo, { invalidateAll: true });
			return;
		}
		if (problemStatus(result.error) === 409) {
			// The terms changed since the page loaded: show the new date and ask again.
			agreed = false;
			status = 'changed';
			await invalidateAll();
			return;
		}
		status = 'failed';
	}

	let deleteOpen = $state(false);
	let deleting = $state<'idle' | 'working' | 'unavailable' | 'failed'>('idle');
	let signOutForm = $state<HTMLFormElement>();

	async function deleteAccount() {
		deleting = 'working';
		const result = await api.send('DELETE', '/me');
		if (!result.ok) {
			deleting = problemStatus(result.error) === 503 ? 'unavailable' : 'failed';
			return;
		}
		signOutForm?.submit();
	}
</script>

<svelte:head><title>Terms · Toe Beans</title></svelte:head>

<main class="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-5 px-6 py-8">
	<div class="flex justify-center"><Logo wordmark size={48} /></div>
	<h1 class="font-display text-[1.75rem] leading-tight font-semibold">{copy.title}</h1>
	<p class="text-muted-foreground">{copy.text}</p>
	<p class="flex flex-col">
		<a href={resolve('/terms')} class="flex min-h-12 items-center font-bold underline">
			Terms of service
		</a>
		<a href={resolve('/privacy')} class="flex min-h-12 items-center font-bold underline">
			Privacy policy
		</a>
	</p>

	<label
		class="flex min-h-12 cursor-pointer items-start gap-3 rounded-2xl border border-border bg-soft px-4 py-3"
	>
		<input
			type="checkbox"
			bind:checked={agreed}
			class="mt-0.5 size-6 shrink-0 accent-primary"
			aria-describedby="agree-detail"
		/>
		<span>
			<span class="font-bold">I'm 18 or older and I accept the terms of service.</span>
			<span id="agree-detail" class="block text-sm text-muted-foreground">
				I've read the privacy policy, which says how my information is used.
			</span>
		</span>
	</label>

	{#if status === 'failed'}
		<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3">
			Couldn't save that — check your connection and try again.
		</p>
	{:else if status === 'changed'}
		<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3">
			The terms changed while this page was open. Please read them again.
		</p>
	{/if}

	<Button size="lg" class="w-full" disabled={!agreed || status === 'saving'} onclick={accept}>
		{#if status === 'saving'}
			<Icon name="saving" class="animate-spin" />
			Saving…
		{:else if status === 'failed'}
			Retry
		{:else}
			Continue
		{/if}
	</Button>

	<section class="flex flex-col gap-1 text-sm text-muted-foreground">
		<p>Don't want to accept?</p>
		<form method="POST" action={resolve('/auth/sign-out')}>
			<Button type="submit" variant="outline" class="w-full">Sign out</Button>
		</form>
		{#if data.reason === 'new'}
			<Button
				variant="ghost"
				class="w-full text-destructive"
				onclick={() => {
					deleting = 'idle';
					deleteOpen = true;
				}}
			>
				Delete my account
			</Button>
		{:else}
			<p>
				To delete your account instead, go to
				<a href={resolve('/(app)/more')} class="underline">More</a>.
			</p>
		{/if}
	</section>
</main>

{#if data.reason === 'new'}
	<Sheet.Root bind:open={deleteOpen}>
		<Sheet.Content side="bottom" class="mx-auto flex max-w-xl flex-col gap-4 px-4 pt-6 pb-4">
			<Sheet.Header class="p-0 pr-12 text-left">
				<Sheet.Title class="font-display text-xl font-semibold">
					Delete your account for good?
				</Sheet.Title>
				<Sheet.Description class="text-base">
					Your account and anything only you could reach are deleted, and you're signed out. This
					can't be undone.
				</Sheet.Description>
			</Sheet.Header>
			{#if deleting === 'unavailable'}
				<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3 text-base">
					Couldn't reach the sign-in service, so nothing was deleted. Try again in a minute.
				</p>
			{:else if deleting === 'failed'}
				<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3 text-base">
					Couldn't delete your account — check your connection.
				</p>
			{/if}
			<Button
				type="button"
				variant="destructive"
				class="w-full"
				disabled={deleting === 'working'}
				onclick={deleteAccount}
			>
				{#if deleting === 'working'}
					<Icon name="saving" class="animate-spin" />
					Deleting…
				{:else if deleting === 'idle'}
					Delete account
				{:else}
					Retry
				{/if}
			</Button>
		</Sheet.Content>
	</Sheet.Root>
	<!-- Submitted once the account is gone: ends the cookie and the provider's session. -->
	<form bind:this={signOutForm} method="POST" action={resolve('/auth/sign-out')} hidden></form>
{/if}
