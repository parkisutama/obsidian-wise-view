/**
 * Shared utilities for Gantt and Gantt WBS views.
 *
 * Centralises types, date helpers, value extraction, task mapping, and
 * dependency sorting so both BasesGanttView and BasesGanttWbsView stay DRY.
 */

import {
    BasesEntry,
    BasesPropertyId,
    DateValue,
    NullValue,
    Value,
} from 'obsidian';
import type { FrappeTask } from 'frappe-gantt';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Extended task type carrying file path, optional WBS hierarchy, and color. */
export interface GanttTask extends FrappeTask {
    filePath: string;
    isMilestone?: boolean;
    /** Parent file path resolved from a parent wiki-link (WBS only). */
    parentPath?: string | null;
    /** WBS depth assigned by buildWbsOrder (0 = root). */
    depth?: number;
    /** Resolved color from Pretty Properties / valueStyles / hash fallback. */
    resolvedColor?: string | null;
}

/** Configuration derived from view options for mapping entries to tasks. */
export interface TaskMapperConfig {
    startProperty: BasesPropertyId | null;
    endProperty: BasesPropertyId | null;
    labelProperty: BasesPropertyId | null;
    dependenciesProperty: BasesPropertyId | null;
    colorByProperty: BasesPropertyId | null;
    progressProperty: BasesPropertyId | null;
    /** Optional parent property for WBS hierarchy (Gantt WBS only). */
    parentProperty?: BasesPropertyId | null;
    showProgress: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Color class palette — maps to CSS classes gantt-color-0 through gantt-color-7. */
export const COLOR_CLASS_COUNT = 8;

/** Phantom group header prefix — tasks with this id prefix are not real items. */
export const GROUP_HEADER_PREFIX = '__group__';

// ── Date utilities ────────────────────────────────────────────────────────────

/**
 * Parse a date value (string, DateValue, or number) into a JS Date.
 * Appends T00:00:00 to date-only strings to prevent UTC timezone shift.
 */
export function parseObsidianDate(value: unknown): Date | null {
    if (value == null) return null;

    if (value instanceof Date) {
        return isNaN(value.getTime()) ? null : value;
    }

    if (value instanceof DateValue) {
        return parseObsidianDate(value.dateOnly().toString());
    }

    if (typeof value === 'number') {
        const d = new Date(value);
        return isNaN(d.getTime()) ? null : d;
    }

    if (typeof value === 'string') {
        const t = value.trim();
        if (!t) return null;

        if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
            const d = new Date(t + 'T00:00:00');
            return isNaN(d.getTime()) ? null : d;
        }

        if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(t)) {
            const d = new Date(t.replace(' ', 'T'));
            return isNaN(d.getTime()) ? null : d;
        }

        const d = new Date(t);
        return isNaN(d.getTime()) ? null : d;
    }

    return null;
}

/** Format a Date as YYYY-MM-DD (for Frappe Gantt). */
export function formatDateForGantt(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/** Format a Date as YYYY-MM-DD (for writing back to frontmatter). */
export function formatDateForFrontmatter(date: Date): string {
    return formatDateForGantt(date);
}

// ── Value extraction ──────────────────────────────────────────────────────────

/**
 * Extract a string representation from an Obsidian Value object.
 * Returns null for NullValue or null/undefined inputs.
 */
export function extractRawValue(val: Value | null | undefined): string | null {
    if (val == null || val instanceof NullValue) return null;
    if (val instanceof DateValue) return val.dateOnly().toString();
    return val.toString();
}

// ── Task ID ───────────────────────────────────────────────────────────────────

/**
 * Make a stable, CSS-safe task ID from a file path.
 * Frappe Gantt uses task IDs in CSS selectors, so IDs must be CSS-safe.
 */
export function makeTaskId(filePath: string, prefix = 'task'): string {
    return prefix + '-' + filePath.replace(/[^a-zA-Z0-9_-]/g, '_');
}

// ── Group headers ─────────────────────────────────────────────────────────────

/**
 * Create a phantom task that acts as a visual group header row.
 * It spans the full date range of the group's real tasks.
 */
export function createGroupHeaderTask(
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
        depth: 0,
    };
}

// ── Task mapping ──────────────────────────────────────────────────────────────

/**
 * Optional callback that resolves a color string for a given colorBy field/value.
 * Used by Phase 4 to integrate Pretty Properties / valueStyles / hash fallback.
 */
export type ColorResolver = (fieldId: string, value: string) => string | null;

/**
 * Map an array of BasesEntry objects to GanttTask objects for Frappe Gantt.
 *
 * @param entries       The entries from Bases data
 * @param config        Property mappings and display config
 * @param taskIdPrefix  ID prefix: 'task' for Gantt, 'wbs' for Gantt WBS
 * @param colorResolver Optional callback to resolve bar color from field/value
 */
export function mapEntriesToTasks(
    entries: BasesEntry[],
    config: TaskMapperConfig,
    taskIdPrefix = 'task',
    colorResolver?: ColorResolver,
): GanttTask[] {
    if (!config.startProperty) return [];

    // Build name/path → id and name/path → filePath maps for dep + parent resolution
    const nameToId = new Map<string, string>();
    const nameToPath = new Map<string, string>();
    for (const entry of entries) {
        const id = makeTaskId(entry.file.path, taskIdPrefix);
        nameToId.set(entry.file.basename, id);
        nameToPath.set(entry.file.basename, entry.file.path);
        const pathNoExt = entry.file.path.replace(/\.[^.]+$/, '');
        nameToId.set(pathNoExt, id);
        nameToPath.set(pathNoExt, entry.file.path);
    }

    // Collect unique values for CSS class color fallback
    const colorValues = new Map<string, number>();
    if (config.colorByProperty) {
        for (const entry of entries) {
            const raw = extractRawValue(entry.getValue(config.colorByProperty));
            if (raw != null && !colorValues.has(raw)) {
                colorValues.set(raw, colorValues.size % COLOR_CLASS_COUNT);
            }
        }
    }

    const tasks: GanttTask[] = [];

    for (const entry of entries) {
        const rawStart = extractRawValue(entry.getValue(config.startProperty));
        const startDate = parseObsidianDate(rawStart);
        if (!startDate) continue;

        let endDate: Date | null = null;
        if (config.endProperty) {
            endDate = parseObsidianDate(extractRawValue(entry.getValue(config.endProperty)));
        }
        if (!endDate) {
            endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 1);
        }
        if (endDate < startDate) {
            endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 1);
        }

        // Label
        let name = entry.file.basename;
        if (config.labelProperty) {
            const raw = extractRawValue(entry.getValue(config.labelProperty));
            if (raw?.trim()) name = raw;
        }

        // Progress
        let progress = 0;
        if (config.showProgress && config.progressProperty) {
            const raw = extractRawValue(entry.getValue(config.progressProperty));
            if (raw != null) {
                const num = parseFloat(raw);
                if (!isNaN(num)) progress = Math.max(0, Math.min(100, num));
            }
        }

        // Dependencies (wiki-links or plain names)
        let dependencies = '';
        if (config.dependenciesProperty) {
            const raw = extractRawValue(entry.getValue(config.dependenciesProperty));
            if (raw != null) {
                const wikiLinkRe = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
                const depIds: string[] = [];
                let m;
                while ((m = wikiLinkRe.exec(raw)) !== null) {
                    const id = nameToId.get(m[1]!.trim());
                    if (id) depIds.push(id);
                }
                if (depIds.length === 0 && !raw.includes('[[')) {
                    for (const part of raw.split(',').map(s => s.trim()).filter(Boolean)) {
                        const id = nameToId.get(part);
                        if (id) depIds.push(id);
                    }
                }
                dependencies = depIds.join(', ');
            }
        }

        // Color: try resolver first, fall back to CSS class rotation
        let custom_class = '';
        let resolvedColor: string | null = null;
        if (config.colorByProperty) {
            const raw = extractRawValue(entry.getValue(config.colorByProperty));
            if (raw != null) {
                // Try the color resolver (Pretty Properties / valueStyles / hash)
                if (colorResolver) {
                    const fieldId = config.colorByProperty;
                    resolvedColor = colorResolver(fieldId, raw) ?? null;
                }
                // Always assign CSS class fallback
                const idx = colorValues.get(raw);
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
            if (!custom_class) custom_class = 'gantt-milestone';
        }

        // Parent path for WBS hierarchy
        let parentPath: string | null = null;
        if (config.parentProperty) {
            const raw = extractRawValue(entry.getValue(config.parentProperty));
            if (raw) {
                const wikiMatch = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/.exec(raw);
                const parentName = wikiMatch ? wikiMatch[1]!.trim() : raw.trim();
                parentPath = nameToPath.get(parentName) ?? null;
            }
        }

        tasks.push({
            id: makeTaskId(entry.file.path, taskIdPrefix),
            name,
            start: formatDateForGantt(startDate),
            end: formatDateForGantt(endDate),
            progress,
            dependencies,
            custom_class,
            filePath: entry.file.path,
            isMilestone,
            parentPath,
            resolvedColor,
        });
    }

    return tasks;
}

// ── Topological sort ──────────────────────────────────────────────────────────

/**
 * Topological sort: tasks with no dependencies first, then tasks whose
 * dependencies are already placed. Ties broken by start date.
 */
export function sortByDependencies(tasks: GanttTask[]): GanttTask[] {
    if (tasks.length <= 1) return tasks;

    const taskMap = new Map(tasks.map(t => [t.id, t]));
    const depsOf = new Map<string, Set<string>>();
    for (const t of tasks) {
        const deps = new Set<string>();
        if (t.dependencies) {
            const str = typeof t.dependencies === 'string'
                ? t.dependencies : (t.dependencies ?? []).join(',');
            for (const d of str.split(',')) {
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
            if ([...depsOf.get(id)!].every(d => placed.has(d)))
                ready.push(taskMap.get(id)!);
        }
        if (ready.length === 0) {
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

// ── Resolved color application ────────────────────────────────────────────────

/**
 * Apply resolved colors to Gantt bar SVG elements after Frappe renders.
 * Inline fill style overrides the CSS class fallback colors.
 */
export function applyResolvedColors(containerEl: HTMLElement, tasks: GanttTask[]): void {
    for (const task of tasks) {
        if (!task.resolvedColor) continue;
        const wrapper = containerEl.querySelector(`.bar-wrapper[data-id="${CSS.escape(task.id)}"]`);
        if (!wrapper) continue;
        const barRect = wrapper.querySelector('.bar');
        if (barRect instanceof SVGElement) {
            barRect.style.fill = task.resolvedColor;
        }
        const progressRect = wrapper.querySelector('.bar-progress');
        if (progressRect instanceof SVGElement) {
            progressRect.style.fill = task.resolvedColor;
            // eslint-disable-next-line obsidianmd/no-static-styles-assignment -- SVG inline style for dynamic color
            progressRect.style.filter = 'brightness(0.85)';
        }
    }
}

