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

	it("expresses Calendar, Gantt, and Swimlane without view-specific registry branching", () => {
		const registry = new ViewRegistry();
		const calendar = createCalendarViewRegistration(plugin);
		const gantt = createGanttViewRegistration(plugin);
		const swimlane = createSwimlaneViewRegistration(plugin);

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

		expect(registry.list().map((d) => d.id)).toEqual([
			BASES_CALENDAR_VIEW_ID,
			BASES_GANTT_VIEW_ID,
			BASES_SWIMLANE_VIEW_ID,
		]);
		for (const descriptor of registry.list()) {
			expect(descriptor.capabilities?.legacyMutation).toBe(true);
			expect(descriptor.hover?.display).toBeTruthy();
		}
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

		expect(registeredViews).toEqual([BASES_SWIMLANE_VIEW_ID, BASES_CALENDAR_VIEW_ID, BASES_GANTT_VIEW_ID]);
		expect(new Set(registeredViews).size).toBe(registeredViews.length);
		expect(registeredHovers).toEqual([BASES_SWIMLANE_VIEW_ID, BASES_CALENDAR_VIEW_ID, BASES_GANTT_VIEW_ID]);
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
