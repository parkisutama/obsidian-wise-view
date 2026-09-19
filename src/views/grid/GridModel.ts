// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import type { EntrySnapshot } from '../../core/entries/EntrySnapshot';
import { valueText } from '../../core/entries/valueText';
import { mapEntriesToCardItems, type CardMappingOptions } from '../../core/cards/CardMapper';
import type { CardItem } from '../../core/cards/CardItem';
import type { GridOptions } from './gridOptions';

export type GridRow =
	| { path: string; kind: 'group'; groupKey: string; label: string; count: number }
	| { path: string; kind: 'item'; groupKey: string; item: CardItem };

export interface GridModel {
	rows: GridRow[];
}

const GROUP_ROW_PREFIX = 'wise-view-grid-group:';
const UNGROUPED_KEY = '__wise-view-grid-ungrouped__';

/**
 * Maps entries to `CardItem`s and, if `options.groupProperty` is configured, groups them by its
 * raw text value (falling back to "—" for a present-but-unresolvable value, matching Timeline's
 * convention). No group header is produced when grouping is not configured — a Grid without
 * Group by set is one flat, ungrouped list, never a synthetic "Ungrouped" section.
 */
export function buildGridModel(entries: readonly EntrySnapshot[], options: GridOptions, mapping: CardMappingOptions): GridModel {
	const items = mapEntriesToCardItems(entries, mapping);

	if (!options.groupProperty) {
		return { rows: items.map((item): GridRow => ({ path: item.path, kind: 'item', groupKey: UNGROUPED_KEY, item })) };
	}

	const groups = new Map<string, { label: string; items: CardItem[] }>();
	entries.forEach((entry, index) => {
		const item = items[index];
		if (!item) return;
		const label = valueText(entry.values.get(options.groupProperty as string)) ?? '—';
		const group = groups.get(label) ?? { label, items: [] };
		group.items.push(item);
		groups.set(label, group);
	});

	const rows: GridRow[] = [];
	for (const [groupKey, group] of groups) {
		rows.push({ path: `${GROUP_ROW_PREFIX}${groupKey}`, kind: 'group', groupKey, label: group.label, count: group.items.length });
		for (const item of group.items) {
			rows.push({ path: item.path, kind: 'item', groupKey, item });
		}
	}
	return { rows };
}
