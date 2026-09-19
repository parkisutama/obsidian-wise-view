import { describe, expect, it } from "vitest";
import {
	DuplicateViewIdError,
	InvalidViewIdError,
	ViewRegistry,
	type ViewDescriptor,
	validateViewDescriptor,
} from "../src/viewRegistry";
import { BASES_CALENDAR_VIEW_ID, createCalendarViewRegistration } from "../src/views/BasesCalendarView";
import { BASES_GANTT_VIEW_ID, createGanttViewRegistration } from "../src/views/BasesGanttView";
import { BASES_SWIMLANE_VIEW_ID, createSwimlaneViewRegistration } from "../src/views/BasesSwimlaneView";
import { BASES_TIMELINE_VIEW_ID, createTimelineViewRegistration, getTimelineViewOptions } from "../src/views/timeline";
import { BASES_GRID_VIEW_ID, createGridViewRegistration, getGridViewOptions } from "../src/views/grid";
import { DEFAULT_SETTINGS } from "../src/types/settings";
import WiseViewPlugin from "../src/main";

const plugin = { app: {}, settings: structuredClone(DEFAULT_SETTINGS) } as unknown as WiseViewPlugin;

function throwIfCalled(): never {
	throw new Error("factory must not be called while building or validating a descriptor");
}

/** A descriptor whose factory would throw if the registry ever instantiated it. */
function describedView(id: string, name: string, icon: string): ViewDescriptor {
	return { id, name, icon, factory: throwIfCalled as never };
}

describe("validateViewDescriptor", () => {
	it("accepts an id under the wise-view- prefix", () => {
		expect(() => validateViewDescriptor(describedView("wise-view-timeline", "Timeline", "clock"))).not.toThrow();
	});

	it("rejects an id without the wise-view- prefix", () => {
		expect(() => validateViewDescriptor(describedView("timeline", "Timeline", "clock"))).toThrow(InvalidViewIdError);
	});
});

describe("ViewRegistry", () => {
	it("registers descriptors without calling their factory", () => {
		const registry = new ViewRegistry();
		expect(() => registry.register(describedView("wise-view-timeline", "Timeline", "clock"))).not.toThrow();
		expect(registry.has("wise-view-timeline")).toBe(true);
	});

	it("fails deterministically on a duplicate id", () => {
		const registry = new ViewRegistry();
		registry.register(describedView("wise-view-timeline", "Timeline", "clock"));
		expect(() => registry.register(describedView("wise-view-timeline", "Timeline 2", "clock"))).toThrow(
			DuplicateViewIdError,
		);
	});

	it("fails deterministically on an invalid id, before storing it", () => {
		const registry = new ViewRegistry();
		expect(() => registry.register(describedView("timeline", "Timeline", "clock"))).toThrow(InvalidViewIdError);
		expect(registry.has("timeline")).toBe(false);
	});

	it("lists descriptors in registration order", () => {
		const registry = new ViewRegistry();
		registry.register(describedView("wise-view-a", "A", "a"));
		registry.register(describedView("wise-view-b", "B", "b"));
		expect(registry.list().map((d) => d.id)).toEqual(["wise-view-a", "wise-view-b"]);
	});

	it("expresses Calendar, Gantt, Swimlane, Timeline, and Grid without view-specific registry branching", () => {
		const registry = new ViewRegistry();
		const calendar = createCalendarViewRegistration(plugin);
		const gantt = createGanttViewRegistration(plugin);
		const swimlane = createSwimlaneViewRegistration(plugin);
		const timeline = createTimelineViewRegistration(plugin);
		const grid = createGridViewRegistration(plugin);

		registry.register({
			id: BASES_CALENDAR_VIEW_ID,
			name: calendar.name,
			icon: calendar.icon,
			factory: calendar.factory,
			options: calendar.options,
			hover: { display: "Calendar", defaultMod: true },
			capabilities: { legacyMutation: true },
		});
		registry.register({
			id: BASES_TIMELINE_VIEW_ID,
			name: timeline.name,
			icon: timeline.icon,
			factory: timeline.factory,
			options: timeline.options,
			hover: { display: "Timeline", defaultMod: true },
			capabilities: { legacyMutation: true },
		});
		registry.register({
			id: BASES_GANTT_VIEW_ID,
			name: gantt.name,
			icon: gantt.icon,
			factory: gantt.factory,
			options: gantt.options,
			hover: { display: "Gantt", defaultMod: true },
			capabilities: { legacyMutation: true },
		});
		registry.register({
			id: BASES_SWIMLANE_VIEW_ID,
			name: swimlane.name,
			icon: swimlane.icon,
			factory: swimlane.factory,
			options: swimlane.options,
			hover: { display: "Swimlane", defaultMod: true },
			capabilities: { legacyMutation: true },
		});
		registry.register({
			id: BASES_GRID_VIEW_ID,
			name: grid.name,
			icon: grid.icon,
			factory: grid.factory,
			options: grid.options,
			hover: { display: "Grid", defaultMod: true },
		});

		expect(registry.list().map((d) => d.id)).toEqual([
			BASES_CALENDAR_VIEW_ID,
			BASES_TIMELINE_VIEW_ID,
			BASES_GANTT_VIEW_ID,
			BASES_SWIMLANE_VIEW_ID,
			BASES_GRID_VIEW_ID,
		]);
		for (const descriptor of registry.list()) {
			expect(descriptor.hover?.display).toBeTruthy();
		}
		expect(registry.get(BASES_TIMELINE_VIEW_ID)?.capabilities?.legacyMutation).toBe(true);
		expect(registry.get(BASES_GRID_VIEW_ID)?.capabilities?.legacyMutation).toBeUndefined();
	});

	it("exposes schema-agnostic Grid property options and never grants it legacy mutation", () => {
		const serialized = JSON.stringify(getGridViewOptions());
		for (const key of ["titleBy", "subtitleBy", "coverBy", "tagsBy", "colorBy", "groupProperty", "minCardWidth", "gap"]) {
			expect(serialized).toContain(`\"key\":\"${key}\"`);
		}
		expect(serialized).not.toContain("status");
		expect(serialized).not.toContain("priority");
	});

	it("never uses a Bases-reserved view-config key for a Grid option either", () => {
		const reserved = new Set(["type", "name", "filters", "groupBy", "order", "summaries"]);
		const keys = JSON.stringify(getGridViewOptions()).match(/"key":"([^"]+)"/g)?.map((m) => m.slice(7, -1)) ?? [];
		expect(keys.length).toBeGreaterThan(0);
		for (const key of keys) expect(reserved.has(key)).toBe(false);
	});

	it("exposes schema-agnostic Timeline property and zoom options", () => {
		const serialized = JSON.stringify(getTimelineViewOptions());
		for (const key of ["start", "end", "titleBy", "colorBy", "groupProperty", "zoom", "wrapTitles"]) {
			expect(serialized).toContain(`\"key\":\"${key}\"`);
		}
		expect(serialized).not.toContain("status");
		expect(serialized).not.toContain("priority");
	});

	it("never uses a Bases-reserved view-config key (type/name/filters/groupBy/order/summaries) for a custom option", () => {
		// Obsidian's own .base file schema reserves these at the top level of a view's config
		// (BasesViewConfigFile). Reusing one for a plugin-defined option makes Obsidian write a
		// value of the wrong shape into that reserved slot and refuse to parse the whole file.
		const reserved = new Set(["type", "name", "filters", "groupBy", "order", "summaries"]);
		const keys = JSON.stringify(getTimelineViewOptions()).match(/"key":"([^"]+)"/g)?.map(m => m.slice(7, -1)) ?? [];
		expect(keys.length).toBeGreaterThan(0);
		for (const key of keys) expect(reserved.has(key)).toBe(false);
	});
});

describe("WiseViewPlugin.onload view registration", () => {
	it("registers each Bases view, hover source, and Gantt command exactly once", async () => {
		const app = { plugins: { plugins: {} } };
		const realPlugin = new WiseViewPlugin(app as never, {} as never);
		const registeredViews: string[] = [];
		const registeredHovers: string[] = [];
		const registeredCommands: string[] = [];

		Object.assign(realPlugin, {
			registerBasesView: (id: string) => {
				registeredViews.push(id);
				return true;
			},
			registerHoverLinkSource: (id: string) => {
				registeredHovers.push(id);
			},
			addCommand: (command: { id: string }) => {
				registeredCommands.push(command.id);
			},
			addSettingTab: () => {},
		});

		await realPlugin.onload();

		// Grid (BASES_GRID_VIEW_ID) is implemented but unregistered as of 2026-09-19 — see
		// src/main.ts's comment and tasks/plan.md's amendment. Intentionally absent below.
		expect(registeredViews).toEqual([
			BASES_SWIMLANE_VIEW_ID,
			BASES_CALENDAR_VIEW_ID,
			BASES_GANTT_VIEW_ID,
			BASES_TIMELINE_VIEW_ID,
		]);
		expect(new Set(registeredViews).size).toBe(registeredViews.length);
		expect(registeredHovers).toEqual([
			BASES_SWIMLANE_VIEW_ID,
			BASES_CALENDAR_VIEW_ID,
			BASES_GANTT_VIEW_ID,
			BASES_TIMELINE_VIEW_ID,
		]);
		expect(registeredCommands).toEqual([
			"gantt-scroll-today",
			"gantt-create-note",
			"gantt-view-day",
			"gantt-view-week",
			"gantt-view-month",
			"gantt-view-year",
		]);
	});
});
