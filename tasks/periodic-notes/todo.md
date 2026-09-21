# Tasks: Native periodic notes for Calendar

Plan: [plan.md](plan.md)
Specification: [../../docs/specs/periodic-notes.md](../../docs/specs/periodic-notes.md)
Sequencing: does not start until `docs/specs/note-template.md` is Done (see `../../ROADMAP.md`).

Status: In progress. PN-001 accepted with two verification notes (week-number link styling; Notebook
Navigator `GGGG` support); PN-002 done 2026-09-21.

## Phase 1: Design decisions

### PN-001: Resolve the open questions

**Description:** Decide spec §5: week numbering, which periods Calendar's UI links, handling of
unsafe patterns, and the Notebook Navigator conventions to match (read from its documentation).

**Acceptance criteria:**

- [ ] Each decision is recorded in `docs/specs/periodic-notes.md`.
- [ ] The token table is fixed.

**Verification:** Documentation review.

**Dependencies:** `note-template` Done.

**Likely files:** `docs/specs/periodic-notes.md`

**Estimated scope:** S

## Phase 2: Resolver

### PN-002: Token formatter and path resolver

**Description:** Pure `formatPeriodicTokens` and `resolvePeriodicPath(date, period, config)`.

**Acceptance criteria:**

- [x] No `obsidian` import.
- [x] Every token and period covered, including year/week boundaries, leap day, and a non-Monday
  week start.
- [x] `..` and absolute paths are rejected.

**Verification:** `pnpm run test -- periodic && pnpm run typecheck`

**Dependencies:** PN-001.

**Likely files:** `src/views/calendar/periodic/resolver.ts`, `tests/periodic-resolver.test.ts`

**Estimated scope:** M

## Phase 3: Settings

### PN-003: Per-period option group

**Description:** Add enabled/folder/name/template options per period to Calendar's options and a
typed reader for them.

**Acceptance criteria:**

- [ ] New keys only; no Bases-reserved key; existing keys unchanged.
- [ ] An unconfigured view behaves sensibly.

**Verification:** `pnpm run test -- calendar && pnpm run typecheck`

**Dependencies:** PN-002.

**Likely files:** `src/views/calendar/options.ts`, `src/views/calendar/periodic/config.ts`

**Estimated scope:** M

## Phase 4: Integrate and retire

### PN-004: Route Calendar flows through the resolver

**Description:** Open/create, journal dot, hover preview, and event-note folder use the resolver;
creation goes through the general mechanism from `note-template`.

**Acceptance criteria:**

- [ ] A non-empty `targetFolder` still wins for event notes.
- [ ] A multi-day event creates exactly one note, in the start day's folder.

**Verification:** `pnpm run test -- calendar && pnpm run typecheck`

**Dependencies:** PN-003, `note-template` NT-005.

**Likely files:** `src/views/calendar/dailyNote.ts`, `src/views/calendar/eventNote.ts`,
`src/views/BasesCalendarView.ts`

**Estimated scope:** L

### PN-004b: Period links in the calendar chrome and hiding periodic notes from events

**Description:** Hide entries that are the period note for their own start date from the event
list; add a week-number link column (month/week grids) and month/year/quarter underlined links in
the toolbar title, each with an existence dot, that open or create the note.

**Acceptance criteria:**

- [ ] A week/month/quarter/year/day note is not rendered as an event bar.
- [ ] Week numbers and the title's month / year / quarter parts reflect the visible date, show
  whether the note exists, and open or create it.
- [ ] Ordinary events whose path does not match any period path are unaffected.
- [ ] The week-number column uses `weekNumbers` / `navLinkWeekClick`; if it cannot be styled to
  match, the reason is recorded.

**Verification:** `pnpm run test -- calendar && pnpm run typecheck`

**Dependencies:** PN-004.

**Likely files:** `src/views/BasesCalendarView.ts`, `src/views/calendar/periodic/`, `styles`

**Estimated scope:** M

### PN-005: Retire the old lookups

**Description:** Remove the obsidian-journal and core Daily Notes lookups and the old
substitution code; replace their characterization tests with resolver-based ones.

**Acceptance criteria:**

- [ ] No reference to `journals`, `daily-notes`, or `processTemplateVariables` remains.
- [ ] `pnpm run check` passes.

**Verification:** `pnpm run check`

**Dependencies:** PN-004.

**Likely files:** `src/views/calendar/dailyNote.ts`, `tests/calendar-view.test.ts`

**Estimated scope:** M

## Phase 5: Native acceptance

### PN-006: Native acceptance

**Description:** Verify in a Notebook Navigator-style vault and in an unconfigured vault.

**Acceptance criteria:**

- [ ] Existing notes found (dot, hover, open); missing ones created with the template.
- [ ] Findings recorded in `tasks/periodic-notes/native-acceptance.md`.
- [ ] `ROADMAP.md` row updated to Done.

**Verification:** Native testing; `pnpm run check`.

**Dependencies:** PN-005.

**Likely files:** `tasks/periodic-notes/native-acceptance.md` (new), `ROADMAP.md`

**Estimated scope:** S
