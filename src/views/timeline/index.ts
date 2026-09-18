// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import type { BasesAllOptions, BasesViewRegistration, QueryController } from 'obsidian';
import type WiseViewPlugin from '../../main';
import { BASES_TIMELINE_VIEW_ID, BasesTimelineView } from './BasesTimelineView';

export { BASES_TIMELINE_VIEW_ID, BasesTimelineView } from './BasesTimelineView';

export function createTimelineViewRegistration(plugin: WiseViewPlugin): BasesViewRegistration {
	return {
		name: 'Timeline',
		icon: 'calendar-range',
		factory: (controller: QueryController, containerEl: HTMLElement) =>
			new BasesTimelineView(controller, containerEl, plugin),
		options: () => getTimelineViewOptions(),
	};
}

export function getTimelineViewOptions(): BasesAllOptions[] {
	return [
		{
			type: 'group',
			displayName: 'Properties',
			items: [
				{ type: 'property', key: 'startDate', displayName: 'Start date', placeholder: 'Select property...' },
				{ type: 'property', key: 'endDate', displayName: 'End date', placeholder: 'Same as start date' },
				{ type: 'property', key: 'titleBy', displayName: 'Title', placeholder: 'File name' },
				{ type: 'property', key: 'colorBy', displayName: 'Color by', placeholder: 'No category color' },
				{ type: 'property', key: 'groupBy', displayName: 'Group by', placeholder: 'Ungrouped' },
			],
		},
		{
			type: 'group',
			displayName: 'Display',
			items: [{
				type: 'dropdown',
				key: 'zoom',
				displayName: 'Zoom',
				default: 'month',
				options: { day: 'Day', week: 'Week', month: 'Month', quarter: 'Quarter', year: 'Year' },
			}],
		},
	];
}
