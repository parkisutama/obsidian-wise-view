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
		this.renderer = this.runtime.own(new TimelineRenderer(containerEl));
	}

		onload(): void {
		this.runtime.addEventListener(this.containerEl, 'click', event => this.handleClick(event));
		this.runtime.addEventListener(this.containerEl, 'change', event => this.handleControlChange(event));
		this.runtime.addEventListener(this.containerEl, 'contextmenu', event => this.showContextMenu(event));
		this.runtime.addEventListener(this.containerEl, 'mouseover', event => this.showHover(event));
		this.runtime.addEventListener(this.containerEl, 'keydown', event => {
			if (event instanceof KeyboardEvent && isActivationKey(event)) this.activate(event);
		});
		const ResizeObserverCtor = (this.runtime.win as Window & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
		if (ResizeObserverCtor) {
			const observer = new ResizeObserverCtor(entries => {
				const width = entries[0]?.contentRect.width ?? this.containerEl.clientWidth;
				this.renderer.setNarrow(width < 600);
				this.renderer.refreshViewport();
			});
			observer.observe(this.containerEl);
			this.runtime.observe(observer);
		}
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
		const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-note-path]') : null;
		return target?.dataset.notePath ?? null;
	}

	private handleClick(event: Event): void {
		const action = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-action]') : null;
		if (action?.dataset.action === 'today') {
			this.renderer.scrollToToday();
			return;
		}
		if (action?.dataset.action === 'toggle-sidebar') {
			this.renderer.toggleSidebar();
			return;
		}
		if (action?.dataset.action === 'toggle-group' && action.dataset.groupKey) {
			this.renderer.toggleGroup(action.dataset.groupKey);
			return;
		}
		this.activate(event);
	}

	private handleControlChange(event: Event): void {
		const select = event.target instanceof HTMLSelectElement ? event.target : null;
		if (select?.dataset.action !== 'zoom') return;
		this.renderer.setZoom(select.value as Parameters<TimelineRenderer['setZoom']>[0]);
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
		const targetEl = event.target.closest<HTMLElement>('[data-note-path]');
		const filePath = targetEl?.dataset.notePath;
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
