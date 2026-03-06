/**
 * BasesTimelineView - Markwhen Timeline integration for Obsidian Bases
 *
 * This view displays items on a beautiful timeline using the Markwhen
 * Timeline component embedded in an iframe with LPC communication.
 */

import {
  BasesView,
  BasesViewRegistration,
  BasesAllOptions,
  BasesViewConfig,
  BasesEntry,
  BasesPropertyId,
  QueryController,
  TFile,
} from 'obsidian';
import type PlannerPlugin from '../main';
import { MarkwhenAdapter, AdapterOptions } from '../services/MarkwhenAdapter';
import { PropertyTypeService } from '../services/PropertyTypeService';
import { LpcHost, LpcCallbacks } from '../services/LpcHost';
import {
  TimelineGroupBy,
  TimelineSectionsBy,
  TimelineColorBy,
  MarkwhenState,
  AppState,
  EditEventDateRangeMessage,
  NewEventMessage,
  EventPath,
  DependencyArrow,
} from '../types/markwhen';

// Timeline HTML is bundled inline for mobile compatibility
// Runtime file loading doesn't work reliably on mobile platforms
import timelineHtml from '../../assets/timeline-markwhen.html';

export const BASES_TIMELINE_VIEW_ID = 'wise-view-timeline';

/**
 * Timeline View for Obsidian Bases
 * Displays items on a Markwhen Timeline
 */
export class BasesTimelineView extends BasesView {
  type = BASES_TIMELINE_VIEW_ID;
  private plugin: PlannerPlugin;
  private containerEl: HTMLElement;
  private iframeContainer: HTMLElement | null = null;
  private iframe: HTMLIFrameElement | null = null;
  private adapter: MarkwhenAdapter;
  private lpcHost: LpcHost;
  private isInitialized: boolean = false;
  private resizeObserver: ResizeObserver | null = null;
  // Cached state for responding to Timeline requests
  private currentMarkwhenState: MarkwhenState | null = null;
  private currentAppState: AppState | null = null;
  // Cached dependency arrows sent to the in-iframe gantt overlay
  private currentDependencyArrows: DependencyArrow[] = [];

  // Configuration getters - now accept any property ID for custom properties
  private getGroupBy(): TimelineGroupBy {
    const value = this.config?.get('plannerGroupBy') as string | undefined;
    return (value || this.plugin.settings.timelineDefaults.plannerGroupBy || 'none');
  }

  private getSectionsBy(): TimelineSectionsBy {
    const value = this.config?.get('sectionsBy') as string | undefined;
    return (value || this.plugin.settings.timelineDefaults.sectionsBy || 'none');
  }

  private getColorBy(): TimelineColorBy {
    const value = this.config?.get('colorBy') as string | undefined;
    return (value || this.plugin.settings.timelineDefaults.colorBy || 'none');
  }

  private getDateStartField(): string {
    const value = this.config?.get('dateStartField') as string | undefined;
    return value || this.plugin.settings.timelineDefaults.dateStartField;
  }

  private getDateEndField(): string {
    const value = this.config?.get('dateEndField') as string | undefined;
    return value || this.plugin.settings.timelineDefaults.dateEndField;
  }

  private getTitleField(): string {
    const value = this.config?.get('titleField') as string | undefined;
    return value || 'note.title';
  }

  private getBackgroundColor(): string | undefined {
    const value = this.config?.get('backgroundColor') as string | undefined;
    // Return undefined for 'default' or empty to use theme defaults
    if (!value || value === 'default') return undefined;
    return value;
  }

  private getDependenciesField(): string {
    const value = this.config?.get('dependenciesField') as string | undefined;
    return value || this.plugin.settings.timelineDefaults.dependenciesField || 'blocked_by';
  }

  private getDateLabelFormat(): 'start' | 'end' | 'range' {
    const value = this.config?.get('dateLabelFormat') as string | undefined;
    const resolved = value || this.plugin.settings.timelineDefaults.dateLabelFormat || 'range';
    if (resolved === 'start' || resolved === 'end') return resolved;
    return 'range';
  }

  /**
   * Build the iframe srcdoc: timeline HTML + injected dependency-arrow overlay script.
   *
   * The overlay script runs inside the iframe and draws SVG dependency arrows
   * between gantt bars whenever a `plannerDependencies` postMessage is received.
   * It accesses Markwhen's internal Pinia stores to resolve row positions.
   */
  private buildSrcdoc(): string {
    return timelineHtml.replace('</body>', BasesTimelineView.ARROW_OVERLAY_SCRIPT + '\n</body>');
  }

  /**
   * Dependency-arrow SVG overlay — injected into the Markwhen iframe srcdoc.
   *
   * Design:
   *  - Creates a position:fixed SVG that covers the full viewport (pointer-events:none).
   *  - On `plannerDependencies` message: stores {fromPath, toPath, fromEndDate, toStartDate}[]
   *    and schedules a redraw.
   *  - Finds Markwhen's Pinia stores by iterating the Vue app's _context.provides.
   *  - Uses predecessorMap (nodeStore getter) to map path-key strings → row index N.
   *  - Finds the gantt bar container div (style contains "-350%") whose top = 100+N*30,
   *    then queries .eventBar inside it for screen coordinates via getBoundingClientRect.
   *  - Draws elbow SVG paths; arrows are red when the predecessor ends after the
   *    successor starts (constraint violation).
   *  - Re-draws on DOM mutations, scroll, resize, and incoming state messages.
   */
  private static readonly ARROW_OVERLAY_SCRIPT = `<script>
(function(){
  'use strict';
  var pending = [];
  var timer = null;
  var NS = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('id', 'planner-dep-svg');
  svg.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:9998;overflow:visible;';
  var defs = document.createElementNS(NS, 'defs');
  function mkMarker(id, color) {
    var m = document.createElementNS(NS, 'marker');
    m.setAttribute('id', id); m.setAttribute('markerWidth', '8'); m.setAttribute('markerHeight', '8');
    m.setAttribute('refX', '7'); m.setAttribute('refY', '4'); m.setAttribute('orient', 'auto');
    var p = document.createElementNS(NS, 'path');
    p.setAttribute('d', 'M0,0 L0,8 L8,4 z'); p.setAttribute('fill', color);
    m.appendChild(p); return m;
  }
  defs.appendChild(mkMarker('pdep-ok', '#60a5fa'));
  defs.appendChild(mkMarker('pdep-vio', '#f87171'));
  svg.appendChild(defs);
  function findPinia() {
    try {
      var el = document.getElementById('app');
      if (!el || !el.__vue_app__) return null;
      var prov = el.__vue_app__._context.provides;
      var keys = Object.getOwnPropertySymbols(prov).concat(Object.keys(prov));
      for (var i = 0; i < keys.length; i++) {
        var v = prov[keys[i]];
        if (v && typeof v === 'object' && v._s instanceof Map) return v;
      }
    } catch(e) {}
    return null;
  }
  function findStores() {
    var pinia = findPinia(); if (!pinia) return null;
    var ns = null, ps = null;
    var it = pinia._s.entries(), e;
    while (!(e = it.next()).done) {
      var s = e.value[1];
      if (!ns && s.predecessorMap && typeof s.predecessorMap.get === 'function') ns = s;
      if (!ps && s.mode !== undefined && s.ganttSidebarWidth !== undefined) ps = s;
    }
    return (ns && ps) ? { ns: ns, ps: ps } : null;
  }
  function clearPaths() {
    var ch = svg.childNodes, rm = [];
    for (var i = 0; i < ch.length; i++) if (ch[i] !== defs) rm.push(ch[i]);
    for (var j = 0; j < rm.length; j++) svg.removeChild(rm[j]);
  }
  function elbow(x1, y1, x2, y2, color, mid) {
    var path = document.createElementNS(NS, 'path'); var d;
    if (x2 > x1 + 4) {
      var mx = x1 + (x2 - x1) * 0.5;
      d = 'M'+x1+','+y1+' L'+mx+','+y1+' L'+mx+','+y2+' L'+x2+','+y2;
    } else {
      var jog = 14; var my = Math.min(y1,y2) - 12;
      d = 'M'+x1+','+y1+' L'+(x1+jog)+','+y1+' L'+(x1+jog)+','+my
         +' L'+(x2-jog)+','+my+' L'+(x2-jog)+','+y2+' L'+x2+','+y2;
    }
    path.setAttribute('d', d); path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', '1.5'); path.setAttribute('fill', 'none');
    path.setAttribute('stroke-opacity', '0.85'); path.setAttribute('marker-end', 'url(#'+mid+')');
    svg.appendChild(path);
  }
  function draw() {
    clearPaths(); if (!pending.length) return;
    var st = findStores(); if (!st || st.ps.mode !== 'gantt') return;
    var pm = st.ns.predecessorMap;
    if (!pm || typeof pm.get !== 'function') return;
    var barDivs = document.querySelectorAll('[style*="-350%"]');
    var t2b = {};
    for (var i = 0; i < barDivs.length; i++) {
      var d = barDivs[i]; var dt = parseInt(d.style.top);
      if (!isNaN(dt)) { var b = d.querySelector('.eventBar'); if (b) t2b[dt] = b; }
    }
    for (var k = 0; k < pending.length; k++) {
      var a = pending[k];
      var fn = pm.get(a.fromPath); var tn = pm.get(a.toPath);
      if (fn === undefined || fn === null || tn === undefined || tn === null) continue;
      var fb = t2b[100 + fn * 30]; var tb = t2b[100 + tn * 30];
      if (!fb || !tb) continue;
      var fr = fb.getBoundingClientRect(); var tr = tb.getBoundingClientRect();
      if (fr.width < 1 || tr.width < 1) continue;
      var vio = new Date(a.fromEndDate) > new Date(a.toStartDate);
      elbow(fr.right, fr.top + fr.height/2, tr.left, tr.top + tr.height/2,
            vio ? '#f87171' : '#60a5fa', vio ? 'pdep-vio' : 'pdep-ok');
    }
  }
  function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function(){ requestAnimationFrame(draw); timer = null; }, 60);
  }
  window.addEventListener('message', function(e) {
    if (!e.data) return;
    if (e.data.type === 'plannerDependencies') {
      pending = (e.data.params && e.data.params.arrows) ? e.data.params.arrows : [];
      schedule();
    } else if (e.data.request && (e.data.type === 'markwhenState' || e.data.type === 'appState')) {
      schedule();
    }
  });
  function init() {
    if (!document.getElementById('planner-dep-svg')) document.body.appendChild(svg);
    var mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:['style'] });
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
</script>`;

  constructor(
    controller: QueryController,
    containerEl: HTMLElement,
    plugin: PlannerPlugin
  ) {
    super(controller);
    this.plugin = plugin;
    this.containerEl = containerEl;
    this.adapter = new MarkwhenAdapter(plugin.settings, this.app);

    // Set up LPC callbacks
    const callbacks: LpcCallbacks = {
      onEditEventDateRange: (params) => { void this.handleEditEventDateRange(params); },
      onNewEvent: (params) => this.handleNewEvent(params),
      onSetDetailPath: (path) => { void this.handleSetDetailPath(path); },
      onSetHoveringPath: (path) => this.handleSetHoveringPath(path),
      // State providers - called when Timeline requests current state
      getMarkwhenState: () => this.currentMarkwhenState,
      getAppState: () => this.currentAppState,
    };
    this.lpcHost = new LpcHost(callbacks);
  }

  /**
   * Render the timeline view - called internally
   */
  private render(): void {
    // Set up container if needed
    if (!this.iframeContainer || !this.iframeContainer.isConnected) {
      this.setupContainer();
    }

    // Initialize or update timeline
    if (!this.isInitialized) {
      this.initTimeline();
    } else {
      this.updateTimeline();
    }
  }

  /**
   * Set up the container with iframe
   */
  private setupContainer(): void {
    // Clear container
    this.containerEl.empty();
    this.containerEl.addClass('planner-bases-timeline');

    // Build iframe container
    this.buildIframeContainer();

    // Set up resize observer
    this.setupResizeObserver();
  }

  /**
   * Called by Bases when data is updated
   */
  onDataUpdated(): void {
    this.render();
  }

  /**
   * Build the iframe container
   */
  private buildIframeContainer(): void {
    this.iframeContainer = this.containerEl.createDiv('planner-timeline-iframe-container');

    // Create iframe (no sandbox needed - we control the content)
    this.iframe = this.iframeContainer.createEl('iframe', {
      cls: 'planner-timeline-iframe',
      attr: {
        title: 'Markwhen timeline',
      },
    });

    // Connect LPC host to iframe
    this.lpcHost.connect(this.iframe);
  }

  /**
   * Show an error message in the container
   */
  private showError(message: string): void {
    this.containerEl.empty();
    const errorDiv = this.containerEl.createEl('div', {
      cls: 'planner-timeline-error',
    });
    errorDiv.createEl('div', {
      text: '⚠️ timeline error',
      cls: 'planner-timeline-error-title',
    });
    errorDiv.createEl('div', {
      text: message,
      cls: 'planner-timeline-error-message',
    });
  }

  /**
   * Initialize the timeline
   */
  private initTimeline(): void {
    if (!this.iframe) {
      return;
    }

    // Pre-compute state before loading iframe so it's ready for requests
    this.computeState();

    // Verify bundled HTML is available
    if (!timelineHtml || timelineHtml.length === 0) {
      console.error('Planner: Timeline HTML is empty');
      this.showError('Timeline HTML not found. Please reinstall the plugin.');
      return;
    }

    // Set up error handler
    this.iframe.onerror = (event) => {
      console.error('Planner: Timeline iframe error:', event);
      this.showError('Failed to load Timeline content. Please try reloading.');
    };

    // Set up onload handler
    this.iframe.onload = () => {
      this.isInitialized = true;

      // Push initial state to the Timeline after it's loaded
      // The Timeline's useLpc listeners receive state via "request" messages
      if (this.currentMarkwhenState && this.currentAppState) {
        this.lpcHost.sendState(this.currentMarkwhenState, this.currentAppState);
        // Send dependency arrows after state so the overlay has event positions
        this.lpcHost.sendDependencies(this.currentDependencyArrows);
      }
    };

    // Use srcdoc with injected dependency-arrow overlay script.
    // buildSrcdoc() appends a <script> tag before </body> that draws SVG arrows
    // inside the iframe based on plannerDependencies postMessages.
    this.iframe.srcdoc = this.buildSrcdoc();
  }

  /**
   * Compute and cache the current state
   */
  private computeState(): void {
    // Get entries from Bases data
    const entries = this.getEntriesFromData();

    // Build adapter options
    const options: AdapterOptions = {
      groupBy: this.getGroupBy(),
      sectionsBy: this.getSectionsBy(),
      colorBy: this.getColorBy(),
      dateStartField: this.getDateStartField(),
      dateEndField: this.getDateEndField(),
      titleField: this.getTitleField(),
      dependenciesField: this.getDependenciesField(),
      dateLabelFormat: this.getDateLabelFormat(),
    };

    // Adapt entries to Markwhen format
    const { parseResult, colorMap, dependencyArrows } = this.adapter.adapt(entries, options);

    // Cache dependency arrows for sending after state updates
    this.currentDependencyArrows = dependencyArrows;

    // Cache Markwhen state
    // Note: 'transformed' is required by the Timeline's timelineStore
    this.currentMarkwhenState = {
      rawText: '',
      parsed: parseResult,
      transformed: parseResult.events,
    };

    // Cache app state
    this.currentAppState = {
      isDark: document.body.classList.contains('theme-dark'),
      colorMap,
      backgroundColor: this.getBackgroundColor(),
    };
  }

  /**
   * Update the timeline with current data
   */
  private updateTimeline(): void {
    if (!this.iframe) return;

    // Compute and cache state
    this.computeState();

    // If initialized, push state update to Timeline
    if (this.isInitialized && this.currentMarkwhenState && this.currentAppState) {
      this.lpcHost.sendState(this.currentMarkwhenState, this.currentAppState);
      // Send updated dependency arrows so the overlay reflects any changes
      this.lpcHost.sendDependencies(this.currentDependencyArrows);
    }
  }

  /**
   * Get entries from Bases data
   */
  private getEntriesFromData(): BasesEntry[] {
    const entries: BasesEntry[] = [];

    if (!this.data?.groupedData) return entries;

    for (const group of this.data.groupedData) {
      if (group.entries) {
        entries.push(...group.entries);
      }
    }

    return entries;
  }

  /**
   * Handle edit event date range from Timeline
   */
  private async handleEditEventDateRange(params: EditEventDateRangeMessage): Promise<void> {
    const filePath = this.adapter.resolvePathToFilePath(params.path);
    if (!filePath) {
      console.warn('Timeline: Could not resolve path to file:', params.path);
      return;
    }

    const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) {
      console.warn('Timeline: File not found:', filePath);
      return;
    }

    // Get the field names
    const dateStartField = this.getDateStartField();
    const dateEndField = this.getDateEndField();

    // Formula properties are computed by Bases — never write them to frontmatter
    if (dateStartField.startsWith('formula.') || dateEndField.startsWith('formula.')) {
      console.warn('Timeline: Cannot write back to formula properties');
      return;
    }

    const startFieldName = dateStartField.replace(/^(note|file|formula)\./, '');
    const endFieldName = dateEndField.replace(/^(note|file|formula)\./, '');

    // Update frontmatter
    // Convert UTC ISO strings from Markwhen to local "YYYY-MM-DDTHH:mm:ss" (no offset suffix).
    // Writing a plain local datetime avoids Obsidian's YAML serializer adding a timezone
    // offset that would cause the -1 day shift on the next read.
    const toLocalDatetime = (iso: string): string => {
      const d = new Date(iso);
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
        `T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    await this.plugin.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
      fm[startFieldName] = toLocalDatetime(params.range.fromDateTimeIso);
      fm[endFieldName] = toLocalDatetime(params.range.toDateTimeIso);
    });
  }

  /**
   * Handle new event creation from Timeline
   */
  private handleNewEvent(_params: NewEventMessage): void {
    // TODO: Delegated to Bases/Templater
  }

  /**
   * Handle detail path selection (click on event)
   */
  private handleSetDetailPath(path: EventPath): void {
    const filePath = this.adapter.resolvePathToFilePath(path);
    if (!filePath) return;

    // Open file using Obsidian's standard navigation
    // Use requestAnimationFrame to break out of the postMessage event context
    requestAnimationFrame(() => {
      void this.plugin.app.workspace.openLinkText(filePath, '', 'tab');
    });
  }

  /**
   * Handle hovering path (hover on event)
   */
  private handleSetHoveringPath(path: EventPath): void {
    // Could show a tooltip or highlight - for now, no-op
  }

  /**
   * Set up resize observer
   */
  private setupResizeObserver(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }

    this.resizeObserver = new ResizeObserver(() => {
      // Resize handling if needed
    });

    if (this.iframeContainer) {
      this.resizeObserver.observe(this.iframeContainer);
    }
  }

  /**
   * Called when switching away from this view
   */
  onunload(): void {
    // Clean up styles and classes added to the shared container
    this.containerEl.removeClass('planner-bases-timeline');
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.lpcHost.disconnect();

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    this.iframe = null;
    this.isInitialized = false;
    this.currentMarkwhenState = null;
    this.currentAppState = null;
    this.currentDependencyArrows = [];
  }
}

/**
 * Create the view registration for Obsidian Bases
 */
export function createTimelineViewRegistration(plugin: PlannerPlugin): BasesViewRegistration {
  return {
    name: 'Timeline',
    icon: 'square-chart-gantt',
    factory: (controller: QueryController, containerEl: HTMLElement) => {
      return new BasesTimelineView(controller, containerEl, plugin);
    },
    options: (_config: BasesViewConfig): BasesAllOptions[] => [
      {
        type: 'property',
        key: 'sectionsBy',
        displayName: 'Sections by',
        default: '',
        placeholder: 'None',
        filter: (propId: BasesPropertyId) =>
          PropertyTypeService.isCategoricalProperty(propId, plugin.app),
      },
      {
        type: 'property',
        key: 'plannerGroupBy',
        displayName: 'Group by',
        default: '',
        placeholder: 'None',
        filter: (propId: BasesPropertyId) =>
          PropertyTypeService.isCategoricalProperty(propId, plugin.app),
      },
      {
        type: 'property',
        key: 'colorBy',
        displayName: 'Color by',
        default: '',
        placeholder: 'None',
        filter: (propId: BasesPropertyId) =>
          PropertyTypeService.isCategoricalProperty(propId, plugin.app),
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
        type: 'property',
        key: 'titleField',
        displayName: 'Title field',
        default: 'note.title',
        placeholder: 'Select property',
        filter: (propId: BasesPropertyId) =>
          PropertyTypeService.isTextProperty(propId, plugin.app),
      },
      {
        type: 'dropdown',
        key: 'backgroundColor',
        displayName: 'Background color',
        default: 'default',
        options: {
          'default': 'Default (theme)',
          '#1e1e2e': 'Catppuccin Mocha',
          '#24273a': 'Catppuccin Macchiato',
          '#303446': 'Catppuccin Frappe',
          '#eff1f5': 'Catppuccin Latte',
          '#002b36': 'Solarized Dark',
          '#fdf6e3': 'Solarized Light',
          '#282c34': 'One Dark',
          '#fafafa': 'One Light',
          '#1a1b26': 'Tokyo Night',
          '#24283b': 'Tokyo Night Storm',
          '#0d1117': 'GitHub Dark',
          '#ffffff': 'GitHub Light',
          '#2e3440': 'Nord',
          '#282a36': 'Dracula',
          '#1e1e1e': 'VS Code Dark',
        },
      },
      {
        type: 'property',
        key: 'dependenciesField',
        displayName: 'Dependencies field',
        default: 'blocked_by',
        placeholder: 'blocked_by',
        // Allow any property — wikilink lists, text lists, etc.
        // Leaving filter undefined shows all available properties.
      },
      {
        type: 'dropdown',
        key: 'dateLabelFormat',
        displayName: 'Date label format',
        default: 'range',
        options: {
          'range': 'Range (2026-02-09--2026-02-14)',
          'start': 'Start date (2026-02-09)',
          'end': 'End date (2026-02-14)',
        },
      },
    ],
  };
}
