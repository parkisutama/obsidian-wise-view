// SPDX-License-Identifier: GPL-3.0-only
// Derived from Planner (https://github.com/SawyerRensel/Planner): src/views/BasesSwimlaneView.ts
// Copyright (C) 2025 Sawyer Rensel
// Modifications Copyright (C) 2026 Parkis Utama

import {
  BasesView,
  BasesViewRegistration,
  BasesAllOptions,
  BasesViewConfig,
  BasesPropertyId,
  QueryController,
  setIcon,
  TFolder,
  Notice,
  normalizePath,
} from 'obsidian';
import type WiseViewPlugin from '../main';
import { formatDate, getEntryValue, looksLikeDateString, valueToString } from './swimlane/values';
import type { BadgePlacement, BorderStyle, CoverDisplay, FreezeHeaders, SwimHeaderDisplay } from './swimlane/types';
import { DragController } from './swimlane/dragAndDrop';
import { CardRenderer } from './swimlane/cardRenderer';
import { createSwimlaneOptions } from './swimlane/options';
import { COLUMN_ORDER_KEY, SWIMLANE_ORDER_KEY, orderKeys, parseCustomOrder, reorderKeys } from './swimlane/ordering';
import { showOpenFileMenu } from '../utils/openFile';
import { ViewRuntime } from '../platform/dom/ViewRuntime';
import type { EntrySnapshot } from '../core/entries/EntrySnapshot';
import type { NormalizedValue } from '../core/entries/NormalizedValue';
import { createEntrySnapshot } from '../platform/bases/entrySnapshotAdapter';
import { resolveColor } from '../platform/colors/ColorResolver';
import { resolvePrettyPropertiesColor } from '../integrations/PrettyPropertiesAdapter';
import { openPath, triggerHoverPreview as dispatchHoverPreview } from '../platform/navigation/NavigationService';
import { LegacyMutationGateway } from '../platform/mutations/LegacyMutationGateway';
import { getContrastColor } from '../utils/colorUtils';
import { resolveCoverImageSrc } from '../platform/dom/CoverImageResolver';


export const BASES_SWIMLANE_VIEW_ID = 'wise-view-swimlane';


/**
 * Virtual scroll threshold - enables virtual scrolling when column has 15+ cards
 */
const VIRTUAL_SCROLL_THRESHOLD = 15;

/**
 * Swimlane view for Obsidian Bases
 * Displays items in a drag-and-drop board with configurable columns
 */
export class BasesSwimlaneView extends BasesView {
  type = BASES_SWIMLANE_VIEW_ID;
  private plugin: WiseViewPlugin;
  private containerEl: HTMLElement;
  private readonly runtime: ViewRuntime;
  private readonly mutations: LegacyMutationGateway;
  private readonly cardRenderer: CardRenderer;
  private readonly drag: DragController;
  private boardEl: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;

  // Keyboard navigation state
  private focusedCardIndex: number = -1;
  private keyboardHandler: ((e: KeyboardEvent) => void) | null = null;

  // Render debouncing
  private renderDebounceTimer: number | null = null;
  private static readonly RENDER_DEBOUNCE_MS = 50;

  // Configuration getters
  private getGroupBy(): string {
    const value = this.config.get('plannerGroupBy') as string | undefined;
    return value || this.plugin.settings.swimlaneDefaults.plannerGroupBy;
  }

  private getSwimlaneBy(): string | null {
    const value = this.config.get('swimlaneBy') as string | undefined;
    return value || this.plugin.settings.swimlaneDefaults.swimlaneBy || null;
  }

  private getColorBy(): string {
    const value = this.config.get('colorBy') as string | undefined;
    return value || this.plugin.settings.swimlaneDefaults.colorBy || '';
  }

  /** Title property; null means the card shows the file name. */
  private getTitleBy(): string | null {
    const value = this.config.get('titleBy') as string | undefined;
    return value || null;
  }

  private getBorderStyle(): BorderStyle {
    const value = this.config.get('borderStyle') as string | undefined;
    return (value as BorderStyle) || (this.plugin.settings.swimlaneDefaults.borderStyle as BorderStyle) || 'left-accent';
  }

  private getCoverField(): string | null {
    const value = this.config.get('coverField') as string | undefined;
    return value || null;
  }

  private getCoverDisplay(): CoverDisplay {
    const value = this.config.get('coverDisplay') as string | undefined;
    return (value as CoverDisplay) || 'banner';
  }

  private getSummaryField(): string | null {
    const value = this.config.get('summaryField') as string | undefined;
    return value || null;
  }

  private getDateStartField(): string {
    const value = this.config.get('dateStartField') as string | undefined;
    return value || this.plugin.settings.swimlaneDefaults.dateStartField || '';
  }

  private getDateEndField(): string {
    const value = this.config.get('dateEndField') as string | undefined;
    return value || this.plugin.settings.swimlaneDefaults.dateEndField || '';
  }

  private getDateFormat(): string {
    const value = this.config.get('dateFormat') as string | undefined;
    return value || 'date-short';
  }

  private getBadgePlacement(): BadgePlacement {
    const value = this.config.get('badgePlacement') as string | undefined;
    return (value as BadgePlacement) || (this.plugin.settings.swimlaneDefaults.badgePlacement as BadgePlacement) || 'properties-section';
  }

  private getColumnWidth(): number {
    const value = this.config.get('columnWidth') as string | number | undefined;
    if (typeof value === 'string') return parseInt(value, 10) || this.plugin.settings.swimlaneDefaults.columnWidth;
    return value || this.plugin.settings.swimlaneDefaults.columnWidth;
  }

  private getHideEmptyColumns(): boolean {
    const value = this.config.get('hideEmptyColumns') as string | boolean | undefined;
    if (typeof value === 'string') return value === 'true';
    return value ?? this.plugin.settings.swimlaneDefaults.hideEmptyColumns;
  }

  private getFreezeHeaders(): FreezeHeaders {
    const value = this.config.get('freezeHeaders') as string | undefined;
    return (value as FreezeHeaders) || (this.plugin.settings.swimlaneDefaults.freezeHeaders as FreezeHeaders) || 'none';
  }

  private getSwimHeaderDisplay(): SwimHeaderDisplay {
    const value = this.config.get('swimHeaderDisplay') as string | undefined;
    return (value as SwimHeaderDisplay) || 'vertical';
  }

  private getShowPropertyLabels(): boolean {
    const value = this.config.get('showPropertyLabels') as string | boolean | undefined;
    if (value === 'false' || value === false) return false;
    if (value === 'true' || value === true) return true;
    return this.plugin.settings.swimlaneDefaults.showPropertyLabels ?? true;
  }

  private getCustomColumnOrder(): string[] {
    return parseCustomOrder(this.config.get(COLUMN_ORDER_KEY));
  }

  private setCustomColumnOrder(order: string[]): void {
    this.config.set(COLUMN_ORDER_KEY, JSON.stringify(order));
  }

  private getCustomSwimlaneOrder(): string[] {
    return parseCustomOrder(this.config.get(SWIMLANE_ORDER_KEY));
  }

  private setCustomSwimlaneOrder(order: string[]): void {
    this.config.set(SWIMLANE_ORDER_KEY, JSON.stringify(order));
  }

  private getCoverHeight(): number {
    const value = this.config.get('coverHeight') as string | number | undefined;
    if (typeof value === 'string') {
      return parseInt(value, 10) || 100;
    }
    return value || 100;
  }

  /**
   * Get the list of visible properties from Bases config
   */
  /** Properties chosen in the Bases "Properties" menu; none are assumed by default. */
  private getVisibleProperties(): string[] {
    return this.config.getOrder();
  }

  constructor(
    controller: QueryController,
    containerEl: HTMLElement,
    plugin: WiseViewPlugin
  ) {
    super(controller);
    this.plugin = plugin;
    this.containerEl = containerEl;
    this.runtime = new ViewRuntime(containerEl);
    this.mutations = new LegacyMutationGateway(this.plugin.app);
    this.drag = new DragController({
      containerEl,
      getDoc: () => this.runtime.doc,
      getBoardEl: () => this.boardEl,
      hasSwimlanes: () => Boolean(this.getSwimlaneBy()),
      reorderColumns: (dragged, target, before) => this.reorderColumns(dragged, target, before),
      reorderSwimlanes: (dragged, target, before) => this.reorderSwimlanes(dragged, target, before),
      dropCard: (filePath, group, swimlane) => { void this.handleCardDrop(filePath, group, swimlane); },
    });
    this.cardRenderer = new CardRenderer({
      getBorderStyle: () => this.getBorderStyle(),
      getCoverField: () => this.getCoverField(),
      getCoverDisplay: () => this.getCoverDisplay(),
      getCoverHeight: () => this.getCoverHeight(),
      getBadgePlacement: () => this.getBadgePlacement(),
      getTitleBy: () => this.getTitleBy(),
      getSummaryField: () => this.getSummaryField(),
      getVisibleProperties: () => this.getVisibleProperties(),
      getDateFormat: () => this.getDateFormat(),
      getGroupBy: () => this.getGroupBy(),
      getDateStartField: () => this.getDateStartField(),
      getDateEndField: () => this.getDateEndField(),
      getShowPropertyLabels: () => this.getShowPropertyLabels(),
      getEntryColor: entry => this.getEntryColor(entry),
      getConfiguredFieldColor: (fieldId, value) => this.getConfiguredFieldColor(fieldId, value),
      getDisplayName: propId => this.config.getDisplayName(propId),
      resolveImagePath: path => resolveCoverImageSrc(this.plugin.app, path),
    });
    this.setupContainer();
    this.setupResizeObserver();
    this.setupKeyboardNavigation();
    this.registerRuntimeCleanup();
  }

  /**
   * Registers every teardown once; each closure reads current field state at dispose time, so
   * it stays correct no matter how many times render()/setup has replaced that state. Covers
   * resize/keyboard/debounce/virtual-scroll cleanup plus forcing any in-flight touch/mouse
   * drag (card or swimlane reordering) to release its clone, timers, and interval instead of
   * leaking them if the view unloads mid-gesture.
   */
  private registerRuntimeCleanup(): void {
    this.runtime.add(() => {
      this.resizeObserver?.disconnect();
      this.resizeObserver = null;
    });
    this.runtime.add(() => {
      if (this.renderDebounceTimer !== null) {
        window.clearTimeout(this.renderDebounceTimer);
        this.renderDebounceTimer = null;
      }
    });
    this.runtime.add(() => this.cleanupVirtualScroll());
    this.runtime.add(() => {
      if (this.keyboardHandler) {
        this.containerEl.removeEventListener('keydown', this.keyboardHandler);
        this.keyboardHandler = null;
      }
      this.containerEl.removeAttribute('tabindex');
    });
    this.runtime.add(() => this.containerEl.removeClass('planner-bases-kanban'));
    this.runtime.add(() => this.drag.cancelAll());
  }

  /**
   * Setup keyboard navigation for the Swimlane board
   * Allows navigating between cards with arrow keys
   */
  private setupKeyboardNavigation(): void {
    this.keyboardHandler = (e: KeyboardEvent) => {
      // Only handle if board is focused or a card is focused
      const active = this.runtime.doc.activeElement;
      if (!this.boardEl?.contains(active) && active !== this.containerEl) {
        return;
      }

      const cards = this.getAllCards();
      if (cards.length === 0) return;

      switch (e.key) {
        case 'ArrowDown':
        case 'j': // vim-style
          e.preventDefault();
          this.navigateCards(cards, 'down');
          break;
        case 'ArrowUp':
        case 'k': // vim-style
          e.preventDefault();
          this.navigateCards(cards, 'up');
          break;
        case 'ArrowRight':
        case 'l': // vim-style
          e.preventDefault();
          this.navigateCards(cards, 'right');
          break;
        case 'ArrowLeft':
        case 'h': // vim-style
          e.preventDefault();
          this.navigateCards(cards, 'left');
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          this.activateFocusedCard();
          break;
        case 'Escape':
          e.preventDefault();
          this.clearCardFocus();
          break;
      }
    };

    this.containerEl.addEventListener('keydown', this.keyboardHandler);
    // Make container focusable
    this.containerEl.setAttribute('tabindex', '0');
  }

  /**
   * Get all card elements in the board
   */
  private getAllCards(): HTMLElement[] {
    if (!this.boardEl) return [];
    return Array.from(this.boardEl.querySelectorAll('.planner-kanban-card'));
  }

  /**
   * Navigate between cards using arrow keys
   */
  private navigateCards(cards: HTMLElement[], direction: 'up' | 'down' | 'left' | 'right'): void {
    const currentFocused = this.boardEl?.querySelector('.planner-kanban-card--focused') as HTMLElement | null;
    let currentIndex = currentFocused ? cards.indexOf(currentFocused) : -1;

    if (currentIndex === -1) {
      // No card focused, focus first card
      this.focusCard(cards[0] ?? null);
      return;
    }

    // Get cards organized by columns for left/right navigation
    if (direction === 'left' || direction === 'right') {
      const columnCards = this.getCardsByColumn();
      const currentCard = cards[currentIndex];
      if (!currentCard) return;
      const currentColumn = currentCard.closest('[data-group]') as HTMLElement;
      const currentGroup = currentColumn?.getAttribute('data-group');

      if (!currentGroup) return;

      const columnKeys = Array.from(columnCards.keys());
      const currentColumnIndex = columnKeys.indexOf(currentGroup);
      const targetColumnIndex = direction === 'right'
        ? Math.min(currentColumnIndex + 1, columnKeys.length - 1)
        : Math.max(currentColumnIndex - 1, 0);

      const targetColumnKey = columnKeys[targetColumnIndex];
      if (!targetColumnKey) return;
      const targetColumnCards = columnCards.get(targetColumnKey) || [];

      if (targetColumnCards.length > 0) {
        // Find card at same position in target column, or last card
        const currentColumnCards = columnCards.get(currentGroup) || [];
        const positionInColumn = currentColumnCards.indexOf(currentCard);
        const targetCard = targetColumnCards[Math.min(positionInColumn, targetColumnCards.length - 1)];
        this.focusCard(targetCard ?? null);
      }
    } else {
      // Up/down navigation within column
      const currentCard = cards[currentIndex];
      if (!currentCard) return;
      const currentColumn = currentCard.closest('[data-group]') as HTMLElement;
      const cardsInColumn = Array.from(currentColumn?.querySelectorAll<HTMLElement>('.planner-kanban-card') || []);
      const positionInColumn = cardsInColumn.indexOf(currentCard);

      let targetIndex: number;
      if (direction === 'down') {
        targetIndex = Math.min(positionInColumn + 1, cardsInColumn.length - 1);
      } else {
        targetIndex = Math.max(positionInColumn - 1, 0);
      }

      this.focusCard(cardsInColumn[targetIndex] ?? null);
    }
  }

  /**
   * Get cards organized by column
   */
  private getCardsByColumn(): Map<string, HTMLElement[]> {
    const result = new Map<string, HTMLElement[]>();
    if (!this.boardEl) return result;

    const columns = this.boardEl.querySelectorAll('[data-group]');
    columns.forEach(column => {
      const group = column.getAttribute('data-group');
      if (group) {
        const cards = Array.from(column.querySelectorAll<HTMLElement>('.planner-kanban-card'));
        if (cards.length > 0) {
          result.set(group, cards);
        }
      }
    });

    return result;
  }

  /**
   * Focus a specific card
   */
  private focusCard(card: HTMLElement | null): void {
    if (!card) return;

    // Remove focus from all cards
    this.boardEl?.querySelectorAll('.planner-kanban-card--focused').forEach(el => {
      el.classList.remove('planner-kanban-card--focused');
    });

    // Add focus to target card
    card.classList.add('planner-kanban-card--focused');
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // Update focus index
    const cards = this.getAllCards();
    this.focusedCardIndex = cards.indexOf(card);
  }

  /**
   * Activate (click) the currently focused card
   */
  private activateFocusedCard(): void {
    const focused = this.boardEl?.querySelector('.planner-kanban-card--focused') as HTMLElement | null;
    if (focused) {
      focused.click();
    }
  }

  /**
   * Clear card focus
   */
  private clearCardFocus(): void {
    this.boardEl?.querySelectorAll('.planner-kanban-card--focused').forEach(el => {
      el.classList.remove('planner-kanban-card--focused');
    });
    this.focusedCardIndex = -1;
  }

  private setupContainer(): void {
    this.containerEl.empty();
    this.containerEl.addClass('planner-bases-kanban');

    this.boardEl = this.containerEl.createDiv({ cls: 'planner-kanban-board' });
  }

  private setupResizeObserver(): void {
    this.resizeObserver = new ResizeObserver(() => {
      // Handle resize if needed
    });
    this.resizeObserver.observe(this.containerEl);
  }

  onDataUpdated(): void {
    // Debounce rapid data updates to prevent performance issues
    if (this.renderDebounceTimer !== null) {
      window.clearTimeout(this.renderDebounceTimer);
    }
    this.renderDebounceTimer = window.setTimeout(() => {
      this.renderDebounceTimer = null;
      this.render();
    }, BasesSwimlaneView.RENDER_DEBOUNCE_MS);
  }

  onunload(): void {
    // Resize/debounce/virtual-scroll/keyboard cleanup and forcing any in-flight drag to
    // release its clone/timers/interval all run through the runtime's DisposableScope,
    // registered once in the constructor; dispose() is idempotent.
    this.runtime.dispose();
  }

  private render(): void {
    // Clean up virtual scroll observers before re-render
    this.cleanupVirtualScroll();

    if (!this.boardEl || !this.boardEl.isConnected) {
      this.setupContainer();
    }

    if (this.boardEl) {
      this.boardEl.empty();
    }

    // Build color map for colorBy field
    // Check if swimlanes are enabled
    const swimlaneBy = this.getSwimlaneBy();
    const snapshots = this.createSnapshots();

    // No column property is assumed: ask for one instead of guessing (e.g. "status").
    if (!this.getGroupBy()) {
      this.boardEl?.createDiv({
        cls: 'planner-empty',
        text: 'Choose a property in "Columns by" to build the board.',
      });
      return;
    }

    if (swimlaneBy) {
      // Render with swimlanes (2D grid)
      this.renderWithSwimlanes(swimlaneBy, snapshots);
    } else {
      // Group entries by the groupBy field
      const groups = this.groupEntriesByField(snapshots);
      // Render columns
      this.renderColumns(groups);
    }
  }

  private createSnapshots(): EntrySnapshot[] {
    const propertyIds = [
      this.getGroupBy(),
      this.getSwimlaneBy(),
      this.getColorBy(),
      this.getTitleBy(),
      this.getCoverField(),
      this.getSummaryField(),
      this.getDateStartField(),
      this.getDateEndField(),
      ...this.getVisibleProperties(),
    ].filter((id): id is BasesPropertyId => Boolean(id));
    const uniquePropertyIds = [...new Set(propertyIds)];
    return this.data.groupedData.flatMap(group =>
      group.entries.map(entry => createEntrySnapshot(entry, uniquePropertyIds))
    );
  }

  private getEntryColor(entry: EntrySnapshot): string {
    const colorByField = this.getColorBy();
    const value = getEntryValue(entry, colorByField);
    if (!value) return resolveColor({ categoryValue: '' }).background;
    const strValue = valueToString(Array.isArray(value) ? value[0] : value);
    return this.getFieldValueColor(colorByField, strValue);
  }

  /**
   * Resolve a field/value color through the shared color and Pretty Properties services.
   */
  private getFieldValueColor(fieldId: string, value: string, solid = false): string {
    return this.resolveFieldColor(fieldId, value, solid).background;
  }

  /**
   * Like getFieldValueColor but returns null when only the hash fallback would fire.
   * Use this for generic badges so the CSS theme default is preserved when no
   * explicit color is configured via Pretty Properties or Planner valueStyles.
   */
  private getConfiguredFieldColor(fieldId: string, value: string): string | null {
    const resolved = this.resolveFieldColor(fieldId, value, false);
    return resolved.source === 'fallback' ? null : resolved.background;
  }

  private resolveFieldColor(fieldId: string, value: string, solid: boolean) {
    const propName = fieldId.split('.').pop() || fieldId;
    return resolveColor({
      categoryValue: value,
      resolvePrettyPropertiesColor: categoryValue => resolvePrettyPropertiesColor(
        this.runtime.win,
        this.runtime.doc,
        propName,
        categoryValue,
        solid ? 1 : 0.4,
      ),
      valueStyleColor: this.plugin.settings.valueStyles[fieldId]?.[value]?.color ?? null,
    });
  }

  private groupEntriesByField(entries: readonly EntrySnapshot[]): Map<string, EntrySnapshot[]> {
    const groupByField = this.getGroupBy();
    const groups = new Map<string, EntrySnapshot[]>();

    for (const entry of entries) {
        const value = getEntryValue(entry, groupByField);
        const groupKey = valueToString(value);

        if (!groups.has(groupKey)) {
          groups.set(groupKey, []);
        }
        groups.get(groupKey)!.push(entry);
    }

    return groups;
  }

  /**
   * Get ordered column keys based on the groupBy field and custom order
   */
  private getColumnKeys(groups: Map<string, EntrySnapshot[]>): string[] {
    return orderKeys(groups.keys(), this.getCustomColumnOrder());
  }

  /**
   * Get ordered swimlane keys based on the swimlaneBy field and custom order
   */
  private getOrderedSwimlaneKeys(swimlaneKeys: string[], _swimlaneBy: string): string[] {
    return orderKeys(swimlaneKeys, this.getCustomSwimlaneOrder());
  }

  /**
   * Compute the optimal horizontal swimlane label width based on the longest
   * swimlane key text.  Uses an off-screen canvas for fast measurement without
   * triggering DOM reflow.
   *
   * Layout budget per label (horizontal):
   *   padding(8×2) + grabHandle(14) + gap(6) + dot(10) + gap(6) + text + gap(6) + countBadge(~32)
   *   ≈ 90px fixed overhead
   */
  private computeSwimlaneHorizontalWidth(swimlaneKeys: string[]): number {
    const MIN_WIDTH = 100;
    const MAX_WIDTH = 260;
    const FIXED_OVERHEAD = 90; // grab + dot + gaps + padding + count badge

    if (swimlaneKeys.length === 0) return MIN_WIDTH;

    // Measure longest text using an off-screen canvas
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return MIN_WIDTH;

    // Match the swimlane label font (13px, 600 weight, Obsidian's default font stack)
    const computedFont = getComputedStyle(this.containerEl).fontFamily || 'sans-serif';
    ctx.font = `600 13px ${computedFont}`;

    let maxTextWidth = 0;
    for (const key of swimlaneKeys) {
      const w = ctx.measureText(key).width;
      if (w > maxTextWidth) maxTextWidth = w;
    }

    const idealWidth = Math.ceil(maxTextWidth + FIXED_OVERHEAD);
    return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, idealWidth));
  }

  /**
   * Render with swimlanes (2D grid layout)
   */
  private renderWithSwimlanes(swimlaneBy: string, entries: readonly EntrySnapshot[]): void {
    if (!this.boardEl) return;

    const columnWidth = this.getColumnWidth();
    const hideEmpty = this.getHideEmptyColumns();
    const groupByField = this.getGroupBy();
    const freezeHeaders = this.getFreezeHeaders();
    const freezeColumns = freezeHeaders === 'columns' || freezeHeaders === 'both';
    const freezeSwimlanes = freezeHeaders === 'swimlanes' || freezeHeaders === 'both';
    const swimHeaderDisplay = this.getSwimHeaderDisplay();
    const isVerticalSwimHeader = swimHeaderDisplay === 'vertical';

    // First, collect all entries and group by swimlane then by column
    const swimlaneGroups = new Map<string, Map<string, EntrySnapshot[]>>();
    const allColumnKeys = new Set<string>();

    for (const entry of entries) {
        const swimlaneValue = getEntryValue(entry, swimlaneBy);
        const swimlaneKey = valueToString(swimlaneValue);

        const columnValue = getEntryValue(entry, groupByField);
        const columnKey = valueToString(columnValue);

        allColumnKeys.add(columnKey);

        if (!swimlaneGroups.has(swimlaneKey)) {
          swimlaneGroups.set(swimlaneKey, new Map());
        }
        const swimlane = swimlaneGroups.get(swimlaneKey)!;

        if (!swimlane.has(columnKey)) {
          swimlane.set(columnKey, []);
        }
        swimlane.get(columnKey)!.push(entry);
    }

    // Get sorted column keys
    const columnKeys = this.getColumnKeys(new Map([...allColumnKeys].map(k => [k, []])));
    const swimlaneKeys = Array.from(swimlaneGroups.keys()).sort();

    // Calculate dynamic swimlane label width based on longest text
    const swimLabelWidth = isVerticalSwimHeader
      ? 48
      : this.computeSwimlaneHorizontalWidth(swimlaneKeys);

    // Create swimlane container
    const swimlaneContainer = document.createElement('div');
    swimlaneContainer.className = 'planner-kanban-swimlanes';
    swimlaneContainer.setCssProps({ '--swim-label-width': `${swimLabelWidth}px` });

    // Calculate column totals across all swimlanes
    const columnCounts = new Map<string, number>();
    for (const columnKey of columnKeys) {
      let total = 0;
      for (const swimlane of swimlaneGroups.values()) {
        total += (swimlane.get(columnKey) || []).length;
      }
      columnCounts.set(columnKey, total);
    }

    // Render column headers row first
    const headerRow = document.createElement('div');
    headerRow.className = 'planner-kanban-header-row';
    if (freezeColumns) {
      headerRow.classList.add('planner-kanban-header-row--frozen');
    }

    for (const columnKey of columnKeys) {
      const headerCell = document.createElement('div');
      headerCell.className = 'planner-kanban-swimlane-header-cell';
      headerCell.setAttribute('data-group', columnKey);
      headerCell.setCssProps({ '--column-width': `${columnWidth}px` });

      // Grab handle for column reordering (CSS handles styles and hover states)
      const grabHandle = document.createElement('span');
      grabHandle.className = 'planner-kanban-column-grab';
      setIcon(grabHandle, 'grip-vertical');
      grabHandle.setAttribute('draggable', 'true');
      this.drag.setupSwimlaneColumnDragHandlers(grabHandle, headerCell, columnKey);
      headerCell.appendChild(grabHandle);

      // Color dot for column (uses Pretty Properties / valueStyles / hash)
      {
        const dotEl = document.createElement('span');
        dotEl.className = 'planner-kanban-column-dot';
        dotEl.style.backgroundColor = this.getFieldValueColor(groupByField, columnKey, true);
        headerCell.appendChild(dotEl);
      }

      // Title (CSS class handles flex: 1)
      const titleSpan = document.createElement('span');
      titleSpan.className = 'planner-kanban-column-title';
      titleSpan.textContent = columnKey;
      headerCell.appendChild(titleSpan);

      // Count badge (CSS class handles all styles)
      const count = columnCounts.get(columnKey) || 0;
      const countBadge = document.createElement('span');
      countBadge.className = 'planner-kanban-column-count';
      countBadge.textContent = String(count);
      headerCell.appendChild(countBadge);

      headerRow.appendChild(headerCell);
    }
    swimlaneContainer.appendChild(headerRow);

    // Calculate swimlane counts
    const swimlaneCounts = new Map<string, number>();
    for (const [swimlaneKey, swimlane] of swimlaneGroups) {
      let total = 0;
      for (const entries of swimlane.values()) {
        total += entries.length;
      }
      swimlaneCounts.set(swimlaneKey, total);
    }

    // Get ordered swimlane keys
    const orderedSwimlaneKeys = this.getOrderedSwimlaneKeys(swimlaneKeys, swimlaneBy);

    // Render each swimlane row
    for (const swimlaneKey of orderedSwimlaneKeys) {
      const swimlaneRow = document.createElement('div');
      swimlaneRow.className = 'planner-kanban-swimlane-row';
      swimlaneRow.setAttribute('data-swimlane-row', swimlaneKey);

      // Swimlane label with drag handle, icon, title, and count
      const swimlaneLabel = document.createElement('div');
      swimlaneLabel.setAttribute('data-swimlane', swimlaneKey);

      if (isVerticalSwimHeader) {
        swimlaneLabel.className = 'planner-kanban-swimlane-label planner-kanban-swimlane-label--vertical';
        if (freezeSwimlanes) {
          swimlaneLabel.classList.add('planner-kanban-swimlane-label--frozen');
        }
      } else {
        swimlaneLabel.className = 'planner-kanban-swimlane-label planner-kanban-swimlane-label--horizontal';
        if (freezeSwimlanes) {
          swimlaneLabel.classList.add('planner-kanban-swimlane-label--frozen');
        }
      }

      // Header row with grab handle, icon, and title
      const labelHeader = document.createElement('div');
      if (isVerticalSwimHeader) {
        labelHeader.className = 'planner-kanban-label-header--vertical';
      } else {
        labelHeader.className = 'planner-kanban-label-header--horizontal';
      }

      // Grab handle for swimlane reordering (CSS handles styles and hover states)
      const grabHandle = document.createElement('span');
      grabHandle.className = 'planner-kanban-swimlane-grab';
      setIcon(grabHandle, 'grip-vertical');
      grabHandle.setAttribute('draggable', 'true');
      this.drag.setupSwimlaneDragHandlers(grabHandle, swimlaneRow, swimlaneKey);
      labelHeader.appendChild(grabHandle);

      // Color dot for swimlane row (uses Pretty Properties / valueStyles / hash)
      {
        const dotEl = document.createElement('span');
        dotEl.className = 'planner-kanban-column-dot';
        dotEl.style.backgroundColor = this.getFieldValueColor(swimlaneBy, swimlaneKey, true);
        labelHeader.appendChild(dotEl);
      }

      // Title (CSS class handles styles based on orientation)
      const titleSpan = document.createElement('span');
      titleSpan.className = isVerticalSwimHeader
        ? 'planner-kanban-swimlane-title--vertical'
        : 'planner-kanban-swimlane-title--horizontal';
      titleSpan.textContent = swimlaneKey;
      labelHeader.appendChild(titleSpan);

      swimlaneLabel.appendChild(labelHeader);

      // Count badge (CSS class handles styles based on orientation)
      const count = swimlaneCounts.get(swimlaneKey) || 0;
      const countBadge = document.createElement('span');
      countBadge.className = isVerticalSwimHeader
        ? 'planner-kanban-swimlane-count planner-kanban-swimlane-count--vertical'
        : 'planner-kanban-swimlane-count planner-kanban-swimlane-count--horizontal';
      countBadge.textContent = String(count);
      swimlaneLabel.appendChild(countBadge);

      swimlaneRow.appendChild(swimlaneLabel);

      // Get swimlane data, defaulting to empty Map if this swimlane key has no entries
      // (can happen with predefined priority/status values that have no data)
      const swimlane = swimlaneGroups.get(swimlaneKey) || new Map<string, EntrySnapshot[]>();

      // Render columns in this swimlane
      for (const columnKey of columnKeys) {
        const entries = swimlane.get(columnKey) || [];

        if (hideEmpty && entries.length === 0) {
          // Add empty placeholder to maintain grid alignment
          const placeholder = document.createElement('div');
          placeholder.className = 'planner-kanban-placeholder';
          placeholder.setCssProps({ '--column-width': `${columnWidth}px` });
          swimlaneRow.appendChild(placeholder);
        } else {
          const cell = this.createSwimlaneCell(columnKey, swimlaneKey, entries, columnWidth);
          swimlaneRow.appendChild(cell);
        }
      }

      swimlaneContainer.appendChild(swimlaneRow);
    }

    this.boardEl.appendChild(swimlaneContainer);
  }

  /**
   * Create a cell for swimlane view (simplified column without header)
   */
  private createSwimlaneCell(groupKey: string, swimlaneKey: string, entries: EntrySnapshot[], width: number): HTMLElement {
    const cell = document.createElement('div');
    cell.className = 'planner-kanban-swimlane-cell';
    cell.setCssProps({ '--column-width': `${width}px` });
    cell.setAttribute('data-group', groupKey);
    cell.setAttribute('data-swimlane', swimlaneKey);

    // Setup drop handlers
    this.drag.setupDropHandlers(cell, groupKey, swimlaneKey);

    // Render cards
    for (const entry of entries) {
      const card = this.createCard(entry);
      cell.appendChild(card);
    }

    return cell;
  }

  private renderColumns(groups: Map<string, EntrySnapshot[]>): void {
    if (!this.boardEl) return;

    const columnWidth = this.getColumnWidth();
    const hideEmpty = this.getHideEmptyColumns();
    const columnKeys = this.getColumnKeys(groups);
    const freezeHeaders = this.getFreezeHeaders();
    const freezeColumns = freezeHeaders === 'columns' || freezeHeaders === 'both';

    // Create a wrapper that holds both header row (if sticky) and columns
    const wrapperContainer = document.createElement('div');
    wrapperContainer.className = 'planner-kanban-wrapper';

    // If freeze columns is enabled, create a sticky header row
    if (freezeColumns) {
      const headerRow = document.createElement('div');
      headerRow.className = 'planner-kanban-header-row planner-kanban-header-row--frozen';

      const groupByField = this.getGroupBy();

      for (const columnKey of columnKeys) {
        const entries = groups.get(columnKey) || [];
        if (hideEmpty && entries.length === 0) continue;

        const headerCell = document.createElement('div');
        headerCell.className = 'planner-kanban-column-header-cell';
        headerCell.setAttribute('data-group', columnKey);
        headerCell.setCssProps({ '--column-width': `${columnWidth}px` });

        // Grab handle for column reordering
        const grabHandle = document.createElement('span');
        grabHandle.className = 'planner-kanban-column-grab';
        setIcon(grabHandle, 'grip-vertical');
        grabHandle.setAttribute('draggable', 'true');
        this.drag.setupSwimlaneColumnDragHandlers(grabHandle, headerCell, columnKey);
        headerCell.appendChild(grabHandle);

        // Color dot for column (uses Pretty Properties / valueStyles / hash)
        {
          const dotEl = document.createElement('span');
          dotEl.className = 'planner-kanban-column-dot';
          dotEl.style.backgroundColor = this.getFieldValueColor(groupByField, columnKey, true);
          headerCell.appendChild(dotEl);
        }

        // Title (CSS class handles flex: 1)
        const titleSpan = document.createElement('span');
        titleSpan.className = 'planner-kanban-column-title';
        titleSpan.textContent = columnKey;
        headerCell.appendChild(titleSpan);

        // Count badge (CSS class handles all styles)
        const countBadge = document.createElement('span');
        countBadge.className = 'planner-kanban-column-count';
        countBadge.textContent = String(entries.length);
        headerCell.appendChild(countBadge);

        headerRow.appendChild(headerCell);
      }

      wrapperContainer.appendChild(headerRow);
    }

    // Create columns container (CSS class handles all styles)
    const columnsContainer = document.createElement('div');
    columnsContainer.className = 'planner-kanban-columns-container';

    for (const columnKey of columnKeys) {
      const entries = groups.get(columnKey) || [];

      // Skip empty columns if configured
      if (hideEmpty && entries.length === 0) continue;

      const column = this.createColumn(columnKey, entries, columnWidth, freezeColumns);
      columnsContainer.appendChild(column);
    }

    wrapperContainer.appendChild(columnsContainer);
    this.boardEl.appendChild(wrapperContainer);
  }

  private createColumn(groupKey: string, entries: EntrySnapshot[], width: number, skipHeader = false): HTMLElement {
    const column = document.createElement('div');
    column.className = 'planner-kanban-column';
    // Dynamic width from user setting requires inline style
    column.setCssProps({ '--column-width': `${width}px` });
    column.setAttribute('data-group', groupKey);

    // Column header (pass column for drag handlers) - skip if using sticky header row
    if (!skipHeader) {
      const header = this.createColumnHeader(groupKey, entries.length, column);
      column.appendChild(header);
    }

    // Cards container - fills column, no internal scrolling so content expands column (CSS class handles styles)
    const cardsContainer = document.createElement('div');
    cardsContainer.className = 'planner-kanban-cards';
    cardsContainer.setAttribute('data-group', groupKey);

    // Setup drop handlers on cards container
    this.drag.setupDropHandlers(cardsContainer, groupKey);

    // Render cards
    if (entries.length >= VIRTUAL_SCROLL_THRESHOLD) {
      this.renderVirtualCards(cardsContainer, entries);
    } else {
      this.renderCards(cardsContainer, entries);
    }

    column.appendChild(cardsContainer);
    return column;
  }

  private createColumnHeader(groupKey: string, count: number, column: HTMLElement): HTMLElement {
    // CSS class handles all header styles
    const header = document.createElement('div');
    header.className = 'planner-kanban-column-header';

    // Grab handle for column reordering (CSS class handles styles and hover states)
    const grabHandle = header.createSpan({ cls: 'planner-kanban-column-grab' });
    setIcon(grabHandle, 'grip-vertical');

    // Make the grab handle draggable for column reordering
    grabHandle.setAttribute('draggable', 'true');
    this.drag.setupColumnDragHandlers(grabHandle, column, groupKey);

    // Color dot for column (uses Pretty Properties / valueStyles / hash)
    {
      const dotEl = header.createSpan({ cls: 'planner-kanban-column-dot' });
      dotEl.style.backgroundColor = this.getFieldValueColor(this.getGroupBy(), groupKey, true);
    }

    // Title (CSS class handles flex: 1)
    header.createSpan({ cls: 'planner-kanban-column-title', text: groupKey });

    // Count badge (CSS class handles all styles)
    header.createSpan({ cls: 'planner-kanban-column-count', text: String(count) });

    return header;
  }

  private reorderColumns(draggedKey: string, targetKey: string, insertBefore: boolean): void {
    const groups = this.groupEntriesByField(this.createSnapshots());
    const currentOrder = this.getColumnKeys(groups);
    this.setCustomColumnOrder(reorderKeys(currentOrder, draggedKey, targetKey, insertBefore));

    // Re-render
    this.render();
  }

  /**
   * Setup drag handlers for swimlane column headers (for reordering columns in swimlane view)
   */
  private reorderSwimlanes(draggedKey: string, targetKey: string, insertBefore: boolean): void {
    const swimlaneBy = this.getSwimlaneBy();
    if (!swimlaneBy) return;

    // Collect current swimlane keys
    const swimlaneKeys: string[] = [];
    for (const entry of this.createSnapshots()) {
        const value = getEntryValue(entry, swimlaneBy);
        const key = valueToString(value);
        if (!swimlaneKeys.includes(key)) {
          swimlaneKeys.push(key);
        }
    }

    const currentOrder = this.getOrderedSwimlaneKeys(swimlaneKeys, swimlaneBy);
    this.setCustomSwimlaneOrder(reorderKeys(currentOrder, draggedKey, targetKey, insertBefore));

    // Re-render
    this.render();
  }

  private renderCards(container: HTMLElement, entries: EntrySnapshot[]): void {
    for (const entry of entries) {
      const card = this.createCard(entry);
      container.appendChild(card);
    }
  }

  /**
   * Virtual scroll state for columns with many cards
   */
  private virtualScrollObservers: Map<HTMLElement, IntersectionObserver> = new Map();
  private renderedCardRanges: Map<HTMLElement, { start: number; end: number }> = new Map();

  /**
   * Render cards with virtual scrolling for performance
   * Only renders visible cards + a buffer for smooth scrolling
   */
  private renderVirtualCards(container: HTMLElement, entries: EntrySnapshot[]): void {
    const BUFFER_SIZE = 5; // Cards to render above/below viewport
    const ESTIMATED_CARD_HEIGHT = 100; // px - used for placeholder sizing

    // Create a wrapper to hold placeholders and cards (CSS class handles position)
    const wrapper = document.createElement('div');
    wrapper.className = 'planner-kanban-virtual-wrapper';

    // Create placeholder elements for all entries
    const placeholders: HTMLElement[] = [];
    entries.forEach((entry, index) => {
      const placeholder = document.createElement('div');
      placeholder.className = 'planner-kanban-card-placeholder';
      placeholder.setAttribute('data-index', String(index));
      placeholder.setAttribute('data-path', entry.path);
      // Dynamic min-height for virtual scrolling placeholder sizing
      placeholder.setCssProps({ '--placeholder-height': `${ESTIMATED_CARD_HEIGHT}px` });
      placeholders.push(placeholder);
      wrapper.appendChild(placeholder);
    });

    container.appendChild(wrapper);

    // Track which cards are rendered
    const renderedCards = new Set<number>();

    // Create IntersectionObserver to detect visible placeholders
    const observer = new IntersectionObserver(
      (observerEntries) => {
        for (const observerEntry of observerEntries) {
          const placeholder = observerEntry.target as HTMLElement;
          const index = parseInt(placeholder.getAttribute('data-index') || '-1', 10);

          if (index < 0 || index >= entries.length) continue;

          if (observerEntry.isIntersecting && !renderedCards.has(index)) {
            // Render this card and buffer cards around it
            const start = Math.max(0, index - BUFFER_SIZE);
            const end = Math.min(entries.length, index + BUFFER_SIZE + 1);

            for (let i = start; i < end; i++) {
              if (!renderedCards.has(i)) {
                renderedCards.add(i);
                const entry = entries[i];
                const targetPlaceholder = placeholders[i];
                if (!entry || !targetPlaceholder) continue;
                const card = this.createCard(entry);

                // Replace placeholder content with actual card (CSS class handles min-height reset)
                targetPlaceholder.empty();
                targetPlaceholder.appendChild(card);
                targetPlaceholder.classList.add('planner-kanban-card-rendered');
              }
            }
          }
        }
      },
      {
        root: this.boardEl,
        rootMargin: '200px 0px', // Load cards 200px before they enter viewport
        threshold: 0
      }
    );

    // Observe all placeholders
    placeholders.forEach(placeholder => observer.observe(placeholder));

    // Store observer for cleanup
    this.virtualScrollObservers.set(container, observer);
  }

  /**
   * Clean up virtual scroll observers when view is destroyed
   */
  private cleanupVirtualScroll(): void {
    for (const [, observer] of this.virtualScrollObservers) {
      observer.disconnect();
    }
    this.virtualScrollObservers.clear();
    this.renderedCardRanges.clear();
  }

  private createCard(entry: EntrySnapshot): HTMLElement {
    const card = this.cardRenderer.buildCard(entry);

    // Setup drag handlers
    this.drag.setupCardDragHandlers(card, entry);

    // Click → open in new tab; right-click → location picker
    card.addEventListener('click', () => { void this.handleCardClick(entry); });
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showOpenFileMenu(this.plugin.app, entry.path, e);
    });
    // Page Preview: Ctrl/Cmd + hover over card shows preview popup
    card.addEventListener('mouseenter', (e) => {
      this.triggerHoverPreview(e, entry.path, card);
    });

    return card;
  }

  private async handleCardDrop(filePath: string, newGroupValue: string, newSwimlaneValue?: string): Promise<void> {
    try {
      const groupByField = this.getGroupBy();
      const swimlaneBy = this.getSwimlaneBy();

      // Check if we need to handle folder moves
      const isFolderGroupBy = this.isFolderProperty(groupByField);
      const isFolderSwimlane = swimlaneBy ? this.isFolderProperty(swimlaneBy) : false;

      // Determine target folder from either groupBy or swimlane (folder takes priority)
      let targetFolder: string | null = null;
      if (isFolderGroupBy && newGroupValue && newGroupValue !== 'None') {
        targetFolder = this.findFolderPath(newGroupValue);
      } else if (isFolderSwimlane && newSwimlaneValue && newSwimlaneValue !== 'None') {
        targetFolder = this.findFolderPath(newSwimlaneValue);
      }

      // Move file if folder changed
      let newFilePath = filePath;
      if (targetFolder !== null) {
        const moveResult = await this.mutations.moveToFolder(filePath, normalizePath(targetFolder));
        if (!moveResult.ok) throw new Error(moveResult.message);
        newFilePath = moveResult.path;
      }

      // Now update frontmatter for non-folder and non-formula properties
      // Formula properties are computed by Bases and should never be written to frontmatter
      const isFormulaGroup = groupByField.startsWith('formula.');
      const isFormulaSwimlane = swimlaneBy ? swimlaneBy.startsWith('formula.') : false;

      const needsFrontmatterUpdate =
        (!isFolderGroupBy && !isFormulaGroup && newGroupValue !== undefined) ||
        (!isFolderSwimlane && !isFormulaSwimlane && swimlaneBy && newSwimlaneValue !== undefined);

      if (needsFrontmatterUpdate) {
        const values: Record<string, unknown> = {};
        if (!isFolderGroupBy && !isFormulaGroup) {
          values[groupByField] = this.convertValueForField(groupByField.replace(/^(note|file|formula)\./, ''), newGroupValue);
        }
        if (!isFolderSwimlane && !isFormulaSwimlane && swimlaneBy && newSwimlaneValue !== undefined) {
          values[swimlaneBy] = this.convertValueForField(swimlaneBy.replace(/^(note|file|formula)\./, ''), newSwimlaneValue);
        }
        const updateResult = await this.mutations.setProperties(newFilePath, values);
        if (!updateResult.ok) throw new Error(updateResult.message);
      }
    } catch (error) {
      console.error('Planner: Failed to update card:', error);
      new Notice('Failed to move card. Check console for details.');
    }
  }

  /**
   * Check if a property ID refers to folder
   */
  private isFolderProperty(propId: string): boolean {
    const normalized = propId.replace(/^(note|file|formula)\./, '');
    return normalized === 'folder';
  }

  /**
   * Convert a value for a specific field, handling special cases like tags and multi-value properties
   */
  private convertValueForField(fieldName: string, value: string): string | string[] {
    // If the value contains a comma, it was joined from an array by valueToString
    // and should be split back into an array
    const hasMultipleValues = value.includes(',');

    if (hasMultipleValues) {
      // Split comma-separated values into array
      const values = value.split(',').map(v => v.trim()).filter(v => v.length > 0);

      // For tags, ensure each value has # prefix
      if (fieldName === 'tags') {
        return values.map(v => v.startsWith('#') ? v : `#${v}`);
      }

      return values;
    }

    // Single value - check if it should still be an array (for tags)
    if (fieldName === 'tags') {
      const normalizedTag = value.startsWith('#') ? value : `#${value}`;
      return [normalizedTag];
    }

    return value;
  }

  /**
   * Find the full path to a folder by its name
   * Returns the first matching folder path, or null if not found
   */
  private findFolderPath(folderName: string): string | null {
    if (folderName === 'Root' || folderName === '/') {
      return '';
    }

    const allFiles = this.plugin.app.vault.getAllLoadedFiles();
    for (const file of allFiles) {
      if (file instanceof TFolder && file.name === folderName) {
        return file.path;
      }
    }
    return null;
  }

  private handleCardClick(entry: EntrySnapshot): void {
    openPath(this.plugin.app, entry.path, { ctrlKey: true } as MouseEvent);
  }

  /**
   * Trigger Obsidian's Page Preview for a file path.
   * The preview popup appears when the user holds Ctrl/Cmd while hovering;
   * Obsidian's internal page-preview plugin handles that key check.
   */
  private triggerHoverPreview(event: MouseEvent, filePath: string, targetEl: HTMLElement): void {
    dispatchHoverPreview({
      app: this.plugin.app,
      event,
      hoverParent: this.plugin,
      sourceId: BASES_SWIMLANE_VIEW_ID,
      targetEl,
      filePath,
    });
  }
}

/**
 * Create the Bases view registration for the Swimlane
 */
export function createSwimlaneViewRegistration(plugin: WiseViewPlugin): BasesViewRegistration {
  return {
    name: 'Swimlane',
    icon: 'rows-3',
    factory: (controller: QueryController, containerEl: HTMLElement) => {
      return new BasesSwimlaneView(controller, containerEl, plugin);
    },
    options: (_config: BasesViewConfig): BasesAllOptions[] => createSwimlaneOptions(plugin.app),
  };
}
