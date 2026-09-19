import { describe, expect, it } from 'vitest';
import type { EntrySnapshot } from '../src/core/entries/EntrySnapshot';
import type { NormalizedValue } from '../src/core/entries/NormalizedValue';
import type { EntrySnapshotGroup } from '../src/platform/bases/entrySnapshotAdapter';
import { getGanttBetaViewOptions, readGanttBetaOptions } from '../src/views/gantt-beta/options';
import { mapSnapshotsToGanttTasks } from '../src/views/gantt-beta/taskMapping';

const snapshot = (path: string, values: Record<string, NormalizedValue>): EntrySnapshot => ({
	path, basename: path.replace(/\.md$/, '').split('/').at(-1)!, extension: 'md', folder: '', ctime: 1, mtime: 2,
	values: new Map(Object.entries(values)),
});
const date = (value: string, hasTime = false): NormalizedValue => ({ kind: 'date', value, hasTime });
const text = (value: string): NormalizedValue => ({ kind: 'text', value });
const link = (target: string): NormalizedValue => ({ kind: 'link', target, display: null, external: false });
const number = (value: number): NormalizedValue => ({ kind: 'number', value });
const group = (entries: EntrySnapshot[], key: NormalizedValue = { kind: 'missing' }): EntrySnapshotGroup => ({ entries, key });

function options(values: Record<string, unknown> = {}) {
	const config = {
		get: (key: string) => values[key],
		getAsPropertyId: (key: string) => typeof values[key] === 'string' && String(values[key]).includes('.') ? values[key] : null,
		getOrder: () => [], getDisplayName: (id: string) => id,
	};
	return readGanttBetaOptions(config as never);
}
const services = {
	resolveLink: (target: string) => ({ path: target.endsWith('.md') ? target : `${target}.md`, name: target.split('/').at(-1)! }),
	resolveColor: (_entry: EntrySnapshot, category: string | null) => category === 'Urgent' ? '#ff0000' : null,
};

describe('Bases to Gantt Beta task mapping (GBETA-008)', () => {
	it('defines every spec §3.6 option under Gantt-Beta-specific keys', () => {
		const serialized = JSON.stringify(getGanttBetaViewOptions({} as never));
		for (const key of [
			'Start', 'End', 'Label', 'Parent', 'Order', 'Progress', 'ColorBy', 'DependencyFS', 'DependencySS', 'DependencyFF', 'DependencySF',
			'Scale', 'ShowNonWorkingDays', 'WorkingWeekdays', 'Holidays', 'SnapToWorkingDays', 'FirstDayOfWeek', 'ZoomOnWheel', 'InfiniteScroll',
			'ScrollToToday', 'Phases', 'ShowTaskList', 'ShowRowNumbers', 'ShowDetail', 'ShowProgress', 'ShowTooltip', 'RowHeight',
			'ReadOnly', 'AllowMove', 'AllowResize', 'AllowProgress', 'AllowLinkCreate', 'AllowLinkDelete', 'AllowReorder', 'AllowTaskCreate',
			'MoveDependencies', 'WritePhaseDates', 'TemplatePath', 'TargetFolder', 'TitleFormat',
		]) expect(serialized).toContain(`ganttBeta${key}`);
		expect(serialized).not.toMatch(/"key":"(?:type|name|filters|groupBy|order|summaries)"/);
	});
	it('maps every §3.2 task field and normalizes date/progress/dependencies', () => {
		const result = mapSnapshotsToGanttTasks([group([
			snapshot('Tasks/A.md', {
				'note.start': date('2026-01-31'), 'note.end': date('2026-02-02'), 'note.label': text('Custom A'),
				'note.progress': text('125'), 'note.color': text('Urgent'), 'note.parent': link('Tasks/Parent'),
				'note.order': number(20), 'note.fs': { kind: 'list', items: [link('Tasks/B')] }, 'note.ss': link('Tasks/C'),
			}),
			snapshot('Tasks/Parent.md', { 'note.start': date('2026-01-01') }),
		])], options({
			ganttBetaStart: 'note.start', ganttBetaEnd: 'note.end', ganttBetaLabel: 'note.label', ganttBetaProgress: 'note.progress',
			ganttBetaColorBy: 'note.color', ganttBetaParent: 'note.parent', ganttBetaOrder: 'note.order',
			ganttBetaDependencyFS: 'note.fs', ganttBetaDependencySS: 'note.ss', ganttBetaReadOnly: false,
		}), services);
		const task = result.tasks.find(item => item.id === 'Tasks/A.md')!;
		expect(task).toMatchObject({ id: 'Tasks/A.md', name: 'Custom A', startDate: '2026-01-31', endDate: '2026-02-03',
			progress: 100, color: '#ff0000', parentId: 'Tasks/Parent.md', sequence: '1.1' });
		expect(task.dependencies).toEqual([
			{ targetId: 'Tasks/B.md', type: 'FS' }, { targetId: 'Tasks/C.md', type: 'SS' },
		]);
	});

	it('uses basename, supplies one scale step for missing end, and lists missing-start entries', () => {
		const result = mapSnapshotsToGanttTasks([group([
			snapshot('Alpha.md', { 'note.start': date('2026-03-08T01:30', true) }),
			snapshot('Unscheduled.md', { 'note.label': text('Waiting') }),
		])], options({ ganttBetaStart: 'note.start', ganttBetaScale: 'day' }), services);
		expect(result.tasks[0]).toMatchObject({ name: 'Alpha', startDate: '2026-03-08T01:30', endDate: '2026-03-09T01:30' });
		expect(result.unscheduled.map(entry => entry.path)).toEqual(['Unscheduled.md']);
	});

	it('renders grouped and external parents as read-only synthetic phases', () => {
		const result = mapSnapshotsToGanttTasks([group([
			snapshot('Child.md', { 'note.start': date('2026-01-01'), 'note.parent': link('Outside') }),
		], text('Group A'))], options({ ganttBetaStart: 'note.start', ganttBetaParent: 'note.parent' }), services, true);
		expect(result.tasks.map(task => task.name)).toEqual(['Group A', 'Outside', 'Child']);
		expect(result.tasks.slice(0, 2).every(task => task.readOnly)).toBe(true);
		expect(result.tasks[2]?.parentId).toBe(result.tasks[1]?.id);
	});

	it('disables date interactions for formula-backed properties and omits hidden progress', () => {
		const result = mapSnapshotsToGanttTasks([group([snapshot('A.md', {
			'formula.start': date('2026-01-01'), 'note.progress': number(50),
		})])], options({ ganttBetaStart: 'formula.start', ganttBetaProgress: 'note.progress', ganttBetaShowProgress: false }), services);
		expect(result.tasks[0]).toMatchObject({ allowMove: false, allowResize: false });
		expect(result.tasks[0]).not.toHaveProperty('progress');
	});
});
