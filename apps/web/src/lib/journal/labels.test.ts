import { describe, expect, it } from 'vitest';
import { eventPhrase } from './labels.js';

describe('eventPhrase', () => {
	it("names the dog's event, and Other plainly", () => {
		expect(eventPhrase('toileting_accident', 'Ripley')).toBe("Ripley's toileting accident");
		expect(eventPhrase('other', 'Ripley')).toBe('an event for Ripley');
		expect(eventPhrase('barking', undefined)).toBe("your dog's barking");
	});
});
