// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

/**
 * Grid batched mounting and offscreen policy (T038, spec §7.15).
 *
 * Grid relies on native CSS Grid for placement (see `GridLayout.ts`), so this controller's only
 * job is keeping a large collection from synchronously building rich card content for every
 * item at once. Only the first `batchSize` items render immediately; the rest get a lightweight
 * placeholder that is swapped for the real content across subsequent animation frames. DOM
 * order always matches `items`' order — including placeholders — so Bases' own group/path
 * ordering is never disturbed by which items happen to be mounted yet.
 *
 * A CSS `content-visibility: auto` rule was also tried on the mounted wrapper to skip paint work
 * for offscreen cards, but native testing showed Obsidian's Bases scroll container makes
 * Chromium's offscreen heuristic misfire — every mounted card fell back to its intrinsic
 * placeholder size instead of its real content height (src/styles/views/grid.css records this).
 * Large-Base cost containment therefore rests on this controller's batched mounting alone.
 */

export interface GridItem {
	path: string;
}

export interface GridItemHandle {
	element: HTMLElement;
	/** Releases everything this item's handle owns (e.g. a CardHandle's listeners). */
	dispose(): void;
}

export interface GridCollectionOptions<T extends GridItem> {
	/** Items rendered synchronously on `updateItems()`; the rest mount across later frames. Default 40. */
	batchSize?: number;
	renderItem(item: T, index: number): GridItemHandle;
	/** Refreshes an already-mounted, real (non-placeholder) item when its model changes. */
	updateItem?(handle: GridItemHandle, item: T, index: number): void;
}

const PLACEHOLDER_ATTR = 'data-wise-view-grid-placeholder';
const DEFAULT_BATCH_SIZE = 40;

interface Slot<T extends GridItem> {
	item: T;
	handle: GridItemHandle | null; // null while still a placeholder
}

export class GridCollection<T extends GridItem> {
	private readonly win: Window;
	private slots = new Map<string, Slot<T>>();
	private items: readonly T[] = [];
	private rafHandle: number | null = null;
	private disposed = false;

	constructor(
		private readonly containerEl: HTMLElement,
		private readonly options: GridCollectionOptions<T>,
	) {
		this.win = containerEl.ownerDocument.defaultView ?? window;
	}

	/** Real (non-placeholder) items currently mounted. */
	get mountedCount(): number {
		let count = 0;
		for (const slot of this.slots.values()) if (slot.handle) count += 1;
		return count;
	}

	get pendingCount(): number {
		return this.items.length - this.mountedCount;
	}

	updateItems(items: readonly T[]): void {
		if (this.disposed) return;
		this.cancelScheduledBatch();

		const doc = this.containerEl.ownerDocument;
		const previousSlots = this.slots;
		const nextSlots = new Map<string, Slot<T>>();
		const fragment = doc.createDocumentFragment();
		const batchSize = this.options.batchSize ?? DEFAULT_BATCH_SIZE;

		items.forEach((item, index) => {
			const previous = previousSlots.get(item.path);
			previousSlots.delete(item.path);

			if (previous?.handle) {
				this.options.updateItem?.(previous.handle, item, index);
				nextSlots.set(item.path, { item, handle: previous.handle });
				fragment.appendChild(previous.handle.element);
				return;
			}

			if (index < batchSize) {
				const handle = this.options.renderItem(item, index);
				nextSlots.set(item.path, { item, handle });
				fragment.appendChild(handle.element);
				return;
			}

			nextSlots.set(item.path, { item, handle: null });
			fragment.appendChild(this.createPlaceholder());
		});

		// Anything left in previousSlots is no longer present — dispose its handle, if any.
		for (const stale of previousSlots.values()) stale.handle?.dispose();

		this.containerEl.replaceChildren(fragment);
		this.slots = nextSlots;
		this.items = items;

		if (this.pendingCount > 0) this.scheduleNextBatch();
	}

	private createPlaceholder(): HTMLElement {
		const el = this.containerEl.ownerDocument.createElement('div');
		el.setAttribute(PLACEHOLDER_ATTR, 'true');
		return el;
	}

	private scheduleNextBatch(): void {
		this.rafHandle = this.win.requestAnimationFrame(() => {
			this.rafHandle = null;
			this.mountNextBatch();
		});
	}

	private mountNextBatch(): void {
		if (this.disposed) return;
		const batchSize = this.options.batchSize ?? DEFAULT_BATCH_SIZE;
		let mounted = 0;
		this.items.forEach((item, index) => {
			if (mounted >= batchSize) return;
			const slot = this.slots.get(item.path);
			if (!slot || slot.handle) return;
			const handle = this.options.renderItem(item, index);
			const placeholderEl = this.containerEl.children[index];
			placeholderEl?.replaceWith(handle.element);
			this.slots.set(item.path, { item, handle });
			mounted += 1;
		});
		if (this.pendingCount > 0) this.scheduleNextBatch();
	}

	private cancelScheduledBatch(): void {
		if (this.rafHandle !== null) {
			this.win.cancelAnimationFrame(this.rafHandle);
			this.rafHandle = null;
		}
	}

	/** Cancels any scheduled batch, releases every mounted item's handle, and clears the DOM. */
	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.cancelScheduledBatch();
		for (const slot of this.slots.values()) slot.handle?.dispose();
		this.slots.clear();
		this.items = [];
		this.containerEl.replaceChildren();
	}
}
