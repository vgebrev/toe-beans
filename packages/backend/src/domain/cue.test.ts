import { describe, expect, it } from 'vitest';
import { cleanCueDetails, duplicateLabel, labelKey } from './cue.js';
import type { Id } from './id.js';

describe('cleanCueDetails', () => {
	it('tidies the text and keeps only what was given', () => {
		expect(
			cleanCueDetails({
				label: '  Let’s   go ',
				meaning: ' Walk on with me.\r\nNo pulling. ',
				handSignal: '',
				rewardConvention: 'A treat by my left knee',
				notes: '   '
			})
		).toEqual({
			ok: true,
			value: {
				label: 'Let’s go',
				meaning: 'Walk on with me.\nNo pulling.',
				rewardConvention: 'A treat by my left knee'
			}
		});
	});

	it('needs a cue word and a meaning, and says what else is wrong', () => {
		expect(
			cleanCueDetails({ label: ' ', meaning: '', handSignal: 'x'.repeat(501), notes: 'a\u0007' })
		).toEqual({
			ok: false,
			error: {
				kind: 'validation',
				message: 'The cue is not valid.',
				fields: {
					label: ['Enter the cue word, up to 50 characters.'],
					meaning: ['Say what your dog does on this cue.'],
					handSignal: ['Keep this to 500 characters of text.'],
					notes: ['Keep this to 2000 characters of text.']
				}
			}
		});
	});

	it('refuses a cue word that is too long or spans lines', () => {
		expect(cleanCueDetails({ label: 'x'.repeat(51), meaning: 'm' }).ok).toBe(false);
		expect(cleanCueDetails({ label: 'Sit\u0000', meaning: 'm' }).ok).toBe(false);
		expect(cleanCueDetails({ label: 'x'.repeat(50), meaning: 'm' }).ok).toBe(true);
	});
});

describe('duplicateLabel', () => {
	const cues = [
		{ id: 'c1' as Id, label: 'Sit' },
		{ id: 'c2' as Id, label: 'Leave it' }
	];

	it('matches whatever the case and spacing', () => {
		expect(labelKey('  LEAVE   it ')).toBe(labelKey('Leave it'));
		expect(duplicateLabel('leave  IT', cues)).toEqual({
			label: ["There's already a cue called “Leave it”."]
		});
		expect(duplicateLabel('Down', cues)).toBeNull();
	});

	it('lets a cue keep its own word', () => {
		expect(duplicateLabel('sit', cues, 'c1' as Id)).toBeNull();
		expect(duplicateLabel('sit', cues, 'c2' as Id)).not.toBeNull();
	});
});
