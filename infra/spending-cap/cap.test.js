import { describe, expect, it, vi } from 'vitest';
import { configFrom, decide, takeDown } from './cap.js';

/** A push body as Pub/Sub sends it, with Cloud Billing's notice as the data. */
const push = (/** @type {object} */ notice) => ({
	message: { data: Buffer.from(JSON.stringify(notice)).toString('base64'), messageId: '1' },
	subscription: 'projects/p/subscriptions/toe-beans-cap'
});

const notice = {
	budgetDisplayName: 'toe-beans',
	costAmount: 1.02,
	costIntervalStart: '2026-11-01T08:00:00Z',
	budgetAmount: 1,
	budgetAmountType: 'SPECIFIED_AMOUNT',
	currencyCode: 'USD'
};

describe('decide', () => {
	it('caps once the spend reaches the budget', () => {
		expect(decide(push(notice), 'toe-beans')).toEqual({ cap: true, cost: 1.02, budget: 1 });
		expect(decide(push({ ...notice, costAmount: 1 }), 'toe-beans').cap).toBe(true);
	});

	it('leaves the app up under budget, whatever the forecast', () => {
		const decision = decide(
			push({ ...notice, costAmount: 0.4, alertThresholdExceeded: 1, forecastThresholdExceeded: 1 }),
			'toe-beans'
		);
		expect(decision).toEqual({ cap: false, reason: 'under budget', cost: 0.4, budget: 1 });
	});

	it('ignores another budget', () => {
		expect(decide(push({ ...notice, budgetDisplayName: 'other' }), 'toe-beans').cap).toBe(false);
	});

	it.each([
		['no body', null],
		['no data', { message: {} }],
		['data that is not JSON', { message: { data: Buffer.from('nope').toString('base64') } }],
		['no amounts', push({ budgetDisplayName: 'toe-beans' })],
		['a zero budget', push({ ...notice, budgetAmount: 0 })]
	])('ignores %s rather than failing', (_, body) => {
		expect(decide(body, 'toe-beans').cap).toBe(false);
	});
});

const config = {
	project: 'p',
	region: 'africa-south1',
	service: 'toe-beans',
	schedulerRegion: 'me-central1',
	job: 'toe-beans-tick',
	budget: 'toe-beans'
};
const SERVICE =
	'https://run.googleapis.com/v2/projects/p/locations/africa-south1/services/toe-beans';
const JOB =
	'https://cloudscheduler.googleapis.com/v1/projects/p/locations/me-central1/jobs/toe-beans-tick';

/** A fake of Google's APIs, holding the service's ingress and the job's state. */
function google({ ingress = 'INGRESS_TRAFFIC_ALL', state = 'ENABLED', fail = '' } = {}) {
	const calls = /** @type {string[]} */ ([]);
	const fetch = vi.fn(async (/** @type {string} */ url, /** @type {RequestInit} */ init) => {
		const method = init.method ?? 'GET';
		calls.push(`${method} ${url}`);
		expect(new Headers(init.headers).get('authorization')).toBe('Bearer t0ken');
		if (fail && url.startsWith(fail)) return new Response('{"error":"denied"}', { status: 403 });
		if (url === SERVICE) return Response.json({ ingress });
		if (url === `${SERVICE}?updateMask=ingress` && method === 'PATCH') {
			ingress = JSON.parse(String(init.body)).ingress;
			return Response.json({ name: 'operation' });
		}
		if (url === JOB) return Response.json({ state });
		if (url === `${JOB}:pause` && method === 'POST') {
			state = 'PAUSED';
			return Response.json({ state });
		}
		return new Response('not found', { status: 404 });
	});
	return {
		deps: { fetch: /** @type {typeof globalThis.fetch} */ (fetch), token: async () => 't0ken' },
		calls,
		state: () => ({ ingress, state })
	};
}

describe('takeDown', () => {
	it('closes the service to outside traffic, then pauses the tick', async () => {
		const api = google();
		expect(await takeDown(config, api.deps)).toEqual({ ingress: 'changed', tick: 'paused' });
		expect(api.state()).toEqual({ ingress: 'INGRESS_TRAFFIC_INTERNAL_ONLY', state: 'PAUSED' });
		expect(api.calls).toEqual([
			`GET ${SERVICE}`,
			`PATCH ${SERVICE}?updateMask=ingress`,
			`GET ${JOB}`,
			`POST ${JOB}:pause`
		]);
	});

	it('changes nothing the second time', async () => {
		const api = google({ ingress: 'INGRESS_TRAFFIC_INTERNAL_ONLY', state: 'PAUSED' });
		expect(await takeDown(config, api.deps)).toEqual({ ingress: 'already', tick: 'already' });
		expect(api.calls).toEqual([`GET ${SERVICE}`, `GET ${JOB}`]);
	});

	it('throws when an API refuses, so Pub/Sub sends the message again', async () => {
		const api = google({ fail: `${SERVICE}?` });
		await expect(takeDown(config, api.deps)).rejects.toThrow(/PATCH .* answered 403/);
	});
});

describe('configFrom', () => {
	it('needs every value', () => {
		const env = {
			PROJECT: 'p',
			APP_REGION: 'africa-south1',
			APP_SERVICE: 'toe-beans',
			SCHEDULER_REGION: 'me-central1',
			TICK_JOB: 'toe-beans-tick',
			BUDGET_NAME: 'toe-beans'
		};
		expect(configFrom(env)).toEqual(config);
		expect(() => configFrom({ ...env, TICK_JOB: '' })).toThrow('TICK_JOB is not set');
	});
});
