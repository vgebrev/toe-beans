// A page about one record (architecture §4.4): another household's, or one that's gone, is the
// same 404 page. Any other failure leaves the page to say it couldn't load.
import { error } from '@sveltejs/kit';
import { problemStatus, type ApiResult } from './index.js';

/** The record, or null when it couldn't be loaded; a 404 becomes the 404 page. */
export function found<T>(result: ApiResult<T>): T | null {
	if (result.ok) return result.data;
	if (problemStatus(result.error) === 404) error(404, 'Not found');
	return null;
}
