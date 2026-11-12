// Exports the PNG icons the manifest and notifications need from the brand SVGs
// (src/lib/assets/brand/README.md). Run with `pnpm --filter @toe-beans/web icons` after changing
// the mark; the output in static/icons is committed.
import { readFile } from 'node:fs/promises';
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
console.log('Wrote static/icons.');
