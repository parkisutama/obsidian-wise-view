import { describe, expect, it } from "vitest";
import type { CardItem } from "../src/core/cards/CardItem";

describe("CardItem", () => {
	it("is plain data: no method carries DOM/BasesEntry/layout state", () => {
		const item: CardItem = {
			path: "A.md",
			title: "A",
			subtitle: null,
			cover: null,
			previewPath: null,
			tags: [],
			properties: [],
			colorValue: null,
			ctime: 1,
			mtime: 2,
			accessibleLabel: "A",
		};
		expect(JSON.parse(JSON.stringify(item))).toEqual(item);
	});

	it("keeps title/subtitle/cover/tags/properties/color/preview independently optional", () => {
		const minimal: CardItem = {
			path: "A.md",
			title: "A",
			subtitle: null,
			cover: null,
			previewPath: null,
			tags: [],
			properties: [],
			colorValue: null,
			ctime: 1,
			mtime: 2,
			accessibleLabel: "A",
		};
		const full: CardItem = {
			...minimal,
			subtitle: "Sub",
			cover: { kind: "file", value: "cover.png" },
			previewPath: "A.md",
			tags: ["one", "two"],
			properties: [{ propertyId: "note.status", label: "Status", value: { kind: "text", value: "Todo" } }],
			colorValue: "Todo",
		};
		expect(full.subtitle).not.toBeNull();
		expect(minimal.subtitle).toBeNull();
	});
});
