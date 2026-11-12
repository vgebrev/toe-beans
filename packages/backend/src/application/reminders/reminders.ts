// Reminder settings (architecture §6, D27, FR-12, ui.md J7): the devices someone has turned
// reminders on in, what they want reminding of, and the delayed test. Sending is the worker's.
// Devices and preferences are the person's own: nobody sees or changes anyone else's.
import { validationError } from '../../domain/errors.js';
import { isId, type Id } from '../../domain/id.js';
import {
	arePushKeys,
	cleanDeviceLabel,
	defaultPreference,
	DEVICES_MAX,
	isAllowedEndpoint,
	isTrainingLead,
	TEST_DELAY_MS,
	TEST_OVERDUE_MS,
	testKey,
	type PushDevice,
	type PushKeys,
	type Reminder,
	type ReminderPreference
} from '../../domain/reminders.js';
import { err, ok, type Result } from '../../domain/result.js';
import type { MemberContext } from '../auth/auth.js';
import { notFound, type NotFoundError, type ValidationError } from '../errors.js';
import type { Ports } from '../ports/index.js';

export interface DeviceInput {
	endpoint: string;
	keys: PushKeys;
	label?: string | undefined;
}

export interface PreferenceInput {
	training?: boolean | undefined;
	trainingLeadMin?: number | undefined;
}

/** The latest test, as the settings screen shows it. */
export interface TestView {
	reminder: Reminder;
	/** Sent long enough ago that it should have arrived, and it hasn't (ui.md J7). */
	overdue: boolean;
}

export interface RemindersOptions {
	/** Push services devices may subscribe with (`isAllowedEndpoint`). */
	allowedEndpoints: readonly string[];
}

export type ReminderSettings = ReturnType<typeof createReminderSettings>;

export function createReminderSettings(
	{
		pushDevices,
		reminderPreferences,
		reminders,
		push,
		clock,
		ids,
		logger
	}: Pick<
		Ports,
		'pushDevices' | 'reminderPreferences' | 'reminders' | 'push' | 'clock' | 'ids' | 'logger'
	>,
	{ allowedEndpoints }: RemindersOptions
) {
	const log = logger.child({ component: 'reminders' });

	const findDevice = async (ctx: MemberContext, id: string) =>
		isId(id) ? pushDevices.findForUser(ctx.userId, id) : null;

	return {
		/** The key browsers subscribe with. */
		publicKey: () => push.publicKey,

		devices: (ctx: MemberContext): Promise<PushDevice[]> => pushDevices.listForUser(ctx.userId),

		/**
		 * Registers this browser for the person, or refreshes it: the settings screen saves the
		 * current subscription each time it opens, so a phone handed to someone else, renewed keys
		 * or a device the push service had dropped all come right.
		 */
		async saveDevice(
			ctx: MemberContext,
			input: DeviceInput
		): Promise<Result<PushDevice, ValidationError>> {
			if (!isAllowedEndpoint(input.endpoint, allowedEndpoints)) {
				log.warn('push endpoint refused', { userId: ctx.userId });
				return err(
					validationError("This browser's push service isn't supported.", {
						endpoint: ['Try a different browser.']
					})
				);
			}
			if (!arePushKeys(input.keys)) {
				return err(validationError('The subscription is not valid.', { keys: ['Not valid.'] }));
			}
			const mine = await pushDevices.listForUser(ctx.userId);
			const known = mine.some((d) => d.endpoint === input.endpoint);
			if (!known && mine.length >= DEVICES_MAX) {
				return err(
					validationError(
						`You can have reminders on up to ${DEVICES_MAX} devices. Remove one to add this one.`
					)
				);
			}
			const device = await pushDevices.save({
				id: ids.next(),
				userId: ctx.userId,
				endpoint: input.endpoint,
				keys: input.keys,
				label: cleanDeviceLabel(input.label)
			});
			if (!known) log.info('push device added', { userId: ctx.userId, deviceId: device.id });
			return ok(device);
		},

		async removeDevice(ctx: MemberContext, id: string): Promise<Result<void, NotFoundError>> {
			if (!isId(id) || !(await pushDevices.remove(ctx.userId, id))) return err(notFound('device'));
			log.info('push device removed', { userId: ctx.userId, deviceId: id });
			return ok(undefined);
		},

		async preference(ctx: MemberContext): Promise<ReminderPreference> {
			return (await reminderPreferences.find(ctx.userId)) ?? defaultPreference(ctx.userId);
		},

		async savePreference(
			ctx: MemberContext,
			input: PreferenceInput
		): Promise<Result<ReminderPreference, ValidationError>> {
			const current = (await reminderPreferences.find(ctx.userId)) ?? defaultPreference(ctx.userId);
			const lead = input.trainingLeadMin ?? current.trainingLeadMin;
			if (!isTrainingLead(lead)) {
				return err(
					validationError('The reminder time is not valid.', {
						trainingLeadMin: ['Choose one of the times offered.']
					})
				);
			}
			return ok(
				await reminderPreferences.save({
					userId: ctx.userId,
					training: input.training ?? current.training,
					trainingLeadMin: lead,
					updatedAt: clock.now()
				})
			);
		},

		/**
		 * Sends a test to this device in 3 minutes, so it arrives with the phone locked (ui.md J7).
		 * One still on its way is returned instead of starting another.
		 */
		async startTest(
			ctx: MemberContext,
			input: { deviceId: string }
		): Promise<Result<TestView, NotFoundError>> {
			const device = await findDevice(ctx, input.deviceId);
			if (!device || device.disabledAt) return err(notFound('device'));
			const now = clock.now();
			const latest = await reminders.latestTest(ctx.userId);
			if (
				latest &&
				latest.deviceId === device.id &&
				(latest.status === 'pending' || latest.status === 'sending')
			) {
				return ok({ reminder: latest, overdue: false });
			}
			const id = ids.next();
			const dueAt = new Date(now.getTime() + TEST_DELAY_MS);
			const reminder = await reminders.insert({
				id,
				householdId: ctx.householdId,
				userId: ctx.userId,
				kind: 'test',
				key: testKey(id),
				dueAt,
				status: 'pending',
				attempts: 0,
				notBefore: dueAt,
				deviceId: device.id,
				delivered: []
			});
			log.info('test reminder planned', { userId: ctx.userId, reminderId: id });
			return ok({ reminder, overdue: false });
		},

		async latestTest(ctx: MemberContext): Promise<TestView | null> {
			const reminder = await reminders.latestTest(ctx.userId);
			if (!reminder) return null;
			const overdue =
				!reminder.receivedAt && clock.now().getTime() - reminder.dueAt.getTime() > TEST_OVERDUE_MS;
			return { reminder, overdue };
		},

		/** The service worker reports each reminder that reaches the phone. */
		async received(ctx: MemberContext, id: string): Promise<Result<void, NotFoundError>> {
			if (!isId(id)) return err(notFound('reminder'));
			const marked = await reminders.markReceived(ctx.userId, id as Id, clock.now());
			return marked ? ok(undefined) : err(notFound('reminder'));
		}
	};
}
