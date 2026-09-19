// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

/**
 * Card presentation model (T035, spec §7.13).
 *
 * Shared by every card-based view (Swimlane, Grid, Masonry, Feed, Keep). Pure data: no DOM, no
 * `BasesEntry`, and no layout state (column index, pixel position, virtualization bookkeeping —
 * those belong to each view's own layout strategy, not to the card itself). Building one from
 * an `EntrySnapshot` is `CardMapper`'s job (this module only defines the shape).
 */

import type { NormalizedValue } from '../entries/NormalizedValue';

/** A card's cover image, if any. `kind` distinguishes a vault file from an external URL. */
export interface CardCoverReference {
	kind: 'file' | 'url';
	value: string;
}

/** One property shown on a card (e.g. a badge), in the order the view/user configured. */
export interface CardPropertyPresentation {
	propertyId: string;
	label: string;
	value: NormalizedValue;
}

export interface CardItem {
	/** Vault path; the durable identity for caches, virtual rows, and diffing (spec §11 "Always"). */
	path: string;
	title: string;
	/** `null` when no subtitle property is configured or the note has no value for it. */
	subtitle: string | null;
	/** `null` when no cover property is configured, the note has no value, or it isn't a file/URL. */
	cover: CardCoverReference | null;
	/** Vault path a content preview service (T041+) would render a preview for, or `null` if previews are off. */
	previewPath: string | null;
	tags: string[];
	/** Ordered property badges; a view decides how to render a `missing` value's entry, if at all. */
	properties: CardPropertyPresentation[];
	/** Raw category value for the shared ColorResolver to resolve at render time, or `null`. */
	colorValue: string | null;
	ctime: number;
	mtime: number;
	/** Screen-reader label combining title and subtitle, since a card's visual layout may not. */
	accessibleLabel: string;
}
