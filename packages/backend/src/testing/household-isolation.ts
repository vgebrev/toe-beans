// The household-isolation suite every repository runs (architecture §4.4, NFR-01/02, acceptance
// scenario 9): data written for household A is invisible to, and untouchable from, household B,
// even when B knows the ID and current version.
import { beforeEach, describe, expect, it } from 'vitest';
import type { AppError } from '../application/errors.js';
import { createIdGenerator, type Id } from '../domain/id.js';
import type { Result } from '../domain/result.js';

/**
 * Adapts one repository to the suite. Leave out the operations it doesn't have. `update` and
 * `remove` must use the item's real current version, so only the household check can stop them.
 */
export interface IsolationSubject {
	/** Creates an item in the household and returns its ID. */
	create(householdId: Id): Promise<Id>;
	/** The item as the household sees it, or null if it can't. */
	read(householdId: Id, id: Id): Promise<unknown>;
	/** The IDs of every item the household can list. */
	list?(householdId: Id): Promise<Id[]>;
	update?(householdId: Id, id: Id): Promise<Result<unknown, AppError>>;
	remove?(householdId: Id, id: Id): Promise<Result<unknown, AppError>>;
}

export function householdIsolationSuite(
	name: string,
	subject: () => IsolationSubject | Promise<IsolationSubject>
): void {
	describe(`${name}: household isolation`, () => {
		const ids = createIdGenerator(Date.now);
		let repo: IsolationSubject;
		let a: Id;
		let b: Id;
		let item: Id;

		beforeEach(async () => {
			repo = await subject();
			a = ids.next();
			b = ids.next();
			item = await repo.create(a);
		});

		it("can't read another household's item by ID", async () => {
			expect(await repo.read(a, item)).not.toBeNull();
			expect(await repo.read(b, item)).toBeNull();
		});

		it("doesn't list another household's items", async ({ skip }) => {
			if (!repo.list) return skip('no list');
			const own = await repo.create(b);
			expect(await repo.list(a)).toContain(item);
			expect(await repo.list(b)).toEqual([own]);
		});

		it("can't update another household's item", async ({ skip }) => {
			if (!repo.update) return skip('no update');
			const before = await repo.read(a, item);
			expect(await repo.update(b, item)).toMatchObject({ ok: false, error: { kind: 'not-found' } });
			expect(await repo.read(a, item)).toEqual(before);
		});

		it("can't remove another household's item", async ({ skip }) => {
			if (!repo.remove) return skip('no remove');
			expect(await repo.remove(b, item)).toMatchObject({ ok: false, error: { kind: 'not-found' } });
			expect(await repo.read(a, item)).not.toBeNull();
		});
	});
}
