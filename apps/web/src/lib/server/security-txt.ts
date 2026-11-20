// /.well-known/security.txt (RFC 9116; backlog S17.3): where to report a security problem. It
// expires a year after the build, so a deploy renews it, and an app nobody has deployed for a
// year stops claiming someone's listening.

export const SECURITY_CONTACT = 'mailto:support@toebeans.co.za';
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export function securityTxt({ origin, builtAt }: { origin: string; builtAt: Date }): string {
	const expires = new Date(builtAt.getTime() + YEAR_MS);
	return [
		`Contact: ${SECURITY_CONTACT}`,
		`Expires: ${expires.toISOString()}`,
		'Preferred-Languages: en',
		`Canonical: ${new URL('/.well-known/security.txt', origin).href}`,
		''
	].join('\n');
}
