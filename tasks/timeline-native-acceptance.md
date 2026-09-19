# Timeline native acceptance record

## Status

- Date: 2026-09-19
- Environment: Obsidian desktop on Windows
- Result: visual fidelity rejected again after T034A-T034B; full attributed interaction adoption requested under T034E
- Authority: maintainer-provided native screenshots and observations

Automated tests remain separate evidence. This record does not claim mobile or popout acceptance.

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

## Passed native checks

- [x] Ctrl-hover preview works.
- [x] Timeline is registered as a source in Obsidian's core Page Preview plugin.
- [x] Right-click opens the shared file menu.
- [x] The menu contains Open, Open in new tab, Open to the right, Open above, Open below, Open to
  the left, and Open in new window.

These checks validate shared navigation integration only. They do not accept the Timeline layout.

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

## Required follow-up

- T034A owns toolbar, sidebar, temporal header/grid, today presentation, and scroll synchronization.
- T034B owns configured versus unscheduled semantics and scheduled-bar presentation.
- T034C repeats desktop/mobile/popout acceptance and records the human decision.
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
