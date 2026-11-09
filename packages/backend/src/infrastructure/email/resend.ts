// The EmailSender port over Resend's HTTP API (architecture §3.7). A plain fetch: one endpoint
// doesn't justify a dependency.
import type { EmailSender } from '../../application/ports/index.js';
import { err, ok } from '../../domain/result.js';

export const RESEND_URL = 'https://api.resend.com/emails';
const TIMEOUT_MS = 10_000;

export interface ResendOptions {
	apiKey: string;
	/** e.g. `Toe Beans <invites@toebeans.co.za>`; the domain must be verified with Resend. */
	from: string;
	fetch?: typeof globalThis.fetch;
}

export function resendEmailSender({
	apiKey,
	from,
	fetch = globalThis.fetch
}: ResendOptions): EmailSender {
	return {
		async send({ to, subject, text }) {
			try {
				const response = await fetch(RESEND_URL, {
					method: 'POST',
					headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
					body: JSON.stringify({ from, to: [to], subject, text }),
					signal: AbortSignal.timeout(TIMEOUT_MS)
				});
				// The status only: Resend's error body can quote the address.
				return response.ok ? ok(undefined) : err({ reason: `resend ${response.status}` });
			} catch (e) {
				return err({ reason: e instanceof Error ? e.name : 'unknown' });
			}
		}
	};
}
