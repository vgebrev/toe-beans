// The icons the app uses, by meaning (ui.md §6.4). Everything goes through <Icon name="…">, so
// the library stays swappable. Hugeicons free (Stroke Rounded, MIT) only: never
// `@hugeicons-pro/*`. A gap gets an icon on the same 24 px grid with a 1.5 px rounded line:
// drawn here, or from Phosphor (MIT), the one fallback (the dog). Import icons one by one so the bundle only carries these.
/** Hugeicons' data shape: SVG child elements with camelCase attributes. */
export type IconSvgElement = readonly (readonly [
	string,
	Readonly<Record<string, string | number>>
])[];

import {
	Add01Icon,
	ArrowTurnBackwardIcon,
	CalendarAdd01Icon,
	NextIcon,
	RepeatIcon,
	Search01Icon,
	Alert02Icon,
	Archive02Icon,
	ArrowLeft01Icon,
	ArrowRight01Icon,
	BoneIcon,
	BookOpen01Icon,
	BubbleChatIcon,
	Calendar03Icon,
	Camera01Icon,
	Cancel01Icon,
	Clock01Icon,
	CookieIcon,
	DashboardSquare01Icon,
	Delete02Icon,
	FavouriteIcon,
	HealthIcon,
	HistoryIcon,
	Image02Icon,
	LinkSquare02Icon,
	Loading03Icon,
	Medicine02Icon,
	Moon02Icon,
	MoreVerticalIcon,
	News01Icon,
	Notification01Icon,
	PawPrintIcon,
	PencilEdit02Icon,
	SmartPhone01Icon,
	StethoscopeIcon,
	Sun03Icon,
	SyringeIcon,
	Tick02Icon,
	Unarchive03Icon,
	UserCircleIcon,
	UserGroupIcon,
	Video01Icon,
	WalkingIcon,
	WifiDisconnected01Icon
} from '@hugeicons/core-free-icons';

/**
 * The free set has no dog, so this one is Phosphor's Dog (regular weight), the documented fallback
 * (ui.md §6.4), rescaled from its 256 grid to 24. Its outline is a filled shape whose line is the
 * same 1.5 px, so it sits with the strokes, though `strokeWidth` doesn't thicken it.
 * Phosphor Icons, MIT licence, copyright (c) 2020 Phosphor Icons: https://phosphoricons.com
 */
const DogIcon: IconSvgElement = [
	[
		'path',
		{
			d: 'M9.75 13.125a1.125 1.125 0 1 1 -1.125 -1.125A1.125 1.125 0 0 1 9.75 13.125Zm5.625 1.125a1.125 1.125 0 1 0 -1.125 -1.125A1.125 1.125 0 0 0 15.375 14.25Zm6.443 -0.754a1.525 1.525 0 0 1 -0.63 0.138A1.463 1.463 0 0 1 20.25 13.293V17.25a3.754 3.754 0 0 1 -3.75 3.75H7.5a3.754 3.754 0 0 1 -3.75 -3.75V13.293a1.463 1.463 0 0 1 -0.938 0.342 1.524 1.524 0 0 1 -0.63 -0.138 1.478 1.478 0 0 1 -0.855 -1.643l1.539 -8.209A1.5 1.5 0 0 1 4.704 2.465L9.842 3.75h4.315l5.138 -1.285a1.5 1.5 0 0 1 1.838 1.179L22.673 11.854A1.478 1.478 0 0 1 21.818 13.496ZM18.75 11.441 13.885 5.25H10.115L5.25 11.441V17.25a2.253 2.253 0 0 0 2.25 2.25h3.75V18.311l-1.28 -1.28a0.75 0.75 0 0 1 1.061 -1.061L12 16.939l0.97 -0.97a0.75 0.75 0 0 1 1.061 1.061L12.75 18.311V19.5h3.75a2.253 2.253 0 0 0 2.25 -2.25Z',
			fill: 'currentColor',
			key: '0'
		}
	]
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
	edit: PencilEdit02Icon,
	archive: Archive02Icon,
	unarchive: Unarchive03Icon,
	delete: Delete02Icon,
	camera: Camera01Icon,
	gallery: Image02Icon,
	alert: Alert02Icon,
	offline: WifiDisconnected01Icon,
	saving: Loading03Icon,
	// Exercises (ui.md §4.6)
	duration: Clock01Icon,
	struggling: FavouriteIcon,
	external: LinkSquare02Icon,
	article: News01Icon,
	video: Video01Icon,
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
	vet: StethoscopeIcon,
	repeat: RepeatIcon,
	schedule: CalendarAdd01Icon,
	skip: NextIcon,
	restore: ArrowTurnBackwardIcon,
	search: Search01Icon
} satisfies Record<string, IconSvgElement>;

export type IconName = keyof typeof icons;
