// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import type { BasesViewRegistration, QueryController } from 'obsidian';
import type WiseViewPlugin from '../../main';
import type { GrantedMutations } from '../../platform/mutations/grants';
import { BASES_GANTT_BETA_VIEW_ID, BasesGanttBetaView } from './BasesGanttBetaView';
import { getGanttBetaViewOptions } from './options';

export { BASES_GANTT_BETA_VIEW_ID, BasesGanttBetaView } from './BasesGanttBetaView';

export function createGanttBetaViewRegistration(
	plugin: WiseViewPlugin,
	mutationsFor: () => GrantedMutations = () => ({}),
): BasesViewRegistration {
	return {
		name: 'Gantt',
		icon: 'gantt-chart-square',
		factory: (controller: QueryController, containerEl: HTMLElement) =>
			new BasesGanttBetaView(controller, containerEl, plugin, undefined, mutationsFor()),
		options: config => getGanttBetaViewOptions(config),
	};
}
