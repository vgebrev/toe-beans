import { describe, expect, it } from 'vitest';
import type { Id } from './id.js';
import { invitationState, maskEmail, type Invitation } from './invitation.js';

const now = new Date('2026-11-06T10:00:00Z');
const later = new Date('2026-11-13T10:00:00Z');
const invitation: Invitation = {
	id: 'i' as Id,
	householdId: 'h' as Id,
	kind: 'link',
	tokenHash: 'hash',
	expiresAt: later,
	maxUses: 1,
	useCount: 0,
	createdBy: 'u' as Id,
	version: 1,
	createdAt: now,
	updatedAt: now
};

describe('invitationState', () => {
	it('is open until something stops it', () => {
		expect(invitationState(invitation, now)).toBe('open');
	});

	it('expires at the instant it says', () => {
		expect(invitationState(invitation, later)).toBe('expired');
		expect(invitationState(invitation, new Date(later.getTime() - 1))).toBe('open');
	});

	it('is used up at its limit', () => {
		expect(invitationState({ ...invitation, useCount: 1 }, now)).toBe('used');
	});

	it('says what stopped it first, not that time ran out afterwards', () => {
		expect(invitationState({ ...invitation, revokedAt: now, useCount: 1 }, later)).toBe('revoked');
		expect(invitationState({ ...invitation, useCount: 1 }, later)).toBe('used');
	});
});

describe('maskEmail', () => {
	it('keeps the first letter and the domain', () => {
		expect(maskEmail('jane.doe@gmail.com')).toBe('j•••@gmail.com');
	});
});
