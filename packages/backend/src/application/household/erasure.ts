// Deleting a household for good (S16.5, architecture §5.3, D38): its photos, then every record
// that carries its ID, then the household itself. Callers first make sure nobody else can reach
// it: they're its only member and its invitations are revoked, or it's deactivated.
//
// Photos go first, outside the transaction: a failure there leaves the records in place, so the
// person can try again, while records deleted first would leave photos nothing points to.
import { householdPhotoPrefix } from '../../domain/dog.js';
import { deactivatedCutoff } from '../../domain/household.js';
import type { Id } from '../../domain/id.js';
import { ok } from '../../domain/result.js';
import type { Ports } from '../ports/index.js';

/** The most households one tick deletes, so a run stays short. */
const SWEEP_PER_TICK = 5;

export type Erasure = ReturnType<typeof createErasure>;

export function createErasure({
	households,
	householdData,
	photos,
	uow,
	logger,
	errors
}: Pick<Ports, 'households' | 'householdData' | 'photos' | 'uow' | 'logger' | 'errors'>) {
	const log = logger.child({ component: 'erasure' });

	return {
		/** Deletes the household's photos. Call before `eraseRecords`, outside any transaction. */
		erasePhotos: (householdId: Id) => photos.deletePrefix(householdPhotoPrefix(householdId)),

		/** Deletes its records. Joins the caller's transaction; returns how many documents went. */
		eraseRecords: (householdId: Id) => householdData.erase(householdId),

		/**
		 * For the tick: deletes households deactivated longer ago than anyone can bring them back
		 * (D18, D38), oldest first, a few at a time. Returns how many went.
		 */
		async sweep(now: Date): Promise<number> {
			const due = await households.findDeactivatedBefore(deactivatedCutoff(now), SWEEP_PER_TICK);
			let erased = 0;
			for (const { id: householdId } of due) {
				try {
					const photoCount = await photos.deletePrefix(householdPhotoPrefix(householdId));
					const documents = await uow.run(async () => ok(await householdData.erase(householdId)));
					log.info('deactivated household deleted', {
						householdId,
						documents: documents.ok ? documents.value : 0,
						photos: photoCount
					});
					erased++;
				} catch (err) {
					log.error('could not delete a deactivated household', { err, householdId });
					errors.capture(err, { component: 'erasure', householdId });
				}
			}
			return erased;
		}
	};
}
