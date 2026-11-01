// Hugeicons ship attributes in camelCase (React style) plus a React `key`; SVG wants kebab-case.
// Icons are drawn at a 1.5 px stroke; a few details (dots) are thicker, so a different stroke
// width scales every stroke in proportion.

const BASE_STROKE = 1.5;

const kebab = (name: string) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

export function svgAttributes(
	attributes: Readonly<Record<string, string | number>>,
	strokeWidth: number
): Record<string, string | number> {
	const result: Record<string, string | number> = {};
	for (const [name, value] of Object.entries(attributes)) {
		if (name === 'key') continue;
		result[kebab(name)] =
			name === 'strokeWidth' ? (Number(value) * strokeWidth) / BASE_STROKE : value;
	}
	return result;
}
