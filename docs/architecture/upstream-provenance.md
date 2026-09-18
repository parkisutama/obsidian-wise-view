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

## Ledger

### Bases Timeline

- **Repository:** <https://github.com/mmattia09/obsidian-project-manager>
- **Commit:** `2c6ee7ca2ab881f5557df5a042a377b0139b8608`
- **License:** MIT
- **Reuse mode:** Design evidence only / behaviorally reimplemented.
- **Useful design evidence:** time-domain model, zoom levels, synchronized sidebar/timeline
  scroll, edge arrows, grouping, mobile list mode.
- **Excluded:** hardcoded status/priority workflows, direct writes, quick scheduling, the
  monolithic 1,316-line view structure.
- **File-level provenance:** none yet. Record here when a Timeline task (T028-T034) adapts a
  specific upstream file; otherwise Timeline is implemented from design evidence only and no
  `THIRD_PARTY_NOTICES.md` entry is required.
- **Attribution required:** only if a file-level entry above is added.

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
- **Reuse mode:** Design evidence only / behaviorally reimplemented.
- **Useful design evidence:** linear virtualization, dynamic measurement, feed presentation.
- **Excluded:** the React stack, private TanStack cache access, internal
  `new WorkspaceLeaf(app)` construction, embedded editable Markdown views.
- **File-level provenance:** none yet. Record here if a Feed task (T041-T045) adapts a
  specific upstream file.
- **Attribution required:** only if a file-level entry above is added.

### Dynamic Views

- **Repository:** <https://github.com/churnish/dynamic-views>
- **Commit:** `7af74541825440bdb581023b0f795b41190c6817`
- **License:** GPL-3.0-or-later
- **Reuse mode:** Design evidence only / behaviorally reimplemented.
- **Useful design evidence:** normalized `CardData`, data transform, content cache, render
  hashes, pure masonry layout, scroll anchors, popout safety, shared renderer, extensive
  tests.
- **Excluded:** wholesale import, 1.13-only API assumptions, the Sass pipeline, automatic
  `.base` cleanup, network thumbnails, the image viewer/slideshow, checkbox writes, and the
  broad settings framework.
- **File-level provenance:** none yet. Record here if a Card Core/Grid/Masonry/Keep task
  adapts a specific upstream file.
- **Attribution required:** only if a file-level entry above is added. Because this upstream
  project is GPL-3.0-or-later, Wise View (GPL-3.0-only) selects GPL version 3 for the
  combined distribution per specification §5.2; the upstream license and attribution must
  remain visible in any adapted file's header and in `THIRD_PARTY_NOTICES.md`.

## Existing bundled dependencies (already licensed, not part of this program's new adoption)

`obsidian-bases-gantt`, FullCalendar, Preact, and Frappe Gantt are already recorded in
[`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md) from prior work and are unaffected by
this ledger; they remain reconciled by `pnpm run verify:artifacts`.

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
