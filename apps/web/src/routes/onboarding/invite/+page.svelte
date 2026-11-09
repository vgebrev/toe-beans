<script lang="ts">
	// J1 step 5, skippable, after Add your dog. Reminders come after it with S12.
	import { resolve } from '$app/paths';
	import InviteActions from '#lib/components/household/InviteActions.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>Invite a caregiver · Toe Beans</title></svelte:head>

<h1 class="font-display text-[1.75rem] leading-tight font-semibold">Invite a caregiver</h1>
<p class="text-muted-foreground">
	Anyone else who looks after your dog can plan and log with you. You can also do this later from
	More.
</p>
{#if data.household}
	<InviteActions householdName={data.household.name} timeZone={data.household.timeZone} />
{/if}
<Button href={resolve('/(app)')} variant="ghost" class="w-full">Done for now</Button>
