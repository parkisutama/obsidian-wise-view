// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import { BasesView, Notice, type QueryController } from 'obsidian';
import type WiseViewPlugin from '../../main';
import { createEntrySnapshotGroups } from '../../platform/bases/entrySnapshotAdapter';
import { resolveColor } from '../../platform/colors/ColorResolver';
import { resolvePrettyPropertiesColor } from '../../integrations/PrettyPropertiesAdapter';
import { ViewRuntime } from '../../platform/dom/ViewRuntime';
import { GanttBetaChartHost, type ChartRender, type GanttBetaChartModel } from './chartHost';
import { ganttBetaRequestedProperties, readGanttBetaOptions } from './options';
import { mapSnapshotsToGanttTasks } from './taskMapping';

export const BASES_GANTT_BETA_VIEW_ID = 'wise-view-gantt-beta';

export class BasesGanttBetaView extends BasesView {
	type = BASES_GANTT_BETA_VIEW_ID;
	private readonly runtime: ViewRuntime;
	private readonly chart: GanttBetaChartHost;
	private reportedCycles = new Set<string>();
	private lastGroups: unknown = null;
	private lastNonCssConfig = '';
	private lastModel: GanttBetaChartModel | null = null;

	constructor(controller: QueryController, private readonly containerEl: HTMLElement, private readonly plugin: WiseViewPlugin, renderChart?: ChartRender) {
		super(controller);
		this.runtime = new ViewRuntime(containerEl);
		this.containerEl.addClass('bases-gantt-beta-view');
		this.chart = this.runtime.own(new GanttBetaChartHost(containerEl, this.runtime, renderChart));
	}

	onDataUpdated(): void {
		if (!this.data?.groupedData) return;
		const options = readGanttBetaOptions(this.config);
		const nonCssConfig = JSON.stringify({ ...options, rowHeight: undefined });
		if (this.lastGroups === this.data.groupedData && this.lastNonCssConfig === nonCssConfig && this.lastModel) {
			this.lastModel = { ...this.lastModel, rowHeight: options.rowHeight };
			this.chart.update(this.lastModel);
			return;
		}
		const groups = createEntrySnapshotGroups(this.data.groupedData, ganttBetaRequestedProperties(options));
		const grouped = this.data.groupedData.length > 1 || Boolean(this.data.groupedData[0]?.hasKey());
		const mapped = mapSnapshotsToGanttTasks(groups, options, {
			resolveLink: (target, sourcePath) => {
				const file = this.app.metadataCache.getFirstLinkpathDest(target, sourcePath);
				return file ? { path: file.path, name: file.basename } : null;
			},
			resolveColor: (_entry, category) => {
				if (!category || !options.colorBy) return null;
				const resolved = resolveColor({
					categoryValue: category,
					resolvePrettyPropertiesColor: value => resolvePrettyPropertiesColor(this.runtime.win, this.runtime.doc, options.colorBy!.split('.').pop()!, value),
					valueStyleColor: this.plugin.settings.valueStyles[options.colorBy]?.[category]?.color ?? null,
				});
				return resolved.background;
			},
		}, grouped);
		const freshCycles = mapped.cycles.filter(path => !this.reportedCycles.has(path));
		if (freshCycles.length) {
			freshCycles.forEach(path => this.reportedCycles.add(path));
			new Notice(`Gantt Beta ignored cyclic parent links: ${freshCycles.join(', ')}`);
		}
		const model: GanttBetaChartModel = {
			tasks: mapped.tasks, unscheduledCount: mapped.unscheduled.length, rowHeight: options.rowHeight,
			props: {
				defaultScale: options.scale, readOnly: true, hierarchy: options.phases, showTaskList: options.showTaskList,
				showRowNumbers: options.showRowNumbers, showDetail: options.showDetail, showTooltip: options.showTooltip,
				showNonWorkingDays: options.showNonWorkingDays,
				workingWeekdays: options.workingWeekdays.split(',').map(Number).filter(day => day >= 0 && day <= 6),
				holidays: options.holidays.split(',').map(value => value.trim()).filter(Boolean), firstDayOfWeek: options.firstDayOfWeek,
				zoomOnWheel: options.zoomOnWheel, infiniteScroll: options.infiniteScroll,
				...(options.scrollToToday ? { initialScrollTo: 'today' as const } : {}),
			},
		};
		this.lastGroups = this.data.groupedData;
		this.lastNonCssConfig = nonCssConfig;
		this.lastModel = model;
		this.chart.update(model);
	}

	onunload(): void {
		this.runtime.dispose();
		this.containerEl.removeClass('bases-gantt-beta-view');
		this.containerEl.replaceChildren();
	}
}
