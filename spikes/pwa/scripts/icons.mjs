// Rasterises scripts/paw.svg into the PWA icon set. Run with `pnpm icons`; output is committed.
import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';

const svg = await readFile(new URL('./paw.svg', import.meta.url));
const out = (name) => new URL(`../static/icons/${name}`, import.meta.url).pathname;

// "any" icons: paw fills the canvas. Maskable: paw shrunk into the central 80% safe zone.
const maskable = Buffer.from(
	svg.toString().replace('<g fill', '<g transform="translate(51 51) scale(0.8)" fill')
);

for (const size of [192, 512]) {
	await sharp(svg).resize(size, size).png().toFile(out(`icon-${size}.png`));
	await sharp(maskable).resize(size, size).png().toFile(out(`maskable-${size}.png`));
}
await sharp(svg).resize(180, 180).png().toFile(out('apple-touch-icon.png'));
await writeFile(out('favicon.svg'), svg);

// Status-bar badge: Android only uses the alpha channel, so a white paw on transparent.
const badge = Buffer.from(
	svg.toString().replace(/<rect[^>]*\/>/, '').replace('fill="#8A4B1F"', 'fill="#FFFFFF"')
);
await sharp(badge).resize(96, 96).png().toFile(out('badge-96.png'));
