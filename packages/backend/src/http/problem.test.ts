import { Problem } from '@toe-beans/contracts';
import { describe, expect, it } from 'vitest';
import {
	conflictError,
	forbidden,
	notFound,
	preconditionRequired,
	staleVersion,
	unauthenticated,
	validationError,
	type AppError
} from '../application/errors.js';
import { err, ok } from '../domain/result.js';
import { toProblem } from './problem.js';
import { json, respond } from './response.js';

describe('toProblem', () => {
	it.each<[AppError, string, number]>([
		[validationError('Bad', { name: ['Required'] }), 'toe-beans/validation', 400],
		[unauthenticated, 'toe-beans/unauthenticated', 401],
		[forbidden, 'toe-beans/forbidden', 403],
		[notFound('dog'), 'toe-beans/not-found', 404],
		[conflictError('Last owner'), 'toe-beans/conflict', 409],
		[staleVersion, 'toe-beans/conflict', 412],
		[preconditionRequired, 'toe-beans/precondition-required', 428]
	])('maps %o to %s %i, matching the contract', (error, type, status) => {
		const problem = toProblem(error);
		expect(problem).toMatchObject({ type, status });
		expect(Problem.parse(problem)).toEqual(problem);
	});

	it('passes field errors through for the form to show', () => {
		expect(
			toProblem(validationError('Bad', { 'birthDate.date': ['Too far ahead'] })).errors
		).toEqual({
			'birthDate.date': ['Too far ahead']
		});
	});

	it('names the resource but no ID', () => {
		expect(toProblem(notFound('dog')).title).toBe('Dog not found');
	});
});

describe('respond', () => {
	it('sends a problem for an error, uncached', () => {
		const res = respond(err(notFound('dog')), (v) => json(v));
		expect(res.status).toBe(404);
		expect(res.headers).toMatchObject({
			'content-type': 'application/problem+json',
			'cache-control': 'no-store'
		});
	});

	it('sends the success through onOk', () => {
		expect(respond(ok({ id: 1 }), (v) => json(v, 201))).toMatchObject({
			status: 201,
			body: { id: 1 }
		});
	});
});
