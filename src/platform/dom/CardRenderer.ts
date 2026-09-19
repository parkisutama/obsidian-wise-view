// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

/**
 * Shared card renderer (T036, spec §7.13).
 *
 * Renders a `CardItem`'s slots (cover, title, subtitle, tags, properties) as regular DOM,
 * through the shared navigation and color services. Has no knowledge of Grid, Masonry, Feed,
 * or Keep — it builds one self-contained, layout-agnostic card element and hands back a handle
 * with an idempotent cleanup function; a view's own layout strategy positions the element
 * (column, absolute pixel position, etc.).
 *
 * The card's root is a native `<button>`, so keyboard activation (Enter/Space) and focus
 * semantics come from the platform for free instead of being reimplemented per view.
 */

import { TFile, type App, type Component } from 'obsidian';
import type { CardItem } from '../../core/cards/CardItem';
import { valueText } from '../../core/entries/valueText';
import { DisposableScope } from './DisposableScope';
import { resolveColor, toCssVariables } from '../colors/ColorResolver';
import { resolvePrettyPropertiesColor } from '../../integrations/PrettyPropertiesAdapter';
import { openPath, triggerHoverPreview } from '../navigation/NavigationService';
import { showOpenFileMenu } from '../../utils/openFile';

export interface CardHandle {
	element: HTMLButtonElement;
	/** Re-renders this card's slots in place for an updated `CardItem` at the same path. */
	update(item: CardItem): void;
	/** Releases every listener this card owns. Safe to call more than once. */
	dispose(): void;
}

export interface CardRendererOptions {
	app: App;
	/** The Component (usually the plugin) Obsidian ties a hover preview's lifetime to. */
	hoverParent: Component;
	/** The registered hover source id — must match the view's `ViewDescriptor.id`. */
	sourceId: string;
	/** Property display name lookup, for a color-by property's category-lookup key. Defaults to the id's suffix. */
	colorPropertyName?: (propertyId: string) => string;
}

function defaultPropertyName(propertyId: string): string {
	const dot = propertyId.lastIndexOf('.');
	return dot >= 0 ? propertyId.slice(dot + 1) : propertyId;
}

const EXTERNAL_COVER_PREFIX = /^(https?:\/\/|app:\/\/)/;
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];

/**
 * Resolves a raw cover value (a wikilink, a bare vault path with or without extension, an
 * already-relative/absolute path, or an external/`app://` URL) to a displayable `<img src>`.
 * Falls back to a vault-wide basename/filename search before giving up, so a cover property
 * written as a short wikilink still resolves. Returns `null` (never throws) when nothing
 * matches — the caller decides whether to omit the cover slot in that case.
 *
 * Shared by every card-based view (T037 moved this out of BasesSwimlaneView.ts, which is the
 * most complete pre-existing implementation).
 */
export function resolveCoverImageSrc(app: App, rawValue: string): string | null {
	if (EXTERNAL_COVER_PREFIX.test(rawValue)) return rawValue;

	const cleanPath = rawValue.replace(/\[\[/g, '').replace(/\]\]/g, '').replace(/\|.*$/, '').trim();
	if (!cleanPath) return null;

	const normalizedPath = cleanPath.replace(/^(\.\.\/)+|^\.\//, '');
	const filename = normalizedPath.split('/').pop() || normalizedPath;

	const direct = app.vault.getAbstractFileByPath(normalizedPath);
	if (direct instanceof TFile) return app.vault.getResourcePath(direct);

	if (!/\.\w+$/.test(normalizedPath)) {
		for (const extension of IMAGE_EXTENSIONS) {
			const withExtension = app.vault.getAbstractFileByPath(normalizedPath + extension);
			if (withExtension instanceof TFile) return app.vault.getResourcePath(withExtension);
		}
	}

	const basenameWithoutExtension = filename.replace(/\.\w+$/, '');
	const match = app.vault.getFiles().find((file) =>
		file.path === normalizedPath
		|| file.path.endsWith(`/${normalizedPath}`)
		|| file.basename === basenameWithoutExtension
		|| file.name === filename);
	return match ? app.vault.getResourcePath(match) : null;
}

/** A `url` cover is used as-is; a `file` cover resolves through `resolveCoverImageSrc`. */
function resolveCoverSrc(app: App, cover: NonNullable<CardItem['cover']>): string | null {
	return cover.kind === 'url' ? cover.value : resolveCoverImageSrc(app, cover.value);
}

function renderSlots(card: HTMLButtonElement, item: CardItem, colorPropertyId: string | null, options: CardRendererOptions): void {
	card.replaceChildren();
	card.dataset.notePath = item.path;
	card.setAttribute('aria-label', item.accessibleLabel);

	const coverSrc = item.cover ? resolveCoverSrc(options.app, item.cover) : null;
	if (coverSrc) {
		const cover = card.createDiv({ cls: 'wise-view-card__cover' });
		const img = cover.createEl('img');
		img.src = coverSrc;
		img.alt = '';
	}

	const body = card.createDiv({ cls: 'wise-view-card__body' });
	body.createDiv({ cls: 'wise-view-card__title', text: item.title });
	if (item.subtitle) {
		body.createDiv({ cls: 'wise-view-card__subtitle', text: item.subtitle });
	}

	if (item.tags.length > 0) {
		const tagsEl = body.createDiv({ cls: 'wise-view-card__tags' });
		for (const tag of item.tags) {
			tagsEl.createSpan({ cls: 'wise-view-card__tag', text: tag });
		}
	}

	if (item.properties.length > 0) {
		const propsEl = body.createDiv({ cls: 'wise-view-card__properties' });
		for (const property of item.properties) {
			if (property.value.kind === 'missing') continue;
			const row = propsEl.createDiv({ cls: 'wise-view-card__property' });
			row.createSpan({ cls: 'wise-view-card__property-label', text: property.label });
			row.createSpan({ cls: 'wise-view-card__property-value', text: valueText(property.value) ?? '' });
		}
	}

	if (item.colorValue) {
		const propertyName = colorPropertyId
			? (options.colorPropertyName ?? defaultPropertyName)(colorPropertyId)
			: defaultPropertyName('color');
		const resolved = resolveColor({
			categoryValue: item.colorValue,
			resolvePrettyPropertiesColor: (value) =>
				resolvePrettyPropertiesColor(card.ownerDocument.defaultView ?? window, card.ownerDocument, propertyName, value),
		});
		for (const [name, value] of Object.entries(toCssVariables(resolved))) {
			card.style.setProperty(name, value);
		}
	} else {
		card.style.removeProperty('--wise-view-color-bg');
		card.style.removeProperty('--wise-view-color-fg');
	}
}

/** Renders one `CardItem` into a new, self-contained card element. */
export function renderCard(doc: Document, item: CardItem, options: CardRendererOptions, colorPropertyId: string | null = null): CardHandle {
	const scope = new DisposableScope();
	const card = doc.createElement('button');
	card.type = 'button';
	card.className = 'wise-view-card';
	renderSlots(card, item, colorPropertyId, options);

	scope.addEventListener(card, 'click', (event) => {
		openPath(options.app, item.path, event as MouseEvent);
	});
	scope.addEventListener(card, 'contextmenu', (event) => {
		if (event instanceof MouseEvent) showOpenFileMenu(options.app, card.dataset.notePath ?? item.path, event);
	});
	scope.addEventListener(card, 'mouseenter', (event) => {
		if (event instanceof MouseEvent) {
			triggerHoverPreview({
				app: options.app,
				hoverParent: options.hoverParent,
				sourceId: options.sourceId,
				event,
				filePath: card.dataset.notePath ?? item.path,
				targetEl: card,
			});
		}
	});

	return {
		element: card,
		update: (nextItem) => renderSlots(card, nextItem, colorPropertyId, options),
		dispose: () => scope.dispose(),
	};
}
