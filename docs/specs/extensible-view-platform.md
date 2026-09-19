# Spec: Extensible view platform for Wise View

Status: Approved; Timeline mutation amendment approved 2026-09-19
Baseline branch: `dev`  
Baseline commit: `572895c` (`feat(swimlane): use a lanes icon instead of the kanban icon`)  
Prepared: 2026-09-18  
Approved: 2026-09-18 (all 8 decision gates accepted as proposed)

## 1. Objective

Refactor Wise View into a maintainable view platform that supports its existing Calendar, Gantt, and Swimlane views and can add Timeline, Grid, Masonry, Feed, and Keep views without copying a complete community plugin into one increasingly monolithic codebase.

The refactor must preserve existing behavior while extracting narrowly scoped capabilities. Each shared capability must be proven by an existing view or test harness and must immediately unlock the next new view. The intended result is a codebase where future view work is primarily an adapter, layout strategy, and view-specific presentation rather than another copy of data extraction, navigation, color, lifecycle, and rendering infrastructure.

This specification is the source of truth for the architecture and product boundaries. Implementation must not begin until the specification and its decision gates are approved.

## 2. Product principles

Wise View remains:

- task-management agnostic;
- local-first and offline-capable;
- mobile-compatible;
- an Obsidian Bases view-enrichment plugin rather than a task workflow engine;
- based on configurable properties rather than required frontmatter schemas;
- read-only by default for newly added views unless a human-approved, narrowly scoped capability amendment applies;
- compatible with Obsidian themes and optional Pretty Properties colors;
- distributable as the normal Obsidian plugin artifacts: `main.js`, `manifest.json`, and `styles.css`.

Existing write behavior in Calendar, Gantt, and Swimlane is preserved during behavior-neutral refactoring. It must be isolated behind an explicit legacy mutation capability before any new view is implemented. New views do not receive that capability unless a separate human-approved ADR changes this rule.

## 3. Assumptions

The specification proceeds with these assumptions:

1. All views are integrated into the existing `wise-view` plugin; Wise View does not require the source plugins to be installed at runtime.
2. The five new registrations are Timeline, Grid, Masonry, Feed, and Keep.
3. Grid and Masonry are separate Bases view types. Keep is an opinionated presentation preset backed by the same card and masonry platform, not a second masonry implementation.
4. Newly added views are read-only by default. The 2026-09-19 Timeline amendment permits quick scheduling into the configured start/end properties only; Feed inline editing, Keep pin/color/delete actions, and Dynamic Views checkbox mutation remain excluded.
5. Wise View continues to use imperative DOM and Obsidian `Component` lifecycle primitives. React, ReactDOM, TanStack Virtual, Sass, Tailwind, and other UI runtimes are not added.
6. Authoring uses modular regular CSS. The build still emits one root `styles.css` file.
7. The minimum supported Obsidian version is corrected to 1.10.2 because the existing code already calls `BasesView.createFileForView`, introduced in Obsidian 1.10.2. No Obsidian 1.13-only API may be used without a separate compatibility decision.
8. Existing view IDs and persisted Base option keys remain stable.
9. Existing Swimlane and Calendar behavior at commit `572895c` is the refactor baseline.
10. Source reuse follows the provenance and license requirements in this specification.

## 4. Current-state evidence

### 4.1 Repository baseline

The baseline was inspected on branch `dev` after these changes were committed:

- `618a511`: rename Kanban to Swimlane and remove preset properties;
- `7ce6449`: stop presetting Calendar title and all-day properties;
- `572895c`: use the lanes icon for Swimlane.

At specification time, `styles.css` was reported as modified only because of working-tree line-ending metadata; Git reported the same blob object and no content diff. That pre-existing working-tree condition must be preserved.

Quality baseline:

- `pnpm run check` passes;
- 9 test files pass;
- 59 tests pass;
- lint, Obsidian lint, and TypeScript checks pass;
- a native Obsidian desktop/mobile acceptance run was not performed during specification.

### 4.2 Current scale and responsibilities

| File | Lines | Observed responsibility load |
|---|---:|---|
| `src/views/BasesSwimlaneView.ts` | 2,906 | configuration, grouping, rendering, cards, badges, covers, keyboard navigation, desktop/touch dragging, persistence, virtualization, cleanup |
| `src/views/BasesGanttView.ts` | 1,716 | mapping, Frappe lifecycle, WBS panel, navigation, hover, resize, context menus, dependency editing, persistence |
| `src/views/BasesCalendarView.ts` | 1,344 | mapping, FullCalendar lifecycle, colors, navigation, journals/daily notes, creation, deletion, date persistence |
| `styles.css` | 3,773 | first-party styles plus generated/bundled vendor CSS |

The line count is evidence of mixed responsibilities, not a reason by itself to split files. The architectural problem is that view classes currently own infrastructure that every new view would otherwise repeat.

### 4.3 Confirmed gaps

| Area | Existing state | Required state |
|---|---|---|
| View registration | Manual registration and hover-source registration in `main.ts` | Descriptor registry as one source of truth |
| Entry lifetime | Several render models retain `BasesEntry` references | Immutable snapshots keyed by `file.path`; resolve live entries only during an active update/write |
| Property values | View-local extraction and string conversion | One typed normalization boundary for note, file, formula, list, link, checkbox, date, and null values |
| Colors | Repeated Pretty Properties/value-style/fallback logic; hardcoded fallback colors | Shared resolver returning semantic color tokens and contrast metadata |
| Navigation | Shared helper exists, but hover and modifier behavior remain duplicated | Shared open, context-menu, and hover service |
| Lifecycle | Mixed direct listeners, observers, timers, RAFs, and view-specific cleanup | Disposable runtime with owner-window safety and render cancellation |
| Rendering | Full rebuilds and view-specific debounce/signature logic | Shared render epoch, change detection, and scheduling primitives |
| Virtualization | Swimlane-only implementation; no shared contract | Layout-specific virtualization using common item identity, scheduling, and scroll anchoring |
| CSS | One large hand-written source/output file with legacy `planner-` and `kanban` selectors | Ordered regular-CSS source modules and generated root artifact |
| Naming | `PlannerPlugin`, `PlannerSettings`, `planner-*`, stale Kanban metadata | Wise View names internally; stable public view IDs; temporary CSS aliases where needed |
| Product boundary | Unused task schema remains; current views write directly | Remove dead task model; isolate existing writes; new views read-only |
| API stability | Some internal APIs and global `window`/`document` access | Public APIs by default; optional integrations isolated; DOM-derived window/document for popouts |
| Compatibility | Manifest says 1.10.0 while existing API use requires 1.10.2 | Manifest and documentation declare 1.10.2 minimum |

### 4.4 High-risk existing behaviors to contain

- Gantt temporarily replaces `document.addEventListener` while initializing Frappe Gantt. This global monkey-patch must be removed before it becomes shared infrastructure.
- Calendar and Gantt store view-engine models containing `BasesEntry` references. Obsidian documents that query results and entries are recreated after updates.
- Calendar, Gantt, and Swimlane directly write or trash files from view classes.
- `PropertyTypeService` reads undocumented `metadataTypeManager`; it has a fallback, but the integration boundary is not explicit.
- Calendar contains optional Daily Notes and Journals integrations inside the main view class.
- `src/types/item.ts` contains an unused task-oriented Planner schema and helpers.
- CSS and TypeScript continue to expose legacy Planner/Kanban internal names after the public Swimlane rename.

## 5. Upstream source assessment

The assessed snapshots are pinned so later implementation can distinguish design evidence from a moving upstream branch.

| Candidate | Snapshot | License | Useful design evidence | Do not adopt directly |
|---|---|---|---|---|
| Bases Timeline | `2c6ee7ca2ab881f5557df5a042a377b0139b8608` | MIT | time-domain model, zoom levels, synchronized sidebar/timeline scroll, edge arrows, grouping, mobile list mode, quick scheduling into selected date properties | hardcoded status/priority workflows, direct unguarded writes, monolithic 1,316-line view |
| Keep Bases View | `6bf8342fe6a50dcb4b653d8346be30d54390f846` | MIT | virtual masonry requirements, offscreen measurement, bounded preview concurrency, stable card widths, pinned sections, scroll restore | copying bundled `main.js`, hardcoded `keep_pinned`/`keep_color`, popup editor, pin/color/delete writes |
| Feed Bases | `a753c21332b6ca07f7ffdf43fb2c50e013579e55` | MIT | linear virtualization, dynamic measurement, feed presentation | React stack, private TanStack cache access, internal `new WorkspaceLeaf(app)`, embedded editable Markdown views |
| Dynamic Views | `7af74541825440bdb581023b0f795b41190c6817` | GPL-3.0-or-later | normalized `CardData`, data transform, content cache, render hashes, pure masonry layout, scroll anchors, popout safety, shared renderer, extensive tests | wholesale import, 1.13-only assumptions, Sass pipeline, automatic `.base` cleanup, network thumbnails, slideshow/image viewer, checkbox writes, broad settings framework |

### 5.1 Adoption rule

Adopt concepts and narrowly scoped code only when they fit Wise View's product boundary and target API version. Do not merge plugin repositories or preserve their internal architectures as sub-applications.

For each adapted unit:

1. record upstream repository, commit, source file, and license;
2. state whether the implementation is copied, modified, or behaviorally reimplemented;
3. add SPDX and copyright headers where source is copied or substantially adapted;
4. add the full required notice to `THIRD_PARTY_NOTICES.md`;
5. include the component in build-artifact license verification;
6. retain a test that captures the adopted behavior.

Keep Bases View publishes a built `main.js` rather than its TypeScript source. Its public requirements are suitable as behavioral input, but the bundle must not be used as a bulk source file. Any copied fragment requires explicit provenance review because bundled dependency boundaries are unclear.

### 5.2 License compatibility

Wise View remains `GPL-3.0-only`.

- MIT sources from Timeline, Keep, and Feed are technically compatible with GPLv3 distribution when copyright and permission notices are retained.
- Dynamic Views is `GPL-3.0-or-later`; GPL version 3 can be selected for a combined GPLv3-only distribution. Its upstream license and attribution must remain visible.
- A license-compatible source is not automatically architecture-compatible. React, Sass, or other upstream dependencies are not added merely because their license permits it.
- This is a technical compliance assessment, not legal advice.

## 6. Scope

### 6.1 In scope

- behavior-preserving refactoring of the existing three views;
- a shared registry, lifecycle runtime, data normalization, configuration, color, navigation, rendering, and CSS foundation;
- a temporal domain core shared by Calendar, Gantt, and Timeline;
- a card collection core shared by Swimlane, Grid, Masonry, Feed, and Keep;
- async content preview loading with caching, invalidation, concurrency limits, and cancellation;
- linear, grid, and masonry layout strategies with appropriate offscreen rendering control;
- five new Bases view registrations;
- accessibility, mobile, popout, theme, performance, and cleanup validation;
- license provenance and distribution notices;
- documentation and native Obsidian acceptance fixtures.

### 6.2 Out of scope

- task status, priority, recurrence, hierarchy, or dependency business logic;
- introducing a required frontmatter schema;
- Timeline bar drag/resize, priority editing, or group/status writes; quick scheduling is the sole approved Timeline mutation and must use the mutation capability;
- Feed inline editing or embedding source-mode Markdown editors;
- Keep pin/unpin, recolor, delete, or popup editing actions;
- Dynamic Views checkbox mutation, file creation, randomization commands, external thumbnail fetches, image viewer, slideshow, or Style Settings integration;
- a general UI framework or plugin-within-plugin architecture;
- React, Sass, Tailwind, or a new CSS/runtime dependency;
- changing existing public view IDs;
- removing existing Calendar/Gantt/Swimlane mutation behavior without a separate approved decision;
- full feature parity with every upstream plugin in the first integrated release.

## 7. Target architecture

### 7.1 Dependency direction

```text
Obsidian plugin shell and integrations
                |
                v
       Bases platform adapters
                |
                v
    immutable normalized view models
          /                \
         v                  v
  temporal domain      card collection domain
         |                  |
         v                  v
  view adapters       layout/preset adapters
         \                  /
          v                v
       DOM renderers + regular CSS
```

Dependencies point inward. Pure domain modules must not import `obsidian`. View adapters may depend on domain and platform modules. Domain modules must not depend on a particular view.

### 7.2 Proposed source organization

```text
src/
  core/
    entries/              # immutable normalized values and item identity
    temporal/             # dates, ranges, zoom, timeline coordinates
    cards/                # CardItem, slots, presentation model
    layouts/              # pure linear/grid/masonry calculations
  platform/
    bases/                # BasesEntry snapshot and view-config adapters
    dom/                  # lifecycle runtime, owner-window, scheduling
    navigation/           # open, modifier, context menu, hover
    colors/               # Pretty Properties, value style, CSS token resolution
    preview/              # cached async content loading and Markdown rendering
    mutations/            # capability-gated legacy write adapters only
  integrations/           # optional Daily Notes, Journals, Pretty Properties
  views/
    calendar/
    gantt/
    swimlane/
    timeline/
    grid/
    masonry/
    feed/
    keep/
  styles/
    foundations/
    components/
    views/
  viewRegistry.ts
  main.ts
```

Migration to this layout is incremental. A file is moved only after its shared responsibilities have been extracted and protected by tests.

### 7.3 View descriptor registry

`ViewDescriptor` is the single source of truth for:

- stable type ID;
- display name and icon;
- factory;
- view options;
- hover source metadata;
- optional commands;
- capability declaration, including whether legacy mutation is allowed.

`main.ts` iterates the descriptor list. Adding a view must not require separate edits for registration and hover attribution.

### 7.4 View runtime and disposal

Every view gets a `ViewRuntime`/`DisposableScope` that owns:

- DOM event listeners;
- Obsidian event refs;
- observers;
- timeouts and intervals;
- animation-frame requests;
- abort controllers;
- child `Component` instances used by Markdown rendering;
- render epochs used to reject stale async work.

The runtime must be idempotently disposable. It must derive visible-DOM constructors and RAF from `element.ownerDocument.defaultView` so popout windows work correctly. Process-level timers continue to use the main window and must be explicitly cleared.

No new view may call bare global `document` to create visible DOM or attach global listeners.

### 7.5 Immutable entry snapshots

Obsidian replaces `BasesQueryResult` and recreates `BasesEntry` objects. The shared data boundary therefore creates immutable snapshots during each `onDataUpdated` call.

Minimum identity and metadata:

```ts
interface EntrySnapshot {
  path: string;
  basename: string;
  extension: string;
  folder: string;
  ctime: number;
  mtime: number;
  values: ReadonlyMap<string, NormalizedValue>;
}
```

Snapshots contain only the property values requested by a view contract. They do not retain `BasesEntry`. Async rendering, caches, and virtual items are keyed by `path` plus relevant version/config data.

### 7.6 Property value service

The service normalizes:

- null and missing values;
- strings and numbers;
- booleans and checkboxes;
- dates and datetimes without accidental timezone conversion;
- lists and tags;
- internal links, external links, and file values;
- formula wrappers and other Bases value wrappers;
- file properties such as path, folder, tags, ctime, and mtime.

It exposes typed accessors rather than one universal string conversion. Rendering code decides whether it needs text, list items, date range, link, boolean state, or raw value.

### 7.7 Configuration service

Configuration follows these rules:

- view-specific options live in the `.base` file through `BasesViewRegistration.options`;
- plugin settings are reserved for truly cross-view behavior;
- values are validated and coerced in one place;
- defaults do not silently enforce status, priority, or task schemas;
- existing option keys remain stable;
- options affecting only CSS update CSS variables without forcing full data normalization;
- stale or duplicate `onDataUpdated` callbacks must not overwrite newer render state.

The full template/persistence system from Dynamic Views is not adopted in the first iteration.

### 7.8 Color service

The color resolver returns a structured result such as background, foreground, border, and source. Resolution priority is:

1. explicit valid color property selected by the user;
2. Pretty Properties integration;
3. Wise View `valueStyles` compatibility settings;
4. deterministic theme-aware fallback token.

View renderers consume CSS variables/classes. They must not introduce workflow-specific hardcoded hex colors. Existing hardcoded compatibility values are migrated through this resolver rather than multiplied.

### 7.9 Navigation service

One service provides:

- normal open;
- new tab/window and split behavior from modifier keys or context menu;
- consistent Page Preview hover events;
- correct source IDs from the registry;
- popout-safe event/document use;
- accessible activation from keyboard.

Optional plugin integrations are not accessed directly from generic renderers.

### 7.10 Mutation capability boundary

Existing mutations move behind small interfaces, for example:

```ts
interface DateMutationCapability {
  updateRange(path: string, start: string, end?: string): Promise<void>;
}
```

Only existing view adapters receive the capabilities required to preserve current behavior. Shared renderers and all new view adapters receive no mutation capability. Static architecture tests must reject direct calls to `processFrontMatter`, `vault.modify`, `trashFile`, and editor mutation APIs from new-view directories.

### 7.11 Render scheduling and change detection

Shared rendering primitives provide:

- monotonically increasing render epochs;
- cancellation through `AbortController`;
- deterministic render signatures based on `path`, `mtime`, relevant properties, config, groups, and order;
- fast paths for CSS-only changes;
- bounded async batches;
- stale-result rejection after view unload or a newer update;
- reusable path-keyed DOM reconciliation where practical.

The scheduler is infrastructure, not a renderer. Layout-specific policies remain in their view or layout strategy.

### 7.12 Temporal core

The temporal core is pure and shared by Calendar, Gantt, and Timeline. It owns:

- strict input parsing and date-only versus datetime distinction;
- inclusive/exclusive range normalization;
- open-ended/ongoing values;
- UTC-safe day indices for timeline coordinates;
- local-time formatting for Calendar where required;
- time-domain calculation and padding;
- zoom specifications and tick generation;
- today positioning;
- date-to-pixel and pixel-to-date conversion.

FullCalendar and Frappe Gantt remain third-party adapters. Timeline uses a Wise View DOM adapter. The core does not import either rendering engine.

### 7.13 Card collection core

The card platform is shared by Swimlane, Grid, Masonry, Feed, and Keep.

`CardItem` contains path identity, title, optional subtitle, cover reference, preview reference, tags, ordered property presentations, color token, timestamps, and accessibility label. It contains no DOM and no `BasesEntry`.

`CardRenderer`:

- renders composable slots for title, cover, preview, tags, and properties;
- returns a handle with the element and an idempotent cleanup function;
- uses the shared navigation and color services;
- has no knowledge of grid, masonry, feed, or pinned sections;
- can render a lightweight shell before async preview content is ready;
- keeps card dimensions stable when async content loads where the layout requires it.

Swimlane is the first consumer proof. Grid is the first new view unlocked by this core.

### 7.14 Content preview service

The preview service supports two read-only modes:

- lightweight text preview: frontmatter removed, bounded extraction, no network access;
- mounted Markdown preview: only for visible cards, rendered with public Obsidian rendering APIs and an owned child lifecycle component.

Its cache key includes at least path, mtime, preview mode, relevant property/config, and output limits. It provides:

- in-flight request deduplication;
- bounded concurrency;
- cancellation/stale render guards;
- per-path invalidation on vault modification;
- bounded cache size or explicit eviction;
- best-effort failure isolation per card.

The service never constructs `WorkspaceLeaf` directly and never embeds editable Markdown views.

### 7.15 Layout and virtualization strategies

Shared primitives include item identity, viewport calculations, overscan, scroll anchoring, scheduling, and mount/unmount handles. Layout remains strategy-specific:

- Timeline and Feed use vertical linear virtualization.
- Grid uses CSS Grid with batched mounting and `content-visibility`, or virtual rows if measurement proves it necessary. It must not synchronously build thousands of rich cards.
- Masonry uses a pure shortest-column calculation plus viewport-based card mounting.
- Keep reuses the Masonry strategy with section/preset configuration.
- Swimlane keeps per-column virtualization but migrates to the shared scheduler and card handles.

Masonry positions and column assignments are pure data and independently testable. Resizing preserves a visible path-based scroll anchor. Mounted card count is bounded by the viewport and overscan for Timeline, Feed, Masonry, and Keep.

### 7.16 View-specific adapters

#### Timeline

- configurable start, end, title, color, and optional group properties;
- grouped rows, collapsible sections, unscheduled items, sidebar, today action, zoom levels, edge indicators, open/context/hover behavior;
- vertical row virtualization;
- no status ordering assumptions, priority ranking, quick scheduling, or date writes;
- mobile layout may switch between sidebar/list and timeline surface without losing position.

#### Grid

- responsive equal-column card collection;
- configurable title, subtitle, cover, preview, tags, visible properties, width, and gap;
- grouping from Bases data;
- shared card renderer;
- batched/offscreen rendering policy suitable for thousands of entries.

#### Feed

- one-column chronological/document feed presentation;
- respects Bases sorting rather than implementing an independent workflow sort;
- visible-card Markdown or lightweight previews;
- dynamic-height linear virtualization with anchor preservation;
- read-only open/context/hover interaction;
- no React and no embedded editor leaf.

#### Masonry

- variable-height cards and shortest-column placement;
- shared card renderer and preview service;
- virtual mounting, measurement cache, stable resize behavior, and scroll anchoring;
- grouped and ungrouped results;
- no Dynamic Views extras outside this specification.

#### Keep

- visually compact masonry preset;
- fixed card-width behavior per responsive tier;
- optional pinned/other sections driven by a user-selected property, not a required hardcoded schema;
- cover, tags, lightweight note preview, and optional read-only `.base` preview;
- shared card renderer, preview service, and masonry strategy;
- no popup editor, pin/color/delete controls, or file commands.

### 7.17 CSS architecture

Regular CSS is retained. Source is divided into ordered modules:

```text
src/styles/
  foundations/       # tokens, theme mappings, focus, accessibility
  components/        # card, toolbar, badges, empty state, virtual collection
  views/             # calendar, gantt, swimlane, timeline, grid, feed, masonry, keep
```

The build owns `styles.css` as a generated distribution artifact and merges:

1. explicitly ordered first-party CSS modules;
2. transformed vendor CSS such as Frappe Gantt;
3. imported package CSS such as FullCalendar;
4. license notices and the existing bundle marker.

Rules:

- no Sass/PostCSS/Tailwind dependency;
- shared component styles appear once;
- selectors are scoped under `.wise-view-*` roots;
- existing `.planner-*`/Kanban selectors are migrated incrementally with temporary aliases where compatibility matters;
- colors and sizing use Obsidian and Wise View custom properties;
- no new workflow-specific hex/RGB literals;
- CSS-only view options are expressed as container variables;
- mobile and reduced-motion behavior are explicit.

## 8. Public compatibility contract

- Existing IDs `wise-view-calendar`, `wise-view-gantt`, and `wise-view-swimlane` do not change.
- Existing Base option keys and plugin setting data remain readable.
- Existing Calendar/Gantt/Swimlane behavior does not intentionally change during foundation phases.
- New view IDs use the `wise-view-` prefix and never claim generic IDs such as `feed`.
- Old `wise-view-kanban` migration remains as documented; this project does not reintroduce that ID.
- CSS selector compatibility aliases may be removed only after release notes and a deprecation window.
- The build remains mobile-capable and `isDesktopOnly` remains false.

## 9. Testing strategy

### 9.1 Test levels

| Level | Purpose |
|---|---|
| Pure unit tests | normalization, dates, zoom, hashes, color fallback, layout calculations, cache keys |
| Component DOM tests | card renderer, runtime cleanup, navigation events, virtual mount/unmount, accessibility |
| View integration tests | one fixture for every view registration and critical update/config flow |
| Architecture tests | import boundaries, view IDs, direct-write bans for new views, no React/Sass dependencies |
| Build tests | deterministic CSS assembly, license notices, artifact verification |
| Native acceptance | desktop/mobile, light/dark, popout, pane resize, view switch, reload, large Base |

### 9.2 Performance fixtures

A deterministic synthetic fixture must cover 5,000 entries with mixed groups, missing values, long titles, lists, dates, covers, and preview sizes.

Acceptance budgets are expressed structurally rather than as unreliable CI wall-clock numbers:

- Timeline, Feed, Masonry, and Keep mount only viewport plus configured overscan.
- No new view performs an unbounded synchronous content-read loop.
- Preview concurrency is bounded and test-observable.
- A newer render epoch cancels or invalidates older async results.
- Repeated identical updates do not rebuild the full DOM.
- All observers, handlers, RAFs, timers, render children, and async controllers are released on unload.

Native profiling records representative render/scroll timings, but those measurements do not replace the structural tests.

### 9.3 Required commands

```text
Install:          pnpm install
Lint:             pnpm run lint
Obsidian lint:    pnpm run lint:obsidian
Typecheck:        pnpm run typecheck
Tests:            pnpm run test
Coverage:         pnpm run test:coverage
Build:            pnpm run build
Artifacts:        pnpm run verify:artifacts
Full CI gate:     pnpm run check:ci
Development:      pnpm run dev
```

## 10. Definition of done

The program is complete when all of the following are true:

1. Eight stable view types are registered: Calendar, Gantt, Swimlane, Timeline, Grid, Masonry, Feed, and Keep.
2. All new views use normalized path-keyed models and never retain `BasesEntry` across updates.
3. Direct property parsing, hover dispatch, Pretty Properties lookup, and unmanaged lifecycle code are not duplicated in new view adapters.
4. Existing three views consume the shared foundation where applicable and retain their approved behavior.
5. Timeline uses Temporal Core; Grid uses Card Core; Feed adds Preview plus linear virtualization; Masonry adds the masonry strategy; Keep is a preset on the same masonry/card platform.
6. New views contain no direct vault/frontmatter/editor mutation API calls.
7. New views remain useful without status, priority, or task-specific fields.
8. CSS is authored as modular regular CSS and deterministically emitted as one licensed `styles.css` artifact.
9. No React or Sass runtime/build dependency has been added.
10. All automated gates pass, including license and architecture tests.
11. Desktop, mobile, popout, theme, resizing, reload, and 5,000-entry acceptance evidence is recorded.
12. `THIRD_PARTY_NOTICES.md` and adapted source headers match the actual implementation provenance.
13. Documentation explains configuration, differences from upstream projects, read-only boundaries, and supported Obsidian version.

## 11. Engineering boundaries

### Always

- add a failing characterization/unit test before changing established behavior or extracting risky logic;
- keep tasks dependency-ordered and independently verifiable;
- use `file.path` as durable identity;
- clean up every registered resource;
- derive visible DOM operations from the owning document/window;
- use view options for view-specific configuration;
- preserve licenses and provenance at adaptation time, not at release time;
- run the scoped tests during a task and `pnpm run check` at each checkpoint.

### Ask first

- add a production or build dependency;
- raise minimum Obsidian above 1.10.2;
- change an existing view ID or persisted setting key;
- change or remove existing write behavior;
- add a mutation feature to a new view;
- use an undocumented Obsidian API without an isolated fallback adapter;
- introduce network access or an external content provider;
- expand an upstream feature beyond the scope defined here.

### Never

- copy an upstream repository wholesale;
- store live `BasesEntry` or query-result objects in long-lived caches;
- make a shared component depend on task statuses or priorities;
- construct an internal `WorkspaceLeaf` for a card preview;
- monkey-patch global browser APIs;
- add unbounded global listeners, timers, or observers;
- hardcode new category/status color palettes in view renderers;
- write to the vault from a new view;
- hide license provenance in generated artifacts.

## 12. Decision gates

All eight gates below are **approved as proposed** (2026-09-18):

1. **Approved.** Five new view registrations rather than merging Feed multi-column mode into Feed or treating Keep as only a Grid/Masonry option.
2. **Approved.** Read-only first releases for all five new views.
3. **Approved.** Obsidian 1.10.2 as the compatibility floor; 1.13-only APIs rejected for this program.
4. **Approved.** Imperative DOM and regular CSS, with no React or Sass addition.
5. **Approved.** Selective Dynamic Views feature adoption rather than full parity.
6. **Approved.** Keep pinned/color properties as configurable and blank by default rather than enforcing `keep_pinned` and `keep_color`.
7. **Approved.** Isolation, not removal, of existing Calendar/Gantt/Swimlane writes during this program.
8. **Approved.** Modular CSS source with generated root `styles.css`.

The specification gate is cleared. Implementation proceeds per `tasks/plan.md` and `tasks/todo.md`, starting with Phase 0 (T002-T005).

## 13. Sources

### Official platform source

- [Obsidian: Build a Bases view](https://github.com/obsidianmd/obsidian-developer-docs/blob/main/en/Plugins/Guides/Build%20a%20Bases%20view.md)
- [Obsidian Bases views help](https://obsidian.md/help/bases/views)
- Installed API declarations: `node_modules/obsidian/obsidian.d.ts`, package version 1.12.3

### Upstream design sources

- [Bases Timeline snapshot](https://github.com/mmattia09/obsidian-project-manager/commit/2c6ee7ca2ab881f5557df5a042a377b0139b8608)
- [Keep Bases View snapshot](https://github.com/k4fn/keep-bases-view/commit/6bf8342fe6a50dcb4b653d8346be30d54390f846)
- [Feed Bases snapshot](https://github.com/edrickleong/obsidian-feed-bases/commit/a753c21332b6ca07f7ffdf43fb2c50e013579e55)
- [Dynamic Views snapshot](https://github.com/churnish/dynamic-views/commit/7af74541825440bdb581023b0f795b41190c6817)

### License references

- [GNU GPL version 3](https://www.gnu.org/licenses/gpl-3.0.html)
- [GNU GPL compatibility guidance](https://www.gnu.org/licenses/license-compatibility.html)
- [GNU license list: Expat/MIT compatibility](https://www.gnu.org/licenses/license-list.html)
- [SPDX license list](https://spdx.org/licenses/)
