import { describe, expect, it } from 'vitest';
import { err, ok, type Result } from './result.js';

describe('Result', () => {
	it('narrows on ok', () => {
		const r: Result<number, string> = Math.random() < 2 ? ok(1) : err('never');
		expect(r.ok && r.value).toBe(1);
	});

	it('carries the error', () => {
		const r: Result<number, string> = err('conflict');
		expect(!r.ok && r.error).toBe('conflict');
	});
});
