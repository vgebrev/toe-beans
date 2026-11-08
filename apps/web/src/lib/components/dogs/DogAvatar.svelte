<script lang="ts">
	// A dog's photo in a circle (ui.md §5.5). If the photo can't load, its initial on the dog's
	// accent colour stands in. The name is always beside it, so the image itself is decorative
	// unless `label` says otherwise.
	import type { Dog } from '@toe-beans/contracts';
	import { accentBackground, accentRing } from '#lib/dogs/accent.js';
	import { cn } from '#lib/utils.js';

	interface Props {
		dog: Pick<Dog, 'name' | 'accent' | 'photo'>;
		/** CSS pixels across. */
		size?: number;
		/** Draws the dog's accent as a ring, e.g. on the selected switcher chip. */
		ring?: boolean;
		/** Alt text, when no name is shown next to it. */
		label?: string;
		/** A photo chosen but not saved yet, shown instead of the stored one. */
		src?: string;
		class?: string;
	}

	let { dog, size = 40, ring = false, label, src, class: className }: Props = $props();

	let failed = $state(false);
	let image = $state<HTMLImageElement | null>(null);
	// A new photo is a new URL, which deserves a fresh try.
	const url = $derived(src ?? (size > 128 ? dog.photo.large : dog.photo.thumb));
	$effect(() => {
		void url;
		failed = false;
	});
	// A server-rendered image can fail before hydration, when nothing is listening for the error.
	$effect(() => {
		if (image?.complete && image.naturalWidth === 0) failed = true;
	});

	const initial = $derived([...dog.name][0]?.toUpperCase() ?? '?');
</script>

<span
	class={cn(
		'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full',
		failed && accentBackground(dog.accent),
		ring && ['ring-3 ring-offset-2 ring-offset-background', accentRing(dog.accent)],
		className
	)}
	style:width="{size}px"
	style:height="{size}px"
	role={label ? 'img' : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : 'true'}
>
	{#if failed}
		<span
			class="font-display font-semibold text-on-dog"
			style:font-size="{Math.round(size * 0.45)}px"
		>
			{initial}
		</span>
	{:else}
		<img
			bind:this={image}
			src={url}
			alt=""
			width={size}
			height={size}
			class="size-full object-cover"
			decoding="async"
			onerror={() => (failed = true)}
		/>
	{/if}
</span>
