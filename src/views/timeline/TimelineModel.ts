// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import type { EntrySnapshot } from '../../core/entries/EntrySnapshot';
import type { NormalizedValue } from '../../core/entries/NormalizedValue';
import { normalizeDateRange, type NormalizedDateRange } from '../../core/temporal/DateRange';
import { parseTemporalValue, type DateOnlyValue } from '../../core/temporal/TemporalValue';
import type { TimelineOptions } from './timelineOptions';

export type TimelineUnscheduledReason = 'start-not-configured' | 'start-missing' | 'start-invalid' | 'end-invalid';

export interface TimelineItem {
	path: string;
	title: string;
	group: string;
	colorValue: string | null;
	range: NormalizedDateRange | null;
	unscheduledReason: TimelineUnscheduledReason | null;
}

export interface TimelineGroup {
	key: string;
	items: TimelineItem[];
}

export interface TimelineModel {
	groups: TimelineGroup[];
	unscheduled: TimelineItem[];
	itemsByPath: ReadonlyMap<string, TimelineItem>;
}

function valueText(value: NormalizedValue | undefined): string | null {
	if (!value || value.kind === 'missing') return null;
	switch (value.kind) {
		case 'text':
		case 'date': return value.value;
		case 'number':
		case 'boolean': return String(value.value);
		case 'link': return value.display || value.target;
		case 'file': return value.path;
		case 'list': {
			const text = value.items.map(valueText).filter((item): item is string => item != null).join(', ');
			return text || null;
		}
		case 'unsupported': return value.raw == null ? null : String(value.raw);
	}
}

function mapRange(
	entry: EntrySnapshot,
	options: TimelineOptions,
	today?: DateOnlyValue,
): Pick<TimelineItem, 'range' | 'unscheduledReason'> {
	if (!options.startProperty) return { range: null, unscheduledReason: 'start-not-configured' };
	const startText = valueText(entry.values.get(options.startProperty));
	if (!startText) return { range: null, unscheduledReason: 'start-missing' };
	const start = parseTemporalValue(startText);
	if (!start || start.kind === 'ongoing') return { range: null, unscheduledReason: 'start-invalid' };

	let end = null;
	if (options.endProperty) {
		const endText = valueText(entry.values.get(options.endProperty));
		if (endText) {
			end = parseTemporalValue(endText);
			if (!end) return { range: null, unscheduledReason: 'end-invalid' };
		}
	}
	return { range: normalizeDateRange(start, end, today ? { today } : {}), unscheduledReason: null };
}

export function buildTimelineModel(
	entries: readonly EntrySnapshot[],
	options: TimelineOptions,
	today?: DateOnlyValue,
): TimelineModel {
	const groups = new Map<string, TimelineItem[]>();
	const unscheduled: TimelineItem[] = [];
	const itemsByPath = new Map<string, TimelineItem>();
	for (const entry of entries) {
		const mappedRange = mapRange(entry, options, today);
		const item: TimelineItem = {
			path: entry.path,
			title: (options.titleProperty && valueText(entry.values.get(options.titleProperty))) || entry.basename,
			group: (options.groupProperty && valueText(entry.values.get(options.groupProperty))) || 'Ungrouped',
			colorValue: options.colorProperty ? valueText(entry.values.get(options.colorProperty)) : null,
			...mappedRange,
		};
		itemsByPath.set(item.path, item);
		if (!item.range) {
			unscheduled.push(item);
			continue;
		}
		const group = groups.get(item.group) ?? [];
		group.push(item);
		groups.set(item.group, group);
	}
	return {
		groups: [...groups].map(([key, items]) => ({ key, items })),
		unscheduled,
		itemsByPath,
	};
}
