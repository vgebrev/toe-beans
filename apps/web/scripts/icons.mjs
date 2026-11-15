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
