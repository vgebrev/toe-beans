// The web app manifest, named for the environment (S17.6, #lib/server/manifest.ts).
import { backend } from '#lib/server/backend.js';
import { webManifest } from '#lib/server/manifest.js';

export function GET() {
	return new Response(JSON.stringify(webManifest(backend().config.appEnv)), {
		headers: { 'content-type': 'application/manifest+json', 'cache-control': 'no-cache' }
	});
}
