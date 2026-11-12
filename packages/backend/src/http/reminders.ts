// /api/v1/reminders (architecture §6, D27, FR-12, ui.md J7). Everything here is the signed-in
// person's own: their devices, their preference and their test. Someone with no household gets a
// 404, as for every other household feature, since there's nothing to remind them of.
import {
	SavePushDevice,
	StartReminderTest,
	UpdateReminderPreference,
	type PushDevice as DeviceDto,
	type ReminderPreference as PreferenceDto,
	type ReminderSettings as SettingsDto,
	type ReminderTest as TestDto
} from '@toe-beans/contracts';
import type { MemberViewer, Viewer } from '../application/auth/auth.js';
import { notFound } from '../application/errors.js';
import type { ReminderSettings, TestView } from '../application/reminders/reminders.js';
import type { PushDevice, ReminderPreference } from '../domain/reminders.js';
import { errorResponse, json, noContent, respond, type HttpResponse } from './response.js';
import { parseInput } from './validation.js';

export interface RemindersHttp {
	settings(viewer: Viewer): Promise<HttpResponse>;
	saveDevice(viewer: Viewer, input: { body: unknown }): Promise<HttpResponse>;
	removeDevice(viewer: Viewer, input: { id: string }): Promise<HttpResponse>;
	savePreference(viewer: Viewer, input: { body: unknown }): Promise<HttpResponse>;
	startTest(viewer: Viewer, input: { body: unknown }): Promise<HttpResponse>;
	received(viewer: Viewer, input: { id: string }): Promise<HttpResponse>;
}

/** Never the endpoint or keys: those stay on the server (NFR-02). */
export const deviceDto = (d: PushDevice): DeviceDto => ({
	id: d.id,
	label: d.label,
	createdAt: d.createdAt.toISOString(),
	...(d.lastSuccessAt && { lastSuccessAt: d.lastSuccessAt.toISOString() }),
	disabled: Boolean(d.disabledAt)
});

const preferenceDto = (p: ReminderPreference): PreferenceDto => ({
	training: p.training,
	trainingLeadMin: p.trainingLeadMin
});

const testDto = ({ reminder: r, overdue }: TestView): TestDto => ({
	id: r.id,
	...(r.deviceId && { deviceId: r.deviceId }),
	dueAt: r.dueAt.toISOString(),
	status: r.status,
	...(r.sentAt && { sentAt: r.sentAt.toISOString() }),
	...(r.receivedAt && { receivedAt: r.receivedAt.toISOString() }),
	overdue
});

const isMember = (viewer: Viewer): viewer is MemberViewer => viewer.member !== null;
const noHousehold = () => errorResponse(notFound('household'));

export function createRemindersHttp(reminders: ReminderSettings): RemindersHttp {
	return {
		async settings(viewer) {
			if (!isMember(viewer)) return noHousehold();
			const [preference, devices, test] = await Promise.all([
				reminders.preference(viewer.member),
				reminders.devices(viewer.member),
				reminders.latestTest(viewer.member)
			]);
			return json({
				publicKey: reminders.publicKey(),
				preference: preferenceDto(preference),
				devices: devices.map(deviceDto),
				test: test && testDto(test)
			} satisfies SettingsDto);
		},

		async saveDevice(viewer, { body }) {
			if (!isMember(viewer)) return noHousehold();
			const input = parseInput(SavePushDevice, body);
			if (!input.ok) return errorResponse(input.error);
			const saved = await reminders.saveDevice(viewer.member, input.value);
			return respond(saved, (d) => json(deviceDto(d)));
		},

		async removeDevice(viewer, { id }) {
			if (!isMember(viewer)) return noHousehold();
			return respond(await reminders.removeDevice(viewer.member, id), () => noContent());
		},

		async savePreference(viewer, { body }) {
			if (!isMember(viewer)) return noHousehold();
			const input = parseInput(UpdateReminderPreference, body);
			if (!input.ok) return errorResponse(input.error);
			const saved = await reminders.savePreference(viewer.member, input.value);
			return respond(saved, (p) => json(preferenceDto(p)));
		},

		async startTest(viewer, { body }) {
			if (!isMember(viewer)) return noHousehold();
			const input = parseInput(StartReminderTest, body);
			if (!input.ok) return errorResponse(input.error);
			const started = await reminders.startTest(viewer.member, input.value);
			return respond(started, (t) => json(testDto(t), 201));
		},

		async received(viewer, { id }) {
			if (!isMember(viewer)) return noHousehold();
			return respond(await reminders.received(viewer.member, id), () => noContent());
		}
	};
}
