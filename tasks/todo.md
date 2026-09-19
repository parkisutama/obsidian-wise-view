# Tasks: Extensible view platform

Status: In progress; SPEC approved 2026-09-18, Phase 0 complete  
Plan: [Implementation plan](plan.md)  
Specification: [Extensible view platform](../docs/specs/extensible-view-platform.md)

Tasks are dependency ordered. Each task must be completed in one focused session, stay within approximately five files, and leave the repository buildable. File lists are forecasts and must be corrected in the task record if implementation discovers a different boundary.

## Phase 0: Approval, provenance, and baseline

### T001: Approve the architecture specification — done

**Description:** Review every assumption, non-goal, compatibility promise, and decision gate with the human maintainer and change the SPEC status only after explicit approval.

**Acceptance criteria:**

- [x] All eight decision gates have an explicit accepted or revised outcome.
- [x] Unresolved choices remain marked as blockers rather than silently defaulted.
- [x] The SPEC status and approval date are recorded.

**Verification:** Manual document review; no application code changes.

**Dependencies:** None.

**Likely files:** `docs/specs/extensible-view-platform.md`

**Estimated scope:** XS

### T002: Add the upstream provenance ledger — done

**Description:** Record the four pinned upstream commits, assessed files, reuse mode, licenses, excluded features, and required attribution before adapting source.

**Acceptance criteria:**

- [x] Every candidate repository has a commit, license, and copy/modify/reimplement classification.
- [x] Keep's bundle-only limitation is explicit.
- [x] The ledger defines how an implementation task records file-level provenance.

**Verification:** Cross-check hashes and license files against the SPEC source table.

**Dependencies:** T001.

**Likely files:** `docs/architecture/upstream-provenance.md`, `THIRD_PARTY_NOTICES.md`

**Estimated scope:** S

### T003: Lock current-view characterization baselines — done

**Description:** Extend fixtures and tests so the newly committed Calendar and Swimlane behavior and the current Gantt registration/data mapping are protected before extraction begins.

**Acceptance criteria:**

- [x] Calendar tests cover blank title/all-day defaults and existing update behavior.
- [x] Swimlane tests cover its new ID/icon and no forced column property.
- [x] A minimal Gantt fixture protects mapping and lifecycle entry points without requiring native SVG rendering.

**Verification:** `pnpm run test`

**Dependencies:** T001.

**Likely files:** `tests/calendar-view.test.ts`, `tests/swimlane-view.test.ts`, `tests/gantt-view.test.ts`, `tests/fixtures/gantt.ts`, `tests/fixtures/obsidian.ts`

**Estimated scope:** M

### T004: Correct compatibility and product metadata — done

**Description:** Set the actual Obsidian compatibility floor to 1.10.2 and replace stale public Kanban references with Swimlane without changing view IDs or settings.

**Acceptance criteria:**

- [x] Manifest minimum version matches existing `createFileForView` usage.
- [x] Package/manifest descriptions and keywords name Swimlane.
- [x] Version and manifest tests protect the corrected metadata.

**Verification:** `pnpm run lint:obsidian && pnpm run test -- version-bump`

**Dependencies:** T001.

**Likely files:** `manifest.json`, `package.json`, `README.md`, `tests/version-bump.test.mjs`

**Estimated scope:** S

### T005: Add architecture guard tests — done

**Description:** Add static tests for stable IDs, forbidden React/Sass dependencies, core import direction, and direct mutation APIs in new-view directories.

**Acceptance criteria:**

- [x] The guard permits explicitly listed legacy mutation modules only.
- [x] A fixture proves each forbidden pattern causes the guard to fail.
- [x] The guard runs under the normal test command.

**Verification:** `pnpm run test -- architecture`

**Dependencies:** T001, T004.

**Likely files:** `tests/architecture.test.ts`, `tests/fixtures/architecture/allowed.ts`, `tests/fixtures/architecture/forbidden.ts`, `package.json`

**Estimated scope:** M

### Checkpoint A

- [x] `pnpm run check`
- [x] Baseline behavior and native-only gaps reviewed by the maintainer (blanket approval given 2026-09-18; native acceptance itself remains deferred to Checkpoint J per T061).
- [x] Human approval to start refactoring (blanket approval given 2026-09-18; flagged for re-confirmation only on new findings).

## Phase 1: Plugin shell and lifecycle foundation

### T006: Define the view descriptor registry contract — done

**Description:** Create descriptor types covering registration, hover metadata, commands, and capability declarations, with validation for duplicate IDs.

**Acceptance criteria:**

- [x] Duplicate/invalid IDs fail deterministically.
- [x] Descriptors can express all three existing views without view-specific branching.
- [x] Registry types do not instantiate views during validation.

**Verification:** `pnpm run test -- view-registry && pnpm run typecheck`

**Dependencies:** T005.

**Likely files:** `src/viewRegistry.ts`, `tests/view-registry.test.ts`, `tests/fixtures/obsidian.ts`

**Estimated scope:** M

### T007: Migrate plugin registration to descriptors — done

**Description:** Register Bases views, hover sources, and Gantt commands by iterating the descriptor registry while preserving current behavior.

**Acceptance criteria:**

- [x] `main.ts` contains no separate manual list of view IDs for hover sources.
- [x] Existing three IDs, names, icons, factories, options, and commands remain unchanged.
- [x] Registration tests prove each descriptor is registered once.

**Verification:** `pnpm run test -- view-registry && pnpm run typecheck`

**Dependencies:** T006.

**Likely files:** `src/main.ts`, `src/viewRegistry.ts`, `tests/view-registry.test.ts`, `tests/fixtures/obsidian.ts`

**Estimated scope:** M

### T008: Implement owner-window helpers and disposable runtime — done

**Description:** Add popout-safe DOM/window helpers plus an idempotent disposal scope for events, observers, timers, RAFs, abort controllers, and child components.

**Acceptance criteria:**

- [x] Disposing twice is safe.
- [x] Every owned resource is cancelled/disconnected exactly once.
- [x] Observer/RAF constructors come from the element's owning window.

**Verification:** `pnpm run test -- view-runtime && pnpm run typecheck`

**Dependencies:** T007.

**Likely files:** `src/platform/dom/ownerWindow.ts`, `src/platform/dom/DisposableScope.ts`, `src/platform/dom/ViewRuntime.ts`, `tests/view-runtime.test.ts`, `tests/fixtures/obsidian.ts`

**Estimated scope:** M

### T009: Migrate Calendar lifecycle to ViewRuntime — done

**Description:** Route Calendar-owned DOM handlers and FullCalendar destruction through the runtime without changing rendering or mutation behavior.

**Acceptance criteria:**

- [x] Repeated update/unload leaves no Calendar or registered handler alive.
- [x] FullCalendar is destroyed once per replacement/unload.
- [x] Existing Calendar tests remain unchanged in outcome.

**Verification:** `pnpm run test -- calendar-view && pnpm run typecheck`

**Dependencies:** T008.

**Likely files:** `src/views/BasesCalendarView.ts`, `tests/calendar-view.test.ts`, `tests/fixtures/calendar.ts`

**Estimated scope:** M

### T010: Migrate Gantt lifecycle and remove global monkey-patching — done

**Description:** Own Frappe/WBS/document interactions explicitly and eliminate replacement of `document.addEventListener` during Gantt initialization.

**Acceptance criteria:**

- [x] No global browser API is overwritten.
- [x] Document handlers, resize handlers, popups, and Frappe instances are released on update/unload. (Frappe Gantt's own internal document mouseup listener is a documented residual upstream leak — see docs/architecture/upstream-provenance.md.)
- [x] Gantt initialization still captures only the events required by the adapter.

**Verification:** `pnpm run test -- gantt-view && pnpm run typecheck`; native Gantt smoke at Checkpoint B.

**Dependencies:** T008, T003.

**Likely files:** `src/views/BasesGanttView.ts`, `src/platform/dom/ViewRuntime.ts`, `tests/gantt-view.test.ts`, `tests/fixtures/gantt.ts`

**Estimated scope:** M

### T011: Migrate Swimlane lifecycle to ViewRuntime — done

**Description:** Route resize, keyboard, drag/touch, interval, debounce, observer, and virtual-card cleanup through the runtime.

**Acceptance criteria:**

- [x] Touch/drag cancellation clears clones, document handlers, timers, and intervals.
- [x] Virtual-card handles are disposed when unmounted or rerendered.
- [x] Current Swimlane ordering and movement behavior remains characterized.

**Verification:** `pnpm run test -- swimlane-view && pnpm run typecheck`

**Dependencies:** T008.

**Likely files:** `src/views/BasesSwimlaneView.ts`, `tests/swimlane-view.test.ts`, `tests/fixtures/swimlane.ts`, `src/platform/dom/ViewRuntime.ts`

**Estimated scope:** M

### Checkpoint B

- [x] `pnpm run check`
- [ ] Native mount/switch/unload smoke for all existing views. **Needs the maintainer**: this requires a real Obsidian desktop/mobile install, which this session cannot run. Automated tests are not treated as native proof (spec §9.3.5).
- [x] Gantt global monkey-patch absence confirmed in source and runtime (regression test in tests/gantt-view.test.ts).

## Phase 2: Modular regular CSS

### T012: Support ordered first-party CSS sources in the build — done

**Description:** Extend the CSS merge plugin so the root artifact is generated from an explicit ordered list of first-party regular CSS modules plus licensed vendor CSS.

**Acceptance criteria:**

- [x] First-party order is explicit and deterministic.
- [x] Repeated builds are byte-identical.
- [x] Existing vendor transformation and notice behavior remains intact.

**Verification:** `pnpm run test -- css-merge && pnpm run build && pnpm run verify:artifacts`

**Dependencies:** T004.

**Likely files:** `scripts/css-merge.mjs`, `tests/css-merge.test.mjs`, `esbuild.config.mjs`, `styles.css`

**Estimated scope:** M

### T013: Extract CSS foundations and shared primitives — done

**Description:** Move theme mappings, tokens, focus states, empty states, toolbars, badges, and virtual-collection primitives into regular CSS source modules.

**Corrected file boundary:** the existing "1. GLOBAL UTILITIES & SHARED COMPONENTS" section had no separate theme-token layer to split out (it consumes Obsidian's own variables directly, defines none of its own) — it became one file, `src/styles/foundations/common.css`. Settings/modal styles (originally section 5, not covered by any task) were folded in here as `src/styles/components/settings.css` since they aren't view-specific.

**Acceptance criteria:**

- [x] Shared variables use Obsidian variables as their base. (No first-party tokens exist; rules reference `var(--...)` Obsidian variables directly, unchanged from before extraction.)
- [x] No visual rule is duplicated between old and new source regions. (Verified: extraction was by exact line range with a byte-for-byte diff against the original, not retyped.)
- [x] Root artifact output remains valid without Sass/PostCSS.

**Verification:** `pnpm run build && pnpm run verify:artifacts` passed. Visual comparison deferred to the maintainer (native rendering is outside this session's reach).

**Dependencies:** T012.

**Likely files (corrected):** `src/styles/foundations/common.css`, `src/styles/components/settings.css`, `esbuild.config.mjs`, `styles.css`

**Estimated scope:** M

### T014: Extract Calendar CSS module — done (automated portion)

**Description:** Move Calendar-owned rules into its view CSS module while retaining selector compatibility and FullCalendar override order.

**Acceptance criteria:**

- [x] Calendar rules have one source location (`src/styles/views/calendar.css`).
- [x] FullCalendar package CSS still precedes Wise View overrides. (Unchanged: FullCalendar's own CSS is still merged via `imported`/`extraCss` after BUNDLE_MARKER, i.e. after all first-party modules including calendar.css — same relative order as before extraction.)
- [ ] Year/month/week/day/list views retain their layout. **Needs the maintainer**: native visual check.

**Verification:** `pnpm run build && pnpm run test -- css-merge` passed. Native Calendar visual smoke deferred to the maintainer.

**Dependencies:** T013.

**Likely files:** `src/styles/views/calendar.css`, `esbuild.config.mjs`, `styles.css`, `tests/css-merge.test.mjs`

**Estimated scope:** M

### T015: Extract Gantt CSS module — done (automated portion)

**Description:** Move Gantt/WBS rules into a view module and preserve scoped, theme-mapped Frappe CSS.

**Acceptance criteria:**

- [x] Vendor variables remain scoped to the Gantt root. (Unchanged: `esbuild.config.mjs`'s `scopeFrappeGanttCss` transform, which scopes `:root`/dark-theme selectors to `.bases-gantt-view`, still runs on the vendor CSS after the marker; not touched by this task.)
- [x] WBS, popup, bar, and resize styles have one source location (`src/styles/views/gantt.css`, combining the former "4. GANTT VIEW STYLES" and "6. VENDOR OVERRIDES — Frappe Gantt" sections, which were both first-party Gantt-selector rules despite the old section name).
- [ ] Light/dark behavior remains equivalent. **Needs the maintainer**: native visual check.

**Verification:** `pnpm run build && pnpm run verify:artifacts` passed. Native Gantt visual smoke deferred to the maintainer.

**Dependencies:** T013.

**Likely files:** `src/styles/views/gantt.css`, `esbuild.config.mjs`, `styles.css`, `tests/css-merge.test.mjs`

**Estimated scope:** M

### T016: Extract Swimlane CSS and compatibility aliases — partially done

**Description:** Move board/card/drag/touch rules into a view module, introduce Wise View/Swimlane root names, and retain temporary aliases for legacy Planner/Kanban selectors.

**Acceptance criteria:**

- [x] Board/card/drag/touch rules moved verbatim to `src/styles/views/swimlane.css` (byte-for-byte diff confirmed against the original section).
- [ ] New component rules use `wise-view`/`swimlane` names, with temporary Planner/Kanban aliases. **Deliberately deferred**: this is a generative rename coordinated with `BasesSwimlaneView.ts`'s own class names (still `.planner-kanban-*`, unchanged since T011), not a pure extraction. Renaming CSS selectors without a matching TS change would leave the new names unused; doing both together is real, unverified-by-me visual risk on top of a change the maintainer already agreed to review by eye. Revisit as its own follow-up once native visual verification of this extraction is confirmed.
- [x] Existing DOM remains styled during the incremental TypeScript migration (unchanged selectors — nothing to break).
- [ ] Alias removal conditions are documented. Pending the rename above.

**Verification:** `pnpm run build` passed. Native desktop/mobile Swimlane visual and drag smoke deferred to the maintainer.

**Dependencies:** T013.

**Likely files:** `src/styles/views/swimlane.css`, `src/views/BasesSwimlaneView.ts`, `styles.css`, `README.md`

**Estimated scope:** M

### Checkpoint C

- [x] `pnpm run check:ci`
- [ ] Visual comparison for existing views in light/dark desktop/mobile. **Needs the maintainer**: outside this session's reach; mitigated by byte-for-byte diffs proving the extraction moved text without altering it (see T013-T016 commit).
- [x] No Sass or CSS runtime dependency added.

## Phase 3: Shared Bases data and interaction foundation

### T017: Define normalized entry value contracts — done

**Description:** Add pure discriminated value types for missing, text, number, boolean, date, list, link, file, and unsupported values.

**Acceptance criteria:**

- [x] Core value types import no Obsidian module.
- [x] Missing and empty values are distinguishable.
- [x] Formatting is not embedded in raw normalization types.

**Verification:** `pnpm run test -- normalized-value && pnpm run typecheck`

**Dependencies:** T005.

**Likely files:** `src/core/entries/NormalizedValue.ts`, `src/core/entries/EntrySnapshot.ts`, `tests/normalized-value.test.ts`

**Estimated scope:** S

### T018: Implement the Bases snapshot adapter — done

**Description:** Convert requested properties from current grouped/ungrouped results into immutable path-keyed snapshots without retaining entries.

**Acceptance criteria:**

- [x] Note, file, formula, link, list, checkbox, date, and malformed values are covered.
- [x] Snapshot grouping preserves Bases order and null groups.
- [x] A test proves replacing all `BasesEntry` objects does not invalidate stored snapshots.

**Verification:** `pnpm run test -- entry-snapshot && pnpm run typecheck`

**Dependencies:** T017.

**Likely files:** `src/platform/bases/entrySnapshotAdapter.ts`, `src/core/entries/EntrySnapshot.ts`, `tests/entry-snapshot.test.ts`, `tests/fixtures/obsidian.ts`

**Estimated scope:** M

### T019: Implement validated view configuration access — done

**Description:** Centralize typed reads, coercion, defaults, property IDs, and CSS-only classifications while preserving existing option keys.

**Acceptance criteria:**

- [x] Invalid enum/number/property values resolve predictably.
- [x] View defaults do not introduce task-specific property names.
- [x] CSS-only keys can be queried without rebuilding data models.

**Verification:** `pnpm run test -- view-config && pnpm run typecheck`

**Dependencies:** T017.

**Likely files:** `src/platform/bases/ViewConfigReader.ts`, `src/platform/bases/viewOptionTypes.ts`, `tests/view-config.test.ts`, `tests/fixtures/obsidian.ts`

**Estimated scope:** M

### T020: Implement shared color resolution — done

**Description:** Consolidate explicit color, Pretty Properties, value styles, deterministic fallback, and readable foreground logic into one service.

**Acceptance criteria:**

- [x] Resolution source and semantic CSS variables are testable.
- [x] Invalid colors cannot become unsafe inline style values.
- [x] Calendar and Swimlane color fixtures can be expressed through the service.

**Verification:** `pnpm run test -- color && pnpm run typecheck`

**Dependencies:** T017.

**Likely files:** `src/platform/colors/ColorResolver.ts`, `src/integrations/PrettyPropertiesAdapter.ts`, `src/utils/colorUtils.ts`, `tests/color-resolver.test.ts`, `tests/colorUtils.test.ts`

**Estimated scope:** M

### T021: Implement shared navigation and hover service — done

**Description:** Consolidate modifier-key open behavior, context-menu destinations, keyboard activation, and Page Preview dispatch using registry source metadata.

**Acceptance criteria:**

- [x] Mouse and keyboard activation produce the same destination contract.
- [x] Context menus use the event's owning document.
- [x] Hover events contain the correct registered source ID and target.

**Verification:** `pnpm run test -- navigation && pnpm run typecheck`

**Dependencies:** T006, T008.

**Likely files:** `src/platform/navigation/NavigationService.ts`, `src/utils/openFile.ts`, `tests/navigation.test.ts`, `tests/fixtures/obsidian.ts`

**Estimated scope:** M

### T022: Implement render epochs and change detection — done

**Description:** Add path/mtime/config/group signatures, abortable render epochs, stale-result rejection, and CSS-only fast paths.

**Acceptance criteria:**

- [x] Identical updates can be skipped without retaining query objects.
- [x] Superseded async work cannot commit DOM/cache results.
- [x] Group/order/property changes invalidate the correct layer.

**Verification:** `pnpm run test -- render-scheduler && pnpm run typecheck`

**Dependencies:** T018, T019, T008.

**Likely files:** `src/platform/dom/RenderScheduler.ts`, `src/platform/bases/changeDetection.ts`, `tests/render-scheduler.test.ts`, `tests/change-detection.test.ts`

**Estimated scope:** M

### T023: Define legacy mutation capabilities — done

**Description:** Create explicit interfaces/adapters for existing date, property, file-create, dependency, and trash behavior without granting them to new views.

**Acceptance criteria:**

- [x] Capability interfaces accept path/value data, not stored `BasesEntry`.
- [ ] Direct Obsidian mutation APIs are confined to the adapter directory after migrations. **Pending T024-T026**: the capability/adapter exists and is allowlisted by the T005 guard, but Calendar/Gantt/Swimlane still call `processFrontMatter`/`trashFile`/`vault.create` directly until those tasks migrate them.
- [x] Failure contracts are stable and testable.

**Verification:** `pnpm run test -- mutation-capability && pnpm run typecheck`

**Dependencies:** T018, T005.

**Likely files:** `src/platform/mutations/LegacyMutationGateway.ts`, `src/platform/mutations/types.ts`, `tests/mutation-capability.test.ts`, `tests/fixtures/obsidian.ts`

**Estimated scope:** M

### T024: Migrate Calendar to shared data and interaction services — done

**Description:** Replace Calendar-local property, color, navigation, hover, render-staleness, and direct mutation plumbing with the shared services while preserving behavior.

**Acceptance criteria:**

- [x] Calendar engine models contain path metadata rather than stored `BasesEntry`.
- [x] Date writes/create/delete flow through declared legacy capabilities.
- [x] Existing and new characterization tests pass.

**Verification:** `pnpm run test -- calendar-view && pnpm run typecheck`

**Dependencies:** T018-T023, T009.

**Likely files:** `src/views/BasesCalendarView.ts`, `tests/calendar-view.test.ts`, `tests/fixtures/calendar.ts`, `src/platform/mutations/LegacyMutationGateway.ts`

**Estimated scope:** M

### T025: Migrate Gantt to shared data and interaction services — done

**Description:** Replace Gantt-local property/color/navigation/hover/render/mutation plumbing with the shared services while retaining Frappe-specific mapping.

**Acceptance criteria:**

- [x] Gantt tasks use path identity and normalized dates/progress/dependencies.
- [x] Date/progress/dependency writes use legacy capabilities only.
- [x] Frappe adapter remains isolated from pure temporal/data modules.

**Verification:** `pnpm run test -- gantt-view && pnpm run typecheck`

**Dependencies:** T018-T023, T010.

**Likely files:** `src/views/BasesGanttView.ts`, `src/utils/ganttUtils.ts`, `tests/gantt-view.test.ts`, `tests/fixtures/gantt.ts`, `src/platform/mutations/LegacyMutationGateway.ts`

**Estimated scope:** M

### T026: Migrate Swimlane to shared data and interaction services — done

**Description:** Replace Swimlane-local property/color/navigation/hover/render/mutation plumbing while preserving board grouping and movement behavior.

**Acceptance criteria:**

- [x] Grouping and cards consume snapshots instead of retained entries.
- [x] Card movement writes use legacy capabilities only.
- [x] Color and hover implementations are removed from the view.

**Verification:** `pnpm run test -- swimlane-view && pnpm run typecheck`

**Dependencies:** T018-T023, T011.

**Likely files:** `src/views/BasesSwimlaneView.ts`, `tests/swimlane-view.test.ts`, `tests/fixtures/swimlane.ts`, `src/platform/mutations/LegacyMutationGateway.ts`

**Estimated scope:** M

### T027: Complete Wise View naming and dead-model cleanup — done

**Description:** Rename remaining Planner shell/settings identifiers, remove the unused task-oriented item model, and keep persisted setting compatibility.

**Acceptance criteria:**

- [x] No production type claims Wise View owns a Planner task schema.
- [x] Plugin/settings names use Wise View terminology.
- [x] Existing `data.json` shape still loads without migration loss.

**Verification:** `rg -n "PlannerItem|ComputedItemFields" src` returns no result; `pnpm run check`.

**Dependencies:** T024-T026.

**Likely files:** `src/main.ts`, `src/settings/SettingsTab.ts`, `src/types/settings.ts`, `src/types/item.ts`, `tests/settings.test.ts`

**Estimated scope:** M

### Checkpoint D

- [ ] `pnpm run check`
- [ ] Direct mutation search matches only approved legacy adapters.
- [ ] Native regression smoke for existing views.
- [ ] Foundation contract approved before new-view work.

## Phase 4: Temporal Core to Timeline

### T028: Implement strict temporal value and range semantics — done

**Description:** Add pure date-only/datetime parsing, ongoing/open-ended handling, inclusive range normalization, and explicit timezone behavior.

**Acceptance criteria:**

- [x] Date-only values do not shift across local timezone boundaries.
- [x] Reversed and missing endpoints follow documented rules.
- [x] Invalid values fail without guessing.

**Verification:** `pnpm run test -- temporal && pnpm run typecheck`

**Dependencies:** T018, T024, T025.

**Likely files:** `src/core/temporal/TemporalValue.ts`, `src/core/temporal/DateRange.ts`, `tests/temporal-value.test.ts`, `tests/date-range.test.ts`

**Estimated scope:** M

### T029: Implement temporal domains, ticks, zoom, and coordinates — done

**Description:** Add pure today/domain padding, zoom specifications, tick generation, and date/pixel conversion used by Timeline and testable against Calendar/Gantt cases.

**Acceptance criteria:**

- [x] Coordinate round-trips are stable within defined rounding rules.
- [x] Day/week/month/quarter/year scales have deterministic ticks.
- [x] Domain calculations handle empty and extreme ranges.

**Verification:** `pnpm run test -- temporal-domain && pnpm run typecheck`

**Dependencies:** T028.

**Likely files:** `src/core/temporal/TimeDomain.ts`, `src/core/temporal/TimelineScale.ts`, `tests/time-domain.test.ts`, `tests/timeline-scale.test.ts`

**Estimated scope:** M

### T030: Implement the linear virtual-row foundation — done

**Description:** Add pure visible-range calculations and a DOM controller for fixed-height path-keyed rows, overscan, mount/unmount handles, and anchor restoration.

**Acceptance criteria:**

- [x] Mounted rows remain bounded for 5,000 items.
- [x] Reordering and grouping retain identity by path.
- [x] Unmount invokes every row cleanup handle.

**Verification:** `pnpm run test -- virtual-linear && pnpm run typecheck`

**Dependencies:** T008, T022.

**Likely files:** `src/core/layouts/linearVirtualRange.ts`, `src/platform/dom/VirtualLinearCollection.ts`, `tests/linear-virtual-range.test.ts`, `tests/virtual-linear.test.ts`

**Estimated scope:** M

### T031: Implement Timeline model mapping and options — done

**Description:** Map snapshots and validated options into grouped scheduled/unscheduled timeline items without priority/status assumptions.

**Acceptance criteria:**

- [x] Start/end/title/color/group properties are configurable.
- [x] Missing/invalid dates produce documented unscheduled behavior.
- [x] No status order or priority ranking exists in the model.

**Verification:** `pnpm run test -- timeline-model && pnpm run typecheck`

**Dependencies:** T019, T020, T028, T029.

**Likely files:** `src/views/timeline/TimelineModel.ts`, `src/views/timeline/timelineOptions.ts`, `tests/timeline-model.test.ts`, `tests/fixtures/timeline.ts`

**Estimated scope:** M

### T032: Implement the read-only Timeline surface — done

**Description:** Render header/ticks/grid/today marker/bars/edge indicators through Temporal Core and the shared lifecycle/navigation services.

**Acceptance criteria:**

- [x] Bar geometry comes only from Temporal Core.
- [x] Open, context menu, hover, and keyboard activation use shared services.
- [x] No pointer gesture can write a date/property.

**Verification:** `pnpm run test -- timeline-view && pnpm run typecheck`

**Dependencies:** T021, T029-T031.

**Likely files:** `src/views/timeline/BasesTimelineView.ts`, `src/views/timeline/TimelineRenderer.ts`, `tests/timeline-view.test.ts`, `tests/fixtures/timeline.ts`

**Estimated scope:** M

### T033: Add Timeline grouping, sidebar, virtualization, and responsive state — done (automated portion)

**Description:** Add grouped/collapsible rows, synchronized sidebar scrolling, unscheduled listing, zoom/today state, and mobile list/timeline transitions.

**Acceptance criteria:**

- [x] Both timeline and sidebar use the same virtual row identity/order.
- [x] Scroll/zoom state survives a data rerender.
- [x] Narrow mode does not leak observers or lose the active anchor.

**Verification:** `pnpm run test -- timeline-view` and `pnpm run check` passed. Native responsive smoke deferred to the maintainer and final acceptance matrix (T061).

**Dependencies:** T030, T032.

**Likely files:** `src/views/timeline/BasesTimelineView.ts`, `src/views/timeline/TimelineRenderer.ts`, `tests/timeline-view.test.ts`, `src/platform/dom/VirtualLinearCollection.ts`

**Estimated scope:** M

### T034: Register, style, document, and license Timeline — done (automated portion)

**Description:** Add the descriptor, regular CSS module, user documentation, integration fixture, and MIT attribution for adapted Timeline work.

**Acceptance criteria:**

- [x] ID is uniquely prefixed and registration appears once.
- [x] CSS uses shared tokens and supports light/dark/mobile/reduced motion.
- [x] Documentation states differences from the upstream editable workflow.

**Verification:** `pnpm run check:ci` passed. Native Timeline desktop/mobile/popout acceptance remains deferred to T061.

**Dependencies:** T033, T002, T016.

**Likely files:** `src/views/timeline/index.ts`, `src/styles/views/timeline.css`, `src/viewRegistry.ts`, `docs/timeline-view.md`, `THIRD_PARTY_NOTICES.md`

**Estimated scope:** M

### T034A: Close Timeline header, grid, and toolbar fidelity gaps — done (automated portion)

**Description:** Selectively adapt the pinned MIT upstream Timeline controls, temporal hierarchy, grid, today indicator, and scroll behavior identified by the 2026-09-19 native comparison, while excluding its task workflow and write paths.

**Acceptance criteria:**

- [x] Toolbar uses compact Today plus one zoom selector, and the sidebar has an explicit collapse/expand control.
- [x] Header renders synchronized month/year bands and day ticks with weekend/tick banding plus a today badge and line spanning the row surface.
- [x] Horizontal header/body scrolling and vertical sidebar/body scrolling remain synchronized without breaking bounded DOM or saved anchors.

**Verification:** `pnpm run test -- timeline-view && pnpm run typecheck` passed. Native desktop screenshot comparison remains pending under T034C.

**Dependencies:** T029-T034.

**Likely files:** `src/views/timeline/TimelineRenderer.ts`, `src/views/timeline/BasesTimelineView.ts`, `src/styles/views/timeline.css`, `tests/timeline-view.test.ts`

**Estimated scope:** M

### T034B: Refine Timeline scheduled and unscheduled presentation — done (automated portion)

**Description:** Make configuration errors, genuinely unscheduled notes, and scheduled bars visually distinct while keeping Timeline schema-agnostic and read-only.

**Acceptance criteria:**

- [x] An unconfigured start property shows configuration guidance instead of converting every note into an Unscheduled row.
- [x] With a configured start property, only missing/invalid dates enter one clear Unscheduled section; note titles are not replaced by repeated generic “Unscheduled” pills.
- [x] Scheduled bars, row emphasis, truncation, and labels align with the temporal grid while preserving shared colors/navigation and zero mutation paths.

**Verification:** `pnpm run check` passed (29 files, 251 tests), including the focused Timeline model/renderer coverage, lint, Obsidian lint, and typecheck. Native fixtures with scheduled, missing, invalid, ongoing, and reversed ranges remain under T034C.

**Dependencies:** T034A.

**Likely files:** `src/views/timeline/TimelineModel.ts`, `src/views/timeline/TimelineRenderer.ts`, `src/styles/views/timeline.css`, `tests/timeline-model.test.ts`, `tests/timeline-view.test.ts`

**Estimated scope:** M

### T034C: Re-run and record Timeline native acceptance

**Description:** Repeat acceptance after T034A-T034B and record interaction and visual evidence without treating automated tests as native proof.

**Acceptance criteria:**

- [ ] Desktop confirms configured/scheduled and unscheduled layouts, compact controls, Page Preview, complete context menu, keyboard navigation, zoom, today, collapse, and scroll synchronization.
- [ ] Mobile and popout confirm responsive layout, correct owner-window behavior, and cleanup across mount/switch/unload.
- [ ] Human records Timeline as accepted or lists remaining concrete gaps before Phase 5 starts.

**Verification:** Native acceptance record in `tasks/timeline-native-acceptance.md`; `pnpm run check:ci` remains green.

**Dependencies:** T034A-T034B.

**Likely files:** `tasks/timeline-native-acceptance.md`, `tasks/todo.md`

**Estimated scope:** S

### T034E: Adopt Timeline scheduling and zoom interactions — done (automated portion)

**Description:** Complete the attributed adoption of the pinned MIT Timeline interaction model without importing its status, priority, recurrence, or dependency workflow. Timeline lists unscheduled notes and lets the user place them on the temporal surface by writing only the configured start/end properties.

**Acceptance criteria:**

- [x] Timeline uses the upstream-equivalent zoom density and viewport-relative time-domain padding so bars and headers remain legible instead of compressed.
- [x] `Ctrl/Cmd+wheel` and two-finger pinch step zoom around the pointer while keeping the date under the pointer anchored.
- [x] Hovering an unscheduled row displays a dated ghost bar; activating it writes only the configured start/end properties through the mutation gateway.
- [x] Direct Obsidian mutation calls remain absent from the Timeline directory; status, priority, group, recurrence, and dependency writes remain excluded.
- [x] Source/CSS attribution identifies the pinned upstream file and MIT notice.

**Verification:** focused Temporal/Timeline/architecture tests passed; `pnpm run check` passed (29 files, 256 tests). Production build and artifact verification complete before commit; T034C native comparison remains required.

**Dependencies:** T023, T030-T034B, human approval recorded 2026-09-19.

**Likely files:** `docs/specs/extensible-view-platform.md`, `tasks/plan.md`, `src/core/temporal/TimelineScale.ts`, `src/views/timeline/BasesTimelineView.ts`, `src/views/timeline/TimelineRenderer.ts`, `src/styles/views/timeline.css`, Timeline tests.

**Estimated scope:** L

### T034F: Complete Timeline editing and layout parity — done (automated portion)

**Description:** Apply the next native comparison by adopting upstream bar move/resize, non-synthetic grouping, open-ended domain extension, stable Today alignment, recoverable sidebar collapse, and readable titles.

**Acceptance criteria:**

- [x] The domain reflows to the pane width and extends near either horizontal edge without losing the visible date anchor.
- [x] Today scroll keeps the header badge, grid line, and current-day cell centered on the same coordinate.
- [x] Scheduled bars drag as a range and resize from either edge, writing only configured start/end properties through the mutation gateway.
- [x] No Ungrouped or Unscheduled header is synthesized when Group by is empty; unscheduled items remain rows in their configured group/order.
- [x] Sidebar collapse always exposes a usable reopen control; full titles are available by tooltip and optional two-line wrapping.
- [x] Bar labels are left aligned and remain readable for narrow ranges.

**Verification:** focused Timeline/model/registry/architecture tests passed; `pnpm run check` passed (29 files, 261 tests). Build and artifact verification complete before commit; another native T034C comparison remains required.

**Dependencies:** T034E and maintainer native feedback on 2026-09-19.

**Likely files:** Timeline model/renderer/options/CSS, mutation adapter wiring, tests, Timeline documentation and acceptance record.

**Estimated scope:** L

### Checkpoint E: Timeline

- [x] Automated gates pass.
- [x] 5,000-row bounded-DOM evidence recorded.
- [ ] Desktop/mobile/popout native acceptance recorded.
- [ ] Human accepts Timeline before Card Core expansion.

### T034D: Design a shared centered details window — future cross-view backlog

**Description:** Capture the Keep Bases View-style **Show details** context action as a reusable, optional Wise View interaction instead of duplicating modal/window behavior per view. This task is design-only until the human approves the contract and target views.

**Acceptance criteria:**

- [ ] A proposal defines the shared navigation/details service, read-only data contract, focus trapping, Escape/close behavior, owner-window handling, mobile fallback, and cleanup ownership.
- [ ] Context-menu integration places **Show details** after a separator and allows each view to opt in without changing the existing complete open-location actions.
- [ ] The proposal identifies initial candidate views and explicitly separates read-only details from editing or task-management behavior.

**Verification:** Human review of the proposal and a small interaction contract test plan; no runtime implementation in this task.

**Dependencies:** T021. Does not block Checkpoint E.

**Likely files:** `tasks/plan.md`, `tasks/todo.md`, future ADR/spec after approval

**Estimated scope:** S

## Phase 5: Card Core to Grid

### T035: Define CardItem and snapshot mapping

**Description:** Create the pure card presentation model, slot contracts, property ordering, accessibility label, and mapper from entry snapshots.

**Acceptance criteria:**

- [ ] CardItem contains no DOM, `BasesEntry`, or layout state.
- [ ] Title/subtitle/cover/tags/properties/color/preview references are independently optional.
- [ ] Mapping is deterministic for missing and malformed values.

**Verification:** `pnpm run test -- card-model && pnpm run typecheck`

**Dependencies:** T018-T020.

**Likely files:** `src/core/cards/CardItem.ts`, `src/core/cards/CardMapper.ts`, `tests/card-model.test.ts`, `tests/card-mapper.test.ts`

**Estimated scope:** M

### T036: Implement the shared CardRenderer

**Description:** Render card shells and slots through regular DOM, shared colors/navigation, and idempotent per-card cleanup handles.

**Acceptance criteria:**

- [ ] Renderer has no Grid/Masonry/Feed/Keep branch.
- [ ] Event and child-component cleanup is complete.
- [ ] Keyboard and focus semantics are present from the first implementation.

**Verification:** `pnpm run test -- card-renderer && pnpm run typecheck`

**Dependencies:** T021, T035, T008.

**Likely files:** `src/platform/dom/CardRenderer.ts`, `src/core/cards/CardItem.ts`, `tests/card-renderer.test.ts`, `src/styles/components/card.css`

**Estimated scope:** M

### T037: Migrate Swimlane cards to CardRenderer

**Description:** Use the shared card model/renderer inside Swimlane while keeping columns, swimlanes, drag/drop, badges, and virtualization behavior intact.

**Acceptance criteria:**

- [ ] Swimlane no longer owns a second title/cover/property card renderer.
- [ ] Drag/drop attaches outside CardRenderer through adapter hooks.
- [ ] Existing card visuals and interactions remain accepted.

**Verification:** `pnpm run test -- swimlane-view && pnpm run typecheck`; native Swimlane smoke.

**Dependencies:** T036, T026.

**Likely files:** `src/views/BasesSwimlaneView.ts`, `src/platform/dom/CardRenderer.ts`, `tests/swimlane-view.test.ts`, `tests/card-renderer.test.ts`, `src/styles/views/swimlane.css`

**Estimated scope:** M

### T038: Implement Grid layout and offscreen policy

**Description:** Add pure grid column calculations plus batched mounting/content-visibility control for grouped and ungrouped card collections.

**Acceptance criteria:**

- [ ] Columns respond deterministically to pane width, minimum width, and gap.
- [ ] Large fixtures do not synchronously mount all rich card content.
- [ ] Group and path ordering remains the Bases order.

**Verification:** `pnpm run test -- grid-layout && pnpm run typecheck`

**Dependencies:** T022, T035, T036.

**Likely files:** `src/core/layouts/GridLayout.ts`, `src/platform/dom/GridCollection.ts`, `tests/grid-layout.test.ts`, `tests/grid-collection.test.ts`

**Estimated scope:** M

### T039: Implement the Grid view adapter

**Description:** Connect Bases snapshots, Grid options, grouping, CardRenderer, and GridCollection into a read-only Bases view.

**Acceptance criteria:**

- [ ] Adapter contains orchestration, not duplicate card/property logic.
- [ ] Identical updates take the render fast path.
- [ ] Group collapse/resize/update preserve stable path identity.

**Verification:** `pnpm run test -- grid-view && pnpm run typecheck`

**Dependencies:** T018-T022, T038.

**Likely files:** `src/views/grid/BasesGridView.ts`, `src/views/grid/gridOptions.ts`, `tests/grid-view.test.ts`, `tests/fixtures/grid.ts`

**Estimated scope:** M

### T040: Register, style, and document Grid

**Description:** Add Grid descriptor, regular CSS, documentation, provenance, and integration acceptance.

**Acceptance criteria:**

- [ ] Grid is registered with a unique Wise View ID.
- [ ] Card styles are shared; Grid CSS contains layout rules only.
- [ ] Documentation identifies adopted Dynamic Views concepts and omitted extras.

**Verification:** `pnpm run check:ci`; native Grid acceptance.

**Dependencies:** T039, T002.

**Likely files:** `src/views/grid/index.ts`, `src/styles/views/grid.css`, `src/viewRegistry.ts`, `docs/grid-view.md`, `THIRD_PARTY_NOTICES.md`

**Estimated scope:** M

### Checkpoint F: Grid

- [ ] Swimlane and Grid share CardRenderer.
- [ ] Large Grid update behavior recorded.
- [ ] Human accepts Grid before preview infrastructure expands.

## Phase 6: Preview and linear virtualization to Feed

### T041: Implement ContentPreviewService

**Description:** Add bounded file reads, frontmatter stripping, lightweight extraction, composite cache keys, in-flight deduplication, invalidation, concurrency control, and cancellation.

**Acceptance criteria:**

- [ ] Cache keys include path, mtime, mode, and output-affecting config.
- [ ] One failed file does not fail a batch.
- [ ] Cache and in-flight state can be cleared on plugin unload.

**Verification:** `pnpm run test -- content-preview && pnpm run typecheck`

**Dependencies:** T022, T035.

**Likely files:** `src/platform/preview/ContentPreviewService.ts`, `src/core/cards/TextPreview.ts`, `tests/content-preview.test.ts`, `tests/fixtures/obsidian.ts`

**Estimated scope:** M

### T042: Implement lifecycle-owned Markdown preview rendering

**Description:** Render read-only Markdown only for mounted cards using public Obsidian rendering APIs and child components owned by card handles.

**Acceptance criteria:**

- [ ] Unmount destroys the child renderer/component.
- [ ] No `WorkspaceLeaf`, Markdown editor, or source-mode view is constructed.
- [ ] Stale async rendering cannot replace a newer card.

**Verification:** `pnpm run test -- markdown-preview && pnpm run typecheck`

**Dependencies:** T041, T036.

**Likely files:** `src/platform/preview/MarkdownPreviewRenderer.ts`, `src/platform/dom/CardRenderer.ts`, `tests/markdown-preview.test.ts`, `tests/fixtures/obsidian.ts`

**Estimated scope:** M

### T043: Extend linear virtualization for dynamic heights

**Description:** Add measurement updates, anchor compensation, and stable scroll behavior for Feed rows whose Markdown preview height resolves asynchronously.

**Acceptance criteria:**

- [ ] Height changes above the anchor do not cause visible scroll jumps.
- [ ] Measurements are path-keyed and invalidated by width/config changes.
- [ ] Mounted row count remains bounded.

**Verification:** `pnpm run test -- virtual-linear && pnpm run typecheck`

**Dependencies:** T030, T042.

**Likely files:** `src/platform/dom/VirtualLinearCollection.ts`, `src/core/layouts/linearVirtualRange.ts`, `tests/virtual-linear.test.ts`, `tests/linear-virtual-range.test.ts`

**Estimated scope:** M

### T044: Implement the Feed view adapter

**Description:** Build a single-column read-only feed from Bases order, dynamic virtual rows, CardRenderer, and visible-card previews.

**Acceptance criteria:**

- [ ] Feed respects Bases sort/group/filter output.
- [ ] Preview work is limited to mounted/overscan rows.
- [ ] Open/context/hover behavior uses NavigationService.

**Verification:** `pnpm run test -- feed-view && pnpm run typecheck`

**Dependencies:** T021, T035, T042, T043.

**Likely files:** `src/views/feed/BasesFeedView.ts`, `src/views/feed/feedOptions.ts`, `tests/feed-view.test.ts`, `tests/fixtures/feed.ts`

**Estimated scope:** M

### T045: Register, style, document, and license Feed

**Description:** Add Feed descriptor, regular CSS, user documentation, and attribution while explicitly documenting differences from editable Feed Bases.

**Acceptance criteria:**

- [ ] No React/TanStack packages are added.
- [ ] Feed CSS reuses card components and contains feed layout rules only.
- [ ] Documentation states that the integrated view is read-only.

**Verification:** `pnpm run check:ci`; native Feed scroll/preview acceptance.

**Dependencies:** T044, T002.

**Likely files:** `src/views/feed/index.ts`, `src/styles/views/feed.css`, `src/viewRegistry.ts`, `docs/feed-view.md`, `THIRD_PARTY_NOTICES.md`

**Estimated scope:** M

### Checkpoint G: Feed

- [ ] Feed contains no editor leaf or React dependency.
- [ ] Async preview cancellation and scroll-anchor evidence recorded.
- [ ] Human accepts Feed before Masonry work.

## Phase 7: Masonry strategy to Masonry

### T046: Implement pure masonry geometry

**Description:** Add validated column-count/card-width calculations, shortest-column placement, incremental placement, and stable-column repositioning.

**Acceptance criteria:**

- [ ] Layout functions have no DOM or Obsidian dependency.
- [ ] Narrow/zero widths and invalid gaps are safely clamped.
- [ ] Column assignments and container heights are deterministic.

**Verification:** `pnpm run test -- masonry-layout && pnpm run typecheck`

**Dependencies:** T035.

**Likely files:** `src/core/layouts/MasonryLayout.ts`, `tests/masonry-layout.test.ts`

**Estimated scope:** S

### T047: Implement masonry measurement cache and scroll anchors

**Description:** Add composite height keys, offscreen/lightweight measurement, estimate fallback, path anchors, and width/config invalidation.

**Acceptance criteria:**

- [ ] Cache keys include every dimension-affecting input.
- [ ] Measurement concurrency is bounded.
- [ ] A resized layout can restore the visible anchor path and offset.

**Verification:** `pnpm run test -- masonry-measurement && pnpm run typecheck`

**Dependencies:** T041, T046.

**Likely files:** `src/platform/dom/MasonryMeasurementCache.ts`, `src/core/layouts/MasonryAnchor.ts`, `tests/masonry-measurement.test.ts`, `tests/masonry-anchor.test.ts`

**Estimated scope:** M

### T048: Implement virtual masonry collection

**Description:** Mount only viewport/overscan cards, position them from pure geometry, dispose unmounted handles, and coalesce scroll/resize updates.

**Acceptance criteria:**

- [ ] Mounted card count is bounded for 5,000 items.
- [ ] Resize cancels prior work/animations instead of stacking it.
- [ ] Async content cannot mutate an unmounted card.

**Verification:** `pnpm run test -- virtual-masonry && pnpm run typecheck`

**Dependencies:** T036, T047, T022.

**Likely files:** `src/platform/dom/VirtualMasonryCollection.ts`, `src/platform/dom/MasonryMeasurementCache.ts`, `tests/virtual-masonry.test.ts`, `tests/fixtures/obsidian.ts`

**Estimated scope:** M

### T049: Implement the Masonry view adapter

**Description:** Connect grouped snapshots, card options, CardRenderer, preview service, and VirtualMasonryCollection into a read-only view.

**Acceptance criteria:**

- [ ] Adapter has no duplicate placement or card-rendering algorithm.
- [ ] Grouped/ungrouped order and collapse state are stable.
- [ ] Identical updates take the render fast path.

**Verification:** `pnpm run test -- masonry-view && pnpm run typecheck`

**Dependencies:** T018-T022, T048.

**Likely files:** `src/views/masonry/BasesMasonryView.ts`, `src/views/masonry/masonryOptions.ts`, `tests/masonry-view.test.ts`, `tests/fixtures/masonry.ts`

**Estimated scope:** M

### T050: Register, style, document, and license Masonry

**Description:** Add the descriptor, regular CSS, documentation, provenance, and native acceptance for Masonry.

**Acceptance criteria:**

- [ ] Masonry uses the same CardRenderer and preview service as prior views.
- [ ] CSS contains layout/transition rules rather than duplicated card presentation.
- [ ] Documentation states supported Dynamic Views subset.

**Verification:** `pnpm run check:ci`; native resize/scroll acceptance.

**Dependencies:** T049, T002.

**Likely files:** `src/views/masonry/index.ts`, `src/styles/views/masonry.css`, `src/viewRegistry.ts`, `docs/masonry-view.md`, `THIRD_PARTY_NOTICES.md`

**Estimated scope:** M

### Checkpoint H: Masonry

- [ ] Bounded mounting and resize-anchor evidence recorded.
- [ ] No duplicate CardRenderer/preview implementation.
- [ ] Human accepts Masonry before Keep preset work.

## Phase 8: Preset and sectioning to Keep

### T051: Define declarative card presets and property-driven sections

**Description:** Add preset composition and optional boolean/value sectioning without embedding Keep-specific property names in shared code.

**Acceptance criteria:**

- [ ] Presets only select shared renderer/layout options.
- [ ] Sectioning supports missing, false, true, and configured value semantics.
- [ ] Shared code contains no `keep_pinned` or `keep_color` constant.

**Verification:** `pnpm run test -- card-preset && pnpm run typecheck`

**Dependencies:** T035, T049.

**Likely files:** `src/core/cards/CardPreset.ts`, `src/core/entries/Sectioning.ts`, `tests/card-preset.test.ts`, `tests/sectioning.test.ts`

**Estimated scope:** M

### T052: Implement the compact fixed-width Keep adapter

**Description:** Configure CardRenderer and VirtualMasonryCollection for compact fixed-width cards, responsive tiers, optional pinned/other sections, cover, tags, and lightweight previews.

**Acceptance criteria:**

- [ ] Pinned and color properties are user-selected and blank by default.
- [ ] Card width changes column count rather than stretching cards.
- [ ] The adapter contains no mutation or popup-editor action.

**Verification:** `pnpm run test -- keep-view && pnpm run typecheck`

**Dependencies:** T041, T048, T051.

**Likely files:** `src/views/keep/BasesKeepView.ts`, `src/views/keep/keepOptions.ts`, `tests/keep-view.test.ts`, `tests/fixtures/keep.ts`

**Estimated scope:** M

### T053: Add bounded read-only `.base` preview capability

**Description:** Add optional lifecycle-owned rendering for `.base` cards only when visible, with strict cleanup and a lightweight fallback.

**Acceptance criteria:**

- [ ] Feature is off by default and controlled per view.
- [ ] Far-offscreen `.base` files are not rendered.
- [ ] A failed embed affects only its card and cleans up fully.

**Verification:** `pnpm run test -- base-preview && pnpm run typecheck`; native nested Base smoke.

**Dependencies:** T042, T052.

**Likely files:** `src/platform/preview/BasePreviewRenderer.ts`, `src/views/keep/BasesKeepView.ts`, `tests/base-preview.test.ts`, `tests/keep-view.test.ts`

**Estimated scope:** M

### T054: Add Keep-specific compact and responsive CSS

**Description:** Add only the visual preset rules not already owned by CardRenderer or Masonry, including responsive fixed widths and mobile bottom clearance.

**Acceptance criteria:**

- [ ] Card component rules are not copied.
- [ ] Desktop/tablet/mobile widths are expressed as variables/options.
- [ ] Reduced motion disables reflow animation cleanly.

**Verification:** `pnpm run build`; native desktop/tablet/mobile visual smoke.

**Dependencies:** T052, T016.

**Likely files:** `src/styles/views/keep.css`, `src/styles/components/card.css`, `src/views/keep/keepOptions.ts`, `styles.css`

**Estimated scope:** S

### T055: Register, document, and license Keep

**Description:** Add the descriptor, user documentation, integration test, and MIT attribution, emphasizing behavioral reimplementation from the public requirements.

**Acceptance criteria:**

- [ ] Keep registers once with a unique Wise View ID.
- [ ] Documentation lists omitted popup/write actions.
- [ ] Provenance does not claim copied TypeScript source from the upstream bundle.

**Verification:** `pnpm run check:ci`; native Keep acceptance.

**Dependencies:** T053, T054, T002.

**Likely files:** `src/views/keep/index.ts`, `src/viewRegistry.ts`, `docs/keep-view.md`, `THIRD_PARTY_NOTICES.md`, `tests/view-registry.test.ts`

**Estimated scope:** M

### Checkpoint I: Keep

- [ ] Keep is demonstrably a preset/adapter on shared card and masonry code.
- [ ] No pin/color/delete/popup mutation exists.
- [ ] Human accepts Keep feature scope.

## Phase 9: Cross-view hardening and release readiness

### T056: Complete cross-view keyboard and accessibility behavior

**Description:** Audit focus order, arrow/tab behavior, accessible names, selected/collapsed state, and reduced-motion semantics across all views.

**Acceptance criteria:**

- [ ] Every interactive element is keyboard reachable and named.
- [ ] Virtualized focus is restored or moved predictably when an item unmounts.
- [ ] Automated accessibility assertions cover every new view fixture.

**Verification:** `pnpm run test -- accessibility`; native keyboard-only pass.

**Dependencies:** T034, T040, T045, T050, T055.

**Likely files:** `src/platform/navigation/NavigationService.ts`, `src/platform/dom/CardRenderer.ts`, `tests/accessibility.test.ts`, `tests/fixtures/obsidian.ts`

**Estimated scope:** M

### T057: Add 5,000-entry performance and leak regressions

**Description:** Add deterministic large fixtures and structural assertions for mounted nodes, preview concurrency, skipped identical renders, and resource cleanup.

**Acceptance criteria:**

- [ ] Timeline, Feed, Masonry, and Keep mounted-node counts are bounded.
- [ ] Grid performs bounded batches/offscreen gating.
- [ ] Mount/update/unload cycles leave zero tracked resources.

**Verification:** `pnpm run test -- performance`

**Dependencies:** T056.

**Likely files:** `tests/performance.test.ts`, `tests/fixtures/large-base.ts`, `tests/fixtures/obsidian.ts`, `src/platform/dom/ViewRuntime.ts`

**Estimated scope:** M

### T058: Harden mobile, popout, theme, resize, and reduced motion

**Description:** Resolve issues found by cross-window and responsive acceptance without weakening lifecycle or performance contracts.

**Acceptance criteria:**

- [ ] Visible DOM/observers/styles use the owning window/document.
- [ ] All views respond to pane resizing and mobile controls.
- [ ] Light/dark and reduced-motion behavior is consistent.

**Verification:** Scoped automated tests plus recorded native matrix.

**Dependencies:** T057.

**Likely files:** `src/platform/dom/ownerWindow.ts`, `src/styles/foundations/accessibility.css`, `tests/popout-safety.test.ts`, `docs/acceptance/native-matrix.md`

**Estimated scope:** M

### T059: Finalize source attribution and artifact license verification

**Description:** Reconcile the provenance ledger with actual adapted files, notices, SPDX headers, generated banners, and bundled packages.

**Acceptance criteria:**

- [ ] Every adapted file maps to a ledger entry and notice.
- [ ] Every bundled npm package appears in notices.
- [ ] Build verification fails on a deliberately missing notice fixture.

**Verification:** `pnpm run build && pnpm run verify:artifacts && pnpm run test -- verify-build-artifacts`

**Dependencies:** T055, T002.

**Likely files:** `docs/architecture/upstream-provenance.md`, `THIRD_PARTY_NOTICES.md`, `scripts/verify-build-artifacts.mjs`, `tests/verify-build-artifacts.test.mjs`, `scripts/license-banner.mjs`

**Estimated scope:** M

### T060: Update product and developer documentation

**Description:** Document all eight views, architecture boundaries, configuration, compatibility, migration notes, performance behavior, and read-only differences from upstream sources.

**Acceptance criteria:**

- [ ] README and manifest describe the actual view catalog.
- [ ] Developer architecture explains how to add a future view using existing capabilities.
- [ ] Release/migration notes distinguish automated and native verification.

**Verification:** Link/heading check if available; manual documentation review; `pnpm run lint`.

**Dependencies:** T058, T059.

**Likely files:** `README.md`, `manifest.json`, `package.json`, `docs/architecture/view-platform.md`, `docs/release-readiness.md`

**Estimated scope:** M

### T061: Record final native Obsidian acceptance

**Description:** Run the approved vault fixture on supported desktop/mobile environments and record results independently of automated checks.

**Acceptance criteria:**

- [ ] Every view passes create/open/switch/update/resize/reload/unload flows.
- [ ] Light/dark, popout, keyboard, and large Base scenarios are recorded.
- [ ] Failures become new tasks; they are not waived by a passing CI build.

**Verification:** Signed native acceptance matrix plus `pnpm run check:ci`.

**Dependencies:** T060.

**Likely files:** `docs/acceptance/native-matrix.md`, `docs/release-readiness.md`

**Estimated scope:** S

### Checkpoint J: Complete

- [ ] `pnpm run check:ci`
- [ ] Eight view types registered and documented.
- [ ] SPEC Definition of Done checked item by item.
- [ ] Native acceptance approved.
- [ ] Release decision made by the maintainer.
