# Native acceptance: Calendar code quality and organization

Spec: [../../docs/specs/calendar.md](../../docs/specs/calendar.md)
Date: 2026-09-22
Accepted by: maintainer

## Verified

- View switching (Year/Month/Week/3-day/Day/List), including the year-view split/continuous
  toggle, was exercised repeatedly over the 2026-09-19..22 sessions while building Periodic Notes
  on top of the extracted modules.
- Event creation (drag-to-create, click-to-create-event-note), event drag/resize write-back, and
  color-by were exercised the same way, with no regression noted versus pre-extraction behavior.
- Daily-note behavior was superseded during this same period by `docs/specs/periodic-notes.md`
  (native-accepted 2026-09-21, [record](../periodic-notes/native-acceptance.md)); the maintainer
  confirmed periodic-note creation, linking, and display work correctly in the `wisetime` vault.
- No regression was reported against `src/views/BasesCalendarView.ts`'s pre-extraction behavior at
  any point across these sessions.

## Waived (not itemized separately from the above)

- No dedicated pass isolated to *only* the extraction's mechanical correctness (as opposed to the
  periodic-notes features layered on top) was recorded; the two were verified together in
  practice. Mobile and popout windows were not verified (see ROADMAP's mobile-UX follow-up).

## Definition of done (spec §6) — status

1. `BasesCalendarView.ts` reduced to a slim view class (715 lines, from ~1,257) with concerns in
   `src/views/calendar/`: done.
2. Daily-note module extracted with defect preserved and characterized: done, then superseded and
   replaced by the periodic-notes resolver (`docs/specs/periodic-notes.md`), which the maintainer
   accepted; the original defect no longer exists as such.
3. `pnpm run check` passes; no regression in native testing: done.
4. This record and the ROADMAP status update close out the workstream.
