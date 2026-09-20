// @vitest-environment happy-dom

import { render } from 'preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GanttDetailRenderProps, Task } from '@jaeungkim/gantt-chart';
import { renderGanttDetail, type GanttDetailPanelOptions } from '../src/views/gantt-beta/detailPanel';

const task = (overrides: Partial<Task> = {}): Task => ({
	id: 'Task.md', name: 'Task', startDate: '2026-09-20', endDate: '2026-09-22', parentId: null, sequence: '1',
	dependencies: [{ targetId: 'Before.md', type: 'FS' }], progress: 25, ...overrides,
});

function mount(taskValue: Task, overrides: Partial<GanttDetailPanelOptions> = {}) {
	const host = document.createElement('div');
	const update = vi.fn();
	const close = vi.fn();
	const open = vi.fn();
	const remove = vi.fn().mockReturnValue(true);
	const options: GanttDetailPanelOptions = {
		canEditDates: true, canEditDependencies: true, canEditProgress: true,
		dependsOnProperty: 'note.depends_on', progressProperty: 'note.progress', localTimeZone: 'Asia/Jakarta',
		entry: {
			dateTypes: { start: 'date', end: 'date' },
			propertyNames: new Map([['note.status', 'Status'], ['note.owner', 'Owner']]),
			values: new Map([['note.status', { kind: 'text', value: 'Doing' }], ['note.owner', { kind: 'text', value: 'Parkis' }]]),
			visibleProperties: ['note.owner', 'note.status'],
		},
		onOpenNote: open, onRemoveDependency: remove, ...overrides,
	};
	render(renderGanttDetail({ task: taskValue as never, scale: 'week', update, close } as GanttDetailRenderProps, options), host);
	return { host, update, close, open, remove };
}

afterEach(() => document.body.replaceChildren());

describe('Gantt Beta detail panel (GBETA-014)', () => {
	it('uses day precision, edits duration through the chart update path, and preserves property order', () => {
		const h = mount(task());
		const dateInputs = h.host.querySelectorAll<HTMLInputElement>('input[type="date"]');
		expect([...dateInputs].map(input => input.value)).toEqual(['2026-09-20', '2026-09-21']);
		const duration = h.host.querySelector<HTMLInputElement>('[aria-label="Duration"]')!;
		expect(duration.value).toBe('2d');
		duration.value = '3d';
		duration.dispatchEvent(new Event('change', { bubbles: true }));
		expect(h.update).toHaveBeenCalledWith({ endDate: '2026-09-23T00:00:00.000Z' });
		expect([...h.host.querySelectorAll('.gantt-beta-detail__property-name')].map(node => node.textContent)).toEqual(['Owner', 'Status']);
	});

	it('keeps minute precision and discloses local time only for zoned input', () => {
		const zoned = mount(task({ startDate: '2026-09-20T09:15', endDate: '2026-09-20T10:45' }), {
			entry: {
				dateTypes: { start: 'datetime', end: 'datetime' }, propertyNames: new Map(), visibleProperties: [],
				values: new Map([['note.start', { kind: 'date', value: '2026-09-20T02:15:00Z', hasTime: true }]]),
			},
		});
		expect([...zoned.host.querySelectorAll<HTMLInputElement>('input[type="datetime-local"]')].map(input => input.value)).toEqual([
			'2026-09-20T09:15', '2026-09-20T10:45',
		]);
		expect(zoned.host.querySelector('.gantt-beta-detail__timezone')?.textContent).toBe('Local time · Asia/Jakarta');

		const floating = mount(task({ startDate: '2026-09-20T09:15', endDate: '2026-09-20T10:45' }), {
			entry: {
				dateTypes: { start: 'datetime', end: 'datetime' }, propertyNames: new Map(), visibleProperties: [],
				values: new Map([['note.start', { kind: 'date', value: '2026-09-20T09:15', hasTime: true }]]),
			},
		});
		expect(floating.host.querySelector('.gantt-beta-detail__timezone')).toBeNull();
	});

	it('routes progress and dependency removal through task updates and opens the note title', () => {
		const h = mount(task());
		(h.host.querySelector('.gantt-beta-detail__title') as HTMLButtonElement).click();
		expect(h.open).toHaveBeenCalledWith('Task.md');
		const progress = h.host.querySelector<HTMLInputElement>('input[type="number"]')!;
		progress.value = '61';
		progress.dispatchEvent(new Event('change', { bubbles: true }));
		expect(h.update).toHaveBeenCalledWith({ progress: 61 });
		(h.host.querySelector('[aria-label="Remove dependency Before.md"]') as HTMLButtonElement).click();
		expect(h.remove).toHaveBeenCalledWith('Task.md', { targetId: 'Before.md', type: 'FS' });
		expect(h.update).toHaveBeenCalledWith({ dependencies: [] });
	});
});
