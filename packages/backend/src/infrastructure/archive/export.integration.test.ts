// The export of a household with two busy years of records (backlog S19.7, architecture D46), on
// real MongoDB, photo files and fflate: how long it takes, how big it is, how much memory it
// takes and how long it holds up the event loop, which on prod's one instance is every other
// request waiting. The numbers are printed; the assertions are bounds with room to spare.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { unzipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedBigHousehold, type SeededHousehold } from '../../../test/big-household.js';
import { useTestDatabase } from '../../../test/mongo.js';
import { createHouseholdExport } from '../../application/household/export.js';
import type { Exercise } from '../../domain/exercise.js';
import type { Id } from '../../domain/id.js';
import type { User } from '../../domain/user.js';
import { manualClock } from '../../testing/clock.js';
import { silentLogger } from '../../testing/logger.js';
import { mongoUsers } from '../persistence/auth-collections.js';
import { mongoBehaviourEvents } from '../persistence/behaviour-event-collection.js';
import { mongoCareTasks } from '../persistence/care-task-collection.js';
import { mongoCues } from '../persistence/cue-collection.js';
import { mongoDogs } from '../persistence/dog-collection.js';
import { mongoHouseholds } from '../persistence/household-collections.js';
import { mongoHouseholdRecords } from '../persistence/household-records.js';
import { migrate, migrations } from '../persistence/migrations/index.js';
import { mongoPlannedSessions, mongoTrainingPlans } from '../persistence/planner-collections.js';
import { mongoReminderPreferences } from '../persistence/reminder-collections.js';
import { mongoSessionLogs } from '../persistence/session-log-collection.js';
import { filesystemPhotoStore } from '../photos/filesystem.js';
import { fflateZip } from './fflate-zip.js';

const db = useTestDatabase();
const now = new Date('2026-11-25T08:00:00Z');
const clock = manualClock(now);
const owner: User = {
	id: 'u-owner' as Id,
	identities: [],
	email: 'owner@example.com',
	displayName: 'Owner',
	displayNameSource: 'user',
	version: 1,
	createdAt: now,
	updatedAt: now
};

let photoDir: string;
let seeded: SeededHousehold;
let ports: Parameters<typeof createHouseholdExport>[0];

beforeAll(async () => {
	await migrate(db.mongo.db, migrations, { clock });
	photoDir = await mkdtemp(join(tmpdir(), 'toe-beans-export-'));
	const d = db.mongo.db;
	const repos = {
		users: mongoUsers(d),
		households: mongoHouseholds(d),
		dogs: mongoDogs(d, clock),
		photos: filesystemPhotoStore(photoDir),
		cues: mongoCues(d, clock),
		plans: mongoTrainingPlans(d, clock),
		plannedSessions: mongoPlannedSessions(d, clock),
		sessionLogs: mongoSessionLogs(d, clock),
		careTasks: mongoCareTasks(d, clock),
		behaviourEvents: mongoBehaviourEvents(d, clock)
	};
	await repos.users.insert(owner);
	seeded = await seedBigHousehold(repos, { owner, now });
	ports = {
		...repos,
		householdRecords: mongoHouseholdRecords(d),
		reminderPreferences: mongoReminderPreferences(d),
		exercises: { all: () => [], get: (id) => ({ id, title: id }) as Exercise },
		zip: fflateZip,
		clock,
		logger: silentLogger
	};
}, 300_000);

afterAll(async () => {
	await rm(photoDir, { recursive: true, force: true });
});

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

describe('exporting two busy years (D46)', () => {
	it('is complete, and holds up nothing for long', async () => {
		const delay = monitorEventLoopDelay({ resolution: 5 });
		const memory = () => {
			const { heapUsed, arrayBuffers } = process.memoryUsage();
			return heapUsed + arrayBuffers;
		};
		const before = memory();
		let peak = before;
		const sampler = setInterval(() => (peak = Math.max(peak, memory())), 5);
		delay.enable();
		const started = performance.now();

		const result = await createHouseholdExport(ports).export({
			userId: owner.id,
			householdId: seeded.household.id,
			role: 'owner'
		});
		const firstByte = performance.now() - started;
		if (!result.ok) throw new Error('the export failed');
		const zip = new Uint8Array(await new Response(result.value.stream).arrayBuffer());
		const total = performance.now() - started;

		delay.disable();
		clearInterval(sampler);
		const files = unzipSync(zip);
		const json = files['household.json']!;
		const doc = JSON.parse(new TextDecoder().decode(json));

		console.info(
			[
				`records: ${seeded.counts.plannedSessions} planned sessions, ${seeded.counts.sessionLogs} logs, ${seeded.counts.careTasks} care tasks, ${seeded.counts.behaviourEvents} events`,
				`household.json ${mb(json.byteLength)}, ZIP ${mb(zip.byteLength)} with ${seeded.dogs.length} photos`,
				`headers after ${firstByte.toFixed(0)} ms, done after ${total.toFixed(0)} ms`,
				`longest event-loop stall ${(delay.max / 1e6).toFixed(0)} ms (p99 ${(delay.percentile(99) / 1e6).toFixed(0)} ms)`,
				`memory peak +${mb(peak - before)} over the start`
			].join('\n')
		);

		// About 30 ms on a dev machine; 310 ms before the JSON was streamed, slices were fed to
		// the compressor and reads came in batches. The bound leaves room for a slower CI runner.
		expect(delay.max / 1e6).toBeLessThan(150);
		expect(doc.plannedSessions).toHaveLength(seeded.counts.plannedSessions);
		expect(doc.sessionLogs).toHaveLength(seeded.counts.sessionLogs);
		expect(doc.careTasks).toHaveLength(seeded.counts.careTasks);
		expect(doc.behaviourEvents).toHaveLength(seeded.counts.behaviourEvents);
		expect(Object.keys(files).filter((name) => name.startsWith('photos/'))).toHaveLength(
			seeded.dogs.length
		);
	}, 120_000);
});
