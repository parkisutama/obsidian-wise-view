# Gantt view improvement implementation prompt

Use this prompt for a future implementation session focused on making Wise View's Gantt view more Notion Timeline-like while preserving Wise View's schema-agnostic identity.

## Project context

Wise View is an Obsidian Community Plugin for Obsidian Bases. It enriches Bases with Calendar, Kanban, and Gantt views. The Gantt view uses `frappe-gantt` and maps existing Obsidian frontmatter properties into chart tasks.

Revise the product philosophy for this work:

> Wise View is schema-agnostic, not strictly read-only. It visualizes existing Obsidian Base/frontmatter properties and may optionally edit explicitly mapped fields through direct view interactions, such as dates, progress, dependencies, and grouping fields. It must not impose a task workflow, required schema, automatic status lifecycle, recurrence engine, natural language parser, or project-management rules.

Do not reintroduce task-management workflow logic. Avoid required schemas, automatic status updates, recurrence, natural language date parsing, or hierarchy enforcement. All writes must go only to explicitly mapped frontmatter properties.

## Current Gantt baseline

Before implementing, inspect:

- `src/views/BasesGanttView.ts`
- `src/utils/ganttUtils.ts`
- `src/types/frappe-gantt.d.ts`
- `src/settings/SettingsTab.ts`
- `src/types/settings.ts`
- `styles.css`

Current behavior already includes:

- Start/end date mapping.
- Dependency mapping from a configured property.
- Progress mapping and progress writes.
- Date drag/resize writes.
- `move_dependencies: true` in Frappe Gantt options.
- WBS sidebar support.
- Obsidian hover preview wiring.
- Optional Frappe internal popup.

## Design target

Make the Gantt view feel closer to Notion Timeline:

- Database-first, not chart-only.
- Obsidian page preview follows the core Page Preview plugin behavior.
- Popup is a small explicit task detail affordance, not the same trigger as page preview.
- Properties shown in popup/sidebar should respect Bases property configuration where possible, not a separate hardcoded property list.
- Interactive edits should update mapped frontmatter fields only.

## Phase 1: Popup and preview separation

Implement this first.

### Required behavior

1. Page Preview must follow Obsidian's native behavior.
   - Do not hijack normal hover into always showing preview.
   - Respect how Obsidian's core Page Preview plugin works, including modifier-key behavior.
   - Keep the existing setting for click-to-preview only if it does not conflict with native preview behavior.

2. The internal Gantt popup must have a separate trigger.
   - Show a small icon or button only when hovering a Gantt bar.
   - Clicking that icon opens the internal task detail popup.
   - Clicking the bar itself should continue to open the note unless the user's settings say otherwise.
   - The popup trigger must not block drag/resize/progress interactions.

3. Popup content should be useful but schema-agnostic.
   - Show title/name.
   - Show date range.
   - Show progress only if progress is enabled and mapped.
   - Show dependencies only if dependency property is mapped.
   - Show visible Bases properties if the Bases API exposes them for the current view/config.
   - If visible Bases properties are not accessible, document the limitation in code comments and keep the content minimal.

4. Styling belongs in `styles.css`.
   - Use Obsidian CSS variables.
   - Do not hardcode category/status colors.
   - Keep the hover icon compact and accessible.

### Acceptance criteria

- Hovering a bar reveals a small popup icon.
- Clicking the icon opens the Gantt detail popup.
- Obsidian Page Preview still works according to the core plugin behavior.
- Normal bar click opens the note unless configured otherwise.
- Dragging dates, resizing bars, and editing progress still work.
- Popup and preview do not fire at the same time from the same simple hover.

## Phase 2: Dependency editing

Add dependency editing without drag-to-connect first.

### Required behavior

- Add context menu actions for dependency management:
  - Add dependency
  - Remove dependency
  - Clear dependencies
- Write only to the configured dependency property.
- Use wiki-link compatible values because current dependency mapping expects note links.
- Prevent duplicate dependency entries.
- Prevent self-dependencies.
- Do not implement blocking, status automation, recurrence, or task hierarchy rules.

### Acceptance criteria

- User can add and remove dependencies from a Gantt task.
- The configured frontmatter dependency property is updated.
- Gantt refreshes and displays arrows after dependency changes.
- Existing dependency formats are preserved where practical.

## Phase 3: Drag-to-connect dependencies

Implement a Notion-like dependency connector after Phase 2 is stable.

### Required behavior

- On bar hover, show a connector handle.
- Drag from one task's connector handle to another task.
- Draw a temporary connector line during drag.
- On drop, add dependency to the target task's mapped dependency property.
- Cancel cleanly on escape, invalid drop, scroll, or pointer release outside a valid target.

### Acceptance criteria

- Dragging from one task to another creates a dependency.
- Invalid connections are rejected:
  - self-dependency
  - duplicate dependency
  - missing dependency property mapping
  - parent/group header tasks
- The UI remains scoped to the Gantt container.
- No document-level listeners leak after unmount.

## Phase 4: Dependency scheduling persistence

Make dependency movement reliable and explicit.

### Required behavior

- Keep dependency date movement optional via setting.
- When a task date changes and Frappe moves dependents, persist all changed dependent task dates to mapped frontmatter fields.
- If Frappe does not emit `on_date_change` for every moved dependent task, detect changes by comparing task dates before and after drag.
- Never edit formula-backed properties.
- Skip parent/group aggregate tasks.

### Acceptance criteria

- Directly dragged task dates are persisted.
- Moved dependent task dates are persisted when the setting is enabled.
- Dependent dates are not persisted when the setting is disabled.
- Formula properties are never written.

## Testing and verification

Run the relevant checks after each phase:

```bash
pnpm run build
pnpm test
```

If tests do not cover the changed behavior, add focused tests for pure utility logic. For DOM behavior that depends on Obsidian/Frappe runtime, document manual verification steps in the final response.

Manual verification should include:

- Bar click opens note.
- Native Obsidian Page Preview behavior still works.
- Popup icon appears on hover and opens popup on click.
- Drag/resize date edits still write mapped date fields.
- Progress edits still write mapped progress field.
- Dependency add/remove writes the mapped dependency field.
- Dependency movement does not write formula properties.

