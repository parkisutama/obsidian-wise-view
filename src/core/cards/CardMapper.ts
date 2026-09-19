// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

/**
 * Card mapping (T035, spec §7.13).
 *
 * Builds a `CardItem` from an `EntrySnapshot` and a view's card configuration. Pure and
 * deterministic: a missing or malformed value always resolves to the same documented fallback
 * (never thrown, never silently different across calls) — title falls back to the file's own
 * basename, everything else optional falls back to `null`/`[]`.
 */

import type { EntrySnapshot } from '../entries/EntrySnapshot';
import { MISSING_VALUE } from '../entries/NormalizedValue';
import { valueText } from '../entries/valueText';
import type { CardCoverReference, CardItem, CardPropertyPresentation } from './CardItem';

const EXTERNAL_URL = /^[a-z][a-z0-9+.-]*:\/\//i;

export interface CardMappingOptions {
	titleProperty: string | null;
	subtitleProperty: string | null;
	coverProperty: string | null;
	/** A list-valued property (or a single value, wrapped as one tag). */
	tagsProperty: string | null;
	colorProperty: string | null;
	/** Whether this view's content-preview capability (T041+) should target this card's own note. */
	previewEnabled: boolean;
	/** Ordered property ids to present as badges, each with its display label. */
	properties: ReadonlyArray<{ propertyId: string; label: string }>;
}

function mapCover(text: string | null): CardCoverReference | null {
	if (!text) return null;
	return { kind: EXTERNAL_URL.test(text) ? 'url' : 'file', value: text };
}

function mapTags(entry: EntrySnapshot, tagsProperty: string | null): string[] {
	if (!tagsProperty) return [];
	const value = entry.values.get(tagsProperty);
	if (!value || value.kind === 'missing') return [];
	if (value.kind === 'list') {
		return value.items.map(valueText).filter((item): item is string => item != null);
	}
	const single = valueText(value);
	return single ? [single] : [];
}

function accessibleLabel(title: string, subtitle: string | null): string {
	return subtitle ? `${title}, ${subtitle}` : title;
}

/** Maps one entry snapshot to a `CardItem`. Reads only the properties `options` names. */
export function mapEntryToCardItem(entry: EntrySnapshot, options: CardMappingOptions): CardItem {
	const title = (options.titleProperty && valueText(entry.values.get(options.titleProperty))) || entry.basename;
	const subtitle = options.subtitleProperty ? valueText(entry.values.get(options.subtitleProperty)) : null;
	const cover = mapCover(options.coverProperty ? valueText(entry.values.get(options.coverProperty)) : null);
	const colorValue = options.colorProperty ? valueText(entry.values.get(options.colorProperty)) : null;

	const properties: CardPropertyPresentation[] = options.properties.map(({ propertyId, label }) => ({
		propertyId,
		label,
		value: entry.values.get(propertyId) ?? MISSING_VALUE,
	}));

	return {
		path: entry.path,
		title,
		subtitle,
		cover,
		previewPath: options.previewEnabled ? entry.path : null,
		tags: mapTags(entry, options.tagsProperty),
		properties,
		colorValue,
		ctime: entry.ctime,
		mtime: entry.mtime,
		accessibleLabel: accessibleLabel(title, subtitle),
	};
}

/** Maps every entry snapshot to a `CardItem`, preserving order. */
export function mapEntriesToCardItems(entries: readonly EntrySnapshot[], options: CardMappingOptions): CardItem[] {
	return entries.map(entry => mapEntryToCardItem(entry, options));
}
