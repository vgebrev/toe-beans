import { describe, expect, it, vi } from 'vitest';
import type { RateLimiter } from '../application/ports/index.js';
import { createEdgeHttp } from './edge.js';

const silent = { debug() {}, info() {}, warn() {}, error() {}, child: () => silent };
const allowAll: RateLimiter = { take: () => ({ allowed: true }) };
const secret = 's'.repeat(40);

const edge = (overrides: Partial<Parameters<typeof createEdgeHttp>[0]> = {}) =>
	createEdgeHttp({
		publicOrigin: 'https://toebeans.co.za',
		writeRateLimit: allowAll,
		logger: silent,
		...overrides
	});

describe('the proxy secret (security audit F1)', () => {
	it('takes any request when none is configured', () => {
		expect(edge().checkProxy(null)).toBeNull();
	});

	it("refuses a request without the proxy's secret, or with another", () => {
		const check = edge({ proxySecret: secret });
		expect(check.checkProxy(null)).toMatchObject({ status: 403 });
		expect(check.checkProxy('')).toMatchObject({ status: 403 });
		expect(check.checkProxy(secret.slice(1))).toMatchObject({ status: 403 });
		expect(check.checkProxy(secret + 'x')).toMatchObject({ status: 403 });
		expect(check.checkProxy(secret)).toBeNull();
	});
});

describe('the write budget (security audit C3)', () => {
	it('counts writes per person and lets reads through', () => {
		const take = vi.fn(allowAll.take);
		const check = edge({ writeRateLimit: { take } });
		for (const method of ['GET', 'head', 'OPTIONS']) {
			expect(check.checkWriteRate({ method, userId: 'u1' })).toBeNull();
		}
		expect(take).not.toHaveBeenCalled();
		for (const method of ['POST', 'patch', 'PUT', 'DELETE']) {
			expect(check.checkWriteRate({ method, userId: 'u1' })).toBeNull();
		}
		expect(take).toHaveBeenCalledTimes(4);
		expect(take).toHaveBeenCalledWith('u1');
	});

	it('refuses a write over the budget with a 429', () => {
		const check = edge({
			writeRateLimit: { take: () => ({ allowed: false, retryAfterSeconds: 30 }) }
		});
		expect(check.checkWriteRate({ method: 'POST', userId: 'u1' })).toMatchObject({
			status: 429,
			body: { type: 'toe-beans/rate-limited' }
		});
	});
});

describe('security headers (security audit F3)', () => {
	it('sends HSTS only on https', () => {
		expect(edge().securityHeaders()).toMatchObject({
			'strict-transport-security': 'max-age=63072000',
			'referrer-policy': 'same-origin',
			'x-content-type-options': 'nosniff'
		});
		const local = edge({ publicOrigin: 'http://localhost:7877' }).securityHeaders();
		expect(local).not.toHaveProperty('strict-transport-security');
		expect(local['permissions-policy']).toContain('camera=(self)');
	});
});
