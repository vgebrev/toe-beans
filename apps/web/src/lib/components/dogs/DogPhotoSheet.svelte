<script lang="ts">
	// Choosing and framing a dog's photo, in its own bottom sheet (ui.md J1 step 4, §4.5): camera
	// or gallery, then the cropper. The sheet has one confirm button, so framing and using the
	// photo are a single step; the form or profile behind it keeps its own. Adding a dog and
	// changing a photo both use it.
	import Icon from '#lib/components/icon/Icon.svelte';
	import { Button, buttonVariants } from '#lib/components/ui/button/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import { cn } from '#lib/utils.js';
	import PhotoCropper from './PhotoCropper.svelte';

	interface Props {
		open?: boolean;
		title: string;
		description: string;
		/** The confirm button, e.g. "Use photo" or "Save photo". */
		confirmLabel: string;
		/** The confirm button while `onconfirm` runs, e.g. "Saving…". */
		workingLabel?: string;
		/** The framed photo. Resolves to a message to show in the sheet, or null to close it. */
		onconfirm: (photo: Blob) => Promise<string | null> | string | null;
	}

	let {
		open = $bindable(false),
		title,
		description,
		confirmLabel,
		workingLabel = 'Saving…',
		onconfirm
	}: Props = $props();

	const UNREADABLE = "That photo can't be opened here. Choose a JPEG, PNG or WebP photo.";

	let picking = $state<File | null>(null);
	let ready = $state(false);
	let cropper = $state<ReturnType<typeof PhotoCropper>>();
	let working = $state(false);
	let error = $state<string | null>(null);

	// Each opening starts afresh.
	$effect(() => {
		if (open) {
			picking = null;
			working = false;
			error = null;
		}
	});

	function chosen(event: Event & { currentTarget: HTMLInputElement }) {
		const file = event.currentTarget.files?.[0];
		// Cleared so choosing the same file again still fires a change.
		event.currentTarget.value = '';
		if (!file) return;
		error = null;
		picking = file;
	}

	function unreadable() {
		picking = null;
		error = UNREADABLE;
	}

	/** Never disabled for want of a photo: a tap without one says what's missing. */
	async function confirm() {
		if (working) return;
		if (!picking || !cropper) {
			error = 'Choose a photo first, with Take photo or Gallery.';
			return;
		}
		working = true;
		error = null;
		const photo = await cropper.crop();
		if (!photo) {
			working = false;
			return;
		}
		const message = await onconfirm(photo);
		working = false;
		if (message) error = message;
		else open = false;
	}

	const pickClass = cn(
		buttonVariants({ variant: 'outline' }),
		'flex-1 cursor-pointer has-focus-visible:border-ring has-focus-visible:ring-3 has-focus-visible:ring-ring/50'
	);
</script>

<Sheet.Root bind:open>
	<!-- Sized so it all fits without scrolling: the square takes what the header, zoom row and
	     footer leave of the sheet's height. Should it still overflow (very large text), the
	     footer stays pinned so the confirm button is always in view. -->
	<Sheet.Content
		side="bottom"
		class="mx-auto flex max-h-[92dvh] max-w-xl flex-col gap-4 overflow-y-auto px-4 pt-6 pb-0"
	>
		<Sheet.Header class="p-0 pr-12 text-left">
			<Sheet.Title class="font-display text-xl font-semibold">{title}</Sheet.Title>
			<Sheet.Description class="text-base">{description}</Sheet.Description>
		</Sheet.Header>

		{#if picking}
			{#key picking}
				<PhotoCropper
					bind:this={cropper}
					bind:ready
					file={picking}
					onunreadable={unreadable}
					maxSide="calc(92dvh - 290px)"
				/>
			{/key}
		{:else}
			<div class="flex gap-3">
				<label class={pickClass}>
					<Icon name="camera" />
					Take photo
					<input
						type="file"
						accept="image/*"
						capture="environment"
						class="sr-only"
						onchange={chosen}
					/>
				</label>
				<label class={pickClass}>
					<Icon name="gallery" />
					Gallery
					<input
						type="file"
						accept="image/jpeg,image/png,image/webp"
						class="sr-only"
						onchange={chosen}
					/>
				</label>
			</div>
		{/if}

		<div class="sticky bottom-0 -mt-4 flex flex-col gap-4 bg-popover pt-4 pb-4">
			{#if error}
				<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3 text-base">
					{error}
				</p>
			{/if}
			<div class="flex gap-3">
				<!-- Starts again; not a second confirm (ui.md §5.1). -->
				{#if picking}
					<Button
						type="button"
						variant="outline"
						class="flex-1"
						disabled={working}
						onclick={() => (picking = null)}
					>
						Another photo
					</Button>
				{/if}
				<!-- Busy while the photo opens or saves, and the label says which. -->
				<Button
					type="button"
					class="flex-1"
					disabled={working || (picking !== null && !ready)}
					onclick={confirm}
				>
					{#if working}
						<Icon name="saving" class="animate-spin" />
						{workingLabel}
					{:else if picking && !ready}
						<Icon name="saving" class="animate-spin" />
						Opening photo…
					{:else}
						{confirmLabel}
					{/if}
				</Button>
			</div>
		</div>
	</Sheet.Content>
</Sheet.Root>
