/**
 * BasesGanttView — Frappe Gantt integration for Obsidian Bases.
 *
 * Unified view that optionally shows a WBS (Work Breakdown Structure) sidebar
 * panel when enabled via the config sidebar toggle. The sidebar displays task
 * names in hierarchy order, synchronises vertical scroll with the chart,
 * highlights bars on hover, and opens notes on click.
 *
 * Architecture:
 *  - Reads frontmatter properties for start/end date, progress, dependencies, and colorBy.
 *  - Renders using Frappe Gantt (https://github.com/frappe/gantt).
 *  - Colors resolved via Pretty Properties > valueStyles > CSS class fallback.
 *  - On bar click: opens file in current tab.
 *  - On date drag: writes updated dates back to frontmatter (single source of truth).
 *  - View configuration exposed through Bases' native config sidebar options.
 *  - Optional WBS sidebar: toggled via "Show WBS sidebar" in Display options.
 *    When enabled, a "Parent task (WBS)" property selector appears. Tasks are
 *    sorted in DFS order based on parent-child relationships.
 */

import {
    BasesView,
    BasesViewRegistration,
    BasesPropertyId,
    BasesAllOptions,
    BasesViewConfig,
    QueryController,
    DateValue,
    NumberValue,
    Menu,
    Notice,
} from 'obsidian';
import Gantt from 'frappe-gantt';
import type { GanttOptions } from 'frappe-gantt';
import type PlannerPlugin from '../main';
import { showOpenFileMenu } from '../utils/openFile';
import {
    GanttTask,
    TaskMapperConfig,
    GROUP_HEADER_PREFIX,
    parseObsidianDate,
    formatDateForFrontmatter,
    mapEntriesToTasks,
    sortByDependencies,
    createGroupHeaderTask,
    applyResolvedColors,
    type ColorResolver,
} from '../utils/ganttUtils';

// ── View ID ─────────────────────────────────────────────────────────────────

export const BASES_GANTT_VIEW_ID = 'wise-view-gantt';

// ── WBS hierarchy sort ──────────────────────────────────────────────────────

/**
 * Re-orders tasks into WBS depth-first order and assigns each task a depth level.
 * Tasks whose parentPath resolves to another task become children of that task.
 */
function buildWbsOrder(tasks: GanttTask[]): GanttTask[] {
    const pathToTask = new Map<string, GanttTask>();
    for (const t of tasks) {
        if (t.filePath) pathToTask.set(t.filePath, t);
    }

    const childrenOf = new Map<string, GanttTask[]>();
    const isChild = new Set<string>();

    for (const t of tasks) {
        if (t.parentPath && pathToTask.has(t.parentPath)) {
            const list = childrenOf.get(t.parentPath) ?? [];
            list.push(t);
            childrenOf.set(t.parentPath, list);
            isChild.add(t.id);
        }
    }

    const roots = tasks.filter(t => !isChild.has(t.id));
    const result: GanttTask[] = [];

    const dfs = (task: GanttTask, depth: number) => {
        task.depth = depth;
        result.push(task);
        const children = childrenOf.get(task.filePath) ?? [];
        for (const child of children) dfs(child, depth + 1);
    };

    for (const root of roots) dfs(root, 0);
    return result;
}

// ── View class ───────────────────────────────────────────────────────────────

export class BasesGanttView extends BasesView {
    type = BASES_GANTT_VIEW_ID;

    /** Static registry of active instances for command palette integration. */
    static instances: Set<BasesGanttView> = new Set();

    private plugin: PlannerPlugin;
    private containerEl: HTMLElement;
    private ganttEl: HTMLElement;
    /** Element where Frappe Gantt renders. Equals ganttEl when sidebar is off. */
    private chartEl: HTMLElement;
    private gantt: Gantt | null = null;
    private configSnapshot = '';
    private currentTasks: GanttTask[] = [];
    private taskMap: Map<string, GanttTask> = new Map();
    /** Flag to suppress on_click after a drag operation. */
    private justDragged = false;
    /** Global mouseup handlers Frappe Gantt registers on document (for cleanup). */
    private capturedGlobalHandlers: EventListener[] = [];

    // ── WBS sidebar fields ───────────────────────────────────────────────────
    private wbsEl: HTMLElement | null = null;
    private wbsBodyEl: HTMLElement | null = null;
    private resizeCleanup: (() => void) | null = null;
    private wbsSidebarActive = false;

    constructor(controller: QueryController, containerEl: HTMLElement, plugin: PlannerPlugin) {
        super(controller);
        this.plugin = plugin;
        this.containerEl = containerEl;
        // chartEl will be set in buildLayout; initialise to avoid TS strict errors
        this.chartEl = null!;
    }

    onload(): void {
        BasesGanttView.instances.add(this);
        this.containerEl.addClass('bases-gantt-view');
        // Default layout (no sidebar) — config isn't available yet in onload.
        // buildLayout() is called from onDataUpdated() when sidebar toggle changes.
        this.ganttEl = this.containerEl.createDiv({ cls: 'gantt-wrapper' });
        this.chartEl = this.ganttEl;
        this.registerContextMenu();
    }

    onunload(): void {
        BasesGanttView.instances.delete(this);
        if (this.gantt) {
            this.gantt.clear();
            this.gantt.$container?.remove();
            this.gantt = null;
        }
        for (const handler of this.capturedGlobalHandlers) {
            document.removeEventListener('mouseup', handler);
        }
        this.capturedGlobalHandlers = [];
        this.currentTasks = [];
        this.taskMap.clear();
        this.resizeCleanup?.();
        this.resizeCleanup = null;
        this.wbsBodyEl = null;
        this.wbsEl = null;
    }

    onResize(): void {
        // Frappe Gantt auto-fills width via SVG 100%, so no special handling needed
    }

    /** Check if this view is inside the currently active workspace leaf. */
    isInActiveLeaf(): boolean {
        return this.containerEl.closest('.workspace-leaf.mod-active') != null;
    }

    /** Public: scroll chart to today (for command palette). */
    scrollToToday(): void {
        this.gantt?.scroll_current();
    }

    /** Public: switch view mode (for command palette). */
    setViewMode(mode: string): void {
        if (this.gantt) {
            this.gantt.change_view_mode(mode, true);
        }
    }

    /** Public: create a new task at today's date (for command palette). */
    createTaskAtToday(): void {
        const config = this.getTaskMapperConfig();
        if (!config.startProperty) {
            new Notice('Configure a start date property first.');
            return;
        }
        if (config.startProperty.startsWith('formula.')) {
            new Notice('Cannot create tasks with formula date properties.');
            return;
        }
        const today = formatDateForFrontmatter(new Date());
        const propName = this.extractPropertyName(config.startProperty);
        void this.createFileForView('New task', (frontmatter: Record<string, unknown>) => {
            frontmatter[propName] = today;
            if (config.endProperty && !config.endProperty.startsWith('formula.')) {
                const endPropName = this.extractPropertyName(config.endProperty);
                frontmatter[endPropName] = today;
            }
        });
    }

    // ── Layout ────────────────────────────────────────────────────────────────

    /**
     * Build the DOM layout based on sidebar config. Idempotent — tears down
     * existing layout before rebuilding.
     */
    private buildLayout(): void {
        const showSidebar = (this.config.get('showWbsSidebar') as boolean) ?? false;

        // Tear down existing layout
        if (this.gantt) {
            this.gantt.clear();
            this.gantt.$container?.remove();
            this.gantt = null;
        }
        this.resizeCleanup?.();
        this.resizeCleanup = null;
        this.wbsEl = null;
        this.wbsBodyEl = null;
        this.containerEl.querySelector('.gantt-wrapper')?.remove();
        this.containerEl.querySelector('.gantt-wbs-wrapper')?.remove();

        if (showSidebar) {
            this.containerEl.addClass('bases-gantt-wbs-view');
            this.ganttEl = this.containerEl.createDiv({ cls: 'gantt-wbs-wrapper' });
            this.wbsEl = this.ganttEl.createDiv({ cls: 'gantt-wbs-panel' });
            const resizeHandle = this.ganttEl.createDiv({ cls: 'gantt-wbs-resize-handle' });
            this.chartEl = this.ganttEl.createDiv({ cls: 'gantt-chart-area' });
            this.setupWbsResize(resizeHandle);
        } else {
            this.containerEl.removeClass('bases-gantt-wbs-view');
            this.ganttEl = this.containerEl.createDiv({ cls: 'gantt-wrapper' });
            this.chartEl = this.ganttEl;
        }

        this.wbsSidebarActive = showSidebar;
        this.configSnapshot = '';
    }

    // ── Color resolver ────────────────────────────────────────────────────────

    /** Build a ColorResolver from the current plugin settings. */
    private buildColorResolver(): ColorResolver | undefined {
        const settings = this.plugin.settings;
        return (fieldId: string, value: string): string | null => {
            // 1. Pretty Properties plugin API
            const propName = fieldId.split('.').pop() || fieldId;
            const ppColor = getPrettyPropertiesColor(propName, value);
            if (ppColor) return ppColor;

            // 2. User-configured valueStyles (keyed by fieldId then value)
            const color = settings.valueStyles[fieldId]?.[value]?.color;
            if (color) return color;

            // 3. No resolver hit — let CSS class fallback handle it
            return null;
        };
    }

    // ── Data rendering ─────────────────────────────────────────────────────────

    onDataUpdated(): void {
        if (!this.data?.data || !this.ganttEl) return;

        // Detect sidebar toggle change and rebuild layout if needed
        const showSidebar = (this.config.get('showWbsSidebar') as boolean) ?? false;
        if (showSidebar !== this.wbsSidebarActive) {
            this.buildLayout();
        }

        const config = this.getTaskMapperConfig();
        const newSnapshot = JSON.stringify(config) + '|' + this.getDisplayConfigSnapshot();
        const colorResolver = this.buildColorResolver();

        // Build tasks (potentially from grouped data)
        let rawTasks: GanttTask[];
        const groups = this.data.groupedData;
        const hasGroups = groups.length > 1 || (groups.length === 1 && groups[0]?.hasKey());
        if (hasGroups) {
            rawTasks = [];
            for (let i = 0; i < groups.length; i++) {
                const group = groups[i]!;
                const groupTasks = mapEntriesToTasks(group.entries, config, 'task', colorResolver);
                if (groupTasks.length === 0) continue;
                const label = group.hasKey() ? String(group.key) : 'Ungrouped';
                const header = createGroupHeaderTask(label, i, groupTasks);
                if (header) rawTasks.push(header);
                rawTasks.push(...groupTasks);
            }
        } else {
            rawTasks = mapEntriesToTasks(this.data.data, config, 'task', colorResolver);
        }

        // Sort: WBS hierarchy order if sidebar + parentProp configured, else dependency topo sort
        const tasks = (this.wbsSidebarActive && config.parentProperty)
            ? buildWbsOrder(rawTasks)
            : sortByDependencies(rawTasks);

        this.currentTasks = tasks;
        this.taskMap.clear();
        for (const t of tasks) this.taskMap.set(t.id, t);

        if (tasks.length === 0) {
            this.renderEmptyState(config);
            return;
        }

        // Clear empty state if it was showing
        const emptyEl = this.containerEl.querySelector('.gantt-empty-state');
        if (emptyEl) emptyEl.remove();

        if (this.gantt && this.configSnapshot === newSnapshot) {
            // Only data changed, not config — refresh in place
            this.gantt.refresh(tasks);
            applyResolvedColors(this.chartEl, tasks);
            if (this.wbsSidebarActive) this.rebuildWbsRows(tasks);
        } else {
            // Config changed or first render — recreate
            this.configSnapshot = newSnapshot;
            this.initGantt(tasks);
        }
    }

    private getTaskMapperConfig(): TaskMapperConfig {
        let startProperty = this.config.getAsPropertyId('startDate');
        let endProperty = this.config.getAsPropertyId('endDate');
        let labelProperty = this.config.getAsPropertyId('label');
        let dependenciesProperty = this.config.getAsPropertyId('dependencies');
        let colorByProperty = this.config.getAsPropertyId('colorBy');
        let progressProperty = this.config.getAsPropertyId('progress');
        const parentProperty = this.wbsSidebarActive
            ? this.config.getAsPropertyId('parentProp')
            : null;

        // Auto-detect properties from data when not manually configured
        if (!startProperty && this.data?.data?.length > 0) {
            const detected = this.autoDetectProperties();
            startProperty = detected.start ?? startProperty;
            endProperty = detected.end ?? endProperty;
            dependenciesProperty = detected.dependencies ?? dependenciesProperty;
            progressProperty = detected.progress ?? progressProperty;
            colorByProperty = detected.colorBy ?? colorByProperty;
        }

        return {
            startProperty,
            endProperty,
            labelProperty,
            dependenciesProperty,
            colorByProperty,
            progressProperty,
            parentProperty,
            showProgress:
                (this.config.get('showProgress') as boolean) ??
                (progressProperty != null),
        };
    }

    /**
     * Auto-detect property mappings by inspecting the first entry's values
     * and matching property names to common naming conventions.
     */
    private autoDetectProperties(): {
        start: BasesPropertyId | null;
        end: BasesPropertyId | null;
        dependencies: BasesPropertyId | null;
        progress: BasesPropertyId | null;
        colorBy: BasesPropertyId | null;
    } {
        const entries = this.data?.data;
        if (!entries || entries.length === 0) {
            return { start: null, end: null, dependencies: null, progress: null, colorBy: null };
        }

        const firstEntry = entries[0];
        const dateProps: BasesPropertyId[] = [];
        const numberProps: BasesPropertyId[] = [];
        const stringProps: BasesPropertyId[] = [];

        for (const propId of this.allProperties) {
            const val = firstEntry!.getValue(propId);
            if (val == null) continue;
            if (val instanceof DateValue) {
                dateProps.push(propId);
            } else if (val instanceof NumberValue) {
                numberProps.push(propId);
            } else {
                stringProps.push(propId);
            }
        }

        const getName = (id: BasesPropertyId): string => {
            const dot = id.indexOf('.');
            return (dot >= 0 ? id.slice(dot + 1) : id).toLowerCase().replace(/[-_]/g, '');
        };

        const findByKeywords = (props: BasesPropertyId[], keywords: string[]): BasesPropertyId | null => {
            for (const propId of props) {
                const name = getName(propId);
                if (keywords.some(k => name.includes(k))) return propId;
            }
            return null;
        };

        const startKeywords = ['start', 'begin', 'from', 'created'];
        const endKeywords = ['end', 'due', 'finish', 'deadline', 'until'];

        let start = findByKeywords(dateProps, startKeywords);
        let end = findByKeywords(dateProps, endKeywords);

        if (!start && dateProps.length > 0) start = dateProps[0] ?? null;
        if (!end && dateProps.length > 1) end = dateProps.find(p => p !== start) ?? null;

        const depKeywords = ['depend', 'block', 'after', 'prerequisite', 'requires'];
        const dependencies = findByKeywords(stringProps, depKeywords);

        const progressKeywords = ['progress', 'percent', 'completion', 'complete', 'done'];
        const progress = findByKeywords(numberProps, progressKeywords);

        const colorKeywords = ['status', 'priority', 'type', 'category', 'phase', 'stage'];
        const colorBy = findByKeywords(stringProps, colorKeywords);

        return { start, end, dependencies, progress, colorBy };
    }

    private getDisplayConfigSnapshot(): string {
        return JSON.stringify({
            viewMode: this.config.get('viewMode'),
            barHeight: this.config.get('barHeight'),
            showProgress: this.config.get('showProgress'),
            showExpectedProgress: this.config.get('showExpectedProgress'),
            showWbsSidebar: this.config.get('showWbsSidebar'),
        });
    }

    // ── Gantt initialization ───────────────────────────────────────────────────

    private initGantt(tasks: GanttTask[]): void {
        // Clear previous chart
        if (this.gantt) {
            this.gantt.clear();
            this.gantt = null;
        }
        this.chartEl.empty();
        if (this.wbsEl) {
            this.wbsEl.empty();
            this.wbsBodyEl = null;
        }

        // Map stored config values to Frappe Gantt's expected format
        const VIEW_MODE_MAP: Record<string, string> = {
            'Quarter day': 'Quarter Day',
            'Half day': 'Half Day',
        };
        const rawViewMode = (this.config.get('viewMode') as string) || 'Day';
        const viewMode = VIEW_MODE_MAP[rawViewMode] ?? rawViewMode;
        const barHeight = (this.config.get('barHeight') as number) || 30;
        const showProgress = (this.config.get('showProgress') as boolean) ?? false;
        const showExpectedProgress = (this.config.get('showExpectedProgress') as boolean) ?? false;

        // Calculate earliest task date to scroll to
        const earliestDate = this.getEarliestTaskDate(tasks);

        const options: GanttOptions = {
            view_mode: viewMode,
            bar_height: barHeight,
            today_button: true,
            scroll_to: earliestDate || 'today',
            readonly: false,
            readonly_dates: false,
            readonly_progress: !showProgress,
            infinite_padding: false,
            view_mode_select: true,

            // Enhanced options
            arrow_curve: 15,
            auto_move_label: true,
            move_dependencies: true,
            show_expected_progress: showExpectedProgress && showProgress,
            hover_on_date: true,

            // Disable built-in popup — use Obsidian Page Preview (Ctrl+hover) instead
            popup: false,

            on_click: (task) => {
                if (this.justDragged) return;
                if (task.id.startsWith(GROUP_HEADER_PREFIX)) return;
                const ganttTask = this.findTask(task.id);
                if (ganttTask) {
                    void this.app.workspace.openLinkText(ganttTask.filePath, '', false);
                }
            },

            on_date_change: (task, start, end) => {
                this.justDragged = true;
                setTimeout(() => { this.justDragged = false; }, 50);

                if (task.id.startsWith(GROUP_HEADER_PREFIX)) return;
                const ganttTask = this.findTask(task.id);
                if (!ganttTask) return;

                const mapperConfig = this.getTaskMapperConfig();
                const updates: Record<string, string> = {};

                if (mapperConfig.startProperty && !mapperConfig.startProperty.startsWith('formula.')) {
                    const propName = this.extractPropertyName(mapperConfig.startProperty);
                    updates[propName] = formatDateForFrontmatter(start);
                }
                if (mapperConfig.endProperty && !mapperConfig.endProperty.startsWith('formula.')) {
                    const propName = this.extractPropertyName(mapperConfig.endProperty);
                    updates[propName] = formatDateForFrontmatter(end);
                }

                if (Object.keys(updates).length > 0) {
                    void this.writeFrontmatter(ganttTask.filePath, updates);
                }
            },

            on_progress_change: (task, progress) => {
                if (!showProgress) return;
                const ganttTask = this.findTask(task.id);
                if (!ganttTask) return;

                const mapperConfig = this.getTaskMapperConfig();
                if (mapperConfig.progressProperty && !mapperConfig.progressProperty.startsWith('formula.')) {
                    const propName = this.extractPropertyName(mapperConfig.progressProperty);
                    void this.writeFrontmatter(ganttTask.filePath, {
                        [propName]: Math.round(progress),
                    });
                }
            },
        };

        // Capture global mouseup handlers Frappe Gantt registers on document
        const captured: EventListener[] = [];
        const origAdd = document.addEventListener.bind(document);
        document.addEventListener = ((
            type: string,
            listener: EventListenerOrEventListenerObject,
            optionsArg?: boolean | AddEventListenerOptions,
        ) => {
            if (type === 'mouseup') {
                captured.push(listener as EventListener);
            }
            return origAdd(type, listener, optionsArg);
        }) as typeof document.addEventListener;

        try {
            this.gantt = new Gantt(this.chartEl, tasks, options);
        } catch (e) {
            console.error('Bases Gantt: failed to initialize chart', e);
            this.chartEl.empty();
            this.renderEmptyState(this.getTaskMapperConfig());
            return;
        } finally {
            document.addEventListener = origAdd;
        }
        this.capturedGlobalHandlers = captured;

        // Apply milestone class to bar wrappers
        for (const task of tasks) {
            if (task.isMilestone) {
                const wrapper = this.chartEl.querySelector(`.bar-wrapper[data-id="${CSS.escape(task.id)}"]`);
                if (wrapper) wrapper.classList.add('gantt-milestone');
            }
        }

        // Apply resolved colors from Pretty Properties / valueStyles
        applyResolvedColors(this.chartEl, tasks);

        // Register hover preview and click handlers on rendered bar wrappers
        this.registerBarInteractions();

        // Render WBS sidebar if enabled
        if (this.wbsSidebarActive && this.wbsEl) {
            this.renderWbsPanel(tasks, barHeight);
        }
    }

    // ── WBS panel ─────────────────────────────────────────────────────────────

    private renderWbsPanel(tasks: GanttTask[], barHeight: number): void {
        if (!this.wbsEl) return;
        this.wbsEl.empty();
        this.wbsBodyEl = null;

        const gridHeaderEl = this.chartEl.querySelector<HTMLElement>('.grid-header');
        const headerHeight = gridHeaderEl ? gridHeaderEl.offsetHeight || 70 : 70;
        const rowHeight = barHeight + 16;

        const headerEl = this.wbsEl.createDiv({ cls: 'gantt-wbs-header' });
        headerEl.style.height = `${headerHeight}px`;
        headerEl.createDiv({ cls: 'gantt-wbs-header-cell', text: 'Task' });

        const bodyEl = this.wbsEl.createDiv({ cls: 'gantt-wbs-body' });
        this.wbsBodyEl = bodyEl;

        this.buildWbsRows(bodyEl, tasks, rowHeight);
        this.setupScrollSync();
    }

    private buildWbsRows(bodyEl: HTMLElement, tasks: GanttTask[], rowHeight: number): void {
        for (const task of tasks) {
            const row = bodyEl.createDiv({ cls: 'gantt-wbs-row' });
            row.style.height = `${rowHeight}px`;

            if (task.id.startsWith(GROUP_HEADER_PREFIX)) {
                row.addClass('is-group-header');
                row.createSpan({ cls: 'gantt-wbs-name', text: task.name });
            } else {
                const depth = task.depth ?? 0;
                const indent = depth * 16 + 8;

                if (depth > 0) row.addClass('is-child-task');

                const nameEl = row.createSpan({ cls: 'gantt-wbs-name' });
                nameEl.style.paddingLeft = `${indent}px`;
                nameEl.setText(task.name);

                row.addEventListener('click', () => {
                    void this.app.workspace.openLinkText(task.filePath, '', false);
                });

                row.addEventListener('mouseover', () => {
                    const bar = this.chartEl.querySelector(
                        `.bar-wrapper[data-id="${CSS.escape(task.id)}"]`
                    );
                    bar?.classList.add('wbs-highlighted');
                });
                row.addEventListener('mouseout', () => {
                    const bar = this.chartEl.querySelector(
                        `.bar-wrapper[data-id="${CSS.escape(task.id)}"]`
                    );
                    bar?.classList.remove('wbs-highlighted');
                });

                row.addEventListener('contextmenu', (evt: MouseEvent) => {
                    evt.preventDefault();
                    showOpenFileMenu(this.app, task.filePath, evt);
                });
            }
        }
    }

    private rebuildWbsRows(tasks: GanttTask[]): void {
        if (!this.wbsBodyEl) return;
        const barHeight = (this.config.get('barHeight') as number) || 30;
        const rowHeight = barHeight + 16;
        this.wbsBodyEl.empty();
        this.buildWbsRows(this.wbsBodyEl, tasks, rowHeight);
    }

    private setupScrollSync(): void {
        if (!this.wbsBodyEl) return;
        const ganttContainer = this.chartEl.querySelector<HTMLElement>('.gantt-container');
        if (!ganttContainer) return;

        const body = this.wbsBodyEl;
        let busy = false;

        ganttContainer.addEventListener('scroll', () => {
            if (busy) return;
            busy = true;
            body.scrollTop = ganttContainer.scrollTop;
            busy = false;
        });

        body.addEventListener('scroll', () => {
            if (busy) return;
            busy = true;
            ganttContainer.scrollTop = body.scrollTop;
            busy = false;
        });
    }

    // ── Resize handle ─────────────────────────────────────────────────────────

    private setupWbsResize(handle: HTMLElement): void {
        const onMouseMove = (e: MouseEvent) => {
            const rect = this.ganttEl.getBoundingClientRect();
            const newWidth = Math.max(120, Math.min(480, e.clientX - rect.left));
            if (this.wbsEl) this.wbsEl.style.width = `${newWidth}px`;
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.body.removeClass('gantt-wbs-resizing');
        };

        const onMouseDown = (e: MouseEvent) => {
            e.preventDefault();
            document.body.addClass('gantt-wbs-resizing');
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        };

        handle.addEventListener('mousedown', onMouseDown);

        this.resizeCleanup = () => {
            handle.removeEventListener('mousedown', onMouseDown);
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
    }

    // ── Bar interactions ──────────────────────────────────────────────────────

    /**
     * Attach Page Preview (Ctrl+hover) and click handlers to Gantt bar elements.
     */
    private registerBarInteractions(): void {
        const bars = this.chartEl.querySelectorAll('.bar-wrapper');
        for (const bar of Array.from(bars)) {
            const taskId = bar.getAttribute('data-id');
            if (!taskId) continue;
            const ganttTask = this.findTask(taskId);
            if (!ganttTask || ganttTask.id.startsWith(GROUP_HEADER_PREFIX)) continue;

            bar.addEventListener('mouseover', (evt: Event) => {
                const mouseEvt = evt as MouseEvent;
                if (!mouseEvt.ctrlKey && !mouseEvt.metaKey) return;
                this.app.workspace.trigger('hover-link', {
                    event: mouseEvt,
                    source: BASES_GANTT_VIEW_ID,
                    hoverParent: this.plugin,
                    targetEl: this.chartEl,
                    linktext: ganttTask.filePath,
                    sourcePath: '/',
                });
            });
        }
    }

    // ── Right-click context menus ─────────────────────────────────────────────

    private registerContextMenu(): void {
        this.containerEl.addEventListener('contextmenu', (evt: MouseEvent) => {
            // Skip if the right-click is on WBS panel (it has its own context menus)
            if (this.wbsEl && this.wbsEl.contains(evt.target as Node)) return;

            evt.preventDefault();

            const target = evt.target as Element;
            const barWrapper = target.closest('.bar-wrapper');

            if (barWrapper) {
                const taskId = barWrapper.getAttribute('data-id');
                if (taskId) {
                    const ganttTask = this.findTask(taskId);
                    if (ganttTask && !ganttTask.id.startsWith(GROUP_HEADER_PREFIX)) {
                        showOpenFileMenu(this.app, ganttTask.filePath, evt);
                        return;
                    }
                }
            }

            this.showEmptyContextMenu(evt);
        });
    }

    private showEmptyContextMenu(evt: MouseEvent): void {
        const menu = new Menu();

        menu.addItem((item) => {
            item.setTitle('Create new task')
                .setIcon('plus')
                .onClick(() => this.createTaskAtToday());
        });

        menu.addSeparator();

        menu.addItem((item) => {
            item.setTitle('Scroll to today')
                .setIcon('calendar')
                .onClick(() => this.gantt?.scroll_current());
        });

        menu.showAtMouseEvent(evt);
    }

    // ── Click-to-create ────────────────────────────────────────────────────────

    private createTaskAtDate(dateStr: string): void {
        const config = this.getTaskMapperConfig();
        if (!config.startProperty) {
            new Notice('Configure a start date property first.');
            return;
        }
        if (config.startProperty.startsWith('formula.')) {
            new Notice('Cannot create tasks with formula date properties.');
            return;
        }

        const parsed = parseObsidianDate(dateStr);
        const formattedDate = parsed ? formatDateForFrontmatter(parsed) : dateStr;

        const propName = this.extractPropertyName(config.startProperty);
        void this.createFileForView('New task', (frontmatter: Record<string, unknown>) => {
            frontmatter[propName] = formattedDate;
            if (config.endProperty && !config.endProperty.startsWith('formula.')) {
                const endPropName = this.extractPropertyName(config.endProperty);
                frontmatter[endPropName] = formattedDate;
            }
        });
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private getEarliestTaskDate(tasks: GanttTask[]): string | null {
        let earliest: string | null = null;
        for (const t of tasks) {
            if (!earliest || t.start < earliest) {
                earliest = t.start;
            }
        }
        return earliest;
    }

    private findTask(id: string): GanttTask | undefined {
        return this.taskMap.get(id);
    }

    private extractPropertyName(propertyId: BasesPropertyId): string {
        const dotIndex = propertyId.indexOf('.');
        return dotIndex >= 0 ? propertyId.slice(dotIndex + 1) : propertyId;
    }

    private async writeFrontmatter(
        filePath: string,
        updates: Record<string, string | number>,
    ): Promise<void> {
        const file = this.app.vault.getFileByPath(filePath);
        if (!file) return;

        await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
            for (const [key, value] of Object.entries(updates)) {
                frontmatter[key] = value;
            }
        });
    }

    private renderEmptyState(config: TaskMapperConfig): void {
        if (this.gantt) {
            this.gantt.clear();
            this.gantt = null;
        }
        this.chartEl.empty();
        if (this.wbsEl) {
            this.wbsEl.empty();
            this.wbsBodyEl = null;
        }

        const existing = this.containerEl.querySelector('.gantt-empty-state');
        if (existing) existing.remove();

        const el = this.containerEl.createDiv({ cls: 'gantt-empty-state' });
        if (!config.startProperty) {
            el.createEl('p', {
                text: 'Configure a start date property in the view options to display the chart.',
            });
            el.createEl('p', {
                cls: 'gantt-empty-hint',
                text: 'Open view options (gear icon) and select a date property for "start date".',
            });
        } else {
            el.createEl('p', {
                text: 'No tasks with valid dates found.',
            });
            el.createEl('p', {
                cls: 'gantt-empty-hint',
                text: 'Ensure your notes have a date value in the configured start date property.',
            });
        }
    }
}

// ── Pretty Properties helper (module-level) ──────────────────────────────────

/**
 * Try to get a solid hex/rgb color from the Pretty Properties plugin API.
 * Returns null if the plugin is not installed or no color is configured.
 */
function getPrettyPropertiesColor(propName: string, value: string): string | null {
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
        const colorSetting = ppApi.getPropertyBackgroundColorSetting(propName, value);
        if (!colorSetting || colorSetting === 'default' || colorSetting === 'none') return null;

        const namedColors = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink'];

        if (typeof colorSetting === 'string' && namedColors.includes(colorSetting)) {
            // Resolve Obsidian theme CSS variable to solid rgb
            const rgbStr = getComputedStyle(document.body)
                .getPropertyValue(`--color-${colorSetting}-rgb`)
                .trim();
            if (rgbStr) {
                const parts = rgbStr.split(/[\s,]+/).map((n: string) => parseInt(n.trim(), 10));
                if (parts.length >= 3 && parts.every((n: number) => !isNaN(n))) {
                    const [r, g, b] = parts;
                    return `rgb(${r}, ${g}, ${b})`;
                }
            }
            return null;
        }

        if (typeof colorSetting === 'object' && colorSetting.h !== undefined) {
            return `hsl(${colorSetting.h}, ${colorSetting.s}%, ${colorSetting.l}%)`;
        }
    } catch {
        // Pretty Properties API not available
    }
    return null;
}

// ── View registration ────────────────────────────────────────────────────────

export function createGanttViewRegistration(plugin: PlannerPlugin): BasesViewRegistration {
    return {
        name: 'Gantt',
        icon: 'gantt-chart-square',
        factory: (controller: QueryController, containerEl: HTMLElement) =>
            new BasesGanttView(controller, containerEl, plugin),
        options: (config) => getGanttViewOptions(config),
    };
}

export function getGanttViewOptions(config: BasesViewConfig): BasesAllOptions[] {
    return [
        {
            type: 'group',
            displayName: 'Properties',
            items: [
                {
                    type: 'property',
                    key: 'startDate',
                    displayName: 'Start date',
                    placeholder: 'Select property...',
                },
                {
                    type: 'property',
                    key: 'endDate',
                    displayName: 'End date',
                    placeholder: 'Select property...',
                },
                {
                    type: 'property',
                    key: 'label',
                    displayName: 'Label',
                    placeholder: 'File name (default)',
                },
                {
                    type: 'property',
                    key: 'dependencies',
                    displayName: 'Dependencies',
                    placeholder: 'Select property...',
                },
                {
                    type: 'property',
                    key: 'colorBy',
                    displayName: 'Color by',
                    placeholder: 'Select property...',
                },
                {
                    type: 'property',
                    key: 'progress',
                    displayName: 'Progress',
                    placeholder: 'Select property...',
                    shouldHide: () => !(config.get('showProgress') as boolean),
                },
                {
                    type: 'property',
                    key: 'parentProp',
                    displayName: 'Parent task (WBS)',
                    placeholder: 'Select property...',
                    shouldHide: () => !(config.get('showWbsSidebar') as boolean),
                },
            ],
        },
        {
            type: 'group',
            displayName: 'Display',
            items: [
                {
                    type: 'dropdown',
                    key: 'viewMode',
                    displayName: 'View mode',
                    default: 'Day',
                    options: {
                        'Quarter day': 'Quarter day',
                        'Half day': 'Half day',
                        Day: 'Day',
                        Week: 'Week',
                        Month: 'Month',
                        Year: 'Year',
                    },
                },
                {
                    type: 'toggle',
                    key: 'showWbsSidebar',
                    displayName: 'Show WBS sidebar',
                    default: false,
                },
                {
                    type: 'slider',
                    key: 'barHeight',
                    displayName: 'Bar height',
                    default: 30,
                    min: 16,
                    max: 60,
                    step: 2,
                },
                {
                    type: 'toggle',
                    key: 'showProgress',
                    displayName: 'Show progress',
                    default: false,
                },
                {
                    type: 'toggle',
                    key: 'showExpectedProgress',
                    displayName: 'Show expected progress',
                    default: false,
                    shouldHide: () => !(config.get('showProgress') as boolean),
                },
            ],
        },
    ];
}
