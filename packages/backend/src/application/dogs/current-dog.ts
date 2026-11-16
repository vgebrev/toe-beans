// New entries are for a household's current dogs only: nothing is planned, logged or recorded
// against an archived one (D24, D30).
import type { Dog } from '../../domain/dog.js';
import { isId, type Id } from '../../domain/id.js';
import type { Ports } from '../ports/index.js';

/** The field error for a dog that isn't one of the household's current dogs. */
export const CHOOSE_DOG = 'Choose one of your dogs.';

/** The household's dog with this ID if it isn't archived, or null. */
export async function currentDog(
	dogs: Ports['dogs'],
	householdId: Id,
	dogId: string | undefined
): Promise<Dog | null> {
	if (dogId === undefined || !isId(dogId)) return null;
	const dog = await dogs.findById(householdId, dogId);
	return dog && !dog.archivedAt ? dog : null;
}
