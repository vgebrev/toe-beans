<script lang="ts">
	// The new dog's photo in the add form (ui.md J1 step 4): a preview, and a button that opens the
	// photo sheet to choose and frame it. The sheet's confirm only hands the photo back; the form's
	// own button saves the dog. It's required, and the hint says why.
	import Icon from '#lib/components/icon/Icon.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { cn } from '#lib/utils.js';
	import DogPhotoSheet from './DogPhotoSheet.svelte';

	interface Props {
		/** The framed photo, once chosen. */
		photo?: Blob | null;
		error?: string;
		/** Called once a photo is framed, e.g. to clear an error about it. */
		onchosen?: () => void;
	}

	// `photo` is written here and read by the form that binds it, which ESLint can't see.
	// eslint-disable-next-line no-useless-assignment
	let { photo = $bindable(null), error, onchosen }: Props = $props();

	let open = $state(false);
	let preview = $state<string | null>(null);

	$effect(() => {
		const current = preview;
		return () => {
			if (current) URL.revokeObjectURL(current);
		};
	});

	function use(blob: Blob) {
		photo = blob;
		preview = URL.createObjectURL(blob);
		onchosen?.();
		return null;
	}
</script>

<fieldset class="flex flex-col gap-3" aria-describedby={error ? 'photo-error' : 'photo-hint'}>
	<legend class="mb-2 font-bold">Photo</legend>
	<div class="flex flex-col items-center gap-3">
		{#if preview}
			<img
				src={preview}
				alt="Your dog, ready to save"
				width="160"
				height="160"
				class="size-40 rounded-full object-cover"
			/>
		{:else}
			<span
				class={cn(
					'flex size-40 items-center justify-center rounded-full border-2 border-dashed text-muted-foreground',
					error ? 'border-destructive' : 'border-input'
				)}
			>
				<Icon name="dog" size={56} />
			</span>
		{/if}
		<Button
			type="button"
			variant="outline"
			aria-haspopup="dialog"
			aria-invalid={error ? 'true' : undefined}
			onclick={() => (open = true)}
		>
			<Icon name="camera" />
			{preview ? 'Change photo' : 'Add photo'}
		</Button>
	</div>
	{#if error}
		<p id="photo-error" class="text-sm text-destructive">{error}</p>
	{:else}
		<p id="photo-hint" class="text-sm text-muted-foreground">
			A photo helps everyone see at a glance which dog an entry is for.
		</p>
	{/if}
</fieldset>

<DogPhotoSheet
	bind:open
	title={preview ? 'Change photo' : 'Add a photo'}
	description="Take one or pick one from your gallery, then frame your dog in the circle."
	confirmLabel="Use photo"
	onconfirm={use}
/>
