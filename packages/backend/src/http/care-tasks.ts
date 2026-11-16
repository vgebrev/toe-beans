// /api/v1/care-tasks (architecture §5.2, D30, FR-10). Someone with no household gets a 404, as if
// they'd asked for another household's task (§4.4).
import {
	CompleteCareTask,
	CreateCareTask,
	UpdateCareTask,
	type CareHistoryEntry as HistoryDto,
	type CareTask as CareTaskDto,
	type CareTasks as CareTasksDto
} from '@toe-beans/contracts';
import type { PlannerContext, Viewer } from '../application/auth/auth.js';
import type { CareTasks, CareView } from '../application/care/care-tasks.js';
import type { Clock } from '../application/ports/index.js';
import { todayIn, type PlainDate } from '../domain/calendar.js';
import { isOverdue, type CareHistoryEntry } from '../domain/care-task.js';
import { etag, versionFromIfMatch } from './etag.js';
import { errorResponse, json, respond, type HttpResponse } from './response.js';
import { isMember, noHousehold } from './member.js';
import { parseInput } from './validation.js';

export interface CareTasksHttp {
	list(viewer: Viewer): Promise<HttpResponse>;
	get(viewer: Viewer, input: { id: string }): Promise<HttpResponse>;
	create(viewer: Viewer, input: { body: unknown }): Promise<HttpResponse>;
	update(
		viewer: Viewer,
		input: { id: string; ifMatch: string | null; body: unknown }
	): Promise<HttpResponse>;
	complete(
		viewer: Viewer,
		input: { id: string; ifMatch: string | null; body: unknown }
	): Promise<HttpResponse>;
}

const historyDto = (h: CareHistoryEntry, names: Record<string, string>): HistoryDto => {
	const common = { at: h.at.toISOString(), by: names[h.by] ?? h.by };
	switch (h.kind) {
		case 'created':
			return { kind: h.kind, due: h.due, ...common };
		case 'rescheduled':
			return { kind: h.kind, from: h.from, due: h.due, ...common };
		case 'completed':
			return { kind: h.kind, on: h.on, ...common };
		default:
			return { kind: h.kind, ...common };
	}
};

/** Who marked a completed task done: the latest *done* in its history. */
function completedBy({ status, history }: CareView['task'], names: Record<string, string>) {
	if (status !== 'completed') return undefined;
	const done = history.findLast((h) => h.kind === 'completed');
	return done && (names[done.by] ?? done.by);
}

/** A task as the browser sees it; `withHistory` on its own page. */
export const careTaskDto = (
	{ task, names }: CareView,
	today: PlainDate,
	{ withHistory = false } = {}
): CareTaskDto => ({
	id: task.id,
	dogId: task.dogId,
	category: task.category,
	title: task.title,
	dueDate: task.dueDate,
	...(task.dueTime && { dueTime: task.dueTime }),
	status: task.status,
	overdue: isOverdue(task, today),
	...(task.completedOn && { completedOn: task.completedOn }),
	...(completedBy(task, names) !== undefined && { completedBy: completedBy(task, names) }),
	...(task.nextId && { nextId: task.nextId }),
	...(task.notes && { notes: task.notes }),
	...(withHistory && { history: task.history.map((h) => historyDto(h, names)) }),
	createdBy: names[task.createdBy] ?? task.createdBy,
	updatedAt: task.updatedAt.toISOString(),
	updatedBy: names[task.updatedBy] ?? task.updatedBy,
	etag: etag(task.version)
});

export function createCareTasksHttp(care: CareTasks, clock: Clock): CareTasksHttp {
	// Whether a task is overdue is worked out per response, on the household's clocks.
	const today = (ctx: PlannerContext) => todayIn(clock.now(), ctx.timeZone);
	const taskResponse = (ctx: PlannerContext, status: number) => (view: CareView) =>
		json(careTaskDto(view, today(ctx), { withHistory: true }), status, {
			etag: etag(view.task.version)
		});

	return {
		async list(viewer) {
			if (!isMember(viewer)) return noHousehold();
			const { upcoming, closed } = await care.list(viewer.member);
			const day = today(viewer.member);
			return json({
				upcoming: upcoming.map((v) => careTaskDto(v, day)),
				closed: closed.map((v) => careTaskDto(v, day))
			} satisfies CareTasksDto);
		},

		async get(viewer, { id }) {
			if (!isMember(viewer)) return noHousehold();
			return respond(await care.get(viewer.member, id), taskResponse(viewer.member, 200));
		},

		async create(viewer, { body }) {
			if (!isMember(viewer)) return noHousehold();
			const input = parseInput(CreateCareTask, body);
			if (!input.ok) return errorResponse(input.error);
			return respond(
				await care.create(viewer.member, input.value),
				taskResponse(viewer.member, 201)
			);
		},

		async update(viewer, { id, ifMatch, body }) {
			if (!isMember(viewer)) return noHousehold();
			const input = parseInput(UpdateCareTask, body);
			if (!input.ok) return errorResponse(input.error);
			const version = versionFromIfMatch(ifMatch);
			if (!version.ok) return errorResponse(version.error);
			const updated = await care.update(viewer.member, {
				id,
				expectedVersion: version.value,
				changes: input.value
			});
			return respond(updated, taskResponse(viewer.member, 200));
		},

		async complete(viewer, { id, ifMatch, body }) {
			if (!isMember(viewer)) return noHousehold();
			const input = parseInput(CompleteCareTask, body ?? {});
			if (!input.ok) return errorResponse(input.error);
			const version = versionFromIfMatch(ifMatch);
			if (!version.ok) return errorResponse(version.error);
			const done = await care.complete(viewer.member, {
				id,
				expectedVersion: version.value,
				...input.value
			});
			return respond(done, taskResponse(viewer.member, 200));
		}
	};
}
