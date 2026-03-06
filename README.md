# Wise View

> **A focused, task-management-agnostic view enrichment plugin for Obsidian Bases.**

Wise View adds Calendar, Kanban, Timeline, and Gantt views directly into Obsidian Bases — without
any opinion about *how* you manage your tasks or which plugin you use for that.  Your data model is
yours. This plugin just gives you richer ways to look at it.

---

## Origin & Attribution

This plugin is a **derivative work** of [Obsidian Planner](https://github.com/SawyerRensel/Planner)
by [Sawyer Rensel](https://github.com/SawyerRensel), which is licensed under the
**GNU General Public License v3.0**.

Because the original work uses GPL v3 — a *copyleft* license — this plugin **must also be distributed
under GPL v3**. See the [License](#license) section for details.

### What was changed from the original

The original Planner is a full-featured planning and task management plugin. Wise View intentionally
**narrows the scope**:

| Original (Planner) | Wise View |
| --- | --- |
| Task List view | ✗ Removed |
| Item Modal / Quick Capture | ✗ Removed |
| Natural language date parsing (chrono-node) | ✗ Removed |
| Recurrence engine (rrule) | ✗ Removed |
| Item hierarchy & blocking dependencies | ✗ Removed |
| Task management workflow & statuses | ✗ Removed |
| Calendar view | ✓ Kept |
| Kanban view | ✓ Kept |
| Timeline view (Markwhen) | ✓ Kept |
| Gantt view (Frappe Gantt) | ✨ Added (planned) |

### Gantt code attribution

The Gantt view incorporates code adapted from
[obsidian-bases-gantt](https://github.com/lhassa8/obsidian-bases-gantt) by
[lhassa8](https://github.com/lhassa8), licensed under the **MIT License**.

The MIT License is compatible with GPL v3: MIT code may be included in a GPL v3 project, and the
whole project is then governed by GPL v3. The original MIT copyright notice is preserved in the
[LICENSE](LICENSE) file as required.

---

## Features

- **Calendar view** — Month, Week, Day, and List layouts. Open and navigate your dated notes at a
  glance.
- **Kanban view** — Drag-and-drop board. Group by any frontmatter property (status, priority,
  category, etc.).
- **Timeline view** — Chronological visualization powered by
  [Markwhen](https://markwhen.com/), with zoom, pan, and color-coding.
- **Gantt view** *(coming soon)* — Dependency-aware bar chart powered by
  [Frappe Gantt](https://frappe.io/gantt), with progress tracking.

All views are **Obsidian Bases-native**: they read your notes' frontmatter properties directly and
write no extra data.

---

## Requirements

- Obsidian **1.10.0** or later (requires Bases API)
- Desktop or mobile (set `isDesktopOnly: false` — mobile support is best-effort)

---

## Installation

### Manual (for development / testing)

1. Run the production build:

   ```bash
   npm install
   npm run build
   ```

2. Copy `main.js`, `manifest.json`, and `styles.css` to your vault:

   ```text
   <Vault>/.obsidian/plugins/obsidian-wise-view/
   ```

3. Enable the plugin in **Settings → Community plugins**.

### Community Plugin Store

Submission to the Obsidian community plugin store is planned once the plugin reaches a stable
feature set.

---

## Usage

Open any folder as a Base (right-click → **New base from folder**), then switch the view type
dropdown to **Calendar**, **Kanban**, or **Gantt**.

### Recommended frontmatter shape

Wise View does not enforce a schema. Any dated frontmatter works. Common example:

```yaml
---
title: Website Redesign
status: In Progress
priority: High
date_start: 2026-03-01
date_end: 2026-03-31
progress: 40
---
```

---

## Development

```bash
# Install dependencies
npm install

# Watch mode (rebuilds on save)
npm run dev

# Production build
npm run build
```

The build output is `main.js` at the project root.

---

## License

This project is licensed under the **GNU General Public License v3.0**.

```text
Copyright (C) 2025  Sawyer Rensel  (original Planner codebase)
Copyright (C) 2026  Parkis Utama   (modifications in Wise View)

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.
```

See the [LICENSE](LICENSE) file for the full license text.

### Dependency licenses

| Dependency | License | Notes |
| --- | --- | --- |
| [FullCalendar](https://fullcalendar.io/) | MIT | Calendar view |
| [Markwhen](https://markwhen.com/) | MIT | Timeline view |
| [Frappe Gantt](https://github.com/frappe/gantt) | MIT | Gantt view (planned) |
| [Obsidian API](https://obsidian.md/) | Custom | Obsidian plugin system |

---

## Acknowledgments

- **[Sawyer Rensel](https://github.com/SawyerRensel)** — author of the original
  [Obsidian Planner](https://github.com/SawyerRensel/Planner), whose codebase is the foundation
  of this plugin. Thank you for building in the open and choosing a copyleft license that keeps
  derivative work free.
- **[lhassa8](https://github.com/lhassa8)** — author of
  [obsidian-bases-gantt](https://github.com/lhassa8/obsidian-bases-gantt), which demonstrated a
  clean pattern for integrating Frappe Gantt into Obsidian Bases.
- The [Obsidian](https://obsidian.md/) team for building the Bases API.
- The [Markwhen](https://markwhen.com/) and [FullCalendar](https://fullcalendar.io/) projects.
