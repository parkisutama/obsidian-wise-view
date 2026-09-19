// SPDX-License-Identifier: GPL-3.0-only AND MIT
// Portions adapted from obsidian-project-manager (https://github.com/mmattia09/obsidian-project-manager): src/timeline-view.ts
// Copyright (c) 2026 mmattia09. MIT License, see THIRD_PARTY_NOTICES.md
// Modifications Copyright (C) 2026 Parkis Utama

import { calculateTimeDomain, rangeToDayBounds, todayPosition, type TimeDomain } from '../../core/temporal/TimeDomain';
import { dateToPixel, TIMELINE_ZOOM_SPECS, type TimelineZoom } from '../../core/temporal/TimelineScale';
import { dateOnlyFromDayIndex, type DateOnlyValue } from '../../core/temporal/TemporalValue';
import { VirtualLinearCollection, type VirtualRowHandle } from '../../platform/dom/VirtualLinearCollection';
import { resolveColor, toCssVariables } from '../../platform/colors/ColorResolver';
import { flattenTimelineRows, type TimelineItem, type TimelineModel, type TimelineVirtualRow } from './TimelineModel';

const ZOOM_ORDER: readonly TimelineZoom[] = ['fiveyear', 'year', 'quarter', 'month', 'biweek', 'week', 'day'];
const DEFAULT_SPAN: Readonly<Record<TimelineZoom, number>> = {
	day: 1,
	week: 3,
	biweek: 5,
	month: 7,
	quarter: 14,
	year: 30,
	fiveyear: 90,
};

function touchDistance(event: TouchEvent): number {
	const first = event.touches[0];
	const second = event.touches[1];
	return first && second ? Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY) : 0;
}

export interface TimelineRendererActions {
	onQuickSchedule?(path: string, startDay: number, endDay: number): void;
	onZoomChange?(zoom: TimelineZoom): void;
}

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
export function createTimelineLayout(model: TimelineModel, today: DateOnlyValue, zoom: TimelineZoom, viewportWidth = 500): TimelineLayout {
	const scheduled = model.groups.flatMap(group => group.items).filter(item => item.range != null);
	const bounds = scheduled.map(item => rangeToDayBounds(item.range!));
	const pixelsPerDay = TIMELINE_ZOOM_SPECS[zoom].pixelsPerDay;
	const paddingDays = Math.max(14, Math.ceil(Math.max(1, viewportWidth) / pixelsPerDay));
	const rawDomain = calculateTimeDomain(bounds, { today, paddingDays, minimumSpanDays: paddingDays * 2, includeToday: true });
	const weekday = new Date(rawDomain.startDay * 86_400_000).getUTCDay();
	const domain = {
		...rawDomain,
		startDay: rawDomain.startDay - ((weekday + 6) % 7),
	};
	domain.spanDays = domain.endDay - domain.startDay;
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

export class TimelineRenderer {
	private readonly toolbarEl: HTMLElement;
	private readonly sidebarPanel: HTMLElement;
	private readonly expandControls: HTMLElement;
	private readonly emptyEl: HTMLElement;
	private readonly sidebarViewport: HTMLElement;
	private readonly timelineViewport: HTMLElement;
	private readonly headerEl: HTMLElement;
	private readonly headerCanvas: HTMLElement;
	private readonly gridEl: HTMLElement;
	private readonly sidebarRows: VirtualLinearCollection<TimelineVirtualRow>;
	private readonly timelineRows: VirtualLinearCollection<TimelineVirtualRow>;
	private readonly collapsedGroups = new Set<string>();
	private currentModel: TimelineModel | null = null;
	private currentToday: DateOnlyValue | null = null;
	private activeZoom: TimelineZoom | null = null;
	private currentLayout: TimelineLayout | null = null;
	private bars = new Map<string, TimelineBarLayout>();
	private syncingScroll = false;
	private sidebarCollapsed = false;
	private pinchAccum = 0;
	private pinchDistance: number | null = null;
	private quickScheduleGhost: HTMLElement | null = null;
	private quickScheduleStart = 0;
	private quickScheduleEnd = 0;
	private readonly syncFromSidebar = (): void => this.syncScroll(this.sidebarViewport, this.timelineViewport);
	private readonly syncFromTimeline = (): void => {
		this.syncScroll(this.timelineViewport, this.sidebarViewport);
		this.syncHorizontalHeader();
	};
	private readonly handleWheel = (event: WheelEvent): void => {
		if (!event.ctrlKey && !event.metaKey) return;
		event.preventDefault();
		if (this.pinchAccum !== 0 && Math.sign(event.deltaY) !== Math.sign(this.pinchAccum)) this.pinchAccum = 0;
		this.pinchAccum += event.deltaY;
		if (Math.abs(this.pinchAccum) < 24) return;
		const direction = this.pinchAccum < 0 ? 1 : -1;
		this.pinchAccum = 0;
		this.stepZoom(direction, event.clientX);
	};
	private readonly handlePointerMove = (event: PointerEvent): void => this.previewQuickSchedule(event);
	private readonly handlePointerLeave = (): void => this.clearQuickSchedule();
	private readonly handleTouchStart = (event: TouchEvent): void => {
		this.pinchDistance = event.touches.length === 2 ? touchDistance(event) : null;
	};
	private readonly handleTouchMove = (event: TouchEvent): void => {
		if (event.touches.length !== 2 || this.pinchDistance === null) return;
		event.preventDefault();
		const distance = touchDistance(event);
		const ratio = distance / this.pinchDistance;
		if (ratio <= 1.35 && ratio >= 0.75) return;
		this.pinchDistance = distance;
		const first = event.touches[0];
		const second = event.touches[1];
		if (first && second) this.stepZoom(ratio > 1 ? 1 : -1, (first.clientX + second.clientX) / 2);
	};
	private readonly handleTouchEnd = (): void => { this.pinchDistance = null; };
	private readonly handleQuickScheduleClick = (event: MouseEvent): void => {
		const ghost = event.target instanceof Element ? event.target.closest<HTMLElement>('.wise-view-timeline__ghost') : null;
		const path = ghost?.dataset.notePath;
		if (!path || !this.quickScheduleGhost) return;
		event.preventDefault();
		event.stopPropagation();
		this.actions.onQuickSchedule?.(path, this.quickScheduleStart, this.quickScheduleEnd);
	};

	constructor(private readonly containerEl: HTMLElement, private readonly actions: TimelineRendererActions = {}) {
		containerEl.classList.add('wise-view-timeline');
		const main = containerEl.createDiv({ cls: 'wise-view-timeline__main' });
		this.sidebarPanel = main.createDiv({ cls: 'wise-view-timeline__sidebar-panel' });
		this.toolbarEl = this.sidebarPanel.createDiv({ cls: 'wise-view-timeline__toolbar' });
		this.sidebarViewport = this.sidebarPanel.createDiv({ cls: 'wise-view-timeline__sidebar' });
		const chart = main.createDiv({ cls: 'wise-view-timeline__chart' });
		this.headerEl = chart.createDiv({ cls: 'wise-view-timeline__header' });
		this.headerCanvas = this.headerEl.createDiv({ cls: 'wise-view-timeline__header-canvas' });
		this.timelineViewport = chart.createDiv({ cls: 'wise-view-timeline__scroller' });
		this.gridEl = this.timelineViewport.createDiv({ cls: 'wise-view-timeline__grid' });
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
		this.timelineViewport.addEventListener('wheel', this.handleWheel, { passive: false });
		this.timelineViewport.addEventListener('pointermove', this.handlePointerMove, { passive: true });
		this.timelineViewport.addEventListener('pointerleave', this.handlePointerLeave, { passive: true });
		this.timelineViewport.addEventListener('click', this.handleQuickScheduleClick);
		this.timelineViewport.addEventListener('touchstart', this.handleTouchStart, { passive: true });
		this.timelineViewport.addEventListener('touchmove', this.handleTouchMove, { passive: false });
		this.timelineViewport.addEventListener('touchend', this.handleTouchEnd, { passive: true });
		this.expandControls = containerEl.createDiv({ cls: 'wise-view-timeline__expand-controls' });
		this.emptyEl = containerEl.createDiv({ cls: 'wise-view-timeline__empty' });
	}

	render(model: TimelineModel, today: DateOnlyValue, zoom: TimelineZoom): TimelineLayout {
		this.currentModel = model;
		this.currentToday = today;
		this.activeZoom ??= zoom;
		const layout = createTimelineLayout(model, today, this.activeZoom, this.timelineViewport.clientWidth || 500);
		this.currentLayout = layout;
		this.bars = new Map(layout.bars.map(bar => [bar.item.path, bar]));
		this.renderToolbar();
		this.renderHeader(layout, this.activeZoom);
		const rows = flattenTimelineRows(model, this.collapsedGroups);
		this.sidebarRows.updateItems(rows);
		this.timelineRows.updateItems(rows);
		this.renderGrid(layout, this.activeZoom);
		this.renderToday(layout);
		this.renderEmptyState(model, rows.length);
		return layout;
	}

	setZoom(zoom: TimelineZoom): void {
		if (this.activeZoom === zoom || !this.currentModel || !this.currentToday) return;
		this.activeZoom = zoom;
		this.render(this.currentModel, this.currentToday, zoom);
		this.actions.onZoomChange?.(zoom);
	}

	toggleGroup(groupKey: string): void {
		if (!this.currentModel || !this.currentToday || !this.activeZoom) return;
		if (this.collapsedGroups.has(groupKey)) this.collapsedGroups.delete(groupKey);
		else this.collapsedGroups.add(groupKey);
		this.render(this.currentModel, this.currentToday, this.activeZoom);
	}

	toggleSidebar(): void {
		this.sidebarCollapsed = !this.sidebarCollapsed;
		this.containerEl.classList.toggle('wise-view-timeline--sidebar-collapsed', this.sidebarCollapsed);
		this.renderToolbar();
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
		this.timelineViewport.removeEventListener('wheel', this.handleWheel);
		this.timelineViewport.removeEventListener('pointermove', this.handlePointerMove);
		this.timelineViewport.removeEventListener('pointerleave', this.handlePointerLeave);
		this.timelineViewport.removeEventListener('click', this.handleQuickScheduleClick);
		this.timelineViewport.removeEventListener('touchstart', this.handleTouchStart);
		this.timelineViewport.removeEventListener('touchmove', this.handleTouchMove);
		this.timelineViewport.removeEventListener('touchend', this.handleTouchEnd);
		this.clearQuickSchedule();
		this.sidebarRows.destroy();
		this.timelineRows.destroy();
	}

	private stepZoom(direction: 1 | -1, clientX: number): void {
		if (!this.activeZoom || !this.currentLayout || !this.currentModel || !this.currentToday) return;
		const current = ZOOM_ORDER.indexOf(this.activeZoom);
		const next = Math.min(Math.max(current + direction, 0), ZOOM_ORDER.length - 1);
		if (next === current) return;
		const rect = this.timelineViewport.getBoundingClientRect();
		const offsetX = Math.max(0, clientX - rect.left);
		const oldPixels = TIMELINE_ZOOM_SPECS[this.activeZoom].pixelsPerDay;
		const dayUnderPointer = this.currentLayout.domain.startDay + (this.timelineViewport.scrollLeft + offsetX) / oldPixels;
		const nextZoom = ZOOM_ORDER[next]!;
		this.activeZoom = nextZoom;
		this.render(this.currentModel, this.currentToday, nextZoom);
		this.timelineViewport.scrollLeft = Math.max(0, (dayUnderPointer - this.currentLayout.domain.startDay)
			* TIMELINE_ZOOM_SPECS[nextZoom].pixelsPerDay - offsetX);
		this.syncHorizontalHeader();
		this.actions.onZoomChange?.(nextZoom);
	}

	private previewQuickSchedule(event: PointerEvent): void {
		if (!this.currentLayout || !this.activeZoom) return;
		const row = event.target instanceof Element
			? event.target.closest<HTMLElement>('.wise-view-timeline__row--unscheduled[data-note-path]')
			: null;
		const path = row?.dataset.notePath;
		if (!row || !path) {
			this.clearQuickSchedule();
			return;
		}
		const rect = this.timelineViewport.getBoundingClientRect();
		const contentX = this.timelineViewport.scrollLeft + event.clientX - rect.left;
		this.quickScheduleStart = this.currentLayout.domain.startDay
			+ Math.floor(contentX / TIMELINE_ZOOM_SPECS[this.activeZoom].pixelsPerDay);
		this.quickScheduleEnd = this.quickScheduleStart + DEFAULT_SPAN[this.activeZoom] - 1;
		if (!this.quickScheduleGhost || this.quickScheduleGhost.parentElement !== row) {
			this.clearQuickSchedule();
			this.quickScheduleGhost = row.createEl('button', { cls: 'wise-view-timeline__ghost', attr: { type: 'button' } });
			this.quickScheduleGhost.dataset.notePath = path;
		}
		const item = this.currentModel?.itemsByPath.get(path);
		this.quickScheduleGhost.setText(item?.title ?? path);
		this.quickScheduleGhost.title = `${dateOnlyFromDayIndex(this.quickScheduleStart).iso} – ${dateOnlyFromDayIndex(this.quickScheduleEnd).iso}`;
		this.quickScheduleGhost.style.setProperty('--wise-view-timeline-left', `${dateToPixel(this.quickScheduleStart, this.currentLayout.domain, this.activeZoom)}px`);
		this.quickScheduleGhost.style.setProperty('--wise-view-timeline-bar-width', `${Math.max(8, DEFAULT_SPAN[this.activeZoom]
			* TIMELINE_ZOOM_SPECS[this.activeZoom].pixelsPerDay - 2)}px`);
	}

	private clearQuickSchedule(): void {
		this.quickScheduleGhost?.remove();
		this.quickScheduleGhost = null;
	}

	private syncScroll(source: HTMLElement, destination: HTMLElement): void {
		if (this.syncingScroll || destination.scrollTop === source.scrollTop) return;
		this.syncingScroll = true;
		destination.scrollTop = source.scrollTop;
		this.sidebarRows.refresh();
		this.timelineRows.refresh();
		this.syncingScroll = false;
	}

	private syncHorizontalHeader(): void {
		this.headerCanvas.style.transform = `translateX(${-this.timelineViewport.scrollLeft}px)`;
	}

	private renderToolbar(): void {
		this.toolbarEl.replaceChildren();
		this.expandControls.replaceChildren();
		this.renderControlSet(this.sidebarCollapsed ? this.expandControls : this.toolbarEl, this.sidebarCollapsed);
	}

	private renderControlSet(host: HTMLElement, expanding: boolean): void {
		if (expanding) {
			const expand = host.createEl('button', { text: '»' });
			expand.type = 'button';
			expand.dataset.action = 'toggle-sidebar';
			expand.setAttribute('aria-label', 'Show timeline sidebar');
		}
		const today = host.createEl('button', { text: 'Today' });
		today.type = 'button';
		today.dataset.action = 'today';
		const select = host.createEl('select', { cls: 'wise-view-timeline__zoom' });
		select.dataset.action = 'zoom';
		select.setAttribute('aria-label', 'Timeline zoom');
		for (const zoom of Object.keys(TIMELINE_ZOOM_SPECS) as TimelineZoom[]) {
			const option = select.createEl('option', { text: TIMELINE_ZOOM_SPECS[zoom].label });
			option.value = zoom;
			option.selected = zoom === this.activeZoom;
		}
		if (!expanding) {
			const collapse = host.createEl('button', { text: '«' });
			collapse.type = 'button';
			collapse.dataset.action = 'toggle-sidebar';
			collapse.setAttribute('aria-label', 'Hide timeline sidebar');
		}
	}

	private renderHeader(layout: TimelineLayout, zoom: TimelineZoom): void {
		this.headerCanvas.replaceChildren();
		this.headerCanvas.style.setProperty('--wise-view-timeline-width', `${layout.width}px`);
		const periods = this.headerCanvas.createDiv({ cls: 'wise-view-timeline__periods' });
		const ticks = this.headerCanvas.createDiv({ cls: 'wise-view-timeline__ticks' });
		const useYears = zoom === 'quarter' || zoom === 'year' || zoom === 'fiveyear';
		for (let day = layout.domain.startDay; day < layout.domain.endDay;) {
			const current = dateOnlyFromDayIndex(day);
			const start = useYears
				? Math.floor(Date.UTC(current.year, 0, 1) / 86_400_000)
				: Math.floor(Date.UTC(current.year, current.month - 1, 1) / 86_400_000);
			const next = useYears
				? Math.floor(Date.UTC(current.year + 1, 0, 1) / 86_400_000)
				: Math.floor(Date.UTC(current.year, current.month, 1) / 86_400_000);
			const from = Math.max(start, layout.domain.startDay);
			const to = Math.min(next, layout.domain.endDay);
			const block = periods.createDiv({
				cls: 'wise-view-timeline__period',
				text: useYears ? String(current.year) : new Date(day * 86_400_000).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' }),
			});
			block.style.setProperty('--wise-view-timeline-left', `${dateToPixel(from, layout.domain, zoom)}px`);
			block.style.setProperty('--wise-view-timeline-period-width', `${dateToPixel(to, layout.domain, zoom) - dateToPixel(from, layout.domain, zoom)}px`);
			day = next;
		}
		for (let day = layout.domain.startDay; day < layout.domain.endDay; day++) {
			const date = new Date(day * 86_400_000);
			const weekday = date.getUTCDay();
			const show = zoom === 'day' || zoom === 'week' || zoom === 'biweek'
				|| (zoom === 'month' && weekday === 1)
				|| (zoom === 'quarter' && date.getUTCDate() === 1)
				|| ((zoom === 'year' || zoom === 'fiveyear') && date.getUTCDate() === 1 && date.getUTCMonth() % 3 === 0);
			if (!show) continue;
			const label = zoom === 'day' || zoom === 'week' || zoom === 'biweek' || zoom === 'month'
				? String(date.getUTCDate())
				: date.toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' });
			const tickEl = ticks.createDiv({ cls: 'wise-view-timeline__tick', text: label });
			tickEl.style.setProperty('--wise-view-timeline-left', `${dateToPixel(day, layout.domain, zoom)}px`);
			if (zoom === 'day' || zoom === 'week' || zoom === 'biweek') {
				tickEl.style.setProperty('--wise-view-timeline-tick-width', `${TIMELINE_ZOOM_SPECS[zoom].pixelsPerDay}px`);
				if (weekday === 0 || weekday === 6) tickEl.classList.add('wise-view-timeline__tick--weekend');
			}
		}
		this.syncHorizontalHeader();
	}

	private renderGrid(layout: TimelineLayout, zoom: TimelineZoom): void {
		this.gridEl.replaceChildren();
		this.gridEl.style.setProperty('--wise-view-timeline-width', `${layout.width}px`);
		this.gridEl.style.height = `${Math.max(this.timelineRows.currentRange.totalHeight, this.timelineViewport.clientHeight)}px`;
		const pixelsPerDay = TIMELINE_ZOOM_SPECS[zoom].pixelsPerDay;
		for (let day = layout.domain.startDay; day < layout.domain.endDay; day++) {
			const date = new Date(day * 86_400_000);
			const weekday = date.getUTCDay();
			if (pixelsPerDay >= 10 && weekday === 6) {
				const weekend = this.gridEl.createDiv({ cls: 'wise-view-timeline__weekend' });
				weekend.style.setProperty('--wise-view-timeline-left', `${dateToPixel(day, layout.domain, zoom)}px`);
				weekend.style.setProperty('--wise-view-timeline-weekend-width', `${pixelsPerDay * 2}px`);
			}
			const lineHere = zoom === 'day' || zoom === 'week' || zoom === 'biweek' || zoom === 'month'
				? weekday === 1
				: zoom === 'quarter'
					? date.getUTCDate() === 1
					: date.getUTCDate() === 1 && date.getUTCMonth() % 3 === 0;
			if (lineHere) {
				const line = this.gridEl.createDiv({ cls: 'wise-view-timeline__gridline' });
				line.style.setProperty('--wise-view-timeline-left', `${dateToPixel(day, layout.domain, zoom)}px`);
			}
		}
	}

	private renderToday(layout: TimelineLayout): void {
		this.containerEl.querySelectorAll('.wise-view-timeline__today, .wise-view-timeline__today-line, .wise-view-timeline__edge').forEach(el => el.remove());
		if (layout.todayEdge === 'inside') {
			const ticks = this.headerCanvas.querySelector<HTMLElement>('.wise-view-timeline__ticks') ?? this.headerCanvas;
			const marker = ticks.createDiv({ cls: 'wise-view-timeline__today', text: String(this.currentToday?.day ?? '') });
			marker.setAttribute('aria-label', 'Today');
			marker.style.setProperty('--wise-view-timeline-left', `${layout.todayLeft}px`);
			const line = this.gridEl.createDiv({ cls: 'wise-view-timeline__today-line' });
			line.style.setProperty('--wise-view-timeline-left', `${layout.todayLeft}px`);
		} else {
			const edge = this.containerEl.createDiv({ cls: `wise-view-timeline__edge wise-view-timeline__edge--${layout.todayEdge}` });
			edge.dataset.edge = layout.todayEdge;
			edge.setText(layout.todayEdge === 'before' ? 'Today is earlier' : 'Today is later');
		}
	}

	private renderEmptyState(model: TimelineModel, rowCount: number): void {
		this.emptyEl.replaceChildren();
		if (!model.startConfigured) {
			this.emptyEl.setText('Configure a start date property in the view options to display the timeline.');
			this.emptyEl.hidden = false;
			return;
		}
		if (rowCount === 0) {
			this.emptyEl.setText('No notes to display.');
			this.emptyEl.hidden = false;
			return;
		}
		this.emptyEl.hidden = true;
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
			if (row.item.unscheduledReason) button.title = `Unscheduled: ${row.item.unscheduledReason}`;
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
			handle.element.classList.add('wise-view-timeline__row--unscheduled');
			handle.element.dataset.notePath = row.item.path;
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
