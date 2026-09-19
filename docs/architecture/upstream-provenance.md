# Upstream provenance ledger

Status: Active  
Specification: [Extensible view platform](../specs/extensible-view-platform.md)

This ledger records every upstream repository assessed for the extensible view platform
program, the exact snapshot inspected, its license, the reuse mode Wise View applies to it,
and what is explicitly excluded. It is the source of truth `pnpm run verify:artifacts` and
`THIRD_PARTY_NOTICES.md` are reconciled against (T059). No task may copy source from a
repository listed here beyond what its **Reuse mode** and **Excluded** rows permit.

## Reuse mode definitions

- **Design evidence only** — no source is copied; only observed behavior/structure informs
  Wise View's own implementation. No attribution notice is required, but the row stays here
  for review traceability.
- **Behaviorally reimplemented** — Wise View writes its own code to match documented/observed
  public behavior. No attribution notice is required unless a specific fragment is adapted
  (tracked per file below).
- **Modified** — a specific upstream source file is adapted with changes; requires SPDX/
  copyright header on the resulting Wise View file and a `THIRD_PARTY_NOTICES.md` entry.
- **Copied** — used verbatim (rare, e.g. vendored CSS); requires SPDX/copyright header and a
  `THIRD_PARTY_NOTICES.md` entry.

## Adaptation depth policy (2026-09-19)

The maintainer approved full per-file source adaptation — not just design-evidence-only
reimplementation — for every remaining upstream candidate below, on the same terms already
applied to Bases Timeline: strict per-file attribution (SPDX/copyright header, a
`THIRD_PARTY_NOTICES.md` entry, and a file-level provenance row here), and continued
enforcement of each candidate's **Excluded** feature list. This changes how much of a
candidate's *source* a task may adapt; it does not expand *which features* are in scope — the
feature boundaries the specification and each row's **Excluded** list already set (status/
priority workflows, checkbox writes, network thumbnails, the image viewer, dependency
semantics, etc.) are unchanged and still enforced task by task.

This does not apply to Keep Bases View: it remains bundle-only (see its row), so there is no
readable upstream TypeScript source this policy could extend adaptation to. Keep stays a
behavioral reimplementation from public requirements; a courtesy "inspired by Keep Bases View"
mention in its own documentation is welcome but not a license requirement, since no source is
copied.

## Ledger

### Bases Timeline

- **Repository:** <https://github.com/mmattia09/obsidian-project-manager>
- **Commit:** `2c6ee7ca2ab881f5557df5a042a377b0139b8608`
- **License:** MIT
- **Reuse mode:** Full behavioral adaptation of the task-agnostic Timeline surface approved by the maintainer on 2026-09-19; implementation remains modular rather than copying the monolith.
- **Useful design evidence:** time-domain model, zoom levels, synchronized sidebar/timeline
  scroll, edge arrows, grouping, mobile list mode, pointer-anchored zoom, and quick scheduling.
- **Excluded:** hardcoded status/priority workflows, direct unguarded writes, the
  monolithic 1,316-line view structure.
- **File-level provenance:** T034A may adapt the following pinned files:
  - upstream `src/timeline-view.ts` -> Wise View `src/views/timeline/TimelineRenderer.ts` and,
    only where lifecycle wiring is necessary, `src/views/timeline/BasesTimelineView.ts`;
    permitted scope is toolbar/sidebar controls, temporal header/grid, today indicator, edge
    navigation, scroll-anchor behavior, pointer/pinch zoom, quick scheduling, and bar drag/resize
    through the configured start/end mutation capability;
  - upstream `styles.css` -> Wise View `src/styles/views/timeline.css`; permitted scope is the
    corresponding layout, ghost-bar, and presentation rules.
- **Must remain excluded:** `PRIORITY_LEVELS`, `PRIORITY_RANK`, `STATUS_ORDER`, workflow group
  sorting, group/status drops, priority editing, arbitrary property writes, and hardcoded task
  property defaults. Quick scheduling and bar drag/resize may write only configured start/end dates.
- **Attribution required:** adapted TypeScript files carry an SPDX/copyright adaptation header;
  adapted CSS carries a preserved attribution header; the upstream MIT text is included in
  `THIRD_PARTY_NOTICES.md`.

### Keep Bases View

- **Repository:** <https://github.com/k4fn/keep-bases-view>
- **Commit:** `6bf8342fe6a50dcb4b653d8346be30d54390f846`
- **License:** MIT
- **Reuse mode:** Design evidence only / behaviorally reimplemented. **Copying is not
  permitted** — see limitation below.
- **Useful design evidence:** virtual masonry requirements, offscreen measurement, bounded
  preview concurrency, stable card widths, pinned sections, scroll restore.
- **Excluded:** copying bundled `main.js`, hardcoded `keep_pinned`/`keep_color` properties,
  the popup editor, and pin/color/delete writes.
- **Bundle-only limitation:** this upstream project publishes a built `main.js`, not its
  TypeScript source. Its public requirements and observed behavior are suitable as
  behavioral input only. The bundle must never be used as a bulk source file, and any
  fragment considered for direct reuse requires explicit provenance review first because
  bundled dependency boundaries inside `main.js` are unclear.
- **File-level provenance:** none. Keep (T051-T055) is implemented from public requirements
  and observed behavior, not from `main.js` source.
- **Attribution required:** no — no source is copied.

### Feed Bases

- **Repository:** <https://github.com/edrickleong/obsidian-feed-bases>
- **Commit:** `a753c21332b6ca07f7ffdf43fb2c50e013579e55`
- **License:** MIT
- **Reuse mode:** Full behavioral adaptation approved by the maintainer on 2026-09-19 (same
  terms as Bases Timeline); implementation remains modular rather than copying the file
  wholesale. A React-based file cannot be adapted as-is regardless — see Excluded — so adapting
  it still means porting its logic into Wise View's imperative-DOM approach, not copy-pasting.
- **Useful design evidence:** linear virtualization, dynamic measurement, feed presentation.
- **Excluded:** the React stack, private TanStack cache access, internal
  `new WorkspaceLeaf(app)` construction, embedded editable Markdown views.
- **File-level provenance:** none yet. A Feed task (T041-T045) records a row here, naming the
  specific upstream file(s) and resulting Wise View file(s), before adapting anything beyond
  design evidence.
- **Attribution required:** yes, once a file-level entry above is added — adapted TypeScript
  carries an SPDX/copyright adaptation header and the upstream MIT text is included in
  `THIRD_PARTY_NOTICES.md`. Reading the source for design evidence only, without adapting a
  specific file, still requires no attribution.

### Dynamic Views

- **Repository:** <https://github.com/churnish/dynamic-views>
- **Commit:** `7af74541825440bdb581023b0f795b41190c6817`
- **License:** GPL-3.0-or-later
- **Reuse mode:** Full behavioral adaptation approved by the maintainer on 2026-09-19 (same
  terms as Bases Timeline). Adaptation depth increases; the feature scope in **Excluded**
  below does not — this project still adopts only the listed core patterns, not the full
  settings/media subsystem the spec's risk table already warns is "much larger than Wise
  View."
- **Useful design evidence:** normalized `CardData`, data transform, content cache, render
  hashes, pure masonry layout, scroll anchors, popout safety, shared renderer, extensive
  tests.
- **Excluded:** wholesale import, 1.13-only API assumptions, the Sass pipeline, automatic
  `.base` cleanup, network thumbnails, the image viewer/slideshow, checkbox writes, and the
  broad settings framework.
- **File-level provenance:** none yet. A Card Core/Grid/Masonry task records a row here,
  naming the specific upstream file(s) and resulting Wise View file(s), before adapting
  anything beyond design evidence.
- **Attribution required:** yes, once a file-level entry above is added. Because this upstream
  project is GPL-3.0-or-later, Wise View (GPL-3.0-only) selects GPL version 3 for the
  combined distribution per specification §5.2; the upstream license and attribution must
  remain visible in any adapted file's header and in `THIRD_PARTY_NOTICES.md`. Reading the
  source for design evidence only, without adapting a specific file, still requires no
  attribution.

## Existing bundled dependencies (already licensed, not part of this program's new adoption)

`obsidian-bases-gantt`, FullCalendar, Preact, and Frappe Gantt are already recorded in
[`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md) from prior work and are unaffected by
this ledger; they remain reconciled by `pnpm run verify:artifacts`.

## Known upstream library limitations

Bugs in a bundled dependency that Wise View cannot fix without patching the vendored source.
Recorded here so a later task does not rediscover the same tradeoff from scratch, and so a
general fix (if one is ever found) gets applied everywhere it applies instead of once.

### Frappe Gantt leaks a `document`-level `mouseup` listener (T010, 2026-09-18)

`frappe-gantt@1.2.2`'s `Gantt` constructor attaches `document.addEventListener('mouseup', ...)`
internally (in `bind_bar_events`) and never removes it — not from `clear()`, not from
`destroy()`. Wise View previously captured that specific listener by temporarily replacing the
global `document.addEventListener` for the duration of `new Gantt(...)`, then removed the
captured listener on rebuild/unload (`BasesGanttView.ts`, before T010).

The T005 architecture guard now forbids overwriting a global browser API anywhere in the
codebase, and the spec names this exact monkey-patch as something to remove (spec §4.4). T010
removed the capture entirely rather than keep the workaround. The residual effect: one
`document`-level `mouseup` listener is now leaked per `new Gantt(...)` call (each Gantt config
change or rebuild), for the life of the Obsidian window. The listener resets local drag-state
closures and is a no-op once its `$container` is detached from the DOM — it does not throw or
corrupt state — but it keeps the detached Gantt instance's closures reachable, which is a real
(if bounded per rebuild, not per data update) memory cost.

No public Frappe Gantt API removes this listener, and there is no way to capture a third
party's listener reference at attachment time without intercepting `addEventListener` in some
form. If a later view (Timeline, or a future Gantt alternative) finds a general,
non-global-mutating interception technique — e.g. vendoring a patched build, or a documented
Frappe Gantt option to suppress this binding — revisit this decision and consider applying it
here too.

## How an implementation task records file-level provenance

When a task copies or modifies an upstream file (rather than only reading it for design
evidence):

1. Add a row under the relevant candidate's **File-level provenance** above naming the
   upstream file path, the resulting Wise View file path, and the commit it was taken from.
2. Add an SPDX license identifier and copyright header to the top of the resulting Wise View
   file.
3. Add or extend the corresponding entry in `THIRD_PARTY_NOTICES.md` with the full required
   notice text.
4. Add the component to `scripts/verify-build-artifacts.mjs` license verification coverage.
5. Keep a test that captures the adopted behavior so the provenance claim stays checkable.

A task that only used a repository as design evidence (no copied/modified file) does not need
steps 2-4, but should still confirm its ledger row's **Reuse mode** and **Excluded** notes are
accurate for what was actually built.
