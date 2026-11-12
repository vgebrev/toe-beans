<script lang="ts">
	// Notifications (ui.md J7, FR-12): one *Push notifications* switch for this browser, with what
	// stops it (unsupported, blocked, failed) said under it; once on, what to be reminded of and
	// when, folded *Reminder tips* (battery steps and the delayed test), and the person's other
	// devices. Permission is asked for only when the switch is turned on. Saves say whether they
	// worked (NFR-04). Wording names no browser or device: reminders work wherever push does.
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import {
		PushDevice,
		ReminderPreference,
		ReminderSettings,
		ReminderTest,
		type TrainingLead
	} from '@toe-beans/contracts';
	import Icon from '#lib/components/icon/Icon.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';
	import { createApiClient } from '#lib/api-client/index.js';
	import {
		currentSubscription,
		deviceLabel,
		isInstalled,
		makerOf,
		phoneModel,
		pushSupport,
		subscribe,
		unsubscribe,
		type Maker
	} from '#lib/push/browser.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const api = createApiClient((input, init) => fetch(input, init));
	// svelte-ignore state_referenced_locally
	let settings = $state(data.settings);

	type Phase =
		'checking' | 'unsupported' | 'ask' | 'working' | 'on' | 'stopping' | 'denied' | 'failed';
	let phase = $state<Phase>('checking');
	let thisDeviceId = $state<string | null>(null);
	let installed = $state(true);
	let model = $state<string | undefined>(undefined);
	let maker = $state<Maker>('other');
	let tipsOpen = $state(false);
	let stopFailed = $state(false);
	let saving = $state<'idle' | 'saving' | 'saved' | 'failed'>('idle');
	let testing = $state<'idle' | 'starting' | 'failed'>('idle');
	let sheet = $state<{ id: string; label: string } | null>(null);
	let sheetOpen = $state(false);
	let removing = $state<'idle' | 'working' | 'failed'>('idle');

	const leads: { value: TrainingLead; label: string }[] = [
		{ value: 0, label: 'At the session time' },
		{ value: 5, label: '5 minutes before' },
		{ value: 10, label: '10 minutes before' },
		{ value: 15, label: '15 minutes before' },
		{ value: 30, label: '30 minutes before' },
		{ value: 60, label: '1 hour before' }
	];
	// The two acceptance makers have known paths; anything else gets the general advice.
	const steps: Record<Maker, { name: string; path: string[]; setting: string }> = {
		samsung: {
			name: 'Samsung',
			path: ['Settings', 'Apps', 'your browser', 'Battery'],
			setting: 'Unrestricted'
		},
		xiaomi: {
			name: 'Xiaomi, Redmi or POCO',
			path: ['Settings', 'Apps', 'Manage apps', 'your browser', 'Battery saver'],
			setting: 'No restrictions'
		},
		other: {
			name: 'Another device',
			path: ['Your device’s settings', 'your browser’s battery or background settings'],
			setting: 'let it run unrestricted (the wording varies)'
		}
	};

	const thisDevice = $derived(settings?.devices.find((d) => d.id === thisDeviceId));
	const others = $derived(settings?.devices.filter((d) => d.id !== thisDeviceId) ?? []);
	const test = $derived(
		settings?.test && (!settings.test.deviceId || settings.test.deviceId === thisDeviceId)
			? settings.test
			: null
	);

	const time = (iso: string) =>
		new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	const day = (iso: string) =>
		new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' });

	async function refresh() {
		const fresh = await api.get('/reminders', ReminderSettings);
		if (fresh.ok) settings = fresh.data;
	}

	/** Saves this browser's subscription, which also refreshes it on the server. */
	async function saveDevice(subscription: PushSubscription): Promise<boolean> {
		const saved = await api.send('PUT', '/reminders/devices', {
			body: { ...subscription.toJSON(), label: deviceLabel(model, navigator.userAgent) },
			schema: PushDevice
		});
		if (!saved.ok) return false;
		thisDeviceId = saved.data.id;
		await refresh();
		return true;
	}

	/** Works out which state this browser is in, without asking for anything. */
	async function check() {
		if (!settings) return;
		if (pushSupport() === 'unsupported') return void (phase = 'unsupported');
		if (Notification.permission === 'denied') return void (phase = 'denied');
		if (Notification.permission !== 'granted') return void (phase = 'ask');
		const subscription = await currentSubscription(settings.publicKey);
		if (!subscription) return void (phase = 'ask');
		phase = (await saveDevice(subscription)) ? 'on' : 'failed';
	}

	async function turnOn() {
		if (!settings || phase === 'working') return;
		phase = 'working';
		const result = await subscribe(settings.publicKey);
		if (!result.ok) return void (phase = result.reason === 'denied' ? 'denied' : 'failed');
		phase = (await saveDevice(result.subscription)) ? 'on' : 'failed';
	}

	/** Stops reminders here: forgets the device on the server, then unsubscribes the browser. */
	async function turnOff() {
		if (phase !== 'on') return;
		phase = 'stopping';
		stopFailed = false;
		if (thisDeviceId) {
			const removed = await api.send('DELETE', `/reminders/devices/${thisDeviceId}`);
			// Already gone counts as removed.
			if (
				!removed.ok &&
				!(removed.error.kind === 'problem' && removed.error.problem.status === 404)
			) {
				stopFailed = true;
				return void (phase = 'on');
			}
		}
		await unsubscribe().catch(() => undefined);
		thisDeviceId = null;
		phase = 'ask';
		await refresh();
	}

	async function savePreference(changes: Partial<ReminderPreference>) {
		if (!settings) return;
		const before = settings.preference;
		settings.preference = { ...before, ...changes };
		saving = 'saving';
		const saved = await api.send('PUT', '/reminders/preference', {
			body: changes,
			schema: ReminderPreference
		});
		if (saved.ok) {
			settings.preference = saved.data;
			saving = 'saved';
		} else {
			// Never show a choice as saved that wasn't (NFR-04).
			settings.preference = before;
			saving = 'failed';
		}
	}

	async function startTest() {
		if (!thisDeviceId || testing === 'starting') return;
		testing = 'starting';
		const started = await api.send('POST', '/reminders/test', {
			body: { deviceId: thisDeviceId },
			schema: ReminderTest
		});
		if (!started.ok) return void (testing = 'failed');
		testing = 'idle';
		if (settings) settings.test = started.data;
	}

	function confirmRemove(target: NonNullable<typeof sheet>) {
		removing = 'idle';
		sheet = target;
		sheetOpen = true;
	}

	async function remove() {
		if (!sheet || removing === 'working') return;
		removing = 'working';
		const removed = await api.send('DELETE', `/reminders/devices/${sheet.id}`);
		// Already gone counts as removed.
		if (
			!removed.ok &&
			!(removed.error.kind === 'problem' && removed.error.problem.status === 404)
		) {
			return void (removing = 'failed');
		}
		sheetOpen = false;
		removing = 'idle';
		await refresh();
	}

	onMount(() => {
		installed = isInstalled();
		// Folded, unless the person came from the test's notification (to see it arrived) or the
		// last test didn't arrive (the battery steps are what's needed).
		tipsOpen = data.testArrived || settings?.test?.overdue === true;
		void phoneModel().then((m) => {
			model = m;
			maker = makerOf(m);
			void check();
		});
		// Back from locking the screen for the test: show whether it arrived.
		const onVisible = () => {
			if (document.visibilityState === 'visible') void refresh();
		};
		document.addEventListener('visibilitychange', onVisible);
		return () => document.removeEventListener('visibilitychange', onVisible);
	});
</script>

<svelte:head><title>Notifications · Toe Beans</title></svelte:head>

<PageHeader title="Notifications">
	<a href={resolve('/(app)/more')} class="flex min-h-12 items-center gap-1 self-start font-bold">
		<Icon name="back" />
		More
	</a>
</PageHeader>

<div class="flex flex-col gap-6 px-4 pt-2 pb-8">
	{#if data.testArrived}
		<p class="flex items-center gap-3 rounded-2xl bg-soft px-4 py-3 font-bold">
			<Icon name="done" class="text-primary" />
			Reminders are working on this device.
		</p>
	{/if}

	{#if !settings}
		<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3">
			Couldn't load your reminder settings — check your connection, then reload.
		</p>
	{:else}
		<section aria-live="polite" class="flex flex-col gap-3">
			<div class="flex min-h-12 items-center justify-between gap-4">
				<label for="push" class="flex min-w-0 flex-1 flex-col">
					<span class="font-bold">Push notifications</span>
					<span class="text-sm text-muted-foreground">
						{#if phase === 'checking'}
							Checking this device…
						{:else if phase === 'working'}
							Turning on…
						{:else if phase === 'stopping'}
							Turning off…
						{:else if phase === 'on'}
							On for this device ({thisDevice?.label ?? 'this device'})
						{:else}
							Off on this device
						{/if}
					</span>
				</label>
				<Switch
					id="push"
					bind:checked={
						() => phase === 'on' || phase === 'working', (on) => void (on ? turnOn() : turnOff())
					}
					disabled={phase === 'checking' ||
						phase === 'unsupported' ||
						phase === 'denied' ||
						phase === 'working' ||
						phase === 'stopping'}
				/>
			</div>

			{#if phase === 'unsupported'}
				<p class="rounded-2xl border border-border bg-soft px-4 py-3">
					This browser can't show notifications. Try a different browser, or install Toe Beans and
					open it from there.
				</p>
			{:else if phase === 'ask' || phase === 'working'}
				<p class="text-muted-foreground">
					Get a notification on this device when a training session is due, even with Toe Beans
					closed. Reminders are a nudge: they can arrive a few minutes early, or late if the device
					is asleep.
				</p>
			{:else if phase === 'denied'}
				<div class="flex flex-col gap-3 rounded-2xl border border-border bg-soft px-4 py-4">
					<p class="font-bold">Notifications are blocked for Toe Beans</p>
					<ol class="flex list-decimal flex-col gap-1 pl-5">
						<li>
							Open your browser's site settings for Toe Beans (often through the icon beside the
							address) and allow notifications.
						</li>
						<li>
							If they're still off, check your device's notification settings for your browser, or
							for Toe Beans if you installed it.
						</li>
					</ol>
					<Button variant="outline" onclick={check}>Check again</Button>
				</div>
			{:else if phase === 'failed'}
				<div class="flex flex-col gap-3 rounded-2xl border border-border bg-soft px-4 py-4">
					<p role="alert" class="font-bold">Couldn't register this device</p>
					<p class="text-sm text-muted-foreground">Check your connection, then try again.</p>
					<Button variant="outline" onclick={turnOn}>Retry</Button>
				</div>
			{/if}
			{#if stopFailed && phase === 'on'}
				<p role="alert" class="text-sm">Couldn't turn them off — check your connection.</p>
			{/if}

			{#if !installed && phase !== 'unsupported' && phase !== 'checking'}
				<div class="flex flex-col gap-1 rounded-2xl border border-border bg-card px-4 py-3">
					<p class="font-bold">Install Toe Beans for the most reliable reminders</p>
					<p class="text-sm text-muted-foreground">
						Use your browser's <strong>Install</strong> or <strong>Add to Home screen</strong> option,
						then open Toe Beans from there.
					</p>
				</div>
			{/if}
		</section>

		{#if phase === 'on'}
			<section aria-labelledby="what" class="flex flex-col gap-3">
				<h2 id="what" class="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">
					What to remind you of
				</h2>
				<div class="flex min-h-12 items-center justify-between gap-4">
					<label for="training" class="flex-1 font-bold">Training sessions</label>
					<Switch
						id="training"
						bind:checked={
							() => settings?.preference.training ?? false,
							(on) => void savePreference({ training: on })
						}
					/>
				</div>
				<label class="flex flex-col gap-1">
					<span class="text-sm text-muted-foreground">Remind me</span>
					<select
						class="min-h-12 rounded-2xl border border-border bg-card px-3"
						value={settings.preference.trainingLeadMin}
						disabled={!settings.preference.training}
						onchange={(e) =>
							savePreference({ trainingLeadMin: Number(e.currentTarget.value) as TrainingLead })}
					>
						{#each leads as lead (lead.value)}
							<option value={lead.value}>{lead.label}</option>
						{/each}
					</select>
				</label>
				<p class="text-sm text-muted-foreground">
					Care tasks will remind you on the day, once they arrive in Toe Beans.
				</p>
				<p aria-live="polite" class="text-sm empty:hidden">
					{#if saving === 'saving'}Saving…{:else if saving === 'saved'}Saved.{:else if saving === 'failed'}<span
							role="alert">Couldn't save — check your connection, then try again.</span
						>{/if}
				</p>
			</section>

			<details class="group" bind:open={tipsOpen}>
				<summary
					class="flex min-h-12 cursor-pointer list-none items-center gap-2 font-display text-lg font-semibold"
				>
					<Icon name="forward" size={20} class="transition-transform group-open:rotate-90" />
					Reminder tips
				</summary>
				<div class="flex flex-col gap-6 pt-3">
					<section aria-labelledby="reliable" class="flex flex-col gap-3">
						<h2
							id="reliable"
							class="text-sm font-extrabold tracking-wide text-muted-foreground uppercase"
						>
							Make reminders reliable
						</h2>
						<p>
							Battery saving can stop reminders arriving. The setting belongs to your
							<strong>browser</strong>, which delivers them, not to Toe Beans.
						</p>
						<label class="flex flex-col gap-1">
							<span class="text-sm text-muted-foreground">Your device</span>
							<select
								class="min-h-12 rounded-2xl border border-border bg-card px-3"
								bind:value={maker}
							>
								{#each Object.entries(steps) as [value, step] (value)}
									<option {value}>{step.name}</option>
								{/each}
							</select>
						</label>
						<p>
							{steps[maker].path.join(' → ')} → <strong>{steps[maker].setting}</strong>
						</p>
					</section>

					<section aria-labelledby="test" class="flex flex-col gap-3">
						<h2
							id="test"
							class="text-sm font-extrabold tracking-wide text-muted-foreground uppercase"
						>
							Test
						</h2>
						{#if test && !test.receivedAt && (test.status === 'pending' || test.status === 'sending')}
							<p class="rounded-2xl bg-soft px-4 py-3">
								On its way. <strong>Lock the screen and leave the device</strong>: the test arrives
								between
								{time(test.dueAt)} and {time(
									new Date(Date.parse(test.dueAt) + 5 * 60_000).toISOString()
								)}.
							</p>
						{:else}
							{#if test?.receivedAt}
								<p class="rounded-2xl bg-soft px-4 py-3">
									The last test arrived at {time(test.receivedAt)}.
								</p>
							{:else if test?.overdue}
								<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3">
									Didn’t get the test? Check the battery setting above, then try again.
								</p>
							{:else if test?.status === 'sent'}
								<p class="rounded-2xl bg-soft px-4 py-3">
									Sent at {time(test.sentAt ?? test.dueAt)}, waiting for this device to say it
									arrived.
								</p>
							{:else if test && (test.status === 'failed' || test.status === 'skipped')}
								<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3">
									The test couldn’t be sent. Try again.
								</p>
							{/if}
							<p class="text-sm text-muted-foreground">
								A test that arrives at once proves little: devices start holding reminders back a
								minute or two after the screen locks. So the test comes 3 minutes after you tap.
							</p>
							<Button variant="outline" onclick={startTest} disabled={testing === 'starting'}>
								{testing === 'starting' ? 'Starting…' : 'Test reminders'}
							</Button>
							{#if testing === 'failed'}
								<p role="alert" class="text-sm">Couldn't start the test — check your connection.</p>
							{/if}
						{/if}
					</section>
				</div>
			</details>
		{/if}

		{#if others.length > 0}
			<section aria-labelledby="others" class="flex flex-col gap-3">
				<h2
					id="others"
					class="text-sm font-extrabold tracking-wide text-muted-foreground uppercase"
				>
					Your other devices
				</h2>
				<ul class="flex flex-col gap-2">
					{#each others as device (device.id)}
						<li class="flex items-center gap-3 rounded-2xl border border-border px-4 py-2">
							<span class="flex min-w-0 flex-1 flex-col">
								<span class="truncate font-bold">{device.label}</span>
								<span class="text-sm text-muted-foreground">
									{device.disabled
										? 'Stopped: reminders no longer reach it'
										: device.lastSuccessAt
											? `Last reminder ${day(device.lastSuccessAt)}`
											: `Added ${day(device.createdAt)}`}
								</span>
							</span>
							<Button
								variant="ghost"
								size="icon"
								aria-label={`Remove ${device.label}`}
								onclick={() => confirmRemove({ id: device.id, label: device.label })}
							>
								<Icon name="delete" />
							</Button>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<p class="text-sm text-muted-foreground">
			Reminders can be delayed by your device's battery or network settings. Today always shows
			what's due.
		</p>
	{/if}
</div>

<Sheet.Root bind:open={sheetOpen}>
	<Sheet.Content side="bottom" class="mx-auto flex max-w-xl flex-col gap-4 px-4 pt-6 pb-4">
		{#if sheet}
			<Sheet.Header class="p-0 pr-12 text-left">
				<Sheet.Title class="font-display text-xl font-semibold">Remove {sheet.label}?</Sheet.Title>
				<Sheet.Description class="text-base">
					It stops getting reminders. Turn them on there again to bring it back.
				</Sheet.Description>
			</Sheet.Header>
			{#if removing === 'failed'}
				<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3">
					Couldn't remove it — check your connection.
				</p>
			{/if}
			<Button variant="destructive" disabled={removing === 'working'} onclick={remove}>
				{removing === 'working' ? 'Removing…' : 'Remove device'}
			</Button>
		{/if}
	</Sheet.Content>
</Sheet.Root>
