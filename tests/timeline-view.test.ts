// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { dateOnlyFromParts } from '../src/core/temporal/TemporalValue';
import { buildTimelineModel } from '../src/views/timeline/TimelineModel';
import { createTimelineLayout, TimelineRenderer } from '../src/views/timeline/TimelineRenderer';
import type { TimelineOptions } from '../src/views/timeline/timelineOptions';
import { createTimelineHarness, date, timelineSnapshot, type TimelineHarness } from './fixtures/timeline';

const options: TimelineOptions = {
	startProperty: 'note.start',
	endProperty: 'note.end',
	titleProperty: null,
	colorProperty: null,
	groupProperty: null,
	zoom: 'month',
};

let harness: TimelineHarness | null = null;
afterEach(() => {
	harness?.destroy();
	harness = null;
});

describe('Timeline renderer', () => {
	it('derives bar geometry from Temporal Core day coordinates', () => {
		const today = dateOnlyFromParts(2026, 1, 2)!;
		const model = buildTimelineModel([
			timelineSnapshot('A.md', { 'note.start': date('2026-01-01'), 'note.end': date('2026-01-03') }),
		], options, today);
		const layout = createTimelineLayout(model, today, 'month');
		expect(layout.bars[0]?.width).toBe(18);
		expect(layout.bars[0]?.left).toBe(42);
	});

	it('renders ticks, grid rows, today marker, and accessible bars', () => {
		const host = document.createElement('div');
		const today = dateOnlyFromParts(2026, 1, 2)!;
		const model = buildTimelineModel([
			timelineSnapshot('A.md', { 'note.start': date('2026-01-01') }),
		], options, today);
		new TimelineRenderer(host).render(model, today, 'day');
		expect(host.querySelector('.wise-view-timeline__period')).not.toBeNull();
		expect(host.querySelector('.wise-view-timeline__tick')).not.toBeNull();
		expect(host.querySelector('.wise-view-timeline__weekend')).not.toBeNull();
		expect(host.querySelector('.wise-view-timeline__gridline')).not.toBeNull();
		expect(host.querySelector('.wise-view-timeline__row')).not.toBeNull();
		expect(host.querySelector('.wise-view-timeline__today')).not.toBeNull();
		expect(host.querySelector('.wise-view-timeline__today-line')).not.toBeNull();
		expect(host.querySelector('button[data-note-path="A.md"]')).not.toBeNull();
	});

	it('keeps the temporal header aligned with horizontal body scroll', () => {
		const host = document.createElement('div');
		const today = dateOnlyFromParts(2026, 1, 2)!;
		const renderer = new TimelineRenderer(host);
		renderer.render(buildTimelineModel([
			timelineSnapshot('A.md', { 'note.start': date('2026-01-01') }),
		], options, today), today, 'day');
		const scroller = host.querySelector<HTMLElement>('.wise-view-timeline__scroller')!;
		scroller.scrollLeft = 125;
		scroller.dispatchEvent(new Event('scroll'));
		expect(host.querySelector<HTMLElement>('.wise-view-timeline__header-canvas')?.style.transform).toBe('translateX(-125px)');
		renderer.dispose();
	});

	it('applies configured category colors through the shared color resolver', () => {
		const host = document.createElement('div');
		const today = dateOnlyFromParts(2026, 1, 2)!;
		const coloredOptions: TimelineOptions = { ...options, colorProperty: 'note.color' };
		const model = buildTimelineModel([
			timelineSnapshot('A.md', { 'note.start': date('2026-01-01'), 'note.color': { kind: 'text', value: 'Research' } }),
		], coloredOptions, today);
		new TimelineRenderer(host).render(model, today, 'day');
		const bar = host.querySelector<HTMLElement>('.wise-view-timeline__bar[data-note-path="A.md"]')!;
		expect(bar.style.getPropertyValue('--wise-view-color-bg')).toMatch(/^#[0-9a-f]{6}$/i);
	});

	it('uses the same virtual row identity and order for sidebar and timeline', () => {
		const host = document.createElement('div');
		const today = dateOnlyFromParts(2026, 1, 2)!;
		const model = buildTimelineModel([
			timelineSnapshot('A.md', { 'note.start': date('2026-01-01') }),
			timelineSnapshot('Missing.md', {}),
		], options, today);
		const renderer = new TimelineRenderer(host);
		const sidebar = host.querySelector<HTMLElement>('.wise-view-timeline__sidebar')!;
		const timeline = host.querySelector<HTMLElement>('.wise-view-timeline__scroller')!;
		Object.defineProperty(sidebar, 'clientHeight', { configurable: true, value: 200 });
		Object.defineProperty(timeline, 'clientHeight', { configurable: true, value: 200 });
		renderer.render(model, today, 'month');
		const paths = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('.wise-view-virtual-linear-content > [data-path]')]
			.map(element => element.dataset.path);
		expect(paths(sidebar)).toEqual(paths(timeline));
		expect(paths(sidebar)).toEqual([
			'wise-view-timeline-group:Ungrouped', 'A.md', 'wise-view-timeline-group:Unscheduled', 'Missing.md',
		]);
		sidebar.scrollTop = 36;
		timeline.scrollTop = 36;
		renderer.setNarrow(true);
		expect(host.classList.contains('wise-view-timeline--narrow')).toBe(true);
		expect([sidebar.scrollTop, timeline.scrollTop]).toEqual([36, 36]);
		renderer.dispose();
	});

	it('keeps both mounted collections bounded for 5,000 scheduled notes', () => {
		const host = document.createElement('div');
		const today = dateOnlyFromParts(2026, 1, 2)!;
		const model = buildTimelineModel(Array.from({ length: 5_000 }, (_, index) =>
			timelineSnapshot(`Notes/${index}.md`, { 'note.start': date('2026-01-01') })
		), options, today);
		const renderer = new TimelineRenderer(host);
		const viewports = host.querySelectorAll<HTMLElement>('.wise-view-timeline__sidebar, .wise-view-timeline__scroller');
		for (const viewport of viewports) {
			Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 360 });
		}
		renderer.render(model, today, 'month');
		for (const viewport of viewports) {
			expect(viewport.querySelectorAll('.wise-view-virtual-linear-content > [data-path]').length).toBeLessThanOrEqual(16);
		}
		expect(host.querySelectorAll('[data-note-path]').length).toBeLessThanOrEqual(30);
		renderer.dispose();
	});
});

describe('Timeline view interactions', () => {
	it('routes click, keyboard activation, hover, and context menu through shared behavior', () => {
		harness = createTimelineHarness();
		const bar = harness.host.querySelector<HTMLElement>('[data-note-path="Notes/Alpha.md"]')!;
		bar.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		bar.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		const context = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
		bar.dispatchEvent(context);
		expect(harness.opened).toEqual(['Notes/Alpha.md', 'Notes/Alpha.md']);
		expect(harness.hovers[0]).toMatchObject({ source: 'wise-view-timeline', linktext: 'Notes/Alpha.md' });
		expect(context.defaultPrevented).toBe(true);
	});

	it('has no pointer gesture that writes dates or properties', () => {
		harness = createTimelineHarness();
		const bar = harness.host.querySelector<HTMLElement>('[data-note-path="Notes/Alpha.md"]')!;
		bar.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		bar.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
		bar.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
		expect(harness.frontmatterWrites).toBe(0);
	});

	it('preserves collapse, zoom, and synchronized scroll across data rerenders and narrow mode', () => {
		harness = createTimelineHarness();
		const sidebar = harness.host.querySelector<HTMLElement>('.wise-view-timeline__sidebar')!;
		const timeline = harness.host.querySelector<HTMLElement>('.wise-view-timeline__scroller')!;
		Object.defineProperty(sidebar, 'clientHeight', { configurable: true, value: 200 });
		Object.defineProperty(timeline, 'clientHeight', { configurable: true, value: 200 });
		harness.view.onDataUpdated();

		harness.host.querySelector<HTMLElement>('[data-action="toggle-group"]')
			?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		const zoom = harness.host.querySelector<HTMLSelectElement>('select[data-action="zoom"]')!;
		zoom.value = 'day';
		zoom.dispatchEvent(new Event('change', { bubbles: true }));
		sidebar.scrollTop = 18;
		sidebar.dispatchEvent(new Event('scroll'));
		expect(timeline.scrollTop).toBe(18);

		harness.view.onDataUpdated();
		expect(harness.host.querySelector('[data-action="toggle-group"]')?.getAttribute('aria-expanded')).toBe('false');
		expect(harness.host.querySelector<HTMLSelectElement>('select[data-action="zoom"]')?.value).toBe('day');
		expect(sidebar.scrollTop).toBe(18);
		expect(timeline.scrollTop).toBe(18);
	});

	it('uses compact zoom controls and preserves sidebar collapse state', () => {
		harness = createTimelineHarness();
		expect(harness.host.querySelectorAll('select[data-action="zoom"]')).toHaveLength(1);
		expect(harness.host.querySelectorAll('[data-action="zoom"][data-zoom]')).toHaveLength(0);
		harness.host.querySelector<HTMLElement>('[aria-label="Hide timeline sidebar"]')
			?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(harness.host.classList.contains('wise-view-timeline--sidebar-collapsed')).toBe(true);
		harness.view.onDataUpdated();
		expect(harness.host.querySelector('[aria-label="Show timeline sidebar"]')).not.toBeNull();
	});

	it('removes delegated listeners and DOM on unload', () => {
		harness = createTimelineHarness();
		const bar = harness.host.querySelector<HTMLElement>('[data-note-path="Notes/Alpha.md"]')!;
		harness.view.onunload();
		bar.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(harness.opened).toEqual([]);
		expect(harness.host.childElementCount).toBe(0);
	});
});
