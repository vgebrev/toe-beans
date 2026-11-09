<script lang="ts">
	// Adding another dog (FR-02, scenario 2): the same form as onboarding's (ui.md J1 step 4).
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import DogForm from '#lib/components/dogs/DogForm.svelte';
	import Icon from '#lib/components/icon/Icon.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import { todayIn } from '#lib/dogs/age.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>Add a dog · Toe Beans</title></svelte:head>

<PageHeader title="Add a dog">
	<a href={resolve('/(app)/dogs')} class="flex min-h-12 items-center gap-1 self-start font-bold">
		<Icon name="back" />
		Dogs
	</a>
</PageHeader>

<div class="px-4 pt-2">
	<DogForm
		today={todayIn(data.household.timeZone)}
		submitLabel="Add dog"
		onsaved={(dog) => goto(resolve('/(app)/dogs/[id]', { id: dog.id }), { invalidateAll: true })}
	/>
</div>
