// The spending cap's HTTP entry (architecture D45, backlog S19.5): Pub/Sub pushes each budget
// message here as a POST. Cloud Run checks the push's OIDC token before a request gets this far
// (no unauthenticated invocations, internal ingress), so this checks nothing itself.
//
// A 2xx acknowledges the message; anything else makes Pub/Sub send it again, with backoff. Logs
// are JSON lines Cloud Logging reads (`severity`, `message`); they hold amounts and outcomes only.
import { createServer } from 'node:http';
import { configFrom, decide, metadataToken, takeDown } from './cap.js';

const config = configFrom(process.env);

/** @param {'INFO' | 'WARNING' | 'ERROR'} severity @param {string} message @param {object} [fields] */
const log = (severity, message, fields = {}) =>
	console.log(JSON.stringify({ severity, message, ...fields }));

/** @param {import('node:http').IncomingMessage} request */
async function readJson(request) {
	const chunks = [];
	let size = 0;
	for await (const chunk of request) {
		size += chunk.length;
		// A budget message is a few hundred bytes.
		if (size > 64 * 1024) return null;
		chunks.push(chunk);
	}
	try {
		return JSON.parse(Buffer.concat(chunks).toString('utf8'));
	} catch {
		return null;
	}
}

const server = createServer(async (request, response) => {
	if (request.method !== 'POST') {
		response.writeHead(405).end();
		return;
	}
	const decision = decide(await readJson(request), config.budget);
	if (!decision.cap) {
		log('INFO', 'budget message, no action', decision);
		response.writeHead(204).end();
		return;
	}
	try {
		const done = await takeDown(config, { fetch, token: () => metadataToken(fetch) });
		log('WARNING', 'spending cap reached: app taken down', { ...decision, ...done });
		response.writeHead(204).end();
	} catch (error) {
		log('ERROR', 'spending cap reached, taking the app down failed', {
			...decision,
			error: error instanceof Error ? error.message : String(error)
		});
		response.writeHead(500).end();
	}
});

server.listen(Number(process.env.PORT ?? 8080), () => log('INFO', 'spending cap listening'));
