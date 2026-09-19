# Implementation plan: Gantt Beta (`@jaeungkim/gantt-chart`)

Status: Approved 2026-09-19 — Gate 1 passed (desktop spike)
Specification: [../../docs/specs/gantt-beta.md](../../docs/specs/gantt-beta.md)
Roadmap: [../../ROADMAP.md](../../ROADMAP.md)
Baseline: branch `dev`

## Overview

Gantt Beta is a new view in `src/views/gantt-beta/` with its pure logic in `src/core/gantt/`.
The riskiest unknown — whether the library runs on `preact/compat` inside Obsidian — is proven
first. Then the order is: build and guard plumbing, read-only rendering, write-back, full UI,
hardening, native acceptance. Each phase leaves a working (if partial) view behind a registered
ID, so progress can be checked in a real vault at every checkpoint.

## Phase 0: Spike — preact/compat compatibility (gate)

- Throwaway branch: install `@jaeungkim/gantt-chart@1.5.1` (exact) and `preact` (direct
  dependency), alias `react`, `react-dom`, `react/jsx-runtime` to Preact in esbuild, and mount
  the chart with hard-coded tasks in a minimal Bases view.
- Check in a real vault: render, move, resize, progress drag, link drawing and deletion,
  hierarchy collapse, row reorder, draw-to-create, detail panel, keyboard navigation, theme
  switch, a popout window, and mobile.
- Record bundle size delta, console warnings, and the popout result.

### Checkpoint 0 (Gate 1)

- Written spike report in `tasks/gantt-beta/spike-report.md`: every checked interaction marked
  works / broken / workaround, and the bundle delta.
- Maintainer decides: proceed on preact/compat, or open a separate decision for React.

## Phase 1: Foundations

- Dependencies and build: exact pin, esbuild alias, pnpm `peerDependencyRules`, library CSS
  merged via `createCssMergePlugin`, `THIRD_PARTY_NOTICES.md` and provenance entries.
- Architecture: capability grant per the decision record, guard updates (§7 of the spec),
  bundle check that no `react-dom` code ships.
- View skeleton: descriptor `wise-view-gantt-beta`, a `ViewRuntime`-based view that mounts and
  unmounts the chart through Preact `render`, theme wiring, `--gantt-*` → Obsidian token CSS.

### Checkpoint A

- `pnpm run check`, `pnpm run build`, `pnpm run verify:artifacts` pass.
- Gantt Beta appears in Bases' view picker and renders a static chart that follows the theme.

## Phase 2: Read path (pure core + mapping)

- `src/core/gantt/`: floating date conversion (date/datetime, inclusive↔exclusive end),
  progress parsing, dependency link parsing per type, phase tree (parent notes, out-of-results
  parents, Bases groups), sequence builder (Order property or Bases sort), cycle reporting.
- View mapping: Bases entries → library `Task[]` with the §3.2 rules; option schema (§3.6) with
  all keys; unscheduled/empty state.

### Checkpoint B

- Unit tests cover every §3.2 row and §3.3 case.
- In a real vault, a Base with parent notes and `Group by` renders phases with roll-up and
  collapse, read-only (editing off).

## Phase 3: Write path

- Diff engine (`src/core/gantt/diff.ts`): previous vs. next `Task[]` → a list of field changes.
- Change → mutation plan: date formatting per property type, progress, order renumbering,
  parent writes, dependency append/remove per type preserving the property's shape.
- Wiring: `onTasksChange`, `onDependencyCreate`/`onDependencyDelete`, `onTaskMove`,
  `onTaskCreate` → mutation capabilities; batching, failure revert, echo suppression.
- Dependent-task cascade (§3.5) and "Write phase dates".

### Checkpoint C (Gate 2)

- Round-trip tests: every gesture in the spec §3.4 table writes exactly the expected properties
  and nothing else; a failed write reverts the chart.
- Real-vault check of every §3.4 row, including a summary drag with cascade on.
- Maintainer approves the write behavior before UI polish starts.

## Phase 4: Full UI

- Toolbar (scale picker, Today, Zoom to fit, Add task, collapse/expand all).
- Detail panel renderer (§3.7), click-to-open and hover preview, persisted scale and collapse
  state, locale, working calendar options, row height CSS-only option, mobile toolbar.

### Checkpoint D

- Every §3.6 option has a visible effect and persists across reopening the `.base` file.
- View tests cover toolbar actions, detail panel edits, click/hover navigation.

## Phase 5: Hardening

- Large-Base check (hundreds of entries): virtualization works, a single gesture's write burst
  does not freeze the UI.
- Today-marker investigation (UTC vs. local); popout limitation documented and upstream issue/PR
  opened; unresolved links, formula properties, and missing-template paths handled with Notices.
- Frappe follow-ups recorded if any shared module changed Frappe-visible behavior.

### Checkpoint E

- `pnpm run check`, build, and artifact verification pass; the known-limitations list in the
  spec §5 matches reality.

## Phase 6: Native acceptance and stability gate

- Desktop and mobile native acceptance, recorded.
- Stability gate evaluation (spec §11).

### Checkpoint F: Gantt Beta workstream complete (Gate 3)

- Native acceptance recorded; `ROADMAP.md` updated.
- Maintainer decides whether the stability gate is met. If yes, create the "Gantt Frappe
  removal" workstream (spec/plan/tasks) — not part of this plan.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Library breaks under preact/compat (hooks, event timing, `useSyncExternalStore`) | High | Phase 0 gate before any other work; fallback is a separate React decision, not a silent guard change |
| Upstream API churn (6 minor releases in 5 days; single maintainer) | High | Exact pin; adapter isolates the library to `src/views/gantt-beta/chart*`; upgrade only via a task that reruns the Phase 3 round-trip tests |
| Date drift from UTC/exclusive-end conversions | High (data) | Pure conversion module with exhaustive round-trip tests (date, datetime, DST dates, month/year ends) before any write is wired |
| Write bursts conflict with other plugins or sync | Medium | Changed-fields-only writes, batching, decision record's compatibility notes |
| Bases re-render after our own write resets UI state | Medium | Echo suppression and controlled `collapsedIds`/`detailTaskId` |
| Popout windows: drag listeners on the main `document` | Medium | Documented limitation for Beta; upstream PR; recorded in native acceptance |
| Synthetic phases confuse users (read-only rows) | Low | Distinct styling and tooltip; reorder into them rejected with a clear Notice |
| Shared helper changes alter Frappe behavior | Low | Spec §6 policy: keep backward compatible or record a Frappe follow-up |

## Human gates

- Gate 1: approve the spike result and runtime (Phase 0).
- Gate 2: approve write-back behavior on a real vault (Phase 3).
- Gate 3: accept native testing and decide on the stability gate (Phase 6).
