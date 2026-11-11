<script lang="ts">
	// A dog's profile (ui.md §4.5): the photo large, with Change photo, then name, age, time since
	// adoption and notes. Edit and Archive are in the overflow sheet; archiving is confirmed there
	// (§5.3) and can be undone. The Recent training, events and care sections arrive with S5–S10.
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Dog } from '@toe-beans/contracts';
	import DogAvatar from '#lib/components/dogs/DogAvatar.svelte';
	import DogPhotoSheet from '#lib/components/dogs/DogPhotoSheet.svelte';
	import Icon from '#lib/components/icon/Icon.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import { createApiClient } from '#lib/api-client/index.js';
	import { adoptedText, ageText, todayIn } from '#lib/dogs/age.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const api = createApiClient((input, init) => fetch(input, init));
	const today = $derived(todayIn(data.household.timeZone));

	type Status = 'idle' | 'working' | 'failed' | 'conflict';
	let notice = $state<string | null>(null);

	let photoOpen = $state(false);

	let menuOpen = $state(false);
	let confirming = $state(false);
	let archiveStatus = $state<Status>('idle');

	function openMenu() {
		confirming = false;
		archiveStatus = 'idle';
		menuOpen = true;
	}

	/** A 412 means it changed elsewhere: close, reload, and say so above the fresh profile. */
	async function conflicted(close: () => void) {
		close();
		notice = `${data.dog?.name ?? 'This dog'} was changed somewhere else, so nothing was saved. This is the latest version.`;
		await invalidateAll();
	}

	/** Resolves to a message for the sheet, or null once it can close. */
	async function savePhoto(photo: Blob): Promise<string | null> {
		if (!data.dog) return null;
		const form = new FormData();
		form.set('photo', photo, 'photo.jpg');
		const result = await api.send('PUT', `/dogs/${data.dog.id}/photo`, {
			form,
			ifMatch: data.dog.etag,
			schema: Dog
		});
		if (result.ok) {
			notice = 'Photo changed.';
			await invalidateAll();
			return null;
		}
		const problem = result.error.kind === 'problem' ? result.error.problem : null;
		if (problem?.status === 412) {
			await conflicted(() => (photoOpen = false));
			return null;
		}
		if (problem?.status === 400) return problem.errors?.['photo']?.[0] ?? 'Choose another photo.';
		if (problem?.status === 401) return "You've been signed out. Sign in again, then save.";
		return "Couldn't save — check your connection, then try again.";
	}

	async function setArchived(archived: boolean) {
		if (!data.dog) return;
		archiveStatus = 'working';
		const result = await api.send('PATCH', `/dogs/${data.dog.id}`, {
			body: { archived },
			ifMatch: data.dog.etag,
			schema: Dog
		});
		if (result.ok) {
			menuOpen = false;
			archiveStatus = 'idle';
			notice = archived
				? `${data.dog.name} is archived. Their history stays, and you can bring them back here.`
				: `${data.dog.name} is back.`;
			await invalidateAll();
			return;
		}
		const problem = result.error.kind === 'problem' ? result.error.problem : null;
		if (problem?.status === 412) return conflicted(() => (menuOpen = false));
		archiveStatus = 'failed';
	}
</script>

<svelte:head><title>{data.dog?.name ?? 'Dog'} · Toe Beans</title></svelte:head>

<PageHeader title={data.dog?.name ?? 'Dog'}>
	<div class="flex items-center justify-between">
		<a href={resolve('/(app)/dogs')} class="flex min-h-12 items-center gap-1 font-bold">
			<Icon name="back" />
			Dogs
		</a>
		{#if data.dog}
			<Button
				variant="ghost"
				size="icon"
				aria-label="More for {data.dog.name}"
				aria-haspopup="dialog"
				onclick={openMenu}
			>
				<Icon name="overflow" />
			</Button>
		{/if}
	</div>
</PageHeader>

<div class="flex flex-col gap-6 px-4 pt-2">
	<p aria-live="polite" class="text-sm text-muted-foreground empty:hidden">{notice ?? ''}</p>

	{#if !data.dog}
		<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3">
			Couldn't load this dog — check your connection, then reload.
		</p>
	{:else}
		{@const dog = data.dog}
		{#if dog.archived}
			<section class="flex flex-col gap-3 rounded-2xl border border-border bg-soft px-4 py-3">
				<p>
					{dog.name} is archived: their history stays, but they're not in the dog switcher or on new records.
				</p>
				{#if archiveStatus === 'failed'}
					<p role="alert">Couldn't bring {dog.name} back — check your connection.</p>
				{/if}
				<Button
					variant="outline"
					disabled={archiveStatus === 'working'}
					onclick={() => setArchived(false)}
				>
					<Icon name={archiveStatus === 'working' ? 'saving' : 'unarchive'} />
					{archiveStatus === 'failed' ? 'Retry' : `Bring ${dog.name} back`}
				</Button>
			</section>
		{/if}

		<div class="flex flex-col items-center gap-3">
			<DogAvatar {dog} size={192} label="{dog.name}'s photo" />
			<Button variant="outline" aria-haspopup="dialog" onclick={() => (photoOpen = true)}>
				<Icon name="camera" />
				Change photo
			</Button>
		</div>

		<dl class="flex flex-col gap-4">
			<div class="flex flex-col">
				<dt class="text-sm text-muted-foreground">Age</dt>
				<dd class="font-bold">{dog.birth ? ageText(dog.birth, today) : 'Not known'}</dd>
			</div>
			{#if dog.adoptionDate}
				<div class="flex flex-col">
					<dt class="text-sm text-muted-foreground">Adoption</dt>
					<dd class="font-bold">{adoptedText(dog.adoptionDate, today)}</dd>
				</div>
			{/if}
			{#if dog.notes}
				<div class="flex flex-col">
					<dt class="text-sm text-muted-foreground">Notes</dt>
					<dd class="whitespace-pre-line">{dog.notes}</dd>
				</div>
			{/if}
		</dl>

		<Button href={resolve('/(app)/dogs/[id]/edit', { id: dog.id })} variant="outline">
			<Icon name="edit" />
			Edit details
		</Button>

		<DogPhotoSheet
			bind:open={photoOpen}
			title="Change photo"
			description="The new photo replaces {dog.name}'s current one for everyone in the household."
			confirmLabel="Save photo"
			onconfirm={savePhoto}
		/>

		<Sheet.Root bind:open={menuOpen}>
			<Sheet.Content side="bottom" class="mx-auto max-w-xl px-4 pt-6 pb-4">
				{#if confirming}
					<Sheet.Header class="p-0 pr-12 text-left">
						<Sheet.Title class="font-display text-xl font-semibold">Archive {dog.name}?</Sheet.Title
						>
						<Sheet.Description class="text-base">
							{dog.name}'s training, events and care stay in History. Their planned sessions are
							cancelled. They leave the dog switcher and can't be picked for new records. You can
							bring them back from their profile, and their sessions still ahead with them.
						</Sheet.Description>
					</Sheet.Header>
					{#if archiveStatus === 'failed'}
						<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3 text-base">
							Couldn't archive {dog.name} — check your connection.
						</p>
					{/if}
					<Button
						variant="destructive"
						class="w-full"
						disabled={archiveStatus === 'working'}
						onclick={() => setArchived(true)}
					>
						{#if archiveStatus === 'working'}
							<Icon name="saving" class="animate-spin" />
							Archiving…
						{:else if archiveStatus === 'failed'}
							Retry
						{:else}
							Archive {dog.name}
						{/if}
					</Button>
				{:else}
					<Sheet.Header class="p-0 pr-12 text-left">
						<Sheet.Title class="font-display text-xl font-semibold">{dog.name}</Sheet.Title>
						<Sheet.Description class="sr-only">Actions for {dog.name}</Sheet.Description>
					</Sheet.Header>
					<Button
						href={resolve('/(app)/dogs/[id]/edit', { id: dog.id })}
						variant="ghost"
						class="w-full justify-start"
					>
						<Icon name="edit" />
						Edit details
					</Button>
					{#if !dog.archived}
						<Button
							variant="ghost"
							class="w-full justify-start text-destructive"
							onclick={() => (confirming = true)}
						>
							<Icon name="archive" />
							Archive {dog.name}
						</Button>
					{/if}
				{/if}
			</Sheet.Content>
		</Sheet.Root>
	{/if}
</div>
