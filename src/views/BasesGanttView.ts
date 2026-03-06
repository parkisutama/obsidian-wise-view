/**
 * BasesGanttView — Frappe Gantt integration for Obsidian Bases.
 *
 * Clean port of lhassa8/obsidian-bases-gantt, adapted for the Wise View
 * multi-view plugin architecture.
 *
 * Architecture:
 *  - Reads frontmatter properties for start/end date, progress, dependencies, and colorBy.
 *  - Renders using Frappe Gantt (https://github.com/frappe/gantt).
 *  - Colors resolved via CSS classes (gantt-color-0 through gantt-color-7).
 *  - On bar click: opens file in current tab.
 *  - On date drag: writes updated dates back to frontmatter (single source of truth).
 *  - On date column click: creates a new task at that date.
 *  - View configuration exposed through Bases' native config sidebar options.
 */

import {
    BasesView,
    BasesViewRegistration,
    BasesEntry,
    BasesPropertyId,
    BasesAllOptions,
    BasesViewConfig,
    QueryController,
    DateValue,
    NumberValue,
    NullValue,
    Value,
    Menu,
    Notice,
    MarkdownRenderer,
} from 'obsidian';
import Gantt from 'frappe-gantt';
import type { FrappeTask, GanttOptions, PopupContext } from 'frappe-gantt';
import type PlannerPlugin from '../main';

// ── View ID ─────────────────────────────────────────────────────────────────

export const BASES_GANTT_VIEW_ID = 'wise-view-gantt';

// ── Internal types ───────────────────────────────────────────────────────────

/** Extended task type carrying the original file path for click-to-open. */
interface GanttTask extends FrappeTask {
    filePath: string;
    isMilestone?: boolean;
}

/** Configuration derived from view options for mapping entries to tasks. */
interface TaskMapperConfig {
    startProperty: BasesPropertyId | null;
    endProperty: BasesPropertyId | null;
    labelProperty: BasesPropertyId | null;
    dependenciesProperty: BasesPropertyId | null;
    colorByProperty: BasesPropertyId | null;
    progressProperty: BasesPropertyId | null;
    showProgress: boolean;
}

/** Color class palette — maps to CSS classes gantt-color-0 through gantt-color-7. */
const COLOR_CLASS_COUNT = 8;

/** Phantom group header prefix — tasks with this id prefix are not real items. */
const GROUP_HEADER_PREFIX = '__group__';

// ── Date utilities ───────────────────────────────────────────────────────────

/**
 * Parse a date value (string, DateValue, or number) into a JS Date.
 * Appends T00:00:00 to date-only strings to prevent UTC timezone shift.
 */
function parseObsidianDate(value: unknown): Date | null {
    if (value == null) return null;

    if (value instanceof Date) {
        return isNaN(value.getTime()) ? null : value;
    }

    // Unwrap Obsidian DateValue
    if (value instanceof DateValue) {
        const str = value.dateOnly().toString();
        return parseObsidianDate(str);
    }

    if (typeof value === 'number') {
        const d = new Date(value);
        return isNaN(d.getTime()) ? null : d;
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return null;

        // Date-only: YYYY-MM-DD → append T00:00:00 to avoid timezone shift
        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
            const d = new Date(trimmed + 'T00:00:00');
            return isNaN(d.getTime()) ? null : d;
        }

        // Datetime with space separator: YYYY-MM-DD HH:MM → convert to T separator
        if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(trimmed)) {
            const d = new Date(trimmed.replace(' ', 'T'));
            return isNaN(d.getTime()) ? null : d;
        }

        // ISO datetime or anything else Date can parse
        const d = new Date(trimmed);
        return isNaN(d.getTime()) ? null : d;
    }

    return null;
}

/** Format a Date as YYYY-MM-DD (for Frappe Gantt). */
function formatDateForGantt(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/** Format a Date as YYYY-MM-DD (for writing back to frontmatter). */
function formatDateForFrontmatter(date: Date): string {
    return formatDateForGantt(date);
}

// ── Value extraction ──────────────────────────────────────────────────────────

/**
 * Extract a string representation from an Obsidian Value object.
 * Returns null for NullValue or null/undefined inputs.
 * DateValue gets special handling: dateOnly() strips time for clean date strings.
 */
function extractRawValue(val: Value | null | undefined): string | null {
    if (val == null || val instanceof NullValue) return null;
    if (val instanceof DateValue) {
        return val.dateOnly().toString();
    }
    return val.toString();
}

// ── Task ID ──────────────────────────────────────────────────────────────────

/**
 * Make a stable task ID from a file path.
 * Frappe Gantt replaces spaces with underscores internally, so we do the same.
 */
function makeTaskId(filePath: string): string {
    return filePath.replace(/ /g, '_');
}

// ── Group headers ────────────────────────────────────────────────────────────

/**
 * Create a phantom task that acts as a visual group header row.
 * It spans the full date range of the group's real tasks.
 */
function createGroupHeaderTask(
    groupLabel: string,
    groupIndex: number,
    groupTasks: GanttTask[],
): GanttTask | null {
    if (groupTasks.length === 0) return null;

    let minStart = groupTasks[0]!.start;
    let maxEnd = groupTasks[0]!.end;
    for (const t of groupTasks) {
        if (t.start < minStart) minStart = t.start;
        if (t.end > maxEnd) maxEnd = t.end;
    }

    return {
        id: `${GROUP_HEADER_PREFIX}${groupIndex}`,
        name: groupLabel,
        start: minStart,
        end: maxEnd,
        progress: 0,
        dependencies: '',
        custom_class: 'gantt-group-header',
        filePath: '',
    };
}

// ── Task mapping ─────────────────────────────────────────────────────────────

/**
 * Map an array of BasesEntry objects to GanttTask objects for Frappe Gantt.
 */
function mapEntriesToTasks(
    entries: BasesEntry[],
    config: TaskMapperConfig,
): GanttTask[] {
    if (!config.startProperty) return [];

    // First pass: build maps for dependency resolution.
    const nameToId = new Map<string, string>();
    for (const entry of entries) {
        const id = makeTaskId(entry.file.path);
        nameToId.set(entry.file.basename, id);
        const pathNoExt = entry.file.path.replace(/\.[^.]+$/, '');
        nameToId.set(pathNoExt, id);
    }

    // Collect unique values for color mapping
    const colorValues = new Map<string, number>();
    if (config.colorByProperty) {
        for (const entry of entries) {
            const val = entry.getValue(config.colorByProperty);
            const raw = extractRawValue(val);
            if (raw != null && !colorValues.has(String(raw))) {
                colorValues.set(String(raw), colorValues.size % COLOR_CLASS_COUNT);
            }
        }
    }

    const tasks: GanttTask[] = [];

    for (const entry of entries) {
        const startVal = entry.getValue(config.startProperty);
        const rawStart = extractRawValue(startVal);
        const startDate = parseObsidianDate(rawStart);
        if (!startDate) continue;

        let endDate: Date | null = null;
        if (config.endProperty) {
            const endVal = entry.getValue(config.endProperty);
            endDate = parseObsidianDate(extractRawValue(endVal));
        }
        // Default: if no end date, task spans 1 day
        if (!endDate) {
            endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 1);
        }
        // Ensure end >= start
        if (endDate < startDate) {
            endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 1);
        }

        // Label
        let name = entry.file.basename;
        if (config.labelProperty) {
            const labelVal = entry.getValue(config.labelProperty);
            const raw = extractRawValue(labelVal);
            if (raw != null && String(raw).trim()) {
                name = String(raw);
            }
        }

        // Progress
        let progress = 0;
        if (config.showProgress && config.progressProperty) {
            const progVal = entry.getValue(config.progressProperty);
            const raw = extractRawValue(progVal);
            if (raw != null) {
                const num = parseFloat(String(raw));
                if (!isNaN(num)) {
                    progress = Math.max(0, Math.min(100, num));
                }
            }
        }

        // Dependencies: parse wiki-links from the property value
        let dependencies = '';
        if (config.dependenciesProperty) {
            const depVal = entry.getValue(config.dependenciesProperty);
            const raw = extractRawValue(depVal);
            if (raw != null) {
                const depStr = String(raw);
                const wikiLinkRegex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
                const depIds: string[] = [];
                let match;
                while ((match = wikiLinkRegex.exec(depStr)) !== null) {
                    const linkTarget = match[1]!.trim();
                    const targetId = nameToId.get(linkTarget);
                    if (targetId) {
                        depIds.push(targetId);
                    }
                }
                // Also handle comma-separated plain text names (no wiki-link syntax)
                if (depIds.length === 0 && !depStr.includes('[[')) {
                    const plainDeps = depStr.split(',').map(s => s.trim()).filter(Boolean);
                    for (const dep of plainDeps) {
                        const targetId = nameToId.get(dep);
                        if (targetId) {
                            depIds.push(targetId);
                        }
                    }
                }
                dependencies = depIds.join(', ');
            }
        }

        // Color class
        let custom_class = '';
        if (config.colorByProperty) {
            const colorVal = entry.getValue(config.colorByProperty);
            const raw = extractRawValue(colorVal);
            if (raw != null) {
                const idx = colorValues.get(String(raw));
                if (idx !== undefined) {
                    custom_class = `gantt-color-${idx}`;
                }
            }
        }

        // Milestone: start === end
        const isMilestone = startDate.getTime() === endDate.getTime();
        if (isMilestone) {
            endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 1);
            if (!custom_class) {
                custom_class = 'gantt-milestone';
            }
        }

        tasks.push({
            id: makeTaskId(entry.file.path),
            name,
            start: formatDateForGantt(startDate),
            end: formatDateForGantt(endDate),
            progress,
            dependencies,
            custom_class,
            filePath: entry.file.path,
            isMilestone,
        });
    }

    return sortByDependencies(tasks);
}

/**
 * Topological sort: tasks with no dependencies first, then tasks whose
 * dependencies are already placed. Ties broken by start date.
 */
function sortByDependencies(tasks: GanttTask[]): GanttTask[] {
    if (tasks.length <= 1) return tasks;

    const taskMap = new Map<string, GanttTask>();
    for (const t of tasks) taskMap.set(t.id, t);

    const depsOf = new Map<string, Set<string>>();
    for (const t of tasks) {
        const deps = new Set<string>();
        if (t.dependencies) {
            const depStr = typeof t.dependencies === 'string' ? t.dependencies : (t.dependencies ?? []).join(',');
            for (const d of depStr.split(',')) {
                const id = d.trim();
                if (id && taskMap.has(id)) deps.add(id);
            }
        }
        depsOf.set(t.id, deps);
    }

    const sorted: GanttTask[] = [];
    const placed = new Set<string>();
    const remaining = new Set(tasks.map(t => t.id));

    while (remaining.size > 0) {
        const ready: GanttTask[] = [];
        for (const id of remaining) {
            const deps = depsOf.get(id)!;
            const allMet = [...deps].every(d => placed.has(d));
            if (allMet) ready.push(taskMap.get(id)!);
        }

        if (ready.length === 0) {
            // Circular dependency — append the rest by start date
            const rest = [...remaining].map(id => taskMap.get(id)!);
            rest.sort((a, b) => a.start.localeCompare(b.start));
            sorted.push(...rest);
            break;
        }

        ready.sort((a, b) => a.start.localeCompare(b.start));
        for (const t of ready) {
            sorted.push(t);
            placed.add(t.id);
            remaining.delete(t.id);
        }
    }

    return sorted;
}

// ── View class ───────────────────────────────────────────────────────────────

export class BasesGanttView extends BasesView {
    type = BASES_GANTT_VIEW_ID;

    /** Static registry of active instances for command palette integration. */
    static instances: Set<BasesGanttView> = new Set();

    private plugin: PlannerPlugin;
    private containerEl: HTMLElement;
    private ganttEl: HTMLElement;
    private gantt: Gantt | null = null;
    private configSnapshot = '';
    private currentTasks: GanttTask[] = [];
    private taskMap: Map<string, GanttTask> = new Map();
    /** Flag to suppress on_click after a drag operation. */
    private justDragged = false;
    /** Global mouseup handlers Frappe Gantt registers on document (for cleanup). */
    private capturedGlobalHandlers: EventListener[] = [];

    constructor(controller: QueryController, containerEl: HTMLElement, plugin: PlannerPlugin) {
        super(controller);
        this.plugin = plugin;
        this.containerEl = containerEl;
    }

    onload(): void {
        BasesGanttView.instances.add(this);
        this.containerEl.addClass('bases-gantt-view');
        this.ganttEl = this.containerEl.createDiv({ cls: 'gantt-wrapper' });
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
        // Formula properties are computed by Bases — cannot write to frontmatter
        if (config.startProperty.startsWith('formula.')) {
            new Notice('Cannot create tasks with formula date properties.');
            return;
        }
        const today = formatDateForFrontmatter(new Date());
        const propName = this.extractPropertyName(config.startProperty);
        void this.createFileForView('New task', (frontmatter) => {
            frontmatter[propName] = today;
            if (config.endProperty && !config.endProperty.startsWith('formula.')) {
                const endPropName = this.extractPropertyName(config.endProperty);
                frontmatter[endPropName] = today;
            }
        });
    }

    // ── Data rendering ─────────────────────────────────────────────────────────

    onDataUpdated(): void {
        if (!this.data?.data || !this.ganttEl) return;

        const config = this.getTaskMapperConfig();
        const newSnapshot = JSON.stringify(config) + '|' + this.getDisplayConfigSnapshot();

        // Build tasks (potentially from grouped data)
        let tasks: GanttTask[];
        const groups = this.data.groupedData;
        const hasGroups = groups.length > 1 || (groups.length === 1 && groups[0]?.hasKey());
        if (hasGroups) {
            tasks = [];
            for (let i = 0; i < groups.length; i++) {
                const group = groups[i];
                const group_ = group!;
                const groupTasks = mapEntriesToTasks(group_.entries, config);
                if (groupTasks.length === 0) continue;
                const label = group_.hasKey() ? String(group_.key) : 'Ungrouped';
                const header = createGroupHeaderTask(label, i, groupTasks);
                if (header) tasks.push(header);
                tasks.push(...groupTasks);
            }
        } else {
            tasks = mapEntriesToTasks(this.data.data, config);
        }

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
            showProgress:
                (this.config.get('showProgress') as boolean) ??
                (progressProperty != null), // auto-enable if progress property detected
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

        // Dates: match by name, fallback to positional (first = start, second = end)
        const startKeywords = ['start', 'begin', 'from', 'created'];
        const endKeywords = ['end', 'due', 'finish', 'deadline', 'until'];

        let start = findByKeywords(dateProps, startKeywords);
        let end = findByKeywords(dateProps, endKeywords);

        if (!start && dateProps.length > 0) start = dateProps[0] ?? null;
        if (!end && dateProps.length > 1) end = dateProps.find(p => p !== start) ?? null;

        // Dependencies: look for link-like string properties
        const depKeywords = ['depend', 'block', 'after', 'prerequisite', 'requires'];
        const dependencies = findByKeywords(stringProps, depKeywords);

        // Progress: look for number properties with progress-like names
        const progressKeywords = ['progress', 'percent', 'completion', 'complete', 'done'];
        const progress = findByKeywords(numberProps, progressKeywords);

        // Color by: look for status/category-like string properties
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
        });
    }

    // ── Gantt initialization ───────────────────────────────────────────────────

    private initGantt(tasks: GanttTask[]): void {
        // Clear previous chart
        if (this.gantt) {
            this.gantt.clear();
            this.gantt = null;
        }
        this.ganttEl.empty();

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
            view_mode_select: false,

            // Enhanced options
            arrow_curve: 15,
            auto_move_label: true,
            move_dependencies: true,
            show_expected_progress: showExpectedProgress && showProgress,
            hover_on_date: true,
            popup_on: 'hover',

            // Rich hover popup
            popup: (ctx: PopupContext) => {
                this.renderPopup(ctx, showProgress);
            },

            on_click: (task) => {
                // Suppress click that fires immediately after a drag/resize
                if (this.justDragged) return;
                // Ignore group header phantom tasks
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

            on_date_click: (dateStr: string) => {
                this.createTaskAtDate(dateStr);
            },
        };

        // Capture global mouseup handlers Frappe Gantt registers on document
        // so we can remove them on cleanup (Frappe never removes them itself).
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
            this.gantt = new Gantt(this.ganttEl, tasks, options);
        } catch (e) {
            console.error('Bases Gantt: failed to initialize chart', e);
            this.ganttEl.empty();
            this.renderEmptyState(this.getTaskMapperConfig());
            return;
        } finally {
            document.addEventListener = origAdd;
        }
        this.capturedGlobalHandlers = captured;

        // Apply milestone class to bar wrappers (can't combine with color class
        // in custom_class because Frappe Gantt throws on spaces in classList.add)
        for (const task of tasks) {
            if (task.isMilestone) {
                const wrapper = this.ganttEl.querySelector(`.bar-wrapper[data-id="${task.id}"]`);
                if (wrapper) wrapper.classList.add('gantt-milestone');
            }
        }
    }

    // ── Rich hover popup ───────────────────────────────────────────────────────

    /** Render content inside Frappe Gantt's hover popup. */
    private renderPopup(ctx: PopupContext, showProgress: boolean): void {
        const ganttTask = this.findTask(ctx.task.id);

        // Group headers: just show the label
        if (!ganttTask || ganttTask.id.startsWith(GROUP_HEADER_PREFIX)) {
            ctx.set_title(`<strong>${this.escapeHtml(ctx.task.name)}</strong>`);
            return;
        }

        // Title
        ctx.set_title(this.escapeHtml(ctx.task.name));

        // Subtitle: date range + duration
        const start = ctx.task._start;
        const end = ctx.task._end;
        if (start && end) {
            const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
            ctx.set_subtitle(
                `${this.formatDisplayDate(start)} &rarr; ${this.formatDisplayDate(end)} &middot; ${days} day${days !== 1 ? 's' : ''}`
            );
        }

        // Details: progress bar + dependencies + hint
        const parts: string[] = [];

        if (showProgress && ctx.task.progress != null) {
            const pct = Math.round(ctx.task.progress);
            parts.push(
                `<div class="gantt-popup-progress-row">` +
                `<div class="gantt-popup-progress"><div class="gantt-popup-progress-bar" style="width:${pct}%"></div></div>` +
                `<span class="gantt-popup-progress-label">${pct}%</span>` +
                `</div>`
            );
        }

        if (ctx.task.dependencies) {
            const rawDeps = typeof ctx.task.dependencies === 'string'
                ? ctx.task.dependencies
                : (ctx.task.dependencies ?? []).join(',');
            const depNames = rawDeps.split(',')
                .map((d: string) => d.trim()).filter(Boolean)
                .map((depId: string) => {
                    const depTask = this.findTask(depId);
                    return depTask ? this.escapeHtml(depTask.name) : depId;
                });
            if (depNames.length > 0) {
                parts.push(`<div class="gantt-popup-deps">Depends on: ${depNames.join(', ')}</div>`);
            }
        }

        parts.push(`<div class="gantt-popup-hint">Click to open &middot; Right-click for options</div>`);
        ctx.set_details(parts.join(''));

        // Async: render a markdown preview of the note body
        void this.renderPopupPreview(ganttTask);
    }

    /** Asynchronously render a truncated markdown preview in the popup. */
    private async renderPopupPreview(ganttTask: GanttTask): Promise<void> {
        const file = this.app.vault.getFileByPath(ganttTask.filePath);
        if (!file) return;

        const content = await this.app.vault.cachedRead(file);

        // Strip frontmatter
        const bodyMatch = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)/);
        const body = bodyMatch ? (bodyMatch[1] ?? '').trim() : content.trim();
        if (!body) return;

        const preview = body.length > 300 ? body.substring(0, 300) + '...' : body;

        // Check popup is still visible
        const popupEl = this.ganttEl.querySelector('.popup-wrapper');
        if (!popupEl || popupEl.querySelector('.gantt-popup-preview')) return;

        const previewDiv = document.createElement('div');
        previewDiv.className = 'gantt-popup-preview';
        popupEl.appendChild(previewDiv);

        await MarkdownRenderer.render(this.app, preview, previewDiv, ganttTask.filePath, this);
    }

    /** Format a date for display in popups (shorter, human-friendly). */
    private formatDisplayDate(date: Date): string {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
    }

    /** Escape HTML to prevent XSS in popup content. */
    private escapeHtml(str: string): string {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ── Right-click context menus ─────────────────────────────────────────────

    /** Register right-click context menu on the Gantt chart (once, in onload). */
    private registerContextMenu(): void {
        this.ganttEl.addEventListener('contextmenu', (evt: MouseEvent) => {
            evt.preventDefault();

            const target = evt.target as Element;
            const barWrapper = target.closest('.bar-wrapper');

            if (barWrapper) {
                const taskId = barWrapper.getAttribute('data-id');
                if (taskId) {
                    const ganttTask = this.findTask(taskId);
                    if (ganttTask && !ganttTask.id.startsWith(GROUP_HEADER_PREFIX)) {
                        this.showTaskContextMenu(evt, ganttTask);
                        return;
                    }
                }
            }

            this.showEmptyContextMenu(evt);
        });
    }

    /** Context menu for a specific task bar. */
    private showTaskContextMenu(evt: MouseEvent, task: GanttTask): void {
        const menu = new Menu();

        menu.addItem((item) => {
            item.setTitle('Open note')
                .setIcon('file-text')
                .onClick(() => {
                    void this.app.workspace.openLinkText(task.filePath, '', false);
                });
        });

        menu.addItem((item) => {
            item.setTitle('Open in new tab')
                .setIcon('file-plus')
                .onClick(() => {
                    void this.app.workspace.openLinkText(task.filePath, '', true);
                });
        });

        menu.addSeparator();

        const showProgress = (this.config.get('showProgress') as boolean) ?? false;
        if (showProgress) {
            for (const pct of [0, 25, 50, 75, 100]) {
                menu.addItem((item) => {
                    item.setTitle(`Set progress: ${pct}%`)
                        .setChecked(Math.round(task.progress ?? 0) === pct)
                        .onClick(() => {
                            const mapperConfig = this.getTaskMapperConfig();
                            if (mapperConfig.progressProperty && !mapperConfig.progressProperty.startsWith('formula.')) {
                                const propName = this.extractPropertyName(mapperConfig.progressProperty);
                                void this.writeFrontmatter(task.filePath, {
                                    [propName]: pct,
                                });
                                // Instant visual feedback
                                this.gantt?.update_task(task.id, { progress: pct });
                            }
                        });
                });
            }
            menu.addSeparator();
        }

        menu.addItem((item) => {
            item.setTitle('Scroll to today')
                .setIcon('calendar')
                .onClick(() => this.gantt?.scroll_current());
        });

        menu.showAtMouseEvent(evt);
    }

    /** Context menu for empty chart space. */
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

    /** Create a new task at a specific date (from on_date_click). */
    private createTaskAtDate(dateStr: string): void {
        const config = this.getTaskMapperConfig();
        if (!config.startProperty) {
            new Notice('Configure a start date property first.');
            return;
        }
        // Formula properties are computed by Bases — cannot write to frontmatter
        if (config.startProperty.startsWith('formula.')) {
            new Notice('Cannot create tasks with formula date properties.');
            return;
        }

        // Parse and re-format to ensure consistent YYYY-MM-DD
        const parsed = parseObsidianDate(dateStr);
        const formattedDate = parsed ? formatDateForFrontmatter(parsed) : dateStr;

        const propName = this.extractPropertyName(config.startProperty);
        void this.createFileForView('New task', (frontmatter) => {
            frontmatter[propName] = formattedDate;
            if (config.endProperty && !config.endProperty.startsWith('formula.')) {
                const endPropName = this.extractPropertyName(config.endProperty);
                frontmatter[endPropName] = formattedDate;
            }
        });
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    /** Find the earliest start date string among tasks, for initial scroll. */
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

    /**
     * Extract the property name from a BasesPropertyId (e.g. "note.start-date" -> "start-date").
     */
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

        await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
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
        this.ganttEl.empty();

        // Remove any existing empty state
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

/**
 * Return the view options for the Bases config sidebar.
 */
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
