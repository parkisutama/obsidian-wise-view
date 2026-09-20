// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import type { GanttDetailRenderProps, Task, TaskDependency } from '@jaeungkim/gantt-chart';
import { h, type ComponentChild } from 'preact';
import type { NormalizedValue } from '../../core/entries/NormalizedValue';
import { readGanttDate, writeGanttDate, type GanttPropertyDateType } from '../../core/gantt/dates';

const ZONED_DATE = /(?:Z|[+-]\d{2}:\d{2})$/i;
const DURATION = /^\s*(\d+(?:\.\d+)?)\s*([mhd])\s*$/i;

export interface GanttDetailEntry {
	dateProperties: { start: string | null; end: string | null };
	dateTypes: { start: GanttPropertyDateType; end: GanttPropertyDateType };
	propertyNames: ReadonlyMap<string, string>;
	values: ReadonlyMap<string, NormalizedValue>;
	visibleProperties: readonly string[];
}

export interface GanttDetailPanelOptions {
	canEditEnd: boolean;
	canEditDependencies: boolean;
	canEditProgress: boolean;
	canEditStart: boolean;
	dependsOnProperty: string | null;
	entry: GanttDetailEntry | null;
	localTimeZone: string;
	onOpenNote: (path: string) => void;
	onExactDateUpdate: (taskId: string) => void;
	onRemoveDependency: (taskId: string, dependency: TaskDependency) => boolean;
	progressProperty: string | null;
}

function inputDate(value: string, type: GanttPropertyDateType, boundary: 'start' | 'end'): string {
	return writeGanttDate(value, type, boundary) ?? '';
}

function chartDate(value: string, type: GanttPropertyDateType, boundary: 'start' | 'end'): string | null {
	return readGanttDate(value, type, boundary);
}

function durationMilliseconds(start: string, end: string): number {
	return Date.parse(`${end}Z`) - Date.parse(`${start}Z`);
}

function durationLabel(start: string, end: string): string {
	const milliseconds = durationMilliseconds(start, end);
	if (!Number.isFinite(milliseconds)) return '';
	if (milliseconds % 86_400_000 === 0) return `${milliseconds / 86_400_000}d`;
	if (milliseconds % 3_600_000 === 0) return `${milliseconds / 3_600_000}h`;
	return `${Math.round(milliseconds / 60_000)}m`;
}

function durationEnd(start: string, value: string, dateType: GanttPropertyDateType): string | null {
	const match = DURATION.exec(value);
	if (!match) return null;
	const amount = Number(match[1]);
	const unit = match[2]!.toLowerCase();
	if (!Number.isFinite(amount) || amount < 0 || (dateType === 'date' && (unit !== 'd' || !Number.isInteger(amount) || amount < 1))) return null;
	const multiplier = unit === 'd' ? 86_400_000 : unit === 'h' ? 3_600_000 : 60_000;
	const startTime = Date.parse(`${start}Z`);
	return Number.isFinite(startTime) ? new Date(startTime + amount * multiplier).toISOString() : null;
}

function valueText(value: NormalizedValue | undefined): string {
	if (!value || value.kind === 'missing') return '—';
	if (value.kind === 'text' || value.kind === 'date') return value.value;
	if (value.kind === 'number' || value.kind === 'boolean') return String(value.value);
	if (value.kind === 'link') return value.display ?? value.target;
	if (value.kind === 'file') return value.path;
	if (value.kind === 'list') return value.items.map(valueText).join(', ');
	return 'Unsupported value';
}

function hasZonedDate(entry: GanttDetailEntry | null): boolean {
	if (!entry) return false;
	return [entry.dateProperties.start, entry.dateProperties.end].some(property => {
		const value = property ? entry.values.get(property) : undefined;
		return value?.kind === 'date' && value.hasTime && ZONED_DATE.test(value.value);
	});
}

function field(label: string, control: ComponentChild): ComponentChild {
	return h('label', { class: 'gantt-beta-detail__field' },
		h('span', { class: 'gantt-beta-detail__label' }, label), control);
}

export function renderGanttDetail(
	props: GanttDetailRenderProps,
	options: GanttDetailPanelOptions,
): ComponentChild {
	const task = props.task as Task;
	const entry = options.entry;
	const startType = entry?.dateTypes.start ?? 'date';
	const endType = entry?.dateTypes.end ?? startType;
	const editableStart = options.canEditStart && !task.readOnly && task.allowMove !== false;
	const editableEnd = options.canEditEnd && !task.readOnly && task.allowResize !== false;
	const updateDate = (boundary: 'start' | 'end', value: string) => {
		const type = boundary === 'start' ? startType : endType;
		const next = chartDate(value, type, boundary);
		if (next) {
			options.onExactDateUpdate(task.id);
			props.update(boundary === 'start' ? { startDate: next } : { endDate: next });
		}
	};
	const dependencies = task.dependencies ?? [];
	const duration = durationLabel(task.startDate, task.endDate);
	return h('div', { class: 'gantt-beta-detail' },
		h('div', { class: 'gantt-beta-detail__header' },
			h('button', { class: 'gantt-beta-detail__title', type: 'button', onClick: () => options.onOpenNote(task.id) }, task.name),
			h('button', { class: 'clickable-icon gantt-beta-detail__close', type: 'button', 'aria-label': 'Close details', onClick: props.close }, '×')),
		h('div', { class: 'gantt-beta-detail__fields' },
			field('Start', h('input', {
				type: startType === 'date' ? 'date' : 'datetime-local', value: inputDate(task.startDate, startType, 'start'),
				disabled: !editableStart, onChange: (event: Event) => updateDate('start', (event.currentTarget as HTMLInputElement).value),
			})),
			field('End', h('input', {
				type: endType === 'date' ? 'date' : 'datetime-local', value: inputDate(task.endDate, endType, 'end'),
				disabled: !editableEnd, onChange: (event: Event) => updateDate('end', (event.currentTarget as HTMLInputElement).value),
			})),
			field('Duration', h('input', {
				type: 'text', value: duration, disabled: !editableEnd, 'aria-label': 'Duration',
				onChange: (event: Event) => {
					const input = event.currentTarget as HTMLInputElement;
					const endDate = durationEnd(task.startDate, input.value, endType);
					input.setCustomValidity(endDate ? '' : startType === 'date' && endType === 'date' ? 'Use whole days, for example 2d.' : 'Use minutes, hours, or days, for example 90m, 2h, or 1d.');
					if (endDate) {
						options.onExactDateUpdate(task.id);
						props.update({ endDate });
					}
				},
			})),
			options.progressProperty ? field('Progress', h('input', {
				type: 'number', min: 0, max: 100, step: 1, value: task.progress ?? 0,
				disabled: !options.canEditProgress || task.readOnly || task.allowProgressChange === false,
				onChange: (event: Event) => props.update({ progress: Math.max(0, Math.min(100, Math.round(Number((event.currentTarget as HTMLInputElement).value)))) }),
			})) : null,
			hasZonedDate(entry) ? h('div', { class: 'gantt-beta-detail__timezone' }, `Local time · ${options.localTimeZone}`) : null),
		options.dependsOnProperty && dependencies.length > 0 ? h('section', { class: 'gantt-beta-detail__dependencies' },
			h('div', { class: 'gantt-beta-detail__section-title' }, 'Depends on'),
			...dependencies.map(dependency => h('div', { class: 'gantt-beta-detail__dependency', key: `${dependency.type}:${dependency.targetId}` },
				h('span', null, dependency.targetId.replace(/\.md$/i, '')),
				h('button', {
					type: 'button', 'aria-label': `Remove dependency ${dependency.targetId}`,
					disabled: !options.canEditDependencies || task.readOnly || task.allowLinkDelete === false,
					onClick: () => {
						if (options.onRemoveDependency(task.id, dependency)) props.update({ dependencies: dependencies.filter(item => item !== dependency) });
					},
				}, '×')))) : null,
		entry && entry.visibleProperties.length > 0 ? h('section', { class: 'gantt-beta-detail__properties' },
			h('div', { class: 'gantt-beta-detail__section-title' }, 'Properties'),
			...entry.visibleProperties.map(property => h('div', { class: 'gantt-beta-detail__property', key: property },
				h('span', { class: 'gantt-beta-detail__property-name' }, entry.propertyNames.get(property) ?? property),
				h('span', { class: 'gantt-beta-detail__property-value' }, valueText(entry.values.get(property)))))) : null);
}
