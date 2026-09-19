# Implementation plan: Swimlane code quality and organization

Status: Draft; implementation requires approval
Specification: [../../docs/specs/swimlane.md](../../docs/specs/swimlane.md)
Roadmap: [../../ROADMAP.md](../../ROADMAP.md)
Baseline: branch `dev`

## Overview

Extract `src/views/BasesSwimlaneView.ts`'s cohesive concerns into `src/views/swimlane/` one at a
time, each extraction proven behavior-neutral by characterization tests before and after, mirroring
the pattern already established for Timeline's own module split.

## Phase 1: Characterize current behavior

- Add or extend tests covering: column/swimlane ordering (default alphabetical vs. saved custom
  order), cover display modes, badge placement, border styles, and drag-and-drop reorder state
  cleanup on unload.

### Checkpoint A

- `pnpm run check` passes with the new/extended characterization tests, before any extraction.

## Phase 2: Extract ordering and options

- Extract column/swimlane grouping and custom-order logic into its own module.
- Extract the options schema (`createSwimlaneViewRegistration`'s `options` callback) into its own
  module.
- Resolve spec §2's alphabetical-default-ordering question with the maintainer during this phase,
  before or alongside the extraction (the decision affects what the extracted module's contract
  looks like).

### Checkpoint B

- Ordering/options modules pass the Phase 1 characterization tests unchanged.
- The alphabetical-default-ordering decision (spec §2) is recorded in `docs/specs/swimlane.md`.

## Phase 3: Extract card rendering and drag-and-drop

- Extract cover/badge/border card-building logic into its own module.
- Extract touch/mouse drag-and-drop handling (card and column/swimlane reorder) into its own
  module, preserving the existing interval/cleanup lifecycle exactly.

### Checkpoint C

- `src/views/BasesSwimlaneView.ts` is reduced to a slim view class delegating to the extracted
  modules.
- Repeated mount/update/unmount tests report no owned resource left active (matching this
  program's established lifecycle-leak test pattern).

## Phase 4: Native acceptance

- Native desktop/mobile smoke test of drag-and-drop, cover display modes, badges, freeze headers,
  and column/swimlane reordering — no automated substitute for this step.

### Checkpoint D: Swimlane workstream complete

- `pnpm run check` passes.
- Native acceptance recorded.
- `ROADMAP.md`'s Swimlane row updated to Done.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| A large single-file view has undocumented coupling between "separate" concerns | Medium | one extraction at a time, characterization tests before each, `pnpm run check` after each |
| Alphabetical default-order change breaks an existing board's expected column order | Medium | treat as a maintainer decision (Phase 2), not an incidental side effect of extraction |
| Touch drag-and-drop cleanup logic is subtle and easy to regress silently | High | preserve interval/cleanup code verbatim during extraction; do not "improve" it in the same step |

## Human gates

- Gate 1: approve the alphabetical-default-ordering decision (Phase 2) before it's implemented.
- Gate 2: accept native testing (Phase 4) before marking the workstream Done.
