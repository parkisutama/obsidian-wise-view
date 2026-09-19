import { describe, expect, it } from "vitest";
import type { EntrySnapshot } from "../src/core/entries/EntrySnapshot";
import { MISSING_VALUE, type NormalizedValue } from "../src/core/entries/NormalizedValue";
import { mapEntriesToCardItems, mapEntryToCardItem, type CardMappingOptions } from "../src/core/cards/CardMapper";

function snapshot(path: string, values: Record<string, NormalizedValue>): EntrySnapshot {
	const basename = path.replace(/\.md$/i, "").split("/").pop() ?? path;
	return {
		path,
		basename,
		extension: "md",
		folder: path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "",
		ctime: 1,
		mtime: 2,
		values: new Map(Object.entries(values)),
	};
}

const baseOptions: CardMappingOptions = {
	titleProperty: null,
	subtitleProperty: null,
	coverProperty: null,
	tagsProperty: null,
	colorProperty: null,
	previewEnabled: false,
	properties: [],
};

describe("mapEntryToCardItem", () => {
	it("falls back to the file's basename when no title property is configured or it has no value", () => {
		const entry = snapshot("Tasks/A.md", {});
		expect(mapEntryToCardItem(entry, baseOptions).title).toBe("A");

		const withUnsetTitle = snapshot("Tasks/B.md", { "note.title": MISSING_VALUE });
		expect(mapEntryToCardItem(entry, { ...baseOptions, titleProperty: "note.title" }).title).toBe("A");
		expect(mapEntryToCardItem(withUnsetTitle, { ...baseOptions, titleProperty: "note.title" }).title).toBe("B");
	});

	it("uses the configured title property when it has a value", () => {
		const entry = snapshot("A.md", { "note.title": { kind: "text", value: "Real Title" } });
		expect(mapEntryToCardItem(entry, { ...baseOptions, titleProperty: "note.title" }).title).toBe("Real Title");
	});

	it("leaves subtitle null when unconfigured or missing", () => {
		const entry = snapshot("A.md", {});
		expect(mapEntryToCardItem(entry, baseOptions).subtitle).toBeNull();
		expect(mapEntryToCardItem(entry, { ...baseOptions, subtitleProperty: "note.sub" }).subtitle).toBeNull();
	});

	it("maps a cover property to a file reference by default and a url reference for an external link", () => {
		const filePath = snapshot("A.md", { "note.cover": { kind: "text", value: "covers/a.png" } });
		expect(mapEntryToCardItem(filePath, { ...baseOptions, coverProperty: "note.cover" }).cover).toEqual({
			kind: "file",
			value: "covers/a.png",
		});

		const url = snapshot("A.md", { "note.cover": { kind: "text", value: "https://example.com/a.png" } });
		expect(mapEntryToCardItem(url, { ...baseOptions, coverProperty: "note.cover" }).cover).toEqual({
			kind: "url",
			value: "https://example.com/a.png",
		});
	});

	it("leaves cover null when unconfigured or missing", () => {
		const entry = snapshot("A.md", {});
		expect(mapEntryToCardItem(entry, baseOptions).cover).toBeNull();
		expect(mapEntryToCardItem(entry, { ...baseOptions, coverProperty: "note.cover" }).cover).toBeNull();
	});

	it("maps a list-valued tags property to a string array", () => {
		const entry = snapshot("A.md", {
			"note.tags": { kind: "list", items: [{ kind: "text", value: "one" }, { kind: "text", value: "two" }] },
		});
		expect(mapEntryToCardItem(entry, { ...baseOptions, tagsProperty: "note.tags" }).tags).toEqual(["one", "two"]);
	});

	it("wraps a single non-list tags value as one tag", () => {
		const entry = snapshot("A.md", { "note.tags": { kind: "text", value: "solo" } });
		expect(mapEntryToCardItem(entry, { ...baseOptions, tagsProperty: "note.tags" }).tags).toEqual(["solo"]);
	});

	it("defaults tags to an empty array when unconfigured or missing", () => {
		const entry = snapshot("A.md", {});
		expect(mapEntryToCardItem(entry, baseOptions).tags).toEqual([]);
		expect(mapEntryToCardItem(entry, { ...baseOptions, tagsProperty: "note.tags" }).tags).toEqual([]);
	});

	it("includes every configured property in order, substituting the shared missing value when absent", () => {
		const entry = snapshot("A.md", { "note.status": { kind: "text", value: "Todo" } });
		const options: CardMappingOptions = {
			...baseOptions,
			properties: [
				{ propertyId: "note.status", label: "Status" },
				{ propertyId: "note.priority", label: "Priority" },
			],
		};
		expect(mapEntryToCardItem(entry, options).properties).toEqual([
			{ propertyId: "note.status", label: "Status", value: { kind: "text", value: "Todo" } },
			{ propertyId: "note.priority", label: "Priority", value: MISSING_VALUE },
		]);
	});

	it("reads the raw color category value without resolving it to a CSS color", () => {
		const entry = snapshot("A.md", { "note.status": { kind: "text", value: "Todo" } });
		expect(mapEntryToCardItem(entry, { ...baseOptions, colorProperty: "note.status" }).colorValue).toBe("Todo");
	});

	it("sets previewPath to the card's own path only when preview is enabled", () => {
		const entry = snapshot("A.md", {});
		expect(mapEntryToCardItem(entry, baseOptions).previewPath).toBeNull();
		expect(mapEntryToCardItem(entry, { ...baseOptions, previewEnabled: true }).previewPath).toBe("A.md");
	});

	it("combines title and subtitle into one accessible label", () => {
		const entry = snapshot("A.md", { "note.sub": { kind: "text", value: "Sub" } });
		expect(mapEntryToCardItem(entry, { ...baseOptions, subtitleProperty: "note.sub" }).accessibleLabel).toBe("A, Sub");
		expect(mapEntryToCardItem(entry, baseOptions).accessibleLabel).toBe("A");
	});

	it("carries ctime/mtime through from the snapshot", () => {
		const entry = snapshot("A.md", {});
		const item = mapEntryToCardItem(entry, baseOptions);
		expect(item.ctime).toBe(1);
		expect(item.mtime).toBe(2);
	});
});

describe("mapEntriesToCardItems", () => {
	it("maps every entry, preserving order", () => {
		const entries = [snapshot("A.md", {}), snapshot("B.md", {})];
		expect(mapEntriesToCardItems(entries, baseOptions).map(item => item.path)).toEqual(["A.md", "B.md"]);
	});
});
