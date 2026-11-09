// The PhotoStore the config names (architecture §3.6).
import type { PhotoStore } from '../../application/ports/index.js';
import type { PhotoConfig } from '../../config.js';
import { filesystemPhotoStore } from './filesystem.js';
import { s3PhotoStore } from './s3.js';

export function createPhotoStore(config: PhotoConfig): PhotoStore {
	return config.kind === 'filesystem'
		? filesystemPhotoStore(config.directory)
		: s3PhotoStore(config);
}

export { sharpPhotoProcessor } from './sharp-processor.js';
