// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import { ReactGanttChart, type Task } from '@jaeungkim/gantt-chart';
import { h, type ComponentChild } from 'preact';
import { render } from 'preact/compat';
import type { ViewRuntime } from '../../platform/dom/ViewRuntime';

export type GanttBetaTheme = 'light' | 'dark';
export type ChartRender = (node: ComponentChild, container: Element) => void;

const STATIC_TASKS: Task[] = [
	{
		id: 'gantt-beta-foundation',
		name: 'Gantt Beta foundation',
		startDate: '2026-09-15',
		endDate: '2026-09-26',
		parentId: null,
		sequence: '1',
		progress: 50,
	},
	{
		id: 'gantt-beta-runtime',
		name: 'Preact runtime',
		startDate: '2026-09-15',
		endDate: '2026-09-20',
		parentId: 'gantt-beta-foundation',
		sequence: '1.1',
		progress: 100,
	},
	{
		id: 'gantt-beta-skeleton',
		name: 'View skeleton',
		startDate: '2026-09-20',
		endDate: '2026-09-26',
		parentId: 'gantt-beta-foundation',
		sequence: '1.2',
		progress: 35,
		dependencies: [{ targetId: 'gantt-beta-runtime', type: 'FS' }],
	},
];

function bodyTheme(body: HTMLElement): GanttBetaTheme {
	return body.classList.contains('theme-dark') ? 'dark' : 'light';
}

/** Owns the Preact tree and the owning-window theme observer for one Gantt Beta view. */
export class GanttBetaChartHost {
	private theme: GanttBetaTheme;
	private readonly observer: MutationObserver;
	private disposed = false;

	constructor(
		private readonly containerEl: HTMLElement,
		private readonly runtime: ViewRuntime,
		private readonly renderChart: ChartRender = render,
	) {
		this.theme = bodyTheme(runtime.doc.body);
		const MutationObserverCtor = (runtime.win as Window & { MutationObserver: typeof MutationObserver }).MutationObserver;
		this.observer = new MutationObserverCtor(() => this.refreshTheme());
		this.observer.observe(runtime.doc.body, { attributes: true, attributeFilter: ['class'] });
		this.paint();
	}

	get currentTheme(): GanttBetaTheme {
		return this.theme;
	}

	private refreshTheme(): void {
		const nextTheme = bodyTheme(this.runtime.doc.body);
		if (nextTheme === this.theme) return;
		this.theme = nextTheme;
		this.paint();
	}

	private paint(): void {
		this.renderChart(h(ReactGanttChart, {
			tasks: STATIC_TASKS,
			height: '100%',
			width: '100%',
			theme: this.theme,
			defaultScale: 'day',
			showTaskList: true,
			showRowNumbers: true,
			hierarchy: true,
			readOnly: true,
		}), this.containerEl);
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.observer.disconnect();
		this.renderChart(null, this.containerEl);
	}
}
