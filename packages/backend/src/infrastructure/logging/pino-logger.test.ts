import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { withRequestContext } from '../request-context.js';
import { createPinoLogger, type LogLevel } from './pino-logger.js';

function capture(level: LogLevel = 'info') {
	const lines: Record<string, unknown>[] = [];
	const destination = new Writable({
		write(chunk, _encoding, done) {
			lines.push(JSON.parse(String(chunk)));
			done();
		}
	});
	return { logger: createPinoLogger({ level, destination }), lines };
}

describe('createPinoLogger', () => {
	it('writes lines Cloud Logging understands', () => {
		const { logger, lines } = capture();
		logger.warn('slow query', { durationMs: 412 });
		expect(lines).toEqual([
			{ severity: 'WARNING', time: expect.any(String), message: 'slow query', durationMs: 412 }
		]);
		expect(new Date(lines[0]!.time as string).toISOString()).toBe(lines[0]!.time);
	});

	it('respects the level', () => {
		const { logger, lines } = capture('info');
		logger.debug('noise');
		logger.info('kept');
		expect(lines.map((l) => l.message)).toEqual(['kept']);
	});

	it('adds the request ID while a request is handled, including in children', () => {
		const { logger, lines } = capture();
		withRequestContext({ requestId: 'req-12345678' }, () => {
			logger.info('inside');
			logger.child({ component: 'worker' }).info('child');
		});
		logger.info('outside');
		expect(lines.map((l) => l.requestId)).toEqual(['req-12345678', 'req-12345678', undefined]);
		expect(lines[1]!.component).toBe('worker');
	});

	it('redacts sensitive fields at the top level and nested', () => {
		const { logger, lines } = capture();
		logger.info('sensitive', {
			email: 'a@example.com',
			token: 't0k3n',
			headers: { cookie: 'sid=abc', authorization: 'Bearer x', 'set-cookie': 'sid=abc' },
			subscription: { endpoint: 'https://fcm.googleapis.com/x', keys: { p256dh: 'k' } },
			req: { body: { notes: 'Ripley bit the postman', title: 'Recall' } },
			count: 3
		});
		const line = JSON.stringify(lines[0]);
		for (const secret of [
			'a@example.com',
			't0k3n',
			'sid=abc',
			'Bearer',
			'fcm.googleapis',
			'postman'
		]) {
			expect(line).not.toContain(secret);
		}
		expect(lines[0]).toMatchObject({ count: 3, req: { body: { title: 'Recall' } } });
	});

	it('serialises errors with their stack and keeps error codes', () => {
		const { logger, lines } = capture();
		const err = Object.assign(new Error('boom'), { code: 11000 });
		logger.error('failed', { err });
		logger.error('insert failed', {
			err: new Error('E11000 index: email_1 dup key: { email: "jo@example.com" }')
		});
		expect(JSON.stringify(lines[1])).not.toContain('jo@example.com');
		expect(lines[0]).toMatchObject({
			severity: 'ERROR',
			err: { type: 'Error', message: 'boom', code: 11000, stack: expect.stringContaining('boom') }
		});
	});
});
