/**
 * MarkwhenAdapter - Transforms Obsidian Bases entries to Markwhen format
 *
 * This adapter converts frontmatter data from BasesEntry objects into the
 * JSON format expected by the Markwhen Timeline component, enabling
 * bidirectional sync between Obsidian notes and the Timeline visualization.
 */

import { BasesEntry, BasesPropertyId, App } from 'obsidian';
import {
  Event,
  EventGroup,
  ParseResult,
  RangeType,
  TimelineEvent,
  TimelineGroupBy,
  TimelineSectionsBy,
  TimelineColorBy,
  PathMapping,
  EventPath,
  Recurrence,
  DependencyArrow,
} from '../types/markwhen';
import { isOngoing } from '../utils/dateUtils';
import type { PlannerSettings } from '../types/settings';
import type { PlannerItem, DayOfWeek } from '../types/item';

/**
 * Safely convert any value to a string, handling objects properly
 * Avoids [object Object] output for complex types
 */
function safeToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object') {
    // Try toString first for objects that implement it meaningfully
    const objStr = (value as { toString(): string }).toString();
    if (objStr && objStr !== '[object Object]') return objStr;
    // Fall back to JSON for plain objects
    return JSON.stringify(value);
  }
  // For any remaining types (symbol, bigint, function), convert via String
  return String(value as string | number | boolean | bigint);
}

/**
 * Options for the adapter
 */
export interface AdapterOptions {
  groupBy: TimelineGroupBy;
  sectionsBy: TimelineSectionsBy;
  colorBy: TimelineColorBy;
  dateStartField: string;
  dateEndField: string;
  titleField: string;
  /**
   * Frontmatter property that carries predecessor wikilink(s).
   * Empty string or 'blocked_by' both resolve to the default 'blocked_by' field.
   */
  dependenciesField: string;
  /**
   * Format of the date label rendered on each gantt bar.
   * 'range'  — ISO 8601 interval  "2026-02-09--2026-02-14"  (default)
   * 'start'  — start date only    "2026-02-09"
   * 'end'    — end date only      "2026-02-14"
   */
  dateLabelFormat?: 'start' | 'end' | 'range';
}

/**
 * Result of adapting entries to Markwhen format
 */
export interface AdaptedResult {
  parseResult: ParseResult;
  pathMappings: PathMapping[];
  colorMap: Record<string, Record<string, string>>;
  /** Dependency arrows to send to the gantt overlay */
  dependencyArrows: DependencyArrow[];
}

/**
 * Solarized Accent Colors (in RGB format for Timeline)
 * Used for fields without predefined colors in settings
 */
const SOLARIZED_ACCENT_COLORS = [
  '181, 137, 0',   // yellow
  '203, 75, 22',   // orange
  '220, 50, 47',   // red
  '211, 54, 130',  // magenta
  '108, 113, 196', // violet
  '38, 139, 210',  // blue
  '42, 161, 152',  // cyan
  '133, 153, 0',   // green
];

/**
 * Adapter class for converting BasesEntry to Markwhen format
 */
export class MarkwhenAdapter {
  private settings: PlannerSettings;
  private app: App;
  private pathMappings: PathMapping[] = [];
  /** Set for the duration of an adapt() call; controls gantt bar date label format. */
  private dateLabelFormat: 'start' | 'end' | 'range' = 'range';

  constructor(settings: PlannerSettings, app: App) {
    this.settings = settings;
    this.app = app;
  }

  /**
   * Convert an array of BasesEntry objects to Markwhen ParseResult format
   */
  adapt(entries: BasesEntry[], options: AdapterOptions): AdaptedResult {
    this.pathMappings = [];
    this.dateLabelFormat = options.dateLabelFormat ?? 'range';

    // Convert entries to timeline events
    const timelineEvents = this.entriesToTimelineEvents(entries, options);

    // Build event hierarchy (sections and/or groups)
    const rootGroup = this.buildEventHierarchy(timelineEvents, options);

    // Build the ParseResult structure
    const parseResult = this.buildParseResult(rootGroup);

    // Build color map based on colorBy option
    const colorMap = this.buildColorMap(entries, options.colorBy);

    // Build dependency arrows (requires pathMappings to be populated by buildEventHierarchy)
    const dependencyArrows = this.buildDependencyArrows(timelineEvents, options);

    return {
      parseResult,
      pathMappings: this.pathMappings,
      colorMap,
      dependencyArrows,
    };
  }

  /**
   * Convert BasesEntry array to TimelineEvent array
   */
  private entriesToTimelineEvents(
    entries: BasesEntry[],
    options: AdapterOptions
  ): TimelineEvent[] {
    const events: TimelineEvent[] = [];

    for (const entry of entries) {
      // Create single event (with recurrence data if applicable)
      const event = this.entryToTimelineEvent(entry, options);
      if (event) {
        events.push(event);
      }
    }

    // Sort by start date
    events.sort((a, b) => {
      const dateA = new Date(a.dateRangeIso.fromDateTimeIso).getTime();
      const dateB = new Date(b.dateRangeIso.fromDateTimeIso).getTime();
      return dateA - dateB;
    });

    return events;
  }

  /**
   * Get frontmatter from entry using Obsidian's metadata cache
   */
  private getFrontmatter(entry: BasesEntry): Record<string, unknown> | null {
    try {
      const cache = this.app.metadataCache.getCache(entry.file.path);
      return cache?.frontmatter || null;
    } catch {
      return null;
    }
  }

  /**
   * Extract recurrence data from a BasesEntry
   */
  private extractRecurrenceData(entry: BasesEntry, options: AdapterOptions): Partial<PlannerItem> {
    const fm = this.getFrontmatter(entry) || {};
    const startFieldName = options.dateStartField.replace(/^(note|file|formula)\./, '');
    const endFieldName = options.dateEndField.replace(/^(note|file|formula)\./, '');

    let dateStart = fm[startFieldName];
    let dateEnd = fm[endFieldName];

    // Fall back to Bases getValue
    if (!dateStart) {
      const basesValue = entry.getValue(options.dateStartField as BasesPropertyId);
      if (basesValue !== undefined && basesValue !== null) {
        dateStart = this.parseDate(basesValue)?.toISOString();
      }
    }
    if (!dateEnd) {
      const basesValue = entry.getValue(options.dateEndField as BasesPropertyId);
      if (basesValue !== undefined && basesValue !== null) {
        dateEnd = this.parseDate(basesValue)?.toISOString();
      }
    }

    // Extract recurrence fields
    const repeatFrequency = fm.repeat_frequency as string | undefined;
    const repeatInterval = fm.repeat_interval as number | undefined;
    const repeatUntil = fm.repeat_until as string | undefined;
    const repeatCount = fm.repeat_count as number | undefined;
    const repeatByday = fm.repeat_byday as DayOfWeek[] | undefined;
    const repeatBymonth = fm.repeat_bymonth as number[] | undefined;
    const repeatBymonthday = fm.repeat_bymonthday as number[] | undefined;
    const repeatBysetpos = fm.repeat_bysetpos as number | undefined;
    const repeatCompletedDates = fm.repeat_completed_dates as string[] | undefined;

    // Validate repeat_frequency
    const validFrequencies = ['daily', 'weekly', 'monthly', 'yearly'];
    const validatedFrequency = typeof repeatFrequency === 'string' && validFrequencies.includes(repeatFrequency)
      ? repeatFrequency as PlannerItem['repeat_frequency']
      : undefined;

    // Validate bysetpos
    const validatedBysetpos = typeof repeatBysetpos === 'number' && repeatBysetpos !== 0 &&
      repeatBysetpos >= -366 && repeatBysetpos <= 366
      ? repeatBysetpos
      : undefined;

    // Resolve dates through parseDate() to handle "ongoing" keyword and other formats
    const resolvedStart = dateStart ? this.parseDate(dateStart)?.toISOString() : undefined;
    const resolvedEnd = dateEnd ? this.parseDate(dateEnd)?.toISOString() : undefined;

    return {
      path: entry.file.path,
      date_start_scheduled: resolvedStart,
      date_end_scheduled: resolvedEnd,
      repeat_frequency: validatedFrequency,
      repeat_interval: typeof repeatInterval === 'number' ? repeatInterval : undefined,
      repeat_until: repeatUntil,
      repeat_count: typeof repeatCount === 'number' ? repeatCount : undefined,
      repeat_byday: Array.isArray(repeatByday) && repeatByday.length > 0 ? repeatByday : undefined,
      repeat_bymonth: Array.isArray(repeatBymonth) && repeatBymonth.length > 0 ? repeatBymonth : undefined,
      repeat_bymonthday: Array.isArray(repeatBymonthday) && repeatBymonthday.length > 0 ? repeatBymonthday : undefined,
      repeat_bysetpos: validatedBysetpos,
      repeat_completed_dates: Array.isArray(repeatCompletedDates) ? repeatCompletedDates : undefined,
    };
  }

  /**
   * Build a Markwhen Recurrence object from item data
   * This format is used by Markwhen's timeline to display multiple occurrences on a single row
   */
  private buildRecurrence(item: Partial<PlannerItem>): Recurrence | undefined {
    if (!item.repeat_frequency) {
      return undefined;
    }

    // Map frequency to RRule.Frequency numeric values
    const freqMap: Record<string, number> = {
      yearly: 0,   // RRule.YEARLY
      monthly: 1,  // RRule.MONTHLY
      weekly: 2,   // RRule.WEEKLY
      daily: 3,    // RRule.DAILY
    };

    const recurrence: Recurrence = {
      freq: freqMap[item.repeat_frequency],
    };

    if (item.repeat_interval && item.repeat_interval > 1) {
      recurrence.interval = item.repeat_interval;
    }

    if (item.repeat_count) {
      recurrence.count = item.repeat_count;
    }

    if (item.repeat_until) {
      recurrence.until = item.repeat_until;
    }

    if (item.repeat_byday?.length) {
      recurrence.byweekday = item.repeat_byday;
    }

    if (item.repeat_bymonth?.length) {
      recurrence.bymonth = item.repeat_bymonth;
    }

    if (item.repeat_bymonthday?.length) {
      recurrence.bymonthday = item.repeat_bymonthday;
    }

    if (item.repeat_bysetpos !== undefined && item.repeat_bysetpos !== 0) {
      recurrence.bysetpos = item.repeat_bysetpos;
    }

    // Set dtstart from the item's start date
    if (item.date_start_scheduled) {
      recurrence.dtstart = item.date_start_scheduled;
    }

    return recurrence;
  }

  /**
   * Convert a single BasesEntry to a TimelineEvent
   */
  private entryToTimelineEvent(
    entry: BasesEntry,
    options: AdapterOptions
  ): TimelineEvent | null {
    const filePath = entry.file.path;

    // For date fields, prefer raw frontmatter strings over entry.getValue().
    // Obsidian Bases converts datetime strings with timezone offsets to UTC Date
    // objects before we see them (e.g. "2026-02-15T00:00:00+07:00" becomes a
    // Date at 2026-02-14T17:00:00Z), which shifts the calendar date by -1 day.
    // Reading the raw frontmatter string preserves the original date for parseDate().
    const fm = this.getFrontmatter(entry) || {};
    const startFieldName = options.dateStartField.replace(/^(note|file|formula)\./, '');
    const endFieldName = options.dateEndField.replace(/^(note|file|formula)\./, '');
    // For note.* and formula.* fields, prefer entry.getValue() which handles Bases resolution.
    // For other fields, try raw frontmatter first with Bases fallback.
    const useBasesForStart = options.dateStartField.startsWith('note.') || options.dateStartField.startsWith('formula.');
    const useBasesForEnd = options.dateEndField.startsWith('note.') || options.dateEndField.startsWith('formula.');
    const startRaw = useBasesForStart
      ? entry.getValue(options.dateStartField as BasesPropertyId)
      : (fm[startFieldName] ?? entry.getValue(options.dateStartField as BasesPropertyId));
    const endRaw = useBasesForEnd
      ? entry.getValue(options.dateEndField as BasesPropertyId)
      : (fm[endFieldName] ?? entry.getValue(options.dateEndField as BasesPropertyId));
    const titleValue = entry.getValue(options.titleField as BasesPropertyId);

    // Parse start date - skip if no valid date
    const startDate = this.parseDate(startRaw);
    if (!startDate) {
      return null;
    }

    // Parse end date - default to start date if not set
    const endDate = this.parseDate(endRaw) || startDate;

    // Get title
    const title = titleValue?.toString() || entry.file.basename;

    // Get tags from note
    const tagsValue = entry.getValue('note.tags');
    const noteTags: string[] = Array.isArray(tagsValue)
      ? tagsValue.map(t => String(t).replace(/^#/, ''))
      : [];

    // Get progress
    const progressValue = entry.getValue('note.progress');
    const percent = typeof progressValue === 'number' ? progressValue : undefined;

    // Get status for completion check
    const statusValue = entry.getValue('note.status');
    const completed = this.isCompletedStatus(String(statusValue || ''));

    // Get section and group values
    const sectionValue = this.getSectionValue(entry, options.sectionsBy);
    const groupValue = this.getGroupValue(entry, options.groupBy);

    // Build properties object
    const properties: Record<string, unknown> = {};
    const calendarValue = entry.getValue('note.calendar');
    if (calendarValue) {
      properties.calendar = Array.isArray(calendarValue) ? calendarValue[0] : calendarValue;
    }
    const priorityValue = entry.getValue('note.priority');
    if (priorityValue) {
      properties.priority = priorityValue;
    }
    const statusVal = entry.getValue('note.status');
    if (statusVal) {
      properties.status = statusVal;
    }

    // Build recurrence data if this is a recurring event
    const itemData = this.extractRecurrenceData(entry, options);
    const recurrence = this.buildRecurrence(itemData);

    // Extract blockedBy (predecessor) wikilinks from the configured dependencies field
    const blockedBy = this.extractBlockedBy(entry, options);

    // Add color tag based on colorBy setting
    // The Timeline uses tags[0] to look up colors in the colorMap
    const colorTag = this.getColorTag(entry, options.colorBy);
    const tags = colorTag ? [colorTag, ...noteTags] : noteTags;

    return {
      id: filePath,
      filePath,
      title,
      dateRangeIso: {
        fromDateTimeIso: startDate.toISOString(),
        toDateTimeIso: endDate.toISOString(),
      },
      tags,
      percent,
      completed,
      properties,
      sectionValue,
      groupValue,
      recurrence,
      blockedBy,
    };
  }

  /**
   * Parse a date value from frontmatter
   * Handles Date instances, strings, numbers, Bases date objects,
   * and the special "ongoing" keyword (resolves to current time)
   */
  private parseDate(value: unknown): Date | null {
    if (!value) return null;

    // Handle "ongoing" keyword - resolve to current time
    if (isOngoing(value)) {
      return new Date();
    }

    if (value instanceof Date) {
      // Obsidian's YAML parser (js-yaml) already correctly converts frontmatter datetimes
      // to UTC Date objects — preserve the exact UTC instant so Markwhen renders the
      // correct local time in the user's timezone.
      return value;
    }

    if (typeof value === 'string') {
      return this.parseDateFromString(value);
    }

    if (typeof value === 'number') {
      return new Date(value);
    }

    // Handle Bases date objects that have toString() returning ISO strings.
    if (typeof value === 'object' && value !== null) {
      const str = safeToString(value);
      if (str && str !== '[object Object]') {
        return this.parseDateFromString(str);
      }
    }

    return null;
  }

  /**
   * Parse a date from a string, preserving the correct UTC instant.
   *
   * Strings with explicit offset:  "2026-02-15T00:00:00+07:00" → 2026-02-14T17:00:00Z (correct UTC)
   * Strings without offset:        "2026-02-28T08:00:00"       → local time interpretation (browser/Node)
   * Plain date strings:            "2026-02-15"                → 2026-02-15T00:00:00Z (UTC midnight)
   */
  private parseDateFromString(value: string): Date | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const date = new Date(trimmed);
    return isNaN(date.getTime()) ? null : date;
  }

  /**
   * Extract the local YYYY-MM-DD string from a UTC ISO timestamp.
   * Uses local date components so that e.g. "2026-02-14T17:00:00Z" (which is
   * 2026-02-15 00:00 in +07:00) renders the label as "2026-02-15".
   */
  private localDateStr(isoUtc: string): string {
    const d = new Date(isoUtc);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  /**
   * Check if a status is considered completed
   */
  private isCompletedStatus(status: string): boolean {
    const completedKeywords = ['done', 'completed', 'complete', 'finished', 'closed', 'resolved'];
    return completedKeywords.includes(status.toLowerCase());
  }

  /**
   * Get the value to section by for an entry
   */
  private getSectionValue(entry: BasesEntry, sectionsBy: TimelineSectionsBy): string | undefined {
    if (sectionsBy === 'none' || !sectionsBy) return undefined;

    // Handle folder specially since it's not a frontmatter property
    if (sectionsBy === 'folder' || sectionsBy === 'note.folder') {
      const folderPath = entry.file.parent?.path || '/';
      return folderPath === '/' ? 'Root' : entry.file.parent?.name || 'Root';
    }

    // Map legacy short names to full property IDs for backward compatibility
    const legacyFieldMap: Record<string, string> = {
      calendar: 'note.calendar',
      status: 'note.status',
      priority: 'note.priority',
      parent: 'note.parent',
      people: 'note.people',
      tags: 'note.tags',
      context: 'note.context',
      location: 'note.location',
      color: 'note.color',
    };

    // Use the mapped field if it's a legacy name, otherwise use the value directly
    const field = legacyFieldMap[sectionsBy] || sectionsBy;

    const value = entry.getValue(field as BasesPropertyId);
    if (!value) return 'Unsectioned';

    if (Array.isArray(value)) {
      const firstVal: unknown = value[0];
      return firstVal ? safeToString(firstVal).replace(/^#/, '') : 'Unsectioned';
    }

    return safeToString(value);
  }

  /**
   * Get the value to group by for an entry
   */
  private getGroupValue(entry: BasesEntry, groupBy: TimelineGroupBy): string | undefined {
    if (groupBy === 'none' || !groupBy) return undefined;

    // Handle folder specially since it's not a frontmatter property
    if (groupBy === 'folder' || groupBy === 'note.folder') {
      const folderPath = entry.file.parent?.path || '/';
      return folderPath === '/' ? 'Root' : entry.file.parent?.name || 'Root';
    }

    // Map legacy short names to full property IDs for backward compatibility
    const legacyFieldMap: Record<string, string> = {
      calendar: 'note.calendar',
      status: 'note.status',
      priority: 'note.priority',
      parent: 'note.parent',
      people: 'note.people',
      tags: 'note.tags',
      context: 'note.context',
      location: 'note.location',
      color: 'note.color',
    };

    // Use the mapped field if it's a legacy name, otherwise use the value directly
    const field = legacyFieldMap[groupBy] || groupBy;

    const value = entry.getValue(field as BasesPropertyId);
    if (!value) return 'Ungrouped';

    if (Array.isArray(value)) {
      const firstVal: unknown = value[0];
      return firstVal ? safeToString(firstVal).replace(/^#/, '') : 'Ungrouped';
    }

    return safeToString(value);
  }

  /**
   * Get the tag to use for coloring based on colorBy setting
   * The Timeline looks for tags[0] in the colorMap to determine event color
   */
  private getColorTag(entry: BasesEntry, colorBy: TimelineColorBy): string | undefined {
    if (colorBy === 'none') return undefined;

    // Special handling for folder
    if (colorBy === 'note.folder') {
      const folderPath = entry.file.parent?.path || '/';
      return folderPath === '/' ? 'Root' : entry.file.parent?.name || 'Root';
    }

    const value = entry.getValue(colorBy as BasesPropertyId);
    if (!value) return undefined;

    if (Array.isArray(value)) {
      const firstVal: unknown = value[0];
      return firstVal ? safeToString(firstVal).replace(/^#/, '') : undefined;
    }

    return safeToString(value);
  }

  /**
   * Build event hierarchy with sections and/or groups
   */
  private buildEventHierarchy(
    events: TimelineEvent[],
    options: AdapterOptions
  ): EventGroup {
    const rootGroup: EventGroup = {
      textRanges: {
        whole: { from: 0, to: 0, type: RangeType.Section },
        definition: { from: 0, to: 0, type: RangeType.SectionDefinition },
      },
      properties: {},
      propOrder: [],
      tags: [],
      title: 'Timeline',
      children: [],
    };

    if (options.sectionsBy === 'none') {
      // No sections - just build groups
      this.buildGroupsIntoContainer(rootGroup, events, options.groupBy, []);
    } else {
      // Build sections, then groups within each section
      const sections = new Map<string, TimelineEvent[]>();

      for (const event of events) {
        const sectionValue = event.sectionValue || 'Unsectioned';
        if (!sections.has(sectionValue)) {
          sections.set(sectionValue, []);
        }
        sections.get(sectionValue)!.push(event);
      }

      // Sort sections alphabetically
      const sortedSectionNames = Array.from(sections.keys()).sort();

      let sectionIndex = 0;
      for (const sectionName of sortedSectionNames) {
        const sectionEvents = sections.get(sectionName)!;
        const section = this.createSection(sectionName, sectionEvents, options.groupBy, [sectionIndex]);
        rootGroup.children.push(section);
        sectionIndex++;
      }
    }

    return rootGroup;
  }

  /**
   * Build groups into a container (root or section)
   */
  private buildGroupsIntoContainer(
    container: EventGroup,
    events: TimelineEvent[],
    groupBy: TimelineGroupBy,
    pathPrefix: number[]
  ): void {
    if (groupBy === 'none') {
      // No grouping - add all events directly
      let eventIndex = 0;
      for (const event of events) {
        const mwEvent = this.timelineEventToMarkwhenEvent(event);
        container.children.push(mwEvent);
        this.pathMappings.push({
          path: [...pathPrefix, eventIndex],
          filePath: event.filePath,
        });
        eventIndex++;
      }
    } else {
      // Group events by the specified field
      const groups = new Map<string, TimelineEvent[]>();

      for (const event of events) {
        const groupValue = event.groupValue || 'Ungrouped';
        if (!groups.has(groupValue)) {
          groups.set(groupValue, []);
        }
        groups.get(groupValue)!.push(event);
      }

      // Sort groups alphabetically
      const sortedGroupNames = Array.from(groups.keys()).sort();

      let groupIndex = 0;
      for (const groupName of sortedGroupNames) {
        const groupEvents = groups.get(groupName)!;
        const eventGroup = this.createEventGroup(groupName, groupEvents, [...pathPrefix, groupIndex]);
        container.children.push(eventGroup);
        groupIndex++;
      }
    }
  }

  /**
   * Create a Section from a section name and events
   * Sections can contain groups
   */
  private createSection(
    name: string,
    events: TimelineEvent[],
    groupBy: TimelineGroupBy,
    pathPrefix: number[]
  ): EventGroup {
    // Add the section name as a tag so the section header gets colored
    const tags = name !== 'Unsectioned' ? [name] : [];

    const section: EventGroup = {
      textRanges: {
        whole: { from: 0, to: 0, type: RangeType.Section },
        definition: { from: 0, to: 0, type: RangeType.SectionDefinition },
      },
      properties: {},
      propOrder: [],
      tags,
      title: name,
      startExpanded: true,
      style: 'section', // Mark as section (spans full timeline width)
      children: [],
    };

    // Build groups within this section
    this.buildGroupsIntoContainer(section, events, groupBy, pathPrefix);

    return section;
  }

  /**
   * Create an EventGroup from a group name and events
   */
  private createEventGroup(
    name: string,
    events: TimelineEvent[],
    pathPrefix: number[]
  ): EventGroup {
    // Add the group name as a tag so the group header gets colored
    const tags = name !== 'Ungrouped' ? [name] : [];

    const group: EventGroup = {
      textRanges: {
        whole: { from: 0, to: 0, type: RangeType.Section },
        definition: { from: 0, to: 0, type: RangeType.SectionDefinition },
      },
      properties: {},
      propOrder: [],
      tags,
      title: name,
      startExpanded: true,
      style: 'group', // Mark as group (contained within timeline)
      children: [],
    };

    let eventIndex = 0;
    for (const event of events) {
      const mwEvent = this.timelineEventToMarkwhenEvent(event);
      group.children.push(mwEvent);
      this.pathMappings.push({
        path: [...pathPrefix, eventIndex],
        filePath: event.filePath,
      });
      eventIndex++;
    }

    return group;
  }

  /**
   * Convert a TimelineEvent to a Markwhen Event
   */
  private timelineEventToMarkwhenEvent(event: TimelineEvent): Event {
    // Use local date components for label strings so that datetime-with-offset values
    // (e.g. 2026-02-14T17:00Z which is 2026-02-15 00:00 in +07:00) show the correct
    // local date rather than the UTC date.
    const startDate = this.localDateStr(event.dateRangeIso.fromDateTimeIso);
    const endDate = this.localDateStr(event.dateRangeIso.toDateTimeIso);

    // Build the date label based on the configured format:
    //   'range' → ISO 8601 interval  "2026-02-09--2026-02-14"
    //             (collapses to single date when start === end)
    //   'start' → start date only    "2026-02-09"
    //   'end'   → end date only      "2026-02-14"
    let datePart: string;
    if (this.dateLabelFormat === 'start') {
      datePart = startDate;
    } else if (this.dateLabelFormat === 'end') {
      datePart = endDate;
    } else {
      // 'range' — show full interval; collapse when start equals end
      datePart = startDate === endDate ? startDate : `${startDate}--${endDate}`;
    }

    // Create a minimal Event object that Markwhen Timeline can render
    const mwEvent: Event = {
      firstLine: {
        full: `${datePart}: ${event.title}`,
        datePart,
        rest: event.title,
        restTrimmed: event.title,
      },
      textRanges: {
        whole: { from: 0, to: 0, type: RangeType.Event },
        datePart: { from: 0, to: datePart.length, type: RangeType.DateRange },
        definition: { from: 0, to: 0, type: RangeType.EventDefinition },
      },
      properties: event.properties,
      propOrder: Object.keys(event.properties),
      dateRangeIso: event.dateRangeIso,
      tags: event.tags,
      supplemental: [],
      matchedListItems: [],
      isRelative: false,
      id: event.id,
      percent: event.percent,
      completed: event.completed,
      recurrence: event.recurrence,
    };

    return mwEvent;
  }

  /**
   * Build the full ParseResult structure
   */
  private buildParseResult(rootGroup: EventGroup): ParseResult {
    return {
      ranges: [],
      foldables: {},
      events: rootGroup,
      header: {},
      ids: {},
      parseMessages: [],
      documentMessages: [],
      parser: {
        version: '0.16.0',
        incremental: false,
      },
    };
  }

  /**
   * Build color map for events based on colorBy setting
   * Returns a nested map: { "default": { "tagName": "r, g, b" } }
   */
  private buildColorMap(
    entries: BasesEntry[],
    colorBy: TimelineColorBy
  ): Record<string, Record<string, string>> {
    const innerMap: Record<string, string> = {};

    if (colorBy === 'none') {
      return { default: innerMap };
    }

    const fieldName = colorBy.replace(/^(note|file|formula)\./, '');

    // Fields with colors defined via deterministic stringToColor hash
    if (fieldName === 'color') {
      // For color field: use actual hex values from notes
      for (const entry of entries) {
        const colorValue = entry.getValue('note.color');
        if (colorValue) {
          const colorStr = colorValue.toString();
          // The color value itself is the key, and we convert it to RGB
          innerMap[colorStr] = this.hexToRgb(colorStr);
        }
      }
    } else {
      // For other fields (parent, people, folder, tags, context, location, and custom properties)
      // Collect unique values and assign Solarized accent colors
      const uniqueValues = new Set<string>();

      for (const entry of entries) {
        let value: unknown;

        // Handle folder specially (both legacy 'folder' and new 'note.folder')
        if (fieldName === 'folder' || colorBy === 'note.folder') {
          const folderPath = entry.file.parent?.path || '/';
          value = folderPath === '/' ? 'Root' : entry.file.parent?.name || 'Root';
        } else {
          value = entry.getValue(colorBy as BasesPropertyId);
        }

        if (value) {
          if (Array.isArray(value)) {
            const first: unknown = value[0];
            if (first) {
              const firstVal = safeToString(first).replace(/^#/, '');
              if (firstVal) uniqueValues.add(firstVal);
            }
          } else {
            uniqueValues.add(safeToString(value));
          }
        }
      }

      // Assign colors: check valueStyles first, then Solarized accent colors as fallback
      const sortedValues = Array.from(uniqueValues).sort();
      let solarizedIndex = 0;
      sortedValues.forEach((value) => {
        const hexColor = this.settings.valueStyles[colorBy]?.[value]?.color;
        if (hexColor) {
          innerMap[value] = this.hexToRgb(hexColor);
        } else {
          innerMap[value] = SOLARIZED_ACCENT_COLORS[solarizedIndex % SOLARIZED_ACCENT_COLORS.length];
          solarizedIndex++;
        }
      });
    }

    // Timeline expects colorMap["default"][tagName] = "r, g, b"
    return { default: innerMap };
  }

  /**
   * Convert hex color to RGB string format expected by Timeline
   * e.g., "#ff0000" -> "255, 0, 0"
   */
  private hexToRgb(hex: string): string {
    // Remove # if present
    hex = hex.replace('#', '');

    // Handle shorthand hex (e.g., #f00)
    const isShortHex = hex.length === 3;

    const r = parseInt(
      isShortHex ? hex.slice(0, 1).repeat(2) : hex.slice(0, 2),
      16
    );
    const g = parseInt(
      isShortHex ? hex.slice(1, 2).repeat(2) : hex.slice(2, 4),
      16
    );
    const b = parseInt(
      isShortHex ? hex.slice(2, 3).repeat(2) : hex.slice(4, 6),
      16
    );

    // Return RGB string in format "r, g, b"
    return `${r}, ${g}, ${b}`;
  }

  /**
   * Extract predecessor (blocked-by) file paths from a BasesEntry.
   *
   * Reads the configured dependencies field from frontmatter. Values may be:
   *   - Obsidian wikilinks: `[[Note Title]]`, `[[Folder/Note]]`, `[[Note|Alias]]`
   *   - Plain strings that match a note's basename
   *
   * Returns an array of resolved vault-relative file paths.
   */
  private extractBlockedBy(entry: BasesEntry, options: AdapterOptions): string[] {
    // Resolve the field name: strip note. prefix, fall back to 'blocked_by'
    const rawField = options.dependenciesField || 'blocked_by';
    const fieldName = rawField.replace(/^(note|file|formula)\./, '') || 'blocked_by';

    const fm = this.getFrontmatter(entry) || {};
    const rawValue = fm[fieldName];
    if (!rawValue) return [];

    // Normalize to array
    const rawList: unknown[] = Array.isArray(rawValue) ? rawValue : [rawValue];
    const resolvedPaths: string[] = [];

    for (const item of rawList) {
      if (!item) continue;
      let linkText = safeToString(item);

      // Strip wikilink syntax: [[Link|Alias]] → Link
      linkText = linkText.replace(/^\[\[/, '').replace(/\]\]$/, '');
      // Remove pipe alias
      const pipeIdx = linkText.indexOf('|');
      if (pipeIdx !== -1) linkText = linkText.substring(0, pipeIdx);
      // Remove heading anchor
      const hashIdx = linkText.indexOf('#');
      if (hashIdx !== -1) linkText = linkText.substring(0, hashIdx);
      linkText = linkText.trim();

      if (!linkText) continue;

      // Resolve using Obsidian's metadata cache (handles paths, basenames, folders)
      const resolved = this.app.metadataCache.getFirstLinkpathDest(linkText, entry.file.path);
      if (resolved) {
        resolvedPaths.push(resolved.path);
      }
    }

    return resolvedPaths;
  }

  /**
   * Build dependency arrows from the processed timeline events.
   *
   * Must be called AFTER buildEventHierarchy() has populated this.pathMappings,
   * because arrows reference path keys from that mapping.
   */
  private buildDependencyArrows(
    timelineEvents: TimelineEvent[],
    _options: AdapterOptions
  ): DependencyArrow[] {
    const arrows: DependencyArrow[] = [];

    // Build lookup maps from filePath → path key and filePath → event
    const filePathToPathKey = new Map<string, string>();
    const filePathToEvent = new Map<string, TimelineEvent>();

    for (const event of timelineEvents) {
      filePathToEvent.set(event.filePath, event);
    }
    for (const mapping of this.pathMappings) {
      filePathToPathKey.set(mapping.filePath, mapping.path.join(','));
    }

    // For each event that lists predecessors (blocked_by), create forward arrows
    // Arrow direction: predecessor (blocker) → current event (blocked)
    for (const event of timelineEvents) {
      if (!event.blockedBy?.length) continue;

      const toPathKey = filePathToPathKey.get(event.filePath);
      if (!toPathKey) continue;

      for (const blockerFilePath of event.blockedBy) {
        const fromPathKey = filePathToPathKey.get(blockerFilePath);
        if (!fromPathKey) continue; // blocker not in current Base view — skip silently

        const blockerEvent = filePathToEvent.get(blockerFilePath);
        if (!blockerEvent) continue;

        arrows.push({
          fromPath: fromPathKey,
          toPath: toPathKey,
          fromEndDate: blockerEvent.dateRangeIso.toDateTimeIso,
          toStartDate: event.dateRangeIso.fromDateTimeIso,
        });
      }
    }

    return arrows;
  }

  /**
   * Resolve an event path back to a file path
   */
  resolvePathToFilePath(path: EventPath): string | null {
    const pathKey = path.join(',');
    for (const mapping of this.pathMappings) {
      if (mapping.path.join(',') === pathKey) {
        return mapping.filePath;
      }
    }
    return null;
  }

  /**
   * Get current path mappings
   */
  getPathMappings(): PathMapping[] {
    return [...this.pathMappings];
  }
}
