// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import { BasesView, type QueryController } from 'obsidian';
import type WiseViewPlugin from '../../main';
import { createEntrySnapshot } from '../../platform/bases/entrySnapshotAdapter';
import { ViewConfigReader } from '../../platform/bases/ViewConfigReader';
import { ViewRuntime } from '../../platform/dom/ViewRuntime';
import { isActivationKey, openPath, triggerHoverPreview } from '../../platform/navigation/NavigationService';
import { showOpenFileMenu } from '../../utils/openFile';
import { dateOnlyFromDayIndex } from '../../core/temporal/TemporalValue';
import { buildTimelineModel } from './TimelineModel';
import { TimelineRenderer } from './TimelineRenderer';
import { readTimelineOptions, timelineRequestedProperties } from './timelineOptions';

export const BASES_TIMELINE_VIEW_ID = 'wise-view-timeline';

function localToday() {
	const now = new Date();
	return dateOnlyFromDayIndex(Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000));
}

export class BasesTimelineView extends BasesView {
	type = BASES_TIMELINE_VIEW_ID;
	private readonly runtime: ViewRuntime;
	private readonly renderer: TimelineRenderer;

	constructor(controller: QueryController, private readonly containerEl: HTMLElement, private readonly plugin: WiseViewPlugin) {
		super(controller);
		this.runtime = new ViewRuntime(containerEl);
		this.renderer = new TimelineRenderer(containerEl);
	}

	onload(): void {
		this.runtime.addEventListener(this.containerEl, 'click', event => this.activate(event));
		this.runtime.addEventListener(this.containerEl, 'contextmenu', event => this.showContextMenu(event));
		this.runtime.addEventListener(this.containerEl, 'mouseover', event => this.showHover(event));
		this.runtime.addEventListener(this.containerEl, 'keydown', event => {
			if (event instanceof KeyboardEvent && isActivationKey(event)) this.activate(event);
		});
	}

	onDataUpdated(): void {
		if (!this.data?.data) return;
		const options = readTimelineOptions(new ViewConfigReader(this.config));
		const properties = timelineRequestedProperties(options);
		const snapshots = this.data.data.map(entry => createEntrySnapshot(entry, properties));
		const today = localToday();
		this.renderer.render(buildTimelineModel(snapshots, options, today), today, options.zoom);
	}

	onunload(): void {
		this.runtime.dispose();
		this.containerEl.replaceChildren();
	}

	private pathFromEvent(event: Event): string | null {
		const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-path]') : null;
		return target?.dataset.path ?? null;
	}

	private activate(event: Event): void {
		const path = this.pathFromEvent(event);
		if (!path) return;
		if (event instanceof KeyboardEvent) event.preventDefault();
		openPath(this.app, path, event as MouseEvent | KeyboardEvent);
	}

	private showContextMenu(event: Event): void {
		if (!(event instanceof MouseEvent)) return;
		const path = this.pathFromEvent(event);
		if (path) showOpenFileMenu(this.app, path, event);
	}

	private showHover(event: Event): void {
		if (!(event instanceof MouseEvent) || !(event.target instanceof HTMLElement)) return;
		const targetEl = event.target.closest<HTMLElement>('[data-path]');
		const filePath = targetEl?.dataset.path;
		if (!targetEl || !filePath) return;
		triggerHoverPreview({
			app: this.app,
			hoverParent: this.plugin,
			sourceId: BASES_TIMELINE_VIEW_ID,
			event,
			filePath,
			targetEl,
		});
	}
}
