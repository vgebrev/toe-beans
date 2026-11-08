import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { sharpPhotoProcessor } from './sharp-processor.js';

const processor = sharpPhotoProcessor();

/** 200×100, red on the left and blue on the right, as a camera might save it. */
async function cameraPhoto(orientation = 1) {
	const red = { r: 255, g: 0, b: 0 };
	const blue = { r: 0, g: 0, b: 255 };
	const half = (background: typeof red) =>
		sharp({ create: { width: 100, height: 100, channels: 3, background } })
			.png()
			.toBuffer();
	return (
		sharp({ create: { width: 200, height: 100, channels: 3, background: red } })
			.composite([{ input: await half(blue), left: 100, top: 0 }])
			.jpeg()
			// sharp takes the orientation separately; an Orientation tag in the EXIF is overwritten.
			.withMetadata({ orientation })
			.withExif({
				IFD0: { Make: 'PhoneCo', Model: 'Camera 1' },
				IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '33/1 55/1 0/1' }
			})
			.toBuffer()
	);
}

const pixel = async (image: Uint8Array, x: number, y: number) => {
	const { data, info } = await sharp(image).raw().toBuffer({ resolveWithObject: true });
	const at = (y * info.width + x) * info.channels;
	return { r: data[at]!, g: data[at + 1]!, b: data[at + 2]! };
};

describe('sharpPhotoProcessor', () => {
	it('makes square WebP in both sizes with no EXIF or location', async () => {
		const input = await cameraPhoto(6);
		expect(await sharp(input).metadata()).toMatchObject({
			orientation: 6,
			exif: expect.anything()
		});
		const out = await processor.process(new Uint8Array(input));
		for (const [size, pixels] of [
			['large', 1024],
			['thumb', 256]
		] as const) {
			const meta = await sharp(out![size]).metadata();
			expect(meta).toMatchObject({ format: 'webp', width: pixels, height: pixels });
			expect(meta.exif).toBeUndefined();
			expect(meta.orientation).toBeUndefined();
			expect(meta.icc).toBeUndefined();
			expect(meta.xmp).toBeUndefined();
		}
	});

	it('turns the photo upright from its EXIF orientation before cropping', async () => {
		// Orientation 6: shown turned 90° clockwise, so the red left half ends up on top.
		const out = await processor.process(new Uint8Array(await cameraPhoto(6)));
		const top = await pixel(out!.thumb, 128, 20);
		const bottom = await pixel(out!.thumb, 128, 236);
		expect(top.r).toBeGreaterThan(200);
		expect(top.b).toBeLessThan(60);
		expect(bottom.b).toBeGreaterThan(200);
		expect(bottom.r).toBeLessThan(60);
	});

	it('takes PNG and WebP too', async () => {
		const image = sharp({ create: { width: 50, height: 50, channels: 3, background: '#7a5' } });
		for (const encoded of [
			await image.clone().png().toBuffer(),
			await image.clone().webp().toBuffer()
		]) {
			expect(await processor.process(new Uint8Array(encoded))).not.toBeNull();
		}
	});

	it('refuses what is not a JPEG, PNG or WebP image, or is broken', async () => {
		const gif = await sharp({ create: { width: 5, height: 5, channels: 3, background: '#000' } })
			.gif()
			.toBuffer();
		const svg = new TextEncoder().encode(
			'<svg xmlns="http://www.w3.org/2000/svg" width="9" height="9"/>'
		);
		const jpeg = await cameraPhoto();
		const truncated = new Uint8Array(jpeg.subarray(0, jpeg.length / 2));
		for (const bytes of [new Uint8Array(gif), svg, new TextEncoder().encode('hello'), truncated]) {
			expect(await processor.process(bytes)).toBeNull();
		}
	});

	it('refuses an image that would decode to more pixels than any camera takes', async () => {
		const huge = await sharp({
			create: { width: 10_000, height: 6_000, channels: 3, background: '#fff' }
		})
			.png({ compressionLevel: 9 })
			.toBuffer();
		expect(await processor.process(new Uint8Array(huge))).toBeNull();
	});
});
