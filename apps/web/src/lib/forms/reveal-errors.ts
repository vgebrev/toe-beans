// A form whose check fails shows each message by its field (ui.md §5.1), which may be out of
// sight: the Dog choice at the top of a long form, say, while the person taps Save at the
// bottom. So after a submit, the first message is scrolled into view and its field focused,
// whether the browser's check put it there at once or the server's answer did a moment later.
import type { Attachment } from 'svelte/attachments';
import { tick } from 'svelte';

/** How long after a submit a message from the server still counts as its answer. */
const ANSWER_WINDOW_MS = 15_000;

/** Messages are `<p id="…-error">`, tied to their field by its `aria-describedby`. */
const MESSAGE = '[id$="-error"]';

/** Scrolls the form's first message into view and focuses its field; false if there's none. */
export function revealFirstError(form: HTMLElement): boolean {
	const message = form.querySelector<HTMLElement>(MESSAGE);
	if (!message) return false;
	const owner = form.querySelector<HTMLElement>(`[aria-describedby~="${CSS.escape(message.id)}"]`);
	// A group (radio pills, say) takes focus on its first choice.
	const field = owner?.matches('fieldset')
		? owner.querySelector<HTMLElement>('input:not([disabled]), select, textarea, button')
		: owner;
	// At once, not smoothly: a tap made while the page glides would land on whatever slid under it.
	(owner ?? message).scrollIntoView({ block: 'center' });
	field?.focus({ preventScroll: true });
	return true;
}

/** `{@attach revealErrors}` on a `<form>`: reveals the first message after each submit. */
export const revealErrors: Attachment<HTMLFormElement> = (form) => {
	let observer: MutationObserver | null = null;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const stop = () => {
		observer?.disconnect();
		observer = null;
		clearTimeout(timer);
	};
	const onSubmit = () => {
		stop();
		void tick().then(() => {
			if (revealFirstError(form)) return;
			// No message yet: watch for the server's, until it answers or the window closes.
			observer = new MutationObserver(() => {
				if (form.querySelector(MESSAGE)) {
					stop();
					revealFirstError(form);
				}
			});
			observer.observe(form, { childList: true, subtree: true });
			timer = setTimeout(stop, ANSWER_WINDOW_MS);
		});
	};
	form.addEventListener('submit', onSubmit);
	return () => {
		form.removeEventListener('submit', onSubmit);
		stop();
	};
};
