// Versioning and releases (architecture D40; docs/runbooks/releasing.md). One SemVer for the whole
// repo, the same in every package.json, with notes in CHANGELOG.md. Run by Node directly (type
// stripping), with no dependencies, so CI and the deploy can run it without `pnpm install`:
//
//   pnpm release major|minor|patch [--rc]   bump from a final version (--rc: X.Y.Z-rc.1)
//   pnpm release rc                         the next release candidate (rc.N → rc.N+1)
//   pnpm release final                      X.Y.Z-rc.N → X.Y.Z, with every rc's notes
//   pnpm release <X.Y.Z[-rc.N]>             any later version
//   pnpm release check [--new]              versions agree and have notes; --new: above every tag
//   pnpm release notes [version]            print a version's notes (the GitHub Release body)
//   pnpm release current                    print the version
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface Version {
	major: number;
	minor: number;
	patch: number;
	/** The release candidate number, absent for a final release. */
	rc?: number;
}

// Only release candidates as pre-releases: one kind keeps ordering and the bump rules simple.
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-rc\.([1-9]\d*))?$/;

export function parseVersion(text: string): Version | undefined {
	const m = versionPattern.exec(text.trim());
	if (!m) return undefined;
	const version: Version = { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
	if (m[4]) version.rc = Number(m[4]);
	return version;
}

export function formatVersion(v: Version): string {
	return `${v.major}.${v.minor}.${v.patch}${v.rc === undefined ? '' : `-rc.${v.rc}`}`;
}

/** Negative when a comes first, as SemVer orders them: 1.0.0-rc.2 < 1.0.0 < 1.0.1. */
export function compareVersions(a: Version, b: Version): number {
	return (
		a.major - b.major ||
		a.minor - b.minor ||
		a.patch - b.patch ||
		(a.rc ?? Infinity) - (b.rc ?? Infinity) ||
		0
	);
}

export type Bump = 'major' | 'minor' | 'patch' | 'rc' | 'final';

export function nextVersion(current: Version, bump: Bump, candidate = false): Version {
	const { major, minor, patch, rc } = current;
	switch (bump) {
		case 'rc':
			if (rc === undefined) {
				throw new Error(
					`${formatVersion(current)} isn't a release candidate: use major, minor or patch with --rc`
				);
			}
			return { major, minor, patch, rc: rc + 1 };
		case 'final':
			if (rc === undefined) throw new Error(`${formatVersion(current)} is already final`);
			return { major, minor, patch };
		default: {
			if (rc !== undefined) {
				throw new Error(
					`${formatVersion(current)} is a release candidate: use rc for the next one, final to release it, or name a version`
				);
			}
			const next =
				bump === 'major'
					? { major: major + 1, minor: 0, patch: 0 }
					: bump === 'minor'
						? { major, minor: minor + 1, patch: 0 }
						: { major, minor, patch: patch + 1 };
			return candidate ? { ...next, rc: 1 } : next;
		}
	}
}

// ---- CHANGELOG.md ----------------------------------------------------------------------------
// `## Unreleased` collects notes as work lands; a release renames it `## X.Y.Z - YYYY-MM-DD`.
// Notes are bullets under `### Added`, `### Changed`, `### Fixed`, `### Removed` or `### Security`.

interface Section {
	/** `Unreleased` or a version. */
	name: string;
	/** The heading line as written. */
	heading: string;
	/** The lines after the heading, up to the next `## `. */
	body: string[];
}

interface Changelog {
	head: string[];
	sections: Section[];
}

const sectionHeading = /^## (Unreleased|\S+)(?: - \d{4}-\d{2}-\d{2})?\s*$/;

function parseChangelog(text: string): Changelog {
	const head: string[] = [];
	const sections: Section[] = [];
	for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
		const m = sectionHeading.exec(line);
		if (m) sections.push({ name: m[1]!, heading: line.trimEnd(), body: [] });
		else if (sections.length) sections.at(-1)!.body.push(line);
		else head.push(line);
	}
	return { head, sections };
}

function trimBlank(lines: string[]): string[] {
	let start = 0;
	let end = lines.length;
	while (start < end && !lines[start]!.trim()) start++;
	while (end > start && !lines[end - 1]!.trim()) end--;
	return lines.slice(start, end);
}

const hasNotes = (body: string[]) => body.some((line) => /^\s*[-*] \S/.test(line));

/** Notes under each `###` heading from several sections, oldest first, headings in first-seen order. */
function mergeNotes(bodies: string[][]): string[] {
	const groups = new Map<string, string[]>();
	for (const body of bodies) {
		let heading = '';
		for (const line of body) {
			if (line.startsWith('### ')) heading = line.trim();
			else if (line.trim()) {
				if (!groups.has(heading)) groups.set(heading, []);
				groups.get(heading)!.push(line);
			}
		}
	}
	const out: string[] = [];
	for (const [heading, lines] of groups) {
		if (out.length) out.push('');
		if (heading) out.push(heading, '');
		out.push(...lines);
	}
	return out;
}

/** The changelog with Unreleased released as `to`. A final release after candidates gathers their notes. */
export function releaseChangelog(text: string, from: Version, to: Version, date: string): string {
	const log = parseChangelog(text);
	const unreleased = log.sections.find((s) => s.name === 'Unreleased');
	if (!unreleased) throw new Error('CHANGELOG.md has no "## Unreleased" section');
	const name = formatVersion(to);
	if (log.sections.some((s) => s.name === name))
		throw new Error(`CHANGELOG.md already has ${name}`);

	const candidates =
		to.rc === undefined && from.rc !== undefined
			? log.sections
					.filter((s) => {
						const v = parseVersion(s.name);
						return v?.rc !== undefined && formatVersion({ ...v, rc: undefined }) === name;
					})
					.reverse()
			: [];
	const body = candidates.length
		? mergeNotes([...candidates.map((s) => s.body), unreleased.body])
		: trimBlank(unreleased.body);
	if (!hasNotes(body))
		throw new Error(`Nothing under "## Unreleased" in CHANGELOG.md to release as ${name}`);

	const out = [...trimBlank(log.head), ''];
	for (const s of log.sections) {
		if (s === unreleased) {
			out.push('## Unreleased', '', `## ${name} - ${date}`, '', ...body, '');
		} else {
			out.push(s.heading, '', ...trimBlank(s.body), '');
		}
	}
	return out.join('\n');
}

export function notesFor(text: string, version: string): string | undefined {
	const section = parseChangelog(text).sections.find((s) => s.name === version);
	return section && hasNotes(section.body) ? trimBlank(section.body).join('\n') + '\n' : undefined;
}

// ---- Checks --------------------------------------------------------------------------------

export interface CheckInput {
	/** package.json path → its version. */
	versions: Record<string, string | undefined>;
	changelog: string;
	/** Existing release tags, such as `v1.0.0`. */
	tags: string[];
	/** For a pull request into main: the version must be above every tag. */
	isNew: boolean;
}

export function check({ versions, changelog, tags, isNew }: CheckInput): string[] {
	const errors: string[] = [];
	const distinct = new Set(Object.values(versions));
	if (distinct.size !== 1) {
		const list = Object.entries(versions).map(([path, v]) => `${path}: ${v ?? '(none)'}`);
		return [
			`Every package.json must have the same version (pnpm release sets them all):\n  ${list.join('\n  ')}`
		];
	}
	const text = [...distinct][0] ?? '';
	const version = parseVersion(text);
	if (!version) return [`"${text}" isn't a version this repo uses (X.Y.Z or X.Y.Z-rc.N)`];
	if (!notesFor(changelog, text))
		errors.push(`CHANGELOG.md has no notes for ${text} (pnpm release writes them)`);
	if (isNew) {
		const released = tags
			.map((t) => parseVersion(t.replace(/^v/, '')))
			.filter((v) => v !== undefined);
		const latest = released.sort(compareVersions).at(-1);
		if (latest && compareVersions(version, latest) <= 0) {
			errors.push(
				`${text} isn't above the last release, v${formatVersion(latest)}: run pnpm release before merging to main`
			);
		}
	}
	return errors;
}

// ---- The repo ------------------------------------------------------------------------------

function packageFiles(root: string): string[] {
	const workspace = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8');
	const globs = [...workspace.matchAll(/^\s*-\s*['"]?([\w-]+)\/\*['"]?\s*$/gm)].map((m) => m[1]!);
	const files = ['package.json'];
	for (const dir of globs) {
		if (!existsSync(join(root, dir))) continue;
		for (const name of readdirSync(join(root, dir)).sort()) {
			const file = join(dir, name, 'package.json');
			if (existsSync(join(root, file))) files.push(file);
		}
	}
	return files;
}

const versionField = /^(\s*"version":\s*")([^"]*)(")/m;

function readVersions(root: string): Record<string, string | undefined> {
	return Object.fromEntries(
		packageFiles(root).map((f) => [f, versionField.exec(readFileSync(join(root, f), 'utf8'))?.[2]])
	);
}

function gitTags(root: string): string[] {
	return execFileSync('git', ['tag', '--list', 'v*'], { cwd: root, encoding: 'utf8' })
		.split('\n')
		.filter(Boolean);
}

/** Today in South Africa, as YYYY-MM-DD. */
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Johannesburg' });

function main(args: string[]): number {
	const root = resolve(import.meta.dirname, '../../..');
	const changelogPath = join(root, 'CHANGELOG.md');
	const changelog = () => readFileSync(changelogPath, 'utf8');
	const [command = '', ...rest] = args;
	const versions = readVersions(root);
	const current = versions['package.json'] ?? '';

	if (command === 'current') {
		console.log(current);
		return 0;
	}
	if (command === 'check') {
		const errors = check({
			versions,
			changelog: changelog(),
			tags: gitTags(root),
			isNew: rest.includes('--new')
		});
		for (const e of errors) console.error(e);
		if (!errors.length) console.log(`${current}: versions agree and have notes`);
		return errors.length ? 1 : 0;
	}
	if (command === 'notes') {
		const notes = notesFor(changelog(), rest[0] ?? current);
		if (!notes) {
			console.error(`CHANGELOG.md has no notes for ${rest[0] ?? current}`);
			return 1;
		}
		process.stdout.write(notes);
		return 0;
	}

	const from = parseVersion(current);
	if (!from) {
		console.error(`package.json's version "${current}" isn't one this repo uses`);
		return 1;
	}
	let to: Version | undefined;
	try {
		if (['major', 'minor', 'patch', 'rc', 'final'].includes(command)) {
			to = nextVersion(from, command as Bump, rest.includes('--rc'));
		} else {
			to = parseVersion(command);
			if (!to) {
				console.error(
					'Usage: pnpm release major|minor|patch [--rc] | rc | final | <X.Y.Z[-rc.N]> | check [--new] | notes [version] | current'
				);
				return 1;
			}
			if (compareVersions(to, from) <= 0) throw new Error(`${command} isn't above ${current}`);
		}
		const next = formatVersion(to);
		// Everything is worked out before anything is written, so a refusal changes nothing.
		const missing = Object.keys(versions).filter((file) => versions[file] === undefined);
		if (missing.length) throw new Error(`No "version" field in ${missing.join(', ')}`);
		const writes: [string, string][] = [
			[changelogPath, releaseChangelog(changelog(), from, to, today())]
		];
		for (const file of Object.keys(versions)) {
			const path = join(root, file);
			writes.push([path, readFileSync(path, 'utf8').replace(versionField, `$1${next}$3`)]);
		}
		for (const [path, text] of writes) writeFileSync(path, text);
		console.log(
			`${current} → ${next}: package.json files and CHANGELOG.md updated. Review, commit, then open the PR to main.`
		);
		return 0;
	} catch (e) {
		console.error((e as Error).message);
		return 1;
	}
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2));
