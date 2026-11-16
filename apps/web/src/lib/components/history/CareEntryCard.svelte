<script lang="ts">
	// A done care task as a card in History (ui.md §4.4, architecture D35): it heads the day it was
	// done, so the time column holds its category's icon instead; then the dog's avatar, the title,
	// the dog's name, who marked it done and a *Done* badge. The card opens the task, whose back
	// link then returns to History.
	import { resolve } from '$app/paths';
	import type { CareTask, Dog } from '@toe-beans/contracts';
	import DogAvatar from '#lib/components/dogs/DogAvatar.svelte';
	import Icon from '#lib/components/icon/Icon.svelte';
	import { careLabels } from '#lib/care/labels.js';

	interface Props {
		task: CareTask;
		dog: Dog | undefined;
	}

	let { task, dog }: Props = $props();
	const category = $derived(careLabels[task.category]);
</script>

<!-- At large text (ui.md §7) the badge moves under the title, as on Care's cards. -->
{#snippet done(placement: string)}
	<span class="{placement} shrink-0 rounded-full border border-border px-3 py-0.5 text-sm font-bold"
		>Done</span
	>
{/snippet}

<a
	href="{resolve('/(app)/care/[id]', { id: task.id })}?from=history"
	class="@container flex min-h-16 items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3"
>
	<span class="flex w-12 shrink-0 justify-center text-primary @max-[18rem]:hidden">
		<Icon name={category.icon} size={24} />
	</span>
	{#if dog}
		<DogAvatar {dog} size={36} />
	{/if}
	<span class="flex min-w-0 flex-1 flex-col gap-0.5">
		<span class="font-bold break-words">{task.title}</span>
		<span class="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
			<span>{dog?.name ?? 'A dog no longer here'}</span>
			{#if task.completedBy}<span>by {task.completedBy}</span>{/if}
			{@render done('hidden @max-[18rem]:inline')}
		</span>
	</span>
	{@render done('@max-[18rem]:hidden')}
</a>
