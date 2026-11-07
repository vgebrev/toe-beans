// The boundary all shared data sits inside (architecture §5.2, FR-01).
import type { Id } from './id.js';
import { cleanName } from './name.js';

export type Role = 'owner' | 'caregiver';

export interface Membership {
	userId: Id;
	role: Role;
	joinedAt: Date;
}

export interface Household {
	id: Id;
	name: string;
	/** IANA name. Recurrence and "today" are worked out in it (architecture §7). */
	timeZone: string;
	/** At least one owner, until the last person leaves and it's empty. */
	memberships: Membership[];
	/** Set when the last person left, who is the one person who can bring it back (D18). */
	deactivated?: { at: Date; by: Id };
	/** Starts at 1 and goes up by one on every write; the ETag (architecture §3.3). */
	version: number;
	createdAt: Date;
	updatedAt: Date;
}

export const HOUSEHOLD_NAME_MAX = 100;

/**
 * Who's left once this person has gone. A household keeps an owner: if they were the only one, it
 * passes to whoever has been in it longest (D18).
 */
export function membersAfterLeaving(memberships: Membership[], userId: Id): Membership[] {
	const left = memberships
		.filter((m) => m.userId !== userId)
		.sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime());
	if (left.length === 0 || left.some((m) => m.role === 'owner')) return left;
	const [longest, ...rest] = left;
	return [{ ...longest!, role: 'owner' }, ...rest];
}

export const cleanHouseholdName = (input: string): string | null =>
	cleanName(input, HOUSEHOLD_NAME_MAX);

/**
 * The canonical IANA name, or null if it isn't one. `Intl` also takes offsets such as `+02:00`,
 * which have no daylight saving rules to schedule by, so those are refused first.
 */
export function cleanTimeZone(input: string): string | null {
	if (!/^[A-Za-z][A-Za-z0-9_+/-]{0,63}$/.test(input)) return null;
	try {
		return new Intl.DateTimeFormat('en', { timeZone: input }).resolvedOptions().timeZone;
	} catch {
		return null;
	}
}
