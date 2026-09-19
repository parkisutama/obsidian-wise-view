// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import type { BasesPropertyId } from 'obsidian';
import type { ViewConfigReader } from '../../platform/bases/ViewConfigReader';
import type { CardMappingOptions } from '../../core/cards/CardMapper';

export interface GridOptions {
	titleProperty: BasesPropertyId | null;
	subtitleProperty: BasesPropertyId | null;
	coverProperty: BasesPropertyId | null;
	tagsProperty: BasesPropertyId | null;
	colorProperty: BasesPropertyId | null;
	/** Not "groupBy": that key is reserved by Bases' own view config schema (see T034L). */
	groupProperty: BasesPropertyId | null;
	minCardWidth: number;
	gap: number;
}

/** Reads only explicit Bases view options; no workflow property is guessed or defaulted. */
export function readGridOptions(config: ViewConfigReader): GridOptions {
	return {
		titleProperty: config.getPropertyId('titleBy'),
		subtitleProperty: config.getPropertyId('subtitleBy'),
		coverProperty: config.getPropertyId('coverBy'),
		tagsProperty: config.getPropertyId('tagsBy'),
		colorProperty: config.getPropertyId('colorBy'),
		groupProperty: config.getPropertyId('groupProperty'),
		minCardWidth: config.getNumber('minCardWidth', 220),
		gap: config.getNumber('gap', 12),
	};
}

/** The properties Grid needs from each entry: the configured slots plus the user's chosen property order. */
export function gridRequestedProperties(options: GridOptions, order: readonly BasesPropertyId[]): BasesPropertyId[] {
	return [...new Set([
		options.titleProperty,
		options.subtitleProperty,
		options.coverProperty,
		options.tagsProperty,
		options.colorProperty,
		options.groupProperty,
		...order,
	].filter((property): property is BasesPropertyId => property != null))];
}

/** Maps Grid's own options plus the user's configured property order into `CardMapper`'s shape. */
export function toCardMappingOptions(
	options: GridOptions,
	order: readonly BasesPropertyId[],
	displayName: (propertyId: BasesPropertyId) => string,
): CardMappingOptions {
	return {
		titleProperty: options.titleProperty,
		subtitleProperty: options.subtitleProperty,
		coverProperty: options.coverProperty,
		tagsProperty: options.tagsProperty,
		colorProperty: options.colorProperty,
		previewEnabled: false,
		properties: order.map((propertyId) => ({ propertyId, label: displayName(propertyId) })),
	};
}
