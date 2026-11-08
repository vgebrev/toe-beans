<script lang="ts">
	// Adding or editing a dog (ui.md J1 step 4, §4.5). Adding takes the photo too, since a dog
	// can't be saved without one; editing changes the details, and the photo changes on its own.
	// Saving follows §5.2: nothing typed is lost on a failure, and the button becomes Retry.
	import { invalidateAll } from '$app/navigation';
	import { Dog, type BirthDate } from '@toe-beans/contracts';
	import Icon from '#lib/components/icon/Icon.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { createApiClient } from '#lib/api-client/index.js';
	import { monthsAgo, monthsBetween } from '#lib/dogs/age.js';
	import DogPhotoField from './DogPhotoField.svelte';

	interface Props {
		/** The dog being edited; adding a new one without it. */
		dog?: Dog;
		/** Today in the household's time zone, `YYYY-MM-DD`. */
		today: string;
		submitLabel: string;
		onsaved: (dog: Dog) => void | Promise<void>;
	}

	let { dog, today, submitLabel, onsaved }: Props = $props();

	const api = createApiClient((input, init) => fetch(input, init));
	const MONTHS_MAX = 300;

	// The form starts from the dog once. The page remounts it, keyed by ETag, for a newer version.
	// svelte-ignore state_referenced_locally
	const initial = dog;
	// svelte-ignore state_referenced_locally
	const initialMonths = initial?.birth ? monthsBetween(initial.birth.date, today) : null;

	let name = $state(initial?.name ?? '');
	let birthMode = $state<'date' | 'approx'>(
		initial?.birth && initial.birth.precision !== 'day' ? 'approx' : 'date'
	);
	let birthDate = $state(initial?.birth?.precision === 'day' ? initial.birth.date : '');
	// A number input binds to a number, or null when it's empty.
	let monthsOld = $state<number | null>(
		initial?.birth && initial.birth.precision !== 'day' ? initialMonths : null
	);
	let adoptionDate = $state(initial?.adoptionDate ?? '');
	let notes = $state(initial?.notes ?? '');
	let photo = $state<Blob | null>(null);

	type Field = 'name' | 'birth' | 'adoptionDate' | 'notes' | 'photo';
	let errors = $state<Partial<Record<Field, string>>>({});
	let status = $state<'idle' | 'saving' | 'failed' | 'signed-out' | 'conflict'>('idle');

	function birth(): BirthDate | null | 'invalid' {
		if (birthMode === 'date') return birthDate ? { date: birthDate, precision: 'day' } : null;
		if (monthsOld === null || monthsOld === undefined) return null;
		const months = monthsOld;
		if (!Number.isInteger(months) || months < 0 || months > MONTHS_MAX) return 'invalid';
		// Unchanged, so the estimate isn't moved to today's date.
		if (initial?.birth && initial.birth.precision !== 'day' && months === initialMonths) {
			return initial.birth;
		}
		return { date: monthsAgo(months, today), precision: 'month' };
	}

	function check(): boolean {
		const next: typeof errors = {};
		if (name.trim() === '') next.name = "Enter your dog's name.";
		if (birth() === 'invalid') next.birth = `Enter whole months, from 0 to ${MONTHS_MAX}.`;
		if (!initial && !photo) next.photo = 'Add a photo of your dog.';
		errors = next;
		return Object.keys(next).length === 0;
	}

	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (status === 'saving' || !check()) return;
		status = 'saving';
		const details = {
			name,
			birth: birth() as BirthDate | null,
			adoptionDate: adoptionDate || null,
			notes: notes.trim() === '' ? null : notes
		};
		let result;
		if (initial) {
			result = await api.send('PATCH', `/dogs/${initial.id}`, {
				body: details,
				ifMatch: initial.etag,
				schema: Dog
			});
		} else {
			const form = new FormData();
			form.set('dog', JSON.stringify(details));
			form.set('photo', photo!, 'photo.jpg');
			result = await api.send('POST', '/dogs', { form, schema: Dog });
		}
		if (result.ok) {
			status = 'idle';
			await onsaved(result.data);
			return;
		}
		const { error } = result;
		if (error.kind === 'problem') {
			const { status: code, errors: fields } = error.problem;
			if (code === 400 && fields) {
				errors = {
					name: fields['name']?.[0],
					birth: fields['birth.date']?.[0] ?? fields['birth']?.[0],
					adoptionDate: fields['adoptionDate']?.[0],
					notes: fields['notes']?.[0],
					photo: fields['photo']?.[0]
				};
				status = 'idle';
				return;
			}
			if (code === 401) {
				status = 'signed-out';
				return;
			}
			if (code === 412) {
				status = 'conflict';
				return;
			}
		}
		status = 'failed';
	}

	const clear = (field: Field) => () => (errors = { ...errors, [field]: undefined });
	const describedBy = (field: Field, hint?: string) => (errors[field] ? `${field}-error` : hint);
	const chip =
		'flex min-h-12 flex-1 cursor-pointer items-center justify-center rounded-full border border-input px-4 font-bold has-checked:border-primary has-checked:bg-soft has-checked:text-primary has-focus-visible:ring-3 has-focus-visible:ring-ring/50';
</script>

<form class="flex flex-col gap-6" onsubmit={save} novalidate>
	{#if !initial}
		<DogPhotoField bind:photo error={errors.photo} onchosen={clear('photo')} />
	{/if}

	<div class="flex flex-col gap-2">
		<Label for="dog-name" class="font-bold">Name</Label>
		<Input
			id="dog-name"
			maxlength={50}
			autocomplete="off"
			bind:value={name}
			oninput={clear('name')}
			aria-invalid={errors.name ? 'true' : undefined}
			aria-describedby={describedBy('name')}
		/>
		{#if errors.name}
			<p id="name-error" class="text-sm text-destructive">{errors.name}</p>
		{/if}
	</div>

	<fieldset class="flex flex-col gap-3" aria-describedby={describedBy('birth')}>
		<legend class="mb-2 font-bold">
			Birth date <span class="font-normal text-muted-foreground">(optional)</span>
		</legend>
		<div class="flex gap-2">
			<label class={chip}>
				<input type="radio" class="sr-only" value="date" bind:group={birthMode} />
				I know the date
			</label>
			<label class={chip}>
				<input type="radio" class="sr-only" value="approx" bind:group={birthMode} />
				Approximate
			</label>
		</div>
		{#if birthMode === 'date'}
			<Label for="birth-date" class="sr-only">Birth date</Label>
			<Input
				id="birth-date"
				type="date"
				max={today}
				bind:value={birthDate}
				oninput={clear('birth')}
				aria-invalid={errors.birth ? 'true' : undefined}
			/>
		{:else}
			<div class="flex flex-col gap-2">
				<Label for="months-old">Months old</Label>
				<Input
					id="months-old"
					type="number"
					inputmode="numeric"
					min={0}
					max={MONTHS_MAX}
					class="max-w-32"
					bind:value={monthsOld}
					oninput={clear('birth')}
					aria-invalid={errors.birth ? 'true' : undefined}
				/>
			</div>
		{/if}
		{#if errors.birth}
			<p id="birth-error" class="text-sm text-destructive">{errors.birth}</p>
		{/if}
	</fieldset>

	<div class="flex flex-col gap-2">
		<Label for="adoption-date" class="font-bold">
			Adoption date <span class="font-normal text-muted-foreground">(optional)</span>
		</Label>
		<Input
			id="adoption-date"
			type="date"
			max={today}
			bind:value={adoptionDate}
			oninput={clear('adoptionDate')}
			aria-invalid={errors.adoptionDate ? 'true' : undefined}
			aria-describedby={describedBy('adoptionDate')}
		/>
		{#if errors.adoptionDate}
			<p id="adoptionDate-error" class="text-sm text-destructive">{errors.adoptionDate}</p>
		{/if}
	</div>

	<div class="flex flex-col gap-2">
		<Label for="dog-notes" class="font-bold">
			Notes <span class="font-normal text-muted-foreground">(optional)</span>
		</Label>
		<Textarea
			id="dog-notes"
			maxlength={2000}
			bind:value={notes}
			oninput={clear('notes')}
			aria-invalid={errors.notes ? 'true' : undefined}
			aria-describedby={describedBy('notes', 'notes-hint')}
		/>
		{#if errors.notes}
			<p id="notes-error" class="text-sm text-destructive">{errors.notes}</p>
		{:else}
			<p id="notes-hint" class="text-sm text-muted-foreground">
				Anything the household should know, such as favourite treats or what they find scary.
			</p>
		{/if}
	</div>

	{#if status === 'failed'}
		<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3">
			Couldn't save — check your connection.
		</p>
	{:else if status === 'signed-out'}
		<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3">
			You've been signed out. Sign in again, then save.
		</p>
	{:else if status === 'conflict'}
		<div
			role="alert"
			class="flex flex-col gap-3 rounded-2xl border border-border bg-soft px-4 py-3"
		>
			<p>Someone changed {initial?.name ?? 'this dog'} a moment ago. Nothing was saved.</p>
			<Button type="button" variant="outline" onclick={() => invalidateAll()}>
				See their version
			</Button>
		</div>
	{/if}

	<!-- Never disabled for a missing field (a tap says what's missing). Saving shows in the label,
	     and a conflict in the alert above. -->
	<Button type="submit" class="w-full" disabled={status === 'saving' || status === 'conflict'}>
		{#if status === 'saving'}
			<Icon name="saving" class="animate-spin" />
			Saving…
		{:else if status === 'failed'}
			Retry
		{:else}
			{submitLabel}
		{/if}
	</Button>
</form>
