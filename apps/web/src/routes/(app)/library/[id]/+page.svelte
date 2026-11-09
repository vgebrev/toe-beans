<script lang="ts">
	// One exercise (ui.md §4.6, FR-03): goal, setup, steps, duration, success criteria, *If your
	// puppy struggles* (anchored, so the Quick log's stressed tip can link to it, §4.3), safety
	// notes and further reading. Schedule and Log practice join the bottom with S6 and S7.
	import { resolve } from '$app/paths';
	import Icon from '#lib/components/icon/Icon.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import { paragraphs, skillAreaLabels } from '#lib/exercises/skill-areas.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>{data.exercise?.title ?? 'Exercise'} · Toe Beans</title></svelte:head>

{#snippet text(value: string)}
	{#each paragraphs(value) as paragraph, i (i)}
		<p>{paragraph}</p>
	{/each}
{/snippet}

<PageHeader title={data.exercise?.title ?? 'Exercise'}>
	<a href={resolve('/(app)/library')} class="flex min-h-12 items-center gap-1 self-start font-bold">
		<Icon name="back" />
		Library
	</a>
</PageHeader>

<div class="flex flex-col gap-6 px-4 pt-2 pb-8">
	{#if !data.exercise}
		<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3">
			Couldn't load this exercise — check your connection, then reload.
		</p>
	{:else}
		{@const exercise = data.exercise}
		<ul class="flex flex-wrap gap-2 text-sm font-bold" aria-label="About this exercise">
			<li class="rounded-full bg-soft px-3 py-1 text-primary">
				{skillAreaLabels[exercise.skillArea]}
			</li>
			<li class="flex items-center gap-1 rounded-full bg-soft px-3 py-1">
				<Icon name="duration" size={16} />
				{exercise.suggestedDurationMin} min
			</li>
			{#if exercise.draft}
				<li class="rounded-full border border-border px-3 py-1 text-muted-foreground">
					Draft: not yet reviewed
				</li>
			{/if}
		</ul>

		<section aria-labelledby="goal" class="flex flex-col gap-1">
			<h2 id="goal" class="text-lg font-extrabold">Goal</h2>
			{@render text(exercise.goal)}
		</section>

		<section aria-labelledby="setup" class="flex flex-col gap-1">
			<h2 id="setup" class="text-lg font-extrabold">Setup</h2>
			{@render text(exercise.setup)}
		</section>

		<section aria-labelledby="steps" class="flex flex-col gap-2">
			<h2 id="steps" class="text-lg font-extrabold">Steps</h2>
			<ol class="flex flex-col gap-3">
				{#each exercise.steps as step, i (i)}
					<li class="flex gap-3">
						<span
							aria-hidden="true"
							class="flex size-7 flex-none items-center justify-center rounded-full bg-primary text-sm font-extrabold text-primary-foreground"
						>
							{i + 1}
						</span>
						<span class="flex min-w-0 flex-col gap-2 pt-0.5">{@render text(step)}</span>
					</li>
				{/each}
			</ol>
		</section>

		<section aria-labelledby="success" class="flex flex-col gap-1">
			<h2 id="success" class="text-lg font-extrabold">You're ready to move on when</h2>
			{@render text(exercise.successCriteria)}
		</section>

		<section
			id="if-struggling"
			aria-labelledby="struggling"
			class="flex scroll-mt-4 flex-col gap-2 rounded-2xl bg-soft px-4 py-3"
		>
			<h2 id="struggling" class="flex items-center gap-2 text-lg font-extrabold">
				<Icon name="struggling" class="text-primary" />
				If your puppy struggles
			</h2>
			{@render text(exercise.ifStruggling)}
		</section>

		{#if exercise.safetyNotes}
			<section
				aria-labelledby="safety"
				class="flex flex-col gap-2 rounded-2xl border border-border px-4 py-3"
			>
				<h2 id="safety" class="flex items-center gap-2 text-lg font-extrabold">
					<Icon name="alert" class="text-warn" />
					Safety
				</h2>
				{@render text(exercise.safetyNotes)}
			</section>
		{/if}

		<section aria-labelledby="reading" class="flex flex-col gap-1">
			<h2 id="reading" class="text-lg font-extrabold">Further reading</h2>
			<ul class="flex flex-col">
				{#each exercise.sources as source (source.url)}
					<li>
						<!-- An external page, so there's no route to resolve. -->
						<!-- eslint-disable svelte/no-navigation-without-resolve -->
						<a
							href={source.url}
							target="_blank"
							rel="noopener noreferrer"
							class="flex min-h-12 items-center gap-3 py-2 font-bold text-primary"
						>
							<Icon name={source.kind} />
							<span class="flex min-w-0 flex-1 flex-col">
								<span>{source.title}</span>
								<span class="text-sm font-normal text-muted-foreground"
									>{source.kind === 'video' ? 'Video' : 'Article'} · {new URL(
										source.url
									).hostname.replace(/^www\./, '')}</span
								>
							</span>
							<Icon name="external" label="opens in a new tab" />
						</a>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>
