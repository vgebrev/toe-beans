// What a detail page hands History after a delete, so its snackbar can offer *Undo* (ui.md J8,
// architecture §5.3): which record, the deleted version for If-Match, and what to say.
export interface Deleted {
	kind: 'log' | 'event';
	id: string;
	etag: string;
	/** "Deleted Ripley's Recall basics log." */
	text: string;
}

/** The API path of a deleted record, to delete or restore it. */
export const recordPath = ({ kind, id }: Pick<Deleted, 'kind' | 'id'>) =>
	kind === 'log' ? `/session-logs/${id}` : `/behaviour-events/${id}`;
