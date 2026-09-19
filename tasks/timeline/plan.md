# Implementation plan: Timeline native sort/group adoption

Status: Implemented; native acceptance pending
Specification: [../../docs/specs/timeline.md](../../docs/specs/timeline.md)
Roadmap: [../../ROADMAP.md](../../ROADMAP.md)
Baseline: branch `dev`

## Overview

This workstream is behavior-verification-first: prove the row-order contract, research the native
grouping question, and only then implement whatever the research and the maintainer's decision
call for.

## Phase 1: Row-order contract

- Add a regression test that changes the Bases-configured sort and asserts Timeline's row order
  changes to match, with no intermediate resort inside `buildTimelineModel`, `flattenTimelineRows`,
  or `TimelineRenderer`.
- If the test fails against current code, fix the violation.

### Checkpoint A

- The row-order regression test passes (whether it started passing or required a fix).

## Phase 2: Native grouping research

- Investigate whether `QueryController`/`BasesViewConfig` expose a read accessor for the user's
  native Bases group state.
- Record the finding in `docs/specs/timeline.md` §3, and bring it to the maintainer for a decision
  between the "migrate" and "close as documented" branches.

### Checkpoint B

- The research finding is recorded and the maintainer's decision is obtained before any
  implementation begins.

## Phase 3: Implement the decision (conditional)

- Implement the approved native-only grouping path through `BasesQueryResult.groupedData`.
- Remove the `groupProperty` option and fallback path to keep one grouping authority and minimize
  plugin maintenance code.

### Checkpoint C

- Whichever branch was taken is fully reflected in both the spec document and (if applicable) the
  implementation and its tests.

## Phase 4: Native acceptance

- Native desktop/mobile smoke test of grouping, zoom, quick scheduling, and scroll-to-today,
  confirming no regression from Phase 1-3's changes.

### Checkpoint D: Timeline workstream complete

- `pnpm run check` passes.
- Native acceptance recorded.
- `ROADMAP.md`'s Timeline row updated to Done.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| No public Bases API exposes native group state | Medium | Phase 2 is scoped to accept "no such API" as a valid, documented outcome, not a blocker |
| Existing Bases retain a saved `groupProperty` value | Low | The obsolete key is inert; Timeline follows native Bases grouping exclusively, as explicitly approved by the maintainer |

## Human gates

- Gate 1: approve the native-grouping research finding and choose a branch (Phase 2) before any
  implementation.
- Gate 2: accept native testing (Phase 4) before marking the workstream Done.
