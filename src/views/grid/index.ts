// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import type { BasesAllOptions, BasesViewRegistration, QueryController } from 'obsidian';
import type WiseViewPlugin from '../../main';
import { BASES_GRID_VIEW_ID, BasesGridView } from './BasesGridView';

export { BASES_GRID_VIEW_ID, BasesGridView } from './BasesGridView';

export function createGridViewRegistration(plugin: WiseViewPlugin): BasesViewRegistration {
	return {
		name: 'Grid',
		icon: 'layout-grid',
		factory: (controller: QueryController, containerEl: HTMLElement) =>
			new BasesGridView(controller, containerEl, plugin),
		options: () => getGridViewOptions(),
	};
}

export function getGridViewOptions(): BasesAllOptions[] {
	return [
		{
			type: 'group',
			displayName: 'Properties',
			items: [
				{ type: 'property', key: 'titleBy', displayName: 'Title', placeholder: 'File name' },
				{ type: 'property', key: 'subtitleBy', displayName: 'Subtitle', placeholder: 'None' },
				{ type: 'property', key: 'coverBy', displayName: 'Cover', placeholder: 'No cover' },
				{ type: 'property', key: 'tagsBy', displayName: 'Tags', placeholder: 'No tags' },
				{ type: 'property', key: 'colorBy', displayName: 'Color by', placeholder: 'No category color' },
				// Not "groupBy": that key is reserved at the top level of a .base view's own
				// config schema for Bases' native grouping (BasesViewConfigFile.groupBy, an
				// object) — writing our plain property-id string into it makes Obsidian refuse
				// to parse the whole .base file. See T034L.
				{ type: 'property', key: 'groupProperty', displayName: 'Group by', placeholder: 'Ungrouped' },
			],
		},
		{
			type: 'group',
			displayName: 'Display',
			items: [
				{ type: 'slider', key: 'minCardWidth', displayName: 'Minimum card width', default: 220, min: 120, max: 400, step: 10 },
				{ type: 'slider', key: 'gap', displayName: 'Gap', default: 12, min: 0, max: 32, step: 2 },
			],
		},
	];
}
