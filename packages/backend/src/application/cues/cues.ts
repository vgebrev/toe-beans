// The household's shared cue dictionary (architecture §5.2, FR-04). Any member can add, change or
// delete a cue; every write carries the version it was based on, so a change made elsewhere is
// never silently overwritten (NFR-13). Each cue says who saved it last (ui.md §4.6).
import {
	CUES_MAX,
	cleanCueDetails,
	duplicateLabel,
	type Cue,
	type CueDetailsInput
} from '../../domain/cue.js';
import { validationError } from '../../domain/errors.js';
import { isId } from '../../domain/id.js';
import { err, ok, type Result } from '../../domain/result.js';
import type { MemberContext } from '../auth/auth.js';
import {
	notFound,
	type NotFoundError,
	type StaleVersionError,
	type ValidationError
} from '../errors.js';
import type { Ports } from '../ports/index.js';

/** What a person sends. In an update, a missing field stays as it was and null clears it. */
export interface CueInput {
	label?: string | undefined;
	meaning?: string | undefined;
	handSignal?: string | null | undefined;
	rewardConvention?: string | null | undefined;
	notes?: string | null | undefined;
}

/** A cue with the name of whoever saved it last. */
export interface CueView {
	cue: Cue;
	updatedByName: string;
}

/** Shown for someone who has since left the household, or whose account is gone. */
export const FORMER_MEMBER = 'A former member';

export type Cues = ReturnType<typeof createCues>;

const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

export function createCues({
	cues,
	users,
	ids,
	logger
}: Pick<Ports, 'cues' | 'users' | 'ids' | 'logger'>) {
	const log = logger.child({ component: 'cues' });

	/** A malformed ID can't be anyone's cue, so it's not found without asking the database. */
	const find = async (ctx: MemberContext, id: string) =>
		isId(id) ? cues.findById(ctx.householdId, id) : null;

	async function views(list: Cue[]): Promise<CueView[]> {
		const people = await users.findByIds([...new Set(list.map((c) => c.updatedBy))]);
		const names = new Map(people.map((u) => [u.id, u.displayName]));
		return list.map((cue) => ({ cue, updatedByName: names.get(cue.updatedBy) ?? FORMER_MEMBER }));
	}
	const view = async (cue: Cue): Promise<CueView> => (await views([cue]))[0]!;

	const invalid = (fields: Record<string, string[]>) =>
		err(validationError('The cue is not valid.', fields));

	return {
		/** Every cue, in alphabetical order of the cue word. */
		async list(ctx: MemberContext): Promise<CueView[]> {
			const all = await cues.list(ctx.householdId);
			return views(all.sort((a, b) => collator.compare(a.label, b.label)));
		},

		async get(ctx: MemberContext, id: string): Promise<Result<CueView, NotFoundError>> {
			const cue = await find(ctx, id);
			return cue ? ok(await view(cue)) : err(notFound('cue'));
		},

		async create(ctx: MemberContext, input: CueInput): Promise<Result<CueView, ValidationError>> {
			const details = cleanCueDetails({
				label: input.label ?? '',
				meaning: input.meaning ?? '',
				handSignal: input.handSignal ?? undefined,
				rewardConvention: input.rewardConvention ?? undefined,
				notes: input.notes ?? undefined
			});
			if (!details.ok) return details;
			const others = await cues.list(ctx.householdId);
			const clash = duplicateLabel(details.value.label, others);
			if (clash) return invalid(clash);
			if (others.length >= CUES_MAX) {
				return err(
					validationError(`A household can keep up to ${CUES_MAX} cues. Delete one to add another.`)
				);
			}
			const cue = await cues.insert({
				id: ids.next(),
				householdId: ctx.householdId,
				updatedBy: ctx.userId,
				...details.value
			});
			log.info('cue added', { householdId: ctx.householdId, cueId: cue.id });
			return ok(await view(cue));
		},

		async update(
			ctx: MemberContext,
			input: { id: string; expectedVersion: number; details: CueInput }
		): Promise<Result<CueView, ValidationError | NotFoundError | StaleVersionError>> {
			const cue = await find(ctx, input.id);
			if (!cue) return err(notFound('cue'));
			const pick = <K extends 'handSignal' | 'rewardConvention' | 'notes'>(key: K) => {
				const given = input.details[key];
				return given === undefined ? cue[key] : (given ?? undefined);
			};
			const merged: CueDetailsInput = {
				label: input.details.label ?? cue.label,
				meaning: input.details.meaning ?? cue.meaning,
				handSignal: pick('handSignal'),
				rewardConvention: pick('rewardConvention'),
				notes: pick('notes')
			};
			const details = cleanCueDetails(merged);
			if (!details.ok) return details;
			const clash = duplicateLabel(details.value.label, await cues.list(ctx.householdId), cue.id);
			if (clash) return invalid(clash);
			const { label, meaning, handSignal, rewardConvention, notes } = details.value;
			// Each key is set even when undefined, which is what removes a cleared field.
			const updated = await cues.update(ctx.householdId, cue.id, input.expectedVersion, {
				label,
				meaning,
				handSignal,
				rewardConvention,
				notes,
				updatedBy: ctx.userId
			});
			if (!updated.ok) return updated;
			log.info('cue changed', { householdId: ctx.householdId, cueId: cue.id });
			return ok(await view(updated.value));
		},

		async remove(
			ctx: MemberContext,
			input: { id: string; expectedVersion: number }
		): Promise<Result<void, NotFoundError | StaleVersionError>> {
			if (!isId(input.id)) return err(notFound('cue'));
			const removed = await cues.delete(ctx.householdId, input.id, input.expectedVersion);
			if (removed.ok) log.info('cue deleted', { householdId: ctx.householdId, cueId: input.id });
			return removed;
		}
	};
}
