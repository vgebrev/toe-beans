<script lang="ts" module>
	export interface FilterOption {
		id: string;
		label: string;
		/** Choosing it navigates here instead of calling `onselect`. */
		href?: string;
	}
</script>

<script lang="ts" generics="T extends FilterOption">
	// A filter as one button showing the current choice; tapping it opens a bottom sheet with the
	// choices one per row, *All* first (ui.md §5.1). It never scrolls sideways, however many
	// choices there are. A choice is a link when it has an `href` (a filter kept in the URL) and a
	// button otherwise; either way choosing closes the sheet.
	import type { Snippet } from 'svelte';
	import Icon from '#lib/components/icon/Icon.svelte';
	import * as Sheet from '#lib/components/ui/sheet/index.js';

	interface Props {
		/** What's being filtered, e.g. "Show dog": the sheet's title and the start of the button's name. */
		title: string;
		/** The choices, *All* first. */
		options: readonly T[];
		/** The `id` of the current choice. */
		selected: string;
		/** Called with the chosen option's `id` when it has no `href`. */
		onselect?: (id: string) => void;
		/** Drawn before a choice's label, on the button and in the sheet (e.g. a dog's avatar). */
		leading?: Snippet<[T]>;
	}

	let { title, options, selected, onselect, leading }: Props = $props();

	let open = $state(false);
	const current = $derived(options.find((o) => o.id === selected) ?? options[0]!);

	function choose(option: T) {
		open = false;
		if (option.href === undefined) onselect?.(option.id);
	}

	const row =
		'flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 py-1 text-left text-base font-bold aria-[current=true]:bg-soft';
</script>

{#snippet content(option: T)}
	{#if leading}{@render leading(option)}{/if}
	<span class="min-w-0 flex-1 truncate">{option.label}</span>
{/snippet}

<button
	type="button"
	aria-haspopup="dialog"
	class="flex min-h-12 max-w-full items-center gap-2 self-start rounded-full border border-border bg-card px-4 font-bold has-[[data-leading]]:pl-1.5"
	onclick={() => (open = true)}
>
	<span class="sr-only">{title}: </span>
	{@render content(current)}
	<Icon name="expand" size={20} class="shrink-0 text-muted-foreground" />
</button>

<Sheet.Root bind:open>
	<Sheet.Content
		side="bottom"
		class="mx-auto flex max-h-[85dvh] max-w-xl flex-col gap-3 px-4 pt-6 pb-0"
	>
		<Sheet.Header class="p-0 pr-12 text-left">
			<Sheet.Title class="font-display text-xl font-semibold">{title}</Sheet.Title>
			<Sheet.Description class="sr-only">Choose one to filter by.</Sheet.Description>
		</Sheet.Header>
		<ul class="-mx-4 flex min-h-0 flex-col gap-1 overflow-y-auto px-4 pb-4" aria-label={title}>
			{#each options as option (option.id)}
				{@const isCurrent = option.id === current.id}
				<li>
					{#if option.href !== undefined}
						<!-- The page resolves the route; the rule can't see through the prop. -->
						<!-- eslint-disable svelte/no-navigation-without-resolve -->
						<a
							href={option.href}
							aria-current={isCurrent ? 'true' : undefined}
							data-sveltekit-noscroll
							data-sveltekit-replacestate
							class={row}
							onclick={() => choose(option)}
						>
							{@render content(option)}
							{#if isCurrent}<Icon name="done" class="shrink-0 text-primary" />{/if}
						</a>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
					{:else}
						<button
							type="button"
							aria-current={isCurrent ? 'true' : undefined}
							class={row}
							onclick={() => choose(option)}
						>
							{@render content(option)}
							{#if isCurrent}<Icon name="done" class="shrink-0 text-primary" />{/if}
						</button>
					{/if}
				</li>
			{/each}
		</ul>
	</Sheet.Content>
</Sheet.Root>
