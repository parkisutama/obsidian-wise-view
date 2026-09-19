# Spec: Calendar code quality and organization

Status: Draft — awaiting maintainer review
Baseline branch: `dev`
Prepared: 2026-09-19
Roadmap: [../../ROADMAP.md](../../ROADMAP.md)

## 1. Objective

Reduce `src/views/BasesCalendarView.ts` (~1,260 lines) into a slim view class plus focused
modules, and fix the confirmed defect in its daily-note creation flow, without changing
Calendar's persisted `.base` option keys, its view ID, or its FullCalendar-backed behavior.

## 2. Scope

- Split the file along its existing seams (see §4) into a `src/views/calendar/` directory,
  mirroring `src/views/timeline/`'s pattern.
- **Daily-note template variables are duplicated and non-standard (defer the fix, not the
  finding):** `processTemplateVariables()` ([src/views/BasesCalendarView.ts:976](../../src/views/BasesCalendarView.ts))
  is a second, independently-written `{{...}}`-substitution engine (distinct from
  `NoteTemplateService.renderTemplate()`), used only by `openDailyNote()`'s "click a date number to
  open/create the daily note" flow. It never invokes Templater or Obsidian's core Templates
  plugin, so a daily-note template written in Templater syntax is copied in unprocessed. The
  *fix* for this is explicitly out of scope here — `docs/specs/note-template.md` owns the general,
  all-views redesign, sequenced after `docs/specs/performance.md` per `ROADMAP.md`. This
  workstream's job is to: (a) extract `processTemplateVariables`/`openDailyNote` into their own
  module so the future fix has a clean seam to land in, and (b) not duplicate or further diverge
  the two substitution engines while doing so.
- Confirm Calendar's own event-creation path (the "Note template" option group —
  `templatePath`/`targetFolder`/`titleFormat`, routed through `NoteTemplateService`) is otherwise
  unaffected by this workstream; it shares `NoteTemplateService` with Gantt and is also owned by
  `docs/specs/note-template.md`, not this one.

## 3. Non-goals

- No fix to the Templater-integration defect itself (§2's daily-note finding, or
  `NoteTemplateService`'s shared defect) — tracked and scheduled in `docs/specs/note-template.md`.
- No change to FullCalendar's bundled version or its rendering behavior beyond what the
  reorganization requires.
- No performance work beyond what naturally falls out of the split; large-Base verification is
  `docs/specs/performance.md`'s job.

## 4. Current internal seams (what to split along)

| Concern | Approximate responsibility |
|---|---|
| FullCalendar event mapping | Converting `EntrySnapshot`/Bases entries into FullCalendar event objects (date/color/title mapping). |
| Daily-note creation | `openDailyNote()`, `processTemplateVariables()`, `formatDate()` — reads the core `daily-notes` internal plugin's settings and creates/opens the note. See §2's note on this seam. |
| Event-note creation (via `NoteTemplateService`) | The click-to-create-event flow that reads the "Note template" option group and delegates to the shared `NoteTemplateService`. |
| Options schema | `createCalendarViewRegistration`'s `options` callback (week start, font size, default view, color/title/date fields, the "Note template" group, year-view row heights). |
| View lifecycle (`onload`/`onDataUpdated`/`onunload`) | What should remain in the slim view class after everything above is extracted. |

## 5. Verification policy

1. Characterization tests before extraction (this program's established pattern).
2. Extract one concern at a time; `pnpm run check` after each step.
3. The daily-note module extraction (§2) must not change its current substitution behavior —
   that change is explicitly deferred to `docs/specs/note-template.md`. A test asserting today's
   (defective) behavior is acceptable here specifically so the later fix has something to flip.
4. No new mutation API introduced outside the existing allowed paths
   (`tests/architecture.test.ts`'s `ALLOWED_MUTATION_PATHS`); update that list's path if the
   split moves mutating code into a new file under `src/views/calendar/`.

## 6. Definition of done

1. `src/views/BasesCalendarView.ts` is reduced to a slim view class; the concerns in §4 live in
   separate, individually testable modules.
2. The daily-note module is extracted with its current behavior (including the known defect)
   preserved and characterized, ready for `docs/specs/note-template.md` to fix later.
3. `pnpm run check` passes; no behavior regression is found in native testing of Calendar's
   existing feature set (view switching, event creation, daily notes, color-by).
4. `ROADMAP.md`'s Calendar row is updated to **Done (native-accepted YYYY-MM-DD)**.
