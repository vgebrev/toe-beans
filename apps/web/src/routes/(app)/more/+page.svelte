<script lang="ts">
	import { version } from '$app/env';
	import { resolve } from '$app/paths';
	import DisplayNameForm from '#lib/components/account/DisplayNameForm.svelte';
	import Logo from '#lib/components/Logo.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import ThemeSwitch from '#lib/components/shell/ThemeSwitch.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>More · Toe Beans</title></svelte:head>

<PageHeader title="More" />
<div class="flex flex-col gap-8 px-4 pt-2">
	<!-- Dogs, the exercise library, cues, household and notifications join this page as their
	     slices land (ui.md §2.1). -->
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
		<form method="POST" action={resolve('/auth/sign-out')}>
			<Button type="submit" variant="outline" class="w-full">Sign out</Button>
		</form>
	</section>

	<footer class="flex flex-col items-center gap-1 pt-4 text-sm text-muted-foreground">
		<Logo wordmark size={28} />
		<p>Version {version}</p>
	</footer>
</div>
