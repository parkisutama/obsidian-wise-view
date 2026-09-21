// SPDX-License-Identifier: GPL-3.0-only
// Derived from Planner (https://github.com/SawyerRensel/Planner): src/views/BasesCalendarView.ts
// Copyright (C) 2025 Sawyer Rensel
// Modifications Copyright (C) 2026 Parkis Utama

import { type App } from 'obsidian';
import {
  createNoteFromTemplate,
  detectTemplateEngine,
  ensureFolder,
  noticePlainTemplate,
} from '../../services/templateEngine';
import { openFileInNewTab } from '../../utils/openFile';

/**
 * Daily-note / journal lookup and creation for a clicked calendar date. The daily-note template
 * is processed by Templater or the core Templates plugin (services/templateEngine.ts); this
 * module no longer substitutes any `{{...}}` tokens itself.
 */

/** Type interfaces for Obsidian's undocumented internal plugins API. */
interface DailyNotesPluginOptions {
  format?: string;
  folder?: string;
  template?: string;
}

interface DailyNotesPluginInstance {
  options?: DailyNotesPluginOptions;
}

interface InternalPlugin {
  enabled?: boolean;
  instance?: DailyNotesPluginInstance;
}

interface InternalPluginsManager {
  getPluginById?(id: string): InternalPlugin | undefined;
}

interface AppWithInternals extends App {
  internalPlugins?: InternalPluginsManager;
}

/** Minimal interface for a note that exists in an obsidian-journal journal. */
interface JournalExistingNote {
  path: string;
  date: string;
  journal: string;
}

/** Minimal interface for a journal metadata entry (note may or may not exist). */
interface JournalNoteMetadata {
  date: string;
  journal: string;
}

/** Minimal interface for a single journal from the obsidian-journal plugin. */
interface ObsidianJournalItem {
  type: string; // 'day' | 'week' | 'month' | ...
  name: string;
  get(date: string): (JournalExistingNote | JournalNoteMetadata) | null;
  open(metadata: JournalExistingNote | JournalNoteMetadata, openMode?: string): Promise<void>;
}

/** Minimal interface for the obsidian-journal community plugin public API. */
interface ObsidianJournalPluginApi {
  journals: ObsidianJournalItem[];
  getJournal(name: string): ObsidianJournalItem | undefined;
}

/** Community plugin manager exposed on App (unofficial, undocumented). */
interface CommunityPluginsManager {
  getPlugin(id: string): unknown;
}

interface AppWithPlugins extends App {
  plugins?: CommunityPluginsManager;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Local-date `YYYY-MM-DD`. */
export function formatIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDate(date: Date, format: string): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  // Replace format tokens (order matters - longer tokens first)
  return format
    .replace(/YYYY/g, String(year))
    .replace(/YY/g, String(year).slice(-2))
    .replace(/MMMM/g, MONTHS[month - 1] ?? '')
    .replace(/MMM/g, MONTHS_SHORT[month - 1] ?? '')
    .replace(/MM/g, String(month).padStart(2, '0'))
    .replace(/M/g, String(month))
    .replace(/DDDD/g, WEEKDAYS[date.getDay()] ?? '')
    .replace(/DDD/g, WEEKDAYS_SHORT[date.getDay()] ?? '')
    .replace(/DD/g, String(day).padStart(2, '0'))
    .replace(/D/g, String(day))
    .replace(/dddd/g, WEEKDAYS[date.getDay()] ?? '')
    .replace(/ddd/g, WEEKDAYS_SHORT[date.getDay()] ?? '');
}

/** Get the obsidian-journal community plugin API (if installed and enabled). */
function getObsidianJournalPlugin(app: App): ObsidianJournalPluginApi | null {
  const pluginManager = (app as AppWithPlugins).plugins;
  if (!pluginManager) return null;
  const plugin = pluginManager.getPlugin('journals');
  if (!plugin) return null;
  return plugin as ObsidianJournalPluginApi;
}

/**
 * Find the file path of an existing journal/daily note for a given date.
 * Returns null if no note exists for that date.
 * Checks the obsidian-journal plugin first, then core Daily Notes as fallback.
 */
export function getJournalNotePathForDate(app: App, date: Date): string | null {
  const dateStr = formatIsoDate(date);

  // Check obsidian-journal plugin (day-type journals)
  const journalPlugin = getObsidianJournalPlugin(app);
  if (journalPlugin) {
    for (const journal of journalPlugin.journals) {
      if (journal.type === 'day') {
        const noteData = journal.get(dateStr);
        if (noteData && 'path' in noteData && noteData.path) {
          return noteData.path;
        }
      }
    }
  }

  // Fallback: check core daily notes plugin path
  const dailyNotesPlugin = (app as AppWithInternals).internalPlugins?.getPluginById?.('daily-notes');
  if (dailyNotesPlugin?.enabled && dailyNotesPlugin.instance?.options) {
    const options = dailyNotesPlugin.instance.options;
    const format = options.format ?? 'YYYY-MM-DD';
    const folder = options.folder ?? '';
    const filename = formatDate(date, format);
    const path = folder ? `${folder}/${filename}.md` : `${filename}.md`;
    if (app.vault.getAbstractFileByPath(path)) return path;
  }

  // Final fallback: YYYY-MM-DD.md at vault root
  const fallbackPath = `${dateStr}.md`;
  if (app.vault.getAbstractFileByPath(fallbackPath)) return fallbackPath;

  return null;
}

/**
 * Open (or create) the journal/daily note for a given date.
 * Uses the obsidian-journal plugin when available, otherwise falls back to core daily notes.
 */
export async function openJournalOrDailyNote(app: App, date: Date): Promise<void> {
  const dateStr = formatIsoDate(date);

  // Try obsidian-journal plugin's day journals
  const journalPlugin = getObsidianJournalPlugin(app);
  if (journalPlugin) {
    const journal = journalPlugin.journals.filter(j => j.type === 'day')[0];
    if (journal) {
      const metadata = journal.get(dateStr);
      if (metadata) {
        await journal.open(metadata);
        return;
      }
    }
  }

  // Fall back to core daily notes behaviour
  await openDailyNote(app, date);
}

export async function openDailyNote(app: App, date: Date): Promise<void> {
  // Try to use the daily-notes core plugin settings
  const dailyNotesPlugin = (app as AppWithInternals).internalPlugins?.getPluginById?.('daily-notes');

  let path: string;
  let templatePath: string | undefined;
  let folder: string | undefined;

  if (dailyNotesPlugin?.enabled && dailyNotesPlugin.instance?.options) {
    const options = dailyNotesPlugin.instance.options;
    const format = options.format ?? 'YYYY-MM-DD';
    folder = options.folder ?? '';
    templatePath = options.template;

    // Format the date according to the daily notes format
    const filename = formatDate(date, format);
    path = folder ? `${folder}/${filename}.md` : `${filename}.md`;
  } else {
    // Fallback: just use YYYY-MM-DD format
    path = `${formatIsoDate(date)}.md`;
  }

  // Check if the file already exists
  const existingFile = app.vault.getAbstractFileByPath(path);

  if (!existingFile) {
    const templateFile = templatePath
      ? app.vault.getFileByPath(templatePath) ?? app.vault.getFileByPath(`${templatePath}.md`)
      : null;
    const engine = detectTemplateEngine(app);

    if (templateFile && engine !== 'plain') {
      await createNoteFromTemplate(app, engine, { template: templateFile, path });
    } else {
      // Nothing will process the template: copy it as-is and say so.
      let content = '';
      if (templateFile) {
        content = await app.vault.cachedRead(templateFile);
        noticePlainTemplate();
      }
      await ensureFolder(app, folder ?? '');
      await app.vault.create(path, content);
    }
  }

  // Open the file in new tab
  openFileInNewTab(app, path);
}
