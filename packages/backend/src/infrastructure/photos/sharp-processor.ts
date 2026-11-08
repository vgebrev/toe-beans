// Re-encodes an uploaded photo (architecture §3.6): turned upright from its EXIF orientation,
// cropped square and written as WebP in each size. sharp writes no metadata unless asked, so EXIF
// and GPS location are gone from what's stored (NFR-02).
import sharp from 'sharp';
import type { PhotoProcessor } from '../../application/ports/index.js';
import { PHOTO_PIXELS, type PhotoSize } from '../../domain/dog.js';

const ACCEPTED = new Set(['jpeg', 'png', 'webp']);
/** Larger than any phone camera; stops a small file that decodes to a huge image. */
const MAX_INPUT_PIXELS = 50_000_000;

// The app is small and photos are rare: no cache to hold memory on a 512 MB instance.
sharp.cache(false);

export function sharpPhotoProcessor(): PhotoProcessor {
	return {
		async process(bytes) {
			const options = { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' } as const;
			let format: string | undefined;
			try {
				({ format } = await sharp(bytes, options).metadata());
			} catch {
				return null;
			}
			if (!format || !ACCEPTED.has(format)) return null;
			try {
				const upright = await sharp(bytes, options).rotate().toBuffer();
				const encode = (size: PhotoSize) =>
					sharp(upright)
						.resize(PHOTO_PIXELS[size], PHOTO_PIXELS[size], { fit: 'cover', position: 'centre' })
						.webp({ quality: size === 'thumb' ? 75 : 80 })
						.toBuffer();
				const [large, thumb] = await Promise.all([encode('large'), encode('thumb')]);
				return { large: new Uint8Array(large), thumb: new Uint8Array(thumb) };
			} catch {
				// Read as an image but broken further in, e.g. a truncated file.
				return null;
			}
		}
	};
}
