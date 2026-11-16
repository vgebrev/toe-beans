<script lang="ts">
	// The exercise library (ui.md §4.6, FR-03): a skill-area filter, then a card per exercise with
	// its title, goal and duration. Read-only: there's no "create exercise" in Phase 1.
	import { resolve } from '$app/paths';
	import type { ExerciseSummary, SkillArea } from '@toe-beans/contracts';
	import FilterSheet from '#lib/components/filter/FilterSheet.svelte';
	import Icon from '#lib/components/icon/Icon.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import { skillAreaLabels, skillAreas } from '#lib/exercises/skill-areas.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const ALL = 'all';

	/** The filter lives in the URL, so a choice is a plain link and a reload keeps it. */
	const libraryHref = (area: SkillArea | null) =>
		`${resolve('/(app)/library')}${area ? `?area=${area}` : ''}`;

	const areaOptions = [
		{ id: ALL, label: 'All areas', href: libraryHref(null) },
		...skillAreas.map((area) => ({
			id: area,
			label: skillAreaLabels[area],
			href: libraryHref(area)
		}))
	];

	const shown = $derived(data.area ? skillAreas.filter((a) => a === data.area) : skillAreas);
	const inArea = (area: SkillArea) => data.exercises?.filter((e) => e.skillArea === area) ?? [];
</script>

<svelte:head><title>Exercise library · Toe Beans</title></svelte:head>

{#snippet card(exercise: ExerciseSummary)}
	<li>
		<a
			href={resolve('/(app)/library/[id]', { id: exercise.id })}
			class="flex min-h-16 items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3"
		>
			<span class="flex min-w-0 flex-1 flex-col gap-1">
				<span class="font-bold">{exercise.title}</span>
				<span class="line-clamp-2 text-sm text-muted-foreground">{exercise.goal}</span>
				<span class="flex flex-wrap gap-2 text-sm font-bold">
					<span class="rounded-full bg-soft px-3 py-0.5">{exercise.suggestedDurationMin} min</span>
					{#if exercise.draft}
						<span class="rounded-full border border-border px-3 py-0.5 text-muted-foreground"
							>Draft</span
						>
					{/if}
				</span>
			</span>
			<Icon name="forward" class="text-muted-foreground" />
		</a>
	</li>
{/snippet}

<PageHeader title="Exercise library">
	<a href={resolve('/(app)/more')} class="flex min-h-12 items-center gap-1 self-start font-bold">
		<Icon name="back" />
		More
	</a>
</PageHeader>

<div class="flex flex-col gap-6 pt-2">
	<div class="flex px-4">
		<FilterSheet title="Skill area" options={areaOptions} selected={data.area ?? ALL} />
	</div>

	<div class="flex flex-col gap-6 px-4">
		{#if data.exercises === null}
			<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3">
				Couldn't load the library — check your connection, then reload.
			</p>
		{:else}
			{#each shown as area (area)}
				{@const exercises = inArea(area)}
				{#if exercises.length > 0}
					<section aria-labelledby="area-{area}" class="flex flex-col gap-3">
						<h2
							id="area-{area}"
							class="text-sm font-extrabold tracking-wide text-muted-foreground uppercase"
						>
							{skillAreaLabels[area]}
						</h2>
						<ul class="flex flex-col gap-3">
							{#each exercises as exercise (exercise.id)}
								{@render card(exercise)}
							{/each}
						</ul>
					</section>
				{:else if data.area}
					<p class="text-muted-foreground">No exercises for this skill area yet.</p>
				{/if}
			{/each}
		{/if}
	</div>
</div>
