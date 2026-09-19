// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComponentChild, VNode } from 'preact';
import { DateValue } from './fixtures/obsidian';
import { BasesGanttBetaView, BASES_GANTT_BETA_VIEW_ID, createGanttBetaViewRegistration } from '../src/views/gantt-beta';
import type { ChartRender } from '../src/views/gantt-beta/chartHost';
import type { GrantedMutations } from '../src/platform/mutations/grants';

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

interface Harness {
	view: BasesGanttBetaView;
	host: HTMLElement;
	renders: ComponentChild[];
	setConfig(key: string, value: unknown): void;
	/** Simulates Bases delivering a new result set (new group objects) for the same entries. */
	refreshData(): void;
}

function mount(configOverrides: Record<string, unknown> = {}, mutations: GrantedMutations = {}): Harness {
	const host = document.createElement('div');
	document.body.appendChild(host);
	const renders: ComponentChild[] = [];
	const renderChart: ChartRender = (node, container) => {
		renders.push(node);
		container.replaceChildren();
		if (node !== null && node !== undefined && node !== false) {
			const marker = document.createElement('div');
			marker.dataset.preactTree = 'mounted';
			container.appendChild(marker);
		}
	};
	const entry: { file: { path: string; basename: string; extension: string; parent: null; stat: { ctime: number; mtime: number } }; getValue(id: string): DateValue | null } = {
		file: { path: 'A.md', basename: 'A', extension: 'md', parent: null, stat: { ctime: 1, mtime: 2 } }, getValue: () => null,
	};
	const values: Record<string, unknown> = { ganttBetaStart: 'note.start', ...configOverrides };
	entry.getValue = (id: string) => id === 'note.start' ? new DateValue('2026-01-01') : null;
	const app = { metadataCache: { getFirstLinkpathDest: () => null }, vault: { getAbstractFileByPath: () => null } };
	const controller = { app, config: { get: (key: string) => values[key], getAsPropertyId: (key: string) => values[key] ?? null, getOrder: () => [], getDisplayName: (id: string) => id }, data: { groupedData: [{ entries: [entry], hasKey: () => false }] } };
	const plugin = { app, settings: { valueStyles: {} } };
	const view = new BasesGanttBetaView(controller as never, host, plugin as never, renderChart, mutations);
	view.onDataUpdated();
	return {
		view, host, renders,
		setConfig: (key, value) => { values[key] = value; },
		refreshData: () => { (view as unknown as { data: unknown }).data = { groupedData: [{ entries: [entry], hasKey: () => false }] }; },
	};
}

function lastProps(harness: Harness): Record<string, unknown> {
	return (harness.renders.at(-1) as VNode<Record<string, unknown>>).props;
}

afterEach(() => {
	document.body.classList.remove('theme-dark');
	document.body.replaceChildren();
});

describe('Gantt Beta skeleton (GBETA-004)', () => {
	it('registers the permanent id and display name', () => {
		const registration = createGanttBetaViewRegistration({} as never);
		expect(BASES_GANTT_BETA_VIEW_ID).toBe('wise-view-gantt-beta');
		expect(registration.name).toBe('Gantt Beta');
		expect(registration.factory).toBeTypeOf('function');
	});

	it('mounts a static, read-only chart', () => {
		const harness = mount();
		expect(harness.host.dataset.preactTree).toBeUndefined();
		expect(harness.host.querySelector('[data-preact-tree="mounted"]')).not.toBeNull();
		expect(lastProps(harness)).toMatchObject({
			theme: 'light',
			readOnly: true,
			hierarchy: true,
			showTaskList: true,
		});
		expect(lastProps(harness).tasks).toHaveLength(1);
		harness.view.onunload();
	});

	it('repaints when the owning document switches theme', async () => {
		const harness = mount();
		const initialRenderCount = harness.renders.length;

		document.body.classList.add('theme-dark');
		await flush();

		expect(harness.renders.length).toBe(initialRenderCount + 1);
		expect(lastProps(harness).theme).toBe('dark');
		harness.view.onunload();
	});

	it('applies row height through CSS without rebuilding or repainting tasks', () => {
		const harness = mount();
		const firstTasks = lastProps(harness).tasks;
		const renderCount = harness.renders.length;
		harness.setConfig('ganttBetaRowHeight', 64);
		harness.view.onDataUpdated();

		expect(harness.host.style.getPropertyValue('--gantt-row-height')).toBe('64px');
		expect(harness.renders).toHaveLength(renderCount);
		expect(lastProps(harness).tasks).toBe(firstTasks);
		harness.view.onunload();
	});

	it('unmounts the Preact tree and disconnects theme repainting on unload', async () => {
		const harness = mount();
		harness.view.onunload();
		const renderCountAfterUnload = harness.renders.length;

		expect(harness.renders.at(-1)).toBeNull();
		expect(harness.host.childElementCount).toBe(0);
		expect(harness.host.classList.contains('bases-gantt-beta-view')).toBe(false);

		document.body.classList.add('theme-dark');
		await flush();
		expect(harness.renders).toHaveLength(renderCountAfterUnload);
	});

	it('enables only configured, granted edits and keeps callbacks on the same chart instance', async () => {
		const updateRange = vi.fn().mockResolvedValue({ ok: true });
		const harness = mount({ ganttBetaReadOnly: false }, { date: { updateRange } });
		const props = lastProps(harness);
		// Resize edits the end date, so it stays off until an End property is configured.
		expect(props).toMatchObject({ readOnly: false, allowMove: true, allowResize: false, allowProgressChange: false });

		const tasks = props.tasks as Array<Record<string, unknown>>;
		(props.onTasksChange as (tasks: unknown[]) => void)([{ ...tasks[0]!, startDate: '2026-01-02' }]);
		await flush();

		expect(updateRange).toHaveBeenCalledWith('A.md', 'note.start', '2026-01-02', undefined, null);
		// A successful echo is handled by the existing Preact component; no rollback repaint is issued.
		expect(harness.renders.at(-1)).toBeDefined();
		harness.view.onunload();
	});

	it('enables resize once an End property is configured and a date grant exists', () => {
		const harness = mount({ ganttBetaReadOnly: false, ganttBetaEnd: 'note.end' }, { date: { updateRange: vi.fn() } });
		expect(lastProps(harness)).toMatchObject({ allowMove: true, allowResize: true });
		harness.view.onunload();
	});

	it('remounts the chart on a failed write, because the library ignores a re-passed identical array', async () => {
		const updateRange = vi.fn().mockResolvedValue({ ok: false, reason: 'error', message: 'disk full' });
		const harness = mount({ ganttBetaReadOnly: false }, { date: { updateRange } });
		const before = harness.renders.length;
		const firstKey = (harness.renders.at(-1) as VNode).key;
		const props = lastProps(harness);
		const tasks = props.tasks as Array<Record<string, unknown>>;

		(props.onTasksChange as (tasks: unknown[]) => void)([{ ...tasks[0]!, startDate: '2026-01-02' }]);
		await flush();

		expect(harness.renders.length).toBe(before + 1);
		const reverted = harness.renders.at(-1) as VNode;
		expect(reverted.key).not.toBe(firstKey);
		expect((reverted.props as Record<string, unknown>).tasks).toEqual(tasks);
		harness.view.onunload();
	});

	it('holds Bases re-renders while our own write lands, then renders once from the latest data', async () => {
		const updateRange = vi.fn().mockResolvedValue({ ok: true });
		const harness = mount({ ganttBetaReadOnly: false }, { date: { updateRange } });
		const props = lastProps(harness);
		const tasks = props.tasks as Array<Record<string, unknown>>;

		(props.onTasksChange as (tasks: unknown[]) => void)([{ ...tasks[0]!, startDate: '2026-01-02' }]);
		await flush();
		const afterWrite = harness.renders.length;

		harness.refreshData();
		harness.view.onDataUpdated();
		harness.refreshData();
		harness.view.onDataUpdated();
		expect(harness.renders.length).toBe(afterWrite);

		// The view's timers belong to the happy-dom window, so wait out the real settle window.
		await new Promise(resolve => setTimeout(resolve, 500));
		expect(harness.renders.length).toBe(afterWrite + 1);
		harness.view.onunload();
	});
});
