// The signed-in person's own account: GET and PATCH /api/v1/me (architecture §3.3).
import { z } from 'zod';

/** As the household sees them. The ETag carries the version for If-Match. */
export const Profile = z.object({
	displayName: z.string(),
	email: z.string()
});
export type Profile = z.infer<typeof Profile>;

/** Shape only; the backend trims the name and checks its length and characters. */
export const UpdateProfile = z.strictObject({
	displayName: z.string().max(500)
});
export type UpdateProfile = z.infer<typeof UpdateProfile>;
