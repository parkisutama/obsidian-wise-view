# Native acceptance: General note-template creation

Spec: [../../docs/specs/note-template.md](../../docs/specs/note-template.md)
Date: 2026-09-21
Accepted by: maintainer, with waivers (below)

## Verified

- **Templater present:** the maintainer reported that note creation through Templater works and
  that Templater's own template picker is offered.
- **Expected behavior, not a defect:** a note created from a template whose frontmatter does not
  match the Base's filter is created but does not appear in that Base's view. The view shows
  only what the query returns.

## Scope note

The daily-note flow is owned by Periodic Notes, not this workstream (spec §5 decision 5). Its
clicked-date handling is tracked as PN-001 in `tasks/periodic-notes/`.

## Waived (not verified natively)

Automated tests cover these paths (`tests/note-template.test.ts`), but they were not exercised in
a real vault:

- Core Templates fallback (Templater disabled, core Templates enabled), including the note
  opening in a new tab so the template can be inserted.
- No-engine path (both disabled): the unprocessed copy and the every-time notice.
- Per-flow confirmation is not recorded individually for Calendar event, Gantt task, and daily
  note; the maintainer's report covers Templater generally.
- Templater's cursor placement after creation.

If any of these misbehave in real use, reopen NT-006 and record the flow and plugin state here.
