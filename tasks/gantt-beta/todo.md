# Tasks: Gantt Beta (`@jaeungkim/gantt-chart`)

Plan: [plan.md](plan.md)
Specification: [../../docs/specs/gantt-beta.md](../../docs/specs/gantt-beta.md)

## Phase 0: Spike

### GBETA-001: Prove the library on preact/compat inside Obsidian

**Status:** Complete (2026-09-19) — Gate 1 approved on desktop evidence; keyboard, popout, and
mobile moved to GBETA-017. Report: [spike-report.md](spike-report.md) (spike code stays on
`codex/spike-gantt-beta`, not merged).

**Description:** On a throwaway branch, install `@jaeungkim/gantt-chart@1.5.1` (exact) and
`preact`, alias `react`/`react-dom`/`react/jsx-runtime` to Preact in esbuild, and mount the chart
with hard-coded tasks in a minimal Bases view. Exercise every interaction listed in plan
Phase 0 in a real vault, on desktop, in a popout window, and on mobile.

**Acceptance criteria:**

- [x] `tasks/gantt-beta/spike-report.md` marks each interaction works / broken / workaround.
- [~] Bundle size delta (`main.js`, `styles.css`) and console warnings recorded — sizes recorded
  (`main.js` about +100 KB, see GBETA-002; `styles.css` +24 KB); console review carried into GBETA-017.
- [~] Popout-window behavior recorded — moved to GBETA-017.

**Verification:** Manual, in a real vault; the report is the deliverable. Spike code is not merged.

**Dependencies:** none.

**Likely files:** `tasks/gantt-beta/spike-report.md` (spike branch only for code)

**Estimated scope:** M

## Phase 1: Foundations

### GBETA-002: Dependencies, build alias, CSS merge, notices

**Status:** Complete (2026-09-19). Production `main.js` without the library imported: 542,922
bytes (spike with the library: 644,308 bytes, so about +100 KB once GBETA-004 imports it).
`styles.css`: 117,438 bytes including the unmodified library stylesheet.

**Description:** Add `@jaeungkim/gantt-chart` (exact `1.5.1`) and `preact` as dependencies;
configure esbuild aliases and pnpm `peerDependencyRules`; merge the library stylesheet through
`createCssMergePlugin` without transformation; add `THIRD_PARTY_NOTICES.md` entries (library,
its bundled `zustand`, `dayjs`) and a provenance ledger entry with the pinned version.

**Acceptance criteria:**

- [x] `pnpm run build && pnpm run verify:artifacts` pass.
- [x] A test asserts the production bundle contains no `react-dom` implementation (alias applied) —
  `tests/ui-runtime-bundle.test.mjs` bundles the library with the same alias module the production
  build uses; `main.js` itself only includes the library from GBETA-004 on.
- [x] `FORBIDDEN_DEPENDENCIES` guard still passes unchanged.

**Verification:** `pnpm run check && pnpm run build && pnpm run verify:artifacts`

**Dependencies:** GBETA-001 (Gate 1 approved).

**Likely files:** `package.json`, `pnpm-lock.yaml`, `esbuild.config.mjs`, `THIRD_PARTY_NOTICES.md`,
`docs/architecture/upstream-provenance.md`, `tests/architecture.test.ts`

**Estimated scope:** M

### GBETA-003: Write capability grant and guard updates

**Status:** Complete (2026-09-19). `capabilities.mutations` + `APPROVED_MUTATION_GRANT_VIEW_IDS`
in `src/viewRegistry.ts`, `createGrantedMutations` in `src/platform/mutations/grants.ts`, and a guard
rule that `src/views/gantt-beta/` never imports `LegacyMutationGateway`.

**Description:** Implement the decision record: add an explicit write capability to
`ViewCapabilities`, have the registry hand a mutation gateway only to descriptors declaring it,
add `src/views/gantt-beta/` to `GUARDED_MUTATION_DIRS`.

**Acceptance criteria:**

- [x] A fixture with a direct `processFrontMatter` call under `src/views/gantt-beta/` fails the guard.
- [x] A descriptor without the capability receives no gateway (test).
- [x] Existing legacy views are unaffected.

**Verification:** `pnpm run test -- architecture view-registry mutation-capability && pnpm run typecheck`

**Dependencies:** none (can run in parallel with GBETA-002).

**Likely files:** `src/viewRegistry.ts`, `src/main.ts`, `src/platform/mutations/*`,
`tests/architecture.test.ts`, `tests/view-registry.test.ts`

**Estimated scope:** S

### GBETA-004: View skeleton, mount/unmount, theme

**Status:** Complete (2026-09-19). Automated lifecycle/theme tests pass; maintainer supplied
native light/dark screenshots confirming picker registration, static rendering, and live repaint.

**Description:** Register `wise-view-gantt-beta` ("Gantt Beta"). The view mounts the chart with
Preact `render` into its container, unmounts on unload, passes `theme` from `body.theme-dark`
(observed), and maps `--gantt-*` tokens to Obsidian variables in
`src/styles/views/gantt-beta.css` (added to `FIRST_PARTY_CSS`).

**Acceptance criteria:**

- [x] View appears in Bases' view picker and renders a static chart.
- [x] Switching Obsidian theme repaints the chart without reopening.
- [x] Unload leaves no mounted Preact tree (test).

**Verification:** `pnpm run check`; manual check in a vault.

**Dependencies:** GBETA-002, GBETA-003.

**Likely files:** `src/views/gantt-beta/BasesGanttBetaView.ts`, `src/views/gantt-beta/chartHost.ts`,
`src/views/gantt-beta/index.ts`, `src/styles/views/gantt-beta.css`, `esbuild.config.mjs`,
`src/main.ts`, `tests/gantt-beta-view.test.ts`

**Estimated scope:** M

## Phase 2: Read path

### GBETA-005: Floating date and progress conversion (core)

**Status:** Complete (2026-09-19). Date/date-time conversion and progress parsing are pure core
modules; 29 focused tests pass in the `America/New_York` test timezone.

**Description:** Pure functions: property value → library date string and back, for `Date`
(inclusive end ↔ exclusive end) and `Date & time` (floating wall-clock), reading `Z`/offset
values as local wall-clock; progress parsing and clamping.

**Acceptance criteria:**

- [x] Round-trip tests: read → write returns the original string for date, datetime, month/year
  ends, leap day, and DST-transition dates in a non-UTC test time zone.
- [x] `Z`/offset input is converted to local wall-clock; output never contains an offset.

**Verification:** `pnpm run test -- gantt-core-dates`

**Dependencies:** none.

**Likely files:** `src/core/gantt/dates.ts`, `src/core/gantt/progress.ts`, `tests/gantt-core-dates.test.ts`

**Estimated scope:** S

### GBETA-006: Dependency links per type (core)

**Status:** Complete (2026-09-19). Pure parsing/edit helpers cover FS/SS/FF/SF and the existing
Frappe view now shares the exact wiki-link formatter; focused Gantt tests pass.
The public Gantt Beta v1 UX now uses only Depends on → FS. The generic converter remains internal
so the adapter does not erase scheduling vocabulary or block future descriptive analysis.

**Description:** Parse FS/SS/FF/SF property values (list or comma string of links) into
`TaskDependency[]` given a link resolver; produce append/remove edits that preserve the
property's existing shape and the Frappe-compatible wiki-link form.

**Acceptance criteria:**

- [x] Append/remove preserve list vs. comma shape and leave unresolved links untouched.
- [x] Removing a pair removes it from every type property (library semantics).
- [x] Written FS values match what the Frappe view's `toWikiLink` produces (test against its output).

**Verification:** `pnpm run test -- gantt-core-dependencies`

**Dependencies:** none.

**Likely files:** `src/core/gantt/dependencies.ts`, `tests/gantt-core-dependencies.test.ts`

**Estimated scope:** S

### GBETA-007: Phase tree and sequence builder (core)

**Status:** Complete (2026-09-19). Pure phase/sequence modules cover grouped and external
synthetic phases, cross-group fallback, cycle reporting, and DFS sequencing; randomized tree
invariants pass across 100 generated cases.

**Description:** Build the phase tree from parent links, out-of-results parents (synthetic
rows), and Bases groups (synthetic top-level rows); detect cycles; compute `sequence` from Order
values or input (Bases sort) order.

**Acceptance criteria:**

- [x] Tests cover every spec §3.3 case, including cross-group parents and unresolved parents.
- [x] Sequence is consistent with `parentId` for any input (property-based test on random trees).
- [x] Cycles are reported by note path and fall back to root.

**Verification:** `pnpm run test -- gantt-core-phases`

**Dependencies:** none.

**Likely files:** `src/core/gantt/phases.ts`, `src/core/gantt/sequence.ts`, `tests/gantt-core-phases.test.ts`

**Estimated scope:** M

### GBETA-008: Options schema and Bases → Task mapping

**Status:** Complete 2026-09-19. Automated mapping/options/fast-path checks pass; native desktop
acceptance confirmed Parent hierarchy, Bases Group by, roll-up/collapse, progress, and Color by.
Visual follow-ups are recorded in `native-acceptance.md` for the relevant UI/hardening tasks.

**Description:** Define all spec §3.6 options (row height CSS-only) and map Bases entries to
`Task[]` using GBETA-005–007, the existing `ColorResolver`, and formula-property detection.
Render read-only with the unscheduled/empty state.

**Acceptance criteria:**

- [x] Every spec §3.2 row has a mapping test.
- [x] Changing a CSS-only option does not rebuild the task array (render scheduler fast path).
- [x] A real Base with parent notes and `Group by` renders phases with roll-up and collapse.

**Verification:** `pnpm run check`; manual check in a vault.

**Dependencies:** GBETA-004, GBETA-005, GBETA-006, GBETA-007.

**Likely files:** `src/views/gantt-beta/options.ts`, `src/views/gantt-beta/taskMapping.ts`,
`tests/gantt-beta-view.test.ts`

**Estimated scope:** L

## Phase 3: Write path

### GBETA-009: Diff engine and mutation plan (core)

**Status:** Complete 2026-09-20. Pure task diffing and frontmatter mutation planning cover
dates, progress, Parent, sparse sibling Order, and Depends on while excluding synthetic rows.
The full quality gate passes (38 files, 376 tests).

**Correction 2026-09-20:** `writeGanttDate` rejected the ISO strings the library really emits
(Date properties silently wrote nothing) and read their `Z` as an instant (Date & time
properties moved by the local UTC offset). Fixed with timezone regression tests.

**Description:** Diff previous vs. next `Task[]` into field changes; translate changes into a
mutation plan (date formatting per property type, progress, parent, order renumbering with gaps,
Depends on edits), writing only changed fields of changed notes.

**Acceptance criteria:**

- [x] Summary drag diff yields one date change per moved descendant and none for untouched tasks.
- [x] Order renumbering writes only siblings whose value changed.
- [x] Synthetic rows never appear in a mutation plan.

**Verification:** `pnpm run test -- gantt-core-diff`

**Dependencies:** GBETA-005, GBETA-006, GBETA-007.

**Likely files:** `src/core/gantt/diff.ts`, `src/core/gantt/mutationPlan.ts`, `tests/gantt-core-diff.test.ts`

**Estimated scope:** M

### GBETA-010: Wire gestures to mutation capabilities

**Status:** Complete 2026-09-20. `GanttBetaWriteBack` routes each gesture to the granted
capabilities; `EchoGate` holds Bases echoes of our own writes; a failed write remounts the chart
(the library ignores a re-passed identical array). Resize now also requires an End property.
Native confirmation of "scroll/collapse/detail preserved after a write" is part of GBETA-012.

**Correction 2026-09-20 (native report):** a second dependency on one task made both lines vanish.
One text value "[[A]], [[B]]" written to a List-type property comes back from Bases as a single item,
which the parser could not split. Parsing now reads every link inside an item, new dependencies are
written as a list (text only for a text-typed property), and the writer remembers what it just wrote
so a second draw before Bases echoes the first cannot overwrite it. Obsidian showed a "Gantt chart"
tooltip because the library sets `aria-label` on the whole treegrid; `TooltipGuard` moves it to
`aria-labelledby`.

**Correction 2026-09-20 (second native report):** `depend_on` grew `[[[[[[[[persona/...`. Bases reports
the damaged text `[[[[Note]]` with target `[[Note`, and both the read path and the write path wrapped
that target in `[[ ]]` again, two brackets per round trip. Wrapping is now idempotent
(`wikiLinkText`), damaged values parse and heal on the next write, and links are written the way
Obsidian would generate them (shortest path per the vault's link settings) instead of as full vault
paths. Notes already damaged are repaired only when their dependencies are next edited.

**Description:** Connect `onTasksChange`, `onDependencyCreate`/`Delete`, `onTaskMove` (reject
into synthetic group phases; reject in-phase reorder without an Order property), and
`onTaskCreate` (template note with Start/End prefilled via `NoteTemplateService`) to the
capabilities. Batch writes, revert on failure with a Notice, and suppress the echo re-render's
reset of scroll/selection/collapse/detail state.

**Acceptance criteria:**

- [x] Each spec §3.4 row has a test asserting the exact capability calls.
- [x] End-to-start drawing writes one Depends on link; other endpoint combinations are rejected
  without changing frontmatter.
- [x] A rejected write reverts the bar and shows a Notice.
- [x] After a write, scroll position, collapse state, and the open detail panel are preserved.

**Verification:** `pnpm run test -- gantt-beta && pnpm run typecheck`

**Dependencies:** GBETA-003, GBETA-008, GBETA-009.

**Likely files:** `src/views/gantt-beta/writeBack.ts`, `src/views/gantt-beta/BasesGanttBetaView.ts`,
`tests/gantt-beta-writeback.test.ts`

**Estimated scope:** L

### GBETA-011: Dependency schedule policy and write phase dates

**Status:** Complete 2026-09-20. The pure cascade engine implements no-shift, overlap repair,
and maintain-gap propagation across chains/diamonds with cycle-safe single processing. Write-back
adds shifted successors to the same capability batch; phase rows remain derived by default and,
when enabled, write with each phase note's own Date/Date & time storage type.

**Description:** Implement spec §3.5 in core: no automatic shift, minimum overlap repair, and
maintain-gap cascade. Preserve successor duration, remain cycle-safe, and apply the selected
policy plus "Write phase dates" after a committed gesture in the same write batch.

**Acceptance criteria:**

- [x] Tests cover overlap repair and maintain-gap across chains, diamonds, and cycles.
- [x] Every automatic successor move preserves its original duration.
- [x] With dependency shifting set to none and phase-date writes off, no extra notes are written.
- [x] Phase-date writes use the phase note's own property types.

**Verification:** `pnpm run test -- gantt-core-cascade gantt-beta-writeback`

**Dependencies:** GBETA-010.

**Likely files:** `src/core/gantt/cascade.ts`, `src/views/gantt-beta/writeBack.ts`, `tests/gantt-core-cascade.test.ts`

**Estimated scope:** M

### GBETA-012: Gate 2 — real-vault write-back review

**Description:** Walk through every spec §3.4 row in a real vault (including cascade and phase
dates) and record results for the maintainer.

**Acceptance criteria:**

- [x] Results recorded in `tasks/gantt-beta/native-acceptance.md` (write-back section).
- [x] Maintainer approval recorded.

**Verification:** Manual.

**Dependencies:** GBETA-011.

**Likely files:** `tasks/gantt-beta/native-acceptance.md`

**Estimated scope:** S

## Phase 4: Full UI

### GBETA-013: Toolbar and persisted UI state

**Description:** Toolbar with scale picker, Today, Zoom to fit, Add task, collapse/expand all,
driven by the chart `ref`; persist scale (`onScaleChange`) and collapsed ids
(`onCollapsedChange`) in the view config; compact icon toolbar on mobile.

**Acceptance criteria:**

- [x] Scale and collapse state survive closing and reopening the `.base` file.
- [x] The visible scale indicator/picker updates after Ctrl/Cmd + wheel and picker changes update
  the chart without reopening view settings.
- [x] Toolbar actions tested through the ref API.

**Verification:** `pnpm run test -- gantt-beta && pnpm run typecheck`

**Dependencies:** GBETA-008.

**Likely files:** `src/views/gantt-beta/toolbar.ts`, `src/styles/views/gantt-beta.css`

**Estimated scope:** M

### GBETA-014: Detail panel renderer

**Status:** Complete (2026-09-20). Custom detail rendering uses the chart's `update` callback for
Start, End, Duration, and Progress; dependency removal is authorized by the existing dependency
callback before the same task-array write path runs. Visible Base properties retain configured
order, and timezone context is limited to zoned Start/End source values.

**Correction 2026-09-20:** Duration read `Date.parse(end + 'Z')`, which is NaN for the ISO strings
the library emits right after an edit (Duration went blank and typing one did nothing). It now
accepts both plain and Z-suffixed chart dates.

**Layout 2026-09-20:** minimal, stacked panel: the close button sits alone on the top row, labels sit
above their values (Start and End full width, Duration and Progress side by side), and property
names sit above their values. The title and every note link are Page Preview and right-click targets.

**Description:** `renderDetail` showing note title (opens the note), editable start/end,
editable Duration (recomputes End), progress, Depends on links (removable), and the Base's
visible properties read-only. Date fields use day precision; Date & time fields retain hour and
minute precision. If an input property carried `Z` or an offset, show the runtime context such as
`Local time · Asia/Jakarta`, obtained from the owning window, without claiming the offset will be
preserved on write.

**Acceptance criteria:**

- [x] Edits write through the same paths as gestures (no second write path).
- [x] Visible properties follow the Base's property order.
- [x] Date never exposes a hidden hour; Date & time exposes hour/minute and editable Duration.
- [x] Zoned input displays the local timezone context; unzoned local-floating input does not add
  a misleading timezone label.

**Verification:** `pnpm run test -- gantt-beta-detail`

**Dependencies:** GBETA-010.

**Likely files:** `src/views/gantt-beta/detailPanel.ts`, `tests/gantt-beta-detail.test.ts`

**Estimated scope:** M

### GBETA-019: Derived dependency status (Blocks, blocked, date conflict)

**Status:** Complete 2026-09-20. `src/core/gantt/dependencyStatus.ts` derives blocks, blocked and
date-conflict state from Depends on; the view tags bars through `Task.className`, and the detail
panel shows names, links, warnings, and a Blocks section. Nothing new is written to frontmatter.

**Description:** Spec §3.5.1. Read Depends on from both sides, flag tasks that wait on unfinished
predecessors or start before a predecessor ends, and surface both in the chart and detail panel.

**Acceptance criteria:**

- [x] Blocks is derived, never stored; no property or write path is added.
- [x] Blocked needs a Progress property and is hidden without one.
- [x] A predecessor ending exactly when the task starts is not a conflict; Z-suffixed and plain chart
  dates compare correctly.
- [x] Detail panel lists predecessors by name (not vault path), opens notes on click, and lists what
  the task blocks.

**Verification:** `pnpm run test -- gantt-core-dependency-status gantt-beta-detail`

**Dependencies:** GBETA-014.

**Likely files:** `src/core/gantt/dependencyStatus.ts`, `src/views/gantt-beta/detailPanel.ts`,
`src/views/gantt-beta/BasesGanttBetaView.ts`, `src/styles/views/gantt-beta.css`

**Estimated scope:** M

### GBETA-015: Click-to-open, hover preview, locale, working calendar

**Status:** Navigation part complete 2026-09-20 (`src/views/gantt-beta/navigation.ts`): Page Preview on
hover, the open-in-tab/right/above/below/left/window menu on right-click, and modifier-click to open,
for bars, list rows, and the detail panel's title and links. Plain click still selects and opens the
detail panel. The library hover card hides while Ctrl/Cmd is held. Holiday/weekday shading and snap
still need native confirmation.

**Description:** `onTaskClick` opens the note via the existing navigation helper (modifier →
new tab); delegated hover preview on `data-task-id`; `locale` from Obsidian; working weekdays,
holidays, snap, and first-day-of-week options wired to the chart.

**Acceptance criteria:**

- [x] Navigation and hover tests match the other views' behavior.
- [x] Hover presents one unambiguous tooltip/preview layer; the library tooltip and Obsidian
  preview do not overlap.
- [ ] Holidays and weekdays shade and snap as configured.

**Verification:** `pnpm run test -- gantt-beta && pnpm run typecheck`

**Dependencies:** GBETA-008.

**Likely files:** `src/views/gantt-beta/navigation.ts`, `src/views/gantt-beta/BasesGanttBetaView.ts`

**Estimated scope:** S

## Phase 5: Hardening

### GBETA-016: Scale, limitations, and upstream follow-ups

**Description:** Large-Base check (hundreds of entries), today-marker investigation (own
local-time marker or documented offset), popout limitation documented and an upstream
issue/PR opened for `ownerDocument` listeners, Notices for unresolved links, formula
properties, and a missing template. Record any Frappe-visible side effect of shared modules in
`docs/specs/gantt.md` §8.

**Acceptance criteria:**

- [ ] Spec §5 table matches observed behavior.
- [ ] Progress fill remains distinguishable for configured light and dark bar colors in both
  Obsidian themes.
- [ ] No UI freeze on a single gesture in the large-Base check (measured, recorded).

**Verification:** `pnpm run check && pnpm run build && pnpm run verify:artifacts`

**Dependencies:** GBETA-010–GBETA-015.

**Likely files:** `docs/specs/gantt-beta.md`, `docs/specs/gantt.md`, `src/views/gantt-beta/*`

**Estimated scope:** M

## Phase 6: Native acceptance and stability gate

### GBETA-017: Native acceptance (desktop and mobile)

**Description:** Full native pass of spec §3 on desktop, mobile, and a popout window.

**Acceptance criteria:**

- [ ] `tasks/gantt-beta/native-acceptance.md` complete.
- [ ] No open data-loss/corruption bug.
- [ ] `ROADMAP.md` Gantt Beta row updated.

**Verification:** Native testing; `pnpm run check`.

**Dependencies:** GBETA-016.

**Likely files:** `tasks/gantt-beta/native-acceptance.md`, `ROADMAP.md`

**Estimated scope:** S

### GBETA-018: Stability gate decision

**Description:** Evaluate spec §11 with the maintainer. If met, record the decision in the spec
and create the "Gantt Frappe removal" workstream docs (spec/plan/tasks) and ROADMAP row.

**Acceptance criteria:**

- [ ] Decision recorded in `docs/specs/gantt-beta.md` §11.
- [ ] If approved, removal workstream docs exist and are linked from `ROADMAP.md`.

**Verification:** Documentation review.

**Dependencies:** GBETA-017.

**Likely files:** `docs/specs/gantt-beta.md`, `ROADMAP.md`, `docs/specs/gantt-frappe-removal.md` (new)

**Estimated scope:** S
