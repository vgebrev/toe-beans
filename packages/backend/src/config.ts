// Configuration comes from env vars only, validated once at startup (architecture §7). The backend
// owns the schema, not the SvelteKit app, so another host (Fastify, the worker process) reuses it.
import { z } from 'zod';

/** Atlas Local on its default port, a single-node replica set; transactions need one. */
const LOCAL_MONGODB_URI = 'mongodb://localhost:27017/?directConnection=true';

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
		K_REVISION: z.string().max(100).optional()
	})
	.superRefine((e, ctx) => {
		// Prod must never fall back to a local database.
		if (e.APP_ENV === 'prod' && !e.MONGODB_URI) {
			ctx.addIssue({ code: 'custom', path: ['MONGODB_URI'], message: 'required in prod' });
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
		...(e.SENTRY_DSN && { sentry: { dsn: e.SENTRY_DSN } }),
		...((e.APP_RELEASE ?? e.K_REVISION) && { release: e.APP_RELEASE ?? e.K_REVISION })
	};
}
