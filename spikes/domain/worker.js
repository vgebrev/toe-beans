// Spike S-1.4a, option 3: a Cloudflare Worker on cf.toebeans.co.za that forwards everything to the
// Cloud Run service. fetch() to the run.app URL sets the Host header Cloud Run needs; the original
// host goes along as x-forwarded-host.
const ORIGIN = 'https://toe-beans-domain-probe-1047834821273.africa-south1.run.app';

export default {
	async fetch(request) {
		const url = new URL(request.url);
		const headers = new Headers(request.headers);
		headers.set('x-forwarded-host', url.host);
		headers.set('x-toe-beans-edge', 'cf-worker');
		return fetch(new URL(url.pathname + url.search, ORIGIN), {
			method: request.method,
			headers,
			body: request.body,
			redirect: 'manual'
		});
	}
};
