# Tasks: Timeline native sort/group adoption

Plan: [plan.md](plan.md)
Specification: [../../docs/specs/timeline.md](../../docs/specs/timeline.md)

## Phase 1: Row-order contract

### TL-001: Add a regression test pinning the Bases-sort-order contract

**Description:** Add a test that builds a Timeline model from entries under two different
Bases-configured sort orders and asserts the resulting row order changes to match each one, with
no intermediate resort inside `buildTimelineModel`, `flattenTimelineRows`, or `TimelineRenderer`.

**Acceptance criteria:**

- [ ] The test fails if any of the three functions above introduces its own sort.
- [ ] If the test fails against current code, the violation is fixed as part of this task.

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

- [ ] A written finding (accessor exists and how to use it, or confirmed absent) is added to
  `docs/specs/timeline.md` §3.
- [ ] The maintainer has chosen a branch (migrate vs. close-as-documented) before TL-003 starts.

**Verification:** Documentation review; no code change required for this task itself.

**Dependencies:** none.

**Likely files:** `docs/specs/timeline.md`

**Estimated scope:** S

## Phase 3: Implement the decision (conditional on TL-002's outcome)

### TL-003: Implement the chosen grouping approach, or close the item

**Description:** If TL-002 found a native-grouping accessor and the maintainer approved migrating
to it: implement the migration with a fallback for existing `groupProperty`-configured Bases. If
the maintainer approved closing the item: no code change, just the documented decision from
TL-002.

**Acceptance criteria:**

- [ ] If migrating: a regression test covers both the native-grouping path and the
  `groupProperty` fallback path.
- [ ] If closing: `docs/specs/timeline.md` clearly states the decision and why, so it is not
  re-investigated from scratch later.

**Verification:** `pnpm run test -- timeline-model timeline-options && pnpm run typecheck`

**Dependencies:** TL-002.

**Likely files:** `src/views/timeline/timelineOptions.ts`, `src/views/timeline/TimelineModel.ts`

**Estimated scope:** M (if migrating) / XS (if closing)

## Phase 4: Native acceptance

### TL-004: Native desktop/mobile smoke test

**Description:** Manually verify grouping, zoom, quick scheduling, and scroll-to-today after
TL-001 and TL-003's changes.

**Acceptance criteria:**

- [ ] No regression found versus the already-accepted Timeline behavior
  (`tasks/timeline-native-acceptance.md`).
- [ ] Findings recorded (append to `tasks/timeline-native-acceptance.md` or a new dated note).

**Verification:** Native testing; `pnpm run check`.

**Dependencies:** TL-001, TL-003.

**Likely files:** `tasks/timeline-native-acceptance.md`

**Estimated scope:** S
