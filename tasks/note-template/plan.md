# Implementation plan: General note-template creation

Status: Draft; implementation requires approval
Specification: [../../docs/specs/note-template.md](../../docs/specs/note-template.md)
Roadmap: [../../ROADMAP.md](../../ROADMAP.md)
Baseline: branch `dev`
Sequencing: does not start until `docs/specs/performance.md` is Done (see `ROADMAP.md`).

## Overview

Design once, implement once, retire two duplicated substitution engines. This plan assumes
Calendar's and Gantt's own workstreams have already extracted clean seams around
`NoteTemplateService` and the daily-note module — this plan lands the actual fix into those seams.

## Phase 1: Design decision

- Resolve spec §5's open questions with the maintainer: the Templater-absent fallback behavior,
  and whether the general mechanism replaces `NoteTemplateService` outright or rewrites it in
  place.

### Checkpoint A

- Both open questions are answered and recorded in `docs/specs/note-template.md` before any code
  is written.

## Phase 2: Templater integration

- Implement note creation through Templater's public API when Templater is installed and enabled.
- Add a regression test using a fixture/mock of the Templater plugin object that proves the real
  API is invoked (not just "no crash").

### Checkpoint B

- Templater-present path has a passing regression test.

## Phase 3: Core Templates fallback

- Implement the fallback to Obsidian's core Templates plugin when Templater is absent but
  Templates is enabled.
- Add a regression test for this path.

### Checkpoint C

- Core-Templates-present path has a passing regression test.

## Phase 4: Last-resort path and token scoping

- Keep a last-resort plain-text-with-frontmatter-merge path for when neither plugin is available,
  per Phase 1's decision on whether this should notify the user.
- Confirm Wise View's own `{{date}}`/`{{title}}`/etc. tokens apply only to view-computed values
  (never as a second substitution pass against the template body).

### Checkpoint D

- Last-resort path has a passing regression test proving no more overwrite-race and no more
  raw-copy of an unprocessed template.

## Phase 5: Wire into Calendar, Gantt, and the daily-note flow

- Route Calendar's event-creation flow, Gantt's create-note flow, and Calendar's daily-note flow
  through the one general mechanism from Phases 2-4.
- Delete `NoteTemplateService.renderTemplate()`'s old substitution logic and
  `BasesCalendarView.processTemplateVariables()` entirely once nothing depends on them.

### Checkpoint E

- No duplicated substitution logic remains in the codebase.
- `pnpm run check` passes.

## Phase 6: Native acceptance

- Create a note through Templater from Calendar, from Gantt, and from Calendar's daily-note flow,
  each with a real Templater-syntax template, and confirm correct processing in all three cases.
- Repeat with Templater disabled and core Templates enabled, and with both disabled.

### Checkpoint F: Note Template workstream complete

- Native acceptance recorded for all three creation flows across all three plugin-availability
  states.
- `ROADMAP.md`'s Note Template row updated to Done.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Templater's public API surface changes between versions | Medium | pin the tested Templater version in the regression test's fixture/mock; document the minimum supported version |
| Retiring the two old substitution engines breaks a user's existing `{{...}}`-token template that relied on the old (non-Templater) behavior | Medium | Phase 1's design decision must explicitly address backward compatibility for existing templates, not just new ones |

## Human gates

- Gate 1: approve the design decision (Phase 1) before implementation begins.
- Gate 2: accept native testing (Phase 6) before marking the workstream Done.
