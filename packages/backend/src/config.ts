// Configuration comes from env vars only, validated once at startup (architecture §7). The backend
// owns the schema, not the SvelteKit app, so another host (Fastify, the worker process) reuses it.
import { z } from 'zod';

/** Atlas Local on its default port, a single-node replica set; transactions need one. */
const LOCAL_MONGODB_URI = 'mongodb://localhost:27017/?directConnection=true';

/** `pnpm dev`'s origin. */
const LOCAL_ORIGIN = 'http://localhost:7877';

/**
 * The mock OIDC provider from `pnpm compose` (architecture §3.4). It accepts any client, so these
 * aren't secrets; set OIDC_* to use the Auth0 dev tenant instead.
 */
const LOCAL_OIDC = {
	issuer: 'http://localhost:8090/default',
	clientId: 'toe-beans-local',
	clientSecret: 'local-secret'
};

const httpUrl = z.url({ protocol: /^https?$/ });

type Sender = 'console' | 'mailpit' | 'resend';

/** Local runs print emails unless told otherwise; prod sends them. */
const senderOf = (e: { APP_ENV: string; EMAIL_SENDER?: Sender | undefined }): Sender =>
	e.EMAIL_SENDER ?? (e.APP_ENV === 'prod' ? 'resend' : 'console');

const Env = z
	.object({
		APP_ENV: z.enum(['local', 'prod']).default('local'),
		LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
		MONGODB_URI: z
			.string()
			.regex(/^mongodb(\+srv)?:\/\//, 'must be a mongodb:// or mongodb+srv:// URI')
			.optional(),
		MONGODB_DB: z
			.string()
			.regex(/^[A-Za-z0-9_-]{1,63}$/, 'must be a database name')
			.default('toe-beans'),
		// Optional: without it errors are only logged. The browser reads the same variable.
		SENTRY_DSN: z.url({ protocol: /^https$/ }).optional(),
		// Tags error reports with the deployed version. Cloud Run sets K_REVISION itself.
		APP_RELEASE: z.string().max(100).optional(),
		K_REVISION: z.string().max(100).optional(),
		// The origin users reach the app on; callback URLs and the Origin check derive from it.
		PUBLIC_BASE_URL: httpUrl
			.refine((u) => new URL(u).origin === u.replace(/\/$/, ''), 'must be an origin, no path')
			.optional(),
		OIDC_ISSUER: httpUrl.optional(),
		OIDC_CLIENT_ID: z.string().max(200).optional(),
		OIDC_CLIENT_SECRET: z.string().max(500).optional(),
		// Sign-in steps (start and callback) one client address may make per 10 minutes, per
		// instance (architecture §7). An attempt is two steps; e2e raises it, since every test
		// signs in from localhost.
		AUTH_RATE_LIMIT: z.coerce.number().int().min(2).max(100_000).default(30),
		// Looks at and acceptances of invitations one client address may make per 10 minutes, per
		// instance (architecture §7). E2e raises it for the same reason.
		INVITE_RATE_LIMIT: z.coerce.number().int().min(1).max(100_000).default(30),
		// Where email goes (architecture §3.7). Always chosen here, never by a key being present, so
		// a dev machine holding a Resend key still can't mail real people by accident.
		EMAIL_SENDER: z.enum(['console', 'mailpit', 'resend']).optional(),
		MAILPIT_URL: httpUrl.default('http://localhost:8025'),
		RESEND_API_KEY: z.string().max(200).optional(),
		EMAIL_FROM: z.string().max(200).default('Toe Beans <invites@toebeans.co.za>')
	})
	.superRefine((e, ctx) => {
		// Prod must never fall back to a local database.
		if (e.APP_ENV === 'prod' && !e.MONGODB_URI) {
			ctx.addIssue({ code: 'custom', path: ['MONGODB_URI'], message: 'required in prod' });
		}
		const required = (key: keyof typeof e, message: string) =>
			ctx.addIssue({ code: 'custom', path: [key], message });
		if (e.APP_ENV === 'prod') {
			// Prod must never fall back to the mock provider, and never runs on plain http.
			for (const key of ['PUBLIC_BASE_URL', 'OIDC_ISSUER'] as const) {
				if (!e[key]) required(key, 'required in prod');
				else if (!e[key].startsWith('https:')) required(key, 'must be https in prod');
			}
			// The others only suit a dev machine: the console sender prints invite links.
			if (e.EMAIL_SENDER && e.EMAIL_SENDER !== 'resend') {
				required('EMAIL_SENDER', 'must be resend in prod');
			}
		}
		// A real provider needs its client credentials; only the mock's are defaulted.
		if (e.OIDC_ISSUER || e.APP_ENV === 'prod') {
			for (const key of ['OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET'] as const) {
				if (!e[key]) required(key, 'required with OIDC_ISSUER');
			}
		}
		if (senderOf(e) === 'resend' && !e.RESEND_API_KEY) {
			required('RESEND_API_KEY', 'required to send through Resend');
		}
	});

export interface Config {
	/** Which environment this is (architecture §8.3). */
	appEnv: 'local' | 'prod';
	logLevel: z.infer<typeof Env>['LOG_LEVEL'];
	mongodb: { uri: string; db: string };
	sentry?: { dsn: string };
	/** The deployed version, if known. */
	release?: string;
	/** e.g. `https://toebeans.co.za`, no trailing slash. */
	publicOrigin: string;
	oidc: { issuer: string; clientId: string; clientSecret: string };
	/** Sign-in steps per client address per `windowMs`. */
	authRateLimit: { limit: number; windowMs: number };
	/** Looks at and acceptances of invitations per client address per `windowMs`. */
	inviteRateLimit: { limit: number; windowMs: number };
	email: EmailConfig;
}

/** Which EmailSender runs, with what it needs (`infrastructure/email`). */
export type EmailConfig =
	| { kind: 'console' }
	| { kind: 'mailpit'; url: string; from: string }
	| { kind: 'resend'; apiKey: string; from: string };

function emailConfig(e: z.infer<typeof Env>): EmailConfig {
	const from = e.EMAIL_FROM;
	switch (senderOf(e)) {
		case 'console':
			return { kind: 'console' };
		case 'mailpit':
			return { kind: 'mailpit', url: e.MAILPIT_URL, from };
		case 'resend':
			return { kind: 'resend', apiKey: e.RESEND_API_KEY!, from };
	}
}

export class ConfigError extends Error {
	override name = 'ConfigError';
}

/**
 * Throws a ConfigError listing every bad variable, so a deploy fails fast and says why. Messages
 * name variables but never their values, which may be secrets.
 */
export function loadConfig(env: Record<string, string | undefined>): Config {
	// An empty variable counts as unset, as `FOO=` in a .env file usually means.
	const present = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== ''));
	const parsed = Env.safeParse(present, { reportInput: false });
	if (!parsed.success) {
		const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
		throw new ConfigError(`Invalid configuration:\n  ${problems.join('\n  ')}`);
	}
	const e = parsed.data;
	return {
		appEnv: e.APP_ENV,
		logLevel: e.LOG_LEVEL,
		mongodb: { uri: e.MONGODB_URI ?? LOCAL_MONGODB_URI, db: e.MONGODB_DB },
		publicOrigin: e.PUBLIC_BASE_URL ? new URL(e.PUBLIC_BASE_URL).origin : LOCAL_ORIGIN,
		oidc: e.OIDC_ISSUER
			? { issuer: e.OIDC_ISSUER, clientId: e.OIDC_CLIENT_ID!, clientSecret: e.OIDC_CLIENT_SECRET! }
			: LOCAL_OIDC,
		authRateLimit: { limit: e.AUTH_RATE_LIMIT, windowMs: 10 * 60_000 },
		inviteRateLimit: { limit: e.INVITE_RATE_LIMIT, windowMs: 10 * 60_000 },
		email: emailConfig(e),
		...(e.SENTRY_DSN && { sentry: { dsn: e.SENTRY_DSN } }),
		...((e.APP_RELEASE ?? e.K_REVISION) && { release: e.APP_RELEASE ?? e.K_REVISION })
	};
}
