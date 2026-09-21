# Spec: Native periodic notes for Calendar

Status: Draft — awaiting maintainer review
Baseline branch: `dev`
Prepared: 2026-09-21
Roadmap: [../../ROADMAP.md](../../ROADMAP.md)
Sequencing: after `docs/specs/note-template.md` is Done, then back to Calendar. That spec owns how a
note's *content* is produced (Templater / core Templates); this one owns *where a note lives and
what it is called*. Both meet in one creation call, so the template mechanism lands first.

## 1. Objective

Give Calendar a native, self-contained periodic-notes system, so daily/weekly/monthly/quarterly/
yearly notes and new event notes resolve to the right folder and name without installing
obsidian-journal, Periodic Notes, or depending on the core Daily Notes settings. The path and
template conventions must be expressible in a way compatible with Notebook Navigator's, so a vault
already organized by it works without moving files.

## 2. Decisions already made (maintainer, 2026-09-21)

1. **No cross-day event splitting.** An event spanning several days is one note, stored in the
   periodic folder of its **start** day. `date_end` carries the end. No per-day copies and no
   `part_of` / link-to-previous-day property.
2. **Settings live on the Calendar view**, not globally. A vault can hold several time systems
   (for example a personal journal and a work journal); each Base's Calendar view configures its
   own. This replaces installing a journal plugin for multiple periodic systems.
3. **The periodic root is free.** It does not have to be inside, or equal to, the folder of the
   `.base` file.
4. **Standalone.** No reading of obsidian-journal, Periodic Notes, core Daily Notes, or Notebook
   Navigator settings, and no migration: nobody uses the current behavior yet.
5. **Templater-compatible.** Note content goes through the general mechanism from
   `docs/specs/note-template.md`; this spec adds no substitution engine of its own.

## 3. Scope

1. **Per-period configuration** on the Calendar view, for each of day, week, month, quarter, year:
   enabled flag, folder pattern, file-name pattern, template note. Persisted `.base` option keys
   are new and must avoid Bases-reserved view-config keys.
2. **Path patterns using moment-style tokens** (`YYYY`, `MM`, `DD`, `ddd`, `gggg`, `[W]ww`, `Q`,
   with `[...]` literals), so a folder pattern such as `Journal/YYYY/MM` and a name pattern such as
   `YYYY-MM-DD` can be set to match Notebook Navigator's layout. Exact token table is fixed by
   PN-001.
3. **One resolver** `resolvePeriodicPath(date, period, config)` returning folder + name + full
   path. Pure, no `obsidian` import, unit-testable.
4. **Calendar integration:**
   - Clicking a day number, or a week/month/quarter/year header where such a link exists, opens
     or creates that period's note.
   - The journal dot and hover preview use the same resolver, for existing notes only.
   - A new event note goes to the resolved daily folder of its start date whenever the view's
     `targetFolder` option is empty. A non-empty `targetFolder` still wins.
5. **Creation** goes through the general mechanism from `note-template.md` with the period's
   template note. This spec never reads the template file or substitutes tokens itself.
6. **Retire** the obsidian-journal and core Daily Notes lookups in
   `src/views/calendar/dailyNote.ts`, and `processTemplateVariables`/`formatDate`, in favor of the
   resolver plus the general creation call.

## 4. Non-goals

- No support for reading another plugin's settings (see decision 4).
- No event splitting, no `part_of`, no sync between notes (decision 1).
- No recurrence, no task logic, no automatic creation of notes in advance
  (`AGENTS.md`: Wise View is a view enrichment plugin, not a task manager).
- No change to Gantt, Swimlane, or Timeline. Periodic notes are Calendar-only until another view
  asks for them.
- No global (plugin-level) periodic settings; per-view only (decision 2).

## 5. Open questions (resolve in PN-001)

- Week numbering: ISO weeks (`gggg-[W]ww`, Monday start) versus following the view's
  `weekStartsOn`. Notebook Navigator's own convention decides, and it must be read from its
  documentation, not assumed.
- Which periods does Calendar's UI actually link (day numbers only today; week/month headers
  only where FullCalendar exposes a nav link)? Enabling week/month/quarter/year notes may need
  new affordances, which is scope to confirm before building.
- What happens when a folder pattern resolves outside the vault or contains a path-traversal
  segment (`..`)? Proposed: reject and show a notice; PN-001 to confirm.
- The exact Notebook Navigator defaults to match, and whether an example-only "preset" button is
  worth having.

## 6. Verification policy

1. The resolver has table-driven unit tests for every token and every period, including
   year/week boundaries (Dec 29–Jan 3), leap day, and a non-Monday week start.
2. Characterization before removal: today's daily-note behavior stays covered until the retirement
   task, then is replaced by resolver-based tests.
3. A test proves a multi-day event is created once, in the start day's folder, with no extra
   notes or links.
4. A test proves an unsafe pattern (`..`, absolute path) is rejected without creating anything.
5. Native acceptance in a vault laid out like Notebook Navigator's, and in a vault with no periodic
   settings (view must behave sensibly when unconfigured).
6. `tests/architecture.test.ts` still passes; any new mutation path is declared, not silently
   allowed.

## 7. Definition of done

1. Per-period settings exist on Calendar and persist in the `.base`.
2. `src/views/calendar/dailyNote.ts` no longer reads obsidian-journal or core Daily Notes, and no
   longer owns a substitution engine.
3. Existing periodic notes laid out per the configured patterns are found (dot, hover, open);
   missing ones are created through the general mechanism.
4. Events spanning days produce exactly one note.
5. `pnpm run check` passes.
6. `ROADMAP.md`'s Periodic Notes row is updated to **Done (native-accepted YYYY-MM-DD)**.
