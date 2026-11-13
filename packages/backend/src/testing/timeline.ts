// The timeline page an in-memory repository returns, as the Mongo adapters do (architecture §5.1).
import type { TimelineQuery } from '../application/ports/index.js';
import type { Id } from '../domain/id.js';

export function timelinePage<T extends { id: Id; dogId: Id }>(
	items: readonly T[],
	at: (item: T) => Date,
	{ dogId, from, to, before, limit }: TimelineQuery
): T[] {
	const time = (item: T) => at(item).getTime();
	return items
		.filter(
			(item) =>
				(!dogId || item.dogId === dogId) &&
				(!from || time(item) >= from.getTime()) &&
				(!to || time(item) < to.getTime()) &&
				(!before ||
					time(item) < before.at.getTime() ||
					(time(item) === before.at.getTime() && item.id < before.id))
		)
		.sort((a, b) => time(b) - time(a) || (a.id < b.id ? 1 : -1))
		.slice(0, limit);
}
