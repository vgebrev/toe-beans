import { describe, expect, it } from 'vitest';
import { legalDocument, privacy, terms } from './legal.js';

describe('legal documents', () => {
	it('publish only what follows the line, titled and dated from the doc', () => {
		const doc = legalDocument(
			'# Doc\n\n**Date:** 1 May 2027\n\nNotes for the owner.\n\n---\n\n# Privacy\n\n## 1. Who\n\nUs, *here*.\n'
		);
		expect(doc).toEqual({
			title: 'Privacy',
			updated: '1 May 2027',
			html: '<h2>1. Who</h2>\n<p>Us, <em>here</em>.</p>\n'
		});
	});

	it('render tables and links', () => {
		const { html } = legalDocument(
			'**Date:** 1 May 2027\n\n---\n\n# T\n\n| A | B |\n|---|---|\n| [x](/privacy) | y |\n'
		);
		expect(html).toContain('<th>A</th>');
		expect(html).toContain('<td data-label="A"><a href="/privacy">x</a></td>');
		expect(html).toContain('<td data-label="B">y</td>');
	});

	it('refuse a doc without its date, line or title', () => {
		expect(() => legalDocument('---\n\n# T\n')).toThrow();
		expect(() => legalDocument('**Date:** 1 May 2027\n\n# T\n')).toThrow();
		expect(() => legalDocument('**Date:** 1 May 2027\n\n---\n\nNo title\n')).toThrow();
	});

	it('read the real policy and terms', () => {
		expect(privacy.title).toBe('Privacy policy');
		expect(privacy.html).toContain('Information Regulator');
		expect(privacy.html).not.toContain('Before publishing');
		expect(terms.title).toBe('Terms of service');
		expect(terms.html).toContain('href="/privacy"');
	});

	it('publish no placeholder left for the owner', () => {
		for (const doc of [privacy, terms]) expect(doc.html).not.toMatch(/\[OWNER/);
	});
});
