// The icons the app uses, by meaning (ui.md §6.4). Everything goes through <Icon name="…">, so
// the library stays swappable. Hugeicons free (Stroke Rounded, MIT) only: never
// `@hugeicons-pro/*`. Gaps get a custom icon on the same 24 px grid with a 1.5 px rounded
// stroke, never another library. Import icons one by one so the bundle only carries these.
/** Hugeicons' data shape: SVG child elements with camelCase attributes. */
export type IconSvgElement = readonly (readonly [
	string,
	Readonly<Record<string, string | number>>
])[];

import {
	Add01Icon,
	Alert02Icon,
	ArrowLeft01Icon,
	ArrowRight01Icon,
	BoneIcon,
	BookOpen01Icon,
	BubbleChatIcon,
	Calendar03Icon,
	Cancel01Icon,
	CookieIcon,
	DashboardSquare01Icon,
	HealthIcon,
	HistoryIcon,
	Loading03Icon,
	Medicine02Icon,
	Moon02Icon,
	MoreVerticalIcon,
	Notification01Icon,
	PawPrintIcon,
	SmartPhone01Icon,
	StethoscopeIcon,
	Sun03Icon,
	SyringeIcon,
	Tick02Icon,
	UserCircleIcon,
	UserGroupIcon,
	WalkingIcon,
	WifiDisconnected01Icon
} from '@hugeicons/core-free-icons';

const stroke = { stroke: 'currentColor', strokeWidth: '1.5' } as const;
const round = { strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

/** Custom: the free set has no dog. A floppy-eared head, drawn to the Hugeicons grid. */
const DogIcon: IconSvgElement = [
	[
		'path',
		{
			d: 'M7 9.5C7 6.7 9.2 4.5 12 4.5S17 6.7 17 9.5V14A5 5 0 0 1 7 14Z',
			...stroke,
			...round,
			key: '0'
		}
	],
	[
		'path',
		{
			d: 'M7.2 7.4C5.6 6.4 3.5 7.3 3.5 10C3.5 12.4 4.4 14 5.6 14.4C6.4 14.6 7 14 7 13.2',
			...stroke,
			...round,
			key: '1'
		}
	],
	[
		'path',
		{
			d: 'M16.8 7.4C18.4 6.4 20.5 7.3 20.5 10C20.5 12.4 19.6 14 18.4 14.4C17.6 14.6 17 14 17 13.2',
			...stroke,
			...round,
			key: '2'
		}
	],
	['path', { d: 'M10 10.5V11M14 10.5V11', ...stroke, ...round, key: '3' }],
	[
		'path',
		{
			d: 'M11 14C11 13.6 11.4 13.3 12 13.3S13 13.6 13 14S12.6 14.8 12 14.8S11 14.4 11 14Z',
			...stroke,
			...round,
			key: '4'
		}
	],
	['path', { d: 'M12 14.8V16', ...stroke, ...round, key: '5' }]
];

export const icons = {
	// Bottom navigation (ui.md §2.1)
	today: Sun03Icon,
	plan: Calendar03Icon,
	history: HistoryIcon,
	care: HealthIcon,
	more: DashboardSquare01Icon,
	// Actions and status
	add: Add01Icon,
	back: ArrowLeft01Icon,
	forward: ArrowRight01Icon,
	close: Cancel01Icon,
	done: Tick02Icon,
	overflow: MoreVerticalIcon,
	alert: Alert02Icon,
	offline: WifiDisconnected01Icon,
	saving: Loading03Icon,
	// More menu
	dogs: DogIcon,
	library: BookOpen01Icon,
	cues: BubbleChatIcon,
	household: UserGroupIcon,
	notifications: Notification01Icon,
	account: UserCircleIcon,
	// Theme choice
	'theme-system': SmartPhone01Icon,
	'theme-light': Sun03Icon,
	'theme-dark': Moon02Icon,
	// Pets and care
	dog: DogIcon,
	paw: PawPrintIcon,
	bone: BoneIcon,
	treat: CookieIcon,
	walk: WalkingIcon,
	vaccination: SyringeIcon,
	medication: Medicine02Icon,
	vet: StethoscopeIcon
} satisfies Record<string, IconSvgElement>;

export type IconName = keyof typeof icons;
