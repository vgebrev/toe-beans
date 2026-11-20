<script lang="ts">
	// The *Can't reach Toe Beans* page: what happened, and *Try again*, which loads the page
	// that was asked for (the address bar still shows it). The connection often takes a few
	// seconds to come back after airplane mode, so *Try again* first checks the server answers
	// and says so if it doesn't yet, rather than loading this page again with nothing to show.
	// It's a plain link to this address too, so it works before the app's code has loaded.
	import { onMount } from 'svelte';
	import Logo from '#lib/components/Logo.svelte';
	import { buttonVariants } from '#lib/components/ui/button/index.js';

	interface Props {
		title: string;
		text: string;
	}

	let { title, text }: Props = $props();

	let checking = $state(false);
	let stillDown = $state(false);

	const answers = async () => {
		try {
			return (await fetch('/healthz', { cache: 'no-store' })).ok;
		} catch {
			return false;
		}
	};

	async function tryAgain(event: MouseEvent) {
		event.preventDefault();
		if (checking) return;
		checking = true;
		stillDown = false;
		if (await answers()) {
			location.reload();
			return;
		}
		checking = false;
		stillDown = true;
	}

	// Back online: load the page once the server answers, checking for up to half a minute.
	onMount(() => {
		let timer: ReturnType<typeof setTimeout> | undefined;
		const check = async (tries: number) => {
			if (await answers()) location.reload();
			else if (tries > 1) timer = setTimeout(() => void check(tries - 1), 2000);
		};
		const online = () => {
			clearTimeout(timer);
			void check(15);
		};
		window.addEventListener('online', online);
		return () => {
			clearTimeout(timer);
			window.removeEventListener('online', online);
		};
	});
</script>

<svelte:head><title>{title} · Toe Beans</title></svelte:head>

<div class="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
	<Logo size={56} />
	<h1 class="font-display text-[1.75rem] leading-tight font-semibold">{title}</h1>
	<p class="max-w-sm text-muted-foreground">{text}</p>
	<!-- href="" is this page's own address; the reload attribute keeps the router out of it. -->
	<a
		href=""
		data-sveltekit-reload
		aria-disabled={checking}
		class="{buttonVariants()} mt-2 w-full max-w-sm"
		onclick={tryAgain}
	>
		{checking ? 'Checking…' : 'Try again'}
	</a>
	<p role="status" class="max-w-sm text-sm empty:hidden">
		{stillDown ? "Still can't reach Toe Beans. Try again in a moment." : ''}
	</p>
</div>
