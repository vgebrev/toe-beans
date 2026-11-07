<script lang="ts">
	// Inviting someone by shareable link or email (ui.md J1 step 5, §4.8). The link only exists in
	// this response, so it stays on screen until they leave. Text someone typed survives a failed
	// send (NFR-04).
	import { CreatedInvitation, Invitation } from '@toe-beans/contracts';
	import Icon from '#lib/components/icon/Icon.svelte';
	import LocalDate from '#lib/components/shell/LocalDate.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { createApiClient, type ApiError } from '#lib/api-client/index.js';

	interface Props {
		householdName: string;
		timeZone: string;
		/** A new invitation exists, so a list of them is out of date. */
		oncreated?: () => void;
	}

	let { householdName, timeZone, oncreated }: Props = $props();

	const api = createApiClient((input, init) => fetch(input, init));

	const NO_CONNECTION = "Couldn't reach Toe Beans — check your connection.";
	const messageFor = (error: ApiError) =>
		error.kind === 'problem' ? (error.problem.detail ?? error.problem.title) : NO_CONNECTION;

	let link = $state<CreatedInvitation | null>(null);
	let linkStatus = $state<'idle' | 'creating' | 'copied'>('idle');
	let linkError = $state<string | null>(null);

	async function createLink() {
		linkStatus = 'creating';
		linkError = null;
		const result = await api.send('POST', '/household/invitations', {
			body: { kind: 'link' },
			schema: CreatedInvitation
		});
		linkStatus = 'idle';
		if (!result.ok) {
			linkError = messageFor(result.error);
			return;
		}
		link = result.data;
		oncreated?.();
	}

	async function share() {
		if (!link) return;
		const text = `Join ${householdName} on Toe Beans`;
		if (navigator.share) {
			try {
				await navigator.share({ title: 'Toe Beans', text, url: link.url });
				return;
			} catch (error) {
				// They closed the share sheet.
				if (error instanceof DOMException && error.name === 'AbortError') return;
			}
		}
		try {
			await navigator.clipboard.writeText(link.url);
			linkStatus = 'copied';
		} catch {
			linkError = "Couldn't copy the link. Select it above and copy it yourself.";
		}
	}

	let email = $state('');
	let emailStatus = $state<'idle' | 'sending'>('idle');
	let emailFieldError = $state<string | null>(null);
	let emailError = $state<string | null>(null);
	let sentTo = $state<string | null>(null);

	async function sendEmail(event: SubmitEvent) {
		event.preventDefault();
		if (email.trim() === '' || emailStatus === 'sending') return;
		emailStatus = 'sending';
		emailFieldError = null;
		emailError = null;
		sentTo = null;
		const result = await api.send('POST', '/household/invitations', {
			body: { kind: 'email', email: email.trim() },
			schema: Invitation
		});
		emailStatus = 'idle';
		if (result.ok) {
			sentTo = result.data.email ?? email.trim();
			email = '';
			oncreated?.();
			return;
		}
		if (result.error.kind === 'problem' && result.error.problem.status === 400) {
			emailFieldError =
				result.error.problem.errors?.['email']?.[0] ?? 'Enter a valid email address.';
			return;
		}
		emailError = messageFor(result.error);
	}
</script>

<div class="flex flex-col gap-6">
	<section class="flex flex-col gap-3" aria-label="Share a link">
		{#if link}
			<Label for="invite-link" class="font-bold">Invite link</Label>
			<Input id="invite-link" readonly value={link.url} onfocus={(e) => e.currentTarget.select()} />
			<p class="text-sm text-muted-foreground">
				Works once, until <LocalDate iso={link.expiresAt} {timeZone} />. Anyone with the link can
				use it, so send it only to the person you're inviting.
			</p>
			<Button type="button" class="w-full" onclick={share}>
				{linkStatus === 'copied' ? 'Copied' : 'Share link'}
			</Button>
			<Button type="button" variant="outline" class="w-full" onclick={createLink}>
				New link for someone else
			</Button>
		{:else}
			<Button
				type="button"
				class="w-full"
				disabled={linkStatus === 'creating'}
				onclick={createLink}
			>
				{#if linkStatus === 'creating'}
					<Icon name="saving" class="animate-spin" />
					Creating…
				{:else}
					Create an invite link
				{/if}
			</Button>
		{/if}
		{#if linkError}
			<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3">{linkError}</p>
		{/if}
	</section>

	<form class="flex flex-col gap-2" onsubmit={sendEmail} novalidate>
		<Label for="invite-email" class="font-bold">Or send an email invite</Label>
		<Input
			id="invite-email"
			type="email"
			inputmode="email"
			autocomplete="off"
			bind:value={email}
			oninput={() => (emailFieldError = null)}
			aria-invalid={emailFieldError ? 'true' : undefined}
			aria-describedby={emailFieldError ? 'invite-email-error' : undefined}
		/>
		{#if emailFieldError}
			<p id="invite-email-error" class="text-sm text-destructive">{emailFieldError}</p>
		{/if}
		{#if emailError}
			<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3">{emailError}</p>
		{/if}
		<Button
			type="submit"
			variant="outline"
			class="w-full"
			disabled={email.trim() === '' || emailStatus === 'sending'}
		>
			{#if emailStatus === 'sending'}
				<Icon name="saving" class="animate-spin" />
				Sending…
			{:else if emailError}
				Retry
			{:else}
				Send invite
			{/if}
		</Button>
		<p aria-live="polite" class="flex items-center gap-1 text-sm text-muted-foreground">
			{#if sentTo}
				<Icon name="done" size={20} />
				Invite sent to {sentTo}
			{/if}
		</p>
	</form>
</div>
