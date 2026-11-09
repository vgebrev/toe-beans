<script lang="ts">
	// Members and pending invitations (ui.md §4.8). Revoking, removing and leaving are each confirmed
	// in a sheet naming what happens (§5.3), which stays open with a retry if the request fails (§5.2).
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { Invitation, Member } from '@toe-beans/contracts';
	import InviteActions from '#lib/components/household/InviteActions.svelte';
	import Icon from '#lib/components/icon/Icon.svelte';
	import LocalDate from '#lib/components/shell/LocalDate.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import { createApiClient } from '#lib/api-client/index.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const api = createApiClient((input, init) => fetch(input, init));
	const roles = { owner: 'Owner', caregiver: 'Caregiver' };
	const describe = (invitation: Invitation) =>
		invitation.email ? `the invite for ${invitation.email}` : 'this invite link';

	type Action =
		| { kind: 'revoke'; invitation: Invitation }
		| { kind: 'remove'; member: Member }
		| { kind: 'promote'; member: Member }
		| { kind: 'step-down'; member: Member }
		| { kind: 'leave'; member: Member };

	let action = $state<Action | null>(null);
	let sheetOpen = $state(false);
	let status = $state<'idle' | 'working' | 'failed'>('idle');
	let notice = $state<string | null>(null);

	const you = $derived(data.details?.members.find((m) => m.you));
	const others = $derived(data.details?.members.filter((m) => !m.you) ?? []);

	function leaveDescription() {
		const household = data.household.name;
		const [next] = others;
		if (!next) {
			return `Nobody will be left in ${household}, so it's deactivated and its pending invites stop working. You can rejoin it later.`;
		}
		const back = "You'll need a new invite to come back.";
		const lastOwner = you?.role === 'owner' && !others.some((m) => m.role === 'owner');
		return lastOwner ? `${next.displayName} becomes the owner. ${back}` : back;
	}

	const sheet = $derived.by(() => {
		switch (action?.kind) {
			case 'remove':
				return {
					title: `Remove ${action.member.displayName}?`,
					description: `They'll lose access to ${data.household.name}, and invites they sent or were sent stop working. You can invite them back later.`,
					confirm: `Remove ${action.member.displayName}`,
					working: 'Removing…',
					failed: "Couldn't remove them — check your connection."
				};
			case 'promote':
				return {
					title: `Make ${action.member.displayName} an owner?`,
					description: `They'll be able to remove caregivers, revoke any invite and make others owners. Owners can't remove each other, so you can't undo this: only they can step down.`,
					confirm: `Make ${action.member.displayName} an owner`,
					working: 'Saving…',
					failed: "Couldn't save — check your connection."
				};
			case 'step-down':
				return {
					title: 'Step down as owner?',
					description: `You'll stay in ${data.household.name} as a caregiver. Another owner can make you an owner again.`,
					confirm: 'Step down',
					working: 'Saving…',
					failed: "Couldn't save — check your connection."
				};
			case 'leave':
				return {
					title: `Leave ${data.household.name}?`,
					description: leaveDescription(),
					confirm: 'Leave household',
					working: 'Leaving…',
					failed: "Couldn't leave — check your connection."
				};
			default:
				return {
					title: 'Revoke invite?',
					description: action
						? `Nobody will be able to join with ${describe(action.invitation)}.`
						: '',
					confirm: 'Revoke invite',
					working: 'Revoking…',
					failed: "Couldn't revoke — check your connection."
				};
		}
	});

	function ask(next: Action) {
		action = next;
		status = 'idle';
		notice = null;
		sheetOpen = true;
	}

	function send(current: Action) {
		if (current.kind === 'revoke') {
			const { id, etag } = current.invitation;
			return api.send('DELETE', `/household/invitations/${id}`, { ifMatch: etag });
		}
		const path = `/household/members/${current.member.id}`;
		if (current.kind === 'promote' || current.kind === 'step-down') {
			const role = current.kind === 'promote' ? 'owner' : 'caregiver';
			return api.send('PATCH', path, { body: { role }, ifMatch: data.etag });
		}
		return api.send('DELETE', path, { ifMatch: data.etag });
	}

	const done = {
		revoke: () => 'Invite revoked',
		remove: (name: string) => `${name} removed`,
		promote: (name: string) => `${name} is now an owner`,
		'step-down': () => "You've stepped down as owner"
	};

	async function confirm() {
		if (!action) return;
		status = 'working';
		const current = action;
		const result = await send(current);
		if (result.ok) {
			sheetOpen = false;
			if (current.kind === 'leave') {
				await goto(resolve('/onboarding/household'), { invalidateAll: true });
				return;
			}
			notice = done[current.kind](current.kind === 'revoke' ? '' : current.member.displayName);
			await invalidateAll();
			return;
		}
		const code = result.error.kind === 'problem' ? result.error.problem.status : 0;
		if (code === 412 || code === 404) {
			// Changed since this page loaded: show what's true now, and let them look again.
			sheetOpen = false;
			notice =
				current.kind === 'revoke'
					? 'That invite changed a moment ago, so nothing was revoked. Check the list below.'
					: 'The household changed a moment ago, so nothing was done. Check the members below.';
			await invalidateAll();
			return;
		}
		status = 'failed';
	}
</script>

<svelte:head><title>Household · Toe Beans</title></svelte:head>

<PageHeader title={data.household.name}>
	<a href={resolve('/(app)/more')} class="flex min-h-12 items-center gap-1 self-start font-bold">
		<Icon name="back" />
		More
	</a>
</PageHeader>

<div class="flex flex-col gap-8 px-4 pt-2">
	<p aria-live="polite" class="text-sm text-muted-foreground empty:hidden">{notice ?? ''}</p>

	<section aria-labelledby="members" class="flex flex-col gap-3">
		<h2 id="members" class="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">
			Members
		</h2>
		{#if data.details}
			<ul class="flex flex-col gap-2">
				{#each data.details.members as member (member.id)}
					<li
						class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border px-4 py-3"
					>
						<span class="flex min-w-0 flex-col">
							<span class="truncate font-bold">
								{member.displayName}{member.you ? ' (you)' : ''}
							</span>
							<span class="text-sm text-muted-foreground">{roles[member.role]}</span>
						</span>
						<span class="flex flex-wrap gap-2 empty:hidden">
							{#if member.canMakeOwner}
								<Button
									type="button"
									variant="outline"
									aria-label={`Make ${member.displayName} an owner`}
									onclick={() => ask({ kind: 'promote', member })}
								>
									Make owner
								</Button>
							{/if}
							{#if member.canRemove}
								<Button
									type="button"
									variant="outline"
									aria-label={`Remove ${member.displayName}`}
									onclick={() => ask({ kind: 'remove', member })}
								>
									Remove
								</Button>
							{/if}
							{#if member.canStepDown}
								<Button
									type="button"
									variant="outline"
									onclick={() => ask({ kind: 'step-down', member })}
								>
									Step down
								</Button>
							{/if}
						</span>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-muted-foreground">Couldn't load the members. Reload the page to try again.</p>
		{/if}
	</section>

	<section aria-labelledby="pending" class="flex flex-col gap-3">
		<h2 id="pending" class="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">
			Pending invites
		</h2>
		{#if !data.invitations}
			<p class="text-muted-foreground">Couldn't load the invites. Reload the page to try again.</p>
		{:else if data.invitations.length === 0}
			<p class="text-muted-foreground">No invites waiting.</p>
		{:else}
			<ul class="flex flex-col gap-2">
				{#each data.invitations as invitation (invitation.id)}
					<li
						class="flex items-center justify-between gap-3 rounded-2xl border border-border px-4 py-3"
					>
						<span class="flex min-w-0 flex-col">
							<span class="truncate font-bold">{invitation.email ?? 'Invite link'}</span>
							<span class="text-sm text-muted-foreground">
								From {invitation.invitedBy}, until
								<LocalDate iso={invitation.expiresAt} timeZone={data.household.timeZone} />
							</span>
						</span>
						{#if invitation.canRevoke}
							<Button
								type="button"
								variant="outline"
								onclick={() => ask({ kind: 'revoke', invitation })}
							>
								Revoke
							</Button>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section aria-labelledby="invite" class="flex flex-col gap-3">
		<h2 id="invite" class="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">
			Invite a caregiver
		</h2>
		<InviteActions
			householdName={data.household.name}
			timeZone={data.household.timeZone}
			oncreated={() => invalidateAll()}
		/>
	</section>

	{#if you}
		<Button
			type="button"
			variant="outline"
			class="w-full"
			onclick={() => you && ask({ kind: 'leave', member: you })}
		>
			Leave household
		</Button>
	{/if}
</div>

<Sheet.Root bind:open={sheetOpen}>
	<Sheet.Content side="bottom" class="mx-auto max-w-xl px-4 pt-6 pb-4">
		<Sheet.Header class="p-0 pr-12 text-left">
			<Sheet.Title class="font-display text-xl font-semibold">{sheet.title}</Sheet.Title>
			<Sheet.Description class="text-base">{sheet.description}</Sheet.Description>
		</Sheet.Header>
		{#if status === 'failed'}
			<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3 text-base">
				{sheet.failed}
			</p>
		{/if}
		<Button
			type="button"
			variant={action?.kind === 'promote' ? 'default' : 'destructive'}
			class="w-full"
			disabled={status === 'working'}
			onclick={confirm}
		>
			{#if status === 'working'}
				<Icon name="saving" class="animate-spin" />
				{sheet.working}
			{:else if status === 'failed'}
				Retry
			{:else}
				{sheet.confirm}
			{/if}
		</Button>
	</Sheet.Content>
</Sheet.Root>
