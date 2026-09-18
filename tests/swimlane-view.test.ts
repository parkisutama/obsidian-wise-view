// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BASES_SWIMLANE_VIEW_ID, createSwimlaneViewRegistration } from "../src/views/BasesSwimlaneView";
import { DEFAULT_SETTINGS } from "../src/types/settings";
import type WiseViewPlugin from "../src/main";
import { createSwimlaneHarness, waitForRender, type SwimlaneHarness } from "./fixtures/swimlane";

const plugin = { app: {}, settings: structuredClone(DEFAULT_SETTINGS) } as unknown as WiseViewPlugin;
const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

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

// The view keeps drag internals private; tests drive them directly, as the toolbar-driven
// calendar tests do for FullCalendar.
type ViewInternals = {
	startTouchDrag(card: HTMLElement, entry: unknown, e: unknown): void;
	startSwimlaneTouchDrag(row: HTMLElement, key: string, e: unknown): void;
};
const internals = (h: SwimlaneHarness) => h.view as unknown as ViewInternals;

describe("Swimlane view lifecycle", () => {
	it("disconnects the previous render's virtual-scroll observers before mounting new ones", async () => {
		const notes = Array.from({ length: 20 }, (_, i) => ({ path: `Tasks/${i}.md`, status: "Todo" }));
		const h = await mount({ notes, config: { plannerGroupBy: "note.status" } });
		const observers = (h.view as unknown as { virtualScrollObservers: Map<unknown, { disconnect: () => void }> })
			.virtualScrollObservers;
		expect(observers.size).toBeGreaterThan(0);
		const firstRenderObservers = [...observers.values()];
		const disconnectSpies = firstRenderObservers.map((observer) => vi.spyOn(observer, "disconnect"));

		h.view.onDataUpdated();
		await waitForRender();

		for (const spy of disconnectSpies) expect(spy).toHaveBeenCalledTimes(1);
		expect(observers.size).toBeGreaterThan(0);
	});

	it("cancels an in-flight card drag on unload, removing the clone and context-menu blocker", async () => {
		const h = await mount({ config: { plannerGroupBy: "note.status" } });
		const card = h.host.querySelector<HTMLElement>(".planner-kanban-card");
		expect(card).not.toBeNull();
		const entry = { path: "Tasks/Write spec.md" };
		internals(h).startTouchDrag(card!, entry, { touches: [{ clientX: 0, clientY: 0 }] });

		expect(h.host.ownerDocument.querySelector(".planner-kanban-drag-clone")).not.toBeNull();
		h.view.onunload();
		expect(h.host.ownerDocument.querySelector(".planner-kanban-drag-clone")).toBeNull();
	});

	it("cancels an in-flight swimlane drag on unload, removing its clone", async () => {
		const h = await mount({
			config: { plannerGroupBy: "note.status", swimlaneBy: "note.priority" },
		});
		const row = h.host.querySelector<HTMLElement>(".planner-kanban-swimlane-row");
		expect(row).not.toBeNull();
		internals(h).startSwimlaneTouchDrag(row!, "High", { touches: [{ clientX: 0, clientY: 0 }] });

		expect(h.host.ownerDocument.querySelector(".planner-kanban-swimlane-drag-clone")).not.toBeNull();
		h.view.onunload();
		expect(h.host.ownerDocument.querySelector(".planner-kanban-swimlane-drag-clone")).toBeNull();
	});

	it("is safe to unload twice", async () => {
		const h = await mount();
		expect(() => {
			h.view.onunload();
			h.view.onunload();
		}).not.toThrow();
	});
});

describe("Swimlane shared platform boundaries (T026)", () => {
	it("does not retain BasesEntry or call Obsidian mutation APIs directly", () => {
		const source = readFileSync(path.join(repoRoot, "src", "views", "BasesSwimlaneView.ts"), "utf8");
		expect(source).not.toContain("BasesEntry");
		expect(source).not.toContain(".processFrontMatter(");
		expect(source).not.toContain(".renameFile(");
		expect(source).not.toContain(".createFolder(");
		expect(source).toContain("createEntrySnapshot(");
		expect(source).toContain("this.mutations.setProperties(");
	});

	it("uses shared color and hover adapters", () => {
		const source = readFileSync(path.join(repoRoot, "src", "views", "BasesSwimlaneView.ts"), "utf8");
		expect(source).toContain("resolveColor({");
		expect(source).toContain("resolvePrettyPropertiesColor(");
		expect(source).toContain("dispatchHoverPreview({");
		expect(source).not.toContain("PrettyPropertiesApi");
		expect(source).not.toContain("workspace.trigger('hover-link'");
	});
});
