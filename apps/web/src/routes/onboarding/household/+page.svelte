<script lang="ts">
	// J1 step 3. The time zone is the device's unless changed; every schedule is worked out in it.
	// Someone who was the last to leave a household can bring it back instead (architecture D18).
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Household } from '@toe-beans/contracts';
	import Icon from '#lib/components/icon/Icon.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { createApiClient } from '#lib/api-client/index.js';
	import type { PageProps } from './$types';

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

	async function rejoin() {
		rejoining = 'saving';
		const result = await api.send('POST', '/household/former', { schema: Household });
		const taken =
			!result.ok && result.error.kind === 'problem' && result.error.problem.status === 409;
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

{#if data.former}
	<section class="flex flex-col gap-3 rounded-2xl border border-border px-4 py-4">
		<p>You were the last to leave {data.former.name}. Rejoining brings it back as you left it.</p>
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
	</section>
{/if}

<form class="flex flex-col gap-5" onsubmit={save} novalidate>
	<div class="flex flex-col gap-2">
		<Label for="household-name" class="font-bold">Household name</Label>
		<Input
			id="household-name"
			maxlength={100}
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
		<select
			id="time-zone"
			bind:value={timeZone}
			disabled={zones.length === 0}
			aria-invalid={errors.timeZone ? 'true' : undefined}
			aria-describedby={errors.timeZone ? 'time-zone-error' : 'time-zone-hint'}
			class="h-12 w-full min-w-0 rounded-xl border border-input bg-background px-4 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
		>
			{#each zones as zone (zone)}
				<option value={zone}>{zone.replaceAll('_', ' ')}</option>
			{/each}
		</select>
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
