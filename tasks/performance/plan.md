# Implementation plan: Cross-view performance verification

Status: Draft; implementation requires approval
Specification: [../../docs/specs/performance.md](../../docs/specs/performance.md)
Roadmap: [../../ROADMAP.md](../../ROADMAP.md)
Baseline: branch `dev`
Sequencing: does not start until Swimlane, Calendar, Gantt, and Timeline's workstreams are Done
(see `ROADMAP.md`).

## Overview

Verify, per view, before fixing anything: most of §2's bars in the spec may already be met. Each
phase below is verify-then-fix, not assume-then-build.

## Phase 1: Bounded initial render (spec §2.1)

- Recreate or reuse a large-Base fixture (5,000-entry precedent) for each view.
- Measure/assert mounted-DOM-node counts (or the view-appropriate equivalent) stay bounded on
  first render for Swimlane, Calendar, Gantt, and Timeline.
- Fix any view found unbounded.

### Checkpoint A

- All four views have a passing, documented bounded-render test.

## Phase 2: Fast path for identical updates (spec §2.2)

- For Swimlane, Calendar, and Gantt: confirm or add a `RenderScheduler`/`computeRenderSignature`
  guard (reusing Timeline's existing infrastructure, not a new mechanism) so identical
  `onDataUpdated()` calls skip rebuilding unchanged DOM.

### Checkpoint B

- All four views have a passing, documented identical-update fast-path test.

## Phase 3: No accumulated work under repeated interaction (spec §2.3)

- Test Swimlane's drag-and-drop, Gantt's bar drag/resize (and dependency-line drag, if
  `docs/specs/gantt.md`'s editor has landed), and Calendar's view-mode switching under repeated
  fast triggers; confirm no accumulation of uncancelled work.
- Fix any view found accumulating work.

### Checkpoint C

- All three interactive views have a passing, documented no-accumulation test.

## Phase 4: Native acceptance

- Native large-Base smoke test across all four views, confirming the automated measurements match
  observed native behavior (scroll smoothness, no jank on interaction).

### Checkpoint D: Performance workstream complete

- `pnpm run check` passes.
- Native acceptance recorded.
- `ROADMAP.md`'s Performance row updated to Done, unblocking `docs/specs/note-template.md`.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| FullCalendar's or Frappe Gantt's own virtualization is assumed rather than confirmed | Medium | Phase 1 requires an actual measurement/test per view, not a assumption from documentation |
| A fast-path guard added to an existing view changes its update timing in a way native testing doesn't cover | Medium | Phase 4 explicitly re-verifies native behavior after Phases 1-3's changes, not before |

## Human gates

- Gate 1: accept native testing (Phase 4) before marking the workstream Done.
