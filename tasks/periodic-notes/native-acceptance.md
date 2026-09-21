# Native acceptance: Native periodic notes for Calendar

Spec: [../../docs/specs/periodic-notes.md](../../docs/specs/periodic-notes.md)
Date: 2026-09-21
Accepted by: maintainer, with waivers (below)

## Verified

- The maintainer ran the built plugin in the `wisetime` vault (Notebook Navigator-style layout,
  Templater installed) and reported that the periodic-notes behavior is OK. The report covers
  the whole workstream; individual flows were not itemized in this record.
- During the same session the maintainer confirmed by sight that period notes were created and
  shown in the Month view, and asked for the same in the week, 3-day, and day views, which were
  then added (`141e48b`).

## Waived (not verified natively, or not itemized)

Automated tests cover these (`tests/periodic-resolver.test.ts`, `tests/periodic-config.test.ts`,
`tests/periodic-notes.test.ts`, `tests/calendar-view.test.ts`), but this record does not show a
real-vault confirmation of each:

- Whether Templater's own folder-template setting also fires on a note created through its API,
  which could apply a template twice (spec decision 15). Report it here if seen.
- Core Templates as the engine, and the no-engine path with its every-time notice.
- A template that moves the note (`tp.file.move`): covered by a unit test, not exercised natively.
- A vault with no periodic settings (the view should behave as before, without links).
- Mobile and popout windows.
- The visual details of the week-number links and the title links (placement, underline, dot)
  were reviewed by the maintainer informally, without a recorded screenshot.

If any of these misbehave in real use, reopen PN-006 and record the flow and plugin state here.
