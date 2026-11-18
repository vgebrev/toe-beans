import { describe, expect, it } from 'vitest';
import { arrive, backFrom, isForm, labelOf, leave, type Stop } from './trail.svelte.js';

const stop = (path: string, transient = false): Stop => ({ path, href: path, transient });

/** Walks the trail: leaves the last page (titled by its path) and arrives at each in turn. */
function walk(...steps: (string | [string, 'form'])[]): Stop[] {
	return steps.reduce<Stop[]>((trail, step) => {
		const [path, form] = typeof step === 'string' ? [step, false] : [step[0], true];
		const left = leave(trail, trail.at(-1)?.path);
		return arrive(left, stop(path, form), ['/', '/plan', '/care', '/more'].includes(path));
	}, []);
}

describe('the back trail', () => {
	it('leads back where the person came from, not to the menu parent', () => {
		expect(backFrom(walk('/', '/dogs/1'), '/dogs/1')?.href).toBe('/');
		expect(backFrom(walk('/more', '/dogs', '/dogs/1'), '/dogs/1')?.href).toBe('/dogs');
		expect(backFrom(walk('/', '/dogs/1'), '/dogs/1')?.label).toBe('/');
	});

	it('has nowhere to lead on a page loaded afresh', () => {
		expect(backFrom(walk('/dogs/1'), '/dogs/1')).toBeUndefined();
		expect(backFrom([], '/dogs/1')).toBeUndefined();
	});

	it('starts afresh at a tab', () => {
		expect(walk('/', '/dogs/1', '/plan')).toEqual([{ ...stop('/plan'), transient: false }]);
	});

	it('cuts back to a page met again', () => {
		const trail = walk('/', '/care/1', '/dogs/1', '/care/1');
		expect(trail.map((s) => s.path)).toEqual(['/', '/care/1']);
		expect(backFrom(trail, '/care/1')?.href).toBe('/');
	});

	it('forgets a form once it is left', () => {
		// Saved: the form goes to the page it changed, which still leads where it did.
		const edited = walk('/', '/care/1', ['/care/1/edit', 'form'], '/care/1');
		expect(backFrom(edited, '/care/1')?.href).toBe('/');
		// Added: the new page leads where the form did.
		const added = walk('/more', '/dogs', ['/dogs/new', 'form'], '/dogs/2');
		expect(backFrom(added, '/dogs/2')?.href).toBe('/dogs');
		// While on it, the form leads back where it was opened from.
		expect(backFrom(walk('/', ['/plan/new', 'form']), '/plan/new')?.href).toBe('/');
	});

	it('keeps a page as it was left', () => {
		const trail = arrive(
			walk('/', '/history'),
			{ path: '/history', href: '/history?type=fear', transient: false },
			false
		);
		const onward = arrive(leave(trail, 'History'), stop('/events/1'), false);
		expect(backFrom(onward, '/events/1')).toMatchObject({
			href: '/history?type=fear',
			label: 'History'
		});
	});

	it('names a page by its title', () => {
		expect(labelOf('Bean · Toe Beans')).toBe('Bean');
		expect(labelOf('Toe Beans')).toBeUndefined();
		expect(labelOf('')).toBeUndefined();
	});

	it('knows a form by its route', () => {
		expect(isForm('/(app)/care/[id]/edit')).toBe(true);
		expect(isForm('/(app)/dogs/new')).toBe(true);
		expect(isForm('/(app)/dogs/[id]')).toBe(false);
		expect(isForm(null)).toBe(false);
	});
});
