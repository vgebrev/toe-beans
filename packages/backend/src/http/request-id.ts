// Request IDs tie a request's log lines and error reports together (NFR-12). An upstream ID in
// `x-request-id` is kept so a proxy's logs line up; anything else gets a fresh one. The format
// check stops a client writing arbitrary text into the logs.
import { randomUUID } from 'node:crypto';

export const REQUEST_ID_HEADER = 'x-request-id';

const valid = /^[A-Za-z0-9._:-]{8,128}$/;

export const requestIdFrom = (header: string | null | undefined): string =>
	header && valid.test(header) ? header : randomUUID();
