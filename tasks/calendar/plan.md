# Implementation plan: Calendar code quality and organization

Status: Draft; implementation requires approval
Specification: [../../docs/specs/calendar.md](../../docs/specs/calendar.md)
Roadmap: [../../ROADMAP.md](../../ROADMAP.md)
Baseline: branch `dev`

## Overview

Extract `src/views/BasesCalendarView.ts`'s cohesive concerns into `src/views/calendar/`, leaving a
clean seam around the daily-note template-substitution defect for `docs/specs/note-template.md`
to fix later — this workstream extracts and characterizes it, but does not fix it.

## Phase 1: Characterize current behavior

- Add or extend tests covering: FullCalendar event mapping, the daily-note creation flow
  (including its current, defective template-substitution behavior — characterize it as-is), and
  the "Note template" event-creation flow via `NoteTemplateService`.

### Checkpoint A

- `pnpm run check` passes with the new/extended characterization tests, before any extraction.

## Phase 2: Extract event mapping and options

- Extract FullCalendar event-mapping logic into its own module.
- Extract the options schema (`createCalendarViewRegistration`'s `options` callback) into its own
  module.

### Checkpoint B

- Extracted modules pass the Phase 1 characterization tests unchanged.

## Phase 3: Extract daily-note creation

- Extract `openDailyNote()`, `processTemplateVariables()`, and `formatDate()` into their own
  module, preserving current (defective) behavior exactly — this is the seam
  `docs/specs/note-template.md` will fix later.

### Checkpoint C

- `src/views/BasesCalendarView.ts` is reduced to a slim view class delegating to the extracted
  modules.
- The daily-note module's characterization tests still pass unchanged.

## Phase 4: Native acceptance

- Native desktop/mobile smoke test of view switching, event creation, daily notes, and color-by.

### Checkpoint D: Calendar workstream complete

- `pnpm run check` passes.
- Native acceptance recorded.
- `ROADMAP.md`'s Calendar row updated to Done.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Extracting the daily-note module tempts fixing the template defect inline | Medium | explicit non-goal in the spec; characterize the current (defective) behavior as the acceptance bar for this phase, not the fix |
| FullCalendar's internal event object shape is easy to get subtly wrong during extraction | Medium | characterization tests assert on the mapped event objects' actual fields, not just "no crash" |

## Human gates

- Gate 1: accept native testing (Phase 4) before marking the workstream Done.
