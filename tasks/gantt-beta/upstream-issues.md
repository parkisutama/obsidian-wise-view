# Upstream issues to open on `jaeungkim/gantt-chart` (drafts)

Not opened: publishing to a third-party tracker is the maintainer's call. Version checked: v1.5.1
(`b8a92ff`).

## 1. Drags do not work in an Obsidian popout window

Obsidian can render the chart in a popout window, whose `document` and `window` differ from the
global ones. `useGanttBarDrag`, `useGanttProgressDrag`, `useGanttLinkDrag`, `useGanttDrawCreate`,
`useGanttRowDrag`, `GanttGridSplitter` and `GanttDependencyArrows` add `pointermove`, `pointerup`,
`pointercancel` and `keydown` listeners to the global `document`, and the link and row drags set
`document.body.style.cursor`. In a popout the pointer events fire on the popout's document, so the
listeners never see them.

Suggested fix: use `element.ownerDocument` (and `ownerDocument.defaultView` for `matchMedia`) instead
of the global `document`/`window`. `useResolvedTheme` also reads `document.documentElement`.

## 2. A way to give the chart its own "now" (or a local-time mode)

The today line, `scrollToToday`, `initialScrollTo="today"` and the "Add task" draft use `dayjs()`
(the real instant) on a grid built with `dayjs.utc`. Hosts that store floating local times (a note
saying "09:00" means 09:00 wherever you are) see these land up to |UTC offset| hours away, so around
local midnight they fall on the neighbouring day.

Suggested fix: a `now?: () => Dayjs` (or `now?: string`) prop consumed by those four call sites.
