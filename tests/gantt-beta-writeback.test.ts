import { describe, expect, it, vi } from 'vitest';
import type { GanttDependencyChange, GanttTaskMoveChange, Task } from '@jaeungkim/gantt-chart';
import { GanttBetaWriteBack } from '../src/views/gantt-beta/writeBack';

const task = (id: string, overrides: Partial<Task> = {}): Task => ({
	id, name: id, startDate: '2026-10-01', endDate: '2026-10-03', parentId: null, sequence: '1', ...overrides,
});

function harness(overrides: Record<string, unknown> = {}) {
	const date = { updateRange: vi.fn().mockResolvedValue({ ok: true }) };
	const property = { setProperty: vi.fn().mockResolvedValue({ ok: true }), setProperties: vi.fn().mockResolvedValue({ ok: true }) };
	const dependency = { setDependencies: vi.fn().mockResolvedValue({ ok: true }) };
	const revertTasks = vi.fn();
	const notice = vi.fn();
	const gate = { begin: vi.fn(), end: vi.fn() };
	const before = [task('Tasks/A.md', { progress: 20 }), task('Tasks/B.md', { sequence: '2' })];
	const writer = new GanttBetaWriteBack(before, {
		mutations: { date, property, dependency },
		properties: {
			start: { id: 'note.start', type: 'date' }, end: { id: 'note.end', type: 'date' },
			progress: 'note.progress', parent: 'note.parent', order: 'note.order', dependsOn: 'note.depends_on',
			currentOrder: new Map([['Tasks/A.md', 10], ['Tasks/B.md', 20]]), currentDependsOn: new Map(),
		},
		revertTasks, notice, gate,
		...overrides,
	});
	return { writer, before, date, property, dependency, revertTasks, notice, gate };
}

describe('Gantt Beta write-back (GBETA-010)', () => {
	it('routes date and progress changes to the exact scoped capabilities', async () => {
		const h = harness();
		await h.writer.onTasksChange([
			{ ...h.before[0]!, startDate: '2026-10-02', endDate: '2026-10-06', progress: 35 }, h.before[1]!,
		]);

		expect(h.date.updateRange).toHaveBeenCalledOnce();
		expect(h.date.updateRange).toHaveBeenCalledWith('Tasks/A.md', 'note.start', '2026-10-02', 'note.end', '2026-10-05');
		expect(h.property.setProperties).toHaveBeenCalledWith('Tasks/A.md', { 'note.progress': 35 });
		expect(h.dependency.setDependencies).not.toHaveBeenCalled();
	});

	// The real library reports every edited date as `toISOString()`, never as the plain strings the
	// other tests feed in. Both storage types must survive that, in any local time zone.
	it('persists the ISO strings the library emits for a moved Date task', async () => {
		const h = harness();
		await h.writer.onTasksChange([
			{ ...h.before[0]!, startDate: '2026-10-02T00:00:00.000Z', endDate: '2026-10-05T00:00:00.000Z' }, h.before[1]!,
		]);

		expect(h.date.updateRange).toHaveBeenCalledWith('Tasks/A.md', 'note.start', '2026-10-02', 'note.end', '2026-10-04');
	});

	it('persists a moved Date & time task at the same wall-clock time in a non-UTC zone', async () => {
		const original = process.env.TZ;
		process.env.TZ = 'Asia/Jakarta';
		try {
			const h = harness();
			h.writer.replaceProperties({
				start: { id: 'note.start', type: 'datetime' }, end: { id: 'note.end', type: 'datetime' },
			});
			h.writer.replaceBaseline([task('Tasks/A.md', { startDate: '2026-10-01T09:00', endDate: '2026-10-01T10:30' })]);
			await h.writer.onTasksChange([
				task('Tasks/A.md', { startDate: '2026-10-02T09:00:00.000Z', endDate: '2026-10-02T10:30:00.000Z' }),
			]);

			expect(h.date.updateRange).toHaveBeenCalledWith(
				'Tasks/A.md', 'note.start', '2026-10-02T09:00', 'note.end', '2026-10-02T10:30',
			);
		} finally {
			if (original === undefined) delete process.env.TZ;
			else process.env.TZ = original;
		}
	});

	it('uses the date capability for an end-only resize and keeps the existing start', async () => {
		const h = harness();
		await h.writer.onTasksChange([{ ...h.before[0]!, endDate: '2026-10-06' }, h.before[1]!]);

		expect(h.date.updateRange).toHaveBeenCalledWith(
			'Tasks/A.md', 'note.start', '2026-10-01', 'note.end', '2026-10-05',
		);
		expect(h.property.setProperty).not.toHaveBeenCalled();
	});

	it('batches a summary drag into one date write per real descendant', async () => {
		const before = [
			task('wise-view-synthetic://group/Project', { endDate: '2026-10-05' }),
			task('Tasks/A.md', { parentId: 'wise-view-synthetic://group/Project', sequence: '1.1' }),
			task('Tasks/B.md', { parentId: 'wise-view-synthetic://group/Project', sequence: '1.2' }),
		];
		const h = harness();
		h.writer.replaceBaseline(before);
		await h.writer.onTasksChange(before.map(item => ({
			...item, startDate: '2026-10-02', endDate: item.id.includes('synthetic') ? '2026-10-06' : '2026-10-04',
		})));

		expect(h.date.updateRange).toHaveBeenCalledTimes(2);
		expect(h.date.updateRange).toHaveBeenCalledWith('Tasks/A.md', 'note.start', '2026-10-02', 'note.end', '2026-10-03');
		expect(h.date.updateRange).toHaveBeenCalledWith('Tasks/B.md', 'note.start', '2026-10-02', 'note.end', '2026-10-03');
	});

	it('accepts only FS dependency drawing and persists the successor link once', async () => {
		const h = harness();
		const fs: GanttDependencyChange = { predecessorId: 'Tasks/A.md', successorId: 'Tasks/B.md', type: 'FS' };
		const ss: GanttDependencyChange = { ...fs, type: 'SS' };

		expect(h.writer.onDependencyCreate(fs)).toBe(true);
		expect(h.writer.onDependencyCreate(ss)).toBe(false);
		await h.writer.onTasksChange([
			h.before[0]!, { ...h.before[1]!, dependencies: [{ targetId: 'Tasks/A.md', type: 'FS' }] },
		]);

		expect(h.dependency.setDependencies).toHaveBeenCalledOnce();
		expect(h.dependency.setDependencies).toHaveBeenCalledWith('Tasks/B.md', 'note.depends_on', '[[Tasks/A]]');
	});

	it('routes dependency deletion, reparenting, and sibling ordering without unrelated writes', async () => {
		const before = [
			task('Tasks/A.md', { dependencies: [{ targetId: 'Tasks/B.md', type: 'FS' }], parentId: 'Phase/One.md', sequence: '1.1' }),
			task('Tasks/B.md', { parentId: 'Phase/Two.md', sequence: '2.1' }),
		];
		const h = harness({});
		h.writer.replaceBaseline(before, {
			currentOrder: new Map([['Tasks/A.md', 10], ['Tasks/B.md', 10]]),
			currentDependsOn: new Map([['Tasks/A.md', '[[Tasks/B]]']]),
		});
		const move: GanttTaskMoveChange = {
			taskId: 'Tasks/A.md', fromParentId: 'Phase/One.md', fromIndex: 0, toParentId: 'Phase/Two.md', toIndex: 1,
			afterId: 'Tasks/B.md', beforeId: null,
		};
		expect(h.writer.onTaskMove(move)).toBe(true);
		await h.writer.onTasksChange([
			before[1]!, { ...before[0]!, dependencies: [], parentId: 'Phase/Two.md', sequence: '2.2' },
		]);

		expect(h.dependency.setDependencies).toHaveBeenCalledWith('Tasks/A.md', 'note.depends_on', '');
		expect(h.property.setProperties).toHaveBeenCalledWith('Tasks/A.md', {
			'note.parent': '[[Phase/Two]]', 'note.order': 20,
		});
	});

	it('rejects synthetic reparenting and reorder without an Order property', () => {
		const h = harness();
		const synthetic = { taskId: 'Tasks/A.md', fromParentId: null, fromIndex: 0,
			toParentId: 'wise-view-synthetic://group/X', toIndex: 0, afterId: null, beforeId: null };
		expect(h.writer.onTaskMove(synthetic)).toBe(false);

		const noOrder = harness({ properties: undefined });
		noOrder.writer.replaceProperties({ start: { id: 'note.start', type: 'date' } });
		expect(noOrder.writer.onTaskMove({ ...synthetic, toParentId: null, fromParentId: null, toIndex: 1 })).toBe(false);
	});

	it('reverts the previous array and reports a failed write', async () => {
		const h = harness();
		h.date.updateRange.mockResolvedValue({ ok: false, reason: 'error', message: 'disk full' });
		await h.writer.onTasksChange([{ ...h.before[0]!, startDate: '2026-10-02' }, h.before[1]!]);

		expect(h.revertTasks).toHaveBeenCalledWith(h.before);
		expect(h.notice).toHaveBeenCalledWith('Could not save Gantt change: disk full');
		expect(h.writer.tasks).toBe(h.before);
	});

	it('turns a thrown capability error into a revert instead of an unhandled rejection', async () => {
		const h = harness();
		h.date.updateRange.mockRejectedValue(new Error('vault locked'));
		await expect(h.writer.onTasksChange([{ ...h.before[0]!, startDate: '2026-10-02' }, h.before[1]!])).resolves.toBeUndefined();

		expect(h.revertTasks).toHaveBeenCalledWith(h.before);
		expect(h.notice).toHaveBeenCalledWith('Could not save Gantt change: vault locked');
	});

	it('applies gestures in order, each diffed against the previous result', async () => {
		const h = harness();
		let release!: () => void;
		h.date.updateRange.mockImplementationOnce(() => new Promise(resolve => { release = () => resolve({ ok: true }); }));
		const first = [{ ...h.before[0]!, startDate: '2026-10-02', endDate: '2026-10-04' }, h.before[1]!];
		const second = [{ ...first[0]!, progress: 60 }, h.before[1]!];

		const one = h.writer.onTasksChange(first);
		const two = h.writer.onTasksChange(second);
		await Promise.resolve();
		expect(h.property.setProperties).not.toHaveBeenCalled();
		release();
		await Promise.all([one, two]);

		expect(h.date.updateRange).toHaveBeenCalledOnce();
		expect(h.property.setProperties).toHaveBeenCalledOnce();
		expect(h.property.setProperties).toHaveBeenCalledWith('Tasks/A.md', { 'note.progress': 60 });
		expect(h.writer.tasks).toBe(second);
	});

	it('voids gestures queued behind a failed one, since the chart is rebuilt from the old baseline', async () => {
		const h = harness();
		h.date.updateRange.mockResolvedValueOnce({ ok: false, reason: 'error', message: 'nope' });
		const first = [{ ...h.before[0]!, startDate: '2026-10-02' }, h.before[1]!];
		const second = [{ ...first[0]!, progress: 60 }, h.before[1]!];

		await Promise.all([h.writer.onTasksChange(first), h.writer.onTasksChange(second)]);

		expect(h.revertTasks).toHaveBeenCalledOnce();
		expect(h.property.setProperties).not.toHaveBeenCalled();
		expect(h.writer.tasks).toBe(h.before);
		expect(h.gate.begin).toHaveBeenCalledTimes(2);
		expect(h.gate.end).toHaveBeenCalledTimes(2);
	});

	it('brackets every gesture with the echo gate, including ones that write nothing', async () => {
		const h = harness();
		await h.writer.onTasksChange(h.before);
		await h.writer.onTasksChange([{ ...h.before[0]!, progress: 35 }, h.before[1]!]);

		expect(h.gate.begin).toHaveBeenCalledTimes(2);
		expect(h.gate.end).toHaveBeenCalledTimes(2);
	});

	it('delegates a task draft to the configured note creator', async () => {
		const createTask = vi.fn().mockResolvedValue(undefined);
		const h = harness({ createTask });
		await h.writer.onTaskCreate({ startDate: '2026-10-04T00:00', endDate: '2026-10-05T00:00' });
		expect(createTask).toHaveBeenCalledWith({ startDate: '2026-10-04T00:00', endDate: '2026-10-05T00:00' });
	});
});

describe('Gantt Beta schedule write-back (GBETA-011)', () => {
	it('adds the minimum overlap repair to the same write batch', async () => {
		const h = harness({ dependencyPolicy: 'overlap' });
		const before = [
			task('Tasks/A.md', { startDate: '2026-10-01', endDate: '2026-10-03' }),
			task('Tasks/B.md', { startDate: '2026-10-04', endDate: '2026-10-06', sequence: '2',
				dependencies: [{ targetId: 'Tasks/A.md', type: 'FS' }] }),
		];
		h.writer.replaceBaseline(before);
		await h.writer.onTasksChange([{ ...before[0]!, startDate: '2026-10-04', endDate: '2026-10-06' }, before[1]!]);

		expect(h.date.updateRange).toHaveBeenCalledTimes(2);
		expect(h.date.updateRange).toHaveBeenCalledWith('Tasks/B.md', 'note.start', '2026-10-06', 'note.end', '2026-10-07');
	});

	it('does not write unchanged successors when automatic shifting is off', async () => {
		const h = harness({ dependencyPolicy: 'none' });
		const before = [
			task('Tasks/A.md'),
			task('Tasks/B.md', { sequence: '2', dependencies: [{ targetId: 'Tasks/A.md', type: 'FS' }] }),
		];
		h.writer.replaceBaseline(before);
		await h.writer.onTasksChange([{ ...before[0]!, startDate: '2026-10-02', endDate: '2026-10-04' }, before[1]!]);

		expect(h.date.updateRange).toHaveBeenCalledOnce();
		expect(h.date.updateRange).not.toHaveBeenCalledWith('Tasks/B.md', expect.anything(), expect.anything(), expect.anything(), expect.anything());
	});

	it('skips phase dates by default and writes them with the phase own date types when enabled', async () => {
		const before = [
			task('Phase.md', { startDate: '2026-10-01T09:00', endDate: '2026-10-02T09:00' }),
			task('Child.md', { parentId: 'Phase.md', sequence: '1.1' }),
		];
		const after = [
			{ ...before[0]!, startDate: '2026-10-02T09:00', endDate: '2026-10-03T09:00' },
			{ ...before[1]!, startDate: '2026-10-02', endDate: '2026-10-04' },
		];
		const off = harness({ writePhaseDates: false });
		off.writer.replaceBaseline(before);
		await off.writer.onTasksChange(after);
		expect(off.date.updateRange).toHaveBeenCalledTimes(1);
		expect(off.date.updateRange).toHaveBeenCalledWith('Child.md', 'note.start', '2026-10-02', 'note.end', '2026-10-03');

		const on = harness({ writePhaseDates: true });
		on.writer.replaceProperties({
			start: { id: 'note.start', type: 'date' }, end: { id: 'note.end', type: 'date' },
			dateTypes: new Map([
				['Phase.md', { start: 'datetime' as const, end: 'datetime' as const }],
				['Child.md', { start: 'date' as const, end: 'date' as const }],
			]),
		});
		on.writer.replaceBaseline(before);
		await on.writer.onTasksChange(after);
		expect(on.date.updateRange).toHaveBeenCalledWith(
			'Phase.md', 'note.start', '2026-10-02T09:00', 'note.end', '2026-10-03T09:00',
		);
	});
});
