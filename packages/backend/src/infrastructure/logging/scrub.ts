// Error messages can carry data the code never chose to log. MongoDB's duplicate-key error quotes
// the clashing value ("dup key: { email: \"…\" }"), for example. These patterns are masked
// wherever error text leaves the process: logs and error tracking (NFR-12).
const patterns: [RegExp, string][] = [
	[/dup key: \{.*?\}/g, 'dup key: [redacted]'],
	[/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]'],
	[/mongodb(\+srv)?:\/\/[^\s"']+/g, 'mongodb://[redacted]'],
	[/\bBearer\s+[\w.~+/-]+=*/gi, 'Bearer [redacted]']
];

export function scrubText(text: string): string {
	return patterns.reduce((t, [pattern, replacement]) => t.replace(pattern, replacement), text);
}
