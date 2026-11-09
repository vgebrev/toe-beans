import { describe, expect, it } from 'vitest';
import type { Id } from './id.js';
import {
	cleanHouseholdName,
	cleanTimeZone,
	membersAfterLeaving,
	type Membership,
	type Role
} from './household.js';

describe('cleanHouseholdName', () => {
	it('tidies whitespace', () => {
		expect(cleanHouseholdName('  The   Gebrevs ')).toBe('The Gebrevs');
	});

	it.each([['   '], ['a'.repeat(101)], ['bad\u0007name'], ['spoof‮name']])('refuses %j', (name) => {
		expect(cleanHouseholdName(name)).toBeNull();
	});
});

describe('cleanTimeZone', () => {
	it.each([
		['Africa/Johannesburg', 'Africa/Johannesburg'],
		['UTC', 'UTC'],
		['africa/johannesburg', 'Africa/Johannesburg']
	])('takes %s', (input, expected) => {
		expect(cleanTimeZone(input)).toBe(expected);
	});

	it.each([['Mars/Olympus'], ['+02:00'], [''], ['Africa/Johannesburg; drop']])(
		'refuses %j',
		(input) => {
			expect(cleanTimeZone(input)).toBeNull();
		}
	);
});

describe('membersAfterLeaving', () => {
	const member = (userId: string, role: Role, day: number): Membership => ({
		userId: userId as Id,
		role,
		joinedAt: new Date(Date.UTC(2026, 10, day))
	});
	const owner = member('a', 'owner', 1);
	const first = member('b', 'caregiver', 2);
	const second = member('c', 'caregiver', 3);

	it('passes ownership to the longest-standing member, whatever the order', () => {
		expect(membersAfterLeaving([owner, second, first], owner.userId)).toEqual([
			{ ...first, role: 'owner' },
			second
		]);
	});

	it('changes nobody when a caregiver leaves', () => {
		expect(membersAfterLeaving([owner, first], first.userId)).toEqual([owner]);
	});

	it('promotes nobody while another owner stays', () => {
		const coOwner = member('d', 'owner', 4);
		expect(membersAfterLeaving([owner, first, coOwner], owner.userId)).toEqual([first, coOwner]);
	});

	it('leaves nobody when the last person goes', () => {
		expect(membersAfterLeaving([owner], owner.userId)).toEqual([]);
	});
});
