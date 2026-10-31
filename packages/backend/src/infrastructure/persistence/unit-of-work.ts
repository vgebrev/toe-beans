// The UnitOfWork port over a Mongo transaction. The session travels in AsyncLocalStorage, so
// repositories join it without every port method growing a transaction parameter.
import { AsyncLocalStorage } from 'node:async_hooks';
import type { ClientSession, MongoClient } from 'mongodb';
import type { UnitOfWork } from '../../application/ports/index.js';

const ambient = new AsyncLocalStorage<ClientSession>();

/** The transaction's session inside `UnitOfWork.run`, else undefined. Pass it to every operation. */
export const currentSession = (): ClientSession | undefined => ambient.getStore();

export function mongoUnitOfWork(client: MongoClient): UnitOfWork {
	return {
		async run(work) {
			if (ambient.getStore()) return work();
			return client.withSession((session) =>
				// withTransaction retries the callback on transient errors and commits unless the
				// callback aborted; a thrown error aborts and propagates.
				session.withTransaction(
					async () => {
						const result = await ambient.run(session, work);
						if (!result.ok) await session.abortTransaction();
						return result;
					},
					{ readConcern: { level: 'majority' }, writeConcern: { w: 'majority' } }
				)
			);
		}
	};
}
