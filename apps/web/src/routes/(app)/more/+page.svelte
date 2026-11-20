<script lang="ts">
	import { version } from '$app/env';
	import { resolve } from '$app/paths';
	import DisplayNameForm from '#lib/components/account/DisplayNameForm.svelte';
	import { install } from '#lib/client/install.svelte.js';
	import Icon from '#lib/components/icon/Icon.svelte';
	import Logo from '#lib/components/Logo.svelte';
	import InstallOffer from '#lib/components/shell/InstallOffer.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import ThemeSwitch from '#lib/components/shell/ThemeSwitch.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import { unsubscribe } from '#lib/push/browser.js';
	import { createApiClient, problemStatus } from '#lib/api-client/index.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	/**
	 * Signing out stops this browser's reminders first: on a shared phone the next person
	 * shouldn't get them. The form then names the subscription, so the server forgets the device
	 * straight away rather than when a reminder to it fails (architecture D43).
	 */
	let signingOut = false;
	let everywhereOpen = $state(false);
	async function signOut(event: SubmitEvent) {
		if (signingOut) return;
		event.preventDefault();
		signingOut = true;
		const form = event.currentTarget as HTMLFormElement;
		const endpoint = await Promise.race([
			unsubscribe().catch(() => null),
			new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000))
		]);
		if (endpoint) {
			const field = Object.assign(document.createElement('input'), {
				type: 'hidden',
				name: 'endpoint',
				value: endpoint
			});
			form.append(field);
		}
		form.submit();
	}

	/**
	 * Deleting the account (architecture D38). Once it's gone the session is too, so this browser's
	 * reminders stop and the sign-out form finishes at the provider, as signing out does.
	 */
	const api = createApiClient((input, init) => fetch(input, init));
	let deleteOpen = $state(false);
	let deleting = $state<'idle' | 'working' | 'unavailable' | 'failed'>('idle');
	let signOutForm = $state<HTMLFormElement>();

	const deleteDescription = $derived.by(() => {
		const household = data.household.name;
		const others = data.members?.filter((m) => !m.you);
		if (!others) {
			return `Your account and reminders are deleted. If others share ${household}, you leave it and what you recorded stays for them, from "a former member". If nobody does, ${household} is deleted too, with its dogs, photos and history.`;
		}
		if (others.length === 0) {
			return `Your account and ${household}, with its dogs, photos, training and care history, are deleted for good, along with your reminders.`;
		}
		const you = data.members?.find((m) => m.you);
		const [next] = [...others].sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
		const handOver =
			you?.role === 'owner' && !others.some((m) => m.role === 'owner') && next
				? ` ${next.displayName} becomes the owner.`
				: '';
		const names = listFormat.format(others.map((m) => m.displayName));
		return `Your account and reminders are deleted, and you leave ${household}. What you recorded stays for ${names}, from "a former member".${handOver}`;
	});

	async function deleteAccount() {
		deleting = 'working';
		const result = await api.send('DELETE', '/me');
		if (!result.ok) {
			deleting = problemStatus(result.error) === 503 ? 'unavailable' : 'failed';
			return;
		}
		await Promise.race([
			unsubscribe().catch(() => undefined),
			new Promise((resolve) => setTimeout(resolve, 3000))
		]);
		signOutForm?.submit();
	}

	const listFormat = new Intl.ListFormat('en', { type: 'conjunction' });
	const dogsLine = $derived.by(() => {
		const names = data.dogs?.filter((d) => !d.archived).map((d) => d.name);
		if (!names) return 'Your dogs';
		return names.length > 0 ? listFormat.format(names) : 'Add your dog';
	});
</script>

<svelte:head><title>More · Toe Beans</title></svelte:head>

<PageHeader title="More" />
<div class="flex flex-col gap-8 px-4 pt-2">
	<div class="flex flex-col gap-3">
		<a
			href={resolve('/(app)/dogs')}
			class="flex min-h-12 items-center gap-3 rounded-2xl border border-border px-4 py-3"
		>
			<Icon name="dogs" class="text-primary" />
			<span class="flex min-w-0 flex-1 flex-col">
				<span class="font-bold">Dogs</span>
				<span class="truncate text-sm text-muted-foreground">{dogsLine}</span>
			</span>
			<Icon name="forward" class="text-muted-foreground" />
		</a>
		<a
			href={resolve('/(app)/library')}
			class="flex min-h-12 items-center gap-3 rounded-2xl border border-border px-4 py-3"
		>
			<Icon name="library" class="text-primary" />
			<span class="flex min-w-0 flex-1 flex-col">
				<span class="font-bold">Exercise library</span>
				<span class="truncate text-sm text-muted-foreground">Step-by-step training guides</span>
			</span>
			<Icon name="forward" class="text-muted-foreground" />
		</a>
		<a
			href={resolve('/(app)/cues')}
			class="flex min-h-12 items-center gap-3 rounded-2xl border border-border px-4 py-3"
		>
			<Icon name="cues" class="text-primary" />
			<span class="flex min-w-0 flex-1 flex-col">
				<span class="font-bold">Cue dictionary</span>
				<span class="truncate text-sm text-muted-foreground">The words everyone uses</span>
			</span>
			<Icon name="forward" class="text-muted-foreground" />
		</a>
		<a
			href={resolve('/(app)/household')}
			class="flex min-h-12 items-center gap-3 rounded-2xl border border-border px-4 py-3"
		>
			<Icon name="household" class="text-primary" />
			<span class="flex min-w-0 flex-1 flex-col">
				<span class="font-bold">Household & invites</span>
				<span class="truncate text-sm text-muted-foreground">{data.household.name}</span>
			</span>
			<Icon name="forward" class="text-muted-foreground" />
		</a>
		<a
			href={resolve('/(app)/settings/notifications')}
			class="flex min-h-12 items-center gap-3 rounded-2xl border border-border px-4 py-3"
		>
			<Icon name="notifications" class="text-primary" />
			<span class="flex min-w-0 flex-1 flex-col">
				<span class="font-bold">Notifications</span>
				<span class="truncate text-sm text-muted-foreground">Training reminders on this device</span
				>
			</span>
			<Icon name="forward" class="text-muted-foreground" />
		</a>
	</div>

	<section aria-labelledby="appearance" class="flex flex-col gap-3">
		<h2
			id="appearance"
			class="text-sm font-extrabold tracking-wide text-muted-foreground uppercase"
		>
			Appearance
		</h2>
		<ThemeSwitch />
	</section>

	<!-- Installed or not, on this device (ui.md §6.3). -->
	<section aria-labelledby="app" class="flex flex-col gap-3">
		<h2 id="app" class="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">
			App
		</h2>
		{#if install.state === 'app'}
			<p class="flex items-center gap-3">
				<Icon name="done" class="text-primary" />
				Installed: you're using the Toe Beans app.
			</p>
		{:else}
			<InstallOffer
				reason="Toe Beans isn't installed in this browser. Installed, it opens like an app, and reminders are more reliable."
			/>
		{/if}
	</section>

	<section aria-labelledby="account" class="flex flex-col gap-3">
		<h2 id="account" class="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">
			Account
		</h2>
		{#if data.me}
			<DisplayNameForm displayName={data.me.profile.displayName} etag={data.me.etag} />
			<p class="flex flex-col">
				<span class="font-bold">Email</span>
				<span class="break-all text-muted-foreground">{data.me.profile.email}</span>
			</p>
		{:else}
			<!-- The API didn't answer: show who's signed in, without an edit that can't save. -->
			<p class="flex flex-col">
				<span class="font-bold">{data.viewer.displayName}</span>
				<span class="break-all text-muted-foreground">{data.viewer.email}</span>
			</p>
			<p class="text-sm text-muted-foreground">
				Couldn't load your account details. Reload the page to change your name.
			</p>
		{/if}
		<!-- A plain form POST: the server ends the session and sends the browser to the provider. -->
		<form method="POST" action={resolve('/auth/sign-out')} onsubmit={signOut}>
			<Button type="submit" variant="outline" class="w-full">Sign out</Button>
		</form>
		<!-- For a lost phone or a shared computer left signed in (architecture D33, ui.md §4.7). -->
		<Button variant="ghost" class="w-full" onclick={() => (everywhereOpen = true)}>
			Sign out everywhere
		</Button>
		<Button
			variant="ghost"
			class="w-full text-destructive"
			onclick={() => {
				deleting = 'idle';
				deleteOpen = true;
			}}
		>
			Delete account
		</Button>
	</section>

	<Sheet.Root bind:open={deleteOpen}>
		<Sheet.Content side="bottom" class="mx-auto flex max-w-xl flex-col gap-4 px-4 pt-6 pb-4">
			<Sheet.Header class="p-0 pr-12 text-left">
				<Sheet.Title class="font-display text-xl font-semibold">
					Delete your account for good?
				</Sheet.Title>
				<Sheet.Description class="text-base">
					{deleteDescription} You'll be signed out on every device. This can't be undone.
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

	<Sheet.Root bind:open={everywhereOpen}>
		<Sheet.Content side="bottom" class="mx-auto flex max-w-xl flex-col gap-4 px-4 pt-6 pb-4">
			<Sheet.Header class="p-0 pr-12 text-left">
				<Sheet.Title class="font-display text-xl font-semibold">
					Sign out on every device?
				</Sheet.Title>
				<Sheet.Description class="text-base">
					You'll be signed out here and on every phone and browser you've used, and reminders stop
					on all of them. Sign in again where you still use Toe Beans, and turn reminders back on in
					Notifications.
				</Sheet.Description>
			</Sheet.Header>
			<form method="POST" action={resolve('/auth/sign-out')} onsubmit={signOut}>
				<input type="hidden" name="scope" value="everywhere" />
				<Button type="submit" variant="destructive" class="w-full">Sign out everywhere</Button>
			</form>
		</Sheet.Content>
	</Sheet.Root>

	<footer class="flex flex-col items-center gap-1 pt-4 text-sm text-muted-foreground">
		<Logo wordmark size={28} />
		<p>Version {version}</p>
		<p class="flex gap-4">
			<a href={resolve('/privacy')} class="flex min-h-12 items-center underline">Privacy policy</a>
			<a href={resolve('/terms')} class="flex min-h-12 items-center underline">Terms of service</a>
		</p>
	</footer>
</div>
