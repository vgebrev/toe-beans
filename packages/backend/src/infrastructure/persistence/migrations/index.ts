// Every migration, in run order. Add new ones at the end; never edit one that has been deployed.
import { authIndexes } from './0001-auth.js';
import { householdIndexes } from './0002-households.js';
import { deactivatedHouseholds } from './0003-deactivated-households.js';
import { dogIndexes } from './0004-dogs.js';
import { cueIndexes } from './0005-cues.js';
import { plannerIndexes } from './0006-planner.js';
import { sessionLogIndexes } from './0007-session-logs.js';
import { reminderIndexes } from './0008-reminders.js';
import { behaviourEventIndexes } from './0009-behaviour-events.js';
import { historyIndexes } from './0010-history.js';
import { careTaskIndexes } from './0011-care-tasks.js';
import { planTimes } from './0012-plan-times.js';
import { invitationEmailIndex } from './0013-invitation-emails.js';
import { careHistoryIndex } from './0014-care-history.js';
import { householdExpiryIndex } from './0015-household-expiry.js';
import { pushDeviceExpiry } from './0016-push-device-expiry.js';
import type { Migration } from './runner.js';

export const migrations: readonly Migration[] = [
	authIndexes,
	householdIndexes,
	deactivatedHouseholds,
	dogIndexes,
	cueIndexes,
	plannerIndexes,
	sessionLogIndexes,
	reminderIndexes,
	behaviourEventIndexes,
	historyIndexes,
	careTaskIndexes,
	planTimes,
	invitationEmailIndex,
	careHistoryIndex,
	householdExpiryIndex,
	pushDeviceExpiry
];

export { migrate, type Migration } from './runner.js';
