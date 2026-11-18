// Whether saves can reach Toe Beans right now (ui.md §6.1, NFR-04), for the offline banner. The
// device's own online flag is the first sign; requests are the second, since a phone can say
// it's online with no way out (a captive portal, a dead mobile signal). After a request fails,
// /healthz is asked again after 1, 2, 4 and 8 s, then every 15 s, until one gets through: the
// phone's `online` comes a moment before its network works, so the first check often fails.
import { observeConnection } from '#lib/api-client/index.js';

export type ConnectionState = 'online' | 'offline' | 'unreachable';

const RETRY_AFTER_MS = [1_000, 2_000, 4_000, 8_000];
const PROBE_EVERY_MS = 15_000;

class Connection {
	#deviceOnline = $state(true);
	#failing = $state(false);
	#probe: ReturnType<typeof setTimeout> | undefined;
	/** Checks failed since the last answer, for the back-off. */
	#misses = 0;

	get state(): ConnectionState {
		if (!this.#deviceOnline) return 'offline';
		return this.#failing ? 'unreachable' : 'online';
	}

	/** Once, in the browser (hooks.client.ts). */
	start(): void {
		this.#deviceOnline = navigator.onLine;
		window.addEventListener('online', () => {
			this.#deviceOnline = true;
			void this.#check();
		});
		window.addEventListener('offline', () => (this.#deviceOnline = false));
		observeConnection((reached) => this.#reached(reached));
	}

	#reached(reached: boolean): void {
		this.#failing = !reached;
		if (reached) {
			clearTimeout(this.#probe);
			this.#probe = undefined;
			this.#misses = 0;
		} else {
			// One check waiting at a time, however many requests fail meanwhile.
			this.#probe ??= setTimeout(() => {
				this.#probe = undefined;
				void this.#check();
			}, RETRY_AFTER_MS[this.#misses++] ?? PROBE_EVERY_MS);
		}
	}

	/** Not while the phone says it's offline: its `online` event checks again. */
	async #check(): Promise<void> {
		if (!navigator.onLine) return;
		try {
			const response = await fetch('/healthz', { cache: 'no-store' });
			this.#reached(response.ok);
		} catch {
			this.#reached(false);
		}
	}
}

export const connection = new Connection();
