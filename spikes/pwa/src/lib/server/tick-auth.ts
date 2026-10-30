// Spike S-1.3: /internal/tick accepts only Google-signed OIDC tokens minted by Cloud Scheduler for
// the tick service account (architecture §6.3). The service is public (no Cloud Run invoker check),
// so the app verifies the token itself.
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { TICK_AUDIENCE, TICK_INVOKER } from '$app/env/private';

const GOOGLE_CERTS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

export async function isScheduler(authorization: string | null): Promise<boolean> {
	const token = authorization?.match(/^Bearer (.+)$/)?.[1];
	if (!token || !TICK_AUDIENCE || !TICK_INVOKER) return false;
	try {
		const { payload } = await jwtVerify(token, GOOGLE_CERTS, {
			issuer: ['https://accounts.google.com', 'accounts.google.com'],
			audience: TICK_AUDIENCE
		});
		return payload.email === TICK_INVOKER && payload.email_verified === true;
	} catch {
		return false;
	}
}
