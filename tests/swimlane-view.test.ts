// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { BASES_SWIMLANE_VIEW_ID, createSwimlaneViewRegistration } from "../src/views/BasesSwimlaneView";
import { DEFAULT_SETTINGS } from "../src/types/settings";
import type PlannerPlugin from "../src/main";
import { createSwimlaneHarness, type SwimlaneHarness } from "./fixtures/swimlane";

const plugin = { app: {}, settings: structuredClone(DEFAULT_SETTINGS) } as unknown as PlannerPlugin;

let harness: SwimlaneHarness | null = null;
const mount = async (...args: Parameters<typeof createSwimlaneHarness>) => {
	harness = await createSwimlaneHarness(...args);
	return harness;
};

afterEach(() => {
	harness?.destroy();
	harness = null;
});

const texts = (h: SwimlaneHarness, selector: string) =>
	[...h.host.querySelectorAll(selector)].map((el) => el.textContent);

describe("Swimlane view registration", () => {
	it("is registered as Swimlane with its own view id", () => {
		const registration = createSwimlaneViewRegistration(plugin);
		expect(BASES_SWIMLANE_VIEW_ID).toBe("wise-view-swimlane");
		expect(registration.name).toBe("Swimlane");
		// A lanes icon, distinct from Obsidian's core Kanban layout.
		expect(registration.icon).toBe("rows-3");
	});

	it("does not preselect any property in its options", () => {
		const options = createSwimlaneViewRegistration(plugin).options?.({} as never) ?? [];
		const propertyOptions = options.filter((option) => option.type === "property");
		expect(propertyOptions.length).toBeGreaterThan(0);
		const preselected = propertyOptions.filter((option) => "default" in option && option.default).map((option) => option.key);
		expect(preselected).toEqual([]);
	});

	it("has no default column property in the plugin settings", () => {
		expect(DEFAULT_SETTINGS.swimlaneDefaults.plannerGroupBy).toBe("");
		expect(DEFAULT_SETTINGS).not.toHaveProperty("kanbanDefaults");
	});
});

describe("Swimlane view without configured properties", () => {
	it("asks for a column property instead of guessing one", async () => {
		const h = await mount();
		expect(h.host.querySelector(".planner-kanban-column")).toBeNull();
		expect(h.host.querySelector(".planner-empty")?.textContent).toContain("Columns by");
	});

	it("uses the file name as card title when Title by is unset", async () => {
		const h = await mount({ config: { plannerGroupBy: "note.status" } });
		expect(texts(h, ".planner-kanban-card-title").sort()).toEqual(["Build", "Ship", "Write spec"]);
	});

	it("shows no cover, summary, or default property badges unless configured", async () => {
		const h = await mount({ config: { plannerGroupBy: "note.status" }, order: ["note.summary"] });
		expect(h.host.querySelector(".planner-kanban-card-cover")).toBeNull();
		expect(h.host.querySelector(".planner-kanban-card-summary")).toBeNull();
		expect(h.host.textContent).not.toContain("High");
	});
});

describe("Swimlane view property badges", () => {
	it("shows no property badges until properties are chosen", async () => {
		const h = await mount({ config: { plannerGroupBy: "note.status" } });
		// Without a chosen property list, nothing like priority is assumed.
		expect(h.host.textContent).not.toContain("High");
		expect(h.host.textContent).not.toContain("Low");
	});

	it("shows a chosen property named summary as a badge when no Summary field is set", async () => {
		const h = await mount({ config: { plannerGroupBy: "note.status" }, order: ["note.summary"] });
		expect(h.host.textContent).toContain("Spec summary");
	});
});

describe("Swimlane view with configured properties", () => {
	it("renders one column per value of Columns by", async () => {
		const h = await mount({ config: { plannerGroupBy: "note.status" } });
		expect(texts(h, ".planner-kanban-column-title").sort()).toEqual(["Doing", "Done", "Todo"]);
	});

	it("uses the configured title, cover, and summary properties", async () => {
		const h = await mount({
			config: { plannerGroupBy: "note.status", titleBy: "note.title", coverField: "note.cover", summaryField: "note.summary" },
			order: ["note.summary"],
		});
		expect(texts(h, ".planner-kanban-card-title")).toContain("Spec title");
		expect(h.host.querySelector(".planner-kanban-card-cover")).not.toBeNull();
		expect(texts(h, ".planner-kanban-card-summary")).toContain("Spec summary");
	});
});
