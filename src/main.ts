import { Plugin } from 'obsidian';
import { PlannerSettings, DEFAULT_SETTINGS } from './types/settings';
import { PlannerSettingTab } from './settings/SettingsTab';
import { ItemService } from './services/ItemService';

// === ACTIVE VIEW IMPORTS ===
import {
  BASES_KANBAN_VIEW_ID,
  createKanbanViewRegistration,
} from './views/BasesKanbanView';

import {
  BASES_CALENDAR_VIEW_ID,
  createCalendarViewRegistration,
} from './views/BasesCalendarView';

/* === TEMPORARILY DISABLED VIEW IMPORTS ===
import {
  BASES_TIMELINE_VIEW_ID,
  createTimelineViewRegistration,
} from './views/BasesTimelineView';
=== END TEMPORARILY DISABLED VIEW IMPORTS */

import {
  BASES_GANTT_VIEW_ID,
  BasesGanttView,
  createGanttViewRegistration,
} from './views/BasesGanttView';

export default class PlannerPlugin extends Plugin {
  settings: PlannerSettings;
  itemService: ItemService;

  async onload() {
    // Load settings
    await this.loadSettings();

    // Initialize services
    this.itemService = new ItemService(this.app, () => this.settings);

    // Register Bases views
    this.registerBasesViews();

    // Add settings tab
    this.addSettingTab(new PlannerSettingTab(this.app, this));

    // Add ribbon icons
  }

  /**
   * Register custom view types with Obsidian Bases
   */
  private registerBasesViews(): void {
    // === ACTIVE VIEW REGISTRATIONS ===
    this.registerBasesView(
      BASES_KANBAN_VIEW_ID,
      createKanbanViewRegistration(this)
    );

    // Register Calendar view for Bases
    this.registerBasesView(
      BASES_CALENDAR_VIEW_ID,
      createCalendarViewRegistration(this)
    );

    /* === TEMPORARILY DISABLED VIEW REGISTRATIONS ===

    // Register Timeline view for Bases
    this.registerBasesView(
      BASES_TIMELINE_VIEW_ID,
      createTimelineViewRegistration(this)
    );

    === END TEMPORARILY DISABLED VIEW REGISTRATIONS */

    // Register Gantt view for Bases
    this.registerBasesView(
      BASES_GANTT_VIEW_ID,
      createGanttViewRegistration(this)
    );

    // Register hover-link source so Obsidian Page Preview responds to Gantt bar
    // hovers without requiring the user to hold a modifier key (defaultMod:false).
    this.registerHoverLinkSource(BASES_GANTT_VIEW_ID, {
      display: 'Gantt',
      defaultMod: false,
    });

    // Register Gantt command palette commands
    this.registerGanttCommands();
  }

  /**
   * Register command palette commands for Gantt view interaction.
   */
  private registerGanttCommands(): void {
    const activeGantt = (): BasesGanttView | null => {
      for (const inst of BasesGanttView.instances) {
        if (inst.isInActiveLeaf()) return inst;
      }
      return null;
    };

    this.addCommand({
      id: 'gantt-scroll-today',
      name: 'Gantt: scroll to today',
      checkCallback: (checking) => {
        const view = activeGantt();
        if (!view) return false;
        if (!checking) view.scrollToToday();
        return true;
      },
    });

    this.addCommand({
      id: 'gantt-create-task',
      name: 'Gantt: create new task at today',
      checkCallback: (checking) => {
        const view = activeGantt();
        if (!view) return false;
        if (!checking) view.createTaskAtToday();
        return true;
      },
    });

    this.addCommand({
      id: 'gantt-view-day',
      name: 'Gantt: day view',
      checkCallback: (checking) => {
        const view = activeGantt();
        if (!view) return false;
        if (!checking) view.setViewMode('Day');
        return true;
      },
    });

    this.addCommand({
      id: 'gantt-view-week',
      name: 'Gantt: week view',
      checkCallback: (checking) => {
        const view = activeGantt();
        if (!view) return false;
        if (!checking) view.setViewMode('Week');
        return true;
      },
    });

    this.addCommand({
      id: 'gantt-view-month',
      name: 'Gantt: month view',
      checkCallback: (checking) => {
        const view = activeGantt();
        if (!view) return false;
        if (!checking) view.setViewMode('Month');
        return true;
      },
    });

    this.addCommand({
      id: 'gantt-view-year',
      name: 'Gantt: year view',
      checkCallback: (checking) => {
        const view = activeGantt();
        if (!view) return false;
        if (!checking) view.setViewMode('Year');
        return true;
      },
    });
  }

  onunload() {
    // Plugin cleanup handled automatically
  }

  async loadSettings() {
    const loadedData = await this.loadData() as Partial<PlannerSettings> | null;
    const data = loadedData ?? {};
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...data,
      // Deep-merge nested objects so missing sub-keys still get defaults
      calendarDefaults: { ...DEFAULT_SETTINGS.calendarDefaults, ...(data.calendarDefaults ?? {}) },
      kanbanDefaults: { ...DEFAULT_SETTINGS.kanbanDefaults, ...(data.kanbanDefaults ?? {}) },
      timelineDefaults: { ...DEFAULT_SETTINGS.timelineDefaults, ...(data.timelineDefaults ?? {}) },
      ganttDefaults: { ...DEFAULT_SETTINGS.ganttDefaults, ...(data.ganttDefaults ?? {}) },
      valueStyles: { ...DEFAULT_SETTINGS.valueStyles, ...(data.valueStyles ?? {}) },
    };
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

}

