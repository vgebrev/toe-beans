import { describe, expect, it } from 'vitest';
import { Problem } from './problem.js';

describe('Problem', () => {
	it('accepts a conflict problem', () => {
		const problem = { type: 'toe-beans/conflict', title: 'Someone else changed this', status: 412 };
		expect(Problem.parse(problem)).toEqual(problem);
	});

	it('rejects unknown problem types', () => {
		expect(Problem.safeParse({ type: 'about:blank', title: 'x', status: 400 }).success).toBe(false);
	});
});
