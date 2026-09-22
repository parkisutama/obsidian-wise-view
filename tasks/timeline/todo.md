# Tasks: Timeline native sort/group adoption

Plan: [plan.md](plan.md)
Specification: [../../docs/specs/timeline.md](../../docs/specs/timeline.md)

## Phase 1: Row-order contract

### TL-001: Add a regression test pinning the Bases-sort-order contract

**Description:** Add a test that builds a Timeline model from entries under two different
Bases-configured sort orders and asserts the resulting row order changes to match each one, with
no intermediate resort inside `buildTimelineModel`, `flattenTimelineRows`, or `TimelineRenderer`.

**Acceptance criteria:**

- [x] The test fails if any of the three functions above introduces its own sort.
- [x] If the test fails against current code, the violation is fixed as part of this task. (The
  current implementation already preserved the contract; no production fix was needed.)

**Verification:** `pnpm run test -- timeline-model && pnpm run typecheck`

**Dependencies:** none.

**Likely files:** `tests/timeline-model.test.ts`

**Estimated scope:** M

## Phase 2: Native grouping research

### TL-002: Research whether Bases exposes native group state to a view

**Description:** Investigate `QueryController`/`BasesViewConfig`'s public surface for a read
accessor exposing the user's native Bases grouping (distinct from the reserved `groupBy` write-key
this program already learned to avoid). Record the finding.

**Acceptance criteria:**

- [x] A written finding (accessor exists and how to use it, or confirmed absent) is added to
  `docs/specs/timeline.md` §3.
- [x] The maintainer chose native-only grouping and removal of `groupProperty` on 2026-09-19.

**Verification:** Documentation review; no code change required for this task itself.

**Dependencies:** none.

**Likely files:** `docs/specs/timeline.md`

**Estimated scope:** S

## Phase 3: Implement the decision (conditional on TL-002's outcome)

### TL-003: Implement the chosen grouping approach, or close the item

**Description:** Implement the approved native-only grouping path through `groupedData` and remove
the plugin-specific `groupProperty` option. No compatibility fallback is retained, by explicit
maintainer decision, to minimize plugin maintenance code.

**Acceptance criteria:**

- [x] Regression tests cover native group ordering, row ordering, and the ungrouped path.
- [x] `groupProperty` is absent from Timeline options, requested properties, and production code.
- [x] `docs/specs/timeline.md` records the native-only decision and its rationale.

**Verification:** `pnpm run test -- timeline-model timeline-options && pnpm run typecheck`

**Dependencies:** TL-002.

**Likely files:** `src/views/timeline/timelineOptions.ts`, `src/views/timeline/TimelineModel.ts`

**Estimated scope:** M (if migrating) / XS (if closing)

## Phase 4: Native acceptance

### TL-004: Native desktop/mobile smoke test

**Description:** Manually verify grouping, zoom, quick scheduling, and scroll-to-today after
TL-001 and TL-003's changes.

**Acceptance criteria:**

- [x] No regression found versus the already-accepted Timeline behavior
  (`tasks/timeline-native-acceptance.md`).
- [x] Findings recorded (append to `tasks/timeline-native-acceptance.md` or a new dated note).

**Verification:** Native testing; `pnpm run check`.

**Dependencies:** TL-001, TL-003.

**Likely files:** `tasks/timeline-native-acceptance.md`

**Estimated scope:** S
