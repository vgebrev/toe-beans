// A JSON document written a piece at a time (architecture D46): the export's household.json can
// run to megabytes, and building it in one `JSON.stringify` holds the whole text in memory and
// the event loop until it's done. The text is the same as `JSON.stringify(document, null, 2)`.

/** A list in the document whose items are made only as they're written. */
export class LazyList<T> {
	readonly items: readonly T[];
	readonly map: (item: T) => unknown;
	constructor(items: readonly T[], map: (item: T) => unknown) {
		this.items = items;
		this.map = map;
	}
}

const indent = (text: string, pad: string) => text.replaceAll('\n', '\n' + pad);

/**
 * The document's text, a top-level member or a list item at a time. Values are written as
 * `JSON.stringify` writes them; a `LazyList` member as an array of its mapped items.
 */
export function* jsonText(document: Record<string, unknown>): Generator<string, void, undefined> {
	const keys = Object.keys(document).filter((key) => document[key] !== undefined);
	yield '{';
	for (const [k, key] of keys.entries()) {
		const value = document[key];
		const comma = k < keys.length - 1 ? ',' : '';
		const name = `\n  ${JSON.stringify(key)}: `;
		if (!(value instanceof LazyList)) {
			yield name + indent(JSON.stringify(value, null, 2), '  ') + comma;
			continue;
		}
		if (value.items.length === 0) {
			yield `${name}[]${comma}`;
			continue;
		}
		yield `${name}[`;
		for (const [i, item] of value.items.entries()) {
			const text = JSON.stringify(value.map(item), null, 2);
			yield `\n    ${indent(text, '    ')}${i < value.items.length - 1 ? ',' : ''}`;
		}
		yield `\n  ]${comma}`;
	}
	yield '\n}\n';
}

/** About how much text each read of `textStream` encodes. */
const PIECE_CHARS = 64 * 1024;

/** The text as UTF-8, about 64 KB at a time, made only as it's read. */
export function textStream(pieces: Iterator<string, void, undefined>): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	return new ReadableStream<Uint8Array>(
		{
			pull(controller) {
				let text = '';
				while (text.length < PIECE_CHARS) {
					const next = pieces.next();
					if (next.done) {
						if (text) controller.enqueue(encoder.encode(text));
						controller.close();
						return;
					}
					text += next.value;
				}
				controller.enqueue(encoder.encode(text));
			},
			cancel() {
				pieces.return?.();
			}
		},
		{ highWaterMark: 0 }
	);
}
