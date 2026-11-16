// Who may run the reminder tick over HTTP (architecture §6.3). On Cloud Run the service is public,
// so the app checks the caller itself: a Google-signed OIDC token minted by Cloud Scheduler for
// the tick's service account (as in spike S-1.3), or on other hosts a shared secret. With neither
// configured, every call is refused.
import { timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { TickAuthenticator } from '../../application/ports/tick.js';

export interface TickAuthOptions {
	/** `Authorization: Bearer <secret>`. */
	secret?: string;
	/** Cloud Scheduler's OIDC token: the audience it's minted for and the service account's email. */
	google?: { audience: string; invoker: string };
}

const GOOGLE_CERTS = 'https://www.googleapis.com/oauth2/v3/certs';

export function tickAuthenticator({ secret, google }: TickAuthOptions): TickAuthenticator {
	const keys = google ? createRemoteJWKSet(new URL(GOOGLE_CERTS)) : null;
	const expected = secret ? Buffer.from(secret) : null;
	return {
		async verify(authorization) {
			const token = authorization?.match(/^Bearer (\S+)$/)?.[1];
			if (!token) return false;
			if (expected) {
				const given = Buffer.from(token);
				if (given.length === expected.length && timingSafeEqual(given, expected)) return true;
			}
			if (!google || !keys) return false;
			try {
				const { payload } = await jwtVerify(token, keys, {
					issuer: ['https://accounts.google.com', 'accounts.google.com'],
					audience: google.audience
				});
				return payload.email === google.invoker && payload.email_verified === true;
			} catch {
				return false;
			}
		}
	};
}
