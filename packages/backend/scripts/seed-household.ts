// `pnpm seed:household [email]`: a household with two busy years of records in the dev database,
// for trying the export (S19.7) and anything else that should cope with a lot of data. It's owned
// by a new user with `email` (a fresh example.com address by default), who has no real sign-in
// method yet: signing in with that email, through the mock provider or a dev Auth0 account, links one.
// Refuses to run against prod.
import { loadConfig } from '../src/config.js';
import type { Id } from '../src/domain/id.js';
import { createIdGenerator } from '../src/domain/id.js';
import type { User } from '../src/domain/user.js';
import { mongoUsers } from '../src/infrastructure/persistence/auth-collections.js';
import { mongoBehaviourEvents } from '../src/infrastructure/persistence/behaviour-event-collection.js';
import { mongoCareTasks } from '../src/infrastructure/persistence/care-task-collection.js';
import { mongoCues } from '../src/infrastructure/persistence/cue-collection.js';
import { mongoDogs } from '../src/infrastructure/persistence/dog-collection.js';
import { mongoHouseholds } from '../src/infrastructure/persistence/household-collections.js';
import { migrate, migrations } from '../src/infrastructure/persistence/migrations/index.js';
import { connectMongo } from '../src/infrastructure/persistence/mongo.js';
import {
	mongoPlannedSessions,
	mongoTrainingPlans
} from '../src/infrastructure/persistence/planner-collections.js';
import { mongoSessionLogs } from '../src/infrastructure/persistence/session-log-collection.js';
import { createPhotoStore } from '../src/infrastructure/photos/index.js';
import { systemClock } from '../src/infrastructure/system-clock.js';
import { seedBigHousehold } from '../test/big-household.js';

const config = loadConfig(process.env);
if (config.appEnv === 'prod') throw new Error('seed:household never runs against prod');

const email = (process.argv[2] ?? `busy+${Date.now().toString(36)}@example.com`).toLowerCase();
const mongo = await connectMongo(config.mongodb.uri, config.mongodb.db);
try {
	await migrate(mongo.db, migrations, { clock: systemClock });
	const db = mongo.db;
	const clock = systemClock;
	const users = mongoUsers(db);
	const households = mongoHouseholds(db);

	let owner = await users.findByEmail(email);
	if (owner && (await households.findForMember(owner.id))) {
		throw new Error(`${email} already has a household; pick another email`);
	}
	if (!owner) {
		const now = clock.now();
		owner = {
			id: createIdGenerator(() => now.getTime()).next() as Id,
			// Users are unique by identity, so not two without one. No provider issues this, so
			// it signs nobody in; signing in with the email links the real one.
			identities: [{ issuer: 'seed:household', subject: email, linkedAt: now }],
			email,
			displayName: 'Busy Owner',
			displayNameSource: 'user',
			version: 1,
			createdAt: now,
			updatedAt: now
		} satisfies User;
		await users.insert(owner);
	}

	const started = performance.now();
	const { household, counts } = await seedBigHousehold(
		{
			users,
			households,
			dogs: mongoDogs(db, clock),
			photos: createPhotoStore(config.photos),
			cues: mongoCues(db, clock),
			plans: mongoTrainingPlans(db, clock),
			plannedSessions: mongoPlannedSessions(db, clock),
			sessionLogs: mongoSessionLogs(db, clock),
			careTasks: mongoCareTasks(db, clock),
			behaviourEvents: mongoBehaviourEvents(db, clock)
		},
		{ owner }
	);
	console.info(
		[
			`Seeded "${household.name}" in ${config.mongodb.db} in ${((performance.now() - started) / 1000).toFixed(0)} s:`,
			`  ${counts.plannedSessions} planned sessions, ${counts.sessionLogs} logs, ${counts.careTasks} care tasks, ${counts.behaviourEvents} events`,
			`Sign in with the email ${email} to use it.`,
			config.oidc.issuer.startsWith('http://localhost')
				? '  At the mock provider: any subject, with that email and "email_verified": true.'
				: '  The sign-in must carry that email, verified.'
		].join('\n')
	);
} finally {
	await mongo.close();
}
