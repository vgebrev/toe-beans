// Spike S-1.4: how fast is Cloud Run (Johannesburg) → Atlas free (AWS Cape Town)?
// Seeds a year of one household's data into the `spike` database, then times a Today-style read
// (architecture §8.4: one parallel batch plus one $in lookup), single pings and transactions.
//   GET /          a page that times /today from the browser (run it on the phones)
//   GET /today     one Today read; Server-Timing has the database time
//   GET /probe?n=  n of each measurement server-side, as percentiles
import dns from 'node:dns/promises';
import http from 'node:http';
import { MongoClient } from 'mongodb';

const { MONGO_HOST, MONGO_USER, MONGO_PASSWORD, MONGO_DB = 'spike', PORT = '8080' } = process.env;
if (!MONGO_HOST || !MONGO_USER || !MONGO_PASSWORD) {
	console.error('MONGO_HOST, MONGO_USER and MONGO_PASSWORD are required');
	process.exit(1);
}

const bootedAt = performance.now();
const log = (message, fields = {}) =>
	console.log(JSON.stringify({ severity: 'INFO', message, ...fields }));

const client = new MongoClient(
	`mongodb+srv://${encodeURIComponent(MONGO_USER)}:${encodeURIComponent(MONGO_PASSWORD)}@${MONGO_HOST}/`,
	{ appName: 'toe-beans-db-probe', retryWrites: true, w: 'majority', maxPoolSize: 10, minPoolSize: 4 }
);
const db = client.db(MONGO_DB);
const col = {
	dogs: db.collection('dogs'),
	exercises: db.collection('exercises'),
	planned: db.collection('plannedSessions'),
	logs: db.collection('sessionLogs'),
	care: db.collection('careTasks')
};

const HOUSEHOLD = 'household-a';
const DAY = 86400000;
const SAST = 2 * 3600000; // Africa/Johannesburg has no DST

// Connect (SRV lookup + TLS + auth to Cape Town) and seed once. Requests wait for this.
// Startup diagnostics: where does connect time go (DNS, then each node's first heartbeat)?
const since = () => Math.round(performance.now() - bootedAt);
client.on('serverHeartbeatSucceeded', (e) => log('heartbeat ok', { node: e.connectionId, ms: Math.round(e.duration), at: since() }));
client.on('serverHeartbeatFailed', (e) => log('heartbeat failed', { node: e.connectionId, ms: Math.round(e.duration), at: since(), error: String(e.failure) }));
client.on('connectionReady', (e) => log('pool connection ready', { node: e.address, at: since() }));

const ready = (async () => {
	const dnsStart = performance.now();
	const [srv, txt] = await Promise.all([dns.resolveSrv(`_mongodb._tcp.${MONGO_HOST}`), dns.resolveTxt(MONGO_HOST)]);
	const a = await dns.lookup(srv[0].name, { all: true });
	log('dns', { ms: Math.round(performance.now() - dnsStart), srv: srv.length, txt: txt.length, addresses: a.map((x) => x.family) });
	const start = performance.now();
	await client.connect();
	const connectMs = performance.now() - start;
	log('connected', { connectMs: Math.round(connectMs), sinceBootMs: Math.round(performance.now() - bootedAt) });
	if ((await col.dogs.countDocuments({}, { limit: 1 })) === 0) await seed();
	return { connectMs };
})();
ready.catch((e) => {
	console.error(JSON.stringify({ severity: 'ERROR', message: 'startup failed', error: String(e) }));
	process.exit(1);
});

async function seed() {
	const start = performance.now();
	const now = Date.now();
	const households = [HOUSEHOLD, 'household-b']; // a second household, so filters have to work
	const exercises = Array.from({ length: 30 }, (_, i) => ({ _id: `ex-${i}`, title: `Exercise ${i}` }));
	const dogs = [];
	const planned = [];
	const logs = [];
	const care = [];
	for (const householdId of households) {
		for (const name of ['Ripley', 'Nova']) {
			const dogId = `${householdId}-${name}`;
			dogs.push({ _id: dogId, householdId, name });
			// A year back and three weeks ahead: 3 planned sessions and 10 logs a day, 1 care task a week.
			for (let d = -365; d <= 21; d++) {
				const day = now + d * DAY;
				for (let s = 0; s < 3; s++) {
					planned.push({
						householdId,
						dogId,
						exerciseId: `ex-${(d * 3 + s + 300) % 30}`,
						scheduledFor: new Date(day + s * 4 * 3600000),
						status: d < 0 ? 'done' : 'planned',
						version: 1
					});
				}
				if (d <= 0) {
					for (let l = 0; l < 10; l++) {
						logs.push({
							householdId,
							dogId,
							exerciseId: `ex-${(d + l + 300) % 30}`,
							loggedAt: new Date(day - l * 3600000),
							outcome: 'Not assessed'
						});
					}
				}
				if (d % 7 === 0) {
					care.push({ householdId, dogId, title: 'Brush teeth', dueAt: new Date(day), status: d < 0 ? 'done' : 'pending' });
				}
			}
		}
	}
	await Promise.all([
		col.exercises.insertMany(exercises),
		col.dogs.insertMany(dogs),
		col.planned.insertMany(planned),
		col.logs.insertMany(logs),
		col.care.insertMany(care)
	]);
	await Promise.all([
		col.dogs.createIndex({ householdId: 1 }),
		col.planned.createIndex({ householdId: 1, scheduledFor: 1 }),
		col.logs.createIndex({ householdId: 1, loggedAt: -1 }),
		col.care.createIndex({ householdId: 1, status: 1, dueAt: 1 })
	]);
	log('seeded', {
		ms: Math.round(performance.now() - start),
		docs: exercises.length + dogs.length + planned.length + logs.length + care.length
	});
}

/** The Today read model: one parallel batch, then one $in lookup. Two sequential round trips. */
async function today() {
	const startOfDay = new Date(Math.floor((Date.now() + SAST) / DAY) * DAY - SAST);
	const endOfDay = new Date(startOfDay.getTime() + DAY);
	const t0 = performance.now();
	const [dogs, planned, care, recent] = await Promise.all([
		col.dogs.find({ householdId: HOUSEHOLD }).toArray(),
		col.planned
			.find({ householdId: HOUSEHOLD, scheduledFor: { $gte: startOfDay, $lt: endOfDay } })
			.toArray(),
		col.care.find({ householdId: HOUSEHOLD, status: 'pending', dueAt: { $lt: endOfDay } }).toArray(),
		col.logs.find({ householdId: HOUSEHOLD }).sort({ loggedAt: -1 }).limit(20).toArray()
	]);
	const t1 = performance.now();
	const ids = [...new Set([...planned, ...recent].map((d) => d.exerciseId))];
	const exercises = await col.exercises.find({ _id: { $in: ids } }).toArray();
	const t2 = performance.now();
	return {
		ms: t2 - t0,
		batchMs: t1 - t0,
		lookupMs: t2 - t1,
		counts: { dogs: dogs.length, planned: planned.length, care: care.length, recent: recent.length, exercises: exercises.length }
	};
}

/** Log a session and mark its planned occurrence done, atomically (architecture §7 UnitOfWork). */
async function transaction() {
	const session = client.startSession();
	const start = performance.now();
	let logId;
	try {
		await session.withTransaction(async () => {
			const target = await col.planned.findOne({ householdId: HOUSEHOLD, status: 'planned' }, { session });
			const { insertedId } = await col.logs.insertOne(
				{ householdId: HOUSEHOLD, dogId: target.dogId, exerciseId: target.exerciseId, loggedAt: new Date(), outcome: 'Not assessed', probe: true },
				{ session }
			);
			logId = insertedId;
			await col.planned.updateOne({ _id: target._id, version: target.version }, { $inc: { version: 1 } }, { session });
		});
	} finally {
		await session.endSession();
	}
	const ms = performance.now() - start;
	await col.logs.deleteOne({ _id: logId }); // keep the dataset stable; not timed
	return ms;
}

const ping = async () => {
	const start = performance.now();
	await db.command({ ping: 1 });
	return performance.now() - start;
};

function stats(values) {
	const sorted = [...values].sort((a, b) => a - b);
	const at = (p) => Math.round(sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] * 10) / 10;
	return { n: sorted.length, p50: at(0.5), p95: at(0.95), max: at(1) };
}

async function probe(n) {
	const pings = [];
	const todays = [];
	const txs = [];
	for (let i = 0; i < n; i++) pings.push(await ping());
	for (let i = 0; i < n; i++) todays.push((await today()).ms);
	for (let i = 0; i < Math.max(1, Math.round(n / 5)); i++) txs.push(await transaction());
	return {
		region: process.env.K_SERVICE ? 'cloud-run africa-south1' : 'local',
		connectMs: Math.round((await ready).connectMs),
		pingMs: stats(pings),
		todayMs: stats(todays),
		transactionMs: stats(txs)
	};
}

const PAGE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>DB probe</title><style>body{font:16px system-ui;margin:16px;max-width:40em}button{font:inherit;min-height:48px;padding:0 20px}pre{white-space:pre-wrap}</style>
<h1>Today API from this device</h1><p>Times <code>/today</code> 30 times in a row. "Server" is the database time inside Cloud Run; the rest is the network to Johannesburg.</p>
<button id="go">Run</button><pre id="out"></pre>
<script>
const out = document.getElementById('out');
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))]); };
document.getElementById('go').onclick = async () => {
	const total = [], server = [];
	out.textContent = 'running…';
	for (let i = 0; i < 30; i++) {
		const t = performance.now();
		const res = await fetch('/today', { cache: 'no-store' });
		await res.json();
		total.push(performance.now() - t);
		server.push(Number(/dur=([\\d.]+)/.exec(res.headers.get('server-timing') ?? '')?.[1] ?? NaN));
	}
	out.textContent = 'total  p50 ' + pct(total, .5) + ' ms  p95 ' + pct(total, .95) + ' ms  (first ' + Math.round(total[0]) + ' ms)\\n' +
		'server p50 ' + pct(server, .5) + ' ms  p95 ' + pct(server, .95) + ' ms\\n' + navigator.userAgent;
};
</script>`;

await ready;
http
	.createServer(async (req, res) => {
		const url = new URL(req.url, 'http://x');
		try {
			if (url.pathname === '/healthz') return res.end('ok');
			if (url.pathname === '/') return res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE);
			await ready;
			if (url.pathname === '/today') {
				const r = await today();
				return res
					.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store', 'server-timing': `db;dur=${r.ms.toFixed(1)}` })
					.end(JSON.stringify(r));
			}
			if (url.pathname === '/probe') {
				const n = Math.min(200, Math.max(1, Number(url.searchParams.get('n')) || 50));
				const r = await probe(n);
				log('probe', r);
				return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(r, null, 2));
			}
			res.writeHead(404).end();
		} catch (e) {
			console.error(JSON.stringify({ severity: 'ERROR', message: 'request failed', path: url.pathname, error: String(e) }));
			res.writeHead(500).end('error');
		}
	})
	// Listen only once connected: Cloud Run's startup probe then waits for the connection, which
	// runs with full (boosted) CPU. Listening first lets the probe pass early, after which an
	// instance with no request in flight gets almost no CPU and TLS to Cape Town takes seconds.
	.listen(Number(PORT), () => log('listening', { port: PORT, sinceBootMs: since() }));
