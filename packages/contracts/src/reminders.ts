// Push reminders: /api/v1/reminders (architecture §6, D27, FR-12, ui.md J7). Devices and
// preferences are the signed-in person's own.
import { z } from 'zod';

export const PushDevice = z.object({
	id: z.string(),
	/** e.g. "Galaxy S23 FE · Chrome". */
	label: z.string(),
	createdAt: z.iso.datetime(),
	/** The last reminder it accepted. */
	lastSuccessAt: z.iso.datetime().optional(),
	/** The push service dropped it (the app was uninstalled, or site data cleared). */
	disabled: z.boolean()
});
export type PushDevice = z.infer<typeof PushDevice>;

/** Minutes before a session; 0 is at the session time. */
export const TrainingLead = z.union([
	z.literal(0),
	z.literal(5),
	z.literal(10),
	z.literal(15),
	z.literal(30),
	z.literal(60)
]);
export type TrainingLead = z.infer<typeof TrainingLead>;

export const ReminderPreference = z.object({
	training: z.boolean(),
	trainingLeadMin: TrainingLead
});
export type ReminderPreference = z.infer<typeof ReminderPreference>;

export const ReminderTest = z.object({
	id: z.string(),
	deviceId: z.string().optional(),
	/** No earlier than 3 minutes after it was asked for. */
	dueAt: z.iso.datetime(),
	status: z.enum(['pending', 'sending', 'sent', 'failed', 'skipped']),
	sentAt: z.iso.datetime().optional(),
	/** When the phone reported it arrived. */
	receivedAt: z.iso.datetime().optional(),
	/** Due over 10 minutes ago and not arrived: suggest the battery setting (ui.md J7). */
	overdue: z.boolean()
});
export type ReminderTest = z.infer<typeof ReminderTest>;

/** Everything the Notifications screen shows. */
export const ReminderSettings = z.object({
	/** The VAPID key browsers subscribe with (`applicationServerKey`). */
	publicKey: z.string(),
	preference: ReminderPreference,
	/** Newest first. */
	devices: z.array(PushDevice),
	test: ReminderTest.nullable()
});
export type ReminderSettings = z.infer<typeof ReminderSettings>;

/** The browser's PushSubscription, as `toJSON()` gives it, with a label for the device. */
export const SavePushDevice = z.object({
	endpoint: z.string().max(2048),
	keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
	label: z.string().max(200).optional()
});
export type SavePushDevice = z.infer<typeof SavePushDevice>;

/** A field left out stays as it was. */
export const UpdateReminderPreference = z.strictObject({
	training: z.boolean().optional(),
	trainingLeadMin: z.number().int().optional()
});
export type UpdateReminderPreference = z.infer<typeof UpdateReminderPreference>;

export const StartReminderTest = z.strictObject({ deviceId: z.string().max(100) });
export type StartReminderTest = z.infer<typeof StartReminderTest>;
