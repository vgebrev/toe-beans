import { describe, expect, it } from 'vitest';
import {
	check,
	compareVersions,
	formatVersion,
	nextVersion,
	notesFor,
	parseVersion,
	releaseChangelog,
	type Version
} from './release.js';

const v = (text: string): Version => {
	const parsed = parseVersion(text);
	if (!parsed) throw new Error(`bad version ${text}`);
	return parsed;
};

describe('versions', () => {
	it('parses finals and release candidates only', () => {
		expect(v('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
		expect(v('1.0.0-rc.4')).toEqual({ major: 1, minor: 0, patch: 0, rc: 4 });
		for (const bad of ['1.2', '01.2.3', '1.0.0-beta.1', '1.0.0-rc.0', 'v1.0.0', '1.0.0+abc']) {
			expect(parseVersion(bad)).toBeUndefined();
		}
	});

	it('orders candidates before their release', () => {
		const sorted = ['1.0.1', '1.0.0', '0.9.9', '1.0.0-rc.10', '1.0.0-rc.2', '1.1.0-rc.1']
			.map(v)
			.sort(compareVersions);
		expect(sorted.map(formatVersion)).toEqual([
			'0.9.9',
			'1.0.0-rc.2',
			'1.0.0-rc.10',
			'1.0.0',
			'1.0.1',
			'1.1.0-rc.1'
		]);
	});

	it('bumps finals, with --rc starting a candidate', () => {
		expect(formatVersion(nextVersion(v('1.2.3'), 'patch'))).toBe('1.2.4');
		expect(formatVersion(nextVersion(v('1.2.3'), 'minor'))).toBe('1.3.0');
		expect(formatVersion(nextVersion(v('1.2.3'), 'major'))).toBe('2.0.0');
		expect(formatVersion(nextVersion(v('1.2.3'), 'minor', true))).toBe('1.3.0-rc.1');
	});

	it('moves candidates on with rc and final only', () => {
		expect(formatVersion(nextVersion(v('1.0.0-rc.1'), 'rc'))).toBe('1.0.0-rc.2');
		expect(formatVersion(nextVersion(v('1.0.0-rc.2'), 'final'))).toBe('1.0.0');
		expect(() => nextVersion(v('1.0.0-rc.2'), 'patch')).toThrow(/release candidate/);
		expect(() => nextVersion(v('1.0.0'), 'rc')).toThrow(/isn't a release candidate/);
		expect(() => nextVersion(v('1.0.0'), 'final')).toThrow(/already final/);
	});
});

const changelog = `# Changelog

Intro.

## Unreleased

### Fixed

- Second fix.

## 1.0.0-rc.2 - 2026-11-21

### Fixed

- First fix.

## 1.0.0-rc.1 - 2026-11-20

### Added

- Everything.

## 0.9.0 - 2026-11-01

### Added

- Old.
`;

describe('releasing the changelog', () => {
	it('dates Unreleased as the new version and leaves an empty Unreleased', () => {
		const out = releaseChangelog(changelog, v('1.0.0-rc.2'), v('1.0.0-rc.3'), '2026-11-22');
		expect(out).toContain(
			'## Unreleased\n\n## 1.0.0-rc.3 - 2026-11-22\n\n### Fixed\n\n- Second fix.\n\n## 1.0.0-rc.2 - 2026-11-21'
		);
		expect(notesFor(out, '1.0.0-rc.3')).toBe('### Fixed\n\n- Second fix.\n');
		expect(out.startsWith('# Changelog\n\nIntro.\n\n## Unreleased')).toBe(true);
	});

	it('gathers every candidate of a final release, oldest first, by heading', () => {
		const out = releaseChangelog(changelog, v('1.0.0-rc.2'), v('1.0.0'), '2026-11-22');
		expect(notesFor(out, '1.0.0')).toBe(
			'### Added\n\n- Everything.\n\n### Fixed\n\n- First fix.\n- Second fix.\n'
		);
		expect(notesFor(out, '1.0.0-rc.1')).toBe('### Added\n\n- Everything.\n');
		expect(notesFor(out, '0.9.0')).toBe('### Added\n\n- Old.\n');
	});

	it('refuses a release with no notes', () => {
		const empty = changelog.replace('### Fixed\n\n- Second fix.\n', '');
		expect(() => releaseChangelog(empty, v('1.0.0-rc.2'), v('1.0.0-rc.3'), '2026-11-22')).toThrow(
			/Nothing under/
		);
		// A final release has its candidates' notes even with nothing new.
		expect(
			notesFor(releaseChangelog(empty, v('1.0.0-rc.2'), v('1.0.0'), '2026-11-22'), '1.0.0')
		).toContain('- First fix.');
	});

	it('refuses a version it already has, or no Unreleased section', () => {
		expect(() => releaseChangelog(changelog, v('0.8.0'), v('0.9.0'), '2026-11-22')).toThrow(
			/already has 0.9.0/
		);
		expect(() => releaseChangelog('# Changelog\n', v('1.0.0'), v('1.0.1'), '2026-11-22')).toThrow(
			/no "## Unreleased"/
		);
	});
});

describe('check', () => {
	const versions = { 'package.json': '1.0.0-rc.2', 'apps/web/package.json': '1.0.0-rc.2' };

	it('passes agreeing versions with notes', () => {
		expect(check({ versions, changelog, tags: ['v1.0.0-rc.1'], isNew: true })).toEqual([]);
	});

	it('names packages that disagree', () => {
		const [error] = check({
			versions: { ...versions, 'packages/backend/package.json': '0.0.0' },
			changelog,
			tags: [],
			isNew: false
		});
		expect(error).toMatch(/packages\/backend\/package.json: 0.0.0/);
	});

	it('wants notes for the version', () => {
		const bumped = { 'package.json': '1.0.0-rc.3' };
		expect(check({ versions: bumped, changelog, tags: [], isNew: false })).toEqual([
			'CHANGELOG.md has no notes for 1.0.0-rc.3 (pnpm release writes them)'
		]);
	});

	it('wants a new version above every tag only for main', () => {
		expect(check({ versions, changelog, tags: ['v1.0.0-rc.2', 'v0.9.0'], isNew: false })).toEqual(
			[]
		);
		expect(check({ versions, changelog, tags: ['v1.0.0-rc.2', 'v0.9.0'], isNew: true })).toEqual([
			"1.0.0-rc.2 isn't above the last release, v1.0.0-rc.2: run pnpm release before merging to main"
		]);
	});
});
