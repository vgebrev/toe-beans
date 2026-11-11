<script lang="ts">
	// Picking an exercise in its own sheet (ui.md J3, §5.1): a search box over the whole library,
	// grouped under skill-area headings like the library page. No area filter: it would be a sheet
	// on a sheet, and search covers it. Choosing one closes the sheet and returns to the form,
	// whose button saves.
	import type { ExerciseSummary } from '@toe-beans/contracts';
	import Icon from '#lib/components/icon/Icon.svelte';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import { skillAreaLabels, skillAreas } from '#lib/exercises/skill-areas.js';

	interface Props {
		open: boolean;
		exercises: ExerciseSummary[];
		selected: string | null;
		onpick: (exercise: ExerciseSummary) => void;
	}

	let { open = $bindable(), exercises, selected, onpick }: Props = $props();

	let query = $state('');

	const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
	const shown = $derived(
		exercises.filter(
			(e) => query.trim() === '' || fold(`${e.title} ${e.goal}`).includes(fold(query.trim()))
		)
	);
	const groups = $derived(
		skillAreas
			.map((area) => ({ area, exercises: shown.filter((e) => e.skillArea === area) }))
			.filter((g) => g.exercises.length > 0)
	);

	function pick(exercise: ExerciseSummary) {
		open = false;
		onpick(exercise);
	}
</script>

<Sheet.Root bind:open>
	<Sheet.Content
		side="bottom"
		class="mx-auto flex max-w-xl flex-col gap-4 px-4 pt-6 pb-0 data-[side=bottom]:h-[92dvh]"
		onOpenAutoFocus={(e) => e.preventDefault()}
	>
		<Sheet.Header class="p-0 pr-12 text-left">
			<Sheet.Title class="font-display text-xl font-semibold">Choose an exercise</Sheet.Title>
			<Sheet.Description class="sr-only">From the exercise library.</Sheet.Description>
		</Sheet.Header>
		<div class="flex flex-col gap-2">
			<Label for="exercise-search" class="sr-only">Search exercises</Label>
			<div class="relative">
				<Icon
					name="search"
					size={20}
					class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
				/>
				<Input
					id="exercise-search"
					type="search"
					placeholder="Search exercises"
					autocomplete="off"
					class="pl-10"
					bind:value={query}
				/>
			</div>
		</div>
		<div class="-mx-4 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-4">
			{#each groups as { area, exercises: inArea } (area)}
				<section aria-labelledby="pick-{area}" class="flex flex-col gap-2">
					<h3
						id="pick-{area}"
						class="text-sm font-extrabold tracking-wide text-muted-foreground uppercase"
					>
						{skillAreaLabels[area]}
					</h3>
					<ul class="flex flex-col gap-2">
						{#each inArea as exercise (exercise.id)}
							<li>
								<button
									type="button"
									aria-current={exercise.id === selected ? 'true' : undefined}
									class={[
										'flex min-h-16 w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left',
										exercise.id === selected ? 'border-primary bg-soft' : 'border-border bg-card'
									]}
									onclick={() => pick(exercise)}
								>
									<span class="flex min-w-0 flex-1 flex-col gap-1">
										<span class="font-bold">{exercise.title}</span>
										<span class="line-clamp-2 text-sm text-muted-foreground">{exercise.goal}</span>
									</span>
									<span class="shrink-0 rounded-full bg-soft px-3 py-0.5 text-sm font-bold"
										>{exercise.suggestedDurationMin} min</span
									>
									{#if exercise.id === selected}
										<Icon name="done" class="shrink-0 text-primary" label="Chosen" />
									{/if}
								</button>
							</li>
						{/each}
					</ul>
				</section>
			{:else}
				<p class="py-6 text-center text-muted-foreground">No exercises match.</p>
			{/each}
		</div>
	</Sheet.Content>
</Sheet.Root>
