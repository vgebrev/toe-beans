// The web app manifest (ui.md §6.3), served from a route so it can say which environment it is
// (S17.6): off prod the app installs as *Toe Beans (Test)* with a TEST band on its icon, so a
// phone with both installed can tell them apart. Prod's is unchanged.

type AppEnv = 'local' | 'prod';

const icons = (prefix: string) =>
	(['any', 'maskable'] as const).flatMap((purpose) =>
		[192, 512].map((size) => ({
			src: `/icons/${prefix}${purpose === 'any' ? 'icon' : 'maskable'}-${size}.png`,
			sizes: `${size}x${size}`,
			type: 'image/png',
			purpose
		}))
	);

export function webManifest(appEnv: AppEnv) {
	const prod = appEnv === 'prod';
	const name = prod ? 'Toe Beans' : 'Toe Beans (Test)';
	return {
		id: '/',
		name,
		short_name: name,
		description: 'Puppy training and care for the whole household.',
		start_url: '/',
		scope: '/',
		display: 'standalone',
		launch_handler: { client_mode: ['navigate-existing', 'auto'] },
		orientation: 'portrait',
		background_color: '#FFFBF5',
		theme_color: '#FFFBF5',
		icons: icons(prod ? '' : 'test-'),
		shortcuts: [
			{
				name: 'Log training',
				short_name: 'Log training',
				description: 'Log a practice, planned or not',
				url: '/?add=log',
				icons: [{ src: '/icons/shortcut-log-96.png', sizes: '96x96', type: 'image/png' }]
			},
			{
				name: 'Record event',
				short_name: 'Record event',
				description: 'Barking, a visitor, an accident…',
				url: '/?add=event',
				icons: [{ src: '/icons/shortcut-event-96.png', sizes: '96x96', type: 'image/png' }]
			}
		]
	};
}
