<script lang="ts">
	// J1 step 2: the name from sign-in is only the start of the address for an email sign-up.
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import DisplayNameForm from '#lib/components/account/DisplayNameForm.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>Your name · Toe Beans</title></svelte:head>

<h1 class="font-display text-[1.75rem] leading-tight font-semibold">
	What should your household call you?
</h1>
{#if data.me}
	<DisplayNameForm
		displayName={data.me.profile.displayName}
		etag={data.me.etag}
		onconfirmed={() => goto(resolve('/onboarding/household'))}
	/>
{:else}
	<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3">
		Couldn't load your name. You can change it later on More.
	</p>
	<Button href={resolve('/onboarding/household')} class="w-full">Continue</Button>
{/if}
