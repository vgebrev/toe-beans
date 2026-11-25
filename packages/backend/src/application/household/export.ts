// The household's export (FR-16, architecture D46): a ZIP with every record the household holds in
// `household.json`, its dogs' photos, and a README saying how to read them. Owners only (D19).
//
// Each record is mapped field by field, so the format is a decision rather than whatever the
// documents hold: a field added to an entity stays out until it's added here. Left out on purpose:
// provider identities, sessions, push devices, invitations and the reminder ledger (D46), and
// fields that only drive the app (versions, the planner's horizon, a dog's accent colour).
import type { BehaviourEvent } from '../../domain/behaviour-event.js';
import { todayIn } from '../../domain/calendar.js';
import type { CareTask } from '../../domain/care-task.js';
import type { Cue } from '../../domain/cue.js';
import { photoKey, type Dog } from '../../domain/dog.js';
import type { Id } from '../../domain/id.js';
import type { PlannedSession, TrainingPlan } from '../../domain/planner.js';
import type { ReminderPreference } from '../../domain/reminders.js';
import { err, ok, type Result } from '../../domain/result.js';
import type { SessionLog } from '../../domain/session-log.js';
import type { User } from '../../domain/user.js';
import type { MemberContext } from '../auth/auth.js';
import { forbidden, notFound, type ForbiddenError, type NotFoundError } from '../errors.js';
import type { Ports, ZipEntry } from '../ports/index.js';
import { jsonText, LazyList, textStream } from './json-text.js';

/** Bumped when a field changes meaning or goes; adding one doesn't need it. */
export const EXPORT_SCHEMA_VERSION = 1;

export interface HouseholdExport {
	filename: string;
	stream: ReadableStream<Uint8Array>;
}

const photoPath = (dog: Dog) => `photos/${dog.id}.webp`;

const memberOf =
	(people: Map<Id, User>) =>
	({ userId, role, joinedAt }: { userId: Id; role: string; joinedAt: Date }) => {
		const user = people.get(userId);
		return {
			id: userId,
			displayName: user?.displayName ?? null,
			email: user?.email ?? null,
			role,
			joinedAt,
			termsAccepted: user?.termsAccepted ?? null
		};
	};

const dogOf = (dog: Dog) => ({
	id: dog.id,
	name: dog.name,
	birth: dog.birth ?? null,
	adoptionDate: dog.adoptionDate ?? null,
	notes: dog.notes ?? null,
	photo: photoPath(dog),
	archivedAt: dog.archivedAt ?? null,
	createdAt: dog.createdAt,
	updatedAt: dog.updatedAt
});

const cueOf = (cue: Cue) => ({
	id: cue.id,
	label: cue.label,
	meaning: cue.meaning,
	handSignal: cue.handSignal ?? null,
	rewardConvention: cue.rewardConvention ?? null,
	notes: cue.notes ?? null,
	updatedBy: cue.updatedBy,
	createdAt: cue.createdAt,
	updatedAt: cue.updatedAt
});

const planOf = (plan: TrainingPlan) => ({
	id: plan.id,
	dogId: plan.dogId,
	exerciseId: plan.exerciseId,
	startDate: plan.startDate,
	times: plan.times,
	days: plan.days,
	until: plan.until ?? null,
	updatedBy: plan.updatedBy,
	createdAt: plan.createdAt,
	updatedAt: plan.updatedAt
});

const plannedSessionOf = (session: PlannedSession) => ({
	id: session.id,
	dogId: session.dogId,
	exerciseId: session.exerciseId,
	scheduledAt: session.scheduledAt,
	status: session.status,
	trainingPlanId: session.planId ?? null,
	sessionLogId: session.sessionLogId ?? null,
	updatedBy: session.updatedBy,
	createdAt: session.createdAt,
	updatedAt: session.updatedAt
});

const sessionLogOf = (log: SessionLog) => ({
	id: log.id,
	dogId: log.dogId,
	exerciseId: log.exerciseId,
	exerciseContentVersion: log.exerciseContentVersion,
	practisedAt: log.practisedAt,
	outcome: log.outcome,
	durationMin: log.durationMin ?? null,
	emotionalState: log.emotionalState ?? null,
	environment: log.environment ?? null,
	environmentNote: log.environmentNote ?? null,
	notes: log.notes ?? null,
	plannedSessionId: log.plannedSessionId ?? null,
	caregiverId: log.caregiverId,
	updatedBy: log.updatedBy,
	deletedAt: log.deletedAt ?? null,
	createdAt: log.createdAt,
	updatedAt: log.updatedAt
});

const behaviourEventOf = (event: BehaviourEvent) => ({
	id: event.id,
	dogId: event.dogId,
	category: event.category,
	occurredAt: event.occurredAt,
	trigger: event.trigger ?? null,
	response: event.response ?? null,
	notes: event.notes ?? null,
	recordedBy: event.recordedBy,
	updatedBy: event.updatedBy,
	deletedAt: event.deletedAt ?? null,
	createdAt: event.createdAt,
	updatedAt: event.updatedAt
});

const careTaskOf = (task: CareTask) => ({
	id: task.id,
	dogId: task.dogId,
	category: task.category,
	title: task.title,
	dueDate: task.dueDate,
	dueTime: task.dueTime ?? null,
	notes: task.notes ?? null,
	status: task.status,
	completedOn: task.completedOn ?? null,
	nextId: task.nextId ?? null,
	history: task.history,
	createdBy: task.createdBy,
	updatedBy: task.updatedBy,
	createdAt: task.createdAt,
	updatedAt: task.updatedAt
});

const reminderSettingsOf = (pref: ReminderPreference) => ({
	memberId: pref.userId,
	training: pref.training,
	trainingLeadMin: pref.trainingLeadMin,
	care: pref.care,
	careLeadDays: pref.careLeadDays,
	careTimeOfDay: pref.careTimeOfDay,
	updatedAt: pref.updatedAt ?? null
});

const readme = (householdName: string, exportedOn: string) =>
	`Toe Beans: a copy of ${householdName}'s data, made on ${exportedOn}

household.json holds every record of the household, in JSON:
- household: its name, time zone and members, with their names, emails and roles
- dogs, with each one's photo in the photos folder
- cues: the cue dictionary
- trainingPlans (repeating plans) and plannedSessions
- sessionLogs: training sessions as they were logged
- behaviourEvents: the journal
- careTasks, each with its history of changes
- reminderSettings: what each member chose to be reminded of
- exercises: the title of each library exercise the records name

Reading it:
- Times with a date and a time (like 2026-11-25T08:30:00.000Z) are in UTC.
- Dates on their own (like 2026-11-25) and times of day (like 08:30) are on the
  household's clocks, in its time zone.
- People are named by ID. An ID that isn't among the members belongs to someone
  who has left; it names nobody.
- Records with a deletedAt were deleted in the app and are kept for a while
  before they go for good.
- An outcome of "not_assessed" means nobody judged how the session went. It is
  not a success.

Left out: sign-in details, sessions, devices that get reminders, invitations,
and anything secret.

schemaVersion in household.json says which version of this layout it uses.
`;

export function createHouseholdExport({
	households,
	users,
	householdRecords,
	reminderPreferences,
	exercises,
	photos,
	zip,
	clock,
	logger
}: Pick<
	Ports,
	| 'households'
	| 'users'
	| 'householdRecords'
	| 'reminderPreferences'
	| 'exercises'
	| 'photos'
	| 'zip'
	| 'clock'
	| 'logger'
>) {
	const log = logger.child({ component: 'export' });

	return {
		/**
		 * Reads the household's records now; photos follow as the ZIP is read, one at a time. A
		 * photo that's missing from storage is left out, and its dog still lists where it would be.
		 */
		async export(
			ctx: MemberContext
		): Promise<Result<HouseholdExport, ForbiddenError | NotFoundError>> {
			if (ctx.role !== 'owner') return err(forbidden);
			const household = await households.find(ctx.householdId);
			if (!household) return err(notFound('household'));
			const memberIds = household.memberships.map((m) => m.userId);
			const [records, people, prefs] = await Promise.all([
				householdRecords.read(household.id),
				users.findByIds(memberIds),
				reminderPreferences.findMany(memberIds)
			]);
			const now = clock.now();
			const exportedOn = todayIn(now, household.timeZone);
			const exerciseIds = [
				...new Set(
					[...records.trainingPlans, ...records.plannedSessions, ...records.sessionLogs].map(
						(r) => r.exerciseId
					)
				)
			].sort();

			const document = {
				schemaVersion: EXPORT_SCHEMA_VERSION,
				exportedAt: now,
				exportedBy: ctx.userId,
				household: {
					id: household.id,
					name: household.name,
					timeZone: household.timeZone,
					createdAt: household.createdAt,
					members: household.memberships.map(memberOf(new Map(people.map((u) => [u.id, u]))))
				},
				dogs: records.dogs.map(dogOf),
				cues: records.cues.map(cueOf),
				trainingPlans: records.trainingPlans.map(planOf),
				// The lists that grow with time are mapped only as they're written.
				plannedSessions: new LazyList(records.plannedSessions, plannedSessionOf),
				sessionLogs: new LazyList(records.sessionLogs, sessionLogOf),
				behaviourEvents: new LazyList(records.behaviourEvents, behaviourEventOf),
				careTasks: new LazyList(records.careTasks, careTaskOf),
				reminderSettings: prefs.map(reminderSettingsOf),
				exercises: exerciseIds.map((id) => ({ id, title: exercises.get(id)?.title ?? null }))
			};
			const text = (value: string) => async () => new TextEncoder().encode(value);
			const entries: ZipEntry[] = [
				{ name: 'README.txt', compress: true, open: text(readme(household.name, exportedOn)) },
				{
					name: 'household.json',
					compress: true,
					open: async () => textStream(jsonText(document))
				},
				...records.dogs.map((dog) => ({
					name: photoPath(dog),
					compress: false,
					open: async () =>
						(await photos.getStream(photoKey(dog, dog.photo.photoId, 'large')))?.body ?? null
				}))
			];
			log.info('household exported', {
				householdId: household.id,
				userId: ctx.userId,
				dogs: records.dogs.length,
				sessionLogs: records.sessionLogs.length,
				behaviourEvents: records.behaviourEvents.length,
				careTasks: records.careTasks.length
			});
			return ok({ filename: `toe-beans-export-${exportedOn}.zip`, stream: zip(entries) });
		}
	};
}
