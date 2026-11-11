// Mongo adapters for training plans and planned sessions (architecture §3.5, §4.4, §5.2), on
// HouseholdCollection so every call is scoped to the household. Indexes are created by migration
// 0006, including the unique (planId, occurrenceKey) that makes materialising idempotent.
import type { Db } from 'mongodb';
import type {
	Clock,
	PlannedSessionRepository,
	TrainingPlanRepository
} from '../../application/ports/index.js';
import type { PlannedSession, TrainingPlan } from '../../domain/planner.js';
import { ok } from '../../domain/result.js';
import { HouseholdCollection, type HouseholdDocument } from './household-collection.js';

export const TRAINING_PLANS = 'trainingPlans';
export const PLANNED_SESSIONS = 'plannedSessions';

const PLAN_SCHEMA = 1;
const SESSION_SCHEMA = 1;

type Stored<T> = Omit<T, 'id' | 'householdId' | 'version' | 'createdAt' | 'updatedAt'>;
type PlanDoc = HouseholdDocument & Stored<TrainingPlan>;
type SessionDoc = HouseholdDocument & Stored<PlannedSession>;

function toPlan({ _id, schemaVersion: _, ...rest }: PlanDoc): TrainingPlan {
	return { id: _id, ...rest };
}

function toSession({ _id, schemaVersion: _, ...rest }: SessionDoc): PlannedSession {
	return { id: _id, ...rest };
}

export function mongoTrainingPlans(db: Db, clock: Clock): TrainingPlanRepository {
	const plans = new HouseholdCollection<PlanDoc>(db.collection<PlanDoc>(TRAINING_PLANS), {
		resource: 'plan',
		schemaVersion: PLAN_SCHEMA,
		clock
	});
	return {
		async insert({ id, householdId, ...fields }) {
			return toPlan(await plans.insert(householdId, id, fields));
		},
		async findById(householdId, id) {
			const doc = await plans.findById(householdId, id);
			return doc && toPlan(doc);
		},
		async findByIds(householdId, ids) {
			return (await plans.find(householdId, { _id: { $in: [...ids] } } as never)).map(toPlan);
		},
		async listRunning(householdId, date) {
			const docs = await plans.find(
				householdId,
				{ $or: [{ until: { $exists: false } }, { until: { $gte: date } }] },
				{ sort: { _id: 1 } }
			);
			return docs.map(toPlan);
		},
		async update(householdId, id, expectedVersion, changes) {
			const updated = await plans.update(householdId, id, expectedVersion, changes);
			return updated.ok ? ok(toPlan(updated.value)) : updated;
		},
		advanceHorizon: (householdId, id, from, to) =>
			plans.setQuietly(householdId, id, { horizon: from }, { horizon: to })
	};
}

export function mongoPlannedSessions(db: Db, clock: Clock): PlannedSessionRepository {
	const sessions = new HouseholdCollection<SessionDoc>(
		db.collection<SessionDoc>(PLANNED_SESSIONS),
		{ resource: 'session', schemaVersion: SESSION_SCHEMA, clock }
	);
	return {
		async insert({ id, householdId, ...fields }) {
			return toSession(await sessions.insert(householdId, id, fields));
		},
		async insertOccurrences(householdId, list) {
			await sessions.insertMissing(
				householdId,
				list.map(({ id, householdId: _, ...fields }) => ({
					match: { planId: fields.planId, occurrenceKey: fields.occurrenceKey },
					id,
					fields
				}))
			);
		},
		async findById(householdId, id) {
			const doc = await sessions.findById(householdId, id);
			return doc && toSession(doc);
		},
		async listBetween(householdId, from, to) {
			const docs = await sessions.find(
				householdId,
				{ scheduledAt: { $gte: from, $lt: to } },
				{ sort: { scheduledAt: 1, _id: 1 } }
			);
			return docs.map(toSession);
		},
		async listFrom(householdId, planId, from) {
			const docs = await sessions.find(
				householdId,
				{ planId, occurrenceKey: { $gte: from } },
				{ sort: { occurrenceKey: 1 } }
			);
			return docs.map(toSession);
		},
		async update(householdId, id, expectedVersion, changes) {
			const updated = await sessions.update(householdId, id, expectedVersion, changes);
			return updated.ok ? ok(toSession(updated.value)) : updated;
		},
		deleteUnloggedFrom: (householdId, planId, from) =>
			sessions.deleteWhere(householdId, {
				planId,
				occurrenceKey: { $gte: from },
				status: { $ne: 'completed' }
			})
	};
}
