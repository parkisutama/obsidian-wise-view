/**
 * Per-value style override for a property field.
 * User edits this directly in data.json:
 *
 * "valueStyles": {
 *   "note.status": {
 *     "Done": { "color": "#859900" }
 *   }
 * }
 *
 * For icons, use emojis directly in your property values (e.g. "✅ Done").
 */
export interface ValueStyle {
  /** Hex color string, e.g. "#268bd2" */
  color?: string;
}

/** Default field mappings for the Calendar view */
export interface CalendarDefaults {
  weekStartsOn: WeekDay;
  fontSize: number; // px value, range 6–18
  dateStartField: string;
  dateEndField: string;
  colorBy: string;
  defaultView: string;
}

/** Default field mappings for the Kanban view */
export interface KanbanDefaults {
  plannerGroupBy: string;
  swimlaneBy: string;
  colorBy: string;
  dateStartField: string;
  dateEndField: string;
  columnWidth: number;
  borderStyle: string;
  badgePlacement: string;
  hideEmptyColumns: boolean;
  freezeHeaders: string;
  /** Whether to show the property name label inside generic badge chips */
  showPropertyLabels: boolean;
}

/** Default field mappings for the Timeline view */
export interface TimelineDefaults {
  dateStartField: string;
  dateEndField: string;
  sectionsBy: string;
  plannerGroupBy: string;
  colorBy: string;
  /**
   * Frontmatter property that stores predecessor (blocker) wikilinks.
   * Defaults to 'blocked_by' when empty.
   * Set to a custom property name to use a different field.
   */
  dependenciesField: string;
  /**
   * Format for the date label displayed on gantt bars.
   * 'range'  — ISO 8601 range  "2026-02-09--2026-02-14"  (default)
   * 'start'  — start date only "2026-02-09"
   * 'end'    — end date only   "2026-02-14"
   */
  dateLabelFormat: string;
}

/** Default field mappings for the Gantt view */
export interface GanttDefaults {
  /** Frontmatter property used as bar start date. */
  dateStartField: string;
  /** Frontmatter property used as bar end date. */
  dateEndField: string;
  /** Frontmatter property for task dependencies (wiki-links). */
  dependenciesField: string;
  /** Property whose values determine bar color. */
  colorBy: string;
  /** Numeric property for completion percentage (0–100). */
  progressField: string;
  /** Show the progress bar overlay on tasks. */
  showProgress: boolean;
  /** Default zoom level: Quarter day | Half day | Day | Week | Month | Year. */
  viewMode: string;
  /** Bar height in pixels (16–60). */
  barHeight: number;
  /** Show Obsidian hover-preview on bar click instead of opening the note. */
  showObsidianPreview: boolean;
  /** Show the internal Frappe Gantt popup on hover/click. */
  showInternalPopup: boolean;
}

/**
 * Planner Plugin Settings
 * Stored at: vault/.obsidian/plugins/planner/data.json
 * Dates in YAML frontmatter use ISO 8601 (e.g. 2026-02-25T12:53:27+07:00).
 */
export interface PlannerSettings {
  // Per-view field defaults (used as fallback when not set in the .base file)
  calendarDefaults: CalendarDefaults;
  kanbanDefaults: KanbanDefaults;
  timelineDefaults: TimelineDefaults;
  ganttDefaults: GanttDefaults;

  /**
   * Per-value style map: { fieldName: { value: { color? } } }
   * fieldName matches the Bases property key (e.g. "note.status").
   * Falls back to stringToColor when not specified.
   * For icons, embed emojis directly in your property values.
   */
  valueStyles: Record<string, Record<string, ValueStyle>>;
}

/**
 * Days of the week for week start setting
 */
export type WeekDay = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

/**
 * Default settings — also serves as documentation for data.json structure.
 */
export const DEFAULT_SETTINGS: PlannerSettings = {
  calendarDefaults: {
    weekStartsOn: 'monday',
    fontSize: 10,
    dateStartField: '',
    dateEndField: '',
    colorBy: '',
    defaultView: 'dayGridMonth',
  },

  kanbanDefaults: {
    plannerGroupBy: 'note.status',
    swimlaneBy: '',
    colorBy: '',
    dateStartField: '',
    dateEndField: '',
    columnWidth: 280,
    borderStyle: 'left-accent',
    badgePlacement: 'properties-section',
    hideEmptyColumns: false,
    freezeHeaders: 'none',
    showPropertyLabels: true,
  },

  timelineDefaults: {
    dateStartField: '',
    dateEndField: '',
    sectionsBy: '',
    plannerGroupBy: '',
    colorBy: '',
    dependenciesField: '',
    dateLabelFormat: 'range',
  },

  ganttDefaults: {
    dateStartField: '',
    dateEndField: '',
    dependenciesField: '',
    colorBy: '',
    progressField: '',
    showProgress: false,
    viewMode: 'Day',
    barHeight: 30,
    showObsidianPreview: false,
    showInternalPopup: true,
  },

  valueStyles: {
    'note.status': {
      'Backlog': { color: '#6b7280' },  // grey   — gathering/unrefined
      'To Do': { color: '#268bd2' },  // blue   — ready to pick up
      'In Progress': { color: '#b58900' },  // amber  — actively being worked
      'In Review': { color: '#7c3aed' },  // purple — under review
      'Blocked': { color: '#dc322f' },  // red    — blocked
      'Done': { color: '#16a34a' },  // green  — completed
      'Cancelled': { color: '#6b7280' },  // slate  — cancelled
      'Archived': { color: '#9ca3af' },  // muted  — archived
    },
    'note.priority': {
      'High': { color: '#dc322f' },  // red   — urgent
      'Medium': { color: '#b58900' },  // amber — normal
      'Low': { color: '#6b7280' },  // grey  — low urgency
    },
  },
};
