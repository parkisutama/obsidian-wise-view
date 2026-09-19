# Swimlane native acceptance record

## Status

- Date: 2026-09-19
- Environment: Obsidian desktop on Windows, and Obsidian mobile
- Result: **Accepted.** Desktop and mobile both work after the extraction into
  `src/views/swimlane/`. Mobile is functional but not mobile-friendly in sizing; the maintainer
  deferred that to a later cross-view pass (tracked in `ROADMAP.md` under Follow-ups) because each
  view needs its own CSS configuration for it.
- Authority: maintainer testing and explicit acceptance on 2026-09-19.

## Defect found and fixed during acceptance

With no Swimlane property set and Freeze headers on Columns/Both, the frozen column headers were
shifted right of their columns (the header row reserved the swimlane label column's width).
Fixed in commit `891d40d` (`planner-kanban-header-row--plain`), with a regression test; confirmed
on desktop and mobile.

## Not covered

Popout-window behavior was not tested. Automated tests do not exercise touch drag on a real
device beyond the lifecycle/cleanup characterization tests.
