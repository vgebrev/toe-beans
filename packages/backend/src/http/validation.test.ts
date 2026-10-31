import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseInput } from './validation.js';

const Input = z.object({
	name: z.string().min(1),
	birthDate: z.object({ date: z.iso.date() }).optional()
});

describe('parseInput', () => {
	it('returns the parsed value', () => {
		expect(parseInput(Input, { name: 'Ripley', extra: 1 })).toEqual({
			ok: true,
			value: { name: 'Ripley' }
		});
	});

	it('collects messages by dotted path', () => {
		const result = parseInput(Input, { name: '', birthDate: { date: 'soon' } });
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.kind).toBe('validation');
			expect(Object.keys(result.error.fields ?? {})).toEqual(['name', 'birthDate.date']);
		}
	});

	it("reports a body that isn't an object at the root", () => {
		const result = parseInput(Input, 'nope');
		expect(!result.ok && Object.keys(result.error.fields ?? {})).toEqual(['']);
	});
});
