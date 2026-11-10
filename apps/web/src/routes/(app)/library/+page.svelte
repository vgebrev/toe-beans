<script lang="ts">
	// The exercise library (ui.md §4.6, FR-03): skill-area chips, then a card per exercise with
	// its title, goal and duration. Read-only: there's no "create exercise" in Phase 1.
	import { resolve } from '$app/paths';
	import type { ExerciseSummary, SkillArea } from '@toe-beans/contracts';
	import Icon from '#lib/components/icon/Icon.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import { skillAreaLabels, skillAreas } from '#lib/exercises/skill-areas.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	/** The filter lives in the URL, so a chip is a plain link and a reload keeps it. */
	const libraryHref = (area: SkillArea | null) =>
		`${resolve('/(app)/library')}${area ? `?area=${area}` : ''}`;

	const shown = $derived(data.area ? skillAreas.filter((a) => a === data.area) : skillAreas);
	const inArea = (area: SkillArea) => data.exercises?.filter((e) => e.skillArea === area) ?? [];
</script>

<svelte:head><title>Exercise library · Toe Beans</title></svelte:head>

{#snippet chip(label: string, area: SkillArea | null)}
	{@const current = data.area === area}
	<li class="shrink-0">
		<!-- libraryHref resolves the route; the rule can't see through the query string. -->
		<!-- eslint-disable svelte/no-navigation-without-resolve -->
		<a
			href={libraryHref(area)}
			aria-current={current ? 'page' : undefined}
			data-sveltekit-noscroll
			data-sveltekit-replacestate
			class={[
				'flex min-h-12 items-center rounded-full border px-4 font-bold',
				current
					? 'border-primary bg-primary text-primary-foreground'
					: 'border-border bg-card text-foreground'
			]}
		>
			{label}
		</a>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
	</li>
{/snippet}

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
	<nav aria-label="Skill areas">
		<ul class="flex gap-2 overflow-x-auto px-4 pb-1">
			{@render chip('All', null)}
			{#each skillAreas as area (area)}
				{@render chip(skillAreaLabels[area], area)}
			{/each}
		</ul>
	</nav>

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
