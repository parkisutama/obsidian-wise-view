# Tasks: Native periodic notes for Calendar

Plan: [plan.md](plan.md)
Specification: [../../docs/specs/periodic-notes.md](../../docs/specs/periodic-notes.md)
Sequencing: does not start until `docs/specs/note-template.md` is Done (see `../../ROADMAP.md`).

Status: In progress. PN-001 accepted with two verification notes (week-number link styling; Notebook
Navigator `GGGG` support); PN-002, PN-003, and PN-004 done 2026-09-21 (PN-004 keeps the old journal
lookups as a fallback for Bases with no day pattern until PN-005). PN-004 is split into
PN-004b/p/c/d.

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

- [x] New keys only; no Bases-reserved key; existing keys unchanged.
- [x] An unconfigured view behaves sensibly.

**Verification:** `pnpm run test -- calendar && pnpm run typecheck`

**Dependencies:** PN-002.

**Likely files:** `src/views/calendar/options.ts`, `src/views/calendar/periodic/config.ts`

**Estimated scope:** M

## Phase 4: Integrate and retire

### PN-004: Route Calendar flows through the resolver

**Description:** Open/create, journal dot, hover preview, and event-note folder use the resolver;
creation goes through the general mechanism from `note-template`.

**Acceptance criteria:**

- [x] A non-empty `targetFolder` still wins for event notes.
- [x] A multi-day event creates exactly one note, in the start day's folder.

**Verification:** `pnpm run test -- calendar && pnpm run typecheck`

**Dependencies:** PN-003, `note-template` NT-005.

**Likely files:** `src/views/calendar/dailyNote.ts`, `src/views/calendar/eventNote.ts`,
`src/views/BasesCalendarView.ts`

**Estimated scope:** L

### PN-004b: Hide periodic notes from the event list

**Description:** Exclude entries that are the period note for their own start date (checked by
resolving each period's path for that date and comparing), so they are no longer drawn as bars.

**Acceptance criteria:**

- [x] A day/week/month/quarter/year note is not rendered as an event.
- [x] Ordinary events whose path matches no period path are unaffected.
- [x] With no period configured, nothing is hidden.

**Verification:** `pnpm run test -- calendar && pnpm run typecheck`

**Dependencies:** PN-003.

**Likely files:** `src/views/calendar/eventMapping.ts`, `src/views/BasesCalendarView.ts`

**Estimated scope:** S

### PN-004p: Prototype the period links (spike)

**Description:** Before building the visuals, confirm what FullCalendar 7 allows: a week-number
column at the left of the month grid with per-number content and click (`weekNumbers`,
`navLinkWeekClick`), and a toolbar title whose month / year / quarter parts can be separate
links. Record what works, what needs a custom element, and the chosen approach.

**Acceptance criteria:**

- [x] Findings recorded in `docs/specs/periodic-notes.md` (one short section).
- [x] No production code is required to land with this task.

**Verification:** Documentation review; a throwaway harness test or screenshot as evidence.

**Dependencies:** PN-004b.

**Likely files:** `docs/specs/periodic-notes.md`

**Estimated scope:** S

### PN-004c: Week-number link column

**Description:** Week numbers at the left of the month grid, each a link with an existence dot
that opens or creates that week's note. Shown only when the week period is configured.

**Acceptance criteria:**

- [x] Numbers follow the configured week numbering (ISO by default).
- [x] Dot shows for existing notes; click opens or creates through the general mechanism.
- [x] Not configured means no column links (plain numbers or none).

**Verification:** `pnpm run test -- calendar && pnpm run typecheck`

**Dependencies:** PN-004p, PN-004.

**Likely files:** `src/views/BasesCalendarView.ts`, `src/views/calendar/periodic/`, `src/styles`

**Estimated scope:** M

### PN-004d: Title links for month, year, and quarter

**Description:** The toolbar title reads `September 2026 (Q3)` with month, year, and quarter
each underlined as a link hint and an existence dot; click opens or creates that period's note.
Only periods that are configured render as links.

**Acceptance criteria:**

- [ ] Parts reflect the visible date and update on navigation and view change.
- [ ] Unconfigured periods render as plain text, without underline.
- [ ] Works in dark and light themes using Obsidian CSS variables, no hardcoded colors.

**Verification:** `pnpm run test -- calendar && pnpm run typecheck`

**Dependencies:** PN-004p, PN-004.

**Likely files:** `src/views/BasesCalendarView.ts`, `src/views/calendar/periodic/`, `src/styles`

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
