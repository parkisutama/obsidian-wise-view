// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { TFile } from "./fixtures/obsidian";
import { renderCard, resolveCoverImageSrc } from "../src/platform/dom/CardRenderer";
import type { CardItem } from "../src/core/cards/CardItem";
import type { App } from "obsidian";

function makeItem(overrides: Partial<CardItem> = {}): CardItem {
	return {
		path: "Tasks/A.md",
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
		...overrides,
	};
}

function makeApp(options: { existingFiles?: string[] } = {}) {
	const files = new Set(options.existingFiles ?? []);
	const opened: string[] = [];
	const trigger = vi.fn();
	const app = {
		vault: {
			getAbstractFileByPath: (path: string) => (files.has(path) ? new TFile(path) : null),
			getResourcePath: (file: TFile) => `app://vault/${file.path}`,
			getFiles: () => [...files].map((path) => new TFile(path)),
		},
		workspace: {
			openLinkText: async (path: string) => {
				opened.push(path);
			},
			trigger,
		},
	} as unknown as App;
	return { app, opened, trigger };
}

const hoverParent = {} as never;

describe("renderCard", () => {
	it("renders a focusable, keyboard-activatable native button as the card root", () => {
		const { app } = makeApp();
		const handle = renderCard(document, makeItem(), { app, hoverParent, sourceId: "wise-view-grid" });
		expect(handle.element.tagName).toBe("BUTTON");
		expect(handle.element.type).toBe("button");
		expect(handle.element.getAttribute("aria-label")).toBe("A");
		handle.dispose();
	});

	it("renders title, subtitle, tags, and non-missing properties", () => {
		const { app } = makeApp();
		const item = makeItem({
			subtitle: "Sub",
			tags: ["one", "two"],
			properties: [
				{ propertyId: "note.status", label: "Status", value: { kind: "text", value: "Todo" } },
				{ propertyId: "note.priority", label: "Priority", value: { kind: "missing" } },
			],
		});
		const handle = renderCard(document, item, { app, hoverParent, sourceId: "wise-view-grid" });
		expect(handle.element.querySelector(".wise-view-card__title")?.textContent).toBe("A");
		expect(handle.element.querySelector(".wise-view-card__subtitle")?.textContent).toBe("Sub");
		expect([...handle.element.querySelectorAll(".wise-view-card__tag")].map(el => el.textContent)).toEqual(["one", "two"]);
		expect(handle.element.querySelectorAll(".wise-view-card__property")).toHaveLength(1);
		expect(handle.element.querySelector(".wise-view-card__property-label")?.textContent).toBe("Status");
		handle.dispose();
	});

	it("resolves a file cover to Obsidian's resource path and a url cover as-is", () => {
		const { app } = makeApp({ existingFiles: ["cover.png"] });
		const fileCover = renderCard(document, makeItem({ cover: { kind: "file", value: "cover.png" } }), {
			app,
			hoverParent,
			sourceId: "wise-view-grid",
		});
		expect(fileCover.element.querySelector("img")?.getAttribute("src")).toBe("app://vault/cover.png");
		fileCover.dispose();

		const urlCover = renderCard(document, makeItem({ cover: { kind: "url", value: "https://example.com/a.png" } }), {
			app,
			hoverParent,
			sourceId: "wise-view-grid",
		});
		expect(urlCover.element.querySelector("img")?.getAttribute("src")).toBe("https://example.com/a.png");
		urlCover.dispose();
	});

	it("omits the cover slot when the referenced file does not exist", () => {
		const { app } = makeApp();
		const handle = renderCard(document, makeItem({ cover: { kind: "file", value: "missing.png" } }), {
			app,
			hoverParent,
			sourceId: "wise-view-grid",
		});
		expect(handle.element.querySelector(".wise-view-card__cover")).toBeNull();
		handle.dispose();
	});

	it("sets color CSS variables from the resolved color-by value", () => {
		const { app } = makeApp();
		const handle = renderCard(document, makeItem({ colorValue: "Todo" }), { app, hoverParent, sourceId: "wise-view-grid" });
		expect(handle.element.style.getPropertyValue("--wise-view-color-bg")).toMatch(/^#[0-9a-f]{6}$/i);
		handle.dispose();
	});

	it("opens the note on click through the shared navigation service", () => {
		const { app, opened } = makeApp();
		const handle = renderCard(document, makeItem(), { app, hoverParent, sourceId: "wise-view-grid" });
		document.body.appendChild(handle.element);
		handle.element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		expect(opened).toEqual(["Tasks/A.md"]);
		handle.dispose();
		handle.element.remove();
	});

	it("is keyboard-activatable via the native button (Enter/Space fire click)", () => {
		const { app, opened } = makeApp();
		const handle = renderCard(document, makeItem(), { app, hoverParent, sourceId: "wise-view-grid" });
		document.body.appendChild(handle.element);
		handle.element.focus();
		expect(document.activeElement).toBe(handle.element);
		// happy-dom's native <button> already dispatches a click for Enter/Space; this asserts
		// the element is truly focusable and wired to open, not that the browser key mapping works.
		handle.element.click();
		expect(opened).toEqual(["Tasks/A.md"]);
		handle.dispose();
		handle.element.remove();
	});

	it("dispatches hover-link with the registered source id on mouseenter", () => {
		const { app, trigger } = makeApp();
		const handle = renderCard(document, makeItem(), { app, hoverParent, sourceId: "wise-view-grid" });
		handle.element.dispatchEvent(new MouseEvent("mouseenter"));
		expect(trigger).toHaveBeenCalledWith("hover-link", expect.objectContaining({ source: "wise-view-grid", linktext: "Tasks/A.md" }));
		handle.dispose();
	});

	it("update() re-renders slots in place without replacing the element", () => {
		const { app } = makeApp();
		const handle = renderCard(document, makeItem(), { app, hoverParent, sourceId: "wise-view-grid" });
		const element = handle.element;
		handle.update(makeItem({ title: "Updated" }));
		expect(handle.element).toBe(element);
		expect(handle.element.querySelector(".wise-view-card__title")?.textContent).toBe("Updated");
		handle.dispose();
	});

	it("dispose() removes listeners and is safe to call twice", () => {
		const { app, opened } = makeApp();
		const handle = renderCard(document, makeItem(), { app, hoverParent, sourceId: "wise-view-grid" });
		document.body.appendChild(handle.element);
		expect(() => {
			handle.dispose();
			handle.dispose();
		}).not.toThrow();
		handle.element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		expect(opened).toEqual([]);
		handle.element.remove();
	});
});

describe("resolveCoverImageSrc (moved from BasesSwimlaneView.ts under T037)", () => {
	it("returns an external/app:// URL as-is", () => {
		const { app } = makeApp();
		expect(resolveCoverImageSrc(app, "https://example.com/a.png")).toBe("https://example.com/a.png");
		expect(resolveCoverImageSrc(app, "app://local/a.png")).toBe("app://local/a.png");
	});

	it("resolves a direct vault path", () => {
		const { app } = makeApp({ existingFiles: ["Covers/a.png"] });
		expect(resolveCoverImageSrc(app, "Covers/a.png")).toBe("app://vault/Covers/a.png");
	});

	it("strips wikilink brackets and an alias", () => {
		const { app } = makeApp({ existingFiles: ["Covers/a.png"] });
		expect(resolveCoverImageSrc(app, "[[Covers/a.png]]")).toBe("app://vault/Covers/a.png");
		expect(resolveCoverImageSrc(app, "[[Covers/a.png|Alias]]")).toBe("app://vault/Covers/a.png");
	});

	it("normalizes a leading ./ or ../ segment", () => {
		const { app } = makeApp({ existingFiles: ["a.png"] });
		expect(resolveCoverImageSrc(app, "./a.png")).toBe("app://vault/a.png");
		expect(resolveCoverImageSrc(app, "../a.png")).toBe("app://vault/a.png");
	});

	it("guesses a common image extension when none is given", () => {
		const { app } = makeApp({ existingFiles: ["Covers/a.png"] });
		expect(resolveCoverImageSrc(app, "Covers/a")).toBe("app://vault/Covers/a.png");
	});

	it("falls back to a vault-wide basename search", () => {
		const { app } = makeApp({ existingFiles: ["Deep/Nested/a.png"] });
		expect(resolveCoverImageSrc(app, "a.png")).toBe("app://vault/Deep/Nested/a.png");
	});

	it("returns null (never throws) when nothing matches", () => {
		const { app } = makeApp();
		expect(resolveCoverImageSrc(app, "does-not-exist.png")).toBeNull();
		expect(resolveCoverImageSrc(app, "")).toBeNull();
		expect(resolveCoverImageSrc(app, "[[]]")).toBeNull();
	});
});
