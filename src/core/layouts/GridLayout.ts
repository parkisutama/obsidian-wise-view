// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

/**
 * Pure grid column calculation (T038, spec §7.15).
 *
 * Grid uses native CSS Grid for placement — once the column count and width are known, the
 * browser positions every item, so there is no per-item pixel math to do here (unlike Masonry's
 * shortest-column placement). This module only answers "how many equal columns fit, and how
 * wide is each one" for a given container width, minimum column width, and gap, deterministically
 * and without touching the DOM.
 */

export interface GridColumnsInput {
	containerWidth: number;
	minColumnWidth: number;
	gap: number;
	/** Caps the column count regardless of available width (e.g. for a narrow-pane mobile mode). */
	maxColumns?: number;
}

export interface GridColumns {
	columns: number;
	columnWidth: number;
}

/**
 * Fits as many `minColumnWidth`-or-wider equal columns as possible into `containerWidth`,
 * accounting for `gap` between them. Never returns zero columns or a negative width, even for
 * a zero/negative/non-finite input — those clamp to a safe single narrow column instead.
 */
export function calculateGridColumns(input: GridColumnsInput): GridColumns {
	const width = Number.isFinite(input.containerWidth) ? Math.max(0, input.containerWidth) : 0;
	const minWidth = Number.isFinite(input.minColumnWidth) && input.minColumnWidth > 0 ? input.minColumnWidth : 1;
	const gap = Number.isFinite(input.gap) && input.gap > 0 ? input.gap : 0;

	let columns = Math.max(1, Math.floor((width + gap) / (minWidth + gap)));
	if (input.maxColumns && input.maxColumns > 0) {
		columns = Math.min(columns, Math.floor(input.maxColumns));
	}

	const columnWidth = columns > 0 ? Math.max(0, (width - (columns - 1) * gap) / columns) : width;
	return { columns, columnWidth };
}
