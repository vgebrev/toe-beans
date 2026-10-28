<script lang="ts">
	import { onMount } from 'svelte';
	import { version } from '$app/env';
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
</style>
