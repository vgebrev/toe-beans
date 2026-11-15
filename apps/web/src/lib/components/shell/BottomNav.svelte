<script lang="ts">
	// Bottom navigation (ui.md §2.1). Thumb-first: each destination is a full cell at least
	// 64 px tall. The free icon set has no filled style, so the active tab gets a tinted pill
	// as well as the primary colour and a bolder label (colour is never the only signal).
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Icon from '#lib/components/icon/Icon.svelte';
	import { isActive, tabs } from './nav.js';
</script>

<!-- Sized to cap at large text (ui.md §7): at 200% the five tabs still fit across, with
     labels up to 18 px and the bar no taller than 88 px. -->
<nav
	aria-label="Main"
	class="fixed inset-x-0 bottom-0 z-40 border-t bg-surface pb-[env(safe-area-inset-bottom)]"
>
	<ul class="mx-auto grid max-w-xl grid-cols-5">
		{#each tabs as tab (tab.route)}
			{@const active = isActive(tab, page.route.id)}
			<li>
				<a
					href={resolve(tab.route)}
					aria-current={active ? 'page' : undefined}
					class={[
						'flex h-[min(4rem,88px)] flex-col items-center justify-center gap-0.5 px-0.5 text-[min(0.875rem,18px)] transition-colors',
						active ? 'font-extrabold text-primary' : 'font-semibold text-muted-foreground'
					]}
				>
					<span
						class={[
							'flex h-8 w-full max-w-14 items-center justify-center rounded-full transition-colors',
							active && 'bg-soft'
						]}
					>
						<Icon name={tab.icon} size={22} strokeWidth={active ? 1.8 : 1.5} />
					</span>
					{tab.label}
				</a>
			</li>
		{/each}
	</ul>
</nav>
