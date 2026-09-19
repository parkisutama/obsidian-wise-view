// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import { ReactGanttChart, type Task } from '@jaeungkim/gantt-chart';
import { h, type ComponentChild } from 'preact';
import { render } from 'preact/compat';
import type { ViewRuntime } from '../../platform/dom/ViewRuntime';

export type GanttBetaTheme = 'light' | 'dark';
export type ChartRender = (node: ComponentChild, container: Element) => void;

export interface GanttBetaChartModel {
	tasks: Task[];
	unscheduledCount: number;
	rowHeight: number;
	props: {
		defaultScale: 'day' | 'week' | 'month' | 'quarter' | 'year'; readOnly: boolean; hierarchy: boolean;
		showTaskList: boolean; showRowNumbers: boolean; showDetail: boolean; showTooltip: boolean;
		showNonWorkingDays: boolean; workingWeekdays: number[]; holidays: string[]; firstDayOfWeek: number;
		zoomOnWheel: boolean; infiniteScroll: boolean; initialScrollTo?: 'today';
	};
}

function bodyTheme(body: HTMLElement): GanttBetaTheme {
	return body.classList.contains('theme-dark') ? 'dark' : 'light';
}

/** Owns the Preact tree and the owning-window theme observer for one Gantt Beta view. */
export class GanttBetaChartHost {
	private theme: GanttBetaTheme;
	private readonly observer: MutationObserver;
	private disposed = false;
	private model: GanttBetaChartModel | null = null;

	constructor(
		private readonly containerEl: HTMLElement,
		private readonly runtime: ViewRuntime,
		private readonly renderChart: ChartRender = render,
	) {
		this.theme = bodyTheme(runtime.doc.body);
		const MutationObserverCtor = (runtime.win as Window & { MutationObserver: typeof MutationObserver }).MutationObserver;
		this.observer = new MutationObserverCtor(() => this.refreshTheme());
		this.observer.observe(runtime.doc.body, { attributes: true, attributeFilter: ['class'] });
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
		if (!this.model) return;
		if (this.model.tasks.length === 0) {
			this.renderChart(h('div', { class: 'gantt-beta-empty' },
				this.model.unscheduledCount > 0 ? `${this.model.unscheduledCount} note(s) need a configured start date.` : 'No scheduled notes.'), this.containerEl);
			return;
		}
		this.renderChart(h(ReactGanttChart, {
			tasks: this.model.tasks,
			height: '100%',
			width: '100%',
			theme: this.theme,
			...this.model.props,
		}), this.containerEl);
	}

	/** Row height is a CSS-only update; unchanged task/prop references do not repaint Preact. */
	update(model: GanttBetaChartModel): void {
		this.containerEl.style.setProperty('--gantt-row-height', `${model.rowHeight}px`);
		const repaint = !this.model || this.model.tasks !== model.tasks || this.model.props !== model.props
			|| this.model.unscheduledCount !== model.unscheduledCount;
		this.model = model;
		if (repaint) this.paint();
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.observer.disconnect();
		this.renderChart(null, this.containerEl);
	}
}
