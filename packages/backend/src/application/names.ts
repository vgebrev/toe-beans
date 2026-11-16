// The names of the people an entry mentions: who recorded it, who changed it last (ui.md §4.6, §5.2).
import type { Id } from '../domain/id.js';
import type { Ports } from './ports/index.js';

/** Shown for someone who has since left the household, or whose account is gone. */
export const FORMER_MEMBER = 'A former member';

/** One lookup for every name in `ids`; anyone not found is a former member. */
export async function namesOf(
	users: Ports['users'],
	ids: Iterable<Id>
): Promise<(id: Id) => string> {
	const wanted = [...new Set(ids)];
	const people = wanted.length > 0 ? await users.findByIds(wanted) : [];
	const names = new Map(people.map((u) => [u.id, u.displayName]));
	return (id) => names.get(id) ?? FORMER_MEMBER;
}
