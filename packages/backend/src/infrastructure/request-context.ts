// The request being handled, carried in AsyncLocalStorage so the logger and the error reporter tag
// their output with its ID without every call passing it (architecture §9).
import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
	requestId: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export const withRequestContext = <T>(context: RequestContext, work: () => T): T =>
	storage.run(context, work);

export const currentRequestContext = (): RequestContext | undefined => storage.getStore();
