# Spec: Swimlane code quality and organization

Status: Draft — awaiting maintainer review
Baseline branch: `dev`
Prepared: 2026-09-19
Roadmap: [../../ROADMAP.md](../../ROADMAP.md)

## 1. Objective

Reduce `src/views/BasesSwimlaneView.ts` (~2,770 lines, the largest file in the codebase) from one
monolithic view class into a small view class plus focused modules, without changing Swimlane's
persisted `.base` option keys, its view ID, or any user-visible behavior — this is a reorganization
and defect-fix spec, not a redesign of the board.

## 2. Scope

- Split the file along its existing internal seams (see §4) into separate modules under a
  `src/views/swimlane/` directory, mirroring the pattern `src/views/timeline/` already
  established (a slim `BasesSwimlaneView.ts` plus `*Model.ts`/`*Renderer.ts`/`*Options.ts`
  siblings).
- Fix any genuine defect found during the split (a bug hiding behind a large file is exactly the
  kind of thing this reorganization should surface) — but land a defect fix as its own commit,
  separate from the extraction that exposed it, per §5's verification policy.
- Re-audit the column/swimlane custom-ordering logic (`getOrderedColumnKeys`,
  `getOrderedSwimlaneKeys`) while it is being extracted: today it defaults to an **alphabetical**
  sort of column/swimlane keys rather than the order Bases would give them, only respecting a
  saved custom order once the user has dragged something. Confirm this alphabetical default is
  still the intended behavior (unlike Timeline, which is being changed to defer to Bases' sort —
  see `docs/specs/timeline.md`) and document the decision either way; do not silently change it
  as a side effect of the extraction.

## 3. Non-goals

- No change to Swimlane's card cover/badge/property rendering *behavior* — only its *location* in
  the file tree, unless §2's defect-fix allowance applies.
- No adoption of the general Note Template redesign — Swimlane does not currently have a note
  template feature; if this reorganization reveals it should, that's a finding for
  `docs/specs/note-template.md`, not new scope here.
- No performance work beyond what naturally falls out of the split (e.g. removing dead code found
  along the way). Bounded-rendering verification for large Bases is
  `docs/specs/performance.md`'s job, sequenced after this workstream.

## 4. Current internal seams (what to split along)

Based on a 2026-09-19 read of the file, these are the cohesive concerns already visible inside the
single class, in the order they appear:

| Concern | Approximate responsibility |
|---|---|
| Cover image resolution | Already extracted to `src/platform/dom/CoverImageResolver.ts` (2026-09-19) — Swimlane's only remaining piece is the thin `resolveImagePath` wrapper; confirm nothing else duplicates this logic. |
| Column/swimlane grouping and custom order | `getOrderedColumnKeys`, `getOrderedSwimlaneKeys`, `setCustomColumnOrder`, `setCustomSwimlaneOrder`, and the drag-reorder state (`Column reordering state`, `Swimlane reordering state` fields). |
| Card rendering (cover display, badges, borders) | Cover display mode (banner/thumbnail/background), badge placement, border style — the visual card-building logic. |
| Touch/mouse drag-and-drop | The card and swimlane/column drag handlers, including the touch-specific interval/cleanup logic already called out in the file's own comments. |
| Options schema | `createSwimlaneViewRegistration`'s `options` callback (~30 property/dropdown definitions). |
| View lifecycle (`onload`/`onDataUpdated`/`onunload`) | What should remain in the slim view class after everything above is extracted. |

## 5. Verification policy

1. Before any extraction, add or confirm characterization tests cover the current behavior of the
   module being extracted (per this program's established pattern — see `git log` around
   T006-T011, T036-T037 for the precedent).
2. Extract one concern at a time; run `pnpm run check` after each extraction before moving to the
   next. A `git mv`-and-refactor step that changes no behavior should not need new test
   assertions to stay green.
3. Any defect found (§2) ships as its own commit with a regression test, separate from the
   extraction commit that surfaced it.
4. Do not extract a module in a way that introduces an `obsidian` import into a `src/core/`
   directory, or a new mutation API outside `src/views/swimlane/` (the architecture guard in
   `tests/architecture.test.ts` already enforces this for new-view directories; confirm it is
   extended to cover `src/views/swimlane/` if that guard's directory list needs updating).

## 6. Definition of done

1. `src/views/BasesSwimlaneView.ts` is reduced to a slim view class; the concerns in §4 live in
   separate, individually testable modules.
2. The column/swimlane default-ordering behavior (§2) is either confirmed unchanged and
   documented, or deliberately changed with the maintainer's sign-off recorded here.
3. `pnpm run check` passes; no behavior regression is found in native testing of the existing
   Swimlane feature set (drag-and-drop, cover display modes, badges, freeze headers).
4. `ROADMAP.md`'s Swimlane row is updated to **Done (native-accepted YYYY-MM-DD)**.

## 7. Implementation notes (2026-09-19)

- **Ordering decision:** the alphabetical default for column/swimlane keys is **preserved
  unchanged** (`orderKeys` in `src/views/swimlane/ordering.ts`, covered by
  `tests/swimlane-ordering.test.ts`). Changing it to defer to Bases' sort remains a maintainer
  decision (plan Gate 1) and was not made here.
- **Extracted:** `options.ts`, `ordering.ts`, `values.ts`, `types.ts`, `cardRenderer.ts`,
  `dragAndDrop.ts` under `src/views/swimlane/`. `BasesSwimlaneView.ts` went from ~2,770 to ~1,300
  lines; column/swimlane layout rendering, keyboard navigation, and virtual scroll remain in it.
- **Removed:** the unused `createGenericBadge`.
- **Known quirk kept verbatim:** `reorderKeys` with a target not in the list (or dragging a key
  onto itself) inserts at a fallback index rather than no-oping. Fix separately with a regression
  test per §5.3.
- **Pending:** native acceptance (SW-006) and the ROADMAP row update.
