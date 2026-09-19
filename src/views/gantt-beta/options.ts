// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import type { BasesAllOptions, BasesPropertyId, BasesViewConfig, TFile } from 'obsidian';
import { ViewConfigReader } from '../../platform/bases/ViewConfigReader';

export const GANTT_BETA_SCALES = ['day', 'week', 'month', 'quarter', 'year'] as const;
export type GanttBetaScale = typeof GANTT_BETA_SCALES[number];

export interface GanttBetaOptions {
	start: BasesPropertyId | null; end: BasesPropertyId | null; label: BasesPropertyId | null;
	parent: BasesPropertyId | null; order: BasesPropertyId | null; progress: BasesPropertyId | null;
	colorBy: BasesPropertyId | null; dependencyFS: BasesPropertyId | null; dependencySS: BasesPropertyId | null;
	dependencyFF: BasesPropertyId | null; dependencySF: BasesPropertyId | null;
	scale: GanttBetaScale; showNonWorkingDays: boolean; workingWeekdays: string; holidays: string;
	snapToWorkingDays: boolean; firstDayOfWeek: number; zoomOnWheel: boolean; infiniteScroll: boolean;
	scrollToToday: boolean; phases: boolean; showTaskList: boolean; showRowNumbers: boolean;
	showDetail: boolean; showProgress: boolean; showTooltip: boolean; rowHeight: number;
	readOnly: boolean; allowMove: boolean; allowResize: boolean; allowProgress: boolean;
	allowLinkCreate: boolean; allowLinkDelete: boolean; allowReorder: boolean; allowTaskCreate: boolean;
	moveDependencies: boolean; writePhaseDates: boolean; templatePath: string; targetFolder: string; titleFormat: string;
}

export function readGanttBetaOptions(config: BasesViewConfig): GanttBetaOptions {
	const r = new ViewConfigReader(config);
	return {
		start: r.getPropertyId('ganttBetaStart'), end: r.getPropertyId('ganttBetaEnd'), label: r.getPropertyId('ganttBetaLabel'),
		parent: r.getPropertyId('ganttBetaParent'), order: r.getPropertyId('ganttBetaOrder'), progress: r.getPropertyId('ganttBetaProgress'),
		colorBy: r.getPropertyId('ganttBetaColorBy'), dependencyFS: r.getPropertyId('ganttBetaDependencyFS'), dependencySS: r.getPropertyId('ganttBetaDependencySS'),
		dependencyFF: r.getPropertyId('ganttBetaDependencyFF'), dependencySF: r.getPropertyId('ganttBetaDependencySF'),
		scale: r.getEnum('ganttBetaScale', GANTT_BETA_SCALES, 'month'), showNonWorkingDays: r.getBoolean('ganttBetaShowNonWorkingDays', true),
		workingWeekdays: r.getString('ganttBetaWorkingWeekdays', '1,2,3,4,5'), holidays: r.getOptionalString('ganttBetaHolidays') ?? '',
		snapToWorkingDays: r.getBoolean('ganttBetaSnapToWorkingDays', false), firstDayOfWeek: r.getNumber('ganttBetaFirstDayOfWeek', 1),
		zoomOnWheel: r.getBoolean('ganttBetaZoomOnWheel', false), infiniteScroll: r.getBoolean('ganttBetaInfiniteScroll', false),
		scrollToToday: r.getBoolean('ganttBetaScrollToToday', true), phases: r.getBoolean('ganttBetaPhases', true),
		showTaskList: r.getBoolean('ganttBetaShowTaskList', true), showRowNumbers: r.getBoolean('ganttBetaShowRowNumbers', true),
		showDetail: r.getBoolean('ganttBetaShowDetail', true), showProgress: r.getBoolean('ganttBetaShowProgress', true),
		showTooltip: r.getBoolean('ganttBetaShowTooltip', true), rowHeight: Math.max(28, Math.min(80, r.getNumber('ganttBetaRowHeight', 40))),
		readOnly: r.getBoolean('ganttBetaReadOnly', true), allowMove: r.getBoolean('ganttBetaAllowMove', true),
		allowResize: r.getBoolean('ganttBetaAllowResize', true), allowProgress: r.getBoolean('ganttBetaAllowProgress', true),
		allowLinkCreate: r.getBoolean('ganttBetaAllowLinkCreate', true), allowLinkDelete: r.getBoolean('ganttBetaAllowLinkDelete', true),
		allowReorder: r.getBoolean('ganttBetaAllowReorder', true), allowTaskCreate: r.getBoolean('ganttBetaAllowTaskCreate', true),
		moveDependencies: r.getBoolean('ganttBetaMoveDependencies', false), writePhaseDates: r.getBoolean('ganttBetaWritePhaseDates', false),
		templatePath: r.getOptionalString('ganttBetaTemplatePath') ?? '', targetFolder: r.getOptionalString('ganttBetaTargetFolder') ?? '',
		titleFormat: r.getString('ganttBetaTitleFormat', 'New note {{date}}'),
	};
}

const property = (key: string, displayName: string) => ({ type: 'property' as const, key, displayName, placeholder: 'Select property...' });
const toggle = (key: string, displayName: string, value: boolean) => ({ type: 'toggle' as const, key, displayName, default: value });

export function getGanttBetaViewOptions(_config: BasesViewConfig): BasesAllOptions[] {
	return [
		{ type: 'group', displayName: 'Properties', items: [
			property('ganttBetaStart', 'Start date'), property('ganttBetaEnd', 'End date'), property('ganttBetaLabel', 'Label'),
			property('ganttBetaParent', 'Parent (phase)'), property('ganttBetaOrder', 'Order'), property('ganttBetaProgress', 'Progress'),
			property('ganttBetaColorBy', 'Color by'), property('ganttBetaDependencyFS', 'Depends on (FS)'),
			property('ganttBetaDependencySS', 'Starts with (SS)'), property('ganttBetaDependencyFF', 'Finishes with (FF)'),
			property('ganttBetaDependencySF', 'Start-to-finish (SF)'),
		] },
		{ type: 'group', displayName: 'Timeline', items: [
			{ type: 'dropdown', key: 'ganttBetaScale', displayName: 'Scale', default: 'month', options: { day: 'Day', week: 'Week', month: 'Month', quarter: 'Quarter', year: 'Year' } },
			toggle('ganttBetaShowNonWorkingDays', 'Show non-working days', true),
			{ type: 'text', key: 'ganttBetaWorkingWeekdays', displayName: 'Working weekdays', default: '1,2,3,4,5', placeholder: '1,2,3,4,5' },
			{ type: 'text', key: 'ganttBetaHolidays', displayName: 'Holidays', default: '', placeholder: '2026-01-01, 2026-12-25' },
			toggle('ganttBetaSnapToWorkingDays', 'Snap to working days', false),
			{ type: 'slider', key: 'ganttBetaFirstDayOfWeek', displayName: 'First day of week', default: 1, min: 0, max: 6, step: 1 },
			toggle('ganttBetaZoomOnWheel', 'Zoom with Ctrl/Cmd + wheel', false), toggle('ganttBetaInfiniteScroll', 'Infinite scroll', false),
			toggle('ganttBetaScrollToToday', 'Scroll to today on open', true),
		] },
		{ type: 'group', displayName: 'Layout', items: [
			toggle('ganttBetaPhases', 'Phases', true), toggle('ganttBetaShowTaskList', 'Task list', true), toggle('ganttBetaShowRowNumbers', 'Row numbers', true),
			toggle('ganttBetaShowDetail', 'Detail panel', true), toggle('ganttBetaShowProgress', 'Show progress', true), toggle('ganttBetaShowTooltip', 'Tooltip', true),
			{ type: 'slider', key: 'ganttBetaRowHeight', displayName: 'Row height', default: 40, min: 28, max: 80, step: 2 },
		] },
		{ type: 'group', displayName: 'Editing', items: [
			toggle('ganttBetaReadOnly', 'Read only', true), toggle('ganttBetaAllowMove', 'Move bars', true), toggle('ganttBetaAllowResize', 'Resize bars', true),
			toggle('ganttBetaAllowProgress', 'Edit progress', true), toggle('ganttBetaAllowLinkCreate', 'Draw dependencies', true),
			toggle('ganttBetaAllowLinkDelete', 'Delete dependencies', true), toggle('ganttBetaAllowReorder', 'Reorder rows', true),
			toggle('ganttBetaAllowTaskCreate', 'Create by drawing', true), toggle('ganttBetaMoveDependencies', 'Move dependent tasks', false),
			toggle('ganttBetaWritePhaseDates', 'Write phase dates', false),
		] },
		{ type: 'group', displayName: 'Note template', items: [
			{ type: 'file', key: 'ganttBetaTemplatePath', displayName: 'Template note', default: '', placeholder: 'Templates/Note.md', filter: (file: TFile) => file.extension === 'md' },
			{ type: 'folder', key: 'ganttBetaTargetFolder', displayName: 'Target folder', default: '', placeholder: 'Leave blank to follow Base' },
			{ type: 'text', key: 'ganttBetaTitleFormat', displayName: 'Title format', default: 'New note {{date}}', placeholder: 'New note {{date}}' },
		] },
	];
}

export function ganttBetaRequestedProperties(options: GanttBetaOptions): BasesPropertyId[] {
	return [...new Set([options.start, options.end, options.label, options.parent, options.order, options.progress, options.colorBy,
		options.dependencyFS, options.dependencySS, options.dependencyFF, options.dependencySF].filter((id): id is BasesPropertyId => id !== null))];
}
