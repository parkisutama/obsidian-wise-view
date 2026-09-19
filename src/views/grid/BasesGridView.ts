// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import { BasesView, type QueryController } from 'obsidian';
import type WiseViewPlugin from '../../main';
import { createEntrySnapshot } from '../../platform/bases/entrySnapshotAdapter';
import { ViewConfigReader } from '../../platform/bases/ViewConfigReader';
import { ViewRuntime } from '../../platform/dom/ViewRuntime';
import { RenderScheduler } from '../../platform/dom/RenderScheduler';
import { computeRenderSignature } from '../../platform/bases/changeDetection';
import { GridCollection, type GridItemHandle } from '../../platform/dom/GridCollection';
import { calculateGridColumns } from '../../core/layouts/GridLayout';
import { renderCard, type CardHandle } from '../../platform/dom/CardRenderer';
import { buildGridModel, type GridModel, type GridRow } from './GridModel';
import { gridRequestedProperties, readGridOptions, toCardMappingOptions, type GridOptions } from './gridOptions';

export const BASES_GRID_VIEW_ID = 'wise-view-grid';

interface RowHandle extends GridItemHandle {
	cardHandle?: CardHandle;
}

export class BasesGridView extends BasesView {
	type = BASES_GRID_VIEW_ID;
	private readonly runtime: ViewRuntime;
	private readonly gridEl: HTMLElement;
	private readonly collection: GridCollection<GridRow>;
	private readonly scheduler = new RenderScheduler();
	private readonly collapsedGroups = new Set<string>();
	private currentModel: GridModel = { rows: [] };
	private currentOptions: GridOptions | null = null;

	constructor(controller: QueryController, private readonly containerEl: HTMLElement, private readonly plugin: WiseViewPlugin) {
		super(controller);
		this.runtime = new ViewRuntime(containerEl);
		containerEl.empty();
		containerEl.addClass('wise-view-grid');
		this.gridEl = containerEl.createDiv({ cls: 'wise-view-grid__grid' });
		this.collection = this.runtime.own(new GridCollection<GridRow>(this.gridEl, {
			renderItem: (row) => this.renderRow(row),
			updateItem: (handle, row) => this.updateRow(handle, row),
		}));
	}

	onload(): void {
		this.runtime.addEventListener(this.containerEl, 'click', (event) => this.handleClick(event));
		const ResizeObserverCtor = (this.runtime.win as Window & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
		if (ResizeObserverCtor) {
			const observer = new ResizeObserverCtor((entries) => {
				const width = entries[0]?.contentRect.width ?? this.containerEl.clientWidth;
				this.applyColumnCount(width);
			});
			observer.observe(this.containerEl);
			this.runtime.observe(observer);
		}
	}

	onunload(): void {
		this.runtime.dispose();
		this.containerEl.replaceChildren();
	}

	private applyColumnCount(width: number): void {
		const options = this.currentOptions;
		if (!options) return;
		const { columns } = calculateGridColumns({ containerWidth: width, minColumnWidth: options.minCardWidth, gap: options.gap });
		this.gridEl.style.setProperty('--wise-view-grid-columns', String(columns));
		this.gridEl.style.setProperty('--wise-view-grid-gap', `${options.gap}px`);
	}

	private handleClick(event: Event): void {
		const target = event.target instanceof Element ? event.target : null;
		const groupHeader = target?.closest<HTMLElement>('[data-group-key]');
		if (groupHeader) {
			this.toggleGroup(groupHeader.dataset.groupKey ?? '');
		}
	}

	private toggleGroup(groupKey: string): void {
		if (this.collapsedGroups.has(groupKey)) this.collapsedGroups.delete(groupKey);
		else this.collapsedGroups.add(groupKey);
		this.applyVisibleRows();
	}

	private applyVisibleRows(): void {
		const visible = this.currentModel.rows.filter((row) => row.kind === 'group' || !this.collapsedGroups.has(row.groupKey));
		this.collection.updateItems(visible);
	}

	onDataUpdated(): void {
		if (!this.data?.data) return;
		const config = new ViewConfigReader(this.config);
		const options = readGridOptions(config);
		const order = this.config.getOrder();
		const properties = gridRequestedProperties(options, order);
		const snapshots = this.data.data.map((entry) => createEntrySnapshot(entry, properties));
		const mapping = toCardMappingOptions(options, order, (id) => config.getDisplayName(id));
		const model = buildGridModel(snapshots, options, mapping);

		const signature = computeRenderSignature({
			entries: snapshots.map((snapshot) => ({ path: snapshot.path, mtime: snapshot.mtime })),
			order: order as string[],
			groupKeys: model.rows.filter((row) => row.kind === 'group').map((row) => row.groupKey),
			config: {
				titleProperty: options.titleProperty,
				subtitleProperty: options.subtitleProperty,
				coverProperty: options.coverProperty,
				tagsProperty: options.tagsProperty,
				colorProperty: options.colorProperty,
				groupProperty: options.groupProperty,
				minCardWidth: options.minCardWidth,
				gap: options.gap,
			},
		});
		const decision = this.scheduler.decide(signature);
		if (decision === 'skip') return;

		this.currentOptions = options;
		this.currentModel = model;
		this.applyColumnCount(this.containerEl.clientWidth);
		this.applyVisibleRows();
	}

	private renderRow(row: GridRow): RowHandle {
		if (row.kind === 'group') {
			const element = this.containerEl.ownerDocument.createElement('div');
			element.className = 'wise-view-grid__group';
			element.dataset.groupKey = row.groupKey;
			element.textContent = `${row.label} (${row.count})`;
			return { element, dispose() {} };
		}
		const cardHandle = renderCard(
			this.containerEl.ownerDocument,
			row.item,
			{ app: this.app, hoverParent: this.plugin, sourceId: BASES_GRID_VIEW_ID },
			this.currentOptions?.colorProperty ?? null,
		);
		return { element: cardHandle.element, dispose: () => cardHandle.dispose(), cardHandle };
	}

	private updateRow(handle: GridItemHandle, row: GridRow): void {
		const rowHandle = handle as RowHandle;
		if (row.kind === 'item' && rowHandle.cardHandle) {
			rowHandle.cardHandle.update(row.item);
		} else if (row.kind === 'group') {
			handle.element.textContent = `${row.label} (${row.count})`;
		}
	}
}
