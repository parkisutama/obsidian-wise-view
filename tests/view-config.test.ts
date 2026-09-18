import { describe, expect, it } from "vitest";
import type { BasesViewConfig } from "obsidian";
import { ViewConfigReader } from "../src/platform/bases/ViewConfigReader";
import { areAllCssOnly, classifyOption, createViewOptionSchema } from "../src/platform/bases/viewOptionTypes";

function makeConfig(values: Record<string, unknown>): BasesViewConfig {
	return {
		get: (key: string) => values[key],
		getAsPropertyId: (key: string) => {
			const value = values[key];
			return typeof value === "string" && /^(note|file|formula)\./.test(value) ? (value as never) : null;
		},
		getOrder: () => (values.__order__ as never) ?? [],
		getDisplayName: (id: string) => id.replace(/^(note|file|formula)\./, ""),
	} as unknown as BasesViewConfig;
}

describe("ViewConfigReader", () => {
	it("falls back to the caller's default for a missing or wrong-typed string", () => {
		const reader = new ViewConfigReader(makeConfig({ titleField: 42 }));
		expect(reader.getString("titleField", "fallback")).toBe("fallback");
		expect(reader.getString("missing", "fallback")).toBe("fallback");
	});

	it("treats an empty string as unset for getString but not for getOptionalString", () => {
		const reader = new ViewConfigReader(makeConfig({ titleField: "" }));
		expect(reader.getString("titleField", "fallback")).toBe("fallback");
		expect(reader.getOptionalString("titleField")).toBe("");
		expect(reader.getOptionalString("missing")).toBeNull();
	});

	it("resolves an invalid number to the fallback, including NaN/Infinity", () => {
		const reader = new ViewConfigReader(makeConfig({ barHeight: "not-a-number", zoom: Number.NaN }));
		expect(reader.getNumber("barHeight", 30)).toBe(30);
		expect(reader.getNumber("zoom", 1)).toBe(1);
		expect(new ViewConfigReader(makeConfig({ barHeight: 42 })).getNumber("barHeight", 30)).toBe(42);
	});

	it("resolves a non-boolean to the fallback", () => {
		const reader = new ViewConfigReader(makeConfig({ showProgress: "yes" }));
		expect(reader.getBoolean("showProgress", false)).toBe(false);
		expect(new ViewConfigReader(makeConfig({ showProgress: true })).getBoolean("showProgress", false)).toBe(true);
	});

	it("resolves a value outside the enum to the fallback rather than guessing", () => {
		const views = ["dayGridMonth", "timeGridWeek"] as const;
		const reader = new ViewConfigReader(makeConfig({ defaultView: "not-a-real-view" }));
		expect(reader.getEnum("defaultView", views, "dayGridMonth")).toBe("dayGridMonth");
		expect(new ViewConfigReader(makeConfig({ defaultView: "timeGridWeek" })).getEnum("defaultView", views, "dayGridMonth")).toBe(
			"timeGridWeek",
		);
	});

	it("resolves an invalid property id to null instead of guessing one", () => {
		const reader = new ViewConfigReader(makeConfig({ startDate: "not.a.property" }));
		expect(reader.getPropertyId("startDate")).toBeNull();
		expect(new ViewConfigReader(makeConfig({ startDate: "note.start" })).getPropertyId("startDate")).toBe("note.start");
	});

	it("has no built-in default of its own for any accessor", () => {
		const reader = new ViewConfigReader(makeConfig({}));
		expect(reader.getString("anything", "caller-default")).toBe("caller-default");
		expect(reader.getPropertyId("anything")).toBeNull();
	});
});

describe("view option CSS-only classification", () => {
	const schema = createViewOptionSchema(["cardWidth", "cardGap"]);

	it("classifies declared keys as css and everything else as data", () => {
		expect(classifyOption(schema, "cardWidth")).toBe("css");
		expect(classifyOption(schema, "titleField")).toBe("data");
	});

	it("queries classification without constructing any data model", () => {
		expect(areAllCssOnly(schema, ["cardWidth", "cardGap"])).toBe(true);
		expect(areAllCssOnly(schema, ["cardWidth", "titleField"])).toBe(false);
		expect(areAllCssOnly(schema, [])).toBe(false);
	});
});
