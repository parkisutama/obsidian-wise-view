# Implementation plan: Extensible view platform

Status: Draft; implementation requires approval  
Specification: [Extensible view platform for Wise View](../docs/specs/extensible-view-platform.md)  
Baseline: branch `dev`, commit `572895c`

## Scope and sequencing amendment (2026-09-19)

The maintainer descoped **Keep** from this plan entirely (Phase 8 and Checkpoint I below are
removed; Keep gets its own specification, plan, and task list later). The maintainer also
reordered delivery so **Masonry ships immediately after Grid, before Feed**, so the shared
card/layout components used by Swimlane, Grid, and Masonry are proven compatible — or
deliberately kept independent per view where unification risks destabilizing existing behavior,
per the T037 precedent — before Feed's preview/linear-virtualization layer is added on top.

This amendment renumbers phases and checkpoints below (old Phase 6/Feed and Phase 7/Masonry swap
to new Phase 6/Masonry and Phase 7/Feed; old Phase 8/Keep is removed; old Phase 9/hardening
becomes Phase 8). **Task IDs are unchanged** — T041-T045 remain Feed, T046-T050 remain Masonry,
T051-T055 (Keep) are removed from this plan's scope — because no Feed or Masonry task had started
and renumbering IDs would only cost churn without benefit. Function and continuous refactor
remain the priority: where Grid, Masonry, and Swimlane's shared components turn out incompatible
for a given piece of behavior, keep that piece per-view inside the shared component and record
the unification opportunity as deferred work, the same way T037 handled Swimlane's cover-image
resolution versus its full card rendering.

## Overview

Refactor the current plugin incrementally and use each new view as proof that the preceding shared capability is sufficient. This is deliberately not a horizontal rewrite followed by a late integration phase.

The delivery sequence is:

```text
Baseline and guardrails
        |
        v
Registry + lifecycle + modular regular CSS
        |
        v
Normalized data + config + color + navigation + render scheduling
        |
        +--> Temporal Core -------------> Timeline
        |
        +--> Card Model + Renderer ------> Grid
        |
        +--> Masonry Strategy -----------> Masonry
        |
        +--> Preview + Linear Virtual ---> Feed
        |
        v
Cross-view hardening, provenance, and native acceptance
```

Keep is out of scope for this plan (see the amendment above); it will follow its own
specification and plan once Grid, Masonry, and Feed are accepted.

Every phase ends in a working plugin and a human checkpoint. Existing view behavior is characterized before refactoring. New view implementation begins only after the shared capability it consumes has passed its own tests and has at least one existing consumer or a dedicated contract harness.

## Architecture decisions

1. Use capability-oriented modules, not a common inherited `BaseWiseView` god class.
2. Use immutable, path-keyed snapshots and never retain `BasesEntry` after an update cycle.
3. Keep pure domain code free of Obsidian imports.
4. Keep imperative DOM and Obsidian lifecycle primitives; add no React runtime.
5. Keep regular CSS; compile an explicitly ordered set of CSS source modules into one root artifact.
6. Keep view-specific configuration in Bases view options.
7. Isolate mutations behind explicit capabilities; new views are read-only by default, with Timeline quick scheduling approved on 2026-09-19 as a start/end-only capability.
8. Share card presentation and layout infrastructure, but keep Grid, Masonry, and Feed as separate view adapters. (Keep is descoped — see the amendment above.)
9. Share temporal parsing/range/coordinates, but keep FullCalendar, Frappe Gantt, and Timeline rendering engines independent.
10. Target Obsidian 1.10.2 and avoid 1.13-only APIs.

## Capability-to-view readiness matrix

| Capability completed | Existing proof | New view unlocked | Exit evidence |
|---|---|---|---|
| Descriptor registry and lifecycle runtime | Calendar, Gantt, Swimlane | all later views | registry and cleanup tests; no registration duplication |
| Ordered regular-CSS pipeline | all existing views | all later views | deterministic build; no Sass dependency |
| Entry snapshots, config, color, navigation, scheduler | all existing views | all later views | existing fixtures pass using shared services |
| Temporal Core and linear virtual rows | Calendar/Gantt contract tests | Timeline | Timeline handles large grouped fixtures; approved date edits stay behind the mutation capability |
| Card model and renderer | Swimlane cards | Grid | Grid renders through shared card handles |
| Pure masonry geometry, measurement, and scroll anchors | Card renderer, Grid | Masonry | bounded mounted cards and stable resize/return position |
| Content preview and dynamic linear virtualization | Grid/Masonry card shell | Feed | Feed renders visible read-only previews without editor leaves |

Keep's row (preset/sectioning layer) is removed from this matrix; it will appear in Keep's own
future plan once this platform's Masonry/Feed rows are proven.

## Phase 0: Approval, provenance, and baseline

Tasks T001-T005 establish authority and stop refactoring from changing unrecorded behavior.

- Approve the SPEC decision gates and mark the specification approved.
- Record every upstream snapshot and intended reuse mode.
- Strengthen characterization fixtures for Calendar, Gantt, and Swimlane.
- Correct the minimum Obsidian version and stale Kanban metadata.
- Add architecture guards for new-view writes, forbidden dependencies, view IDs, and import direction.

### Checkpoint A

- `pnpm run check` passes.
- Existing view behavior is represented by tests or explicitly listed as native-only acceptance.
- License/provenance decisions are reviewable before source adaptation begins.
- Human approval is recorded before Phase 1.

## Phase 1: Plugin shell and lifecycle foundation

Tasks T006-T011 build infrastructure needed by every view and migrate one existing view at a time.

- Introduce `ViewDescriptor` and a registry.
- Migrate registration, hover sources, and commands out of manual `main.ts` lists.
- Introduce owner-document/window helpers and a disposable runtime.
- Migrate Calendar lifecycle.
- Migrate Gantt lifecycle and eliminate global event-listener monkey-patching.
- Migrate Swimlane lifecycle, including touch, interval, observer, and virtual-card cleanup.

### Checkpoint B

- All three existing views register through the registry.
- Repeated mount/update/unmount tests report no owned resource left active.
- Gantt no longer replaces a global browser API.
- Native smoke confirms view switching and plugin reload.

## Phase 2: Modular regular CSS

Tasks T012-T016 separate authoring sources while preserving the single Obsidian artifact.

- Extend the CSS merge build to accept ordered first-party source modules.
- Add shared foundations and component primitives.
- Extract Calendar styles.
- Extract Gantt styles while preserving transformed Frappe CSS ordering.
- Extract Swimlane styles and temporary Planner/Kanban selector aliases.

The migration occurs view by view. A CSS task cannot change view behavior or visual intent unless separately documented.

### Checkpoint C

- The built root `styles.css` is deterministic across repeated builds.
- Source uses regular CSS only.
- Existing desktop/mobile light/dark screenshots show no unintended change.
- License markers remain present for vendor CSS.

## Phase 3: Shared Bases data and interaction foundation

Tasks T017-T027 create the common path every current and future view uses.

- Define `NormalizedValue`, `EntrySnapshot`, and requested-property contracts.
- Adapt Bases results into immutable grouped/ungrouped snapshots.
- Centralize view-config validation and defaults.
- Centralize color resolution and Pretty Properties integration.
- Centralize navigation, context menus, and hover preview.
- Add render epochs, cancellation, signatures, and CSS-only fast paths.
- Put existing write operations behind legacy mutation capabilities.
- Migrate Calendar, Gantt, and Swimlane to the shared data/interaction services separately.
- Rename internal Planner identifiers and remove the unused task model after reference checks.

### Checkpoint D

- Existing view fixtures no longer depend on duplicated property/color/hover implementations.
- No long-lived model in migrated paths stores `BasesEntry`.
- Direct mutation APIs remain only inside declared legacy capability modules.
- Public view IDs and stored options are unchanged.

## Phase 4: Temporal Core to Timeline

Tasks T028-T034 plus native-fidelity follow-ups T034A-T034C are the first complete
shared-component-to-new-view slice.

- Build pure strict date/range semantics.
- Build zoom, tick, time-domain, and coordinate calculations.
- Build the reusable linear virtual-row foundation.
- Map snapshots and view options into a Timeline model.
- Render the Timeline surface, grouping, sidebar, today marker, edge indicators, scroll synchronization, and mobile mode.
- Register Timeline with modular CSS, integration tests, and documentation.
- Use native screenshot comparison to close temporal header/grid, toolbar, sidebar, scheduled,
  and unscheduled presentation gaps before Timeline is accepted.

Calendar and Gantt tests prove date semantics before Timeline consumes them. Timeline initially shipped read-only; the approved T034E-T034F amendment adds only configured start/end quick scheduling and bar move/resize through the mutation capability.
Passing shared navigation interactions does not imply visual acceptance: Page Preview and the file
context menu can pass while the Timeline surface still requires fidelity work.

### Checkpoint E: Timeline accepted

- Timeline works with arbitrary configured properties and no task schema.
- It has bounded mounted rows with a 5,000-entry fixture.
- Desktop/mobile/popout behavior and cleanup are verified.
- No date/status/priority writes exist in the Timeline directory.
- The human accepts the native surface after comparison with the pinned upstream design evidence.

The centered **Show details** window observed in the Keep Bases View is tracked separately as a
cross-view interaction proposal (T034D). It does not block Timeline acceptance and must not be
implemented independently in each view before a shared contract is approved.

## Phase 5: Card Core to Grid

Tasks T035-T040 build the reusable card presentation and immediately ship Grid.

- Define `CardItem`, slots, and mapping from entry snapshots.
- Build a renderer returning an idempotent cleanup handle.
- Migrate Swimlane card presentation to prove the renderer without changing board behavior.
- Build Grid layout, grouping, batched mounting, and offscreen gating.
- Register and document Grid with its CSS and integration tests.

### Checkpoint F: Grid accepted

- Swimlane and Grid use the same card model/renderer.
- The renderer contains no layout-specific or mutation logic.
- Grid does not synchronously construct rich DOM for every item in a large Base.
- Card appearance is theme-, mobile-, and keyboard-compatible.

## Phase 6: Masonry strategy to Masonry

Tasks T046-T050 add layout capability and ship the Masonry view immediately after Grid, so
Swimlane/Grid/Masonry's use of the shared Card Core is settled before Feed builds on top of it.

- Add pure column and position calculations.
- Add measurement caching keyed by item/config/width.
- Add virtual mounting, scroll anchoring, and stable resize behavior.
- Build and register the Masonry adapter with CSS, tests, and documentation.
- Where Masonry's needs would otherwise force a change to Grid's or Swimlane's card rendering,
  prefer keeping the divergent logic inside the shared component (per-view branch) over
  destabilizing an accepted view; record the unification opportunity as deferred refactor work
  instead of blocking this phase, matching the T037 precedent for Swimlane's cover resolution.

### Checkpoint G: Masonry accepted

- Pure layout tests cover narrow panes, gaps, column changes, groups, and invalid input.
- Mounted cards remain bounded.
- Resizing does not stack animations or visibly jump the anchor card.
- No duplicated card or preview renderer exists.
- Any card/layout logic kept separate per view (rather than unified) is recorded as a deferred
  finding, not silently left undocumented.

## Phase 7: Preview and linear virtualization to Feed

Tasks T041-T045 extend the platform only as required by Feed, once Grid and Masonry have proven
the shared Card Core across two layout strategies.

- Add preview extraction, cache keys, deduplication, invalidation, concurrency limits, and cancellation.
- Add lifecycle-owned read-only Markdown rendering for visible cards.
- Extend linear virtualization for dynamic-height rows and scroll anchors.
- Build and register Feed with integration tests, CSS, and documentation.

### Checkpoint H: Feed accepted

- Feed uses no React packages, internal `WorkspaceLeaf` construction, or editable views.
- Only visible/overscan previews are rendered.
- Async preview completion cannot write into an unloaded or superseded render.
- Scroll remains stable as variable-height previews settle.

## Phase 8: Cross-view hardening and release readiness

Tasks T056-T061 finish cross-cutting requirements after Calendar, Gantt, Swimlane, Timeline,
Grid, Masonry, and Feed all exist. Keep is out of scope for this phase; it is planned, specified,
and hardened separately after this program closes.

- Complete keyboard/focus/accessibility coverage.
- Run large-data performance and leak regression tests.
- Validate mobile, popout, light/dark, reduced motion, and resize behavior.
- Finalize source headers, third-party notices, and artifact verification.
- Update user/developer documentation and release metadata.
- Record native Obsidian acceptance evidence.

### Checkpoint I: Program complete

- `pnpm run check:ci` passes.
- All seven view registrations (Calendar, Gantt, Swimlane, Timeline, Grid, Masonry, Feed) are
  present and documented.
- Native acceptance is signed off separately from automated checks.
- Provenance matches every adapted file and bundled dependency.
- The specification Definition of Done is satisfied.
- Any deferred cross-view unification findings (e.g. from Phase 5-7) are recorded in
  `docs/architecture/upstream-provenance.md` or `tasks/todo.md` for a future refactor task, not
  lost.

## Dependency graph

```text
T001 -> T002 -> T003 -> T004 -> T005
                         |
                         v
T006 -> T007 -> T008 -> T009/T010/T011
                         |
                         v
T012 -> T013 -> T014/T015/T016
                         |
                         v
T017 -> T018 -> T019 -> T020 -> T021 -> T022 -> T023
                         |
                         +-> T024 -> T025 -> T026 -> T027
                         |
                         +-> T028 -> T029 -> T030 -> T031 -> T032 -> T033 -> T034
                         |
                         +-> T035 -> T036 -> T037 -> T038 -> T039 -> T040
                         |                                       |
                         |                                       v
                         |                            T046 -> T047 -> T048 -> T049 -> T050
                         |                                       |
                         |                                       v
                         +---------------------------> T041 -> T042 -> T043 -> T044 -> T045
                                                                    |
                                                                    v
                                                          T056 -> ... -> T061
```

Tasks within an existing-view migration group may be implemented in separate branches only after the shared contract is merged. New-view slices are sequential because each extends the same platform contract. Masonry (T046-T050) now executes right after Grid (T035-T040) and before Feed (T041-T045), per the amendment above; the task IDs keep their original numbers. T051-T055 (Keep) are removed from this graph — descoped, see the amendment above.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Refactor changes newly implemented Swimlane/Calendar behavior | High | characterization tests, one-view migration tasks, native checkpoint after each phase |
| Shared core becomes a god abstraction | High | capability modules, pure interfaces, no common inherited view superclass, consumer proof before expansion |
| Stale Bases objects enter async caches | High | snapshot boundary, path/mtime keys, architecture tests, stale-epoch tests |
| Gantt library listener behavior leaks globally | High | isolate and test event capture; remove global monkey-patch in Phase 1 |
| Large Bases cause DOM and preview jank | High | structural performance contracts, bounded concurrency, virtualization/batching, 5,000-entry fixture |
| CSS extraction causes visual regressions | Medium | view-by-view CSS tasks, deterministic assembly, screenshot/native comparison, temporary aliases |
| Popout/mobile works differently from happy-dom | High | owner-window core plus native acceptance; automated tests are not treated as native proof |
| Upstream feature creep undermines read-only product identity | High | explicit non-goals, architecture write ban, per-view acceptance criteria |
| Dynamic Views is much larger than Wise View | High | adopt only the listed core patterns and code units; reject full settings/media subsystem |
| Grid/Masonry/Swimlane shared-component unification destabilizes an accepted view | Medium | prefer per-view logic inside the shared component over forced unification (T037 precedent); record deferred unification as a tracked finding |
| Obsidian API version drift | Medium | 1.10.2 contract, installed 1.12.3 types, no 1.13-only usage without a gate |
| Too many simultaneous changes make review ineffective | High | tasks limited to approximately five files, checkpoints every phase, atomic concern-based commits |

## Verification policy

For every task:

1. run the narrowest affected tests during development;
2. run `pnpm run typecheck` and the relevant lint command;
3. leave the plugin in a buildable state;
4. update provenance in the same task when source is adapted;
5. do not mark native behavior verified from happy-dom tests.

At every checkpoint run `pnpm run check`. Run `pnpm run check:ci` at release-readiness checkpoints or whenever build/CSS/license code changes.

## Human gates

- Gate 1: approve SPEC assumptions and decision gates before T001 is closed.
- Gate 2: approve baseline and foundation contracts after Checkpoint D.
- Gate 3: accept each new view at Checkpoints E-H before expanding the next shared capability.
- Gate 4: approve native acceptance and provenance at Checkpoint I before release.
