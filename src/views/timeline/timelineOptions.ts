// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import type { BasesPropertyId } from 'obsidian';
import type { ViewConfigReader } from '../../platform/bases/ViewConfigReader';
import type { TimelineZoom } from '../../core/temporal/TimelineScale';

export interface TimelineOptions {
	startProperty: BasesPropertyId | null;
	endProperty: BasesPropertyId | null;
	titleProperty: BasesPropertyId | null;
	colorProperty: BasesPropertyId | null;
	groupProperty: BasesPropertyId | null;
	zoom: TimelineZoom;
}

export const TIMELINE_ZOOMS: readonly TimelineZoom[] = ['day', 'week', 'month', 'quarter', 'year'];

/** Reads only explicit Bases view options; no workflow property is guessed or defaulted. */
export function readTimelineOptions(config: ViewConfigReader): TimelineOptions {
	return {
		startProperty: config.getPropertyId('startDate'),
		endProperty: config.getPropertyId('endDate'),
		titleProperty: config.getPropertyId('titleBy'),
		colorProperty: config.getPropertyId('colorBy'),
		groupProperty: config.getPropertyId('groupBy'),
		zoom: config.getEnum('zoom', TIMELINE_ZOOMS, 'month'),
	};
}

export function timelineRequestedProperties(options: TimelineOptions): BasesPropertyId[] {
	return [...new Set([
		options.startProperty,
		options.endProperty,
		options.titleProperty,
		options.colorProperty,
		options.groupProperty,
	].filter((property): property is BasesPropertyId => property != null))];
}
