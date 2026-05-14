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
     *    When enabled, a "Parent note (WBS)" property selector appears. Items are
 *    sorted in DFS order based on parent-child relationships.
 */

import {
    App,
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
    SuggestModal,
    TFile,
    setIcon,
} from 'obsidian';
import Gantt from 'frappe-gantt';
import type { GanttOptions } from 'frappe-gantt';
import type PlannerPlugin from '../main';
import { addOpenFileMenuItems } from '../utils/openFile';
import {
    GanttTask,
    TaskMapperConfig,
    GROUP_HEADER_PREFIX,
    formatDateForFrontmatter,
    mapEntriesToTasks,
    sortByDependencies,
    createGroupHeaderTask,
    applyResolvedColors,
    applyExpectedProgress,
    type ColorResolver,
} from '../utils/ganttUtils';
import { NoteTemplateService } from '../services/NoteTemplateService';
import type { NoteTemplateDefaults } from '../types/settings';

// ── View ID ─────────────────────────────────────────────────────────────────

export const BASES_GANTT_VIEW_ID = 'wise-view-gantt';

interface DependencyCandidate {
    task: GanttTask;
    label: string;
}

class DependencySuggestModal extends SuggestModal<DependencyCandidate> {
    constructor(
        app: App,
        private readonly candidates: DependencyCandidate[],
        private readonly onChoose: (task: GanttTask) => void,
        placeholder: string,
    ) {
        super(app);
        this.setPlaceholder(placeholder);
    }

    getSuggestions(query: string): DependencyCandidate[] {
        const normalized = query.trim().toLowerCase();
        if (!normalized) return this.candidates;
        return this.candidates.filter(candidate =>
            candidate.label.toLowerCase().includes(normalized)
            || candidate.task.filePath.toLowerCase().includes(normalized)
        );
    }

    renderSuggestion(candidate: DependencyCandidate, el: HTMLElement): void {
        el.createDiv({ cls: 'gantt-dependency-suggest-title', text: candidate.label });
        el.createDiv({ cls: 'gantt-dependency-suggest-path', text: candidate.task.filePath });
    }

    onChooseSuggestion(candidate: DependencyCandidate): void {
        this.onChoose(candidate.task);
    }
}

// ── WBS hierarchy sort ──────────────────────────────────────────────────────

/**
 * Re-orders tasks into WBS depth-first order and assigns each task a depth level.
 * Tasks whose parentPath resolves to another task become children of that task.
 *
 * Enhancements:
 *  - Children within each parent are sorted by start date.
 *  - Root tasks are sorted by start date.
     *  - Parent rows automatically aggregate their date span from children
 *    (visual-only — frontmatter is not modified).
     *  - Parent rows are marked with `isParent = true`.
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

    // Sort children within each parent by start date
    for (const [, children] of childrenOf) {
        children.sort((a, b) => a.start.localeCompare(b.start));
    }

    // Sort root tasks by start date
    const roots = tasks.filter(t => !isChild.has(t.id));
    roots.sort((a, b) => a.start.localeCompare(b.start));

    const result: GanttTask[] = [];

    const dfs = (task: GanttTask, depth: number) => {
        task.depth = depth;
        result.push(task);

        const children = childrenOf.get(task.filePath) ?? [];
        if (children.length > 0) {
            task.isParent = true;

            // Recurse children (they compute their own spans first for multi-level)
            for (const child of children) dfs(child, depth + 1);

            // Aggregate parent date span from children (visual only)
            let minStart = task.start;
            let maxEnd = task.end;
            for (const child of children) {
                if (child.start < minStart) minStart = child.start;
                if (child.end > maxEnd) maxEnd = child.end;
            }
            task.start = minStart;
            task.end = maxEnd;
        }
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
    private popupEl: HTMLElement | null = null;
    private popupCleanup: (() => void) | null = null;
    private lastPreviewTarget: string | null = null;
    private hoverPreviewAnchorEl: HTMLElement | null = null;
    private preDragTaskDates: Map<string, { start: string; end: string }> = new Map();
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
        this.closeTaskPopup();
        this.hoverPreviewAnchorEl?.remove();
        this.hoverPreviewAnchorEl = null;
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

    /** Public: create a new note at today's date (for command palette). */
    createNoteAtToday(): void {
        const config = this.getTaskMapperConfig();
        if (!config.startProperty) {
            new Notice('Configure a start date property first.');
            return;
        }
        if (config.startProperty.startsWith('formula.')) {
            new Notice('Cannot create notes with formula date properties.');
            return;
        }
        const start = new Date();
        const today = formatDateForFrontmatter(start);
        const propName = this.extractPropertyName(config.startProperty);
        const frontmatter: Record<string, unknown> = {
            [propName]: today,
        };
        if (config.endProperty && !config.endProperty.startsWith('formula.')) {
            const endPropName = this.extractPropertyName(config.endProperty);
            frontmatter[endPropName] = today;
        }

        void new NoteTemplateService(this.app, this.getTemplateDefaults()).createNote(this, {
            title: 'New note',
            start,
            end: start,
            allDay: true,
            frontmatter,
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

    private normalizePropertyId(value: string | null | undefined): BasesPropertyId | null {
        const trimmed = value?.trim();
        if (!trimmed) return null;
        if (/^(note|file|formula)\./.test(trimmed)) {
            return trimmed as BasesPropertyId;
        }
        return `note.${trimmed}` as BasesPropertyId;
    }

    private getConfiguredPropertyId(
        configKey: string,
        fallbackValue?: string,
    ): BasesPropertyId | null {
        return this.config.getAsPropertyId(configKey) ?? this.normalizePropertyId(fallbackValue);
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
            this.closeTaskPopup();
            this.gantt.refresh(this.getRenderableTasks(tasks));
            applyResolvedColors(this.chartEl, tasks);
            applyExpectedProgress(this.chartEl, tasks);
            this.registerBarInteractions();
            if (this.wbsSidebarActive) this.rebuildWbsRows(tasks);
        } else {
            // Config changed or first render — recreate
            this.configSnapshot = newSnapshot;
            this.initGantt(tasks);
        }
    }

    private getTaskMapperConfig(): TaskMapperConfig {
        let startProperty = this.getConfiguredPropertyId(
            'startDate',
            this.plugin.settings.ganttDefaults.dateStartField,
        );
        let endProperty = this.getConfiguredPropertyId(
            'endDate',
            this.plugin.settings.ganttDefaults.dateEndField,
        );
        const labelProperty = this.getConfiguredPropertyId('label');
        let dependenciesProperty = this.getConfiguredPropertyId(
            'dependencies',
            this.plugin.settings.ganttDefaults.dependenciesField,
        );
        let colorByProperty = this.getConfiguredPropertyId(
            'colorBy',
            this.plugin.settings.ganttDefaults.colorBy,
        );
        let progressProperty = this.getConfiguredPropertyId(
            'progress',
            this.plugin.settings.ganttDefaults.progressField,
        );
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

        const expectedProgressProperty = this.getConfiguredPropertyId('expectedProgress');
        const showProgress = (this.config.get('showProgress') as boolean | undefined)
            ?? this.plugin.settings.ganttDefaults.showProgress
            ?? (progressProperty != null);

        return {
            startProperty,
            endProperty,
            labelProperty,
            dependenciesProperty,
            colorByProperty,
            progressProperty,
            parentProperty,
            showProgress,
            expectedProgressProperty,
        };
    }

    private getTemplateDefaults(): NoteTemplateDefaults {
        const templatePath = this.config.get('templatePath') as string | undefined;
        const targetFolder = this.config.get('targetFolder') as string | undefined;
        const titleFormat = this.config.get('titleFormat') as string | undefined;
        return {
            templatePath: templatePath?.trim() ?? '',
            targetFolder: targetFolder?.trim() ?? '',
            titleFormat: titleFormat?.trim() || 'New note {{date}}',
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
            viewMode: this.config.get('viewMode') ?? this.plugin.settings.ganttDefaults.viewMode,
            barHeight: this.config.get('barHeight') ?? this.plugin.settings.ganttDefaults.barHeight,
            showProgress: this.config.get('showProgress') ?? this.plugin.settings.ganttDefaults.showProgress,
            showExpectedProgress: this.config.get('showExpectedProgress'),
            showWbsSidebar: this.config.get('showWbsSidebar'),
            persistDependencyDateChanges: this.config.get('persistDependencyDateChanges'),
            showObsidianPreview: this.plugin.settings.ganttDefaults.showObsidianPreview,
            showInternalPopup: this.plugin.settings.ganttDefaults.showInternalPopup,
        });
    }

    // ── Gantt initialization ───────────────────────────────────────────────────

    private initGantt(tasks: GanttTask[]): void {
        // Clear previous chart
        if (this.gantt) {
            this.gantt.clear();
            this.gantt = null;
        }
        this.closeTaskPopup();
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
        const rawViewMode = (this.config.get('viewMode') as string)
            || this.plugin.settings.ganttDefaults.viewMode
            || 'Day';
        const viewMode = VIEW_MODE_MAP[rawViewMode] ?? rawViewMode;
        const barHeight = (this.config.get('barHeight') as number)
            || this.plugin.settings.ganttDefaults.barHeight
            || 30;
        const showProgress = (this.config.get('showProgress') as boolean | undefined)
            ?? this.plugin.settings.ganttDefaults.showProgress
            ?? false;
        const showExpectedProgress = (this.config.get('showExpectedProgress') as boolean) ?? false;
        const persistDependencyDateChanges =
            (this.config.get('persistDependencyDateChanges') as boolean | undefined) ?? false;
        const mapperConfig = this.getTaskMapperConfig();
        const hasExpectedProp = mapperConfig.expectedProgressProperty != null;

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
            move_dependencies: persistDependencyDateChanges,
            show_expected_progress: (showExpectedProgress || hasExpectedProp) && showProgress,
            hover_on_date: true,

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

                // Skip parent tasks — their dates are aggregated from children
                if (ganttTask.isParent) return;

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
                if (persistDependencyDateChanges) {
                    void this.persistMovedDependencyDates(task.id);
                }
            },

            on_progress_change: (task, progress) => {
                this.justDragged = true;
                setTimeout(() => { this.justDragged = false; }, 150);

                if (!showProgress) return;
                const ganttTask = this.findTask(task.id);
                if (!ganttTask) return;
                ganttTask.progress = Math.round(progress);
                ganttTask.actualProgressValue = this.getActualProgressFromPercent(ganttTask, progress);
                this.updateRenderedTaskLabel(ganttTask);

                const mapperConfig = this.getTaskMapperConfig();
                if (mapperConfig.progressProperty && !mapperConfig.progressProperty.startsWith('formula.')) {
                    const propName = this.extractPropertyName(mapperConfig.progressProperty);
                    void this.writeFrontmatter(ganttTask.filePath, {
                        [propName]: Math.round(ganttTask.actualProgressValue ?? 0),
                    });
                }
            },
        };
        options.popup = false;

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
            this.gantt = new Gantt(this.chartEl, this.getRenderableTasks(tasks), options);
        } catch (e) {
            console.error('Bases Gantt: failed to initialize chart', e);
            this.chartEl.empty();
            this.renderEmptyState(this.getTaskMapperConfig());
            return;
        } finally {
            document.addEventListener = origAdd;
        }
        this.capturedGlobalHandlers = captured;

        // Apply milestone and parent task classes to bar wrappers
        for (const task of tasks) {
            const wrapper = this.chartEl.querySelector(`.bar-wrapper[data-id="${CSS.escape(task.id)}"]`);
            if (!wrapper) continue;
            if (task.isMilestone) wrapper.classList.add('gantt-milestone');
            if (task.isParent) wrapper.classList.add('gantt-parent-task');
        }

        // Apply resolved colors from Pretty Properties / valueStyles
        applyResolvedColors(this.chartEl, tasks);

        // Override expected progress bars with property values (if configured)
        applyExpectedProgress(this.chartEl, tasks);

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
        headerEl.createDiv({ cls: 'gantt-wbs-header-cell', text: 'Note' });

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

                row.addEventListener('mouseenter', (evt: MouseEvent) => {
                    this.triggerModifiedHoverPreview(evt, task.filePath, row);
                });
                row.addEventListener('mousemove', (evt: MouseEvent) => {
                    this.triggerModifiedHoverPreview(evt, task.filePath, row);
                });
                row.addEventListener('mouseleave', () => {
                    if (this.lastPreviewTarget === task.filePath) {
                        this.lastPreviewTarget = null;
                    }
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
                    this.showTaskContextMenu(task, evt);
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
     * Attach explicit task detail triggers and optional click-to-preview handlers.
     *
     * Bases currently exposes all query properties but not the exact visible column
     * set for this view, so the detail popup intentionally sticks to mapped Gantt
     * fields instead of inventing a separate property list.
     */
    private registerBarInteractions(): void {
        const bars = this.chartEl.querySelectorAll('.bar-wrapper');
        for (const bar of Array.from(bars)) {
            const taskId = bar.getAttribute('data-id');
            if (!taskId) continue;
            const ganttTask = this.findTask(taskId);
            if (!ganttTask || ganttTask.id.startsWith(GROUP_HEADER_PREFIX)) continue;

            bar.addEventListener('mousedown', () => this.captureTaskDateSnapshot(), { capture: true });
            bar.addEventListener('mouseenter', (evt: Event) => {
                this.triggerModifiedHoverPreview(evt as MouseEvent, ganttTask.filePath, this.chartEl);
            });
            bar.addEventListener('mousemove', (evt: Event) => {
                this.triggerModifiedHoverPreview(evt as MouseEvent, ganttTask.filePath, this.chartEl);
            });
            bar.addEventListener('mouseleave', () => {
                if (this.lastPreviewTarget === ganttTask.filePath) {
                    this.lastPreviewTarget = null;
                }
            });
            bar.querySelectorAll('.handle, .bar-progress').forEach((interactiveEl) => {
                interactiveEl.addEventListener('mousedown', () => this.suppressNextBarClick());
                interactiveEl.addEventListener('touchstart', () => this.suppressNextBarClick());
            });

            bar.addEventListener('click', (evt: Event) => {
                if (!this.plugin.settings.ganttDefaults.showObsidianPreview) return;
                if (this.justDragged) return;
                const mouseEvt = evt as MouseEvent;
                mouseEvt.preventDefault();
                mouseEvt.stopPropagation();
                mouseEvt.stopImmediatePropagation();
                this.triggerHoverPreview(this.createHtmlTargetedMouseEvent(mouseEvt), ganttTask.filePath, this.chartEl);
            }, { capture: true });
        }
    }

    private showTaskPopup(task: GanttTask, position: { clientX: number; clientY: number }): void {
        this.closeTaskPopup();

        const popup = this.containerEl.createDiv({ cls: 'gantt-task-detail-popup' });
        this.popupEl = popup;
        popup.createDiv({ cls: 'gantt-task-detail-title', text: task.name });
        popup.createDiv({
            cls: 'gantt-task-detail-subtitle',
            text: `${task.start} to ${task.end}`,
        });

        const config = this.getTaskMapperConfig();
        if (config.showProgress && config.progressProperty) {
            const row = popup.createDiv({ cls: 'gantt-task-detail-row' });
            row.createSpan({ cls: 'gantt-task-detail-label', text: 'Progress' });
            row.createSpan({
                cls: 'gantt-task-detail-value',
                text: this.formatProgressLabel(task),
            });
        }

        if (config.dependenciesProperty) {
            const deps = this.getDependencyTasks(task);
            const row = popup.createDiv({ cls: 'gantt-task-detail-row' });
            row.createSpan({ cls: 'gantt-task-detail-label', text: 'Dependencies' });
            row.createSpan({
                cls: 'gantt-task-detail-value',
                text: deps.length > 0 ? deps.map(dep => dep.name).join(', ') : 'None',
            });
        }

        const actions = popup.createDiv({ cls: 'gantt-task-detail-actions' });
        const openButton = actions.createEl('button', {
            cls: 'clickable-icon gantt-task-detail-action',
            attr: { type: 'button', 'aria-label': 'Open note' },
        });
        setIcon(openButton, 'file-text');
        openButton.addEventListener('click', () => {
            this.closeTaskPopup();
            void this.app.workspace.openLinkText(task.filePath, '', false);
        });

        const closeButton = actions.createEl('button', {
            cls: 'clickable-icon gantt-task-detail-action',
            attr: { type: 'button', 'aria-label': 'Close' },
        });
        setIcon(closeButton, 'x');
        closeButton.addEventListener('click', () => this.closeTaskPopup());

        const containerRect = this.containerEl.getBoundingClientRect();
        popup.style.left = `${position.clientX - containerRect.left + 10}px`;
        popup.style.top = `${position.clientY - containerRect.top - 10}px`;

        const onPointerDown = (event: PointerEvent) => {
            const target = event.target;
            if (target instanceof Node && !popup.contains(target)) {
                this.closeTaskPopup();
            }
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') this.closeTaskPopup();
        };
        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('keydown', onKeyDown);
        this.popupCleanup = () => {
            document.removeEventListener('pointerdown', onPointerDown, true);
            document.removeEventListener('keydown', onKeyDown);
        };
    }

    private closeTaskPopup(): void {
        this.popupCleanup?.();
        this.popupCleanup = null;
        this.popupEl?.remove();
        this.popupEl = null;
    }

    private suppressNextBarClick(): void {
        this.justDragged = true;
        setTimeout(() => { this.justDragged = false; }, 200);
    }

    private triggerModifiedHoverPreview(event: MouseEvent, filePath: string, targetEl: HTMLElement): void {
        if (!event.ctrlKey && !event.metaKey) return;
        const eventTarget = event.target;
        if (eventTarget instanceof Element && eventTarget.closest('.gantt-popup-trigger')) return;
        if (this.lastPreviewTarget === filePath) return;
        this.lastPreviewTarget = filePath;
        this.triggerHoverPreview(this.createHtmlTargetedMouseEvent(event), filePath, targetEl);
    }

    private formatProgressLabel(task: GanttTask): string {
        const actual = Math.round(task.actualProgressValue ?? task.progress ?? 0);
        const expected = Math.max(1, Math.round(task.expectedProgressValue ?? 100));
        const percent = Math.round((actual / expected) * 100);
        return `${actual}/${expected} (${percent}%)`;
    }

    private getActualProgressFromPercent(task: GanttTask, percent: number): number {
        const expected = Math.max(1, task.expectedProgressValue ?? 100);
        return Math.round((Math.max(0, percent) / 100) * expected);
    }

    private getRenderableTasks(tasks: GanttTask[]): GanttTask[] {
        const config = this.getTaskMapperConfig();
        return tasks.map(task => ({
            ...task,
            name: this.shouldShowProgressLabel(task, config)
                ? this.getRenderedTaskName(task)
                : task.name,
        }));
    }

    private shouldShowProgressLabel(task: GanttTask, config: TaskMapperConfig): boolean {
        return Boolean(
            config.showProgress
            && config.progressProperty
            && !task.id.startsWith(GROUP_HEADER_PREFIX)
        );
    }

    private getRenderedTaskName(task: GanttTask): string {
        return `${task.name} ${this.formatProgressLabel(task)}`;
    }

    private updateRenderedTaskLabel(task: GanttTask): void {
        const wrapper = this.chartEl.querySelector<SVGElement>(
            `.bar-wrapper[data-id="${CSS.escape(task.id)}"]`
        );
        const label = wrapper?.querySelector<SVGTextElement>('.bar-label');
        if (!label) return;
        label.textContent = this.getRenderedTaskName(task);
    }

    private captureTaskDateSnapshot(): void {
        this.preDragTaskDates.clear();
        for (const task of this.currentTasks) {
            if (task.id.startsWith(GROUP_HEADER_PREFIX)) continue;
            this.preDragTaskDates.set(task.id, { start: task.start, end: task.end });
        }
    }

    private async persistMovedDependencyDates(directTaskId: string): Promise<void> {
        if (this.preDragTaskDates.size === 0 || !this.gantt) return;

        const mapperConfig = this.getTaskMapperConfig();
        if (
            !mapperConfig.startProperty
            || mapperConfig.startProperty.startsWith('formula.')
            || mapperConfig.endProperty?.startsWith('formula.')
        ) {
            return;
        }

        const startPropName = this.extractPropertyName(mapperConfig.startProperty);
        const endPropName = mapperConfig.endProperty
            ? this.extractPropertyName(mapperConfig.endProperty)
            : null;

        for (const frappeTask of this.gantt.tasks) {
            if (frappeTask.id === directTaskId || frappeTask.id.startsWith(GROUP_HEADER_PREFIX)) continue;
            const ganttTask = this.findTask(frappeTask.id);
            if (!ganttTask || ganttTask.isParent) continue;

            const before = this.preDragTaskDates.get(frappeTask.id);
            const after = this.getRenderedTaskDates(frappeTask);
            if (!before || !after) continue;
            if (before.start === after.start && before.end === after.end) continue;

            ganttTask.start = after.start;
            ganttTask.end = after.end;
            const updates: Record<string, string> = {
                [startPropName]: after.start,
            };
            if (endPropName) updates[endPropName] = after.end;
            await this.writeFrontmatter(ganttTask.filePath, updates);
        }
    }

    private getRenderedTaskDates(task: { start: string; end: string; _start?: Date; _end?: Date }):
        | { start: string; end: string }
        | null {
        const start = task._start instanceof Date
            ? formatDateForFrontmatter(task._start)
            : task.start;
        const end = task._end instanceof Date
            ? formatDateForFrontmatter(task._end)
            : task.end;
        if (!start || !end) return null;
        return { start, end };
    }

    private triggerHoverPreview(event: MouseEvent, filePath: string, targetEl: HTMLElement): void {
        this.app.workspace.trigger('hover-link', {
            event,
            source: BASES_GANTT_VIEW_ID,
            hoverParent: this.getHoverParent(),
            targetEl,
            linktext: filePath,
            sourcePath: '/',
        });
    }

    private createHtmlTargetedMouseEvent(event: MouseEvent): MouseEvent {
        const anchor = this.getHoverPreviewAnchorEl(event);
        const syntheticEvent = new MouseEvent(event.type, {
            bubbles: true,
            cancelable: true,
            view: window,
            detail: event.detail,
            screenX: event.screenX,
            screenY: event.screenY,
            clientX: event.clientX,
            clientY: event.clientY,
            ctrlKey: event.ctrlKey,
            altKey: event.altKey,
            shiftKey: event.shiftKey,
            metaKey: event.metaKey,
            button: event.button,
            buttons: event.buttons,
            relatedTarget: event.relatedTarget,
        });
        Object.defineProperty(syntheticEvent, 'target', { value: anchor });
        Object.defineProperty(syntheticEvent, 'currentTarget', { value: anchor });
        return syntheticEvent;
    }

    private getHoverPreviewAnchorEl(event: MouseEvent): HTMLElement {
        if (!this.hoverPreviewAnchorEl) {
            this.hoverPreviewAnchorEl = this.containerEl.createDiv({ cls: 'gantt-hover-preview-anchor' });
        }
        const containerRect = this.containerEl.getBoundingClientRect();
        this.hoverPreviewAnchorEl.style.left = `${event.clientX - containerRect.left}px`;
        this.hoverPreviewAnchorEl.style.top = `${event.clientY - containerRect.top}px`;
        return this.hoverPreviewAnchorEl;
    }

    private getHoverParent(): { hoverPopover: unknown } {
        const leaf = this.app.workspace.getLeaf(false);
        if ('hoverPopover' in leaf) return leaf as unknown as { hoverPopover: unknown };
        return { hoverPopover: null };
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
                        this.showTaskContextMenu(ganttTask, evt);
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
            item.setTitle('Create new note')
                .setIcon('plus')
                .onClick(() => this.createNoteAtToday());
        });

        menu.addSeparator();

        menu.addItem((item) => {
            item.setTitle('Scroll to today')
                .setIcon('calendar')
                .onClick(() => this.gantt?.scroll_current());
        });

        menu.showAtMouseEvent(evt);
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

    private getDependencyTasks(task: GanttTask): GanttTask[] {
        const dependencies = typeof task.dependencies === 'string'
            ? task.dependencies.split(',')
            : task.dependencies ?? [];
        const tasks: GanttTask[] = [];
        for (const dependencyId of dependencies.map(dep => dep.trim()).filter(Boolean)) {
            const dependencyTask = this.findTask(dependencyId);
            if (dependencyTask) tasks.push(dependencyTask);
        }
        return tasks;
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

    // ── Unified task context menu ──────────────────────────────────────────

    private showTaskContextMenu(task: GanttTask, evt: MouseEvent): void {
        const menu = new Menu();

        addOpenFileMenuItems(this.app, task.filePath, menu, { includeOpen: true });

        if (this.plugin.settings.ganttDefaults.showInternalPopup) {
            menu.addSeparator();
            menu.addItem((item) => {
                item.setTitle('Show details')
                    .setIcon('info')
                    .onClick(() => this.showTaskPopup(task, evt));
            });
        }

        const mapperConfig = this.getTaskMapperConfig();
        if (mapperConfig.dependenciesProperty && !mapperConfig.dependenciesProperty.startsWith('formula.')) {
            menu.addSeparator();
            menu.addItem((item) => {
                item.setTitle('Add dependency')
                    .setIcon('link')
                    .onClick(() => this.openAddDependencyModal(task));
            });

            const dependencies = this.getDependencyTasks(task);
            menu.addItem((item) => {
                item.setTitle('Remove dependency')
                    .setIcon('unlink')
                    .setDisabled(dependencies.length === 0)
                    .onClick(() => this.openRemoveDependencyModal(task));
            });

            menu.addItem((item) => {
                item.setTitle('Clear dependencies')
                    .setIcon('list-x')
                    .setDisabled(dependencies.length === 0)
                    .onClick(() => {
                        void this.clearDependencies(task);
                    });
            });
        }

        menu.showAtMouseEvent(evt);
    }

    private openAddDependencyModal(task: GanttTask): void {
        const currentDependencies = new Set(this.getDependencyTasks(task).map(dep => dep.filePath));
        const candidates = this.currentTasks
            .filter(candidate => this.isDependencyCandidate(task, candidate))
            .filter(candidate => !currentDependencies.has(candidate.filePath))
            .map(candidate => ({ task: candidate, label: candidate.name }));

        if (candidates.length === 0) {
            new Notice('No available dependencies to add.');
            return;
        }

        new DependencySuggestModal(
            this.app,
            candidates,
            (dependency) => {
                void this.addDependency(task, dependency);
            },
            'Add dependency...',
        ).open();
    }

    private openRemoveDependencyModal(task: GanttTask): void {
        const candidates = this.getDependencyTasks(task)
            .map(candidate => ({ task: candidate, label: candidate.name }));

        if (candidates.length === 0) {
            new Notice('This task has no dependencies.');
            return;
        }

        new DependencySuggestModal(
            this.app,
            candidates,
            (dependency) => {
                void this.removeDependency(task, dependency);
            },
            'Remove dependency...',
        ).open();
    }

    private isDependencyCandidate(task: GanttTask, candidate: GanttTask): boolean {
        return Boolean(
            candidate.filePath
            && candidate.filePath !== task.filePath
            && !candidate.id.startsWith(GROUP_HEADER_PREFIX)
        );
    }

    private async addDependency(task: GanttTask, dependency: GanttTask): Promise<void> {
        if (task.filePath === dependency.filePath) {
            new Notice('A task cannot depend on itself.');
            return;
        }
        const changed = await this.updateDependencyFrontmatter(task, (current) => {
            if (this.rawDependencyIncludesTask(current, dependency)) {
                new Notice('Dependency already exists.');
                return current;
            }
            const link = this.toWikiLink(dependency);
            if (Array.isArray(current)) return [...current, link];
            if (typeof current === 'string' && current.trim()) return `${current}, ${link}`;
            return link;
        });
        if (changed) this.refreshGanttData();
    }

    private async removeDependency(task: GanttTask, dependency: GanttTask): Promise<void> {
        const changed = await this.updateDependencyFrontmatter(task, (current) =>
            this.removeDependencyFromRawValue(current, dependency)
        );
        if (changed) this.refreshGanttData();
    }

    private async clearDependencies(task: GanttTask): Promise<void> {
        const changed = await this.updateDependencyFrontmatter(task, (current) =>
            Array.isArray(current) ? [] : ''
        );
        if (changed) this.refreshGanttData();
    }

    private async updateDependencyFrontmatter(
        task: GanttTask,
        update: (current: unknown) => unknown,
    ): Promise<boolean> {
        const mapperConfig = this.getTaskMapperConfig();
        const dependencyProperty = mapperConfig.dependenciesProperty;
        if (!dependencyProperty) {
            new Notice('Configure a dependency property first.');
            return false;
        }
        if (dependencyProperty.startsWith('formula.')) {
            new Notice('Cannot edit formula-backed dependency properties.');
            return false;
        }

        const file = this.app.vault.getFileByPath(task.filePath);
        if (!file) return false;

        const propName = this.extractPropertyName(dependencyProperty);
        let changed = false;
        await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
            const current = frontmatter[propName];
            const next = update(current);
            if (JSON.stringify(current ?? '') === JSON.stringify(next ?? '')) return;
            frontmatter[propName] = next;
            changed = true;
        });

        return changed;
    }

    private refreshGanttData(): void {
        setTimeout(() => this.onDataUpdated(), 0);
    }

    private toWikiLink(task: GanttTask): string {
        return `[[${task.filePath.replace(/\.md$/i, '')}]]`;
    }

    private rawDependencyIncludesTask(current: unknown, task: GanttTask): boolean {
        return this.getRawDependencyParts(current).some(part => this.dependencyPartMatchesTask(part, task));
    }

    private removeDependencyFromRawValue(current: unknown, task: GanttTask): unknown {
        if (Array.isArray(current)) {
            return current.filter(part => !this.dependencyPartMatchesTask(String(part), task));
        }
        if (typeof current !== 'string') return current;

        const separator = current.includes('\n') ? '\n' : ', ';
        const remaining = this.getRawDependencyParts(current)
            .filter(part => !this.dependencyPartMatchesTask(part, task));
        return remaining.join(separator);
    }

    private getRawDependencyParts(current: unknown): string[] {
        if (Array.isArray(current)) {
            return current.map(part => String(part).trim()).filter(Boolean);
        }
        if (typeof current !== 'string') return [];
        return current
            .split(/[\n,]/)
            .map(part => part.trim())
            .filter(Boolean);
    }

    private dependencyPartMatchesTask(part: string, task: GanttTask): boolean {
        const wikiMatch = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/.exec(part);
        const target = (wikiMatch?.[1] ?? part).trim();
        const pathNoExt = task.filePath.replace(/\.md$/i, '');
        return target === task.filePath
            || target === pathNoExt
            || target === task.name
            || target === task.filePath.split('/').pop()
            || target === pathNoExt.split('/').pop();
    }

    // ── Empty state ──────────────────────────────────────────────────────

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
                text: 'No notes with valid dates found.',
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
                    key: 'expectedProgress',
                    displayName: 'Expected progress',
                    placeholder: 'Time-based (default)',
                    shouldHide: () =>
                        !(config.get('showProgress') as boolean) ||
                        !(config.get('showExpectedProgress') as boolean),
                },
                {
                    type: 'property',
                    key: 'parentProp',
                    displayName: 'Parent note (WBS)',
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
                {
                    type: 'toggle',
                    key: 'persistDependencyDateChanges',
                    displayName: 'Persist moved dependency dates',
                    default: false,
                },
            ],
        },
        {
            type: 'group',
            displayName: 'Note template',
            items: [
                {
                    type: 'file',
                    key: 'templatePath',
                    displayName: 'Template note',
                    default: '',
                    placeholder: 'Templates/Note.md',
                    filter: (file: TFile) => file.extension === 'md',
                },
                {
                    type: 'folder',
                    key: 'targetFolder',
                    displayName: 'Target folder',
                    default: '',
                    placeholder: 'Leave blank to follow Base',
                },
                {
                    type: 'text',
                    key: 'titleFormat',
                    displayName: 'Title format',
                    default: 'New note {{date}}',
                    placeholder: 'New note {{date}}',
                },
            ],
        },
    ];
}
