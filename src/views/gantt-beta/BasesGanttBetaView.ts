// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import { BasesView, type QueryController } from 'obsidian';
import { ViewRuntime } from '../../platform/dom/ViewRuntime';
import { GanttBetaChartHost, type ChartRender } from './chartHost';

export const BASES_GANTT_BETA_VIEW_ID = 'wise-view-gantt-beta';

export class BasesGanttBetaView extends BasesView {
	type = BASES_GANTT_BETA_VIEW_ID;
	private readonly runtime: ViewRuntime;

	constructor(controller: QueryController, private readonly containerEl: HTMLElement, renderChart?: ChartRender) {
		super(controller);
		this.runtime = new ViewRuntime(containerEl);
		this.containerEl.addClass('bases-gantt-beta-view');
		this.runtime.own(new GanttBetaChartHost(containerEl, this.runtime, renderChart));
	}

	onDataUpdated(): void {
		// GBETA-004 intentionally renders static data. Bases mapping starts in GBETA-008.
	}

	onunload(): void {
		this.runtime.dispose();
		this.containerEl.removeClass('bases-gantt-beta-view');
		this.containerEl.replaceChildren();
	}
}
