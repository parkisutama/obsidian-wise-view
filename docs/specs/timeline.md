# Spec: Timeline native sort/group adoption

Status: Done 2026-09-22 (native-accepted with waiver: mobile UX deferred) — [record](../../tasks/timeline/native-acceptance.md)
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

`buildTimelineModel` consumes snapshot groups in the order supplied by Bases and does not apply an
additional sort. A regression test now runs both forward and reversed Bases-provided entry orders
through the model and `flattenTimelineRows`, proving that both preserve the input order.

**Scope:** add a regression test that pins the contract — change the Bases-configured sort,
assert Timeline's row order changes to match it, with no intermediate resort inside
`buildTimelineModel`, `flattenTimelineRows`, or `TimelineRenderer`. If the test finds a violation,
fix it as part of this workstream.

## 3. Scope: investigate native Bases grouping

Timeline formerly exposed a Wise-View-specific `groupProperty` option, separate from Bases' native
grouping. Maintaining both mechanisms created conflicting configuration and unnecessary plugin
code.

**Decision (maintainer, 2026-09-19):** use native Bases grouping exclusively and remove
`groupProperty`, without a compatibility fallback. This deliberately minimizes plugin-side
configuration and maintenance code. Existing `.base` files containing the obsolete custom key may
retain inert data, but Timeline neither reads nor exposes it.

### Research finding (2026-09-19)

The public Obsidian 1.12.3 API does expose native grouping results, but it does not expose the
configured grouping property through `QueryController` or `BasesViewConfig`:

- `BasesQueryResult.groupedData` returns `BasesEntryGroup[]` grouped according to the native
  `groupBy` configuration. With no native grouping it returns one group whose key is empty.
- Each `BasesEntryGroup` exposes the group `key`, its ordered `entries`, and `hasKey()`. This is
  enough for Timeline to consume native group labels and native within-group row order without
  reading the reserved config key.
- `QueryController` has no public grouping accessor, and `BasesViewConfig` only exposes generic
  option reads; the typed `BasesConfigFileView.groupBy` shape is intentionally opaque (`{}`). The
  public API therefore does not reveal which property produced a group.

Implementation uses `createEntrySnapshotGroups(this.data.groupedData, properties)` at the Bases
adapter boundary. The pure Timeline model receives only normalized group keys and immutable entry
snapshots, preserving native group and row order without retaining live `BasesEntryGroup` objects.
When Bases has no grouping configured, its single empty-key group renders without a synthetic
header. A missing-value group alongside keyed native groups is labelled `—`.

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
2. §3's research question and maintainer decision are recorded; native grouping is implemented
   with regression coverage and the removed custom option is documented.
3. `pnpm run check` passes; no behavior regression is found in native testing of Timeline's
   existing feature set (grouping, zoom, quick scheduling, scroll-to-today).
4. `ROADMAP.md`'s Timeline row is updated to **Done (native-accepted YYYY-MM-DD)**.
