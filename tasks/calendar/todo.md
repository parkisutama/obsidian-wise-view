# Tasks: Calendar code quality and organization

Plan: [plan.md](plan.md)
Specification: [../../docs/specs/calendar.md](../../docs/specs/calendar.md)

Status: CAL-001 through CAL-004 complete; CAL-005 awaits maintainer native testing.

## Phase 1: Characterize current behavior

### CAL-001: Add characterization tests for event mapping, daily notes, and event-template creation

**Description:** Extend or add tests covering FullCalendar event-object mapping, the daily-note
flow (`openDailyNote`/`processTemplateVariables`/`formatDate`, including its current defective
Templater behavior — characterize as-is), and the "Note template" event-creation flow via
`NoteTemplateService`.

**Acceptance criteria:**

- [x] Event-mapping tests assert on the mapped event objects' actual fields (date, color, title),
  not just "no crash".
- [x] The daily-note test explicitly documents today's behavior (raw template text copied
  unprocessed when Templater syntax is used) as the characterized baseline, not a bug to fix here.

**Verification:** `pnpm run test -- calendar && pnpm run typecheck`

**Dependencies:** none.

**Likely files:** `tests/calendar-view.test.ts` (or wherever Calendar's existing tests live)

**Estimated scope:** M

## Phase 2: Extract event mapping and options

### CAL-002: Extract FullCalendar event mapping

**Description:** Move the `EntrySnapshot`-to-FullCalendar-event mapping logic into its own module.

**Acceptance criteria:**

- [x] CAL-001's event-mapping tests pass unchanged.

**Verification:** `pnpm run test -- calendar && pnpm run typecheck`

**Dependencies:** CAL-001.

**Likely files:** `src/views/calendar/eventMapping.ts`, `src/views/BasesCalendarView.ts`

**Estimated scope:** M

### CAL-003: Extract the options schema

**Description:** Move `createCalendarViewRegistration`'s `options` callback into its own module.

**Acceptance criteria:**

- [x] The options schema's serialized shape is unchanged.
- [x] No Bases-reserved view-config key is used.

**Verification:** `pnpm run test -- calendar && pnpm run typecheck`

**Dependencies:** none.

**Likely files:** `src/views/calendar/options.ts`, `src/views/BasesCalendarView.ts`

**Estimated scope:** S

## Phase 3: Extract daily-note creation

### CAL-004: Extract the daily-note module, behavior unchanged

**Description:** Move `openDailyNote`, `processTemplateVariables`, and `formatDate` into their own
module. This is a pure extraction — the defect stays, on purpose, for
`docs/specs/note-template.md` to fix later.

**Acceptance criteria:**

- [x] CAL-001's daily-note characterization test (including the documented defect) passes
  unchanged.
- [x] The extracted module's public surface is a clean seam a future fix can call into without
  re-touching `BasesCalendarView.ts`.

**Verification:** `pnpm run test -- calendar && pnpm run typecheck`

**Dependencies:** CAL-001.

**Likely files:** `src/views/calendar/dailyNote.ts`, `src/views/BasesCalendarView.ts`

**Estimated scope:** M

## Phase 4: Native acceptance

### CAL-005: Native desktop/mobile smoke test

**Description:** Manually verify view switching, event creation, daily notes, and color-by after
the extraction.

**Acceptance criteria:**

- [ ] No regression found versus pre-extraction behavior.
- [ ] Findings recorded (a short native-acceptance note).

**Verification:** Native testing; `pnpm run check`.

**Dependencies:** CAL-002, CAL-003, CAL-004.

**Likely files:** `tasks/calendar/native-acceptance.md` (new)

**Estimated scope:** S
