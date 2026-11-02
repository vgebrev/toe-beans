// Spike S-1.3: tick reliability from Cloud Logging. Counts the minutes with no tick, the lag behind
// the scheduled time, and scheduler-side errors.
// Usage: pnpm ticks [since] [--every=N], where since is a start time (e.g. 2026-10-30T23:12+02:00)
// or a freshness like 6h (default 49h), and N is the schedule's interval in minutes (default 1).
// A start time keeps pauses before it out of the count. Also counts instance starts per day and
// what started them (a tick, or a person opening the app), to compare cold starts across intervals.
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const every = Number(args.find((a) => a.startsWith('--every='))?.slice(8) ?? 1);
const arg = args.find((a) => !a.startsWith('--')) ?? '49h';
if (!Number.isInteger(every) || every < 1) {
	console.error(`not a whole number of minutes: --every=${every}`);
	process.exit(1);
}
const since = /^\d+[smhd]$/.test(arg) ? null : new Date(arg);
if (since && isNaN(since.getTime())) {
	console.error(`not a time or freshness: ${arg}`);
	process.exit(1);
}
const window = since ? [`--freshness=${Math.ceil((Date.now() - since.getTime()) / 3600000) + 1}h`] : [`--freshness=${arg}`];
const read = (filter) =>
	JSON.parse(
		execFileSync('gcloud', ['logging', 'read', filter, ...window, '--format=json', '--limit=100000'], {
			encoding: 'utf8',
			maxBuffer: 256 * 1024 * 1024
		})
	);

const ticks = read(
	'resource.type="cloud_run_revision" AND resource.labels.service_name="toe-beans-spike" AND jsonPayload.message="tick"'
)
	.map((e) => e.jsonPayload)
	.filter((t) => t.scheduledAt && (!since || Date.parse(t.scheduledAt) >= since.getTime()));
const starts = read(
	'resource.type="cloud_run_revision" AND resource.labels.service_name="toe-beans-spike" AND jsonPayload.message="first request"'
)
	.filter((e) => !since || Date.parse(e.timestamp) >= since.getTime())
	.map((e) => ({ day: e.timestamp.slice(0, 10), byTick: e.jsonPayload.path === '/internal/tick' }));
const errors = read('resource.type="cloud_scheduler_job" AND severity>=ERROR').filter(
	(e) => !since || Date.parse(e.timestamp) >= since.getTime()
);
if (!ticks.length) {
	console.log('No ticks logged yet.');
	process.exit(0);
}

// Ticks are identified by their scheduled slot: every N minutes.
const minute = (iso) => Math.floor(Date.parse(iso) / 60000 / every) * every;
const seen = new Set(ticks.map((t) => minute(t.scheduledAt)));
const first = Math.min(...seen);
const last = Math.max(...seen);
const missing = [];
for (let m = first; m <= last; m += every) if (!seen.has(m)) missing.push(new Date(m * 60000).toISOString());

const lags = ticks.map((t) => t.lagMs).sort((a, b) => a - b);
const pct = (p) => (lags[Math.min(lags.length - 1, Math.floor((p / 100) * lags.length))] / 1000).toFixed(2);
const instances = new Set(ticks.map((t) => t.instance));
const cold = ticks.filter((t) => t.instanceAgeS < 60).length;

console.log(`Window      ${new Date(first * 60000).toISOString()} → ${new Date(last * 60000).toISOString()}`);
console.log(`Expected    ${(last - first) / every + 1} ticks (every ${every} min); received ${seen.size} (${ticks.length - seen.size} duplicates)`);
console.log(`Missing     ${missing.length}${missing.length ? ': ' + missing.slice(0, 20).join(', ') : ''}`);
console.log(`Lag         p50 ${pct(50)} s, p95 ${pct(95)} s, max ${pct(100)} s`);
console.log(`Instances   ${instances.size}; ticks on an instance < 60 s old: ${cold}`);
console.log(`Scheduler   ${errors.length} error log entries`);

const days = Map.groupBy(starts, (s) => s.day);
const spanDays = (last - first + every) / 1440;
const byTick = starts.filter((s) => s.byTick).length;
console.log(
	`Starts      ${starts.length} instance starts (${(starts.length / spanDays).toFixed(2)}/day over ${spanDays.toFixed(1)} days): ${byTick} by a tick, ${starts.length - byTick} by a person`
);
for (const [day, list] of days) {
	const people = list.filter((s) => !s.byTick).length;
	console.log(`            ${day}  ${list.length} (${list.length - people} tick, ${people} person)`);
}
