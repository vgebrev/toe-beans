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
	budget: 'toe-beans',
	edge: 'toe-beans-edge@p.iam.gserviceaccount.com'
};
const SERVICE =
	'https://run.googleapis.com/v2/projects/p/locations/africa-south1/services/toe-beans';
const JOB =
	'https://cloudscheduler.googleapis.com/v1/projects/p/locations/me-central1/jobs/toe-beans-tick';

const EDGE = 'serviceAccount:toe-beans-edge@p.iam.gserviceaccount.com';
const TICK = 'serviceAccount:toe-beans-tick@p.iam.gserviceaccount.com';
const INVOKERS = { role: 'roles/run.invoker', members: [EDGE, TICK] };
const CAP_ROLE = {
	role: 'projects/p/roles/toe_beans_cap_run',
	members: ['serviceAccount:toe-beans-cap@p.iam.gserviceaccount.com']
};

/** A fake of Google's APIs, holding the service's access list and the job's state. */
function google({
	bindings = [INVOKERS, CAP_ROLE],
	invokerIamDisabled = false,
	state = 'ENABLED',
	fail = ''
} = {}) {
	const calls = /** @type {string[]} */ ([]);
	/** @type {unknown} */
	let written;
	const fetch = vi.fn(async (/** @type {string} */ url, /** @type {RequestInit} */ init) => {
		const method = init.method ?? 'GET';
		calls.push(`${method} ${url}`);
		expect(new Headers(init.headers).get('authorization')).toBe('Bearer t0ken');
		if (fail && url.startsWith(fail)) return new Response('{"error":"denied"}', { status: 403 });
		if (url === SERVICE) return Response.json({ invokerIamDisabled });
		if (url === `${SERVICE}:getIamPolicy`) return Response.json({ etag: 'e1', bindings });
		if (url === `${SERVICE}:setIamPolicy` && method === 'POST') {
			written = JSON.parse(String(init.body)).policy;
			bindings = /** @type {{ bindings: typeof bindings }} */ (written).bindings;
			return Response.json(written);
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
		written: () => written,
		state: () => ({ bindings, state })
	};
}

describe('takeDown', () => {
	it("takes the Worker off the service's invokers, then pauses the tick", async () => {
		const api = google();
		expect(await takeDown(config, api.deps)).toEqual({ access: 'closed', tick: 'paused' });
		expect(api.state()).toEqual({
			bindings: [{ role: 'roles/run.invoker', members: [TICK] }, CAP_ROLE],
			state: 'PAUSED'
		});
		expect(api.calls).toEqual([
			`GET ${SERVICE}`,
			`GET ${SERVICE}:getIamPolicy`,
			`POST ${SERVICE}:setIamPolicy`,
			`GET ${JOB}`,
			`POST ${JOB}:pause`
		]);
	});

	it('takes allUsers off too, sends the etag back and keeps the other invokers', async () => {
		const api = google({
			bindings: [{ role: 'roles/run.invoker', members: ['allUsers', EDGE, TICK] }]
		});
		await takeDown(config, api.deps);
		expect(api.written()).toEqual({
			etag: 'e1',
			bindings: [{ role: 'roles/run.invoker', members: [TICK] }]
		});
	});

	it('drops the invoker binding once nobody is left in it', async () => {
		const api = google({ bindings: [{ role: 'roles/run.invoker', members: [EDGE] }, CAP_ROLE] });
		await takeDown(config, api.deps);
		expect(api.state().bindings).toEqual([CAP_ROLE]);
	});

	it('changes nothing the second time', async () => {
		const api = google({
			bindings: [{ role: 'roles/run.invoker', members: [TICK] }, CAP_ROLE],
			state: 'PAUSED'
		});
		expect(await takeDown(config, api.deps)).toEqual({ access: 'already', tick: 'already' });
		expect(api.calls).toEqual([`GET ${SERVICE}`, `GET ${SERVICE}:getIamPolicy`, `GET ${JOB}`]);
	});

	it('refuses a service with the invoker check off, which the access list cannot close', async () => {
		const api = google({ invokerIamDisabled: true });
		await expect(takeDown(config, api.deps)).rejects.toThrow(/invoker check off/);
		expect(api.calls).toEqual([`GET ${SERVICE}`]);
	});

	it('throws when an API refuses, so Pub/Sub sends the message again', async () => {
		const api = google({ fail: `${SERVICE}:setIamPolicy` });
		await expect(takeDown(config, api.deps)).rejects.toThrow(/POST .*setIamPolicy answered 403/);
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
			BUDGET_NAME: 'toe-beans',
			EDGE_INVOKER: 'toe-beans-edge@p.iam.gserviceaccount.com'
		};
		expect(configFrom(env)).toEqual(config);
		expect(() => configFrom({ ...env, TICK_JOB: '' })).toThrow('TICK_JOB is not set');
	});
});
