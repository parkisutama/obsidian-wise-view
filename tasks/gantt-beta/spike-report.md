# GBETA-001 spike report

Branch: `codex/spike-gantt-beta`
Library: `@jaeungkim/gantt-chart@1.5.1`
Runtime: `preact@10.29.8` through esbuild aliases for `react`, `react-dom`, and
`react/jsx-runtime`

This report separates automated evidence from native Obsidian acceptance. Do not approve Gate 1
until every native row has been reviewed on the stated surface.

## Automated evidence

| Check | Result | Evidence |
|---|---|---|
| TypeScript strict check | Pass | `pnpm run typecheck` |
| Production build | Pass | `pnpm run build` |
| Artifact verification | Pass | `pnpm run verify:artifacts` |
| React runtime excluded | Pass | Production `main.js` contains no `react-dom`, `react-dom.production`, or `ReactDOM` marker |
| Production `main.js` size | 644,308 bytes | Baseline delta pending isolated baseline build |
| Production `styles.css` size | 117,927 bytes | Baseline at `HEAD`: 93,948 bytes; delta +23,979 bytes |

## Native interaction review

Use a Base and select **Gantt Beta spike**. Open Developer Tools during every check and record any
warning or error in Notes. Refresh the plugin between surfaces so mount/unmount is exercised.

| Surface | Interaction | Result | Notes |
|---|---|---|---|
| Desktop main window | Initial render | Pass | |
| Desktop main window | Move task | Pass | |
| Desktop main window | Resize task | Pass | |
| Desktop main window | Progress drag | Pass | |
| Desktop main window | Draw dependency | Pass | Callback logs `[Gantt Beta spike] dependency created` |
| Desktop main window | Delete dependency | Pass | Callback logs `[Gantt Beta spike] dependency deleted` |
| Desktop main window | Collapse/expand phase | Pass | `Discovery phase` is the parent row |
| Desktop main window | Reorder row | Pass | Callback logs `[Gantt Beta spike] task reordered` |
| Desktop main window | Draw range to create | Pass | Creates a volatile `Drawn task` row |
| Desktop main window | Open/close built-in detail panel | Pass | Panel opens; editing a field through the panel works |
| Desktop main window | Keyboard navigation/edit | Not tested | |
| Desktop main window | Switch light/dark theme | Pass | Must repaint without reopening the view |
| Desktop popout window | Initial render and all gestures above | Not tested | Record whether listeners attach to the correct window |
| Mobile | Initial render and all touch gestures available | Not tested | Not reached in this session. Record unsupported keyboard-only actions as N/A |
| All surfaces | Unmount/reopen view | Pass (desktop) | Confirm no duplicate chart or stale interaction |

## Console observations

- Automated build: no runtime console is available.
- Native warnings/errors: not reported in the 2026-09-19 desktop review; confirm the console
  was open before treating this as "none".

## Native review summary (maintainer, 2026-09-19, desktop main window)

Every desktop gesture that exercises the preact/compat runtime passed: render, move, resize,
progress drag, dependency draw and delete, phase collapse/expand, row reorder, draw-to-create,
detail panel open and field edit, light/dark repaint, and unmount/reopen.

Not yet covered:

- **Keyboard navigation/edit** — not reported.
- **Popout window** — not reported. The library's global `document` listeners are the same under
  React, so this is a library limitation, not a runtime question.
- **Mobile** — not reached. Touch goes through the library's pointer-event handling, which
  should behave the same under Preact; still verify, since Preact attaches events natively
  rather than through React's synthetic event system.

## Gate 1 decision

**Approved 2026-09-19** on desktop evidence (maintainer). The desktop evidence answers the runtime question (spec D1); the
three uncovered surfaces depend mainly on the library, not the runtime, and can move to native acceptance
(GBETA-017). Spike code is disposable and
must not be merged into `dev`.
