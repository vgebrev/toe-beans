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
	disabled: z.boolean(),
	/** Its person signed out there: reminders resume when they sign in there again (D43). */
	signedOut: z.boolean()
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

/** Days before a care task; 0 is on the day. */
export const CareLead = z.union([
	z.literal(0),
	z.literal(1),
	z.literal(2),
	z.literal(3),
	z.literal(7)
]);
export type CareLead = z.infer<typeof CareLead>;

export const ReminderPreference = z.object({
	training: z.boolean(),
	trainingLeadMin: TrainingLead,
	care: z.boolean(),
	careLeadDays: CareLead,
	/** `HH:MM` on the household's clocks: when a care reminder comes on its day. */
	careTimeOfDay: z.string()
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
	label: z.string().max(200).optional(),
	/** The endpoint this subscription renews, from the service worker's `pushsubscriptionchange`. */
	replaces: z.string().max(2048).optional()
});
export type SavePushDevice = z.infer<typeof SavePushDevice>;

/**
 * The app or the Notifications screen opened with this browser subscribed (architecture D43): the
 * subscription again, marking the device in use, with the key it was made with.
 */
export const SeenPushDevice = SavePushDevice.extend({ serverKey: z.string().max(200) });
export type SeenPushDevice = z.infer<typeof SeenPushDevice>;

/** The device saved, or null when this browser's subscription isn't one to save for them. */
export const SeenPushDeviceResult = z.object({ device: PushDevice.nullable() });
export type SeenPushDeviceResult = z.infer<typeof SeenPushDeviceResult>;

/** A field left out stays as it was. */
export const UpdateReminderPreference = z.strictObject({
	training: z.boolean().optional(),
	trainingLeadMin: z.number().int().optional(),
	care: z.boolean().optional(),
	careLeadDays: z.number().int().optional(),
	careTimeOfDay: z.string().max(10).optional()
});
export type UpdateReminderPreference = z.infer<typeof UpdateReminderPreference>;

export const StartReminderTest = z.strictObject({ deviceId: z.string().max(100) });
export type StartReminderTest = z.infer<typeof StartReminderTest>;
