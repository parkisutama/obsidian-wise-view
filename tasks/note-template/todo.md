# Tasks: General note-template creation

Plan: [plan.md](plan.md)
Specification: [../../docs/specs/note-template.md](../../docs/specs/note-template.md)
Sequencing: does not start until `docs/specs/performance.md` is Done (see `../../ROADMAP.md`).

## Phase 1: Design decision

### NT-001: Resolve the design open questions with the maintainer

**Description:** Get a decision on spec §5's two questions: the Templater-absent fallback
behavior (silent vs. one-time notice), and whether the general mechanism replaces
`NoteTemplateService` outright or rewrites it in place.

**Acceptance criteria:**

- [ ] Both decisions are recorded in `docs/specs/note-template.md` before NT-002 starts.

**Verification:** Documentation review; no code change required for this task itself.

**Dependencies:** none (blocked at the workstream level on Performance being Done).

**Likely files:** `docs/specs/note-template.md`

**Estimated scope:** XS

## Phase 2: Templater integration

### NT-002: Implement note creation through Templater's public API

**Description:** When Templater is installed and enabled, create the note through its "create
note from template" API.

**Acceptance criteria:**

- [ ] A regression test using a fixture/mock of the Templater plugin object proves the real API
  is invoked, not just "no crash".
- [ ] Templater's own prompts and cursor placement behave as they would from Templater's own
  command (verified natively in Phase 6, not assumed here).

**Verification:** `pnpm run test -- note-template && pnpm run typecheck`

**Dependencies:** NT-001.

**Likely files:** `src/services/NoteTemplateService.ts` (or its replacement, per NT-001's decision)

**Estimated scope:** M

## Phase 3: Core Templates fallback

### NT-003: Implement the Obsidian core Templates fallback

**Description:** When Templater is absent but the core Templates plugin is enabled, fall back to
its insertion behavior.

**Acceptance criteria:**

- [ ] A regression test covers this path.

**Verification:** `pnpm run test -- note-template && pnpm run typecheck`

**Dependencies:** NT-002.

**Likely files:** Same as NT-002.

**Estimated scope:** M

## Phase 4: Last-resort path and token scoping

### NT-004: Keep a last-resort path and scope Wise View's own tokens correctly

**Description:** When neither Templater nor core Templates is available, keep a plain-text
frontmatter-merge path (with or without a user-facing notice, per NT-001's decision). Confirm
Wise View's own `{{date}}`/`{{title}}`/etc. tokens apply only to view-computed values, never as a
second substitution pass against the template file's own body.

**Acceptance criteria:**

- [ ] A regression test proves no overwrite-race and no raw-copy of an unprocessed template in
  this path.

**Verification:** `pnpm run test -- note-template && pnpm run typecheck`

**Dependencies:** NT-001.

**Likely files:** Same as NT-002.

**Estimated scope:** M

## Phase 5: Wire into Calendar, Gantt, and the daily-note flow

### NT-005: Route all three creation flows through the one general mechanism

**Description:** Wire Calendar's event-creation flow, Gantt's create-note flow, and Calendar's
daily-note flow (extracted in `docs/specs/calendar.md`'s CAL-004) through the mechanism from
Phases 2-4. Delete the old duplicated substitution logic.

**Acceptance criteria:**

- [ ] `NoteTemplateService.renderTemplate()`'s old substitution logic and
  `BasesCalendarView.processTemplateVariables()` (or its extracted module from CAL-004) are both
  removed.
- [ ] No duplicated `{{...}}`-substitution implementation remains anywhere in the codebase.

**Verification:** `pnpm run check`

**Dependencies:** NT-002, NT-003, NT-004; Calendar's CAL-004 and Gantt's note-creation extraction
must already exist.

**Likely files:** `src/views/calendar/dailyNote.ts`, `src/views/BasesCalendarView.ts`,
`src/views/BasesGanttView.ts` (or their extracted equivalents)

**Estimated scope:** M

## Phase 6: Native acceptance

### NT-006: Native acceptance across three flows and three plugin-availability states

**Description:** Create a note through Templater from Calendar, from Gantt, and from Calendar's
daily-note flow, each with a real Templater-syntax template; repeat with Templater disabled and
core Templates enabled, and with both disabled.

**Acceptance criteria:**

- [ ] All nine combinations (3 flows x 3 plugin states) behave correctly and are recorded.

**Verification:** Native testing; `pnpm run check`.

**Dependencies:** NT-005.

**Likely files:** `tasks/note-template/native-acceptance.md` (new)

**Estimated scope:** M
