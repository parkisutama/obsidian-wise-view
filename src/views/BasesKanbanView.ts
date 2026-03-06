import {
  BasesView,
  BasesViewRegistration,
  BasesAllOptions,
  BasesViewConfig,
  BasesEntry,
  BasesPropertyId,
  QueryController,
  DateValue,
  NumberValue,
  NullValue,
  setIcon,
  TFile,
  TFolder,
  Notice,
} from 'obsidian';
import type PlannerPlugin from '../main';
import { PropertyTypeService } from '../services/PropertyTypeService';
import { stringToColor } from '../utils/colorUtils';
import { openFileInNewTab, showOpenFileMenu } from '../utils/openFile';


export const BASES_KANBAN_VIEW_ID = 'wise-view-kanban';

type BorderStyle = 'none' | 'left-accent' | 'full-border';
type CoverDisplay = 'none' | 'banner' | 'thumbnail-left' | 'thumbnail-right' | 'background';
type BadgePlacement = 'inline' | 'properties-section';
type FreezeHeaders = 'off' | 'columns' | 'swimlanes' | 'both';
type SwimHeaderDisplay = 'horizontal' | 'vertical';

/**
 * Virtual scroll threshold - enables virtual scrolling when column has 15+ cards
 */
const VIRTUAL_SCROLL_THRESHOLD = 15;

/**
 * Kanban view for Obsidian Bases
 * Displays items in a drag-and-drop board with configurable columns
 */
export class BasesKanbanView extends BasesView {
  type = BASES_KANBAN_VIEW_ID;
  private plugin: PlannerPlugin;
  private containerEl: HTMLElement;
  private boardEl: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private colorMapCache: Record<string, string> = {};

  // Drag state
  private draggedCardPath: string | null = null;
  private draggedFromColumn: string | null = null;

  // Mobile touch drag state
  private touchDragCard: HTMLElement | null = null;
  private touchDragClone: HTMLElement | null = null;
  private touchStartX: number = 0;
  private touchStartY: number = 0;
  private lastTouchX: number = 0;
  private lastTouchY: number = 0;
  private scrollInterval: number | null = null;
  private touchHoldTimer: number | null = null;
  private touchHoldReady: boolean = false;
  private touchHoldCard: HTMLElement | null = null;
  private touchHoldEntry: BasesEntry | null = null;
  // Context menu blocker for iOS (prevents long-press menu during drag)
  private boundContextMenuBlocker = (e: Event): void => { e.preventDefault(); e.stopPropagation(); };

  // Column reordering state
  private draggedColumn: HTMLElement | null = null;
  private draggedColumnKey: string | null = null;

  // Swimlane reordering state
  private draggedSwimlane: HTMLElement | null = null;
  private draggedSwimlaneKey: string | null = null;

  // Swimlane touch drag state (for mobile)
  private touchDragSwimlane: HTMLElement | null = null;
  private touchDragSwimlaneClone: HTMLElement | null = null;
  private touchSwimlaneStartX: number = 0;
  private touchSwimlaneStartY: number = 0;
  private touchSwimlaneHoldTimer: number | null = null;
  private touchSwimlaneHoldReady: boolean = false;

  // Keyboard navigation state
  private focusedCardIndex: number = -1;
  private keyboardHandler: ((e: KeyboardEvent) => void) | null = null;

  // Render debouncing
  private renderDebounceTimer: number | null = null;
  private static readonly RENDER_DEBOUNCE_MS = 50;

  // Configuration getters
  private getGroupBy(): string {
    const value = this.config.get('plannerGroupBy') as string | undefined;
    return value || this.plugin.settings.kanbanDefaults.plannerGroupBy;
  }

  private getSwimlaneBy(): string | null {
    const value = this.config.get('swimlaneBy') as string | undefined;
    return value || this.plugin.settings.kanbanDefaults.swimlaneBy || null;
  }

  private getColorBy(): string {
    const value = this.config.get('colorBy') as string | undefined;
    return value || this.plugin.settings.kanbanDefaults.colorBy || '';
  }

  private getTitleBy(): string {
    const value = this.config.get('titleBy') as string | undefined;
    return value || 'note.title';
  }

  private getBorderStyle(): BorderStyle {
    const value = this.config.get('borderStyle') as string | undefined;
    return (value as BorderStyle) || (this.plugin.settings.kanbanDefaults.borderStyle as BorderStyle) || 'left-accent';
  }

  private getCoverField(): string | null {
    const value = this.config.get('coverField') as string | undefined;
    return value || 'note.cover';
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
    return value || this.plugin.settings.kanbanDefaults.dateStartField || '';
  }

  private getDateEndField(): string {
    const value = this.config.get('dateEndField') as string | undefined;
    return value || this.plugin.settings.kanbanDefaults.dateEndField || '';
  }

  private getDateFormat(): string {
    const value = this.config.get('dateFormat') as string | undefined;
    return value || 'date-short';
  }

  private getBadgePlacement(): BadgePlacement {
    const value = this.config.get('badgePlacement') as string | undefined;
    return (value as BadgePlacement) || (this.plugin.settings.kanbanDefaults.badgePlacement as BadgePlacement) || 'properties-section';
  }

  private getColumnWidth(): number {
    const value = this.config.get('columnWidth') as string | number | undefined;
    if (typeof value === 'string') return parseInt(value, 10) || this.plugin.settings.kanbanDefaults.columnWidth;
    return value || this.plugin.settings.kanbanDefaults.columnWidth;
  }

  private getHideEmptyColumns(): boolean {
    const value = this.config.get('hideEmptyColumns') as string | boolean | undefined;
    if (typeof value === 'string') return value === 'true';
    return value ?? this.plugin.settings.kanbanDefaults.hideEmptyColumns;
  }

  private getEnableSearch(): boolean {
    const value = this.config.get('enableSearch') as string | boolean | undefined;
    if (typeof value === 'string') {
      return value === 'true';
    }
    return value ?? false;
  }

  private getFreezeHeaders(): FreezeHeaders {
    const value = this.config.get('freezeHeaders') as string | undefined;
    return (value as FreezeHeaders) || (this.plugin.settings.kanbanDefaults.freezeHeaders as FreezeHeaders) || 'none';
  }

  private getSwimHeaderDisplay(): SwimHeaderDisplay {
    const value = this.config.get('swimHeaderDisplay') as string | undefined;
    return (value as SwimHeaderDisplay) || 'vertical';
  }

  private getShowPropertyLabels(): boolean {
    const value = this.config.get('showPropertyLabels') as string | boolean | undefined;
    if (value === 'false' || value === false) return false;
    if (value === 'true' || value === true) return true;
    return this.plugin.settings.kanbanDefaults.showPropertyLabels ?? true;
  }

  private getCustomColumnOrder(): string[] {
    const value = this.config.get('columnOrder') as string | undefined;
    if (!value) return [];
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
    } catch {
      return [];
    }
  }

  private setCustomColumnOrder(order: string[]): void {
    this.config.set('columnOrder', JSON.stringify(order));
  }

  private getCustomSwimlaneOrder(): string[] {
    const value = this.config.get('swimlaneOrder') as string | undefined;
    if (!value) return [];
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
    } catch {
      return [];
    }
  }

  private setCustomSwimlaneOrder(order: string[]): void {
    this.config.set('swimlaneOrder', JSON.stringify(order));
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
  private getVisibleProperties(): string[] {
    const orderedProps = this.config.getOrder();
    return orderedProps.length > 0 ? orderedProps : this.getDefaultProperties();
  }

  private getDefaultProperties(): string[] {
    return [
      'note.title',
      'note.status',
      'note.priority',
    ];
  }

  constructor(
    controller: QueryController,
    containerEl: HTMLElement,
    plugin: PlannerPlugin
  ) {
    super(controller);
    this.plugin = plugin;
    this.containerEl = containerEl;
    this.setupContainer();
    this.setupResizeObserver();
    this.setupKeyboardNavigation();
  }

  /**
   * Setup keyboard navigation for the Kanban board
   * Allows navigating between cards with arrow keys
   */
  private setupKeyboardNavigation(): void {
    this.keyboardHandler = (e: KeyboardEvent) => {
      // Only handle if board is focused or a card is focused
      if (!this.boardEl?.contains(document.activeElement) &&
        document.activeElement !== this.containerEl) {
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
    }, BasesKanbanView.RENDER_DEBOUNCE_MS);
  }

  onunload(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    // Clean up debounce timer
    if (this.renderDebounceTimer !== null) {
      window.clearTimeout(this.renderDebounceTimer);
      this.renderDebounceTimer = null;
    }
    // Clean up virtual scroll observers
    this.cleanupVirtualScroll();
    // Clean up keyboard navigation
    if (this.keyboardHandler) {
      this.containerEl.removeEventListener('keydown', this.keyboardHandler);
      this.keyboardHandler = null;
    }
    this.containerEl.removeAttribute('tabindex');
    // Clean up styles and classes added to the shared container
    this.containerEl.removeClass('planner-bases-kanban');
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
    this.buildColorMapCache();

    // Check if swimlanes are enabled
    const swimlaneBy = this.getSwimlaneBy();

    if (swimlaneBy) {
      // Render with swimlanes (2D grid)
      this.renderWithSwimlanes(swimlaneBy);
    } else {
      // Group entries by the groupBy field
      const groups = this.groupEntriesByField();
      // Render columns
      this.renderColumns(groups);
    }
  }

  private buildColorMapCache(): void {
    // Color map no longer needed — stringToColor handles deterministic coloring per value.
    this.colorMapCache = {};
  }

  private getEntryColor(entry: BasesEntry): string {
    const colorByField = this.getColorBy();
    const value = this.getEntryValue(entry, colorByField);
    if (!value) return '#6b7280';
    const strValue = this.valueToString(Array.isArray(value) ? value[0] : value);
    return this.getFieldValueColor(colorByField, strValue);
  }

  /**
   * Resolve a color for a field+value using the 3-tier priority:
   * 1. Pretty Properties plugin color (semi-transparent at 40% for backgrounds, full for solid)
   * 2. Planner valueStyles settings
   * 3. Deterministic stringToColor hash
   */
  private getFieldValueColor(fieldId: string, value: string, solid = false): string {
    const propName = fieldId.split('.').pop() || fieldId;
    const ppColor = this.getPrettyPropertiesColor(propName, value, solid);
    if (ppColor) return ppColor;
    return this.getValueStyleColor(fieldId, value);
  }

  /** Check settings valueStyles first, then fall back to stringToColor hash. */
  private getValueStyleColor(field: string, value: string): string {
    return this.plugin.settings.valueStyles[field]?.[value]?.color ?? stringToColor(value);
  }

  /**
   * Like getFieldValueColor but returns null when only the hash fallback would fire.
   * Use this for generic badges so the CSS theme default is preserved when no
   * explicit color is configured via Pretty Properties or Planner valueStyles.
   */
  private getConfiguredFieldColor(fieldId: string, value: string): string | null {
    const propName = fieldId.split('.').pop() || fieldId;
    const ppColor = this.getPrettyPropertiesColor(propName, value, false);
    if (ppColor) return ppColor;
    // Only return a color if the user explicitly configured one in valueStyles
    return this.plugin.settings.valueStyles[fieldId]?.[value]?.color ?? null;
  }

  /**
   * Resolve a Pretty Properties color setting to a CSS color string.
   * Uses the global `window.PrettyPropertiesApi` exposed by the Pretty Properties plugin.
   * Returns null if Pretty Properties is not installed, no color is assigned, or color cannot be resolved.
   *
   * @param solid - When true, returns full-opacity color (for dots/icons/text).
   *                When false, returns semi-transparent color at 40% opacity (for backgrounds).
   *
   * Pretty Properties stores colors by VALUE (not by property name), so `propName` is only
   * used to determine which settings dictionary to look in (multitext, tags, or text).
   */
  private getPrettyPropertiesColor(propName: string, propValue: string, solid: boolean): string | null {
    /** Minimal subset of the Pretty Properties public API we actually use. */
    interface PPColorSetting { h: number; s: number; l: number }
    interface PrettyPropertiesApi {
      getPropertyBackgroundColorSetting(
        propName: string, propValue: string
      ): string | PPColorSetting | undefined;
    }
    interface WindowWithPP extends Window { PrettyPropertiesApi?: PrettyPropertiesApi }

    const ppApi = (window as WindowWithPP).PrettyPropertiesApi;
    if (!ppApi) return null;

    try {
      // Returns a named color string ("red", "blue", …), an HSL object {h, s, l},
      // "none" (transparent), or "default" (no color assigned).
      const colorSetting = ppApi.getPropertyBackgroundColorSetting(propName, propValue);
      if (!colorSetting || colorSetting === 'default' || colorSetting === 'none') return null;

      const alpha = solid ? 1 : 0.4;
      const namedColors = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink'];

      if (typeof colorSetting === 'string' && namedColors.includes(colorSetting)) {
        // Resolve Obsidian theme CSS variable (e.g. --color-red-rgb) to a color
        const rgbStr = getComputedStyle(document.body)
          .getPropertyValue(`--color-${colorSetting}-rgb`)
          .trim();
        if (rgbStr) {
          const parts = rgbStr.split(/[\s,]+/).map((n: string) => parseInt(n.trim(), 10));
          if (parts.length >= 3 && parts.every((n: number) => !isNaN(n))) {
            const [r, g, b] = parts;
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
          }
        }
        return null;
      }

      if (typeof colorSetting === 'object' && colorSetting.h !== undefined) {
        return `hsla(${colorSetting.h}, ${colorSetting.s}%, ${colorSetting.l}%, ${alpha})`;
      }
    } catch {
      // Pretty Properties API error — fall through to default behavior
    }

    return null;
  }

  private groupEntriesByField(): Map<string, BasesEntry[]> {
    const groupByField = this.getGroupBy();
    const groups = new Map<string, BasesEntry[]>();

    for (const group of this.data.groupedData) {
      for (const entry of group.entries) {
        const value = this.getEntryValue(entry, groupByField);
        const groupKey = this.valueToString(value);

        if (!groups.has(groupKey)) {
          groups.set(groupKey, []);
        }
        groups.get(groupKey)!.push(entry);
      }
    }

    return groups;
  }

  /**
   * Convert any value to a string for grouping/display
   * Uses type assertions to satisfy ESLint no-base-to-string rule
   */
  private valueToString(value: unknown): string {
    if (value === null || value === undefined) return 'None';
    if (Array.isArray(value)) {
      const filtered = value.filter(v => v !== null && v !== undefined && v !== '' && v !== 'null');
      if (filtered.length === 0) return 'None';
      return filtered.join(', ');
    }
    // Handle primitives directly
    if (typeof value === 'string') return value || 'None';
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    // Handle objects - try toString() for objects that implement it meaningfully
    if (typeof value === 'object') {
      const objStr = (value as { toString(): string }).toString();
      // Check for meaningful toString result
      if (objStr && objStr !== '[object Object]') return objStr || 'None';
      // Fall back to JSON for plain objects
      try {
        const json = JSON.stringify(value);
        return json || 'None';
      } catch {
        return 'None';
      }
    }
    // For remaining types (symbol, bigint, function), use String with type assertion
    return String(value as string | number | boolean | bigint) || 'None';
  }

  /**
   * Get frontmatter directly from Obsidian's metadata cache (bypasses Bases getValue)
   * This is needed because Bases getValue may not return custom frontmatter properties
   */
  private getFrontmatter(entry: BasesEntry): Record<string, unknown> | undefined {
    const file = entry.file;
    const cache = this.plugin.app.metadataCache.getFileCache(file);
    return cache?.frontmatter;
  }

  /**
   * Get a property value from an entry, trying Bases getValue first, then falling back to frontmatter
   */
  private getEntryValue(entry: BasesEntry, propId: string): unknown {
    // Try Bases getValue first
    const basesValue = entry.getValue(propId as BasesPropertyId);

    // Formula properties are computed by Bases — extract value directly, no frontmatter fallback.
    // Must be checked BEFORE the placeholder heuristic because Value types (DateValue, NumberValue, etc.)
    // carry an `icon` metadata field in their prototype which the placeholder check would catch.
    if (propId.startsWith('formula.')) {
      return this.extractFormulaValue(basesValue);
    }

    // Check for valid value - not null, undefined, empty string, or Bases placeholder object
    // Bases returns placeholder objects like {icon: 'lucide-tags'} for missing/empty fields
    if (basesValue !== null && basesValue !== undefined && (basesValue as unknown) !== '') {
      if (typeof basesValue === 'object' && 'icon' in (basesValue as object)) {
        // Bases placeholder — treat as empty, fall through to frontmatter
      } else {
        return basesValue;
      }
    }

    // Fall back to reading frontmatter directly
    const propName = propId.replace(/^(note|file)\./, '');

    // Handle special file properties
    if (propId.startsWith('file.')) {
      if (propName === 'folder') {
        const folderPath = entry.file.parent?.path || '/';
        return folderPath === '/' ? 'Root' : entry.file.parent?.name || 'Root';
      }
      if (propName === 'basename') {
        return entry.file.basename;
      }
      if (propName === 'path') {
        return entry.file.path;
      }
    }

    // Get from frontmatter
    const frontmatter = this.getFrontmatter(entry);
    if (frontmatter) {
      return frontmatter[propName];
    }

    return undefined;
  }

  /**
   * Extract a usable value from a Bases formula property result.
   *
   * Bases `getValue()` returns typed Value objects (DateValue, NumberValue, …)
   * which carry metadata like `icon` in their prototype.  The generic
   * placeholder heuristic (`'icon' in obj`) would incorrectly discard them,
   * so formula results are unwrapped here instead.
   */
  private extractFormulaValue(val: unknown): unknown {
    if (val == null || val instanceof NullValue) return undefined;
    if (val instanceof DateValue) return val.dateOnly().toString();
    if (val instanceof NumberValue) {
      const n = Number(val.toString());
      return isNaN(n) ? val.toString() : n;
    }
    if (typeof val === 'string') return val || undefined;
    if (typeof val === 'number' || typeof val === 'boolean') return val;
    // Other Value subtypes or objects — try toString()
    if (typeof val === 'object') {
      const str = (val as { toString(): string }).toString();
      if (str && str !== '[object Object]') return str;
    }
    return undefined;
  }

  /**
   * Get ordered column keys based on the groupBy field and custom order
   */
  private getColumnKeys(groups: Map<string, BasesEntry[]>): string[] {
    const customOrder = this.getCustomColumnOrder();

    const defaultKeys: string[] = Array.from(groups.keys()).sort();

    // If we have a custom order, use it (but include any new keys that weren't in the saved order)
    if (customOrder.length > 0) {
      const orderedKeys: string[] = [];
      // First, add keys in custom order that still exist
      for (const key of customOrder) {
        if (defaultKeys.includes(key)) {
          orderedKeys.push(key);
        }
      }
      // Then add any new keys that weren't in custom order
      for (const key of defaultKeys) {
        if (!orderedKeys.includes(key)) {
          orderedKeys.push(key);
        }
      }
      return orderedKeys;
    }

    return defaultKeys;
  }

  /**
   * Get ordered swimlane keys based on the swimlaneBy field and custom order
   */
  private getOrderedSwimlaneKeys(swimlaneKeys: string[], _swimlaneBy: string): string[] {
    const customOrder = this.getCustomSwimlaneOrder();

    const defaultKeys: string[] = [...swimlaneKeys].sort();

    // If we have a custom order, use it (but include any new keys that weren't in the saved order)
    if (customOrder.length > 0) {
      const orderedKeys: string[] = [];
      // First, add keys in custom order that still exist
      for (const key of customOrder) {
        if (defaultKeys.includes(key)) {
          orderedKeys.push(key);
        }
      }
      // Then add any new keys that weren't in custom order
      for (const key of defaultKeys) {
        if (!orderedKeys.includes(key)) {
          orderedKeys.push(key);
        }
      }
      return orderedKeys;
    }

    return defaultKeys;
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
  private renderWithSwimlanes(swimlaneBy: string): void {
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
    const swimlaneGroups = new Map<string, Map<string, BasesEntry[]>>();
    const allColumnKeys = new Set<string>();

    for (const group of this.data.groupedData) {
      for (const entry of group.entries) {
        const swimlaneValue = this.getEntryValue(entry, swimlaneBy);
        const swimlaneKey = this.valueToString(swimlaneValue);

        const columnValue = this.getEntryValue(entry, groupByField);
        const columnKey = this.valueToString(columnValue);

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
      this.setupSwimlaneColumnDragHandlers(grabHandle, headerCell, columnKey);
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
      this.setupSwimlaneDragHandlers(grabHandle, swimlaneRow, swimlaneKey);
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
      const swimlane = swimlaneGroups.get(swimlaneKey) || new Map<string, BasesEntry[]>();

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
  private createSwimlaneCell(groupKey: string, swimlaneKey: string, entries: BasesEntry[], width: number): HTMLElement {
    const cell = document.createElement('div');
    cell.className = 'planner-kanban-swimlane-cell';
    cell.setCssProps({ '--column-width': `${width}px` });
    cell.setAttribute('data-group', groupKey);
    cell.setAttribute('data-swimlane', swimlaneKey);

    // Setup drop handlers
    this.setupDropHandlers(cell, groupKey, swimlaneKey);

    // Render cards
    for (const entry of entries) {
      const card = this.createCard(entry);
      cell.appendChild(card);
    }

    return cell;
  }

  private renderColumns(groups: Map<string, BasesEntry[]>): void {
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
        this.setupSwimlaneColumnDragHandlers(grabHandle, headerCell, columnKey);
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

  private createColumn(groupKey: string, entries: BasesEntry[], width: number, skipHeader = false): HTMLElement {
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
    this.setupDropHandlers(cardsContainer, groupKey);

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
    this.setupColumnDragHandlers(grabHandle, column, groupKey);

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

  private setupColumnDragHandlers(grabHandle: HTMLElement, column: HTMLElement, groupKey: string): void {
    grabHandle.addEventListener('dragstart', (e: DragEvent) => {
      e.stopPropagation(); // Don't trigger card drag
      this.draggedColumn = column;
      this.draggedColumnKey = groupKey;
      column.classList.add('planner-kanban-column--dragging');
      e.dataTransfer?.setData('text/plain', `column:${groupKey}`);
      e.dataTransfer!.effectAllowed = 'move';
    });

    // Handle edge scrolling during column drag
    grabHandle.addEventListener('drag', (e: DragEvent) => {
      if (!this.boardEl || !e.clientX) return;
      this.handleEdgeScroll(e.clientX, e.clientY);
    });

    grabHandle.addEventListener('dragend', () => {
      if (this.draggedColumn) {
        this.draggedColumn.classList.remove('planner-kanban-column--dragging');
      }
      this.draggedColumn = null;
      this.draggedColumnKey = null;
      this.stopAutoScroll(); // Stop any auto-scrolling
      // Remove all drop indicators
      document.querySelectorAll('.planner-kanban-column--drop-left, .planner-kanban-column--drop-right').forEach(el => {
        el.classList.remove('planner-kanban-column--drop-left', 'planner-kanban-column--drop-right');
      });
    });

    // Setup drop handlers on the column itself
    column.addEventListener('dragover', (e: DragEvent) => {
      // Only handle column drops, not card drops
      if (!this.draggedColumn || this.draggedColumn === column) return;
      e.preventDefault();
      e.dataTransfer!.dropEffect = 'move';

      // Determine drop position (left or right half of column)
      const rect = column.getBoundingClientRect();
      const midpoint = rect.left + rect.width / 2;
      column.classList.remove('planner-kanban-column--drop-left', 'planner-kanban-column--drop-right');
      if (e.clientX < midpoint) {
        column.classList.add('planner-kanban-column--drop-left');
      } else {
        column.classList.add('planner-kanban-column--drop-right');
      }
    });

    column.addEventListener('dragleave', () => {
      column.classList.remove('planner-kanban-column--drop-left', 'planner-kanban-column--drop-right');
    });

    column.addEventListener('drop', (e: DragEvent) => {
      if (!this.draggedColumn || !this.draggedColumnKey || this.draggedColumn === column) return;
      e.preventDefault();

      const rect = column.getBoundingClientRect();
      const midpoint = rect.left + rect.width / 2;
      const insertBefore = e.clientX < midpoint;

      // Reorder columns
      this.reorderColumns(this.draggedColumnKey, groupKey, insertBefore);

      column.classList.remove('planner-kanban-column--drop-left', 'planner-kanban-column--drop-right');
    });
  }

  private reorderColumns(draggedKey: string, targetKey: string, insertBefore: boolean): void {
    // Get current column order
    const groups = this.groupEntriesByField();
    let currentOrder = this.getColumnKeys(groups);

    // Remove dragged column from current position
    currentOrder = currentOrder.filter(k => k !== draggedKey);

    // Find target position
    const targetIndex = currentOrder.indexOf(targetKey);
    const insertIndex = insertBefore ? targetIndex : targetIndex + 1;

    // Insert at new position
    currentOrder.splice(insertIndex, 0, draggedKey);

    // Save custom order
    this.setCustomColumnOrder(currentOrder);

    // Re-render
    this.render();
  }

  /**
   * Setup drag handlers for swimlane column headers (for reordering columns in swimlane view)
   */
  private setupSwimlaneColumnDragHandlers(grabHandle: HTMLElement, headerCell: HTMLElement, groupKey: string): void {
    grabHandle.addEventListener('dragstart', (e: DragEvent) => {
      e.stopPropagation();
      this.draggedColumn = headerCell;
      this.draggedColumnKey = groupKey;
      headerCell.classList.add('planner-kanban-column--dragging');
      e.dataTransfer?.setData('text/plain', `column:${groupKey}`);
      e.dataTransfer!.effectAllowed = 'move';
    });

    // Handle edge scrolling during column drag
    grabHandle.addEventListener('drag', (e: DragEvent) => {
      if (!this.boardEl || !e.clientX) return;
      this.handleEdgeScroll(e.clientX, e.clientY);
    });

    grabHandle.addEventListener('dragend', () => {
      if (this.draggedColumn) {
        this.draggedColumn.classList.remove('planner-kanban-column--dragging');
      }
      this.draggedColumn = null;
      this.draggedColumnKey = null;
      this.stopAutoScroll(); // Stop any auto-scrolling
      // Remove all drop indicators
      document.querySelectorAll('.planner-kanban-column--drop-left, .planner-kanban-column--drop-right').forEach(el => {
        el.classList.remove('planner-kanban-column--drop-left', 'planner-kanban-column--drop-right');
      });
    });

    // Setup drop handlers on the header cell itself
    headerCell.addEventListener('dragover', (e: DragEvent) => {
      // Only handle column drops
      if (!this.draggedColumn || this.draggedColumn === headerCell) return;
      e.preventDefault();
      e.dataTransfer!.dropEffect = 'move';

      // Determine drop position (left or right half)
      const rect = headerCell.getBoundingClientRect();
      const midpoint = rect.left + rect.width / 2;
      headerCell.classList.remove('planner-kanban-column--drop-left', 'planner-kanban-column--drop-right');
      if (e.clientX < midpoint) {
        headerCell.classList.add('planner-kanban-column--drop-left');
      } else {
        headerCell.classList.add('planner-kanban-column--drop-right');
      }
    });

    headerCell.addEventListener('dragleave', () => {
      headerCell.classList.remove('planner-kanban-column--drop-left', 'planner-kanban-column--drop-right');
    });

    headerCell.addEventListener('drop', (e: DragEvent) => {
      if (!this.draggedColumn || !this.draggedColumnKey || this.draggedColumn === headerCell) return;
      e.preventDefault();

      const rect = headerCell.getBoundingClientRect();
      const midpoint = rect.left + rect.width / 2;
      const insertBefore = e.clientX < midpoint;

      // Reorder columns
      this.reorderColumns(this.draggedColumnKey, groupKey, insertBefore);

      headerCell.classList.remove('planner-kanban-column--drop-left', 'planner-kanban-column--drop-right');
    });
  }

  /**
   * Setup drag handlers for swimlane rows (for reordering swimlanes)
   */
  private setupSwimlaneDragHandlers(grabHandle: HTMLElement, swimlaneRow: HTMLElement, swimlaneKey: string): void {
    grabHandle.addEventListener('dragstart', (e: DragEvent) => {
      e.stopPropagation();
      this.draggedSwimlane = swimlaneRow;
      this.draggedSwimlaneKey = swimlaneKey;
      swimlaneRow.classList.add('planner-kanban-swimlane--dragging');
      e.dataTransfer?.setData('text/plain', `swimlane:${swimlaneKey}`);
      e.dataTransfer!.effectAllowed = 'move';
    });

    // Handle edge scrolling during swimlane drag
    grabHandle.addEventListener('drag', (e: DragEvent) => {
      if (!this.boardEl || !e.clientX) return;
      this.handleEdgeScroll(e.clientX, e.clientY);
    });

    grabHandle.addEventListener('dragend', () => {
      if (this.draggedSwimlane) {
        this.draggedSwimlane.classList.remove('planner-kanban-swimlane--dragging');
      }
      this.draggedSwimlane = null;
      this.draggedSwimlaneKey = null;
      this.stopAutoScroll(); // Stop any auto-scrolling
      // Remove all drop indicators
      document.querySelectorAll('.planner-kanban-swimlane--drop-above, .planner-kanban-swimlane--drop-below').forEach(el => {
        el.classList.remove('planner-kanban-swimlane--drop-above', 'planner-kanban-swimlane--drop-below');
      });
    });

    // Setup drop handlers on the swimlane row itself
    swimlaneRow.addEventListener('dragover', (e: DragEvent) => {
      // Only handle swimlane drops
      if (!this.draggedSwimlane || this.draggedSwimlane === swimlaneRow) return;
      e.preventDefault();
      e.dataTransfer!.dropEffect = 'move';

      // Determine drop position (top or bottom half)
      const rect = swimlaneRow.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;
      swimlaneRow.classList.remove('planner-kanban-swimlane--drop-above', 'planner-kanban-swimlane--drop-below');
      if (e.clientY < midpoint) {
        swimlaneRow.classList.add('planner-kanban-swimlane--drop-above');
      } else {
        swimlaneRow.classList.add('planner-kanban-swimlane--drop-below');
      }
    });

    swimlaneRow.addEventListener('dragleave', () => {
      swimlaneRow.classList.remove('planner-kanban-swimlane--drop-above', 'planner-kanban-swimlane--drop-below');
    });

    swimlaneRow.addEventListener('drop', (e: DragEvent) => {
      if (!this.draggedSwimlane || !this.draggedSwimlaneKey || this.draggedSwimlane === swimlaneRow) return;
      e.preventDefault();

      const rect = swimlaneRow.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;
      const insertBefore = e.clientY < midpoint;

      // Reorder swimlanes
      this.reorderSwimlanes(this.draggedSwimlaneKey, swimlaneKey, insertBefore);

      swimlaneRow.classList.remove('planner-kanban-swimlane--drop-above', 'planner-kanban-swimlane--drop-below');
    });

    // Mobile touch handlers for swimlane reordering with hold delay
    const HOLD_DELAY_MS = 200;

    grabHandle.addEventListener('touchstart', (e: TouchEvent) => {
      const firstTouch = e.touches[0];
      if (!firstTouch) return;
      this.touchSwimlaneStartX = firstTouch.clientX;
      this.touchSwimlaneStartY = firstTouch.clientY;
      this.touchSwimlaneHoldReady = false;

      this.touchSwimlaneHoldTimer = window.setTimeout(() => {
        this.touchSwimlaneHoldReady = true;
        grabHandle.classList.add('planner-kanban-grab--hold-ready');
      }, HOLD_DELAY_MS);
    }, { passive: true });

    grabHandle.addEventListener('touchmove', (e: TouchEvent) => {
      const moveTouch = e.touches[0];
      if (!moveTouch) return;
      const dx = Math.abs(moveTouch.clientX - this.touchSwimlaneStartX);
      const dy = Math.abs(moveTouch.clientY - this.touchSwimlaneStartY);

      // If moved before hold timer completed, cancel and allow normal scrolling
      if (!this.touchSwimlaneHoldReady && (dx > 10 || dy > 10)) {
        this.cancelSwimlaneTouchHold(grabHandle);
        return;
      }

      // Start touch drag if hold completed and moved enough
      if (this.touchSwimlaneHoldReady && !this.touchDragSwimlane) {
        if (dx > 10 || dy > 10) {
          this.startSwimlaneTouchDrag(swimlaneRow, swimlaneKey, e);
        }
      } else if (this.touchDragSwimlaneClone) {
        e.preventDefault();
        this.updateSwimlaneTouchDrag(e);
      }
    }, { passive: false });

    grabHandle.addEventListener('touchend', (e: TouchEvent) => {
      this.cancelSwimlaneTouchHold(grabHandle);
      if (this.touchDragSwimlane) {
        this.endSwimlaneTouchDrag(e);
      }
    });

    grabHandle.addEventListener('touchcancel', () => {
      this.cancelSwimlaneTouchHold(grabHandle);
      this.cleanupSwimlaneTouchDrag();
    });
  }

  private cancelSwimlaneTouchHold(grabHandle: HTMLElement): void {
    if (this.touchSwimlaneHoldTimer) {
      clearTimeout(this.touchSwimlaneHoldTimer);
      this.touchSwimlaneHoldTimer = null;
    }
    grabHandle.classList.remove('planner-kanban-grab--hold-ready');
    this.touchSwimlaneHoldReady = false;
  }

  private startSwimlaneTouchDrag(swimlaneRow: HTMLElement, swimlaneKey: string, e: TouchEvent): void {
    this.touchDragSwimlane = swimlaneRow;
    this.draggedSwimlaneKey = swimlaneKey;

    // Create visual clone
    const labelEl = swimlaneRow.querySelector('.planner-kanban-swimlane-label');
    if (labelEl) {
      this.touchDragSwimlaneClone = labelEl.cloneNode(true) as HTMLElement;
      this.touchDragSwimlaneClone.className = 'planner-kanban-swimlane-drag-clone';
      this.touchDragSwimlaneClone.setCssProps({ '--clone-width': `${labelEl.clientWidth}px` });
      document.body.appendChild(this.touchDragSwimlaneClone);
    }

    swimlaneRow.classList.add('planner-kanban-swimlane--dragging');
    this.updateSwimlaneTouchDrag(e);
  }

  private updateSwimlaneTouchDrag(e: TouchEvent): void {
    if (!this.touchDragSwimlaneClone || !this.boardEl) return;

    const touch = e.touches[0];
    if (!touch) return;
    this.touchDragSwimlaneClone.style.left = `${touch.clientX - 50}px`;
    this.touchDragSwimlaneClone.style.top = `${touch.clientY - 20}px`;

    // Handle edge scrolling
    this.handleEdgeScroll(touch.clientX, touch.clientY);

    // Highlight drop target
    this.highlightSwimlaneDropTarget(touch.clientY);
  }

  private highlightSwimlaneDropTarget(clientY: number): void {
    // Clear previous highlights
    document.querySelectorAll('.planner-kanban-swimlane--drop-above, .planner-kanban-swimlane--drop-below').forEach(el => {
      el.classList.remove('planner-kanban-swimlane--drop-above', 'planner-kanban-swimlane--drop-below');
    });

    // Find swimlane row under touch point
    const rows = Array.from(document.querySelectorAll('.planner-kanban-swimlane-row'));
    for (const row of rows) {
      if (row === this.touchDragSwimlane) continue;
      const rect = row.getBoundingClientRect();
      if (clientY >= rect.top && clientY <= rect.bottom) {
        const midpoint = rect.top + rect.height / 2;
        if (clientY < midpoint) {
          row.classList.add('planner-kanban-swimlane--drop-above');
        } else {
          row.classList.add('planner-kanban-swimlane--drop-below');
        }
        break;
      }
    }
  }

  private endSwimlaneTouchDrag(e: TouchEvent): void {
    this.stopAutoScroll();

    const touch = e.changedTouches[0];
    if (!touch) { this.cleanupSwimlaneTouchDrag(); return; }

    // Find drop target
    const rows = Array.from(document.querySelectorAll('.planner-kanban-swimlane-row'));
    for (const row of rows) {
      if (row === this.touchDragSwimlane) continue;
      const rect = row.getBoundingClientRect();
      if (touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
        const targetKey = row.getAttribute('data-swimlane-row');
        if (targetKey && this.draggedSwimlaneKey) {
          const midpoint = rect.top + rect.height / 2;
          const insertBefore = touch.clientY < midpoint;
          this.reorderSwimlanes(this.draggedSwimlaneKey, targetKey, insertBefore);
        }
        break;
      }
    }

    this.cleanupSwimlaneTouchDrag();
  }

  private cleanupSwimlaneTouchDrag(): void {
    if (this.touchDragSwimlaneClone) {
      this.touchDragSwimlaneClone.remove();
      this.touchDragSwimlaneClone = null;
    }
    if (this.touchDragSwimlane) {
      this.touchDragSwimlane.classList.remove('planner-kanban-swimlane--dragging');
      this.touchDragSwimlane = null;
    }
    this.draggedSwimlaneKey = null;
    this.stopAutoScroll();

    // Clear all drop indicators
    document.querySelectorAll('.planner-kanban-swimlane--drop-above, .planner-kanban-swimlane--drop-below').forEach(el => {
      el.classList.remove('planner-kanban-swimlane--drop-above', 'planner-kanban-swimlane--drop-below');
    });
  }

  private reorderSwimlanes(draggedKey: string, targetKey: string, insertBefore: boolean): void {
    const swimlaneBy = this.getSwimlaneBy();
    if (!swimlaneBy) return;

    // Collect current swimlane keys
    const swimlaneKeys: string[] = [];
    for (const group of this.data.groupedData) {
      for (const entry of group.entries) {
        const value = this.getEntryValue(entry, swimlaneBy);
        const key = this.valueToString(value);
        if (!swimlaneKeys.includes(key)) {
          swimlaneKeys.push(key);
        }
      }
    }

    // Get current order
    let currentOrder = this.getOrderedSwimlaneKeys(swimlaneKeys, swimlaneBy);

    // Remove dragged swimlane from current position
    currentOrder = currentOrder.filter(k => k !== draggedKey);

    // Find target position
    const targetIndex = currentOrder.indexOf(targetKey);
    const insertIndex = insertBefore ? targetIndex : targetIndex + 1;

    // Insert at new position
    currentOrder.splice(insertIndex, 0, draggedKey);

    // Save custom order
    this.setCustomSwimlaneOrder(currentOrder);

    // Re-render
    this.render();
  }

  private renderCards(container: HTMLElement, entries: BasesEntry[]): void {
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
  private renderVirtualCards(container: HTMLElement, entries: BasesEntry[]): void {
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
      placeholder.setAttribute('data-path', entry.file.path);
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

  private createCard(entry: BasesEntry): HTMLElement {
    const card = document.createElement('div');
    card.className = 'planner-kanban-card';
    card.setAttribute('data-path', entry.file.path);
    card.setAttribute('draggable', 'true');

    const color = this.getEntryColor(entry);
    const borderStyle = this.getBorderStyle();

    // Apply base card styles and border variant via CSS classes
    card.classList.add('planner-kanban-card-base');
    if (borderStyle === 'left-accent') {
      card.classList.add('planner-kanban-card-base--left-accent');
      card.setCssProps({ '--card-accent-color': color });
    } else if (borderStyle === 'full-border') {
      card.classList.add('planner-kanban-card-base--full-border');
      card.setCssProps({ '--card-accent-color': color });
    } else {
      card.classList.add('planner-kanban-card-base--default-border');
    }

    // Cover image
    const coverField = this.getCoverField();
    const coverDisplay = this.getCoverDisplay();
    if (coverField && coverDisplay !== 'none') {
      const coverValue = this.getEntryValue(entry, coverField);
      if (coverValue) {
        this.renderCover(card, this.valueToString(coverValue), coverDisplay);
      }
    }

    // Card content container (CSS class handles padding)
    const content = card.createDiv({ cls: 'planner-kanban-card-content' });

    const placement = this.getBadgePlacement();

    // Title row (may include inline badges - CSS class handles inline layout)
    const titleRowCls = placement === 'inline'
      ? 'planner-kanban-card-title-row planner-kanban-card-title-row--inline'
      : 'planner-kanban-card-title-row';
    const titleRow = content.createDiv({ cls: titleRowCls });

    // Title (CSS class handles font-weight)
    const titleField = this.getTitleBy();
    const title = this.getEntryValue(entry, titleField) || entry.file.basename;
    titleRow.createSpan({ cls: 'planner-kanban-card-title', text: this.valueToString(title) });

    // For inline placement, render badges in title row
    if (placement === 'inline') {
      this.renderBadges(titleRow, entry);
    }

    // Summary - only show if configured and visible (CSS class handles all styles)
    const summaryField = this.getSummaryField();
    const visibleProps = this.getVisibleProperties();
    const summaryFieldProp = summaryField ? summaryField.replace(/^(note|file|formula)\./, '') : 'summary';
    const isSummaryVisible = visibleProps.some(p =>
      p === summaryField ||
      p === `note.${summaryFieldProp}` ||
      p.endsWith(`.${summaryFieldProp}`)
    );

    if (isSummaryVisible) {
      const summarySource = summaryField || 'note.summary';
      const summary = this.getEntryValue(entry, summarySource);
      if (summary && summary !== 'null' && summary !== null) {
        const summaryStr = this.valueToString(summary);
        // Auto-format if the summary field points to a date/datetime property
        const displayText = this.looksLikeDateString(summaryStr)
          ? (this.formatDate(summaryStr, this.getDateFormat()) ?? summaryStr)
          : summaryStr;
        content.createDiv({ cls: 'planner-kanban-card-summary', text: displayText });
      }
    }

    // For properties-section placement, render badges below content
    if (placement === 'properties-section') {
      this.renderBadges(content, entry);
    }

    // Setup drag handlers
    this.setupCardDragHandlers(card, entry);

    // Click → open in new tab; right-click → location picker
    card.addEventListener('click', () => { void this.handleCardClick(entry); });
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showOpenFileMenu(this.plugin.app, entry.file.path, e);
    });
    // Page Preview: Ctrl/Cmd + hover over card shows preview popup
    card.addEventListener('mouseenter', (e) => {
      this.triggerHoverPreview(e, entry.file.path, card);
    });

    return card;
  }

  private renderCover(card: HTMLElement, coverPath: string, display: CoverDisplay): void {
    // Resolve the image path - returns null if not found
    const imgSrc = this.resolveImagePath(coverPath);
    if (!imgSrc) {
      return; // Don't render cover if image path can't be resolved
    }

    const coverHeight = this.getCoverHeight();

    // Create actual img element - works better with Obsidian's resource paths
    if (display === 'banner') {
      const coverEl = card.createDiv({ cls: 'planner-kanban-card-cover planner-kanban-cover--banner' });
      // Dynamic cover height from user settings
      coverEl.setCssProps({ '--cover-height': `${coverHeight}px` });
      const img = coverEl.createEl('img');
      img.src = imgSrc;
      img.alt = '';
      this.setupCoverErrorHandler(coverEl, img);
    } else if (display === 'thumbnail-left' || display === 'thumbnail-right') {
      const coverEl = card.createDiv({ cls: 'planner-kanban-card-cover planner-kanban-cover--thumbnail planner-kanban-cover--thumbnail-small' });
      const img = coverEl.createEl('img');
      img.src = imgSrc;
      img.alt = '';
      // Adjust card layout for thumbnails (CSS classes handle styles)
      const thumbnailCls = display === 'thumbnail-left'
        ? 'planner-kanban-card--thumbnail-left'
        : 'planner-kanban-card--thumbnail-right';
      card.addClass(thumbnailCls);
      this.setupCoverErrorHandler(coverEl, img);
    } else if (display === 'background') {
      const coverEl = card.createDiv({ cls: 'planner-kanban-card-cover planner-kanban-cover--background' });
      const img = coverEl.createEl('img');
      img.src = imgSrc;
      img.alt = '';
      card.addClass('planner-kanban-card--background-cover');
      this.setupCoverErrorHandler(coverEl, img);
    }
  }

  private setupCoverErrorHandler(coverEl: HTMLElement, img: HTMLImageElement): void {
    // Handle image load errors - hide cover if image fails
    img.addEventListener('error', () => {
      coverEl.addClass('planner-display-none');
    });
  }

  private resolveImagePath(path: string): string | null {
    // If it's already a URL, return as-is
    if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('app://')) {
      return path;
    }

    // Clean up the path - remove any wiki link brackets (handle [[path]] and [[path|alias]])
    // Also handle cases where brackets appear anywhere in the string (not just start/end)
    let cleanPath = path
      .replace(/\[\[/g, '')       // Remove all [[ occurrences
      .replace(/\]\]/g, '')       // Remove all ]] occurrences
      .replace(/\|.*$/, '')       // Remove alias if present (e.g., path|alias -> path)
      .trim();

    // If empty after cleaning, return null
    if (!cleanPath) {
      return null;
    }

    // Normalize relative paths - remove leading ../ or ./ segments
    // Obsidian's vault API expects paths relative to vault root
    const normalizedPath = cleanPath.replace(/^(\.\.\/)+|^\.\//, '');

    // Extract just the filename for fallback searches
    const filename = normalizedPath.split('/').pop() || normalizedPath;

    // Try direct path lookup first (works for absolute vault paths)
    const file = this.plugin.app.vault.getAbstractFileByPath(normalizedPath);
    if (file instanceof TFile) {
      return this.plugin.app.vault.getResourcePath(file);
    }

    // Try with common image extensions if no extension present
    const hasExtension = /\.\w+$/.test(normalizedPath);
    if (!hasExtension) {
      for (const ext of ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']) {
        const fileWithExt = this.plugin.app.vault.getAbstractFileByPath(normalizedPath + ext);
        if (fileWithExt instanceof TFile) {
          return this.plugin.app.vault.getResourcePath(fileWithExt);
        }
      }
    }

    // Search all files in vault for matching path or filename
    // This handles: relative paths, shortest path format, and various link styles
    const files = this.plugin.app.vault.getFiles();
    const matchingFile = files.find(f =>
      f.path === normalizedPath ||
      f.path.endsWith('/' + normalizedPath) ||
      f.basename === filename.replace(/\.\w+$/, '') ||  // Match without extension
      f.name === filename                                // Match with extension
    );
    if (matchingFile) {
      return this.plugin.app.vault.getResourcePath(matchingFile);
    }

    // Return null if file not found - caller should handle this gracefully
    return null;
  }

  private renderBadges(container: HTMLElement, entry: BasesEntry): void {
    const placement = this.getBadgePlacement();
    const groupByField = this.getGroupBy();
    const groupByProp = groupByField.replace(/^(note|file|formula)\./, '');
    const visibleProps = this.getVisibleProperties();
    const showLabel = this.getShowPropertyLabels();
    // In properties-section each property gets its own row; inline stays flat
    const useRows = placement !== 'inline';

    // Create badge container with appropriate styling based on placement
    const badgeContainer = container.createDiv({
      cls: `planner-kanban-badges planner-kanban-badges--${placement}`
    });

    // CSS classes handle badge container layout based on placement
    if (placement === 'inline') {
      badgeContainer.classList.add('planner-kanban-badges--inline');
    } else {
      badgeContainer.classList.add('planner-kanban-badges--bottom');
    }

    // Helper: check if a property ID is visible (accepts full propId or bare name)
    const isVisible = (propName: string) => {
      return visibleProps.some(p => p === `note.${propName}` || p === propName || p.endsWith(`.${propName}`));
    };

    // Helper: get or create the correct container to append badges into.
    // For row mode, wraps in a prop row with an optional label.
    const makePropContainer = (labelText: string, iconName?: string): HTMLElement => {
      if (!useRows) return badgeContainer;
      const row = badgeContainer.createDiv({ cls: 'planner-kanban-prop-row' });
      if (showLabel) {
        const lbl = row.createSpan({ cls: 'planner-kanban-prop-row-label' });
        if (iconName) {
          const iconEl = lbl.createSpan({ cls: 'planner-kanban-prop-row-label-icon' });
          setIcon(iconEl, iconName);
        }
        lbl.createSpan({ text: labelText });
      }
      return row;
    };

    // Configurable date fields — shown as a range badge when both visible, otherwise individually
    const dateStartField = this.getDateStartField();
    const dateEndField = this.getDateEndField();
    const dateStartProp = dateStartField.replace(/^(note|file|formula)\./, '');
    const dateEndProp = dateEndField.replace(/^(note|file|formula)\./, '');
    const startVisible = isVisible(dateStartProp);
    const endVisible = isVisible(dateEndProp);

    if (startVisible && endVisible) {
      const startVal = this.getEntryValue(entry, dateStartField);
      const endVal = this.getEntryValue(entry, dateEndField);
      if (startVal || endVal) {
        const row = makePropContainer('date', 'calendar-range');
        this.createDateRangeBadge(row, startVal, endVal);
      }
    } else {
      if (startVisible) {
        const startVal = this.getEntryValue(entry, dateStartField);
        if (startVal) {
          const row = makePropContainer('start', 'play');
          this.createDateBadge(row, startVal, 'play');
        }
      }
      if (endVisible) {
        const endVal = this.getEntryValue(entry, dateEndField);
        if (endVal) {
          const row = makePropContainer('end', 'flag');
          this.createDateBadge(row, endVal, 'flag');
        }
      }
    }

    // Fields that are rendered elsewhere on the card — excluded from badges
    const titleField = this.getTitleBy();
    const titleProp = titleField.replace(/^(note|file|formula)\./, '');
    const summaryField = this.getSummaryField();
    const summaryProp = summaryField ? summaryField.replace(/^(note|file|formula)\./, '') : 'summary';
    const coverField = this.getCoverField();

    // Render all other visible properties, one row per property
    for (const propId of visibleProps) {
      const propName = propId.replace(/^(note|file|formula)\./, '');

      // Skip: the field used as the column grouping (redundant)
      if (propName === groupByProp || propId === groupByField) continue;
      // Skip: title field (shown as card title)
      if (propName === titleProp || propId === titleField) continue;
      // Skip: summary field (shown as summary line)
      if (propName === summaryProp || propId === summaryField) continue;
      // Skip: cover field (rendered as image, not a badge)
      if (coverField && (propId === coverField || propName === coverField.replace(/^(note|file|formula)\./, ''))) continue;
      // Skip: date fields (already rendered above as date/range badges)
      if (propName === dateStartProp || propName === dateEndProp) continue;

      const value = this.getEntryValue(entry, propId);
      // Skip null, undefined, empty, and "null" string values
      if (value === null || value === undefined || value === '' || value === 'null') continue;

      const rawValues = Array.isArray(value)
        ? value.filter(v => v && v !== 'null').map(v => this.valueToString(v))
        : [this.valueToString(value)];

      // Auto-format values that look like ISO date/datetime strings
      const fmt = this.getDateFormat();
      const formattedValues = rawValues.map(v => {
        if (this.looksLikeDateString(v)) {
          return this.formatDate(v, fmt) ?? v;
        }
        return v;
      });

      // Filter empty values first; skip the whole prop if nothing to show
      const cleanValues = formattedValues
        .map((v, i) => ({ display: v, raw: rawValues[i] ?? v }))
        .filter(({ display }) => display && display !== 'null' && display !== 'None');
      if (cleanValues.length === 0) continue;

      const displayName = this.config.getDisplayName(propId as BasesPropertyId);

      // In row mode: one row per property, all its values sit inside that row
      const propContainer = makePropContainer(displayName);

      for (const { display, raw } of cleanValues) {
        // Only apply explicit color (PP or valueStyles); null lets CSS theme defaults apply
        const badgeColor = this.getConfiguredFieldColor(propId, raw);
        this.createValueBadge(propContainer, display, badgeColor);
      }
    }

    // Hide empty badge container
    if (badgeContainer.childElementCount === 0) {
      badgeContainer.addClass('planner-display-none');
    }
  }

  /** Render a standalone value pill (no embedded label — label lives on the containing prop-row). */
  private createValueBadge(container: HTMLElement, value: string, color: string | null): void {
    const badge = container.createSpan({ cls: 'planner-badge planner-kanban-badge planner-kanban-badge-generic' });
    if (color) {
      badge.style.backgroundColor = color;
      if (!color.startsWith('rgba') && !color.startsWith('hsla')) {
        badge.style.color = this.getContrastColor(color);
      }
    }
    badge.createSpan({ text: value });
    badge.setAttribute('title', value);
  }

  private createDateBadge(container: HTMLElement, value: unknown, icon: string): void {
    const dateStr = this.formatDate(value, this.getDateFormat());
    if (!dateStr) return;

    // CSS class handles all styles for date badge
    const badge = container.createSpan({ cls: 'planner-badge planner-kanban-badge planner-kanban-badge-date' });
    badge.setAttribute('title', String(value));

    const iconEl = badge.createSpan({ cls: 'planner-kanban-badge-icon' });
    setIcon(iconEl, icon);

    badge.createSpan({ text: dateStr });
  }

  private createDateRangeBadge(container: HTMLElement, startValue: unknown, endValue: unknown): void {
    const fmt = this.getDateFormat();
    const startStr = this.formatDate(startValue, fmt);
    const endStr = this.formatDate(endValue, fmt);
    if (!startStr && !endStr) return;

    const badge = container.createSpan({ cls: 'planner-badge planner-kanban-badge planner-kanban-badge-date' });
    badge.setAttribute('title', [startValue, endValue].filter(Boolean).join(' → '));

    const iconEl = badge.createSpan({ cls: 'planner-kanban-badge-icon' });
    setIcon(iconEl, 'calendar-range');

    if (startStr && endStr) {
      badge.createSpan({ text: `${startStr} → ${endStr}` });
    } else {
      badge.createSpan({ text: startStr ?? endStr ?? '' });
    }
  }

  private createGenericBadge(container: HTMLElement, label: string, value: string, color: string | null, showLabel: boolean): void {
    // CSS class handles all styles for generic badge
    const badge = container.createSpan({ cls: 'planner-badge planner-kanban-badge planner-kanban-badge-generic' });

    if (color) {
      badge.style.backgroundColor = color;
      if (!color.startsWith('rgba') && !color.startsWith('hsla')) {
        badge.style.color = this.getContrastColor(color);
      }
    }

    if (showLabel) {
      badge.createSpan({ cls: 'planner-kanban-badge-label', text: label + ':' });
    }
    badge.createSpan({ text: value });
    badge.setAttribute('title', `${label}: ${value}`);
  }

  /** Returns true when a string value looks like an ISO 8601 date or datetime. */
  private looksLikeDateString(value: string): boolean {
    // Matches: 2026-02-22, 2026-02-22T17:35:12, 2026-02-22T17:35:12+07:00, ...Z
    return /^\d{4}-\d{2}-\d{2}(T[\d:.]+([+-]\d{2}:?\d{2}|Z)?)?$/.test(value.trim());
  }

  private formatDate(value: unknown, format = 'date-short'): string | null {
    if (!value) return null;
    if (typeof value !== 'string' && typeof value !== 'number' && !(value instanceof Date)) return null;

    try {
      // For ISO strings with timezone offset, normalize to local time via Date constructor.
      // JS handles '2026-02-22T17:35:12+07:00' correctly.
      const date = value instanceof Date ? value : new Date(value);
      if (isNaN(date.getTime())) return null;

      switch (format) {
        case 'date-short':
          return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        case 'date-medium':
          return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        case 'date-long':
          return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
        case 'date-numeric':
          return date.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', year: 'numeric' });
        case 'datetime-short':
          return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
            + ' ' + date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
        case 'datetime-medium':
          return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
            + ' ' + date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
        case 'relative': {
          const diffMs = date.getTime() - Date.now();
          const diffDays = Math.round(diffMs / 86400000);
          if (diffDays === 0) return 'Today';
          if (diffDays === 1) return 'Tomorrow';
          if (diffDays === -1) return 'Yesterday';
          if (diffDays > 0) return `in ${diffDays}d`;
          return `${Math.abs(diffDays)}d ago`;
        }
        default:
          return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      }
    } catch {
      return null;
    }
  }

  private getContrastColor(hexColor: string): string {
    // Remove # if present
    const hex = hexColor.replace('#', '');

    // Parse RGB
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    // Calculate luminance
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

    return luminance > 0.5 ? '#000000' : '#ffffff';
  }

  private setupCardDragHandlers(card: HTMLElement, entry: BasesEntry): void {
    // Desktop drag handlers
    card.addEventListener('dragstart', (e: DragEvent) => {
      this.draggedCardPath = entry.file.path;
      this.draggedFromColumn = card.closest('.planner-kanban-column')?.getAttribute('data-group') ||
        card.closest('.planner-kanban-swimlane-cell')?.getAttribute('data-group') || null;
      card.classList.add('planner-kanban-card--dragging');
      e.dataTransfer?.setData('text/plain', entry.file.path);
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('planner-kanban-card--dragging');
      this.draggedCardPath = null;
      this.draggedFromColumn = null;
      this.stopAutoScroll();
    });

    // Desktop dragover for edge scrolling
    card.addEventListener('drag', (e: DragEvent) => {
      if (!this.boardEl || !e.clientX) return;
      this.handleEdgeScroll(e.clientX, e.clientY);
    });

    // Mobile touch handlers with tap-hold delay to prevent accidental drags while scrolling
    const HOLD_DELAY_MS = 200; // Time finger must be held before drag is enabled

    card.addEventListener('touchstart', (e: TouchEvent) => {
      // Clear any previous touch state (important after scrolling on iOS)
      this.cancelTouchHold();

      const startTouch = e.touches[0];
      if (!startTouch) return;
      this.touchStartX = startTouch.clientX;
      this.touchStartY = startTouch.clientY;
      this.touchHoldReady = false;
      this.touchHoldCard = card;
      this.touchHoldEntry = entry;

      // CRITICAL: Set touch-action: none IMMEDIATELY to prevent iOS from committing to scroll.
      // iOS decides touch behavior at touchstart based on CSS at that moment.
      // If user moves before hold completes, we remove this class in cancelTouchHold().
      card.classList.add('planner-kanban-card--touch-active');

      // Start hold timer - drag only enabled after delay
      this.touchHoldTimer = window.setTimeout(() => {
        this.touchHoldReady = true;
        // Add visual feedback that card is ready to drag
        card.classList.add('planner-kanban-card--hold-ready');
      }, HOLD_DELAY_MS);
    }, { passive: true });

    card.addEventListener('touchmove', (e: TouchEvent) => {
      const moveT = e.touches[0];
      if (!moveT) return;
      const dx = Math.abs(moveT.clientX - this.touchStartX);
      const dy = Math.abs(moveT.clientY - this.touchStartY);

      // If moved before hold timer completed, cancel and allow normal scrolling
      if (!this.touchHoldReady && (dx > 10 || dy > 10)) {
        this.cancelTouchHold();
        return; // Allow default scroll behavior
      }

      // Once hold-ready, ALWAYS prevent default to stop iOS from committing to scroll
      // This must happen on every touchmove, not just when movement threshold is met
      if (this.touchHoldReady) {
        e.preventDefault();
      }

      // Start drag if hold delay completed, not already dragging, and moved enough
      if (this.touchHoldReady && !this.touchDragCard && !this.touchDragClone) {
        if (dx > 10 || dy > 10) {
          this.startTouchDrag(card, entry, e);
        }
      } else if (this.touchDragClone) {
        this.updateTouchDrag(e);
      }
    }, { passive: false });

    card.addEventListener('touchend', (e: TouchEvent) => {
      this.cancelTouchHold();
      if (this.touchDragCard) {
        this.endTouchDrag(e);
      }
    });

    card.addEventListener('touchcancel', () => {
      this.cancelTouchHold();
      if (this.touchDragCard) {
        const doc = this.containerEl.ownerDocument;
        // Remove context menu blocker
        doc.removeEventListener('contextmenu', this.boundContextMenuBlocker, true);
        // Clean up drag state on cancel
        if (this.touchDragClone) {
          this.touchDragClone.remove();
          this.touchDragClone = null;
        }
        if (this.touchDragCard) {
          // Remove all drag-related classes
          this.touchDragCard.classList.remove('planner-kanban-card--dragging');
          this.touchDragCard.classList.remove('planner-kanban-card--hold-ready');
          this.touchDragCard.classList.remove('planner-kanban-card--touch-active');
          this.touchDragCard = null;
        }
        this.draggedCardPath = null;
        this.draggedFromColumn = null;
        this.lastTouchX = 0;
        this.lastTouchY = 0;
        this.stopAutoScroll();
      }
    });
  }

  private cancelTouchHold(): void {
    if (this.touchHoldTimer) {
      clearTimeout(this.touchHoldTimer);
      this.touchHoldTimer = null;
    }
    if (this.touchHoldCard) {
      this.touchHoldCard.classList.remove('planner-kanban-card--hold-ready');
      // Restore touch-action to allow normal scrolling
      this.touchHoldCard.classList.remove('planner-kanban-card--touch-active');
    }
    this.touchHoldReady = false;
    this.touchHoldCard = null;
    this.touchHoldEntry = null;
  }

  private startTouchDrag(card: HTMLElement, entry: BasesEntry, e: TouchEvent): void {
    const doc = this.containerEl.ownerDocument;

    this.touchDragCard = card;
    this.draggedCardPath = entry.file.path;
    this.draggedFromColumn = card.closest('.planner-kanban-column')?.getAttribute('data-group') ||
      card.closest('.planner-kanban-swimlane-cell')?.getAttribute('data-group') || null;

    // Block context menu during drag (critical for iOS long-press)
    doc.addEventListener('contextmenu', this.boundContextMenuBlocker, true);

    // Create a clone for visual feedback
    this.touchDragClone = card.cloneNode(true) as HTMLElement;
    this.touchDragClone.className = 'planner-kanban-drag-clone';
    this.touchDragClone.setCssProps({ '--clone-width': `${card.offsetWidth}px` });
    doc.body.appendChild(this.touchDragClone);

    // Remove hold-ready class (has touch-action: none which must not persist)
    // and add dragging class
    card.classList.remove('planner-kanban-card--hold-ready');
    card.classList.add('planner-kanban-card--dragging');

    this.updateTouchDrag(e);
  }

  private updateTouchDrag(e: TouchEvent): void {
    if (!this.touchDragClone || !this.boardEl) return;

    const touch = e.touches[0];
    if (!touch) return;
    this.touchDragClone.style.left = `${touch.clientX - 50}px`;
    this.touchDragClone.style.top = `${touch.clientY - 20}px`;

    // Store last touch position for iOS fallback (touchend coordinates can be unreliable)
    this.lastTouchX = touch.clientX;
    this.lastTouchY = touch.clientY;

    // Handle edge scrolling
    this.handleEdgeScroll(touch.clientX, touch.clientY);

    // Highlight drop target
    this.highlightDropTarget(touch.clientX, touch.clientY);
  }

  private endTouchDrag(e: TouchEvent): void {
    const doc = this.containerEl.ownerDocument;

    this.stopAutoScroll();

    // Remove context menu blocker
    doc.removeEventListener('contextmenu', this.boundContextMenuBlocker, true);

    // Find drop target BEFORE removing clone (iOS Safari needs this timing)
    // The clone has pointer-events: none, so elementFromPoint sees through it
    let dropTarget: { group: string; swimlane?: string } | null = null;
    if (this.touchDragCard) {
      const touch = e.changedTouches[0];
      if (touch) {
        // Try touchend coordinates first, fall back to last stored position from touchmove
        // (iOS touchend coordinates can be unreliable)
        dropTarget = this.findDropTarget(touch.clientX, touch.clientY);
      }
      if (!dropTarget && (this.lastTouchX !== 0 || this.lastTouchY !== 0)) {
        dropTarget = this.findDropTarget(this.lastTouchX, this.lastTouchY);
      }
    }

    if (this.touchDragClone) {
      this.touchDragClone.remove();
      this.touchDragClone = null;
    }

    if (this.touchDragCard) {
      // Remove all drag-related classes
      this.touchDragCard.classList.remove('planner-kanban-card--dragging');
      this.touchDragCard.classList.remove('planner-kanban-card--hold-ready');
      this.touchDragCard.classList.remove('planner-kanban-card--touch-active');

      if (dropTarget && this.draggedCardPath) {
        void this.handleCardDrop(this.draggedCardPath, dropTarget.group, dropTarget.swimlane);
      }

      this.touchDragCard = null;
    }

    this.draggedCardPath = null;
    this.draggedFromColumn = null;
    this.lastTouchX = 0;
    this.lastTouchY = 0;

    // Clear all dragover highlights
    doc.querySelectorAll('.planner-kanban-cards--dragover').forEach(el => {
      el.classList.remove('planner-kanban-cards--dragover');
    });
  }

  private handleEdgeScroll(clientX: number, clientY: number): void {
    if (!this.boardEl) return;

    const boardRect = this.boardEl.getBoundingClientRect();
    const edgeThreshold = 60;
    const scrollSpeed = 15;

    let scrollX = 0;
    let scrollY = 0;

    // Check horizontal edges (always use boardEl rect)
    if (clientX < boardRect.left + edgeThreshold) {
      scrollX = -scrollSpeed;
    } else if (clientX > boardRect.right - edgeThreshold) {
      scrollX = scrollSpeed;
    }

    // Check vertical edges
    // When swimlanes are enabled, use containerEl rect since that's the vertical scroll container
    const verticalRect = this.getSwimlaneBy()
      ? this.containerEl.getBoundingClientRect()
      : boardRect;

    if (clientY < verticalRect.top + edgeThreshold) {
      scrollY = -scrollSpeed;
    } else if (clientY > verticalRect.bottom - edgeThreshold) {
      scrollY = scrollSpeed;
    }

    if (scrollX !== 0 || scrollY !== 0) {
      this.startAutoScroll(scrollX, scrollY);
    } else {
      this.stopAutoScroll();
    }
  }

  private startAutoScroll(scrollX: number, scrollY: number): void {
    if (this.scrollInterval) {
      clearInterval(this.scrollInterval);
    }

    this.scrollInterval = window.setInterval(() => {
      if (this.boardEl) {
        // Horizontal scrolling always uses boardEl
        this.boardEl.scrollLeft += scrollX;

        // Vertical scrolling: when swimlanes are enabled, use containerEl
        // because boardEl has min-height: min-content and expands to fit content
        if (scrollY !== 0 && this.getSwimlaneBy()) {
          this.containerEl.scrollTop += scrollY;
        } else {
          this.boardEl.scrollTop += scrollY;
        }
      }
    }, 16);
  }

  private stopAutoScroll(): void {
    if (this.scrollInterval) {
      clearInterval(this.scrollInterval);
      this.scrollInterval = null;
    }
  }

  private highlightDropTarget(clientX: number, clientY: number): void {
    const doc = this.containerEl.ownerDocument;

    // Clear previous highlights
    doc.querySelectorAll('.planner-kanban-cards--dragover').forEach(el => {
      el.classList.remove('planner-kanban-cards--dragover');
    });

    // Hide ghost before elementFromPoint (critical for iOS Safari)
    if (this.touchDragClone) this.touchDragClone.classList.add('planner-kanban-drag-clone--hidden');

    // Find and highlight current target
    const target = doc.elementFromPoint(clientX, clientY);

    // Restore ghost visibility
    if (this.touchDragClone) this.touchDragClone.classList.remove('planner-kanban-drag-clone--hidden');

    const dropZone = target?.closest('.planner-kanban-cards, .planner-kanban-swimlane-cell');
    if (dropZone) {
      dropZone.classList.add('planner-kanban-cards--dragover');
    }
  }

  private findDropTarget(clientX: number, clientY: number): { group: string; swimlane?: string } | null {
    const doc = this.containerEl.ownerDocument;

    // Hide ghost before elementFromPoint (critical for iOS Safari)
    if (this.touchDragClone) this.touchDragClone.classList.add('planner-kanban-drag-clone--hidden');

    const target = doc.elementFromPoint(clientX, clientY);

    // Restore ghost visibility
    if (this.touchDragClone) this.touchDragClone.classList.remove('planner-kanban-drag-clone--hidden');

    const dropZone = target?.closest('.planner-kanban-cards, .planner-kanban-swimlane-cell, .planner-kanban-column');
    const group = dropZone?.getAttribute('data-group');
    if (!group) return null;

    const swimlane = dropZone?.getAttribute('data-swimlane') || undefined;
    return { group, swimlane };
  }

  private setupDropHandlers(container: HTMLElement, groupKey: string, swimlaneKey?: string): void {
    container.addEventListener('dragover', (e: DragEvent) => {
      e.preventDefault();
      container.classList.add('planner-kanban-cards--dragover');
    });

    container.addEventListener('dragleave', () => {
      container.classList.remove('planner-kanban-cards--dragover');
    });

    container.addEventListener('drop', (e: DragEvent) => {
      e.preventDefault();
      container.classList.remove('planner-kanban-cards--dragover');

      if (this.draggedCardPath) {
        void this.handleCardDrop(this.draggedCardPath, groupKey, swimlaneKey);
      }
    });
  }

  private async handleCardDrop(filePath: string, newGroupValue: string, newSwimlaneValue?: string): Promise<void> {
    try {
      const groupByField = this.getGroupBy();
      const fieldName = groupByField.replace(/^(note|file|formula)\./, '');
      const swimlaneBy = this.getSwimlaneBy();
      const swimlaneFieldName = swimlaneBy ? swimlaneBy.replace(/^(note|file|formula)\./, '') : null;

      const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
      if (!(file instanceof TFile)) return;

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
        const currentFolder = file.parent?.path || '';
        if (targetFolder !== currentFolder) {
          const movedPath = await this.plugin.itemService.moveItem(filePath, targetFolder);
          if (movedPath) {
            newFilePath = movedPath;
          }
        }
      }

      // Now update frontmatter for non-folder and non-formula properties
      // Formula properties are computed by Bases and should never be written to frontmatter
      const isFormulaGroup = groupByField.startsWith('formula.');
      const isFormulaSwimlane = swimlaneBy ? swimlaneBy.startsWith('formula.') : false;

      const needsFrontmatterUpdate =
        (!isFolderGroupBy && !isFormulaGroup && newGroupValue !== undefined) ||
        (!isFolderSwimlane && !isFormulaSwimlane && swimlaneFieldName && newSwimlaneValue !== undefined);

      if (needsFrontmatterUpdate) {
        const fileToUpdate = this.plugin.app.vault.getAbstractFileByPath(newFilePath);
        if (!(fileToUpdate instanceof TFile)) return;

        await this.plugin.app.fileManager.processFrontMatter(fileToUpdate, (fm: Record<string, unknown>) => {
          // Update groupBy field (if not folder or formula)
          if (!isFolderGroupBy && !isFormulaGroup) {
            fm[fieldName] = this.convertValueForField(fieldName, newGroupValue);
          }
          // Update swimlane field (if not folder or formula)
          if (!isFolderSwimlane && !isFormulaSwimlane && swimlaneFieldName && newSwimlaneValue !== undefined) {
            fm[swimlaneFieldName] = this.convertValueForField(swimlaneFieldName, newSwimlaneValue);
          }
        });
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

  private handleCardClick(entry: BasesEntry): void {
    openFileInNewTab(this.plugin.app, entry.file.path);
  }

  /**
   * Trigger Obsidian's Page Preview for a file path.
   * The preview popup appears when the user holds Ctrl/Cmd while hovering;
   * Obsidian's internal page-preview plugin handles that key check.
   */
  private triggerHoverPreview(event: MouseEvent, filePath: string, targetEl: HTMLElement): void {
    this.plugin.app.workspace.trigger('hover-link', {
      event,
      source: 'planner-kanban',
      hoverParent: this.plugin,
      targetEl,
      linktext: filePath,
      sourcePath: '/',
    });
  }
}

/**
 * Create the Bases view registration for the Kanban
 */
export function createKanbanViewRegistration(plugin: PlannerPlugin): BasesViewRegistration {
  return {
    name: 'Kanban',
    icon: 'square-kanban',
    factory: (controller: QueryController, containerEl: HTMLElement) => {
      return new BasesKanbanView(controller, containerEl, plugin);
    },
    options: (_config: BasesViewConfig): BasesAllOptions[] => [
      {
        type: 'property',
        key: 'plannerGroupBy',
        displayName: 'Columns by',
        default: 'note.status',
        placeholder: 'Select property',
        filter: (propId: BasesPropertyId) =>
          PropertyTypeService.isCategoricalProperty(propId, plugin.app),
      },
      {
        type: 'property',
        key: 'swimlaneBy',
        displayName: 'Swimlanes by',
        default: '',
        placeholder: 'None',
        filter: (propId: BasesPropertyId) =>
          PropertyTypeService.isCategoricalProperty(propId, plugin.app),
      },
      {
        type: 'property',
        key: 'colorBy',
        displayName: 'Color by',
        default: 'note.calendar',
        placeholder: 'Select property',
        filter: (propId: BasesPropertyId) =>
          PropertyTypeService.isCategoricalProperty(propId, plugin.app),
      },
      {
        type: 'property',
        key: 'titleBy',
        displayName: 'Title by',
        default: 'note.title',
        placeholder: 'Select property',
        filter: (propId: BasesPropertyId) =>
          PropertyTypeService.isTextProperty(propId, plugin.app),
      },
      {
        type: 'dropdown',
        key: 'borderStyle',
        displayName: 'Border style',
        default: 'left-accent',
        options: {
          'none': 'None',
          'left-accent': 'Left accent',
          'full-border': 'Full border',
        },
      },
      {
        type: 'property',
        key: 'coverField',
        displayName: 'Cover field',
        default: 'note.cover',
        placeholder: 'None',
        filter: (propId: BasesPropertyId) =>
          PropertyTypeService.isTextProperty(propId, plugin.app),
      },
      {
        type: 'dropdown',
        key: 'coverDisplay',
        displayName: 'Cover display',
        default: 'banner',
        options: {
          'none': 'None',
          'banner': 'Banner (top)',
          'thumbnail-left': 'Thumbnail (left)',
          'thumbnail-right': 'Thumbnail (right)',
          'background': 'Background',
        },
      },
      {
        type: 'dropdown',
        key: 'coverHeight',
        displayName: 'Cover height (banner)',
        default: '100',
        options: {
          '60': 'Extra small (60px)',
          '80': 'Small (80px)',
          '100': 'Medium-small (100px)',
          '120': 'Medium (120px)',
          '150': 'Medium-large (150px)',
          '180': 'Large (180px)',
          '200': 'Extra large (200px)',
        },
      },
      {
        type: 'property',
        key: 'summaryField',
        displayName: 'Summary field',
        default: 'note.summary',
        placeholder: 'None',
      },
      {
        type: 'property',
        key: 'dateStartField',
        displayName: 'Date start field',
        default: '',
        placeholder: 'Select property',
        filter: (propId: BasesPropertyId) =>
          PropertyTypeService.isDateProperty(propId, plugin.app),
      },
      {
        type: 'property',
        key: 'dateEndField',
        displayName: 'Date end field',
        default: '',
        placeholder: 'Select property',
        filter: (propId: BasesPropertyId) =>
          PropertyTypeService.isDateProperty(propId, plugin.app),
      },
      {
        type: 'dropdown',
        key: 'dateFormat',
        displayName: 'Date format',
        default: 'date-short',
        options: {
          'date-short': 'Short (Jan 15)',
          'date-medium': 'Medium (Jan 15, 2026)',
          'date-long': 'Long (January 15, 2026)',
          'date-numeric': 'Numeric (1/15/2026)',
          'datetime-short': 'Date + time (Jan 15 10:30)',
          'datetime-medium': 'Date + time, year (Jan 15, 2026 10:30)',
          'relative': 'Relative (2d ago / in 3d)',
        },
      },
      {
        type: 'dropdown',
        key: 'badgePlacement',
        displayName: 'Badge placement',
        default: 'properties-section',
        options: {
          'inline': 'Inline',
          'properties-section': 'Properties section',
        },
      },
      {
        type: 'dropdown',
        key: 'columnWidth',
        displayName: 'Column width',
        default: '280',
        options: {
          '200': 'Narrow (200px)',
          '240': 'Medium-narrow (240px)',
          '280': 'Medium (280px)',
          '320': 'Medium-wide (320px)',
          '360': 'Wide (360px)',
          '400': 'Extra wide (400px)',
        },
      },
      {
        type: 'dropdown',
        key: 'hideEmptyColumns',
        displayName: 'Hide empty columns',
        default: 'false',
        options: {
          'false': 'No',
          'true': 'Yes',
        },
      },
      {
        type: 'dropdown',
        key: 'freezeHeaders',
        displayName: 'Freeze headers',
        default: 'both',
        options: {
          'off': 'Off',
          'columns': 'Columns',
          'swimlanes': 'Swimlanes',
          'both': 'Both',
        },
      },
      {
        type: 'dropdown',
        key: 'swimHeaderDisplay',
        displayName: 'Swimlane header display',
        default: 'vertical',
        options: {
          'horizontal': 'Horizontal',
          'vertical': 'Vertical',
        },
      },
      {
        type: 'dropdown',
        key: 'showPropertyLabels',
        displayName: 'Show property labels in badges',
        default: 'true',
        options: {
          'true': 'Show',
          'false': 'Hide',
        },
      },
    ],
  };
}
