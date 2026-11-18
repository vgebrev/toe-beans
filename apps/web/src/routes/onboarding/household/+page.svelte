<script lang="ts">
	// J1 step 3. The time zone is the device's unless changed; every schedule is worked out in it.
	// Someone who was the last to leave a household can bring it back instead (architecture D18), for
	// 30 days, or delete it now (D38).
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Household, limits } from '@toe-beans/contracts';
	import NativeSelect from '#lib/components/form/NativeSelect.svelte';
	import Icon from '#lib/components/icon/Icon.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import LocalDate from '#lib/components/shell/LocalDate.svelte';
	import { createApiClient, problemStatus } from '#lib/api-client/index.js';
	import type { PageProps } from './$types';
	import { revealErrors } from '#lib/forms/reveal-errors.js';

	let { data }: PageProps = $props();

	const api = createApiClient((input, init) => fetch(input, init));

	let name = $state('');
	let timeZone = $state('');
	let zones = $state<string[]>([]);
	let status = $state<'idle' | 'saving' | 'failed' | 'signed-out'>('idle');
	let errors = $state<{ name?: string; timeZone?: string }>({});

	onMount(() => {
		timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		// A device can report a name the list spells differently, and it must stay selectable.
		zones = [...new Set([timeZone, ...Intl.supportedValuesOf('timeZone')])].sort();
	});

	let rejoining = $state<'idle' | 'saving' | 'failed'>('idle');
	let deleteOpen = $state(false);
	let deleting = $state<'idle' | 'working' | 'failed'>('idle');
	let deleted = $state(false);

	async function deleteFormer() {
		deleting = 'working';
		const result = await api.send('DELETE', '/household/former');
		// 404: already gone, from another tab or the daily clean-up.
		if (result.ok || problemStatus(result.error) === 404) {
			deleteOpen = false;
			deleted = true;
			return;
		}
		deleting = 'failed';
	}

	async function rejoin() {
		rejoining = 'saving';
		const result = await api.send('POST', '/household/former', { schema: Household });
		const taken = !result.ok && problemStatus(result.error) === 409;
		if (result.ok || taken) {
			await goto(resolve('/(app)'), { invalidateAll: true });
			return;
		}
		rejoining = 'failed';
	}

	// Never disabled for a missing field: a tap says what's missing.
	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (status === 'saving') return;
		const missing = {
			name: name.trim() === '' ? 'Enter a name for your household.' : undefined,
			timeZone: timeZone === '' ? 'Choose your time zone.' : undefined
		};
		if (missing.name || missing.timeZone) {
			errors = missing;
			return;
		}
		status = 'saving';
		errors = {};
		const result = await api.send('POST', '/household', {
			body: { name, timeZone },
			schema: Household
		});
		if (result.ok) {
			await goto(resolve('/onboarding/dog'), { invalidateAll: true });
			return;
		}
		const { error } = result;
		if (error.kind === 'problem') {
			const { status: code, errors: fields } = error.problem;
			if (code === 400) {
				errors = { name: fields?.['name']?.[0], timeZone: fields?.['timeZone']?.[0] };
				status = 'idle';
				return;
			}
			if (code === 401) {
				status = 'signed-out';
				return;
			}
			// Already in one, perhaps from another tab: there's nothing left to do here.
			if (code === 409) {
				await goto(resolve('/(app)'), { invalidateAll: true });
				return;
			}
		}
		status = 'failed';
	}
</script>

<svelte:head><title>Create your household · Toe Beans</title></svelte:head>

<h1 class="font-display text-[1.75rem] leading-tight font-semibold">Create your household</h1>
<p class="text-muted-foreground">Everyone who looks after your dog shares it.</p>

{#if deleted}
	<p aria-live="polite" class="text-sm text-muted-foreground">Household deleted.</p>
{:else if data.former}
	<section class="flex flex-col gap-3 rounded-2xl border border-border px-4 py-4">
		<p>
			You were the last to leave {data.former.name}. Rejoining brings it back as you left it.
			Otherwise it's deleted on
			<LocalDate iso={data.former.keptUntil} timeZone={timeZone || 'UTC'} />.
		</p>
		{#if rejoining === 'failed'}
			<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3">
				Couldn't rejoin — check your connection.
			</p>
		{/if}
		<Button
			type="button"
			variant="outline"
			class="w-full"
			disabled={rejoining === 'saving'}
			onclick={rejoin}
		>
			{#if rejoining === 'saving'}
				<Icon name="saving" class="animate-spin" />
				Rejoining…
			{:else if rejoining === 'failed'}
				Retry
			{:else}
				Rejoin {data.former.name}
			{/if}
		</Button>
		<Button
			type="button"
			variant="ghost"
			class="w-full text-destructive"
			onclick={() => {
				deleting = 'idle';
				deleteOpen = true;
			}}
		>
			Delete it now
		</Button>
	</section>

	<Sheet.Root bind:open={deleteOpen}>
		<Sheet.Content side="bottom" class="mx-auto flex max-w-xl flex-col gap-4 px-4 pt-6 pb-4">
			<Sheet.Header class="p-0 pr-12 text-left">
				<Sheet.Title class="font-display text-xl font-semibold">
					Delete {data.former.name} for good?
				</Sheet.Title>
				<Sheet.Description class="text-base">
					Its dogs, photos, training and care history and cues are all deleted, and can't be brought
					back.
				</Sheet.Description>
			</Sheet.Header>
			{#if deleting === 'failed'}
				<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3 text-base">
					Couldn't delete — check your connection.
				</p>
			{/if}
			<Button
				type="button"
				variant="destructive"
				class="w-full"
				disabled={deleting === 'working'}
				onclick={deleteFormer}
			>
				{#if deleting === 'working'}
					<Icon name="saving" class="animate-spin" />
					Deleting…
				{:else if deleting === 'failed'}
					Retry
				{:else}
					Delete household
				{/if}
			</Button>
		</Sheet.Content>
	</Sheet.Root>
{/if}

<form class="flex flex-col gap-5" onsubmit={save} novalidate {@attach revealErrors}>
	<div class="flex flex-col gap-2">
		<Label for="household-name" class="font-bold">Household name</Label>
		<Input
			id="household-name"
			maxlength={limits.householdName}
			bind:value={name}
			oninput={() => (errors = { ...errors, name: undefined })}
			aria-invalid={errors.name ? 'true' : undefined}
			aria-describedby={errors.name ? 'household-name-error' : undefined}
		/>
		{#if errors.name}
			<p id="household-name-error" class="text-sm text-destructive">{errors.name}</p>
		{/if}
	</div>

	<div class="flex flex-col gap-2">
		<Label for="time-zone" class="font-bold">Time zone</Label>
		<NativeSelect
			id="time-zone"
			bind:value={timeZone}
			disabled={zones.length === 0}
			aria-invalid={errors.timeZone ? 'true' : undefined}
			aria-describedby={errors.timeZone ? 'time-zone-error' : 'time-zone-hint'}
		>
			{#each zones as zone (zone)}
				<option value={zone}>{zone.replaceAll('_', ' ')}</option>
			{/each}
		</NativeSelect>
		{#if errors.timeZone}
			<p id="time-zone-error" class="text-sm text-destructive">{errors.timeZone}</p>
		{:else}
			<p id="time-zone-hint" class="text-sm text-muted-foreground">
				Training and care reminders follow this time zone.
			</p>
		{/if}
	</div>

	{#if status === 'failed'}
		<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3">
			Couldn't save — check your connection.
		</p>
	{:else if status === 'signed-out'}
		<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3">
			You've been signed out. Sign in again, then create your household.
		</p>
	{/if}

	<Button type="submit" class="w-full" disabled={status === 'saving'}>
		{#if status === 'saving'}
			<Icon name="saving" class="animate-spin" />
			Saving…
		{:else if status === 'failed'}
			Retry
		{:else}
			Create household
		{/if}
	</Button>
</form>
