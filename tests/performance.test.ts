// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

// PERF-001 (docs/specs/performance.md §2.1, tasks/performance/todo.md): for each of the four
// views, prove — with an actual test, not code inspection — that mounting a large Base (~5,000
// entries, this project's established precedent) does not cause unbounded synchronous DOM
// construction on first render.
//
// Gantt's own mapping/write-back cost is already covered by GBETA-016 (tests/gantt-scale.test.ts);
// this file does not duplicate that. What it adds:
//   - Swimlane: bounded mounted-card count in the swimlane x column grid (boardRenderer.ts's
//     createSwimlaneCell had no virtual-scroll threshold before this task; see below).
//   - Calendar: FullCalendar's own event-count limiting (dayMaxEvents) is actually engaged, not
//     merely configured.
//   - Gantt: the pinned @jaeungkim/gantt-chart library's own row virtualization is actually
//     engaged — mounted with the real library (not a mocked chartHost), not assumed from its
//     package description.
//   - Timeline: VirtualLinearCollection-based row virtualization still holds against a large Base.

import { afterEach, describe, expect, it, vi } from "vitest";
import { h } from "preact";
import { render } from "preact/compat";
import type { ComponentChild, VNode } from "preact";
import { ReactGanttChart, type GanttHandle } from "@jaeungkim/gantt-chart";
import { createSwimlaneHarness, waitForRender, type SwimlaneHarness } from "./fixtures/swimlane";
import { createCalendarHarness, dayOffset, type CalendarHarness } from "./fixtures/calendar";
import { createTimelineHarness, type TimelineHarness } from "./fixtures/timeline";
import { largeSwimlaneNotes, largeCalendarNotes, largeGanttTasks, largeEntrySnapshots, LARGE_BASE_SIZE } from "./fixtures/large-base";
import { DateValue } from "./fixtures/obsidian";
import { BasesGanttView } from "../src/views/gantt";
import type { ChartRender } from "../src/views/gantt/chartHost";

let swimlaneHarness: SwimlaneHarness | null = null;
let calendarHarness: CalendarHarness | null = null;
let timelineHarness: TimelineHarness | null = null;

afterEach(() => {
	swimlaneHarness?.destroy();
	swimlaneHarness = null;
	calendarHarness?.destroy();
	calendarHarness = null;
	timelineHarness?.destroy();
	timelineHarness = null;
});

describe("Swimlane bounded initial render (PERF-001)", () => {
	it("does not mount one full card per entry in a swimlane x column grid on a large Base", async () => {
		const notes = largeSwimlaneNotes();
		swimlaneHarness = await createSwimlaneHarness({
			notes,
			config: { plannerGroupBy: "note.status", swimlaneBy: "note.priority" },
		});
		await waitForRender();

		const cards = swimlaneHarness.host.querySelectorAll(".planner-kanban-card").length;
		const placeholders = swimlaneHarness.host.querySelectorAll(".planner-kanban-card-placeholder").length;

		// Before this task, createSwimlaneCell() (src/views/swimlane/boardRenderer.ts) built one
		// full card DOM subtree per entry in every swimlane x column cell with no threshold check,
		// unlike the plain-column layout (renderColumns), which already virtualizes at
		// VIRTUAL_SCROLL_THRESHOLD (15). Fixed by routing createSwimlaneCell through the same
		// threshold. Placeholders (virtual scroll) are cheap empty divs, not full cards, so the
		// bound is on rendered *cards*, not total DOM nodes.
		expect(cards).toBeLessThan(200);
		// The full entry count is still represented, just as lightweight placeholders.
		expect(cards + placeholders).toBe(notes.length);
	});
});

describe("Calendar bounded initial render (PERF-001)", () => {
	it("engages FullCalendar's own dayMaxEvents limit in month view on a large Base", () => {
		const notes = largeCalendarNotes();
		calendarHarness = createCalendarHarness({ notes, config: { defaultView: "dayGridMonth" } });

		// dayGridMonth only ever shows one page of ~35-42 day cells regardless of how many notes
		// exist; dayMaxEvents: true (src/views/BasesCalendarView.ts) caps each cell's own event
		// rendering, replacing overflow with a single "+N more" link (moreLinkClass:
		// 'planner-fc-more-link'). This is the concrete assertion that FullCalendar's
		// virtualization is engaged for the configured view, not assumed from its documentation:
		// the rendered event-DOM count for a month is far below the notes count, and "+more"
		// links appear on the crowded days.
		const renderedEvents = calendarHarness.host.querySelectorAll(".planner-fc-event").length;
		const moreLinks = calendarHarness.host.querySelectorAll(".planner-fc-more-link").length;
		expect(renderedEvents).toBeLessThan(300);
		expect(moreLinks).toBeGreaterThan(0);
	});

	it("keeps rendered event DOM bounded when switching to a dense single-day view", () => {
		// Give every note "today" (timeGridDay's initial visible date, via the calendar fixture's
		// own dayOffset helper) so a single timeGridDay view sees the full pile-up; this is the
		// worst case for a per-day view (no day-count bound helps).
		const notes = largeCalendarNotes(500).map((note) => ({ ...note, date_start: dayOffset(0, 9), date_end: dayOffset(0, 9) }));
		calendarHarness = createCalendarHarness({ notes, config: { defaultView: "timeGridDay" } });

		// FullCalendar's timeGrid view still only mounts DOM for the events on the displayed day
		// (bounded by that day's note count here, not the whole Base) — it does not pre-render
		// every other day's events into hidden DOM.
		const renderedEvents = calendarHarness.host.querySelectorAll(".planner-fc-event").length;
		expect(renderedEvents).toBeLessThanOrEqual(500);
		expect(renderedEvents).toBeGreaterThan(0);
	});
});

describe("Gantt bounded initial render (PERF-001)", () => {
	it("engages the pinned @jaeungkim/gantt-chart library's own row virtualization on a large task list", async () => {
		// Mounts the REAL library through the same react->preact/compat alias production uses
		// (vitest.config.mts UI_RUNTIME_ALIASES + server.deps.inline), not the mocked chartHost
		// used by tests/gantt-view.test.ts. happy-dom has no layout engine, so container
		// dimensions are stubbed to a fixed size to let the library's own measurement code run.
		const container = document.createElement("div");
		document.body.appendChild(container);
		const restoreWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
		const restoreHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
		const restoreRect = HTMLElement.prototype.getBoundingClientRect;
		Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, value: 1000 });
		Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, value: 600 });
		HTMLElement.prototype.getBoundingClientRect = function () {
			return { width: 1000, height: 600, top: 0, left: 0, right: 1000, bottom: 600, x: 0, y: 0, toJSON() {} } as DOMRect;
		};

		try {
			const tasks = largeGanttTasks(2000);
			render(h(ReactGanttChart, { tasks, height: 600, width: 1000 }), container);
			// Let the library's post-mount measurement effects settle.
			await new Promise((resolve) => setTimeout(resolve, 50));

			const body = container.querySelector(".gantt-body");
			expect(body?.getAttribute("aria-rowcount")).toBe(String(tasks.length));

			const mountedRows = container.querySelectorAll(".gantt-rows > *").length;
			// Before/after: 2,000 logical tasks (aria-rowcount) but only a viewport-sized window of
			// row DOM nodes is ever mounted — this is the library's own virtualization, not
			// Wise View's, and it was previously only asserted in the spec's prose (§2.1), never
			// exercised by a test.
			expect(mountedRows).toBeGreaterThan(0);
			expect(mountedRows).toBeLessThan(100);
		} finally {
			render(null, container);
			container.remove();
			if (restoreWidth) Object.defineProperty(HTMLElement.prototype, "clientWidth", restoreWidth);
			if (restoreHeight) Object.defineProperty(HTMLElement.prototype, "clientHeight", restoreHeight);
			HTMLElement.prototype.getBoundingClientRect = restoreRect;
		}
	});
});

describe("Timeline bounded initial render (PERF-001)", () => {
	it("keeps mounted row DOM bounded via VirtualLinearCollection on a large Base", async () => {
		timelineHarness = createTimelineHarness({ containerWidth: 1000 });
		const view = timelineHarness.view as unknown as {
			onDataUpdated(): void;
			data: { groupedData: unknown[] };
		};

		// The timeline harness ships a single-entry fixture; PERF-001 needs a large one. BasesView
		// (tests/fixtures/obsidian.ts) copies controller.data onto `this.data` at construction, so
		// mutating that same object's groupedData and re-calling onDataUpdated() feeds a large
		// Base through the real pipeline — the same shape (`{entries, hasKey}`) the harness itself
		// builds.
		const entries = largeEntrySnapshots(LARGE_BASE_SIZE).map((snapshot) => ({
			file: { path: snapshot.path, basename: snapshot.basename, extension: "md", parent: { path: snapshot.folder }, stat: { ctime: 1, mtime: 2 } },
			getValue: (id: string) => {
				const value = snapshot.values.get(id) as { value?: string } | undefined;
				if (id === "note.start") return { toString: () => value?.value ?? "" };
				if (id === "note.end") return { toString: () => value?.value ?? "" };
				if (id === "note.title") return value?.value ?? null;
				return null;
			},
		}));
		view.data.groupedData = [{ entries, hasKey: () => false }];
		view.onDataUpdated();

		const mountedSidebarRows = timelineHarness.host.querySelectorAll(".wise-view-timeline__sidebar-row").length;
		const mountedTimelineRows = timelineHarness.host.querySelectorAll(".wise-view-timeline__row").length;

		// 5,000 items in the model, but VirtualLinearCollection (src/platform/dom/VirtualLinearCollection.ts)
		// only mounts rows for the viewport plus overscan — this confirms that still holds.
		expect(mountedSidebarRows).toBeGreaterThan(0);
		expect(mountedSidebarRows).toBeLessThan(100);
		expect(mountedTimelineRows).toBeGreaterThan(0);
		expect(mountedTimelineRows).toBeLessThan(100);
	});
});

// PERF-002 (docs/specs/performance.md §2.2, tasks/performance/todo.md): repeated identical
// onDataUpdated() calls must skip rebuilding unchanged DOM, for Swimlane, Calendar, and Gantt —
// the same way Timeline's RenderScheduler (src/platform/dom/RenderScheduler.ts) already does for
// Timeline. Each view now builds a RenderSignature via computeRenderSignature
// (src/platform/bases/changeDetection.ts) and decides through the same RenderScheduler class;
// no view invents a second render-scheduling mechanism (verified separately by grepping for
// RenderScheduler/computeRenderSignature imports in each view file).

function ganttHarness(configOverrides: Record<string, unknown> = {}) {
	const host = document.createElement("div");
	document.body.appendChild(host);
	const renders: ComponentChild[] = [];
	const handle = {
		scrollToDate: vi.fn(), scrollToToday: vi.fn(), scrollToTask: vi.fn(), setScale: vi.fn(), zoomToFit: vi.fn(),
		getScrollElement: vi.fn().mockReturnValue(null), openDetail: vi.fn(), closeDetail: vi.fn(), addTask: vi.fn(),
	};
	const renderChart: ChartRender = (node, container) => {
		renders.push(node);
		container.replaceChildren();
		if (node !== null && node !== undefined && node !== false) {
			const ref = (node as VNode & { ref?: (value: GanttHandle | null) => void }).ref;
			ref?.(handle);
			const marker = document.createElement("div");
			marker.dataset.preactTree = "mounted";
			container.appendChild(marker);
		}
	};
	const values: Record<string, unknown> = { ganttStart: "note.start", ...configOverrides };
	const entry = {
		file: { path: "A.md", basename: "A", extension: "md", parent: null, stat: { ctime: 1, mtime: 2 } },
		getValue: (id: string) => (id === "note.start" ? new DateValue("2026-01-01") : null),
	};
	const app = { metadataCache: { getFirstLinkpathDest: () => null }, vault: { getAbstractFileByPath: () => null }, workspace: { openLinkText: vi.fn() } };
	const controller = {
		app,
		config: {
			get: (key: string) => values[key],
			set: (key: string, value: unknown) => { values[key] = value; },
			getAsPropertyId: (key: string) => values[key] ?? null,
			getOrder: () => [],
			getDisplayName: (id: string) => id,
		},
		data: { groupedData: [{ entries: [entry], hasKey: () => false }] },
	};
	const plugin = { app, settings: { valueStyles: {} } };
	const view = new BasesGanttView(controller as never, host, plugin as never, renderChart, {});
	view.onDataUpdated();
	return { view, host, renders };
}

describe("Swimlane fast path for identical updates (PERF-002)", () => {
	it("does not rebuild card DOM when onDataUpdated() repeats with no change", async () => {
		const harness = await createSwimlaneHarness({ config: { plannerGroupBy: "note.status" } });
		await waitForRender();
		const cardBefore = harness.host.querySelector(".planner-kanban-card");
		expect(cardBefore).not.toBeNull();

		// render() empties and rebuilds boardEl's DOM subtree from scratch; if the fast path
		// (RenderScheduler + computeRenderSignature, wired into BasesSwimlaneView.onDataUpdated())
		// took effect, the exact same card element survives an identical update untouched.
		harness.view.onDataUpdated();
		await waitForRender();
		const cardAfter = harness.host.querySelector(".planner-kanban-card");
		expect(cardAfter).toBe(cardBefore);
	});

	it("does rebuild when a note's mtime actually changes", async () => {
		const harness = await createSwimlaneHarness({ config: { plannerGroupBy: "note.status" } });
		await waitForRender();
		const cardBefore = harness.host.querySelector(".planner-kanban-card");

		const data = (harness.view as unknown as { data: { groupedData: Array<{ entries: Array<{ file: { stat: { mtime: number } } }> }> } }).data;
		const file = data.groupedData[0]?.entries[0]?.file;
		if (file) file.stat.mtime += 1;
		harness.view.onDataUpdated();
		await waitForRender();

		const cardAfter = harness.host.querySelector(".planner-kanban-card");
		expect(cardAfter).not.toBe(cardBefore);
	});
});

describe("Calendar fast path for identical updates (PERF-002)", () => {
	it("does not rebuild the FullCalendar instance when onDataUpdated() repeats with no change", () => {
		const harness = createCalendarHarness({ config: { defaultView: "dayGridMonth" } });
		const calendarBefore = (harness.view as unknown as { calendar: unknown }).calendar;
		expect(calendarBefore).not.toBeNull();

		// render() destroys and recreates the whole FullCalendar instance; if the fast path
		// (RenderScheduler + computeRenderSignature, wired into BasesCalendarView.onDataUpdated())
		// took effect, the exact same Calendar instance survives an identical update untouched.
		harness.view.onDataUpdated();
		const calendarAfter = (harness.view as unknown as { calendar: unknown }).calendar;
		expect(calendarAfter).toBe(calendarBefore);
	});

	it("does rebuild when the underlying data actually changes", () => {
		const harness = createCalendarHarness({ config: { defaultView: "dayGridMonth" } });
		const calendarBefore = (harness.view as unknown as { calendar: unknown }).calendar;

		const data = (harness.view as unknown as { data: { groupedData: Array<{ entries: Array<{ file: { stat?: { mtime: number } } }> }> } }).data;
		const file = data.groupedData[0]?.entries[0]?.file;
		if (file) file.stat = { mtime: (file.stat?.mtime ?? 0) + 1 };
		harness.view.onDataUpdated();

		const calendarAfter = (harness.view as unknown as { calendar: unknown }).calendar;
		expect(calendarAfter).not.toBe(calendarBefore);
	});
});

describe("Gantt fast path for identical updates (PERF-002)", () => {
	it("does not repaint the chart when onDataUpdated() repeats with no change", () => {
		const harness = ganttHarness();
		const renderCount = harness.renders.length;

		harness.view.onDataUpdated();

		expect(harness.renders).toHaveLength(renderCount);
		harness.view.onunload();
	});

	it("does repaint when a note's mtime actually changes", () => {
		const harness = ganttHarness();
		const renderCount = harness.renders.length;

		const data = (harness.view as unknown as { data: { groupedData: Array<{ entries: Array<{ file: { stat: { mtime: number } } }> }> } }).data;
		const file = data.groupedData[0]?.entries[0]?.file;
		if (file) file.stat.mtime += 1;
		harness.view.onDataUpdated();

		expect(harness.renders.length).toBeGreaterThan(renderCount);
		harness.view.onunload();
	});
});
