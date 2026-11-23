// The spending cap (architecture D45, backlog S19.5). The `toe-beans` budget publishes to Pub/Sub
// every so often (several times a day, whether or not a threshold was crossed), and a push
// subscription sends each message here. When the month's actual spend has reached the budget, the
// app is taken down:
//
//   1. the app's Cloud Run service takes internal traffic only, so nothing from outside reaches it
//      and no instance starts; the edge Worker sees Cloud Run's refusal and shows a maintenance
//      page in place of the app (infra/edge/worker.js)
//   2. the tick's Scheduler job is paused, the one thing inside Google that would still call it
//
// Forecasts never trip it, only spend. Bringing the app back is the owner's, by hand, after
// looking at why (docs/runbooks/spending-cap.md). No dependencies: Google's APIs over fetch, with
// a token from the metadata server for this service's own account.

const INTERNAL_ONLY = 'INGRESS_TRAFFIC_INTERNAL_ONLY';

/**
 * @typedef {object} CapConfig
 * @property {string} project
 * @property {string} region       the app's Cloud Run region
 * @property {string} service      the app's Cloud Run service
 * @property {string} schedulerRegion
 * @property {string} job          the tick's Scheduler job
 * @property {string} budget       the budget's display name
 */

/**
 * @typedef {{ cap: true, cost: number, budget: number }
 *   | { cap: false, reason: string, cost?: number, budget?: number }} Decision
 */

/**
 * Reads a Pub/Sub push body (`{ message: { data } }`, data base64 JSON from Cloud Billing) and
 * decides whether it calls for the cap. Anything it can't read is ignored rather than retried: a
 * message that's wrong today stays wrong.
 * @param {unknown} body
 * @param {string} budgetName
 * @returns {Decision}
 */
export function decide(body, budgetName) {
	const data = /** @type {{ message?: { data?: unknown } } | null} */ (body)?.message?.data;
	if (typeof data !== 'string') return { cap: false, reason: 'no message data' };
	let notice;
	try {
		notice = JSON.parse(Buffer.from(data, 'base64').toString('utf8'));
	} catch {
		return { cap: false, reason: 'message data is not JSON' };
	}
	if (notice?.budgetDisplayName !== budgetName) return { cap: false, reason: 'another budget' };
	const cost = Number(notice.costAmount);
	const budget = Number(notice.budgetAmount);
	if (!Number.isFinite(cost) || !Number.isFinite(budget) || budget <= 0) {
		return { cap: false, reason: 'no cost or budget amount' };
	}
	if (cost < budget) return { cap: false, reason: 'under budget', cost, budget };
	return { cap: true, cost, budget };
}

/**
 * Takes the app down. Each step looks before it acts, so a repeated message (the budget keeps
 * publishing, and Pub/Sub retries) changes nothing the second time. Throws on any API error, so
 * the push fails and Pub/Sub tries again.
 * @param {CapConfig} config
 * @param {{ fetch: typeof fetch, token: () => Promise<string> }} deps
 * @returns {Promise<{ ingress: 'changed' | 'already', tick: 'paused' | 'already' }>}
 */
export async function takeDown(config, { fetch, token }) {
	const bearer = await token();
	/** @param {string} url @param {RequestInit} [init] */
	const call = async (url, init = {}) => {
		const response = await fetch(url, {
			...init,
			headers: {
				authorization: `Bearer ${bearer}`,
				'content-type': 'application/json',
				...init.headers
			}
		});
		if (!response.ok) {
			// Google's error bodies name the API and permission, never a secret.
			const detail = (await response.text()).slice(0, 500);
			throw new Error(`${init.method ?? 'GET'} ${url} answered ${response.status}: ${detail}`);
		}
		return response.json();
	};

	// The service first: it's what costs money.
	const service = `https://run.googleapis.com/v2/projects/${config.project}/locations/${config.region}/services/${config.service}`;
	let ingress = /** @type {'changed' | 'already'} */ ('already');
	if ((await call(service)).ingress !== INTERNAL_ONLY) {
		// Only the service's ingress: no new revision, nothing else about the service changes.
		await call(`${service}?updateMask=ingress`, {
			method: 'PATCH',
			body: JSON.stringify({ ingress: INTERNAL_ONLY })
		});
		ingress = 'changed';
	}

	const job = `https://cloudscheduler.googleapis.com/v1/projects/${config.project}/locations/${config.schedulerRegion}/jobs/${config.job}`;
	let tick = /** @type {'paused' | 'already'} */ ('already');
	if ((await call(job)).state !== 'PAUSED') {
		await call(`${job}:pause`, { method: 'POST', body: '{}' });
		tick = 'paused';
	}
	return { ingress, tick };
}

/**
 * An access token for this service's own account, from the metadata server.
 * @param {typeof fetch} fetch
 */
export async function metadataToken(fetch) {
	const response = await fetch(
		'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
		{ headers: { 'metadata-flavor': 'Google' } }
	);
	if (!response.ok) throw new Error(`metadata server answered ${response.status}`);
	return /** @type {{ access_token: string }} */ (await response.json()).access_token;
}

/**
 * Reads the config from the environment; every value is required, so a missing one fails at
 * start rather than at the cap.
 * @param {Record<string, string | undefined>} env
 * @returns {CapConfig}
 */
export function configFrom(env) {
	/** @param {string} name */
	const need = (name) => {
		const value = env[name];
		if (!value) throw new Error(`${name} is not set`);
		return value;
	};
	return {
		project: need('PROJECT'),
		region: need('APP_REGION'),
		service: need('APP_SERVICE'),
		schedulerRegion: need('SCHEDULER_REGION'),
		job: need('TICK_JOB'),
		budget: need('BUDGET_NAME')
	};
}
