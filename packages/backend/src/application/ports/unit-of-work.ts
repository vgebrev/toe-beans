import type { Result } from '../../domain/result.js';

/**
 * Runs several repository calls as one transaction (architecture §7): a log and its planned
 * session's status, a subject and its reminder replan, an invite acceptance and the membership.
 */
export interface UnitOfWork {
	/**
	 * Commits if `work` returns ok and rolls back if it returns an error or throws. Repository calls
	 * inside `work` join the transaction without being passed anything, and a nested `run` joins
	 * the outer one. `work` may run more than once when the database asks for a retry, so it must
	 * have no effects outside the database (send pushes or emails after `run` returns).
	 */
	run<T, E>(work: () => Promise<Result<T, E>>): Promise<Result<T, E>>;
}
