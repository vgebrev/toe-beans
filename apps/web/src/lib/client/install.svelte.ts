// Installing Toe Beans (ui.md §6.3). Chrome offers to install once with `beforeinstallprompt`,
// which is kept so the app's own *Install* buttons can show the browser's dialog on a tap; it
// also stops Chrome's own install bar. Chrome doesn't send it when Toe Beans is already
// installed, or before the person has used the site a little, so without it the app can only
// point at the browser's menu.
import { isInstalled } from '#lib/push/browser.js';

/** Chrome's install event. Not in TypeScript's DOM types. */
interface BeforeInstallPromptEvent extends Event {
	prompt(): Promise<void>;
	readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallState =
	/** Running as the installed app. */
	| 'app'
	/** The browser will show its install dialog on a tap. */
	| 'available'
	/** Installed from this tab just now: open it from the home screen. */
	| 'installed'
	/** Neither: point at the browser's menu (it may be installed already). */
	| 'manual';

class Install {
	#app = $state(false);
	#prompt = $state<BeforeInstallPromptEvent | null>(null);
	#installed = $state(false);

	get state(): InstallState {
		if (this.#app) return 'app';
		if (this.#installed) return 'installed';
		return this.#prompt ? 'available' : 'manual';
	}

	/** Once, in the browser (hooks.client.ts). An offer that came first was kept by app.html. */
	start(): void {
		this.#app = isInstalled();
		const early = (window as { __toeBeansInstall?: BeforeInstallPromptEvent }).__toeBeansInstall;
		if (early) this.#prompt = early;
		window.addEventListener('beforeinstallprompt', (event) => {
			event.preventDefault();
			this.#prompt = event as BeforeInstallPromptEvent;
		});
		window.addEventListener('appinstalled', () => {
			this.#installed = true;
			this.#prompt = null;
		});
	}

	/** The browser's install dialog, from a tap. Each event can be used once. */
	async prompt(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
		const event = this.#prompt;
		if (!event) return 'unavailable';
		this.#prompt = null;
		await event.prompt();
		const { outcome } = await event.userChoice;
		if (outcome === 'accepted') this.#installed = true;
		return outcome;
	}
}

export const install = new Install();
