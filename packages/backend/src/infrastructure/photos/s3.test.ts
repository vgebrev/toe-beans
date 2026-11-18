import { describe, expect, it } from 'vitest';
import { parseListing } from './s3.js';

describe('parseListing', () => {
	it('reads the keys and, when truncated, the continuation token', () => {
		const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult><Name>b</Name><Prefix>households/h1/</Prefix><KeyCount>2</KeyCount>
<IsTruncated>true</IsTruncated><NextContinuationToken>a&amp;b=</NextContinuationToken>
<Contents><Key>households/h1/dogs/d1/p1-thumb.webp</Key><Size>3</Size></Contents>
<Contents><Key>households/h1/dogs/d1/p1-large.webp</Key><Size>3</Size></Contents>
</ListBucketResult>`;
		expect(parseListing(xml)).toEqual({
			keys: ['households/h1/dogs/d1/p1-thumb.webp', 'households/h1/dogs/d1/p1-large.webp'],
			nextToken: 'a&b='
		});
	});

	it('has no token on the last page, and no keys when empty', () => {
		const xml =
			'<ListBucketResult><KeyCount>0</KeyCount><IsTruncated>false</IsTruncated></ListBucketResult>';
		expect(parseListing(xml)).toEqual({ keys: [] });
	});
});
