<script lang="ts">
	import { onMount } from 'svelte';
	import { version } from '$app/env';
	import { VAPID_PUBLIC_KEY } from '$app/env/public';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// Chrome's install prompt event; not in lib.dom yet.
	type BeforeInstallPromptEvent = Event & {
		prompt(): Promise<void>;
		userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
	};

	let installEvent = $state<BeforeInstallPromptEvent | null>(null);
	let installed = $state(false);
	let standalone = $state(false);
	let online = $state(true);
	let swState = $state('checking…');
	let userAgent = $state('');

	onMount(() => {
		const displayMode = matchMedia('(display-mode: standalone)');
		standalone = displayMode.matches;
		displayMode.addEventListener('change', (e) => (standalone = e.matches));

		online = navigator.onLine;
		addEventListener('online', () => (online = true));
		addEventListener('offline', () => (online = false));

		addEventListener('beforeinstallprompt', (e) => {
			e.preventDefault();
			installEvent = e as BeforeInstallPromptEvent;
		});
		addEventListener('appinstalled', () => {
			installed = true;
			installEvent = null;
		});

		userAgent = navigator.userAgent;

		permission = 'Notification' in window ? Notification.permission : 'unsupported';
		label = localStorage.getItem('spike.label') ?? guessLabel(userAgent);
		if (permission === 'granted') deviceId = localStorage.getItem('spike.deviceId');
		const savedIndex = Number(localStorage.getItem('spike.delayIndex') ?? NaN);
		if (Number.isInteger(savedIndex) && savedIndex >= 0 && savedIndex < DELAYS.length) delayIndex = savedIndex;
		refreshLog();

		if (!('serviceWorker' in navigator)) {
			swState = 'not supported';
			return;
		}
		navigator.serviceWorker.ready.then((reg) => {
			swState = reg.active?.state ?? 'registered';
		});
		navigator.serviceWorker.getRegistration().then((reg) => {
			if (!reg) swState = 'not registered';
		});
	});

	// --- S-1.2 push ---
	type LogEntry = { at: string; event: string; device?: string; pushId?: string; detail?: string };
	// Slider stops: fine-grained around the first few minutes (where screen-off battery saving kicks
	// in), coarser after that.
	const DELAYS = [
		0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 105, 120, 150, 180, 210, 240, 300, 360, 420, 480, 600,
		720, 900, 1200, 1500, 1800, 2700, 3600, 5400, 7200
	];
	const formatDelay = (s: number) =>
		s === 0 ? 'now' : s < 60 ? `${s} s` : s < 3600 ? `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ''}` : `${s / 3600} h`;
	let delayIndex = $state(3);
	const delaySeconds = $derived(DELAYS[delayIndex]);

	let permission = $state<NotificationPermission | 'unsupported'>('default');
	let deviceId = $state<string | null>(null);
	let label = $state('');
	let urgency = $state<'high' | 'normal'>('high');
	let pushMessage = $state('');
	let entries = $state<LogEntry[]>([]);

	function guessLabel(ua: string) {
		if (/SM-S711/i.test(ua)) return 'Galaxy S23 FE';
		if (/23013RK75C|22101316/i.test(ua) || /Redmi/i.test(ua)) return 'Redmi Note 12 Pro';
		return /Android/i.test(ua) ? 'Android phone' : 'Desktop';
	}

	function base64UrlToBytes(value: string) {
		const b64 = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
		return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
	}

	async function enablePush() {
		pushMessage = '';
		try {
			permission = await Notification.requestPermission();
			if (permission !== 'granted') {
				pushMessage = 'Notifications are blocked. Allow them in Chrome site settings.';
				return;
			}
			const reg = await navigator.serviceWorker.ready;
			const subscription =
				(await reg.pushManager.getSubscription()) ??
				(await reg.pushManager.subscribe({
					userVisibleOnly: true,
					applicationServerKey: base64UrlToBytes(VAPID_PUBLIC_KEY)
				}));
			const res = await fetch('/api/push/subscribe', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ label, subscription })
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			deviceId = (await res.json()).id;
			localStorage.setItem('spike.deviceId', deviceId!);
			localStorage.setItem('spike.label', label);
			pushMessage = 'Subscribed.';
			await refreshLog();
		} catch (e) {
			pushMessage = `Subscribe failed: ${e}`;
		}
	}

	async function sendTest(seconds: number) {
		pushMessage = '';
		const res = await fetch('/api/push/send', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ deviceId, delaySeconds: seconds, urgency })
		}).catch(() => null);
		if (!res?.ok) {
			pushMessage =
				res?.status === 404 ? 'Server lost this device. Subscribe again.' : 'Could not reach the server.';
			if (res?.status === 404) deviceId = null;
			return;
		}
		const { pushId, dueAt } = await res.json();
		pushMessage = `Push ${pushId} due at ${new Date(dueAt).toLocaleTimeString()}. You can close the app now.`;
		await refreshLog();
	}

	async function refreshLog() {
		const res = await fetch('/api/push/log').catch(() => null);
		if (res?.ok) entries = await res.json();
	}

	async function install() {
		if (!installEvent) return;
		await installEvent.prompt();
		const { outcome } = await installEvent.userChoice;
		if (outcome === 'accepted') installed = true;
		installEvent = null;
	}
</script>

<svelte:head><title>Toe Beans · PWA spike</title></svelte:head>

<main>
	<img src="/icons/icon-192.png" alt="" width="72" height="72" />
	<h1>Toe Beans</h1>
	<p class="muted">Spike S-1.1: installable PWA</p>

	{#if installEvent}
		<button onclick={install}>Install app</button>
	{:else if installed}
		<p>Installed. Open Toe Beans from your home screen.</p>
	{/if}

	<dl>
		<dt>Display mode</dt>
		<dd>{standalone ? 'standalone (installed)' : 'browser tab'}</dd>
		<dt>Service worker</dt>
		<dd>{swState}</dd>
		<dt>Connection</dt>
		<dd>{online ? 'online' : 'offline'}</dd>
		<dt>Build</dt>
		<dd>{version}</dd>
		<dt>Page served at</dt>
		<dd>{data.servedAt}</dd>
		<dt>User agent</dt>
		<dd class="ua">{userAgent}</dd>
	</dl>

	<section aria-labelledby="push-title">
		<h2 id="push-title">Push test (S-1.2)</h2>
		{#if permission === 'unsupported'}
			<p>This browser doesn't support notifications.</p>
		{:else if !deviceId}
			<label>
				Device name
				<input bind:value={label} maxlength="40" />
			</label>
			<button onclick={enablePush}>Enable notifications</button>
		{:else}
			<p class="muted">Subscribed as <strong>{label}</strong> ({deviceId})</p>
			<fieldset>
				<legend>Urgency</legend>
				<label><input type="radio" bind:group={urgency} value="high" /> high</label>
				<label><input type="radio" bind:group={urgency} value="normal" /> normal</label>
			</fieldset>
			<label>
				Delay: {formatDelay(delaySeconds)}
				<input
					type="range"
					min="0"
					max={DELAYS.length - 1}
					step="1"
					bind:value={delayIndex}
					onchange={() => localStorage.setItem('spike.delayIndex', String(delayIndex))}
					aria-valuetext={formatDelay(delaySeconds)}
				/>
			</label>
			<div class="delays">
				<button onclick={() => sendTest(delaySeconds)}>Send in {formatDelay(delaySeconds)}</button>
				<button class="secondary" onclick={() => sendTest(0)}>Send now</button>
			</div>
			<button class="link" onclick={() => (deviceId = null)}>Re-subscribe</button>
		{/if}
		{#if pushMessage}<p role="status">{pushMessage}</p>{/if}

		<div class="log-head">
			<h3>Delivery log</h3>
			<button class="link" onclick={refreshLog}>Refresh</button>
		</div>
		<ol class="log">
			{#each entries as e, i (i)}
				<li>
					<time>{new Date(e.at).toLocaleTimeString()}</time>
					<strong>{e.event}</strong>
					{e.device ?? ''}
					{e.pushId ? `#${e.pushId}` : ''}
					{#if e.detail}<span class="muted">· {e.detail}</span>{/if}
				</li>
			{:else}
				<li class="muted">Nothing yet.</li>
			{/each}
		</ol>
	</section>
</main>

<style>
	main {
		padding: max(24px, env(safe-area-inset-top)) 16px 24px;
		max-width: 480px;
		margin: 0 auto;
	}
	img {
		border-radius: 18px;
	}
	h1 {
		margin: 8px 0 0;
	}
	.muted {
		margin-top: 0;
		color: var(--muted);
	}
	button {
		min-height: 48px;
		padding: 0 24px;
		border: 0;
		border-radius: 24px;
		background: var(--primary);
		color: var(--on-primary);
		font: inherit;
		font-weight: 700;
	}
	dl {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 8px 16px;
		padding: 16px;
		border: 1px solid var(--border);
		border-radius: 18px;
		background: var(--surface);
	}
	dt {
		color: var(--muted);
	}
	dd {
		margin: 0;
		overflow-wrap: anywhere;
	}
	.ua {
		font-size: 13px;
	}
	section {
		margin-top: 24px;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-bottom: 12px;
		font-weight: 700;
	}
	input[type='range'] {
		width: 100%;
		min-height: 44px;
		accent-color: var(--primary);
	}
	button.secondary {
		background: transparent;
		color: var(--primary);
		border: 1px solid var(--primary);
	}
	input:not([type='radio'], [type='range']) {
		min-height: 44px;
		padding: 0 12px;
		border: 1px solid var(--border);
		border-radius: 12px;
		background: var(--surface);
		color: var(--text);
		font: inherit;
	}
	fieldset {
		display: flex;
		gap: 16px;
		border: 0;
		padding: 0;
		margin: 0 0 12px;
	}
	fieldset label {
		flex-direction: row;
		align-items: center;
		margin: 0;
		font-weight: 400;
	}
	legend {
		float: left;
		color: var(--muted);
	}
	.delays {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 8px;
	}
	.delays button {
		padding: 0 18px;
	}
	button.link {
		min-height: 44px;
		padding: 0;
		background: none;
		color: var(--primary);
	}
	.log-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.log {
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: 14px;
	}
	.log li {
		padding: 6px 0;
		border-bottom: 1px solid var(--border);
	}
	.log time {
		color: var(--muted);
		margin-right: 4px;
	}
</style>
