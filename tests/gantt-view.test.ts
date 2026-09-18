// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { BASES_GANTT_VIEW_ID, BasesGanttView } from "../src/views/BasesGanttView";
import {
	createGroupHeaderTask,
	mapEntriesToTasks,
	sortByDependencies,
	type TaskMapperConfig,
} from "../src/utils/ganttUtils";
import { createGanttHarness, makeGanttSnapshot, type GanttHarness } from "./fixtures/gantt";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

let harness: GanttHarness | null = null;
const mount = (...args: Parameters<typeof createGanttHarness>) => {
	harness = createGanttHarness(...args);
	return harness;
};

afterEach(() => {
	harness?.destroy();
	harness = null;
});

const baseConfig: TaskMapperConfig = {
	startProperty: "note.start",
	endProperty: "note.end",
	labelProperty: null,
	dependenciesProperty: "note.depends_on",
	colorByProperty: null,
	progressProperty: null,
	showProgress: false,
};

describe("Gantt task mapping", () => {
	it("maps entries with valid start dates to tasks", () => {
		const entries = [
			makeGanttSnapshot({ path: "Tasks/A.md", start: "2026-01-01", end: "2026-01-03" }),
			makeGanttSnapshot({ path: "Tasks/B.md", start: "not-a-date" }),
		];
		const tasks = mapEntriesToTasks(entries, baseConfig);
		expect(tasks).toHaveLength(1);
		expect(tasks[0]).toMatchObject({ filePath: "Tasks/A.md", name: "A", start: "2026-01-01", end: "2026-01-03" });
	});

	it("defaults a missing end date to one day after start", () => {
		const entries = [makeGanttSnapshot({ path: "Tasks/A.md", start: "2026-01-01" })];
		const tasks = mapEntriesToTasks(entries, baseConfig);
		expect(tasks[0]).toMatchObject({ start: "2026-01-01", end: "2026-01-02" });
	});

	it("resolves wiki-link dependencies to task ids", () => {
		const entries = [
			makeGanttSnapshot({ path: "Tasks/A.md", start: "2026-01-01" }),
			makeGanttSnapshot({ path: "Tasks/B.md", start: "2026-01-02", depends_on: "[[A]]" }),
		];
		const tasks = mapEntriesToTasks(entries, baseConfig);
		const taskA = tasks.find((t) => t.filePath === "Tasks/A.md");
		const taskB = tasks.find((t) => t.filePath === "Tasks/B.md");
		expect(taskB?.dependencies).toBe(taskA?.id);
	});

	it("sorts tasks so dependencies come before dependents", () => {
		const entries = [
			makeGanttSnapshot({ path: "Tasks/B.md", start: "2026-01-02", depends_on: "[[A]]" }),
			makeGanttSnapshot({ path: "Tasks/A.md", start: "2026-01-01" }),
		];
		const tasks = sortByDependencies(mapEntriesToTasks(entries, baseConfig));
		expect(tasks.map((t) => t.filePath)).toEqual(["Tasks/A.md", "Tasks/B.md"]);
	});

	it("creates a group header task spanning its group's date range", () => {
		const entries = [
			makeGanttSnapshot({ path: "Tasks/A.md", start: "2026-01-01", end: "2026-01-02" }),
			makeGanttSnapshot({ path: "Tasks/B.md", start: "2026-01-05", end: "2026-01-06" }),
		];
		const tasks = mapEntriesToTasks(entries, baseConfig);
		const header = createGroupHeaderTask("Group 1", 0, tasks);
		expect(header).toMatchObject({ name: "Group 1", start: "2026-01-01", end: "2026-01-06" });
	});
});

describe("Gantt view registration and lifecycle", () => {
	it("registers with its own stable view id", () => {
		expect(BASES_GANTT_VIEW_ID).toBe("wise-view-gantt");
	});

	it("tracks mounted instances and creates the chart container without a start property", () => {
		const h = mount();
		expect(BasesGanttView.instances.has(h.view)).toBe(true);
		expect(h.host.querySelector(".gantt-wrapper")).not.toBeNull();
		expect(h.host.querySelector(".gantt-empty-state")).not.toBeNull();
	});

	it("shows the no-valid-dates empty state once a start property is configured but unmatched", () => {
		const h = mount({
			notes: [{ path: "Tasks/A.md", start: "not-a-date" }],
			config: { startDate: "note.start" },
		});
		expect(h.host.querySelector(".gantt-empty-state p")?.textContent).toContain("No notes with valid dates");
	});

	it("releases the tracked instance and DOM listeners on unload without touching Frappe Gantt", () => {
		const h = mount();
		expect(() => h.destroy()).not.toThrow();
		expect(BasesGanttView.instances.has(h.view)).toBe(false);
	});

	it("is safe to unload twice", () => {
		const h = mount();
		expect(() => {
			h.view.onunload();
			h.view.onunload();
		}).not.toThrow();
	});
});

describe("Gantt view: no global browser API overwritten (T010)", () => {
	it("never reassigns document.addEventListener or another global API", () => {
		const source = readFileSync(path.join(repoRoot, "src", "views", "BasesGanttView.ts"), "utf8");
		expect(/document\.addEventListener\s*=/.test(source)).toBe(false);
		expect(/window\.addEventListener\s*=/.test(source)).toBe(false);
	});

	it("routes writes through the legacy mutation gateway", () => {
		const source = readFileSync(path.join(repoRoot, "src", "views", "BasesGanttView.ts"), "utf8");
		expect(source).not.toContain(".processFrontMatter(");
		expect(source).not.toContain(".trashFile(");
		expect(source).toContain("this.mutations.updateRange(");
		expect(source).toContain("this.mutations.setProperty(");
	});
});
