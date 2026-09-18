// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import { calculateTimeDomain, rangeToDayBounds, todayPosition, type TimeDomain } from '../../core/temporal/TimeDomain';
import { dateToPixel, generateTimelineTicks, TIMELINE_ZOOM_SPECS, type TimelineZoom } from '../../core/temporal/TimelineScale';
import type { DateOnlyValue } from '../../core/temporal/TemporalValue';
import type { TimelineItem, TimelineModel } from './TimelineModel';

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
	constructor(private readonly containerEl: HTMLElement) {}

	render(model: TimelineModel, today: DateOnlyValue, zoom: TimelineZoom): TimelineLayout {
		this.containerEl.replaceChildren();
		this.containerEl.classList.add('wise-view-timeline');
		const layout = createTimelineLayout(model, today, zoom);
		const scroller = this.containerEl.createDiv({ cls: 'wise-view-timeline__scroller' });
		const surface = scroller.createDiv({ cls: 'wise-view-timeline__surface' });
		surface.style.setProperty('--wise-view-timeline-width', `${layout.width}px`);

		const header = surface.createDiv({ cls: 'wise-view-timeline__header' });
		for (const tick of generateTimelineTicks(layout.domain, zoom)) {
			const tickEl = header.createDiv({ cls: 'wise-view-timeline__tick', text: tickLabel(tick.day, zoom) });
			tickEl.style.setProperty('--wise-view-timeline-left', `${dateToPixel(tick.day.dayIndex, layout.domain, zoom)}px`);
		}

		const rows = surface.createDiv({ cls: 'wise-view-timeline__rows' });
		const bars = new Map(layout.bars.map(bar => [bar.item.path, bar]));
		for (const group of model.groups) {
			const groupEl = rows.createDiv({ cls: 'wise-view-timeline__group' });
			groupEl.createDiv({ cls: 'wise-view-timeline__group-label', text: group.key });
			for (const item of group.items) {
				const bar = bars.get(item.path);
				if (!bar) continue;
				const row = groupEl.createDiv({ cls: 'wise-view-timeline__row' });
				row.dataset.path = item.path;
				const barEl = row.createEl('button', { cls: 'wise-view-timeline__bar', text: item.title });
				barEl.type = 'button';
				barEl.dataset.path = item.path;
				barEl.dataset.colorValue = item.colorValue ?? '';
				barEl.style.setProperty('--wise-view-timeline-left', `${bar.left}px`);
				barEl.style.setProperty('--wise-view-timeline-bar-width', `${bar.width}px`);
			}
		}

		if (layout.todayEdge === 'inside') {
			const marker = surface.createDiv({ cls: 'wise-view-timeline__today' });
			marker.setAttribute('aria-label', 'Today');
			marker.style.setProperty('--wise-view-timeline-left', `${layout.todayLeft}px`);
		} else {
			const edge = this.containerEl.createDiv({ cls: `wise-view-timeline__edge wise-view-timeline__edge--${layout.todayEdge}` });
			edge.dataset.edge = layout.todayEdge;
			edge.setText(layout.todayEdge === 'before' ? 'Today is earlier' : 'Today is later');
		}

		if (model.groups.length === 0) {
			this.containerEl.createDiv({
				cls: 'wise-view-timeline__empty',
				text: model.unscheduled.length > 0
					? 'No notes with valid configured dates.'
					: 'Configure a start date property to display the timeline.',
			});
		}
		return layout;
	}
}
