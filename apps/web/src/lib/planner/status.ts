// How the UI names a planned session's status (ui.md §4.1, §4.3). "Done" is completion only: it
// says nothing about how it went (FR-07).
import type { SessionStatus } from '@toe-beans/contracts';

export const statusLabels: Record<SessionStatus, string> = {
	planned: 'Planned',
	completed: 'Done',
	skipped: 'Skipped',
	cancelled: 'Cancelled'
};
