// Several times a day (architecture D24): a training plan's one `time` becomes `times`, and a
// session's occurrence key gains its time of day (`2026-11-16` → `2026-11-16T17:30`), so a series
// can fall more than once on a date and still be materialised once per date and time. Sessions go
// first, while their plan still says its time, so a crash part-way is safe to run again.
import type { Document } from 'mongodb';
import { PLANNED_SESSIONS, TRAINING_PLANS } from '../planner-collections.js';
import type { Migration } from './runner.js';

export const planTimes: Migration = {
	id: '0012-plan-times',
	async up(db) {
		const plans = db.collection<Document>(TRAINING_PLANS);
		const sessions = db.collection<Document>(PLANNED_SESSIONS);
		const old = plans.find({ time: { $exists: true } }, { projection: { _id: 1, time: 1 } });
		for await (const plan of old) {
			// A key that's a date alone is 10 characters; the new ones are 16.
			await sessions.updateMany(
				{ planId: plan._id, occurrenceKey: { $regex: /^\d{4}-\d{2}-\d{2}$/ } },
				[
					{
						$set: {
							occurrenceKey: { $concat: ['$occurrenceKey', 'T', plan.time as string] },
							schemaVersion: 2
						}
					}
				]
			);
			await plans.updateOne({ _id: plan._id, time: { $exists: true } }, [
				{ $set: { times: ['$time'], schemaVersion: 2 } },
				{ $unset: 'time' }
			]);
		}
		// One-off sessions have no key, only the new shape's version.
		await sessions.updateMany({ schemaVersion: 1 }, { $set: { schemaVersion: 2 } });
	}
};
