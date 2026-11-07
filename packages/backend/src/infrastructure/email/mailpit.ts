// The EmailSender for dev: hands the message to a local Mailpit, whose inbox shows it as a person
// would get it. Mailpit captures mail and relays nothing unless it's set up to. Its HTTP API
// rather than SMTP, so this needs no dependency.
import type { EmailSender } from '../../application/ports/index.js';
import { err, ok } from '../../domain/result.js';

const TIMEOUT_MS = 5_000;

export interface MailpitOptions {
	/** Mailpit's web address, e.g. `http://localhost:8025`. */
	url: string;
	/** e.g. `Toe Beans <invites@toebeans.co.za>`. */
	from: string;
	fetch?: typeof globalThis.fetch;
}

/** `Name <address>` as Mailpit wants it. */
function parseAddress(from: string): { Email: string; Name?: string } {
	const match = /^(.*?)\s*<(.+)>$/.exec(from);
	return match ? { Email: match[2]!, Name: match[1]! } : { Email: from };
}

export function mailpitEmailSender({
	url,
	from,
	fetch = globalThis.fetch
}: MailpitOptions): EmailSender {
	return {
		async send({ to, subject, text }) {
			try {
				const response = await fetch(new URL('/api/v1/send', url), {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						From: parseAddress(from),
						To: [{ Email: to }],
						Subject: subject,
						Text: text
					}),
					signal: AbortSignal.timeout(TIMEOUT_MS)
				});
				return response.ok ? ok(undefined) : err({ reason: `mailpit ${response.status}` });
			} catch (e) {
				return err({ reason: e instanceof Error ? e.name : 'unknown' });
			}
		}
	};
}
