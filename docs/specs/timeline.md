# Spec: Timeline native sort/group adoption

Status: Draft — awaiting maintainer review
Baseline branch: `dev`
Prepared: 2026-09-19
Roadmap: [../../ROADMAP.md](../../ROADMAP.md)

## 1. Objective

Confirm and, where not already true, guarantee that Timeline's row order and grouping defer to
Obsidian Bases' own configuration rather than competing with it — without changing Timeline's
persisted `.base` option keys or view ID except where §3 explicitly approves a migration.

Timeline is already organized close to the pattern the other three view workstreams are moving
toward (`src/views/timeline/index.ts`/`TimelineModel.ts`/`TimelineRenderer.ts`/`BasesTimelineView.ts`),
so this spec is scoped to behavior, not file reorganization.

## 2. Scope: row order tracks Bases' sort

`buildTimelineModel` ([src/views/timeline/TimelineModel.ts:86](../../src/views/timeline/TimelineModel.ts))
consumes `this.data.data` — already sorted by Bases — without an additional sort of its own, and
groups items into a `Map` keyed by `groupProperty`, in first-seen order. This should already mean
row order tracks Bases' sort, but that has never been asserted by a test, and Swimlane's parallel
logic — a superficially similar `Map`-based grouping — explicitly re-sorts its group keys
alphabetically by default. Verify this per §4.1 rather than assume it.

**Scope:** add a regression test that pins the contract — change the Bases-configured sort,
assert Timeline's row order changes to match it, with no intermediate resort inside
`buildTimelineModel`, `flattenTimelineRows`, or `TimelineRenderer`. If the test finds a violation,
fix it as part of this workstream.

## 3. Scope: investigate native Bases grouping

Timeline's "Group by" is a Wise-View-specific `groupProperty` option
([src/views/timeline/timelineOptions.ts](../../src/views/timeline/timelineOptions.ts)), chosen
specifically to avoid the reserved `groupBy` config key (see
`docs/architecture/upstream-provenance.md`'s history of that parse-failure bug). This means a user
configuring grouping in Bases' own native UI and configuring Timeline's "Group by" option are two
separate, potentially conflicting settings.

**Scope:** research whether `QueryController`/`BasesViewConfig` expose a read accessor for the
user's *native* Bases group state (not just the reserved write-key Timeline already learned to
avoid) that a view can consume directly. Two possible outcomes, both acceptable if investigated
and documented rather than assumed:

- **If such an accessor exists:** migrate Timeline's grouping to read Bases' native group state
  directly, with a migration path for `groupProperty` (e.g. fall back to the custom option only
  when Bases has no native grouping configured, or deprecate the option with a clear notice).
- **If no such accessor exists:** close this scope item by documenting why the custom option
  remains the only mechanism, so a future contributor does not re-investigate the same question
  from scratch.

Either outcome requires the maintainer's sign-off before implementation, since the "migrate"
branch changes user-visible configuration.

## 4. Non-goals

- No change to Temporal Core (`src/core/temporal/`), zoom levels, or the rendering surface itself.
- No performance work beyond what naturally falls out of this scope; large-Base virtualization
  verification is `docs/specs/performance.md`'s job.
- No change to the quick-scheduling mutation capability (start/end drag) approved for Timeline.

## 4.1 Verification policy

1. Add the row-order regression test (§2) before touching any production code — if it already
   passes, that is the deliverable for §2 (a proven contract, not just an assumption).
2. §3's research produces a written finding (in this file or a linked note) before any
   implementation begins; get the maintainer's decision on which branch to take before coding it.
3. Any behavior change ships with its own regression test and a native acceptance note appended
   to `tasks/timeline-native-acceptance.md`'s pattern.

## 5. Definition of done

1. §2's row-order contract is proven by a passing regression test (fixed forward if it was
   violated).
2. §3's research question is answered and recorded, and if a migration was approved, it is
   implemented with a regression test and a documented option-deprecation path.
3. `pnpm run check` passes; no behavior regression is found in native testing of Timeline's
   existing feature set (grouping, zoom, quick scheduling, scroll-to-today).
4. `ROADMAP.md`'s Timeline row is updated to **Done (native-accepted YYYY-MM-DD)**.
