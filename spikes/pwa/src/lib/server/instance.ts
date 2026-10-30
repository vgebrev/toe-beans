// Spike S-1.3: identifies the container instance in logs and response headers, so cold starts
// (a new instance id with a small age) can be told apart from warm requests.
export const instance = {
	id: crypto.randomUUID().slice(0, 8),
	revision: process.env.K_REVISION ?? 'local',
	bootedAt: Date.now()
};

export const ageSeconds = () => (Date.now() - instance.bootedAt) / 1000;

/** Structured log line in the shape Cloud Logging parses from stdout. */
export function logJson(message: string, fields: Record<string, unknown> = {}, severity = 'INFO') {
	console.log(JSON.stringify({ severity, message, instance: instance.id, ...fields }));
}
