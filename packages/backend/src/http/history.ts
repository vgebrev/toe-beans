// /api/v1/history (architecture §5.1, FR-08, FR-09). Someone with no household gets a 404, like
// every household resource (§4.4).
import { HistoryQuery, type HistoryPage as HistoryPageDto } from '@toe-beans/contracts';
import type { Viewer } from '../application/auth/auth.js';
import { notFound } from '../application/errors.js';
import type { History } from '../application/history/history.js';
import { behaviourEventDto } from './behaviour-events.js';
import { errorResponse, json, respond, type HttpResponse } from './response.js';
import { sessionLogDto } from './session-logs.js';
import { parseInput } from './validation.js';

export interface HistoryHttp {
	/** `query` is the URL's search parameters. */
	list(viewer: Viewer, input: { query: Record<string, string> }): Promise<HttpResponse>;
}

export function createHistoryHttp(history: History): HistoryHttp {
	return {
		async list(viewer, { query }) {
			if (!viewer.member) return errorResponse(notFound('household'));
			const { timeZone } = viewer.member;
			const input = parseInput(HistoryQuery, query);
			if (!input.ok) return errorResponse(input.error);
			const { dog, type, exercise, from, to, cursor } = input.value;
			const found = await history.list(viewer.member, {
				dogId: dog,
				type,
				exerciseId: exercise,
				from,
				to,
				cursor
			});
			return respond(found, (page) =>
				json({
					entries: page.entries.map((entry) =>
						entry.kind === 'training'
							? { kind: 'training' as const, log: sessionLogDto(entry.view, timeZone) }
							: { kind: 'event' as const, event: behaviourEventDto(entry.view, timeZone) }
					),
					...(page.next && { next: page.next })
				} satisfies HistoryPageDto)
			);
		}
	};
}
