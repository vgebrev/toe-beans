// pino JSON to stdout (architecture §9). Cloud Logging reads `severity`, `message` and `time` from
// each line; `docker logs` shows the same lines when self-hosting.
import {
	pino,
	stdSerializers,
	stdTimeFunctions,
	type DestinationStream,
	type Logger as Pino
} from 'pino';
import type { LogFields, Logger } from '../../application/ports/index.js';
import { currentRequestContext } from '../request-context.js';
import { scrubText } from './scrub.js';

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

// Cloud Logging's LogSeverity names.
const severity: Record<string, string> = {
	trace: 'DEBUG',
	debug: 'DEBUG',
	info: 'INFO',
	warn: 'WARNING',
	error: 'ERROR',
	fatal: 'CRITICAL'
};

/**
 * Field names that are never written out, at the top level or up to two objects down (NFR-12):
 * credentials, contact details, push subscriptions and free text people type about their dogs.
 * Callers shouldn't log these at all; this is the safety net.
 */
export const REDACTED_KEYS = [
	'authorization',
	'cookie',
	'set-cookie',
	'password',
	'secret',
	'token',
	'accessToken',
	'idToken',
	'refreshToken',
	'email',
	'endpoint',
	'keys',
	'p256dh',
	'uri',
	'notes'
];

const redactPaths = REDACTED_KEYS.flatMap((key) => {
	const k = `["${key}"]`;
	return [k, `*${k}`, `*.*${k}`];
});

export interface PinoLoggerOptions {
	level: LogLevel;
	/** Where lines go; stdout by default. Tests pass a stream. */
	destination?: DestinationStream;
}

export function createPinoLogger({ level, destination }: PinoLoggerOptions): Logger {
	const logger = pino(
		{
			level,
			messageKey: 'message',
			// No pid or hostname: the platform records the instance.
			base: null,
			timestamp: stdTimeFunctions.isoTime,
			formatters: { level: (label) => ({ severity: severity[label] ?? 'DEFAULT' }) },
			mixin: () => ({ ...currentRequestContext() }),
			redact: { paths: redactPaths, censor: '[redacted]' },
			serializers: { err: serializeError }
		},
		destination
	);
	return wrap(logger);
}

function serializeError(err: unknown) {
	if (!(err instanceof Error)) return err;
	const out = stdSerializers.err(err);
	out.message = scrubText(out.message);
	out.stack = scrubText(out.stack);
	return out;
}

const wrap = (p: Pino): Logger => ({
	debug: (message, fields) => p.debug(fields ?? {}, message),
	info: (message, fields) => p.info(fields ?? {}, message),
	warn: (message, fields) => p.warn(fields ?? {}, message),
	error: (message, fields) => p.error(fields ?? {}, message),
	child: (fields: LogFields) => wrap(p.child(fields))
});
