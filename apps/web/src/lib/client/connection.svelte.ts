// Whether saves can reach Toe Beans right now (ui.md §6.1, NFR-04), for the offline banner. The
// device's own online flag is the first sign; requests are the second, since a phone can say
// it's online with no way out (a captive portal, a dead mobile signal). After a request fails,
// /healthz is asked every 15 s until one gets through.
import { observeConnection } from '#lib/api-client/index.js';

export type ConnectionState = 'online' | 'offline' | 'unreachable';

const PROBE_EVERY_MS = 15_000;

class Connection {
	#deviceOnline = $state(true);
	#failing = $state(false);
	#probe: ReturnType<typeof setInterval> | undefined;

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
			clearInterval(this.#probe);
			this.#probe = undefined;
		} else {
			this.#probe ??= setInterval(() => void this.#check(), PROBE_EVERY_MS);
		}
	}

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
