<script lang="ts">
	import { version } from '$app/env';
	import { resolve } from '$app/paths';
	import DisplayNameForm from '#lib/components/account/DisplayNameForm.svelte';
	import Icon from '#lib/components/icon/Icon.svelte';
	import Logo from '#lib/components/Logo.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import ThemeSwitch from '#lib/components/shell/ThemeSwitch.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { unsubscribe } from '#lib/push/browser.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	/**
	 * Signing out stops this browser's reminders first: on a shared phone the next person
	 * shouldn't get them. The push service then refuses sends, and the server drops the device.
	 */
	let signingOut = false;
	async function signOut(event: SubmitEvent) {
		if (signingOut) return;
		event.preventDefault();
		signingOut = true;
		const form = event.currentTarget as HTMLFormElement;
		await Promise.race([
			unsubscribe().catch(() => undefined),
			new Promise((resolve) => setTimeout(resolve, 3000))
		]);
		form.submit();
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

	<section aria-labelledby="account" class="flex flex-col gap-3">
		<h2 id="account" class="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">
			Account
		</h2>
		{#if data.me}
			<DisplayNameForm displayName={data.me.profile.displayName} etag={data.me.etag} />
			<p class="flex flex-col">
				<span class="font-bold">Email</span>
				<span class="text-muted-foreground">{data.me.profile.email}</span>
			</p>
		{:else}
			<!-- The API didn't answer: show who's signed in, without an edit that can't save. -->
			<p class="flex flex-col">
				<span class="font-bold">{data.viewer.displayName}</span>
				<span class="text-muted-foreground">{data.viewer.email}</span>
			</p>
			<p class="text-sm text-muted-foreground">
				Couldn't load your account details. Reload the page to change your name.
			</p>
		{/if}
		<!-- A plain form POST: the server ends the session and sends the browser to the provider. -->
		<form method="POST" action={resolve('/auth/sign-out')} onsubmit={signOut}>
			<Button type="submit" variant="outline" class="w-full">Sign out</Button>
		</form>
	</section>

	<footer class="flex flex-col items-center gap-1 pt-4 text-sm text-muted-foreground">
		<Logo wordmark size={28} />
		<p>Version {version}</p>
	</footer>
</div>
