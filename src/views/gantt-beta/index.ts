// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import type { BasesViewRegistration, QueryController } from 'obsidian';
import { BASES_GANTT_BETA_VIEW_ID, BasesGanttBetaView } from './BasesGanttBetaView';

export { BASES_GANTT_BETA_VIEW_ID, BasesGanttBetaView } from './BasesGanttBetaView';

export function createGanttBetaViewRegistration(): BasesViewRegistration {
	return {
		name: 'Gantt Beta',
		icon: 'gantt-chart-square',
		factory: (controller: QueryController, containerEl: HTMLElement) =>
			new BasesGanttBetaView(controller, containerEl),
	};
}
