import { App, PluginSettingTab, Setting } from 'obsidian';
import type PlannerPlugin from '../main';
import { PlannerSettings } from '../types/settings';

/**
 * Tab configuration
 */
interface TabConfig {
  id: string;
  label: string;
  render: (container: HTMLElement) => void;
}

export class PlannerSettingTab extends PluginSettingTab {
  plugin: PlannerPlugin;
  private activeTab = 'general';
  private tabContents: Map<string, HTMLElement> = new Map();
  private tabButtons: Map<string, HTMLElement> = new Map();

  constructor(app: App, plugin: PlannerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  private getTabs(): TabConfig[] {
    return [
      { id: 'general', label: 'General', render: (c) => this.renderGeneralTab(c) },
      { id: 'gantt', label: 'Gantt', render: (c) => this.renderGanttTab(c) },
    ];
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    this.tabContents.clear();
    this.tabButtons.clear();

    const tabs = this.getTabs();

    // Create tab navigation
    const tabNav = containerEl.createDiv({ cls: 'planner-settings-tabs' });
    for (const tab of tabs) {
      const btn = tabNav.createEl('button', {
        text: tab.label,
        cls: 'planner-settings-tab',
      });
      if (tab.id === this.activeTab) {
        btn.addClass('is-active');
      }
      btn.addEventListener('click', () => this.switchTab(tab.id));
      this.tabButtons.set(tab.id, btn);
    }

    // Create tab content containers
    const tabContentsEl = containerEl.createDiv({ cls: 'planner-settings-tab-contents' });
    for (const tab of tabs) {
      const content = tabContentsEl.createDiv({ cls: 'planner-settings-tab-content' });
      if (tab.id === this.activeTab) {
        content.addClass('is-active');
        tab.render(content);
      }
      this.tabContents.set(tab.id, content);
    }
  }

  private switchTab(tabId: string): void {
    if (tabId === this.activeTab) return;

    const tabs = this.getTabs();

    // Update button states
    for (const [id, btn] of this.tabButtons) {
      btn.toggleClass('is-active', id === tabId);
    }

    // Update content visibility
    for (const [id, content] of this.tabContents) {
      const isActive = id === tabId;
      content.toggleClass('is-active', isActive);

      // Lazy render: only render content on first access
      if (isActive && content.children.length === 0) {
        const tab = tabs.find(t => t.id === id);
        if (tab) {
          tab.render(content);
        }
      }
    }

    this.activeTab = tabId;
  }

  private renderGeneralTab(containerEl: HTMLElement): void {
    new Setting(containerEl).setName('Calendar view defaults').setHeading();

    new Setting(containerEl)
      .setName('Week starts on')
      .setDesc('First day of the week in the calendar')
      .addDropdown(dropdown => dropdown
        .addOption('monday', 'Monday')
        .addOption('tuesday', 'Tuesday')
        .addOption('wednesday', 'Wednesday')
        .addOption('thursday', 'Thursday')
        .addOption('friday', 'Friday')
        .addOption('saturday', 'Saturday')
        .addOption('sunday', 'Sunday')
        .setValue(this.plugin.settings.calendarDefaults.weekStartsOn)
        .onChange(async (value: PlannerSettings['calendarDefaults']['weekStartsOn']) => {
          this.plugin.settings.calendarDefaults.weekStartsOn = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Font size')
      .setDesc(`Font size for calendar events (${this.plugin.settings.calendarDefaults.fontSize}px)`)
      .addSlider(slider => slider
        .setLimits(6, 18, 1)
        .setValue(this.plugin.settings.calendarDefaults.fontSize)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.calendarDefaults.fontSize = value;
          await this.plugin.saveSettings();
          this.refreshCurrentTab();
        }));
  }



  private renderGanttTab(containerEl: HTMLElement): void {
    new Setting(containerEl).setName('Gantt view defaults').setHeading();
    new Setting(containerEl).setDesc(
      'These defaults are used when no property is configured in the .base view settings.'
    );

    new Setting(containerEl)
      .setName('Start date field')
      .setDesc('Frontmatter property to use as bar start date')
      .addText(text => text
        .setPlaceholder('Start-date')
        .setValue(this.plugin.settings.ganttDefaults.dateStartField)
        .onChange(async (value) => {
          this.plugin.settings.ganttDefaults.dateStartField = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('End date field')
      .setDesc('Frontmatter property to use as bar end date')
      .addText(text => text
        .setPlaceholder('End-date')
        .setValue(this.plugin.settings.ganttDefaults.dateEndField)
        .onChange(async (value) => {
          this.plugin.settings.ganttDefaults.dateEndField = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Dependencies field')
      // eslint-disable-next-line obsidianmd/ui/sentence-case -- wiki-link notation
      .setDesc('Property containing dependency wiki-links, such as [[Task A]]')
      .addText(text => text
        .setPlaceholder('Depends-on')
        .setValue(this.plugin.settings.ganttDefaults.dependenciesField)
        .onChange(async (value) => {
          this.plugin.settings.ganttDefaults.dependenciesField = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Color by field')
      .setDesc('Property whose values drive bar colors, such as status or priority')
      .addText(text => text
        .setPlaceholder('Status')
        .setValue(this.plugin.settings.ganttDefaults.colorBy)
        .onChange(async (value) => {
          this.plugin.settings.ganttDefaults.colorBy = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Progress field')
      .setDesc('Numeric property for completion percentage (0–100)')
      .addText(text => text
        .setPlaceholder('Progress')
        .setValue(this.plugin.settings.ganttDefaults.progressField)
        .onChange(async (value) => {
          this.plugin.settings.ganttDefaults.progressField = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl).setName('Display defaults').setHeading();

    new Setting(containerEl)
      .setName('Default view mode')
      .setDesc('Default zoom level for the chart')
      .addDropdown(dropdown => dropdown
        .addOption('Day', 'Day')
        .addOption('Week', 'Week')
        .addOption('Month', 'Month')
        .addOption('Year', 'Year')
        .addOption('Quarter day', 'Quarter day')
        .addOption('Half day', 'Half day')
        .setValue(this.plugin.settings.ganttDefaults.viewMode)
        .onChange(async (value) => {
          this.plugin.settings.ganttDefaults.viewMode = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Bar height')
      .setDesc(`Task bar height in pixels (${this.plugin.settings.ganttDefaults.barHeight}px)`)
      .addSlider(slider => slider
        .setLimits(16, 60, 2)
        .setValue(this.plugin.settings.ganttDefaults.barHeight)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.ganttDefaults.barHeight = value;
          await this.plugin.saveSettings();
          this.refreshCurrentTab();
        }));

    new Setting(containerEl)
      .setName('Show progress by default')
      .setDesc('Show progress bar overlay on task bars')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.ganttDefaults.showProgress)
        .onChange(async (value) => {
          this.plugin.settings.ganttDefaults.showProgress = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Show Obsidian preview on click')
      .setDesc('Trigger Obsidian hover-preview when clicking a task bar instead of opening the note')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.ganttDefaults.showObsidianPreview)
        .onChange(async (value) => {
          this.plugin.settings.ganttDefaults.showObsidianPreview = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Show internal popup')
      // eslint-disable-next-line obsidianmd/ui/sentence-case -- "Frappe Gantt" is a proper name
      .setDesc('Show the built-in Frappe Gantt popup with task detail on hover or click')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.ganttDefaults.showInternalPopup)
        .onChange(async (value) => {
          this.plugin.settings.ganttDefaults.showInternalPopup = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl).setName('Color configuration').setHeading();
    new Setting(containerEl).setDesc(
      'Bar colors for the Gantt view follow the same value styles as other views. ' +
      'Configure per-value colors in your data.json under "valueStyles", or install ' +
      'the Pretty Properties plugin to assign colors directly in your notes.'
    );
  }

  private refreshCurrentTab(): void {
    const content = this.tabContents.get(this.activeTab);
    if (content) {
      content.empty();
      const tabs = this.getTabs();
      const tab = tabs.find(t => t.id === this.activeTab);
      if (tab) {
        tab.render(content);
      }
    }
  }

}
