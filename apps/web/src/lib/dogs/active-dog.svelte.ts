// Which dog the app is showing (ui.md §2.2): one dog, or all of them. It's per device, kept in
// localStorage as a convenience only, so a blocked or empty store just means "All dogs".
import { getContext, setContext } from 'svelte';
import type { Dog } from '@toe-beans/contracts';

const KEY = 'toe-beans:active-dog';
const ALL = 'all';

export class ActiveDog {
	#id = $state<string>(ALL);

	/** Reads the device's choice. Call from onMount: there's no localStorage on the server. */
	restore() {
		try {
			this.#id = localStorage.getItem(KEY) ?? ALL;
		} catch {
			this.#id = ALL;
		}
	}

	get id(): string {
		return this.#id;
	}

	select(id: string | null) {
		this.#id = id ?? ALL;
		try {
			localStorage.setItem(KEY, this.#id);
		} catch {
			// Not kept, but the choice still holds until the page reloads.
		}
	}

	/** The dog shown, or null for all of them. With one dog, it's always that dog. */
	among(dogs: readonly Dog[]): Dog | null {
		if (dogs.length === 1) return dogs[0]!;
		return dogs.find((d) => d.id === this.#id) ?? null;
	}
}

const context = Symbol('active-dog');

export const setActiveDog = (active: ActiveDog) => setContext(context, active);
export const getActiveDog = (): ActiveDog => getContext<ActiveDog>(context);
