# Timeline native acceptance record

## Status

- Date: 2026-09-19
- Environment: Obsidian desktop on Windows
- Result: **Accepted.** Desktop fidelity and interaction confirmed correct after T034H-T034M.
  Mobile was tested and works but is visually cramped; the maintainer explicitly deferred
  mobile UI/UX polish to a later cross-view pass rather than blocking Phase 5 on it. Popout
  window acceptance (dragging the Timeline tab into its own OS window) was not tested and
  remains open, non-blocking.
- Authority: maintainer-provided native screenshots, observations, and explicit acceptance on
  2026-09-19.

Automated tests remain separate evidence. Popout-window acceptance specifically remains
unclaimed; deferred mobile polish is tracked as technical debt, not a defect.

## Evidence received

The maintainer compared the current Wise View Timeline with the pinned Bases Timeline design
reference and supplied three screenshots:

1. Wise View file context menu on `Framework Dokumentasi`.
2. Current Wise View Timeline with nine notes rendered in the Unscheduled section.
3. Reference Timeline showing scheduled bars, compact controls, multi-level date header, sidebar
   collapse control, calendar banding, and the today indicator.

The attached screenshots were provided through the Codex conversation. Their observations are
recorded below so the repository does not depend on temporary clipboard file paths.

A second comparison supplied on 2026-09-19 showed compressed bars/header geometry, no hover action
for unscheduled rows despite configured start/end properties, and non-functional `Ctrl+wheel` zoom.
The maintainer clarified that Timeline is for listing and placing unscheduled work in time; Gantt
remains the future home for schedule dragging and dependency-line visualization.

A third comparison clarified that Timeline itself must support direct bar move and start/end resize
after placement. Gantt remains distinct because it will add dependency-line visualization and its
own dependency-aware scheduling semantics.

## Passed native checks

- [x] Ctrl-hover preview works.
- [x] Timeline is registered as a source in Obsidian's core Page Preview plugin.
- [x] Right-click opens the shared file menu.
- [x] The menu contains Open, Open in new tab, Open to the right, Open above, Open below, Open to
  the left, and Open in new window.
- [x] **Desktop layout and interaction, accepted 2026-09-19.**
- [x] **Mobile, tested 2026-09-19** — functional, but visually cramped; UI/UX polish explicitly
  deferred to a later cross-view mobile pass covering every Wise View surface at once, not a
  Timeline-specific defect.
- [ ] **Popout window** (dragging the Timeline tab out into its own OS window) — not yet
  tested. Note this is a different thing from "Page Preview" above: Page Preview is the
  Ctrl/Cmd-hover content tooltip (already confirmed working); a popout is a whole separate
  Obsidian window. Non-blocking for Phase 5, but still open.

Right-click/Open-menu/Page-Preview checks validate shared navigation integration. Desktop
layout/interaction and mobile functionality are now separately accepted as of 2026-09-19.

## Visual and behavioral gaps

| Area | Current Wise View evidence | Pinned upstream behavior to adapt |
| --- | --- | --- |
| Zoom control | Separate Day, Week, Month, Quarter, Year buttons | One compact zoom selector beside Today |
| Sidebar | Fixed-width list without an obvious collapse control | Compact collapse/expand control and more efficient label truncation |
| Temporal header | Single sparse row | Month/year band plus aligned day ticks |
| Calendar grid | Mostly blank surface with row separators | Readable vertical tick/weekend banding aligned with header |
| Today | Thin marker without the reference hierarchy | Date badge in header and line spanning the timeline rows |
| Unconfigured dates | Every note becomes Unscheduled | Configuration guidance when start property is not selected |
| Unscheduled notes | Repeated generic Unscheduled pills in each chart row | One section, retaining each note title and clear reason/state |
| Scheduled bars | Not demonstrated in the current screenshot | Compact bars aligned to date cells, with readable labels and row emphasis |
| Time density | Month view compresses titles into narrow fragments | Upstream-equivalent pixels per day and viewport-relative domain padding |
| Quick scheduling | Hovering an unscheduled row exposes no placement action | Dated ghost bar under the pointer that writes configured start/end properties on activation |
| Gesture zoom | `Ctrl+wheel` does not change the scale | Step zoom around the pointer while preventing application/page zoom |
| Scheduled editing | Placed bars cannot move or resize | Drag moves the range; left/right handles resize configured start/end dates |
| Open-ended domain | Grid stops after a finite rendered range or pane resize | Reflow to the actual viewport and extend the domain as scrolling nears either edge |
| Grouping | Synthetic Ungrouped and Unscheduled headers appear without Group by | No group header unless Group by is configured; unscheduled rows stay in their actual group/order |

A fourth comparison found that sidebar labels were still visually centered, the Today line was
hidden although its badge remained, weekend bands did not share horizontal scrolling, unscheduled
rows painted an opaque white strip, and a stale Bases refresh could visually undo a committed drag.
These are tracked by T034G. The date mutation gateway is already shared with Gantt; gesture geometry
cannot be shared directly because Gantt delegates it to Frappe while Timeline owns its DOM renderer.

## Fifth comparison (2026-09-19, post-T034H)

A native screenshot of `Framework Dokumentasi` (frontmatter `start: 2026-09-20`, `end:
2026-09-21`) showed the bar's hover tooltip reading `Framework Dokumentasi — 2026-09-20 –
2026-09-20`: the end date collapsed onto the start date, and the maintainer reported the left/
right/hover date indicators disagreeing with the actual range, with no corresponding change
reaching Markdown. Root cause: the shared `entrySnapshotAdapter.normalizeValue()` boundary (T018)
used the real `DateValue.toString()` directly, which can serialize a date-only property as a
UTC-anchored instant — landing on the previous calendar day once read back in a positive-UTC-
offset timezone (Indonesia is UTC+7). Fixed under T034I by preferring `DateValue.dateOnly()`'s
calendar day whenever it disagrees with `toString()`'s, matching the pattern `ganttUtils.ts`
already used. This was Timeline-only in practice because Timeline is currently the sole
production consumer of `entrySnapshotAdapter`.

## Sixth comparison (2026-09-19, post-T034I)

The maintainer noted that Timeline still "shows a timeline view" when start/end properties are
unset in the Bases view options, without any indication of which property (if any) actually
drives it — the fully-rendered toolbar, header, and grid around "today" implied a working
timeline that tracked nothing. Fixed under T034J: the toolbar/sidebar/chart chrome now hides
entirely (only the "Configure a start date property…" message remains) whenever no start
property is configured.

## Seventh comparison — acceptance (2026-09-19, post-T034M)

Following T034J (unconfigured-state chrome), T034K (bordered-pill bars, translucent group
rows), T034L (the `groupBy` reserved-key parse failure), and T034M (center on today at
creation), the maintainer confirmed: desktop layout and interaction are correct, and mobile is
functional (cramped, polish explicitly deferred to a later cross-view pass). **Timeline is
accepted.** Popout-window acceptance was not tested and stays open as a non-blocking item.
Phase 5 (Card Core/Grid) may begin.

## Required follow-up

- T034A owns toolbar, sidebar, temporal header/grid, today presentation, and scroll synchronization.
- T034B owns configured versus unscheduled semantics and scheduled-bar presentation.
- ~~T034C repeats desktop/mobile/popout acceptance and records the human decision.~~ Superseded
  by the seventh comparison above: desktop/mobile are accepted; popout remains open and
  non-blocking, tracked separately rather than gating Checkpoint E.
- T034E supersedes the earlier read-only Timeline restriction for quick scheduling and zoom fidelity.

Checkpoint E remains open. Phase 5 must not begin until the maintainer accepts Timeline or
explicitly waives the checkpoint.

## Cross-view idea: centered details window

The context menu screenshot also shows a **Show details** action separated from file-opening
destinations. The maintainer considers the centered-window model useful for Timeline and potentially
other views. T034D records this as a shared design problem. It is not part of the current Timeline
fidelity fix and must not be implemented as a one-off modal.

## Approved source reuse

On 2026-09-19 the maintainer approved full behavioral source adaptation from
`mmattia09/obsidian-project-manager` at commit
`2c6ee7ca2ab881f5557df5a042a377b0139b8608`, with attribution in adapted code. T034A may adapt
the layout and temporal interaction slices recorded in the provenance ledger. Quick scheduling into
the configured start/end properties is explicitly approved through the mutation gateway. Workflow
ordering, priority behavior, group/status writes, recurrence, and dependency behavior remain prohibited.
