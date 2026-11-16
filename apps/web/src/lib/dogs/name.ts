// What a record calls its dog. A record can name a dog the page's list no longer has, so there's
// one wording for that, as the backend has one for a former member.
import type { Dog } from '@toe-beans/contracts';

export const dogNameOf = (dog: Pick<Dog, 'name'> | undefined): string =>
	dog?.name ?? 'A dog no longer here';
