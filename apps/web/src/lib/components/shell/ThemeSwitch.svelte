<script lang="ts">
	// Per-device theme choice (ui.md §6.4): a segmented control with radio-group semantics
	// (ui.md §7). Native radios, so it works with the keyboard and TalkBack as is.
	import { onMount } from 'svelte';
	import Icon from '#lib/components/icon/Icon.svelte';
	import {
		applyThemeChoice,
		readThemeChoice,
		saveThemeChoice,
		type ThemeChoice
	} from '#lib/client/theme.js';

	const options: { value: ThemeChoice; label: string }[] = [
		{ value: 'system', label: 'System' },
		{ value: 'light', label: 'Light' },
		{ value: 'dark', label: 'Dark' }
	];

	// The server can't see this device's choice, so it renders System until mounted.
	let choice = $state<ThemeChoice>('system');
	let unsaved = $state(false);

	onMount(() => {
		choice = readThemeChoice();
	});

	function choose(value: ThemeChoice) {
		choice = value;
		applyThemeChoice(value);
		unsaved = !saveThemeChoice(value);
	}
</script>

<fieldset class="flex flex-col gap-2">
	<legend class="mb-2 font-bold">Theme</legend>
	<div class="grid grid-cols-3 gap-1 rounded-full bg-soft p-1">
		{#each options as option (option.value)}
			<label
				class={[
					'flex h-12 cursor-pointer items-center justify-center gap-1.5 rounded-full font-bold transition-colors',
					'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary',
					choice === option.value
						? 'bg-primary text-primary-foreground'
						: 'text-muted-foreground hover:text-foreground'
				]}
			>
				<input
					type="radio"
					name="theme"
					value={option.value}
					checked={choice === option.value}
					onchange={() => choose(option.value)}
					class="sr-only"
				/>
				<Icon name={`theme-${option.value}`} size={20} />
				{option.label}
			</label>
		{/each}
	</div>
	<p class="text-sm text-muted-foreground">
		System follows your phone's dark mode setting. The choice applies to this device only.
	</p>
	<p role="status" class="text-sm text-warn">
		{#if unsaved}This browser won't remember the choice after you close the app.{/if}
	</p>
</fieldset>
