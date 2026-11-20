// Reminder settings (architecture §6, D27, FR-12, ui.md J7): the devices someone has turned
// reminders on in, what they want reminding of, and the delayed test. Sending is the worker's.
// Devices and preferences are the person's own: nobody sees or changes anyone else's.
import { validationError } from '../../domain/errors.js';
import { isId, type Id } from '../../domain/id.js';
import { TIME_STEP_MIN } from '../../domain/planner.js';
import {
	arePushKeys,
	cleanDeviceLabel,
	defaultPreference,
	DEVICES_MAX,
	isAllowedEndpoint,
	isCareLead,
	isCareTime,
	isTrainingLead,
	lastUsed,
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
	/** The subscription this one renews (the service worker's `pushsubscriptionchange`). */
	replaces?: string | undefined;
}

export interface SeenInput extends DeviceInput {
	/** The key the browser subscribed with, which must be the server's for sends to work. */
	serverKey: string;
}

export interface PreferenceInput {
	training?: boolean | undefined;
	trainingLeadMin?: number | undefined;
	care?: boolean | undefined;
	careLeadDays?: number | undefined;
	careTimeOfDay?: string | undefined;
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

/**
 * What a new subscription with this label stands in for (architecture D43). No browser says it's
 * been uninstalled or reinstalled, so the label is the best guess there is. Stopped devices with
 * it go: the same device subscribing again after its old subscription was cancelled (on Android,
 * blocking the app's notifications does that) would otherwise list itself as a stopped "other
 * device". From the Notifications screen the one in use most recently goes too, as a reinstall
 * leaves the old install's device active until a reminder to it fails. A device with another label
 * stays, so its owner sees it.
 */
function sameDevice(mine: PushDevice[], label: string, replaceInUse: boolean): PushDevice[] {
	const same = mine.filter((d) => d.label === label);
	const stopped = same.filter((d) => d.disabledAt);
	const [latest] = same.filter((d) => !d.disabledAt).sort((a, b) => lastUsed(b) - lastUsed(a));
	return replaceInUse && latest ? [...stopped, latest] : stopped;
}

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

	async function save(
		ctx: MemberContext,
		input: DeviceInput,
		{ replaceInUse }: { replaceInUse: boolean }
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
		// A renewed subscription: the old one is certainly this browser, so nothing is guessed from
		// the label, which the service worker that renews it doesn't know anyway.
		const renewed =
			input.replaces && input.replaces !== input.endpoint
				? mine.find((d) => d.endpoint === input.replaces)
				: undefined;
		const label = cleanDeviceLabel(input.label ?? renewed?.label);
		const replaced = renewed ? [renewed] : known ? [] : sameDevice(mine, label, replaceInUse);
		if (!known && mine.length - replaced.length >= DEVICES_MAX) {
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
			label
		});
		if (!device) {
			// Someone else's endpoint without its keys: not this browser (security audit F6).
			log.warn('push endpoint of another person refused', { userId: ctx.userId });
			return err(validationError('This subscription is not valid.', { endpoint: ['Not valid.'] }));
		}
		for (const old of replaced) await pushDevices.remove(ctx.userId, old.id);
		if (!known) {
			log.info('push device added', {
				userId: ctx.userId,
				deviceId: device.id,
				replaced: replaced.length
			});
		}
		return ok(device);
	}

	return {
		/** The key browsers subscribe with. */
		publicKey: () => push.publicKey,

		devices: (ctx: MemberContext): Promise<PushDevice[]> => pushDevices.listForUser(ctx.userId),

		/**
		 * Registers this browser for the person, or refreshes it: the settings screen saves the
		 * current subscription each time it opens, so a phone handed to someone else, renewed keys
		 * or a device the push service had dropped all come right.
		 */
		saveDevice: (ctx: MemberContext, input: DeviceInput) =>
			save(ctx, input, { replaceInUse: true }),

		/**
		 * The app opened with reminders on (architecture D43): saving the subscription again marks
		 * the device in use, so it isn't deleted as stale, and brings back one that was. Null when the
		 * subscription was made with another key, which can't be sent to: the Notifications screen
		 * subscribes again. Unlike the screen, it never replaces a device in use, so two phones with
		 * the same name don't take turns removing each other.
		 */
		async deviceSeen(
			ctx: MemberContext,
			{ serverKey, ...input }: SeenInput
		): Promise<Result<PushDevice | null, ValidationError>> {
			if (serverKey !== push.publicKey) return ok(null);
			return save(ctx, input, { replaceInUse: false });
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
			const careLead = input.careLeadDays ?? current.careLeadDays;
			const careTime = input.careTimeOfDay ?? current.careTimeOfDay;
			const fields: Record<string, string[]> = {};
			if (!isTrainingLead(lead)) fields.trainingLeadMin = ['Choose one of the times offered.'];
			if (!isCareLead(careLead)) fields.careLeadDays = ['Choose one of the days offered.'];
			if (!isCareTime(careTime)) {
				fields.careTimeOfDay = [`Choose a time in ${TIME_STEP_MIN}-minute steps.`];
			}
			if (!isTrainingLead(lead) || !isCareLead(careLead) || !isCareTime(careTime)) {
				return err(validationError('The reminder time is not valid.', fields));
			}
			return ok(
				await reminderPreferences.save({
					userId: ctx.userId,
					training: input.training ?? current.training,
					trainingLeadMin: lead,
					care: input.care ?? current.care,
					careLeadDays: careLead,
					careTimeOfDay: careTime,
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
