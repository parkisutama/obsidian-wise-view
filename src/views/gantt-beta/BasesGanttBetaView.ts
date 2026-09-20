// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import { BasesView, Notice, type QueryController } from 'obsidian';
import type { GanttProps, GanttTaskDraft, Task } from '@jaeungkim/gantt-chart';
import type WiseViewPlugin from '../../main';
import type { NormalizedValue } from '../../core/entries/NormalizedValue';
import { writeGanttDate, type GanttPropertyDateType } from '../../core/gantt/dates';
import { createEntrySnapshotGroups } from '../../platform/bases/entrySnapshotAdapter';
import type { EntrySnapshotGroup } from '../../platform/bases/entrySnapshotAdapter';
import { resolveColor } from '../../platform/colors/ColorResolver';
import { resolvePrettyPropertiesColor } from '../../integrations/PrettyPropertiesAdapter';
import { ViewRuntime } from '../../platform/dom/ViewRuntime';
import type { GrantedMutations } from '../../platform/mutations/grants';
import { NoteTemplateService } from '../../services/NoteTemplateService';
import { EchoGate } from './echoGate';
import { GanttBetaChartHost, type ChartRender, type GanttBetaChartModel } from './chartHost';
import { ganttBetaRequestedProperties, readGanttBetaOptions } from './options';
import type { GanttBetaOptions } from './options';
import { mapSnapshotsToGanttTasks } from './taskMapping';
import { GanttBetaToolbar } from './toolbar';
import { GanttBetaWriteBack } from './writeBack';

export const BASES_GANTT_BETA_VIEW_ID = 'wise-view-gantt-beta';

const PIXELS_PER_MINUTE: Record<GanttBetaOptions['scale'], number> = {
	day: 12 / 60,
	week: 18 / (6 * 60),
	month: 18 / (24 * 60),
	quarter: 28 / (7 * 24 * 60),
	year: 28 / (28 * 24 * 60),
};

export function localTodayOffsetPx(scale: GanttBetaOptions['scale'], timezoneOffsetMinutes: number): number {
	return -timezoneOffsetMinutes * PIXELS_PER_MINUTE[scale];
}

export class BasesGanttBetaView extends BasesView {
	type = BASES_GANTT_BETA_VIEW_ID;
	private readonly runtime: ViewRuntime;
	private readonly chart: GanttBetaChartHost;
	private readonly toolbar: GanttBetaToolbar;
	private reportedCycles = new Set<string>();
	private lastGroups: unknown = null;
	private lastNonCssConfig = '';
	private lastModel: GanttBetaChartModel | null = null;
	private writer: GanttBetaWriteBack | null = null;
	private currentOptions: GanttBetaOptions | null = null;
	private currentStartType: GanttPropertyDateType = 'date';
	private creationFolder = '';
	private readonly echoGate: EchoGate;
	private activeScale: GanttBetaOptions['scale'] | null = null;

	constructor(
		controller: QueryController,
		private readonly containerEl: HTMLElement,
		private readonly plugin: WiseViewPlugin,
		renderChart?: ChartRender,
		private readonly mutations: GrantedMutations = {},
	) {
		super(controller);
		this.runtime = new ViewRuntime(containerEl);
		this.containerEl.addClass('bases-gantt-beta-view');
		const toolbarEl = containerEl.createDiv();
		const chartEl = containerEl.createDiv({ cls: 'gantt-beta-chart' });
		this.chart = this.runtime.own(new GanttBetaChartHost(chartEl, this.runtime, renderChart));
		this.toolbar = new GanttBetaToolbar(toolbarEl, this.runtime, {
			onScale: scale => this.setScale(scale),
			onToday: () => this.chart.scrollToToday(),
			onZoomToFit: () => this.chart.zoomToFit(),
			onAddTask: () => this.chart.addTask(),
			onCollapseAll: () => this.setCollapsed(this.parentIds()),
			onExpandAll: () => this.setCollapsed([]),
		});
		this.echoGate = new EchoGate({
			setTimeout: (handler, ms) => this.runtime.setTimeout(handler, ms),
			clearTimeout: id => this.runtime.win.clearTimeout(id),
			now: () => Date.now(),
		}, () => this.onDataUpdated());
	}

	onDataUpdated(): void {
		if (!this.data?.groupedData) return;
		// Bases echoes our own writes file by file; render once they have settled, from the latest data.
		if (this.echoGate.hold()) return;
		const options = readGanttBetaOptions(this.config);
		this.currentOptions = options;
		this.containerEl.style.setProperty('--gantt-row-height', `${options.rowHeight}px`);
		this.setTodayOffset(options.scale);
		const nonCssConfig = JSON.stringify({ ...options, rowHeight: undefined });
		if (this.lastGroups === this.data.groupedData && this.lastNonCssConfig === nonCssConfig && this.lastModel) {
			this.lastModel = { ...this.lastModel, rowHeight: options.rowHeight };
			this.chart.update(this.lastModel);
			return;
		}
		const groups = createEntrySnapshotGroups(this.data.groupedData, ganttBetaRequestedProperties(options));
		this.creationFolder = groups.flatMap(group => group.entries)[0]?.folder ?? '';
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
		const mutationProperties = this.mutationProperties(groups, options);
		this.currentStartType = mutationProperties.start?.type ?? 'date';
		if (this.writer) {
			this.writer.replaceProperties(mutationProperties);
			this.writer.replaceScheduleOptions(options.dependencyShift, options.writePhaseDates, options.scale);
			this.writer.replaceBaseline(mapped.tasks, mutationProperties);
		} else {
			this.writer = new GanttBetaWriteBack(mapped.tasks, {
				mutations: this.mutations,
				properties: mutationProperties,
				revertTasks: tasks => this.revertTaskArray(tasks),
				gate: this.echoGate,
				notice: message => new Notice(message),
				createTask: draft => this.createTask(draft, this.currentOptions ?? options, this.currentStartType),
				dependencyPolicy: options.dependencyShift,
				writePhaseDates: options.writePhaseDates,
				scale: options.scale,
				renderTasks: tasks => this.renderTaskArray(tasks),
			});
		}
		const writer = this.writer;
		const editable = !options.readOnly;
		const canAddTask = editable && options.allowTaskCreate && Boolean(options.start && this.mutations.fileCreate);
		const showTime = mutationProperties.start?.type === 'datetime' || mutationProperties.end?.type === 'datetime';
		const formats: GanttProps['formats'] = {
			[options.scale]: { tooltip: (date: { format(pattern: string): string }) => date.format(showTime ? 'YYYY-MM-DD HH:mm' : 'YYYY-MM-DD') },
		};
		const model: GanttBetaChartModel = {
			tasks: mapped.tasks, unscheduledCount: mapped.unscheduled.length, rowHeight: options.rowHeight,
			props: {
				defaultScale: options.scale, readOnly: options.readOnly, hierarchy: options.phases, showTaskList: options.showTaskList,
				collapsedIds: options.collapsedIds,
				onScaleChange: scale => this.persistScale(scale),
				onCollapsedChange: ids => this.setCollapsed(ids),
				formats,
				showRowNumbers: options.showRowNumbers, showDetail: options.showDetail, showTooltip: options.showTooltip,
				showNonWorkingDays: options.showNonWorkingDays,
				workingWeekdays: options.workingWeekdays.split(',').map(Number).filter(day => day >= 0 && day <= 6),
				holidays: options.holidays.split(',').map(value => value.trim()).filter(Boolean), firstDayOfWeek: options.firstDayOfWeek,
				zoomOnWheel: options.zoomOnWheel, infiniteScroll: options.infiniteScroll,
				...(options.scrollToToday ? { initialScrollTo: 'today' as const } : {}),
				allowMove: editable && options.allowMove && Boolean(this.mutations.date),
				allowResize: editable && options.allowResize && Boolean(options.end && this.mutations.date),
				allowProgressChange: editable && options.allowProgress && Boolean(options.progress && this.mutations.property),
				allowLinkCreate: editable && options.allowLinkCreate && Boolean(options.dependsOn && this.mutations.dependency),
				allowLinkDelete: editable && options.allowLinkDelete && Boolean(options.dependsOn && this.mutations.dependency),
				allowReorder: editable && options.allowReorder && Boolean((options.order || options.parent) && this.mutations.property),
				allowTaskCreate: canAddTask,
				onTasksChange: tasks => void writer.onTasksChange(tasks),
				onDependencyCreate: change => writer.onDependencyCreate(change),
				onDependencyDelete: change => writer.onDependencyDelete(change),
				onTaskMove: change => writer.onTaskMove(change),
				onTaskCreate: draft => void writer.onTaskCreate(draft),
			},
		};
		this.lastGroups = this.data.groupedData;
		this.lastNonCssConfig = nonCssConfig;
		this.lastModel = model;
		this.chart.update(model);
		if (this.activeScale === null) this.activeScale = options.scale;
		else if (this.activeScale !== options.scale) {
			this.activeScale = options.scale;
			this.chart.setScale(options.scale);
		}
		this.toolbar.update(this.activeScale, canAddTask);
	}

	private setScale(scale: GanttBetaOptions['scale']): void {
		this.chart.setScale(scale);
		this.persistScale(scale);
	}

	private persistScale(scale: GanttBetaOptions['scale']): void {
		this.activeScale = scale;
		this.setTodayOffset(scale);
		this.toolbar.update(scale, Boolean(this.lastModel?.props.allowTaskCreate));
		if (this.config.get('ganttBetaScale') !== scale) this.config.set('ganttBetaScale', scale);
	}

	private setTodayOffset(scale: GanttBetaOptions['scale']): void {
		this.containerEl.style.setProperty('--gantt-local-today-offset', `${localTodayOffsetPx(scale, new Date().getTimezoneOffset())}px`);
	}

	private parentIds(): string[] {
		if (!this.lastModel) return [];
		const ids = new Set(this.lastModel.tasks.map(task => task.parentId).filter((id): id is string => id !== null));
		return this.lastModel.tasks.map(task => task.id).filter(id => ids.has(id));
	}

	private setCollapsed(ids: string[]): void {
		if (!this.lastModel) return;
		this.lastModel = { ...this.lastModel, props: { ...this.lastModel.props, collapsedIds: ids } };
		this.chart.update(this.lastModel);
		this.persistCollapsed(ids);
	}

	private persistCollapsed(ids: string[]): void {
		const value = JSON.stringify(ids);
		if (this.config.get('ganttBetaCollapsedIds') !== value) this.config.set('ganttBetaCollapsedIds', value);
	}

	private revertTaskArray(tasks: Task[]): void {
		if (this.lastModel) this.lastModel = { ...this.lastModel, tasks };
		this.chart.revert(tasks);
	}

	private renderTaskArray(tasks: Task[]): void {
		if (!this.lastModel) return;
		this.lastModel = { ...this.lastModel, tasks };
		this.chart.update(this.lastModel);
	}

	private mutationProperties(groups: readonly EntrySnapshotGroup[], options: GanttBetaOptions) {
		const entries = groups.flatMap(group => group.entries);
		const dateType = (property: string | null): GanttPropertyDateType => {
			if (!property) return 'date';
			return entries.some(entry => {
				const value = entry.values.get(property);
				return value?.kind === 'date' && value.hasTime;
			}) ? 'datetime' : 'date';
		};
		const entryDateType = (entry: EntrySnapshotGroup['entries'][number], property: string | null): GanttPropertyDateType => {
			const value = property ? entry.values.get(property) : undefined;
			return value?.kind === 'date' && value.hasTime ? 'datetime' : 'date';
		};
		const stored = (value: NormalizedValue | undefined): unknown => {
			if (!value || value.kind === 'missing') return undefined;
			if (value.kind === 'list') return value.items.map(item => stored(item)).filter(item => item !== undefined);
			if (value.kind === 'link') return `[[${value.target}]]`;
			if (value.kind === 'text' || value.kind === 'date' || value.kind === 'number' || value.kind === 'boolean') return value.value;
			if (value.kind === 'file') return value.path;
			return undefined;
		};
		return {
			...(options.start ? { start: { id: options.start, type: dateType(options.start) } } : {}),
			...(options.end ? { end: { id: options.end, type: dateType(options.end) } } : {}),
			progress: options.progress ?? undefined, parent: options.parent ?? undefined, order: options.order ?? undefined,
			dependsOn: options.dependsOn ?? undefined,
			dateTypes: new Map(entries.map(entry => [entry.path, {
				start: entryDateType(entry, options.start), end: entryDateType(entry, options.end),
			}])),
			currentOrder: new Map(entries.map(entry => {
				const value = options.order ? entry.values.get(options.order) : undefined;
				return [entry.path, value?.kind === 'number' ? value.value : null] as const;
			})),
			currentDependsOn: new Map(entries.map(entry => [entry.path, stored(options.dependsOn ? entry.values.get(options.dependsOn) : undefined)])),
			resolveLink: (target: string) => this.app.metadataCache.getFirstLinkpathDest(target, '')?.path ?? null,
		};
	}

	private async createTask(draft: GanttTaskDraft, options: GanttBetaOptions, dateType: GanttPropertyDateType): Promise<void> {
		if (!options.start || options.start.startsWith('formula.')) throw new Error('Configure a writable Start date property first.');
		if (!this.mutations.fileCreate) throw new Error('File creation capability is unavailable.');
		const fieldName = (property: string) => property.replace(/^note\./, '');
		const propertyDate = (value: string, boundary: 'start' | 'end') => writeGanttDate(value, dateType, boundary);
		const frontmatter: Record<string, unknown> = {
			[fieldName(options.start)]: propertyDate(draft.startDate, 'start'),
		};
		if (options.end && !options.end.startsWith('formula.')) {
			frontmatter[fieldName(options.end)] = propertyDate(draft.endDate, 'end');
		}
		const parseUtc = (value: string) => new Date(`${value}${/[zZ]|[+-]\d\d:\d\d$/.test(value) ? '' : 'Z'}`);
		const request = await new NoteTemplateService(this.app, {
			templatePath: options.templatePath, targetFolder: options.targetFolder, titleFormat: options.titleFormat,
		}).prepareNote({
			title: 'New note', start: parseUtc(draft.startDate), end: parseUtc(draft.endDate), allDay: dateType === 'date', frontmatter,
		}, this.creationFolder);
		const result = await this.mutations.fileCreate.createNote(request);
		if (!result.ok) throw new Error(result.message);
	}

	onunload(): void {
		this.runtime.dispose();
		this.containerEl.removeClass('bases-gantt-beta-view');
		this.containerEl.replaceChildren();
	}
}
