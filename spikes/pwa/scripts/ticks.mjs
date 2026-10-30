// Spike S-1.3: tick reliability from Cloud Logging. Counts the minutes with no tick, the lag behind
// the scheduled time, and scheduler-side errors.
// Usage: pnpm ticks [since], where since is a start time (e.g. 2026-10-30T23:12+02:00) or a
// freshness like 6h (default 49h). A start time keeps pauses before it out of the count.
import { execFileSync } from 'node:child_process';

const arg = process.argv[2] ?? '49h';
const since = /^\d+[smhd]$/.test(arg) ? null : new Date(arg);
if (since && isNaN(since.getTime())) {
	console.error(`not a time or freshness: ${arg}`);
	process.exit(1);
}
const window = since ? [`--freshness=${Math.ceil((Date.now() - since.getTime()) / 3600000) + 1}h`] : [`--freshness=${arg}`];
const read = (filter) =>
	JSON.parse(
		execFileSync('gcloud', ['logging', 'read', filter, ...window, '--format=json', '--limit=10000'], {
			encoding: 'utf8',
			maxBuffer: 256 * 1024 * 1024
		})
	);

const ticks = read('resource.type="cloud_run_revision" AND jsonPayload.message="tick"')
	.map((e) => e.jsonPayload)
	.filter((t) => t.scheduledAt && (!since || Date.parse(t.scheduledAt) >= since.getTime()));
const errors = read('resource.type="cloud_scheduler_job" AND severity>=ERROR').filter(
	(e) => !since || Date.parse(e.timestamp) >= since.getTime()
);
if (!ticks.length) {
	console.log('No ticks logged yet.');
	process.exit(0);
}

const minute = (iso) => Math.floor(Date.parse(iso) / 60000);
const seen = new Set(ticks.map((t) => minute(t.scheduledAt)));
const first = Math.min(...seen);
const last = Math.max(...seen);
const missing = [];
for (let m = first; m <= last; m++) if (!seen.has(m)) missing.push(new Date(m * 60000).toISOString());

const lags = ticks.map((t) => t.lagMs).sort((a, b) => a - b);
const pct = (p) => (lags[Math.min(lags.length - 1, Math.floor((p / 100) * lags.length))] / 1000).toFixed(2);
const instances = new Set(ticks.map((t) => t.instance));
const cold = ticks.filter((t) => t.instanceAgeS < 60).length;

console.log(`Window      ${new Date(first * 60000).toISOString()} → ${new Date(last * 60000).toISOString()}`);
console.log(`Expected    ${last - first + 1} ticks; received ${seen.size} (${ticks.length - seen.size} duplicates)`);
console.log(`Missing     ${missing.length}${missing.length ? ': ' + missing.slice(0, 20).join(', ') : ''}`);
console.log(`Lag         p50 ${pct(50)} s, p95 ${pct(95)} s, max ${pct(100)} s`);
console.log(`Instances   ${instances.size}; ticks on an instance < 60 s old: ${cold}`);
console.log(`Scheduler   ${errors.length} error log entries`);
