// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

let nextLabelId = 0;

/**
 * Obsidian turns every `aria-label` into a hover tooltip. The chart library names its whole
 * treegrid `aria-label="Gantt chart"`, so a bubble reading "Gantt chart" followed the pointer
 * across the entire chart. The accessible name moves to `aria-labelledby` on a hidden element, which
 * keeps the name for screen readers and gives Obsidian nothing to show. Labels on small controls
 * (delete dependency, close panel) stay: a tooltip is useful there.
 */
export class TooltipGuard {
	private readonly observer: MutationObserver;
	private label: HTMLElement | null = null;

	constructor(private readonly root: HTMLElement, win: Window) {
		const MutationObserverCtor = (win as Window & { MutationObserver: typeof MutationObserver }).MutationObserver;
		this.observer = new MutationObserverCtor(() => this.sweep());
		this.observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-label'] });
	}

	/** Idempotent; safe to call after every render. */
	sweep(): void {
		for (const grid of Array.from(this.root.querySelectorAll<HTMLElement>('[role="treegrid"][aria-label]'))) {
			const name = grid.getAttribute('aria-label') ?? '';
			grid.removeAttribute('aria-label');
			if (!name) continue;
			const label = this.ensureLabel();
			label.textContent = name;
			grid.setAttribute('aria-labelledby', label.id);
		}
	}

	private ensureLabel(): HTMLElement {
		if (this.label?.isConnected) return this.label;
		const label = this.root.ownerDocument.createElement('span');
		label.id = `gantt-beta-label-${nextLabelId++}`;
		label.className = 'gantt-sr-only';
		this.root.appendChild(label);
		this.label = label;
		return label;
	}

	dispose(): void {
		this.observer.disconnect();
		this.label?.remove();
		this.label = null;
	}
}
