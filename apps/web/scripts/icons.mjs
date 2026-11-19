// Exports the PNG icons the manifest and notifications need from the brand SVGs
// (src/lib/assets/brand/README.md). Run with `pnpm --filter @toe-beans/web icons` after changing
// the mark; the output in static/icons is committed.
import { readFile } from 'node:fs/promises';
import { NoteAddIcon, TaskDone01Icon } from '@hugeicons/core-free-icons';
import sharp from 'sharp';

const brand = (name) => readFile(new URL(`../src/lib/assets/brand/${name}`, import.meta.url));
const out = (name) => new URL(`../static/icons/${name}`, import.meta.url).pathname;
// Rendered large, then scaled down, so curves stay smooth.
const render = (svg, size) =>
	sharp(svg, { density: 384 }).resize(size, size).png({ compressionLevel: 9 });

const [tile, maskable, badge] = await Promise.all(
	['favicon.svg', 'maskable.svg', 'badge.svg'].map(brand)
);
for (const size of [192, 512]) {
	await render(tile, size).toFile(out(`icon-${size}.png`));
	await render(maskable, size).toFile(out(`maskable-${size}.png`));
}
// The test environment's icons (S17.6): the same tiles with a TEST band, so a phone with both
// installed can tell them apart. The maskable band sits inside the safe zone (the middle 80%
// circle), where Android's crop leaves it whole.
const band = (svg, { y, height, width, clip }) => {
	const source = svg.toString();
	const scale = source.includes('viewBox="0 0 128 128"') ? 4 : 1;
	const shape = `<clipPath id="tile"><rect width="512" height="512" rx="${clip}"/></clipPath>`;
	const rect = `<rect x="${256 - width / 2}" y="${y}" width="${width}" height="${height}" rx="${clip ? 0 : height * 0.2}" fill="#1F6F78"/>`;
	const text = `<text x="256" y="${y + height * 0.76}" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-weight="bold" font-size="${height * 0.72}" letter-spacing="${height * 0.08}" fill="#FFFBF5">TEST</text>`;
	return Buffer.from(
		source
			.replace(/viewBox="0 0 \d+ \d+"/, 'viewBox="0 0 512 512"')
			.replace(/<svg([^>]*)>/, `<svg$1><defs>${shape}</defs><g transform="scale(${scale})">`)
			.replace(/<\/svg>\s*$/, `</g><g clip-path="url(#tile)">${rect}${text}</g></svg>`)
	);
};
for (const size of [192, 512]) {
	await render(band(tile, { y: 400, height: 112, width: 512, clip: 112 }), size).toFile(
		out(`test-icon-${size}.png`)
	);
	await render(band(maskable, { y: 318, height: 96, width: 336, clip: 0 }), size).toFile(
		out(`test-maskable-${size}.png`)
	);
}
// Android draws the badge from its alpha channel only: a white silhouette on transparent.
await render(badge, 96).toFile(out('badge-96.png'));
// The home screen shortcuts (ui.md §6.3): the "+" chooser's own icons in cream on the primary
// colour, full bleed, since Android crops shortcut icons to its own shape.
const kebab = (name) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const glyph = (icon) =>
	icon
		.map(([tag, attributes]) => {
			const attrs = Object.entries(attributes)
				.filter(([name]) => name !== 'key')
				.map(([name, value]) => `${kebab(name)}="${value}"`)
				.join(' ');
			return `<${tag} ${attrs}/>`;
		})
		.join('');
const shortcut = (icon) =>
	Buffer.from(
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">` +
			`<rect width="96" height="96" fill="#8A4B1F"/>` +
			`<g transform="translate(24 24) scale(2)" color="#FFFBF5">${glyph(icon)}</g></svg>`
	);
await render(shortcut(TaskDone01Icon), 96).toFile(out('shortcut-log-96.png'));
await render(shortcut(NoteAddIcon), 96).toFile(out('shortcut-event-96.png'));
console.log('Wrote static/icons.');
