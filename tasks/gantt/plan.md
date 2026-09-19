# Implementation plan: Gantt code quality, dependency editing, and the listener leak

Status: Draft; implementation requires approval
Specification: [../../docs/specs/gantt.md](../../docs/specs/gantt.md)
Roadmap: [../../ROADMAP.md](../../ROADMAP.md)
Baseline: branch `dev`

## Overview

Three independent concerns share one file today: extract it into `src/views/gantt/` first, then
land the dependency-line editor and the listener-leak fix into the resulting, smaller modules
rather than into the monolith.

## Phase 1: Characterize current behavior

- Add or extend tests covering: task data mapping (including the keyword-detection fallback),
  dependency mutation via the context menu, the WBS sidebar, and the Frappe Gantt lifecycle
  wrapper (construction/config mapping/teardown).

### Checkpoint A

- `pnpm run check` passes with the new/extended characterization tests, before any extraction.

## Phase 2: Extract modules

- Extract task data mapping, the Frappe Gantt lifecycle wrapper, the WBS sidebar, and the options
  schema into their own modules under `src/views/gantt/`.
- Leave the note-from-template creation seam extracted but behaviorally untouched (owned by
  `docs/specs/note-template.md`).

### Checkpoint B

- `src/views/BasesGanttView.ts` is reduced to a slim view class delegating to the extracted
  modules.
- Phase 1 characterization tests still pass unchanged.

## Phase 3: Frappe Gantt listener leak (spec §2.3)

- Investigate, in order: a newer Frappe Gantt version; a supported teardown/suppress option;
  vendoring a minimal patch; or a quantified, documented accepted bound. Stop at the first that
  resolves it.

### Checkpoint C

- The chosen resolution is implemented (or documented, for the accepted-bound outcome) with a
  test proving the leak is gone, or the bound is real and quantified.
- `docs/architecture/upstream-provenance.md` and `THIRD_PARTY_NOTICES.md` are updated to match
  whichever direction was taken.

## Phase 4: Interactive dependency-line editor (spec §2.2)

- Decide the interaction approach (custom SVG overlay vs. a Frappe Gantt version/library change)
  — informed by whatever Phase 3 already learned about Frappe Gantt's internals and version
  options.
- Implement drag-to-create, drag-to-repoint, and drag-to-remove, all writing to the existing
  "Dependencies" property.

### Checkpoint D

- The editor's writes produce the same property shape as the existing context-menu actions (no
  format drift).
- Regression tests cover create/repoint/remove via drag.

## Phase 5: Native acceptance

- Native desktop/mobile smoke test of bar drag/resize, WBS sidebar, view-mode switching, progress
  display, and the new dependency-line editor.

### Checkpoint E: Gantt workstream complete

- `pnpm run check` passes.
- Native acceptance recorded, including the dependency editor and confirmation the listener leak
  fix does not regress Gantt's rebuild/config-change behavior.
- `ROADMAP.md`'s Gantt row updated to Done.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Frappe Gantt version upgrade breaks existing bar-rendering behavior | High | characterization tests from Phase 1 must pass before and after any version bump; pin the exact version investigated in the provenance ledger |
| Vendoring a patched Frappe Gantt build drifts from upstream over time | Medium | keep the patch minimal (the single offending binding) and documented, matching the existing vendored-CSS-scoping precedent (`esbuild.config.mjs`'s `scopeFrappeGanttCss`) |
| Dependency-drag interaction conflicts with existing bar drag/resize gestures | High | prototype against the characterization tests from Phase 1 before committing to the interaction design; test both gestures together, not in isolation |

## Human gates

- Gate 1: approve the Frappe Gantt listener-leak resolution direction (Phase 3) before
  implementing it — this may involve a version upgrade or vendoring, both worth a sign-off.
- Gate 2: approve the dependency-editor interaction design (Phase 4) before implementing it.
- Gate 3: accept native testing (Phase 5) before marking the workstream Done.
