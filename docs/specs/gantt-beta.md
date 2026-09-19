# Spec: Gantt Beta — a phase-aware Gantt view built on `@jaeungkim/gantt-chart`

Status: Approved 2026-09-19 — Gate 1 passed (desktop spike)
Baseline branch: `dev`
Prepared: 2026-09-19
Roadmap: [../../ROADMAP.md](../../ROADMAP.md)
Plan: [../../tasks/gantt-beta/plan.md](../../tasks/gantt-beta/plan.md)
Tasks: [../../tasks/gantt-beta/todo.md](../../tasks/gantt-beta/todo.md)
Related: [gantt.md](gantt.md) (Frappe Gantt workstream, frozen by this spec — see §9)
Decision record: [../architecture/view-write-access.md](../architecture/view-write-access.md)

## 1. Objective

Add a second, independent Gantt view — **Gantt Beta** — rendered by
[`@jaeungkim/gantt-chart`](https://github.com/jaeungkim/gantt-chart) (MIT) instead of Frappe Gantt.
Gantt Beta exposes the library's full interaction set (move, resize, progress, dependency drawing
and deletion, phases with roll-up and collapse, row reordering, drawing a range to create a note,
working calendar, detail panel), is configured entirely through Bases view options, and writes
every committed edit back to note properties.

Frappe Gantt (`wise-view-gantt`) stays registered and untouched while Gantt Beta matures. When
Gantt Beta meets the stability gate (§11), a separate workstream removes Frappe Gantt entirely.

## 2. Decisions from the 2026-09-19 interview

| # | Topic | Decision |
|---|---|---|
| D1 | UI runtime | `preact/compat`, aliased for `react`, `react-dom`, and `react/jsx-runtime` at build time. `react`/`react-dom` stay forbidden in `package.json` (architecture guard unchanged). A spike proves compatibility before any other work (plan Phase 0). |
| D2 | Write access | Approved: Gantt Beta may write, **only** through `src/platform/mutations` capabilities, never by calling `processFrontMatter`/`vault.modify` from `src/views/gantt-beta/`. Recorded as a precedent with plugin-compatibility consequences in [view-write-access.md](../architecture/view-write-access.md). |
| D3 | View ID | `wise-view-gantt-beta`, permanent. It is not migrated onto `wise-view-gantt` when Frappe is removed; users switch their `.base` views manually (the removal workstream documents how). The display name may later drop "Beta"; the ID never changes. |
| D4 | Phases | A phase is a **parent note** referenced by the configured Parent property, **and** each Bases `Group by` group becomes a synthetic, read-only phase row. |
| D5 | Dependency types | All four types (FS, SS, FF, SF), stored as **one Bases-configured list-of-links property per type**. FS reuses the same property the Frappe view reads. |
| D6 | Frappe carry-over | Only "move dependent tasks" (`persistDependencyDateChanges`) is carried over. Expected progress, the sub-day scales (Hour/Quarter day/Half day), the context menu, and the Gantt command-palette commands are **not** carried over (§4). |
| D7 | Date storage | Local, floating values: `Date` properties as `YYYY-MM-DD` (end date **inclusive**), `Date & time` properties as `YYYY-MM-DDTHH:mm` with no offset. ISO strings with `Z` are read but never produced. |
| D8 | Obsidian integration | Click opens the note (modifier = new tab, per existing navigation helpers) and Ctrl/Cmd-hover shows Page Preview. |
| D9 | Detail panel | Custom Obsidian renderer (`renderDetail`), not the library's built-in body. |
| D10 | Reordering and creation | All three enabled: drag a row to another phase (writes Parent), drag to reorder within a phase (writes an Order property), and draw a range to create a note from the template. |
| D11 | Frappe workstream | Frozen: bug fixes only. GAN-002–GAN-005 deferred (§9). |
| D12 | Stability gate | Checklist + native acceptance on desktop and mobile + no data-loss bug + explicit maintainer decision (§11). |

## 3. Scope

### 3.1 View registration

- New descriptor in the `ViewRegistry`: id `wise-view-gantt-beta`, name `Gantt Beta`, its own
  icon, options, and hover source (`{ display: 'Gantt Beta', defaultMod: true }`).
- Code lives in `src/views/gantt-beta/`. Pure mapping/scheduling logic lives in
  `src/core/gantt/` (no `obsidian` import — existing core guard).
- The descriptor declares a new, explicit write capability (see D2) instead of
  `legacyMutation`.

### 3.2 Data model mapping (Bases → library `Task`)

| `Task` field | Source | Rule |
|---|---|---|
| `id` | Entry file path | Never stored in frontmatter. Synthetic phase rows use a reserved prefix that cannot collide with a vault path. |
| `name` | Label property, else file basename | |
| `startDate` / `endDate` | Start/End properties | `Date` → `YYYY-MM-DD`; the end date is converted from inclusive (property) to exclusive (library) by adding one day on read. `Date & time` → passed as floating wall-clock time (treated as UTC by the library). Values with an offset/`Z` are converted to local wall-clock time first. Missing end → one day (date) or one scale step (datetime). Missing start → entry is not placed (listed in the empty/unscheduled state). |
| `progress` | Progress property | Parsed as a number (numeric strings accepted), clamped 0–100. Omitted when unset or when "Show progress" is off. |
| `color` | Color-by property via the existing `ColorResolver` | |
| `parentId` | Parent property (link) resolved to a path, or the synthetic group phase id | See §3.3. |
| `sequence` | Computed, never stored | Depth-first numbering of the phase tree (`1`, `1.1`, `1.2`, `2`, …). Sibling order = Order property ascending when configured, else Bases sort order. |
| `dependencies` | FS/SS/FF/SF properties | Each property is a list of links; each resolved link becomes `{ targetId: path, type }`. Unresolved links are kept in the property untouched and not drawn. |
| `readOnly` / `allow*` | Synthetic rows; formula-backed properties | Synthetic phase rows are read-only. A task whose date property is a formula has `allowMove`/`allowResize` off. |

### 3.3 Phases (D4)

1. **Parent-note phases.** A task whose Parent property links to another entry in the Base's
   results gets that entry as `parentId`. With the Phases option on, the library's `hierarchy`
   renders the parent as a summary row with roll-up dates/progress and a collapse control.
   Nesting depth is unlimited; cycles and self-links fall back to root (library behavior),
   and Gantt Beta shows a one-time Notice naming the offending notes.
2. **Parent note outside the results.** When the Parent link resolves to a file that is not in
   the Base's results (filtered out, or not a task), Gantt Beta inserts a synthetic, read-only
   phase row named after that note. Clicking it opens the note. If the link does not resolve to
   any file, the task becomes a root row.
3. **Bases group phases.** When the Base has `Group by`, each group becomes a synthetic,
   read-only top-level phase row labelled with the group value (empty key → "No value").
   Parent-note phases nest inside their group. A task and its parent note in different groups
   are drawn under the task's own group, and the parent link is not honoured there (documented
   limitation; each group is its own tree).
4. **Phase dates.** Summary rows always display rolled-up dates. The "Write phase dates" option
   (default off) also writes the rolled-up start/end to parent-note phases after any change to
   their subtree, so other views (including Frappe Gantt) see matching dates.

### 3.4 Write-back

All writes go through the mutation capabilities (D2). `onTasksChange` delivers the whole array
with no description of what changed, so Gantt Beta diffs it against the array it last passed in
and writes only changed fields of changed notes.

| Gesture | Library callback | Properties written |
|---|---|---|
| Move / resize / keyboard date edit | `onTasksChange` | Start/End (formatted per D7, inclusive end restored for `Date`) |
| Progress drag / keyboard | `onTasksChange` | Progress (integer) |
| Summary (phase) bar drag | `onTasksChange` | Start/End of every moved descendant; phase dates only if "Write phase dates" is on |
| Draw a dependency | `onDependencyCreate` → `onTasksChange` | Appends `[[link]]` to the property of the drawn type, on the successor note |
| Delete a dependency | `onDependencyDelete` → `onTasksChange` | Removes the link from **every** type property for that predecessor/successor pair (library deletes per pair) |
| Drag row to another phase | `onTaskMove` → `onTasksChange` | Parent (link to the new parent note, or cleared at root). Dropping into a synthetic group phase is rejected with a Notice in v1. |
| Drag row within a phase | `onTaskMove` → `onTasksChange` | Order on the moved sibling set. Rejected with a Notice when no Order property is configured. |
| Draw a range / Add task | `onTaskCreate` | New note from the template (`NoteTemplateService`, unchanged API) with Start/End prefilled; Parent prefilled when drawn on a phase row |
| Detail panel field edit | `onTasksChange` or direct | Same as the equivalent gesture |

Rules:

- **Link format.** Written links use the same wiki-link form the Frappe view already writes
  (`toWikiLink`), so FS stays readable by Frappe Gantt. Existing list/comma shapes are
  preserved (append/remove within the shape the property already has).
- **Failure.** A failed write shows a Notice and re-passes the previous array so the bar
  reverts (library-supported optimistic-revert pattern).
- **Batching.** One gesture may touch many notes (summary drag, cascade). Writes are issued as
  one batch; Bases updates arriving mid-batch are coalesced (existing `RenderScheduler`).
- **Echo suppression.** The re-render that Bases triggers after our own write must not reset
  scroll, selection, collapse state, or the open detail panel.
- **Order values.** Reordering renumbers the affected siblings with gaps (10, 20, 30, …) and only
  writes notes whose value changed.

### 3.5 Move dependent tasks (D6)

Carried over from `persistDependencyDateChanges`, generalized to four types. Option
"Move dependent tasks" (default off). When a gesture moves an edge of task A by Δ, each
successor B linked to A via a type whose predecessor edge moved (FS/FF → A's finish; SS/SF →
A's start) is shifted by Δ with its duration preserved, recursively, visiting each task once per
gesture (cycle-safe). If B is reached by several moved predecessors, the delta with the largest
absolute value wins. The cascade is previewed nowhere (library limitation) and applied after
the gesture commits. The cascade is calculated in `src/core/gantt/` so it can be unit-tested
without Obsidian.

### 3.6 Bases view options

Keys are Gantt Beta's own; none are shared with the Frappe view's config so the two views never
fight over a `.base` file.

- **Properties:** Start date, End date, Label, Parent (phase), Order, Progress, Color by,
  Depends on (FS), Starts with (SS), Finishes with (FF), Start-to-finish (SF).
- **Timeline:** Scale (day/week/month/quarter/year; also persisted when changed on the chart),
  Show non-working days, Working weekdays (multitext, default Mon–Fri), Holidays (multitext of
  `YYYY-MM-DD`), Snap to working days, First day of week, Zoom with Ctrl/Cmd + wheel,
  Infinite scroll, Scroll to today on open.
- **Layout:** Phases (hierarchy), Task list, Row numbers, Detail panel, Show progress,
  Tooltip, Row height (CSS-only option via `ViewOptionSchema`).
- **Editing:** Read only, Move bars, Resize bars, Edit progress, Draw dependencies, Delete
  dependencies, Reorder rows, Create by drawing, Move dependent tasks, Write phase dates.
- **Note template:** Template note, Target folder, Title format (same semantics as today).
- **Persisted UI state:** collapsed phase ids and the current scale are stored in the view
  config (`config.set`), not in plugin settings.

### 3.7 UI

- **Toolbar** (the library renders none): scale picker, Today, Zoom to fit, Add task (when
  creation is enabled), collapse all / expand all. Built with Obsidian DOM helpers and
  `setIcon`, above the chart.
- **Theme:** `theme` prop set from `body.theme-dark` (observed), and `--gantt-*` tokens mapped to
  Obsidian CSS variables in `src/styles/views/gantt-beta.css`. The library stylesheet is merged
  through the existing CSS merge plugin without rewriting (it has no `:root` selectors).
- **Detail panel (D9):** note title (opens the note), start/end, progress, dependencies per
  type (as links, each removable), and the Base's visible properties (`config.getOrder()`)
  rendered read-only. Date/progress fields are editable and write back via §3.4.
- **Click / hover (D8):** `onTaskClick` opens the note through the existing navigation helper
  (respecting modifiers); hover preview uses a delegated `mouseover` listener reading
  `data-task-id`, like the other views.
- **Locale:** `locale` from Obsidian's moment locale; `firstDayOfWeek` from the option.
- **Empty/unscheduled state:** when entries lack a start date, list them with a hint naming the
  configured property, as the Frappe view does.
- **Mobile:** library touch model (400 ms hold to drag); toolbar collapses to icons.

## 4. Non-goals

- Changing or removing the Frappe Gantt view, its option keys, or its ID (frozen, §9).
- Expected progress, Hour/Quarter day/Half day scales, a context menu, and Gantt command-palette
  commands (D6). Recorded as follow-ups in §12, not planned.
- Moving rows into a synthetic Bases group phase (would require writing the group-by property,
  which may be a formula).
- Automatic rescheduling to satisfy dependency constraints beyond §3.5's delta cascade.
- PDF/image export, resource/workload views, multi-select editing (not in the library).
- Localising the library's own built-in strings (English only upstream).
- Redesigning note creation — `docs/specs/note-template.md` owns that; Gantt Beta calls the
  existing `NoteTemplateService` API as-is.

## 5. Constraints and known library limitations

| Limitation (v1.5.1) | Handling |
|---|---|
| React peer dependency | D1: `preact/compat` alias; pnpm `peerDependencyRules` for the missing React peer. |
| UTC-only layout | D7 floating-time adapter. The built-in today line and "Add task" draft are computed in UTC, so between local midnight and UTC midnight they can sit one column off; the plan investigates positioning our own marker, else it is documented. |
| Exclusive end dates | Converted on read/write (§3.2). |
| Global `document` listeners and `document.body` cursor | Drags inside an Obsidian popout window may not work. Documented limitation for Beta; plan opens an upstream issue/PR to use the element's `ownerDocument`. Never monkey-patched (existing guard). |
| Whole-array `onTasksChange` | Diffing (§3.4). |
| No context-menu/hover callbacks | Delegated listeners on `data-task-id`. |
| Deleting a link removes all types for that pair | Mirrored when writing (§3.4). |
| Fixed 28 px bar height | Only row height is configurable. |
| Single maintainer, fast release cadence | Exact version pin, provenance ledger entry, characterization tests around the adapter before any upgrade. |

## 6. Shared code policy

Gantt Beta is the priority consumer of anything shared. New shared modules (Bases → task
mapping helpers, link/dependency parsing and writing, date floating/inclusive conversion,
cascade) are designed for Gantt Beta's needs first. The frozen Frappe view keeps its own code;
if a shared change would affect Frappe Gantt (e.g. a helper it imports changes behavior), the
change is either kept backward compatible or the impact is recorded as a follow-up in
[gantt.md](gantt.md) §8 and `tasks/gantt/todo.md` rather than fixed in the Frappe view now.

## 7. Architecture guard changes

- Add `src/views/gantt-beta/` to `GUARDED_MUTATION_DIRS`: no direct mutation calls there.
- Add a declared capability (e.g. `capabilities.propertyWrite`) to `ViewCapabilities`,
  granted to Gantt Beta only, and a guard test asserting that only descriptors declaring it
  receive a mutation gateway.
- `FORBIDDEN_DEPENDENCIES` unchanged; add a test that the production bundle contains no
  `react-dom` code (the alias actually applied).

## 8. Verification policy

1. Phase 0 spike is a hard gate: nothing else starts until preact/compat compatibility is proven.
2. Pure logic (`src/core/gantt/`) is unit-tested first: mapping, sequence, phases, date
   conversion round-trips (date and datetime, inclusive end), dependency parsing/writing per
   type, diffing, cascade.
3. The view is tested in happy-dom with the real library mounted through Preact: a simulated
   `onTasksChange`/`onDependencyCreate`/`onTaskMove`/`onTaskCreate` produces the expected
   mutation-capability calls (no real vault writes).
4. `pnpm run check` after every task; `pnpm run build && pnpm run verify:artifacts` after any
   dependency or CSS change.
5. Native acceptance on desktop and mobile before the stability gate.

## 9. Frappe Gantt workstream (frozen)

Per D11, `docs/specs/gantt.md` is frozen at GAN-001 (complete). GAN-002–GAN-005 are deferred;
Frappe Gantt receives bug fixes only. The listener leak (gantt.md §2.3) and the monolithic
`BasesGanttView.ts` remain as-is until the removal workstream deletes them. GAN-005 (a drag
dependency editor for Frappe) is superseded by Gantt Beta's built-in link drawing.

## 10. Definition of done (Gantt Beta workstream)

1. Gantt Beta is registered as `wise-view-gantt-beta` and every §3 behavior works, including all
   §3.4 write paths.
2. All options in §3.6 are exposed through Bases and persisted in the view config.
3. Writes happen only through mutation capabilities; guard tests from §7 pass.
4. `pnpm run check` and `pnpm run build && pnpm run verify:artifacts` pass;
   `THIRD_PARTY_NOTICES.md` and `docs/architecture/upstream-provenance.md` list
   `@jaeungkim/gantt-chart` (and its bundled `zustand`), `dayjs`, and `preact`'s compat use.
5. Native acceptance recorded in `tasks/gantt-beta/native-acceptance.md`.
6. `ROADMAP.md`'s Gantt Beta row is updated.

## 11. Stability gate (Beta → replaces Frappe)

Gantt Beta may replace Frappe Gantt when all hold:

- §10 is met.
- Native acceptance passes on desktop **and** mobile, including popout-window behavior recorded
  (works, or accepted as a documented limitation).
- No open bug that loses or corrupts property data.
- The maintainer records an explicit decision in this spec.

Then a new workstream ("Gantt Frappe removal") is created with its own spec/plan/tasks: remove
`frappe-gantt`, `BasesGanttView.ts`, its CSS scoping in `esbuild.config.mjs`, its notices and
provenance entries, the `wise-view-gantt` registration, and document how users switch their
`.base` views (D3).

## 12. Follow-ups (not planned)

- Expected progress on Gantt Beta.
- Sub-day scales (requires upstream support for custom scales or a fork).
- Context menu and command-palette commands for Gantt Beta.
- Moving rows between synthetic Bases group phases.
- Upstream: `ownerDocument`-aware listeners (popout windows), local-time today marker.
