// The EmailSender for local runs: prints the message, so an invite link can be copied from the
// terminal. Straight to the console, not the logger: links must never reach the logs, and config
// refuses this adapter in prod.
import type { EmailSender } from '../../application/ports/index.js';
import { ok } from '../../domain/result.js';

export const consoleEmailSender = (): EmailSender => ({
	async send({ to, subject, text }) {
		console.info(`\n--- email to ${to}: ${subject}\n${text}\n---\n`);
		return ok(undefined);
	}
});
