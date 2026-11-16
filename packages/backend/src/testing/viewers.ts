// Who a handler is asked by, for the http tests: Sam, signed in, with or without a household.
import type { MemberViewer, Viewer } from '../application/auth/auth.js';
import type { Id } from '../domain/id.js';

export const noHousehold: Viewer = {
	auth: { userId: 'u' as Id },
	displayName: 'Sam',
	email: 'sam@example.com',
	member: null
};

/** Sam as a caregiver in `householdId`, whose clocks are in `timeZone`. */
export const memberViewer = (householdId: string, timeZone = 'UTC'): MemberViewer => ({
	...noHousehold,
	member: {
		userId: 'u' as Id,
		householdId: householdId as Id,
		role: 'caregiver',
		householdName: 'The Does',
		timeZone
	}
});
