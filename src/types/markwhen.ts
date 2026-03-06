/**
 * Markwhen types for Timeline View integration
 * These types are defined locally to avoid loading heavy dependencies on mobile
 * Based on @markwhen/parser and @markwhen/view-client
 */

// Define enums locally to avoid importing the full @markwhen/parser package
export enum RangeType {
  Comment = "comment",
  CheckboxItemIndicator = "checkboxItemIndicator",
  listItemIndicator = "listItemIndicator",
  ListItemContents = "listItemContents",
  Tag = "tag",
  tagDefinition = "tagDefinition",
  Title = "title",
  View = "view",
  Viewer = "viewer",
  Description = "description",
  Section = "section",
  DateRange = "dateRange",
  DateRangeColon = "dateRangeColon",
  Event = "event",
  Edit = "edit",
  Editor = "editor",
  Recurrence = "recurrence",
  FrontmatterDelimiter = "frontMatterDelimiter",
  HeaderKey = "headerKey",
  HeaderKeyColon = "headerKeyColon",
  HeaderValue = "headerValue",
  PropertyKey = "propertyKey",
  PropertyKeyColon = "propertyKeyColon",
  PropertyValue = "propertyValue",
  EventDefinition = "eventDefinition",
  SectionDefinition = "sectionDefinition",
  Properties = "properties",
}

export enum BlockType {
  TEXT = "text",
  LIST_ITEM = "listItem",
  CHECKBOX = "checkbox",
  IMAGE = "image",
}

// Define types locally - simplified versions of @markwhen/parser types
export interface DateRangeIso {
  fromDateTimeIso: string;
  toDateTimeIso: string;
}

export interface Range {
  from: number;
  to: number;
  type: RangeType;
  // Added in @markwhen/parser v1.0.x — carries semantic content (tag name, property value, etc.)
  content?: unknown;
}

export interface EventFirstLine {
  full: string;
  datePart?: string; // Optional: may be undefined for relative events
  rest: string;
  restTrimmed: string;
}

/**
 * Recurrence type - matches @markwhen/parser's Recurrence type
 * Based on RRule Options with string dates instead of JS Dates
 */
export interface Recurrence {
  freq?: number;        // RRule.Frequency: YEARLY=0, MONTHLY=1, WEEKLY=2, DAILY=3
  interval?: number;    // Interval between occurrences
  count?: number;       // Number of occurrences
  until?: string;       // ISO date string for end date
  byweekday?: string[]; // Days of week: ['MO', 'TU', 'WE', etc.] - RRule uses byweekday not byday
  bymonth?: number[];   // Months: [1, 2, 3, etc.]
  bymonthday?: number[]; // Days of month: [1, 15, -1, etc.]
  bysetpos?: number;    // Position in set: -1 for last, 1 for first, etc.
  dtstart?: string;     // Start date in ISO format
}

export interface Event {
  firstLine: EventFirstLine;
  textRanges: {
    whole: Range;
    datePart: Range;
    definition: Range;
    recurrence?: Range;
    properties?: Range;
  };
  properties: Record<string, unknown>;
  propOrder: string[];
  dateRangeIso: DateRangeIso;
  tags: string[];
  supplemental: unknown[];
  matchedListItems: unknown[];
  isRelative: boolean;
  // Relative anchor info — added in @markwhen/parser v1.0.x
  fromRelativeTo?: { path: Path; dt: string };
  toRelativeTo?: { path: Path; dt: string };
  id?: string;
  percent?: number;
  completed?: boolean;
  recurrence?: Recurrence;
}

export type GroupStyle = 'section' | 'group';

/**
 * Bounding date range for a group — pre-computed by the parser
 * Mirrors @markwhen/parser's GroupRange (DateRange & { maxFrom })
 */
export interface GroupRange {
  fromDateTimeIso: string;
  toDateTimeIso: string;
  /** Latest fromDateTime among all descendants — useful for sorting */
  maxFrom: string;
}

export interface EventGroup {
  textRanges: {
    whole: Range;
    definition: Range;
    properties?: Range; // Added in @markwhen/parser v1.0.x
  };
  properties: Record<string, unknown>;
  propOrder: string[];
  propRange?: Range; // Added in @markwhen/parser v1.0.x
  tags: string[];
  title: string;
  startExpanded?: boolean;
  style?: GroupStyle;
  range?: GroupRange; // Pre-computed bounding date range — added in @markwhen/parser v1.0.x
  children: (Event | EventGroup)[];
}

export type Eventy = Event | EventGroup;

export interface ParseResult {
  ranges: Range[];
  foldables: Record<string, unknown>;
  events: EventGroup;
  header: Record<string, unknown>;
  ids: Record<string, unknown>;
  parseMessages: unknown[];
  documentMessages: unknown[];
  parser: {
    version: string;
    incremental?: boolean; // Optional — undefined for non-incremental parses
  };
}

// Matches @markwhen/parser DateTimeGranularity — full union as of v1.0.x
export type DateTimeGranularity = 'instant' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';
export type DateFormat = string;
export type Path = number[];

export interface MarkdownBlock {
  type: BlockType;
  value?: unknown;
  raw: string;
}

// Define types from @markwhen/view-client locally
export interface AppState {
  // Official upstream fields (view-client v1.6.0)
  key?: string;
  isDark?: boolean;
  hoveringPath?: number[];
  detailPath?: number[];
  path?: string;
  colorMap: Record<string, Record<string, string>>;
  /**
   * Local extension — NOT in upstream AppState.
   * The Timeline iframe ignores this field via postMessage.
   * Background color is applied instead via CSS injection in the iframe srcdoc.
   * Kept here only so BasesTimelineView.computeState() can store the setting.
   */
  backgroundColor?: string;
}

export interface MarkwhenState {
  rawText?: string;
  parsed: ParseResult;
  /**
   * Upstream type is Sourced<EventGroup> (adds source/originalPath for multi-doc).
   * We use plain EventGroup since we are always single-source.
   */
  transformed?: EventGroup;
}

// Matches @markwhen/view-client DisplayScale — full union as of v1.6.0
export type DisplayScale = 'second' | 'quarterminute' | 'minute' | 'quarterhour' | 'hour' | 'day' | 'month' | 'year' | 'decade';

/**
 * Event path - array of indices representing position in the event tree
 * e.g., [0, 2, 1] = first group → third child → second sub-child
 */
export type EventPath = number[];

/**
 * Message types for LPC (Local Procedure Call) communication
 * These are the messages exchanged between the host (our view) and the Timeline iframe
 */
export interface LpcMessage<T = unknown> {
  type: string;
  request?: boolean;
  response?: boolean;
  id: string;
  params?: T;
}

/**
 * Messages sent FROM Timeline TO Host
 */
export interface EditEventDateRangeMessage {
  path: EventPath;
  range: DateRangeIso;
  scale: DisplayScale;
  preferredInterpolationFormat: DateFormat | undefined;
}

export interface NewEventMessage {
  dateRangeIso: DateRangeIso;
  granularity?: DateTimeGranularity;
  immediate: boolean;
}

export interface SetPathMessage {
  path: EventPath;
}

/**
 * setText message — Timeline requests the host to update source text (e.g. inline rename)
 * Added in view-client — from BaseMessageTypes
 */
export interface SetTextMessage {
  text: string;
  at?: {
    from: number;
    to: number;
  };
}

/**
 * Keystroke payload proxied from the iframe to the host window (view-client v1.6.0+)
 * Allows Obsidian hotkeys to work when keyboard focus is inside the timeline iframe.
 */
export interface KeystrokePayload {
  combo: string;
  key: string;
  code: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
  location: number;
  type: 'keydown' | 'keyup';
}

/**
 * Configuration options for the Timeline View
 *
 * These types accept any property ID string to support custom properties.
 * The 'none' value is special and means no grouping/sectioning/coloring.
 */
export type TimelineGroupBy = string;

export type TimelineSectionsBy = string;

export type TimelineColorBy = string;

export interface TimelineViewConfig {
  plannerGroupBy: TimelineGroupBy;
  sectionsBy: TimelineSectionsBy;
  colorBy: TimelineColorBy;
  dateStartField: string;
  dateEndField: string;
  titleField: string;
}

/**
 * Extended event with file path for reverse lookup
 */
export interface TimelineEvent {
  id: string;           // File path for reverse lookup
  filePath: string;     // Explicit file path
  title: string;
  dateRangeIso: DateRangeIso;
  tags: string[];
  percent?: number;
  completed?: boolean;
  properties: Record<string, unknown>;
  sectionValue?: string; // Value of the sectionsBy field
  groupValue?: string;  // Value of the groupBy field
  recurrence?: Recurrence; // Recurrence data for recurring events
  blockedBy?: string[];  // File paths of events that must complete before this one
}

/**
 * A single dependency arrow between two events in gantt mode.
 * Both paths are the path-key strings (path indices joined with ',')
 * from AdaptedResult.pathMappings — used by the in-iframe SVG overlay
 * to look up row positions via Markwhen's predecessorMap.
 */
export interface DependencyArrow {
  /** path.join(',') of the predecessor (blocker) event */
  fromPath: string;
  /** path.join(',') of the successor (blocked) event */
  toPath: string;
  /** ISO string of the predecessor's end date — for violation detection */
  fromEndDate: string;
  /** ISO string of the successor's start date — for violation detection */
  toStartDate: string;
}

/**
 * Path mapping for resolving event paths back to file paths
 */
export interface PathMapping {
  path: EventPath;
  filePath: string;
}
