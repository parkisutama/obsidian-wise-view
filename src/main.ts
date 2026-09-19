// SPDX-License-Identifier: GPL-3.0-only AND MIT
// Portions adapted from Planner (https://github.com/SawyerRensel/Planner): src/main.ts
// Copyright (C) 2025 Sawyer Rensel
// Portions adapted from obsidian-bases-gantt (https://github.com/lhassa8/obsidian-bases-gantt): src/main.ts
// Copyright (c) 2026 Lars Tray. MIT License, see THIRD_PARTY_NOTICES.md
// Modifications Copyright (C) 2026 Parkis Utama

import { Plugin } from 'obsidian';
import { WiseViewSettings, DEFAULT_SETTINGS } from './types/settings';
import { WiseViewSettingTab } from './settings/SettingsTab';
import { ViewRegistry, type ViewDescriptor } from './viewRegistry';

import {
  BASES_SWIMLANE_VIEW_ID,
  createSwimlaneViewRegistration,
} from './views/BasesSwimlaneView';

import {
  BASES_CALENDAR_VIEW_ID,
  createCalendarViewRegistration,
} from './views/BasesCalendarView';

import {
  BASES_GANTT_VIEW_ID,
  BasesGanttView,
  createGanttViewRegistration,
} from './views/BasesGanttView';

import {
  BASES_TIMELINE_VIEW_ID,
  createTimelineViewRegistration,
} from './views/timeline';

// Grid (src/views/grid) is implemented but unregistered as of 2026-09-19: native testing
// surfaced repeated, hard-to-diagnose CSS Grid layout failures (oversized covers, then
// flattened cards) even after direct fixes, and the maintainer paused further Dynamic Views
// adoption for Grid/Masonry rather than keep guessing blind. The code stays in the tree —
// unregistering only removes it from the Bases view picker — pending a decision on how to
// resume (see docs/architecture/upstream-provenance.md and tasks/plan.md's amendment).

/** Command-palette commands scoped to the currently active Gantt view, if any. */
function buildGanttCommands() {
  const activeGantt = (): BasesGanttView | null => {
    for (const inst of BasesGanttView.instances) {
      if (inst.isInActiveLeaf()) return inst;
    }
    return null;
  };

  const viewModeCommand = (id: string, name: string, mode: string) => ({
    id,
    name,
    checkCallback: (checking: boolean) => {
      const view = activeGantt();
      if (!view) return false;
      if (!checking) view.setViewMode(mode);
      return true;
    },
  });

  return [
    {
      id: 'gantt-scroll-today',
      name: 'Gantt: scroll to today',
      checkCallback: (checking: boolean) => {
        const view = activeGantt();
        if (!view) return false;
        if (!checking) view.scrollToToday();
        return true;
      },
    },
    {
      id: 'gantt-create-note',
      name: 'Gantt: create note at today',
      checkCallback: (checking: boolean) => {
        const view = activeGantt();
        if (!view) return false;
        if (!checking) view.createNoteAtToday();
        return true;
      },
    },
    viewModeCommand('gantt-view-day', 'Gantt: day view', 'Day'),
    viewModeCommand('gantt-view-week', 'Gantt: week view', 'Week'),
    viewModeCommand('gantt-view-month', 'Gantt: month view', 'Month'),
    viewModeCommand('gantt-view-year', 'Gantt: year view', 'Year'),
  ];
}

export default class WiseViewPlugin extends Plugin {
  settings!: WiseViewSettings;

  async onload() {
    await this.loadSettings();

    // Register Bases views, hover sources, and commands from one descriptor list.
    this.registerViewDescriptors(this.buildViewDescriptors());

    // Add settings tab
    this.addSettingTab(new WiseViewSettingTab(this.app, this));
  }

  /**
   * The registry is the single source of truth for every view's id, hover attribution, and
   * commands (spec §7.3). Building it here does not instantiate any view: each `factory` is
   * only stored until Obsidian itself mounts the view.
   */
  private buildViewDescriptors(): ViewDescriptor[] {
    const swimlane = createSwimlaneViewRegistration(this);
    const calendar = createCalendarViewRegistration(this);
    const gantt = createGanttViewRegistration(this);
    const timeline = createTimelineViewRegistration(this);

    return [
      {
        id: BASES_SWIMLANE_VIEW_ID,
        name: swimlane.name,
        icon: swimlane.icon,
        factory: swimlane.factory,
        options: swimlane.options,
        hover: { display: 'Swimlane', defaultMod: true },
        capabilities: { legacyMutation: true },
      },
      {
        id: BASES_CALENDAR_VIEW_ID,
        name: calendar.name,
        icon: calendar.icon,
        factory: calendar.factory,
        options: calendar.options,
        hover: { display: 'Calendar', defaultMod: true },
        capabilities: { legacyMutation: true },
      },
      {
        id: BASES_GANTT_VIEW_ID,
        name: gantt.name,
        icon: gantt.icon,
        factory: gantt.factory,
        options: gantt.options,
        hover: { display: 'Gantt', defaultMod: true },
        commands: buildGanttCommands(),
        capabilities: { legacyMutation: true },
      },
      {
        id: BASES_TIMELINE_VIEW_ID,
        name: timeline.name,
        icon: timeline.icon,
        factory: timeline.factory,
        options: timeline.options,
        hover: { display: 'Timeline', defaultMod: true },
		capabilities: { legacyMutation: true },
      },
    ];
  }

  /** Registers every descriptor's Bases view, hover source, and commands with Obsidian. */
  private registerViewDescriptors(descriptors: ViewDescriptor[]): void {
    const registry = new ViewRegistry();
    for (const descriptor of descriptors) {
      registry.register(descriptor);
    }

    for (const descriptor of registry.list()) {
      this.registerBasesView(descriptor.id, {
        name: descriptor.name,
        icon: descriptor.icon,
        factory: descriptor.factory,
        options: descriptor.options,
      });

      if (descriptor.hover) {
        this.registerHoverLinkSource(descriptor.id, descriptor.hover);
      }

      for (const command of descriptor.commands ?? []) {
        this.addCommand(command);
      }
    }
  }

  onunload() {
    // Plugin cleanup handled automatically
  }

  async loadSettings() {
    const loadedData = await this.loadData() as (Partial<WiseViewSettings> & { kanbanDefaults?: unknown }) | null;
    // Versions before the Swimlane rename saved every Kanban default, including a forced
    // "note.status" column property. Drop that key instead of migrating it.
    const { kanbanDefaults: _legacyKanbanDefaults, ...data } = loadedData ?? {};
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...data,
      // Deep-merge nested objects so missing sub-keys still get defaults
      calendarDefaults: { ...DEFAULT_SETTINGS.calendarDefaults, ...(data.calendarDefaults ?? {}) },
      swimlaneDefaults: { ...DEFAULT_SETTINGS.swimlaneDefaults, ...(data.swimlaneDefaults ?? {}) },
      ganttDefaults: { ...DEFAULT_SETTINGS.ganttDefaults, ...(data.ganttDefaults ?? {}) },
      valueStyles: { ...DEFAULT_SETTINGS.valueStyles, ...(data.valueStyles ?? {}) },
    };
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

}
