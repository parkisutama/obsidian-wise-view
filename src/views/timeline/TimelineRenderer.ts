// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import { calculateTimeDomain, rangeToDayBounds, todayPosition, type TimeDomain } from '../../core/temporal/TimeDomain';
import { dateToPixel, generateTimelineTicks, TIMELINE_ZOOM_SPECS, type TimelineZoom } from '../../core/temporal/TimelineScale';
import type { DateOnlyValue } from '../../core/temporal/TemporalValue';
import { VirtualLinearCollection, type VirtualRowHandle } from '../../platform/dom/VirtualLinearCollection';
import { resolveColor, toCssVariables } from '../../platform/colors/ColorResolver';
import { flattenTimelineRows, type TimelineItem, type TimelineModel, type TimelineVirtualRow } from './TimelineModel';

export interface TimelineBarLayout {
	item: TimelineItem;
	left: number;
	width: number;
}

export interface TimelineLayout {
	domain: TimeDomain;
	width: number;
	todayLeft: number;
	todayEdge: 'before' | 'inside' | 'after';
	bars: TimelineBarLayout[];
}

/** All horizontal geometry is derived exclusively through Temporal Core. */
export function createTimelineLayout(model: TimelineModel, today: DateOnlyValue, zoom: TimelineZoom): TimelineLayout {
	const scheduled = model.groups.flatMap(group => group.items).filter(item => item.range != null);
	const bounds = scheduled.map(item => rangeToDayBounds(item.range!));
	const domain = calculateTimeDomain(bounds, { today, paddingDays: 7, minimumSpanDays: 14 });
	const pixelsPerDay = TIMELINE_ZOOM_SPECS[zoom].pixelsPerDay;
	return {
		domain,
		width: dateToPixel(domain.endDay, domain, zoom),
		todayLeft: dateToPixel(today.dayIndex, domain, zoom),
		todayEdge: todayPosition(domain, today),
		bars: scheduled.map(item => {
			const range = rangeToDayBounds(item.range!);
			return {
				item,
				left: dateToPixel(range.startDay, domain, zoom),
				width: Math.max(pixelsPerDay, dateToPixel(range.endDay, domain, zoom) - dateToPixel(range.startDay, domain, zoom)),
			};
		}),
	};
}

function tickLabel(day: DateOnlyValue, zoom: TimelineZoom): string {
	if (zoom === 'day' || zoom === 'week') return day.iso;
	if (zoom === 'month' || zoom === 'quarter') return `${day.year}-${String(day.month).padStart(2, '0')}`;
	return String(day.year);
}

export class TimelineRenderer {
	private readonly toolbarEl: HTMLElement;
	private readonly sidebarViewport: HTMLElement;
	private readonly timelineViewport: HTMLElement;
	private readonly headerEl: HTMLElement;
	private readonly sidebarRows: VirtualLinearCollection<TimelineVirtualRow>;
	private readonly timelineRows: VirtualLinearCollection<TimelineVirtualRow>;
	private readonly collapsedGroups = new Set<string>();
	private currentModel: TimelineModel | null = null;
	private currentToday: DateOnlyValue | null = null;
	private activeZoom: TimelineZoom | null = null;
	private currentLayout: TimelineLayout | null = null;
	private bars = new Map<string, TimelineBarLayout>();
	private syncingScroll = false;
	private readonly syncFromSidebar = (): void => this.syncScroll(this.sidebarViewport, this.timelineViewport);
	private readonly syncFromTimeline = (): void => this.syncScroll(this.timelineViewport, this.sidebarViewport);

	constructor(private readonly containerEl: HTMLElement) {
		containerEl.classList.add('wise-view-timeline');
		this.toolbarEl = containerEl.createDiv({ cls: 'wise-view-timeline__toolbar' });
		const main = containerEl.createDiv({ cls: 'wise-view-timeline__main' });
		this.sidebarViewport = main.createDiv({ cls: 'wise-view-timeline__sidebar' });
		const chart = main.createDiv({ cls: 'wise-view-timeline__chart' });
		this.headerEl = chart.createDiv({ cls: 'wise-view-timeline__header' });
		this.timelineViewport = chart.createDiv({ cls: 'wise-view-timeline__scroller' });
		this.sidebarRows = new VirtualLinearCollection(this.sidebarViewport, {
			rowHeight: 36,
			overscan: 5,
			renderRow: row => this.renderSidebarRow(row),
			updateRow: (handle, row) => this.updateSidebarRow(handle, row),
		});
		this.timelineRows = new VirtualLinearCollection(this.timelineViewport, {
			rowHeight: 36,
			overscan: 5,
			renderRow: row => this.renderTimelineRow(row),
			updateRow: (handle, row) => this.updateTimelineRow(handle, row),
		});
		this.sidebarViewport.addEventListener('scroll', this.syncFromSidebar, { passive: true });
		this.timelineViewport.addEventListener('scroll', this.syncFromTimeline, { passive: true });
	}

	render(model: TimelineModel, today: DateOnlyValue, zoom: TimelineZoom): TimelineLayout {
		this.currentModel = model;
		this.currentToday = today;
		this.activeZoom ??= zoom;
		const layout = createTimelineLayout(model, today, this.activeZoom);
		this.currentLayout = layout;
		this.bars = new Map(layout.bars.map(bar => [bar.item.path, bar]));
		this.renderToolbar();
		this.renderHeader(layout, this.activeZoom);
		const rows = flattenTimelineRows(model, this.collapsedGroups);
		this.sidebarRows.updateItems(rows);
		this.timelineRows.updateItems(rows);
		this.renderToday(layout);
		return layout;
	}

	setZoom(zoom: TimelineZoom): void {
		if (this.activeZoom === zoom || !this.currentModel || !this.currentToday) return;
		this.activeZoom = zoom;
		this.render(this.currentModel, this.currentToday, zoom);
	}

	toggleGroup(groupKey: string): void {
		if (!this.currentModel || !this.currentToday || !this.activeZoom) return;
		if (this.collapsedGroups.has(groupKey)) this.collapsedGroups.delete(groupKey);
		else this.collapsedGroups.add(groupKey);
		this.render(this.currentModel, this.currentToday, this.activeZoom);
	}

	scrollToToday(): void {
		if (!this.currentLayout) return;
		this.timelineViewport.scrollLeft = Math.max(0, this.currentLayout.todayLeft - this.timelineViewport.clientWidth / 2);
	}

	setNarrow(narrow: boolean): void {
		this.containerEl.classList.toggle('wise-view-timeline--narrow', narrow);
	}

	refreshViewport(): void {
		this.sidebarRows.refresh();
		this.timelineRows.refresh();
	}

	dispose(): void {
		this.sidebarViewport.removeEventListener('scroll', this.syncFromSidebar);
		this.timelineViewport.removeEventListener('scroll', this.syncFromTimeline);
		this.sidebarRows.destroy();
		this.timelineRows.destroy();
	}

	private syncScroll(source: HTMLElement, destination: HTMLElement): void {
		if (this.syncingScroll || destination.scrollTop === source.scrollTop) return;
		this.syncingScroll = true;
		destination.scrollTop = source.scrollTop;
		this.sidebarRows.refresh();
		this.timelineRows.refresh();
		this.syncingScroll = false;
	}

	private renderToolbar(): void {
		this.toolbarEl.replaceChildren();
		const today = this.toolbarEl.createEl('button', { text: 'Today' });
		today.type = 'button';
		today.dataset.action = 'today';
		for (const zoom of Object.keys(TIMELINE_ZOOM_SPECS) as TimelineZoom[]) {
			const button = this.toolbarEl.createEl('button', { text: TIMELINE_ZOOM_SPECS[zoom].label });
			button.type = 'button';
			button.dataset.action = 'zoom';
			button.dataset.zoom = zoom;
			button.setAttribute('aria-pressed', String(zoom === this.activeZoom));
		}
	}

	private renderHeader(layout: TimelineLayout, zoom: TimelineZoom): void {
		this.headerEl.replaceChildren();
		this.headerEl.style.setProperty('--wise-view-timeline-width', `${layout.width}px`);
		for (const tick of generateTimelineTicks(layout.domain, zoom)) {
			const tickEl = this.headerEl.createDiv({ cls: 'wise-view-timeline__tick', text: tickLabel(tick.day, zoom) });
			tickEl.style.setProperty('--wise-view-timeline-left', `${dateToPixel(tick.day.dayIndex, layout.domain, zoom)}px`);
		}
	}

	private renderToday(layout: TimelineLayout): void {
		this.containerEl.querySelectorAll('.wise-view-timeline__today, .wise-view-timeline__edge').forEach(el => el.remove());
		if (layout.todayEdge === 'inside') {
			const marker = this.headerEl.createDiv({ cls: 'wise-view-timeline__today' });
			marker.setAttribute('aria-label', 'Today');
			marker.style.setProperty('--wise-view-timeline-left', `${layout.todayLeft}px`);
		} else {
			const edge = this.containerEl.createDiv({ cls: `wise-view-timeline__edge wise-view-timeline__edge--${layout.todayEdge}` });
			edge.dataset.edge = layout.todayEdge;
			edge.setText(layout.todayEdge === 'before' ? 'Today is earlier' : 'Today is later');
		}
	}

	private renderSidebarRow(row: TimelineVirtualRow): VirtualRowHandle {
		const element = this.containerEl.ownerDocument.createElement('div');
		const handle = { element, dispose() {} };
		this.updateSidebarRow(handle, row);
		return handle;
	}

	private updateSidebarRow(handle: VirtualRowHandle, row: TimelineVirtualRow): void {
		handle.element.replaceChildren();
		handle.element.className = `wise-view-timeline__sidebar-row wise-view-timeline__sidebar-row--${row.kind}`;
		if (row.kind === 'group') {
			const button = handle.element.createEl('button', { text: `${row.label} (${row.count})` });
			button.type = 'button';
			button.dataset.action = 'toggle-group';
			button.dataset.groupKey = row.groupKey;
			button.setAttribute('aria-expanded', String(!this.collapsedGroups.has(row.groupKey)));
		} else {
			const button = handle.element.createEl('button', { text: row.item.title });
			button.type = 'button';
			button.dataset.notePath = row.item.path;
		}
	}

	private renderTimelineRow(row: TimelineVirtualRow): VirtualRowHandle {
		const element = this.containerEl.ownerDocument.createElement('div');
		const handle = { element, dispose() {} };
		this.updateTimelineRow(handle, row);
		return handle;
	}

	private updateTimelineRow(handle: VirtualRowHandle, row: TimelineVirtualRow): void {
		handle.element.replaceChildren();
		handle.element.className = `wise-view-timeline__row wise-view-timeline__row--${row.kind}`;
		handle.element.style.setProperty('--wise-view-timeline-width', `${this.currentLayout?.width ?? 0}px`);
		if (row.kind === 'group') {
			handle.element.createSpan({ cls: 'wise-view-timeline__group-label', text: row.label });
			return;
		}
		const bar = this.bars.get(row.item.path);
		if (!bar) {
			const unscheduled = handle.element.createEl('button', { cls: 'wise-view-timeline__unscheduled', text: 'Unscheduled' });
			unscheduled.type = 'button';
			unscheduled.dataset.notePath = row.item.path;
			return;
		}
		const barEl = handle.element.createEl('button', { cls: 'wise-view-timeline__bar', text: row.item.title });
		barEl.type = 'button';
		barEl.dataset.notePath = row.item.path;
		barEl.dataset.colorValue = row.item.colorValue ?? '';
		if (row.item.colorValue) {
			for (const [name, value] of Object.entries(toCssVariables(resolveColor({ categoryValue: row.item.colorValue })))) {
				barEl.style.setProperty(name, value);
			}
		}
		barEl.style.setProperty('--wise-view-timeline-left', `${bar.left}px`);
		barEl.style.setProperty('--wise-view-timeline-bar-width', `${bar.width}px`);
	}
}
