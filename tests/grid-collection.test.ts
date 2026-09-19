// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { GridCollection, type GridItem, type GridItemHandle } from "../src/platform/dom/GridCollection";

function makeHandle(doc: Document, path: string): GridItemHandle & { disposed: boolean } {
	const element = doc.createElement("div");
	element.dataset.path = path;
	const handle = {
		element,
		disposed: false,
		dispose() {
			handle.disposed = true;
		},
	};
	return handle;
}

function items(count: number): GridItem[] {
	return Array.from({ length: count }, (_, i) => ({ path: `item-${i}.md` }));
}

describe("GridCollection", () => {
	it("mounts everything synchronously when the list fits in one batch", () => {
		const container = document.createElement("div");
		const render = vi.fn((item: GridItem) => makeHandle(document, item.path));
		const collection = new GridCollection(container, { batchSize: 40, renderItem: render });

		collection.updateItems(items(10));

		expect(render).toHaveBeenCalledTimes(10);
		expect(collection.mountedCount).toBe(10);
		expect(collection.pendingCount).toBe(0);
		collection.dispose();
	});

	it("does not synchronously mount rich content beyond the batch size for a large fixture", () => {
		const container = document.createElement("div");
		const render = vi.fn((item: GridItem) => makeHandle(document, item.path));
		const collection = new GridCollection(container, { batchSize: 40, renderItem: render });

		collection.updateItems(items(5000));

		expect(render).toHaveBeenCalledTimes(40);
		expect(collection.mountedCount).toBe(40);
		expect(collection.pendingCount).toBe(4960);
		expect(container.children).toHaveLength(5000);
		collection.dispose();
	});

	it("mounts the rest across later animation frames until everything is real", async () => {
		const container = document.createElement("div");
		const render = vi.fn((item: GridItem) => makeHandle(document, item.path));
		const collection = new GridCollection(container, { batchSize: 40, renderItem: render });

		collection.updateItems(items(100));
		expect(collection.mountedCount).toBe(40);

		await new Promise((resolve) => requestAnimationFrame(resolve));
		await new Promise((resolve) => requestAnimationFrame(resolve));
		expect(collection.mountedCount).toBeGreaterThan(40);

		// Let every scheduled frame run out.
		for (let i = 0; i < 10 && collection.pendingCount > 0; i++) {
			await new Promise((resolve) => requestAnimationFrame(resolve));
		}
		expect(collection.pendingCount).toBe(0);
		expect(render).toHaveBeenCalledTimes(100);
		collection.dispose();
	});

	it("keeps DOM order identical to the given item order, mixing real and placeholder elements", () => {
		const container = document.createElement("div");
		const collection = new GridCollection(container, {
			batchSize: 2,
			renderItem: (item) => makeHandle(document, item.path),
		});

		collection.updateItems(items(5));
		expect([...container.children].map((el) => el.getAttribute("data-wise-view-grid-placeholder") !== null)).toEqual([
			false,
			false,
			true,
			true,
			true,
		]);
		collection.dispose();
	});

	it("reuses an already-mounted real handle instead of re-rendering it, calling updateItem", () => {
		const container = document.createElement("div");
		const render = vi.fn((item: GridItem) => makeHandle(document, item.path));
		const update = vi.fn();
		const collection = new GridCollection(container, { batchSize: 40, renderItem: render, updateItem: update });

		collection.updateItems(items(3));
		expect(render).toHaveBeenCalledTimes(3);

		collection.updateItems(items(3));
		expect(render).toHaveBeenCalledTimes(3);
		expect(update).toHaveBeenCalledTimes(3);
		collection.dispose();
	});

	it("disposes the handle of an item that is no longer present", () => {
		const container = document.createElement("div");
		const handles: ReturnType<typeof makeHandle>[] = [];
		const collection = new GridCollection(container, {
			batchSize: 40,
			renderItem: (item) => {
				const handle = makeHandle(document, item.path);
				handles.push(handle);
				return handle;
			},
		});

		collection.updateItems(items(3));
		collection.updateItems(items(2));
		expect(handles[2]?.disposed).toBe(true);
		expect(handles[0]?.disposed).toBe(false);
		collection.dispose();
	});

	it("dispose() releases every mounted handle, cancels pending batches, and clears the DOM", () => {
		const container = document.createElement("div");
		const handles: ReturnType<typeof makeHandle>[] = [];
		const collection = new GridCollection(container, {
			batchSize: 10,
			renderItem: (item) => {
				const handle = makeHandle(document, item.path);
				handles.push(handle);
				return handle;
			},
		});

		collection.updateItems(items(50));
		collection.dispose();

		expect(handles.every((h) => h.disposed)).toBe(true);
		expect(container.children).toHaveLength(0);
	});

	it("is safe to call dispose twice and ignores updateItems after disposal", () => {
		const container = document.createElement("div");
		const collection = new GridCollection(container, { renderItem: (item) => makeHandle(document, item.path) });
		collection.updateItems(items(3));
		collection.dispose();
		expect(() => {
			collection.dispose();
			collection.updateItems(items(3));
		}).not.toThrow();
		expect(container.children).toHaveLength(0);
	});
});
