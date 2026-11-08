<script lang="ts">
	// J1 step 4: the household's first dog, photo first. Not skippable: every record belongs to a
	// dog. Then the invite step.
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import DogForm from '#lib/components/dogs/DogForm.svelte';
	import { todayIn } from '#lib/dogs/age.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>Add your dog · Toe Beans</title></svelte:head>

<h1 class="font-display text-[1.75rem] leading-tight font-semibold">Add your dog</h1>
<p class="text-muted-foreground">You can add more dogs later from More.</p>

<DogForm
	today={todayIn(data.household?.timeZone ?? 'UTC')}
	submitLabel="Add dog"
	onsaved={() => goto(resolve('/onboarding/invite'), { invalidateAll: true })}
/>
