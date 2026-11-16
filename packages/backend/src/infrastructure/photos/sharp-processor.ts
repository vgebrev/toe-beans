// Re-encodes an uploaded photo (architecture §3.6): turned upright from its EXIF orientation,
// cropped square and written as WebP in each size. sharp writes no metadata unless asked, so EXIF
// and GPS location are gone from what's stored (NFR-02).
import sharp from 'sharp';
import type { PhotoProcessor, ProcessedPhoto } from '../../application/ports/index.js';
import { PHOTO_PIXELS, type PhotoSize } from '../../domain/dog.js';

const ACCEPTED = new Set(['jpeg', 'png', 'webp']);
/** Larger than any phone camera; stops a small file that decodes to a huge image. */
const MAX_INPUT_PIXELS = 50_000_000;

// The app is small and photos are rare: no cache to hold memory on a 512 MB instance.
sharp.cache(false);

/**
 * Runs one photo at a time: a 50-megapixel decode takes about 200 MB, so a few at once could take
 * a 512 MB instance down, and the reminder tick with it (architecture D32, security audit F5).
 * The others wait their turn.
 */
export function oneAtATime() {
	let last: Promise<unknown> = Promise.resolve();
	return <T>(work: () => Promise<T>): Promise<T> => {
		const run = last.then(work, work);
		last = run.catch(() => undefined);
		return run;
	};
}

export function sharpPhotoProcessor(): PhotoProcessor {
	const queue = oneAtATime();
	return { process: (bytes) => queue(() => processPhoto(bytes)) };
}

async function processPhoto(bytes: Uint8Array): Promise<ProcessedPhoto | null> {
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
