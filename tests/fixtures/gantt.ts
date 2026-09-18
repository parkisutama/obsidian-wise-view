// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

// Import the test double directly so this file type-checks against it; at runtime "obsidian"
// resolves to the same module through the vitest alias.
import { DateValue, NumberValue, StringValue, TFile } from "./obsidian";
import { createEntrySnapshot } from "../../src/platform/bases/entrySnapshotAdapter";
import { BasesGanttView } from "../../src/views/BasesGanttView";
import { DEFAULT_SETTINGS } from "../../src/types/settings";
import type PlannerPlugin from "../../src/main";

/** A note as Bases exposes it: frontmatter keyed by property name. */
export interface GanttNoteFixture {
	path: string;
	[property: string]: string;
}

/** A minimal `BasesEntry`-like object for exercising `mapEntriesToTasks` directly. */
export function makeGanttEntry(note: GanttNoteFixture) {
	const file = new TFile(note.path) as TFile & {
		extension: string;
		parent: { path: string } | null;
		stat: { ctime: number; mtime: number };
	};
	file.extension = "md";
	file.parent = { path: note.path.includes("/") ? note.path.slice(0, note.path.lastIndexOf("/")) : "" };
	file.stat = { ctime: 1, mtime: 2 };
	return {
		file,
		getValue: (id: string) => {
			const key = id.replace(/^(note|file|formula)\./, "");
			const value = note[key];
			if (value == null) return null;
			if (/start|end|date|due/i.test(key)) return new DateValue(value);
			if (/progress|percent/i.test(key)) return new NumberValue(Number(value));
			return new StringValue(value);
		},
	};
}

export function makeGanttSnapshot(note: GanttNoteFixture) {
	return createEntrySnapshot(makeGanttEntry(note) as never, [
		"note.start",
		"note.end",
		"note.depends_on",
		"note.progress",
	]);
}

export interface GanttHarnessOptions {
	notes?: GanttNoteFixture[];
	/** Bases view options (the view's `config.get`/`config.getAsPropertyId` values). */
	config?: Record<string, unknown>;
}

export interface GanttHarness {
	view: BasesGanttView;
	host: HTMLElement;
	opened: string[];
	frontmatter: Array<{ path: string; values: Record<string, unknown> }>;
	destroy(): void;
}

/**
 * Mount the real BasesGanttView with no entries. This exercises `onload`/`onDataUpdated`/
 * `onunload` without ever constructing a Frappe Gantt chart (no start date has a valid entry
 * to render, so the view takes its empty-state path instead of touching SVG).
 */
export function createGanttHarness(options: GanttHarnessOptions = {}): GanttHarness {
	const notes = options.notes ?? [];
	const config: Record<string, unknown> = { ...options.config };

	const opened: string[] = [];
	const frontmatter: GanttHarness["frontmatter"] = [];

	const entries = notes.map((note) => makeGanttEntry(note));

	const app = {
		vault: {
			getFileByPath: (path: string) => new TFile(path),
			getAbstractFileByPath: (path: string) => new TFile(path),
		},
		workspace: {
			openLinkText: async (path: string) => {
				opened.push(path);
			},
			trigger: () => {},
			getLeaf: () => ({ openFile: async () => {} }),
		},
		fileManager: {
			processFrontMatter: async (file: TFile, update: (fm: Record<string, unknown>) => void) => {
				const values: Record<string, unknown> = {};
				update(values);
				frontmatter.push({ path: file.path, values });
			},
		},
	};

	const controller = {
		app,
		config: {
			get: (key: string) => config[key],
			getAsPropertyId: (key: string) => (config[key] as string | undefined) ?? null,
		},
		data: { data: entries, groupedData: [{ entries, hasKey: () => false }] },
	};
	const plugin = { app, settings: structuredClone(DEFAULT_SETTINGS) } as unknown as PlannerPlugin;

	const host = document.createElement("div");
	document.body.appendChild(host);

	const view = new BasesGanttView(controller as never, host, plugin);
	view.onload();
	view.onDataUpdated();

	return {
		view,
		host,
		opened,
		frontmatter,
		destroy() {
			view.onunload();
			host.remove();
		},
	};
}
