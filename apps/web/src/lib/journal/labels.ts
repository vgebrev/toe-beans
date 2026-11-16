// How the UI names a behaviour event's category (ui.md J5, §6.4, FR-08): a label and an icon
// for each, in the order the record-event sheet offers them.
import type { EventCategory } from '@toe-beans/contracts';
import type { IconName } from '#lib/components/icon/icons.js';

export const categoryLabels: Record<EventCategory, { label: string; icon: IconName }> = {
	barking: { label: 'Barking', icon: 'event-barking' },
	cat_interaction: { label: 'Cat interaction', icon: 'event-cat-interaction' },
	fear: { label: 'Fear', icon: 'event-fear' },
	toileting_accident: { label: 'Toileting accident', icon: 'event-toileting-accident' },
	visitor: { label: 'Visitor', icon: 'event-visitor' },
	other: { label: 'Other', icon: 'event-other' }
};

/** In the order the labels list them, so a new category is offered as soon as it's named. */
export const CATEGORIES = Object.keys(categoryLabels) as EventCategory[];

/** "Ripley's barking", or "an event for Ripley" for *Other*, for notices like "Recorded …". */
export function eventPhrase(category: EventCategory, dogName: string | undefined): string {
	const dog = dogName ?? 'your dog';
	if (category === 'other') return `an event for ${dog}`;
	return `${dog}'s ${categoryLabels[category].label.toLowerCase()}`;
}
