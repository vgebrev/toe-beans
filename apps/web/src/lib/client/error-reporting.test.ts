// S19.3: the browser's Sentry reports errors and nothing else. No tracing, replay, profiling,
// sessions or breadcrumbs, whatever SDK 11's defaults become.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const init = vi.fn();
vi.mock('@sentry/browser', () => ({ init, withScope: vi.fn(), captureException: vi.fn() }));

const { startErrorReporting } = await import('./error-reporting.js');

type Options = Record<string, unknown> & {
	integrations: (defaults: { name: string }[]) => { name: string }[];
};

async function options(): Promise<Options> {
	await startErrorReporting({
		dsn: 'https://key@example.invalid/1',
		environment: 'prod',
		release: '1'
	});
	expect(init).toHaveBeenCalledOnce();
	return init.mock.calls[0]![0] as Options;
}

describe('startErrorReporting', () => {
	beforeEach(() => init.mockClear());

	it('does nothing without a DSN', async () => {
		await startErrorReporting({ dsn: undefined, environment: 'prod', release: '1' });
		expect(init).not.toHaveBeenCalled();
	});

	it('turns on no tracing, replay or profiling', async () => {
		const opts = await options();
		for (const key of Object.keys(opts)) {
			expect(key).not.toMatch(/trace|tracing|replay|profil/i);
		}
		expect(opts.sendClientReports).toBe(false);
		expect(opts.maxBreadcrumbs).toBe(0);
	});

	it('drops the per-page-load session and adds no integration of its own', async () => {
		const { integrations } = await options();
		const defaults = [{ name: 'InboundFilters' }, { name: 'BrowserSession' }, { name: 'Dedupe' }];
		expect(integrations(defaults).map((i) => i.name)).toEqual(['InboundFilters', 'Dedupe']);
	});

	it('sends reports to the app, not to Sentry directly', async () => {
		expect((await options()).tunnel).toMatch(/^\//);
	});
});
