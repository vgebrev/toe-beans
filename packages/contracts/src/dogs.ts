// A household's dogs: /api/v1/dogs (architecture §3.6, §5.2, FR-02).
import { z } from 'zod';

/** `day` is a known date; `month` and `year` are estimates, worded "about …" (ui.md §5.4). */
export const DatePrecision = z.enum(['day', 'month', 'year']);
export type DatePrecision = z.infer<typeof DatePrecision>;

export const BirthDate = z.object({ date: z.iso.date(), precision: DatePrecision });
export type BirthDate = z.infer<typeof BirthDate>;

export const Dog = z.object({
	id: z.string(),
	name: z.string(),
	birth: BirthDate.optional(),
	adoptionDate: z.iso.date().optional(),
	notes: z.string().optional(),
	/** An index into the accent palette (ui.md §5.5). */
	accent: z.number().int().min(0),
	archived: z.boolean(),
	/** Same-origin URLs, which change when the photo does, so a cached one is never stale. */
	photo: z.object({ thumb: z.string(), large: z.string() }),
	/** For If-Match. */
	etag: z.string()
});
export type Dog = z.infer<typeof Dog>;

/** Archived ones too, in the order they were added. */
export const Dogs = z.object({ dogs: z.array(Dog) });
export type Dogs = z.infer<typeof Dogs>;

/**
 * Shape only; the backend tidies and checks the meaning. Adding a dog sends this as JSON in the
 * `dog` part of a multipart form, with the photo in the `photo` part: a dog needs both.
 */
export const CreateDog = z.strictObject({
	name: z.string().max(500),
	birth: z.strictObject({ date: z.string().max(20), precision: DatePrecision }).nullish(),
	adoptionDate: z.string().max(20).nullish(),
	notes: z.string().max(10_000).nullish()
});
export type CreateDog = z.infer<typeof CreateDog>;

/** A field left out stays as it was; null clears it. `archived` archives or brings back. */
export const UpdateDog = CreateDog.partial().extend({ archived: z.boolean().optional() });
export type UpdateDog = z.infer<typeof UpdateDog>;
