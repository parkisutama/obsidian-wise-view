# Tasks: Swimlane code quality and organization

Plan: [plan.md](plan.md)
Specification: [../../docs/specs/swimlane.md](../../docs/specs/swimlane.md)

## Phase 1: Characterize current behavior

### SW-001: Add characterization tests for ordering, cover display, badges, and drag cleanup

**Description:** Extend or add tests covering `getOrderedColumnKeys`/`getOrderedSwimlaneKeys`
(default alphabetical order vs. saved custom order), cover display modes (banner/thumbnail-left/
thumbnail-right/background), badge placement (inline vs. properties-section), border styles, and
that repeated mount/update/unmount leaves no owned drag/touch/interval resource active.

**Acceptance criteria:**

- [ ] Ordering tests cover both the no-custom-order default and a saved custom order that
  includes a key not present in the saved order (the "new key appended" case).
- [ ] Cover display and badge placement tests assert on rendered DOM structure, not just that
  code runs without throwing.
- [ ] A repeated mount/update/unmount test asserts zero tracked resources remain.

**Verification:** `pnpm run test -- swimlane && pnpm run typecheck`

**Dependencies:** none.

**Likely files:** `tests/swimlane-view.test.ts` (or wherever Swimlane's existing tests live)

**Estimated scope:** M

## Phase 2: Extract ordering and options

### SW-002: Extract column/swimlane ordering into its own module

**Description:** Move `getOrderedColumnKeys`, `getOrderedSwimlaneKeys`,
`setCustomColumnOrder`, `setCustomSwimlaneOrder`, and the drag-reorder state fields into a
dedicated module under `src/views/swimlane/`.

**Acceptance criteria:**

- [ ] SW-001's characterization tests pass unchanged against the extracted module.
- [ ] The alphabetical-default-ordering question (spec §2) is resolved with the maintainer and
  the decision is recorded in `docs/specs/swimlane.md`.

**Verification:** `pnpm run test -- swimlane && pnpm run typecheck`

**Dependencies:** SW-001.

**Likely files:** `src/views/swimlane/ordering.ts`, `src/views/BasesSwimlaneView.ts`

**Estimated scope:** M

### SW-003: Extract the options schema

**Description:** Move `createSwimlaneViewRegistration`'s `options` callback into its own module.

**Acceptance criteria:**

- [ ] The options schema's serialized shape is unchanged (a snapshot/contains-key test).
- [ ] No Bases-reserved view-config key is used (matching the existing architecture-test pattern
  from other views).

**Verification:** `pnpm run test -- swimlane && pnpm run typecheck`

**Dependencies:** none.

**Likely files:** `src/views/swimlane/options.ts`, `src/views/BasesSwimlaneView.ts`

**Estimated scope:** S

## Phase 3: Extract card rendering and drag-and-drop

### SW-004: Extract card rendering (cover, badges, borders)

**Description:** Move the cover-display, badge-placement, and border-style card-building logic
into its own module.

**Acceptance criteria:**

- [ ] SW-001's cover/badge characterization tests pass unchanged.
- [ ] No mutation API call is introduced in the extracted module (architecture guard stays green).

**Verification:** `pnpm run test -- swimlane && pnpm run typecheck`

**Dependencies:** SW-001.

**Likely files:** `src/views/swimlane/cardRenderer.ts`, `src/views/BasesSwimlaneView.ts`

**Estimated scope:** M

### SW-005: Extract touch/mouse drag-and-drop handling

**Description:** Move card and column/swimlane drag-and-drop (touch and mouse) into its own
module, preserving the existing interval/cleanup lifecycle exactly.

**Acceptance criteria:**

- [ ] SW-001's resource-cleanup characterization test passes unchanged.
- [ ] Drag state fields move with their owning logic; `BasesSwimlaneView.ts` no longer declares
  drag-related fields directly.

**Verification:** `pnpm run test -- swimlane && pnpm run typecheck`

**Dependencies:** SW-001, SW-002.

**Likely files:** `src/views/swimlane/dragAndDrop.ts`, `src/views/BasesSwimlaneView.ts`

**Estimated scope:** L

## Phase 4: Native acceptance

### SW-006: Native desktop/mobile smoke test

**Description:** Manually verify drag-and-drop, cover display modes, badges, freeze headers, and
column/swimlane reordering on desktop and mobile after the extraction.

**Acceptance criteria:**

- [ ] No regression found versus pre-extraction behavior.
- [ ] Findings recorded (a short native-acceptance note, matching
  `tasks/timeline-native-acceptance.md`'s pattern).

**Verification:** Native testing; `pnpm run check`.

**Dependencies:** SW-002, SW-003, SW-004, SW-005.

**Likely files:** `tasks/swimlane/native-acceptance.md` (new)

**Estimated scope:** S
