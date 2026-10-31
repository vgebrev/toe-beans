import type { ServerInit } from '@sveltejs/kit/hooks';
import { startBackend } from '#lib/server/backend.js';

export const init: ServerInit = async () => {
	await startBackend();
};
