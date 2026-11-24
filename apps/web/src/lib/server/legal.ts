// The privacy policy and terms (backlog S16.4). Their source is the docs, so what's reviewed is
// what's published: the text after the `---` line, titled by its `# ` heading and dated with the
// header's **Date**. Read into the bundle at build time and rendered once, at startup.
import { Marked, type Tokens } from 'marked';
import privacySource from '../../../../../docs/privacy-policy.md?raw';
import termsSource from '../../../../../docs/terms-of-service.md?raw';

const attribute = (text: string) =>
	text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/**
 * Tables carry each column's name on its cells, so on a phone a row can stack into a card with
 * the names as labels (LegalPage's styles) instead of scrolling sideways.
 */
const markdown = new Marked({
	gfm: true,
	renderer: {
		table(token: Tokens.Table) {
			const labels = token.header.map((cell) => attribute(cell.text.replace(/\*\*/g, '')));
			const head = token.header
				.map((cell) => `<th>${this.parser.parseInline(cell.tokens)}</th>`)
				.join('');
			const rows = token.rows
				.map(
					(row) =>
						'<tr>' +
						row
							.map(
								(cell, i) =>
									`<td data-label="${labels[i] ?? ''}">${this.parser.parseInline(cell.tokens)}</td>`
							)
							.join('') +
						'</tr>'
				)
				.join('\n');
			return `<table>\n<thead><tr>${head}</tr></thead>\n<tbody>\n${rows}\n</tbody>\n</table>\n`;
		}
	}
});

export interface LegalDocument {
	title: string;
	/** As the doc writes it, e.g. "19 November 2026". */
	updated: string;
	/**
	 * The same date as `YYYY-MM-DD`: the version people accept (backlog S19.1), so a new date on the
	 * terms asks everyone again.
	 */
	version: string;
	/** Rendered from our own Markdown, so it's trusted. */
	html: string;
}

const MONTHS = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
];

/** "19 November 2026" as "2026-11-19", or null if it isn't a date written that way. */
export function isoDate(written: string): string | null {
	const match = /^(\d{1,2}) ([A-Z][a-z]+) (\d{4})$/.exec(written);
	const month = match ? MONTHS.indexOf(match[2]!) + 1 : 0;
	if (!match || month === 0) return null;
	const iso = `${match[3]}-${String(month).padStart(2, '0')}-${match[1]!.padStart(2, '0')}`;
	return new Date(`${iso}T00:00:00Z`).toISOString().startsWith(iso) ? iso : null;
}

export function legalDocument(source: string): LegalDocument {
	const updated = /^\*\*Date:\*\* (.+)$/m.exec(source)?.[1]?.trim();
	const start = source.search(/^---$/m);
	const heading = /^# (.+)\n/m.exec(source.slice(start));
	const version = updated && isoDate(updated);
	if (!version || start < 0 || !heading) {
		throw new Error(
			'A legal doc needs a **Date:** line (e.g. 19 November 2026), then a --- line, then a # title'
		);
	}
	const body = source.slice(start + heading.index + heading[0].length);
	return {
		title: heading[1]!.trim(),
		updated: updated!,
		version,
		html: markdown.parse(body, { async: false })
	};
}

export const privacy = legalDocument(privacySource);
export const terms = legalDocument(termsSource);
