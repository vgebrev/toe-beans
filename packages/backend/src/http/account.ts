// GET and PATCH /api/v1/me: the signed-in person's own account (architecture §3.3).
import { UpdateProfile, type Profile as ProfileDto } from '@toe-beans/contracts';
import type { Account, Profile } from '../application/account/account.js';
import type { AuthContext } from '../application/auth/auth.js';
import { etag, versionFromIfMatch } from './etag.js';
import { errorResponse, json, respond, type HttpResponse } from './response.js';
import { parseInput } from './validation.js';

export interface AccountHttp {
	get(ctx: AuthContext): Promise<HttpResponse>;
	/** `ifMatch` is the If-Match header; `body` the parsed JSON body, if any. */
	update(ctx: AuthContext, input: { ifMatch: string | null; body: unknown }): Promise<HttpResponse>;
}

const withEtag = ({ version, ...profile }: Profile): HttpResponse =>
	json(profile satisfies ProfileDto, 200, { etag: etag(version) });

export function createAccountHttp(account: Account): AccountHttp {
	return {
		async get(ctx) {
			return respond(await account.profile(ctx), withEtag);
		},

		async update(ctx, { ifMatch, body }) {
			const version = versionFromIfMatch(ifMatch);
			if (!version.ok) return errorResponse(version.error);
			const input = parseInput(UpdateProfile, body);
			if (!input.ok) return errorResponse(input.error);
			const renamed = await account.rename(ctx, {
				displayName: input.value.displayName,
				expectedVersion: version.value
			});
			return respond(renamed, withEtag);
		}
	};
}
