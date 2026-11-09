// The signed-in person's own account (architecture §5.2). The display name is the app's once the
// person sets it: sign-ins only fill in a missing real name (domain/user.ts, nameAfterSignIn).
import { validationError } from '../../domain/errors.js';
import { DISPLAY_NAME_MAX, cleanDisplayName, type User } from '../../domain/user.js';
import { err, ok, type Result } from '../../domain/result.js';
import type { AuthContext } from '../auth/auth.js';
import {
	notFound,
	type NotFoundError,
	type StaleVersionError,
	type ValidationError
} from '../errors.js';
import type { Ports } from '../ports/index.js';

export interface Profile {
	displayName: string;
	email: string;
	/** For the ETag (NFR-13). */
	version: number;
}

const profileOf = ({ displayName, email, version }: User): Profile => ({
	displayName,
	email,
	version
});

export type Account = ReturnType<typeof createAccount>;

export function createAccount({ users, clock, logger }: Pick<Ports, 'users' | 'clock' | 'logger'>) {
	const log = logger.child({ component: 'account' });
	return {
		async profile(ctx: AuthContext): Promise<Result<Profile, NotFoundError>> {
			const user = await users.findById(ctx.userId);
			if (!user || user.deletedAt) return err(notFound('account'));
			return ok(profileOf(user));
		},

		/** Sets the name the household sees, if `expectedVersion` is still current. */
		async rename(
			ctx: AuthContext,
			input: { displayName: string; expectedVersion: number }
		): Promise<Result<Profile, ValidationError | NotFoundError | StaleVersionError>> {
			const displayName = cleanDisplayName(input.displayName);
			if (!displayName) {
				return err(
					validationError('The name is not valid.', {
						displayName: [`Enter a name of up to ${DISPLAY_NAME_MAX} characters.`]
					})
				);
			}
			const renamed = await users.rename(
				ctx.userId,
				displayName,
				input.expectedVersion,
				clock.now()
			);
			if (!renamed.ok) {
				return err(renamed.error.kind === 'not-found' ? notFound('account') : renamed.error);
			}
			log.info('display name changed', { userId: ctx.userId });
			return ok(profileOf(renamed.value));
		}
	};
}
