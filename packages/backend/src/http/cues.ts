// /api/v1/cues (architecture §5.2, FR-04). Someone with no household gets a 404, as if they'd
// asked for another household's cue (§4.4).
import {
	CreateCue,
	UpdateCue,
	type Cue as CueDto,
	type Cues as CuesDto
} from '@toe-beans/contracts';
import type { MemberViewer, Viewer } from '../application/auth/auth.js';
import type { CueView, Cues } from '../application/cues/cues.js';
import { notFound } from '../application/errors.js';
import { etag, versionFromIfMatch } from './etag.js';
import { errorResponse, json, noContent, respond, type HttpResponse } from './response.js';
import { parseInput } from './validation.js';

export interface CuesHttp {
	list(viewer: Viewer): Promise<HttpResponse>;
	get(viewer: Viewer, input: { id: string }): Promise<HttpResponse>;
	create(viewer: Viewer, input: { body: unknown }): Promise<HttpResponse>;
	update(
		viewer: Viewer,
		input: { id: string; ifMatch: string | null; body: unknown }
	): Promise<HttpResponse>;
	remove(viewer: Viewer, input: { id: string; ifMatch: string | null }): Promise<HttpResponse>;
}

export const cueDto = ({ cue, updatedByName }: CueView): CueDto => ({
	id: cue.id,
	label: cue.label,
	meaning: cue.meaning,
	...(cue.handSignal && { handSignal: cue.handSignal }),
	...(cue.rewardConvention && { rewardConvention: cue.rewardConvention }),
	...(cue.notes && { notes: cue.notes }),
	updatedAt: cue.updatedAt.toISOString(),
	updatedBy: updatedByName,
	etag: etag(cue.version)
});

const cueResponse = (status: number) => (view: CueView) =>
	json(cueDto(view), status, { etag: etag(view.cue.version) });

const isMember = (viewer: Viewer): viewer is MemberViewer => viewer.member !== null;
const noHousehold = () => errorResponse(notFound('household'));

export function createCuesHttp(cues: Cues): CuesHttp {
	return {
		async list(viewer) {
			if (!isMember(viewer)) return noHousehold();
			const all = await cues.list(viewer.member);
			return json({ cues: all.map(cueDto) } satisfies CuesDto);
		},

		async get(viewer, { id }) {
			if (!isMember(viewer)) return noHousehold();
			return respond(await cues.get(viewer.member, id), cueResponse(200));
		},

		async create(viewer, { body }) {
			if (!isMember(viewer)) return noHousehold();
			const input = parseInput(CreateCue, body);
			if (!input.ok) return errorResponse(input.error);
			return respond(await cues.create(viewer.member, input.value), cueResponse(201));
		},

		async update(viewer, { id, ifMatch, body }) {
			if (!isMember(viewer)) return noHousehold();
			const input = parseInput(UpdateCue, body);
			if (!input.ok) return errorResponse(input.error);
			const version = versionFromIfMatch(ifMatch);
			if (!version.ok) return errorResponse(version.error);
			const updated = await cues.update(viewer.member, {
				id,
				expectedVersion: version.value,
				details: input.value
			});
			return respond(updated, cueResponse(200));
		},

		async remove(viewer, { id, ifMatch }) {
			if (!isMember(viewer)) return noHousehold();
			const version = versionFromIfMatch(ifMatch);
			if (!version.ok) return errorResponse(version.error);
			const removed = await cues.remove(viewer.member, { id, expectedVersion: version.value });
			return respond(removed, () => noContent());
		}
	};
}
