// The Mongo filter for one page of History's timeline from one collection (architecture §5.1):
// newest first by `field` and then by ID, starting after the cursor.
import type { TimelineQuery } from '../../application/ports/index.js';

export const timelineSort = (field: string) => ({ [field]: -1, _id: -1 }) as const;

export function timelineFilter(
	field: string,
	{ dogId, from, to, before }: TimelineQuery
): Record<string, unknown> {
	const range: Record<string, Date> = {};
	if (from) range.$gte = from;
	if (to) range.$lt = to;
	return {
		...(dogId && { dogId }),
		...(Object.keys(range).length > 0 && { [field]: range }),
		...(before && {
			$or: [{ [field]: { $lt: before.at } }, { [field]: before.at, _id: { $lt: before.id } }]
		})
	};
}
