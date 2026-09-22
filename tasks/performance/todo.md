# Tasks: Cross-view performance verification

Plan: [plan.md](plan.md)
Specification: [../../docs/specs/performance.md](../../docs/specs/performance.md)
Sequencing: does not start until Swimlane, Calendar, Gantt, and Timeline's workstreams are Done
(see `../../ROADMAP.md`).

## Phase 1: Bounded initial render

### PERF-001: Verify (and fix if needed) bounded initial render for all four views

**Description:** Recreate or reuse a large-Base fixture (5,000-entry precedent) and measure/assert
mounted-DOM-node counts (or the view-appropriate equivalent) stay bounded on first render, for
Swimlane, Calendar, Gantt, and Timeline. Fix any view found unbounded.

**Acceptance criteria:**

- [x] Each of the four views has a passing test demonstrating bounded initial render.
- [x] Calendar's and Gantt's tests specifically confirm FullCalendar's/the Gantt library's own
  virtualization is actually engaged, not assumed from documentation.

**Verification:** `pnpm run test -- performance && pnpm run typecheck`

**Dependencies:** none (blocked at the workstream level on the four view workstreams being Done).

**Likely files:** `tests/performance.test.ts`, `tests/fixtures/large-base.ts`

**Estimated scope:** L

## Phase 2: Fast path for identical updates

### PERF-002: Verify (and add if missing) a render-fast-path guard for Swimlane, Calendar, Gantt

**Description:** Confirm each view either already has, or gets, a `RenderScheduler`/
`computeRenderSignature`-based guard (reusing Timeline's existing infrastructure) so identical
`onDataUpdated()` calls skip rebuilding unchanged DOM.

**Acceptance criteria:**

- [x] Each of Swimlane, Calendar, and Gantt has a passing test proving a no-op update takes the
  fast path.
- [x] No new render-scheduling mechanism is introduced; all three reuse the existing
  `RenderScheduler`.

**Verification:** `pnpm run test -- performance && pnpm run typecheck`

**Dependencies:** none.

**Likely files:** `src/views/swimlane/*.ts`, `src/views/calendar/*.ts`, `src/views/gantt/*.ts`

**Estimated scope:** M

## Phase 3: No accumulated work under repeated interaction

### PERF-003: Verify (and fix if needed) no accumulated work under repeated fast interaction

**Description:** Test Swimlane's drag-and-drop, Gantt's bar drag/resize (and dependency-line drag
if landed by this point), and Calendar's view-mode switching under repeated fast triggers; confirm
no accumulation of uncancelled work (timers, animation frames, listeners).

**Acceptance criteria:**

- [ ] Each interactive view has a passing test asserting bounded/cancelled work under rapid
  repeated triggers.

**Verification:** `pnpm run test -- performance && pnpm run typecheck`

**Dependencies:** PERF-001, PERF-002.

**Likely files:** `tests/performance.test.ts`

**Estimated scope:** M

## Phase 4: Native acceptance

### PERF-004: Native large-Base smoke test across all four views

**Description:** Manually verify scroll smoothness and interaction responsiveness on a large Base
across all four views, confirming automated measurements match observed native behavior.

**Acceptance criteria:**

- [ ] No jank or unresponsiveness found that the automated tests didn't already catch (or, if
  found, a new automated test is added to catch it before closing this task).
- [ ] Findings recorded (a short native-acceptance note).

**Verification:** Native testing; `pnpm run check`.

**Dependencies:** PERF-001, PERF-002, PERF-003.

**Likely files:** `tasks/performance/native-acceptance.md` (new)

**Estimated scope:** S
