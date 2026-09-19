# Spec: Code quality, organization, and performance

Status: Draft — awaiting maintainer review
Baseline branch: `dev`
Prepared: 2026-09-19
Supersedes: the "Extensible view platform" specification and its plan/task list, retired
2026-09-19 (see §1)

## 1. Why this replaces the extensible view platform program

The prior specification's program (Timeline, Grid, Masonry, Feed, Keep) shipped Timeline
successfully but stalled on Grid: three rounds of native testing each surfaced a different,
hard-to-diagnose CSS Grid layout failure (an oversized cover blowing out its column; then every
card flattening to a uniform strip) even after direct, evidence-based fixes pulled from the
adopted upstream project itself. Rather than keep guessing against a shared card/grid rendering
architecture, the maintainer on 2026-09-19 decided to:

1. Remove Grid entirely (`src/views/grid/`, the Grid-only Card Core it introduced, and its CSS)
   rather than leave unregistered or half-working code in the tree.
2. Retire the extensible-view-platform specification, plan, and task list.
3. Redirect effort toward this specification: hardening the four views that already work
   (Swimlane, Calendar, Gantt, Timeline) — their code quality, internal organization, and
   performance — before any further new-view expansion is considered.

This is a deliberate scope narrowing, not an abandonment of the idea of more views. A future Grid,
Masonry, Feed, or Keep effort gets its own specification when it is actually scheduled, informed
by whatever this hardening phase learns about the shared platform's real capabilities and limits.
`docs/architecture/upstream-provenance.md` keeps the license/attribution history for Dynamic
Views, Feed Bases, and Keep Bases View in case that happens.

## 2. Objective

Improve the four active views — Swimlane, Calendar, Gantt, Timeline — along three axes, without
changing their user-visible configuration keys or persisted `.base` option shapes unless a fix
specifically requires it (and is called out as such):

- **Correctness / code quality**: fix defects found in currently-shipped behavior, remove
  duplicated or dead logic, and close gaps between what a feature claims to do and what it
  actually does.
- **Organization**: bring the two large monolithic view files (Swimlane at ~2,770 lines, Gantt at
  ~1,660 lines) toward the modular pattern Timeline already uses (a small view class plus
  separate model/renderer/options modules), so a change to one concern doesn't require reading
  the entire file.
- **Performance**: verify each view's behavior on large Bases is actually bounded (virtualized,
  batched, or otherwise capped), not just assumed to be, and fix any unbounded synchronous DOM
  construction found.

## 3. Non-goals

- No new Bases view type (Grid, Masonry, Feed, Keep, or otherwise) is in scope. If one of the
  refactors below produces infrastructure a future view could reuse, that is a welcome side
  effect, not a goal to design toward.
- No new persisted `.base` option key is added purely for architecture's sake. Every scope item
  below is either a bug fix, a behind-the-scenes reorganization, or an explicitly-approved new
  user-facing feature (dependency-line editing, native-sort/group adoption).
- No change to Calendar's or Gantt's underlying rendering libraries (FullCalendar, Frappe Gantt)
  beyond what a specific scope item below requires.

## 4. Confirmed defects (found 2026-09-19, during the review that produced this spec)

### 4.1 Note-template creation does not integrate with Templater or Obsidian's own Templates plugin

**Symptom reported by the maintainer:** creating a note from Calendar's or Gantt's "Note
template" option does not run through Templater — instead it creates a note whose name and body
are the raw, unprocessed template text.

**Root cause:** the codebase has two independent, hand-rolled `{{...}}`-style substitution
engines, neither of which invokes Templater or Obsidian's core Templates plugin:

- `NoteTemplateService.renderTemplate()` ([src/services/NoteTemplateService.ts:202](../../src/services/NoteTemplateService.ts))
  — used by the "Note template" option's `templatePath`/`targetFolder`/`titleFormat` fields
  (Calendar's "add event" flow, Gantt's "create note" flow). It reads the template file's raw
  text with `vault.cachedRead`, does its own `title`/`date`/`time`/`start`/`end` regex
  replacement, and either (a) calls `vault.create()` directly with the substituted text
  (`targetFolder` set), bypassing any template-application plugin entirely, or (b) creates an
  empty file through `view.createFileForView()`, races a `vault.on('create', ...)` listener
  against whatever Templater/Obsidian's own folder-template auto-apply might do to that same new
  file, and then unconditionally overwrites the file's frontmatter and body with its own
  regex-substituted text (`applyTemplateToFile`) — silently clobbering anything Templater already
  wrote if Templater's listener resolved first.
- `BasesCalendarView.processTemplateVariables()` ([src/views/BasesCalendarView.ts:976](../../src/views/BasesCalendarView.ts))
  — a second, differently-shaped substitution engine (adds `weekday`/`month` tokens on top of
  `date`/`title`/`time`) used only by `openDailyNote()`, Calendar's separate "click a date number
  to open/create the daily note" flow. It also calls `vault.create()` directly with pre-substituted
  text, so a daily-note template written in Templater syntax is copied in completely unprocessed.

Neither path ever invokes Templater's public API (`app.plugins.plugins['templater-obsidian']`) or
Obsidian's core Templates plugin (`app.internalPlugins.getPluginById('templates')`), and neither
gives Obsidian's own folder-template mechanism a real chance to run, because the file is never
left in the genuinely-empty state that mechanism expects before we overwrite it — regardless of
whether the reordering above resolves the race, ours is not the standard flow.

**Fix direction:** stop reimplementing templating. When Templater is installed and enabled,
create the note through Templater's own "create note from template" API so its `<%* %>`/`<% %>`
syntax, prompts, and cursor placement work exactly as they would from Templater's own command.
When it is not installed, fall back to Obsidian's core Templates plugin's insertion behavior if
enabled, or to the current plain-text-with-frontmatter-merge behavior only as a last resort — and
make that fallback explicit in the UI/documentation rather than silent. Our own `{{date}}`/
`{{title}}`/etc. tokens should only ever be applied to values the view itself computed (e.g. the
clicked date, for the title format field), never used as a parallel, competing substitution engine
against the template file's own body. Unify `processTemplateVariables` and
`NoteTemplateService.renderTemplate` into one implementation regardless of which fix direction is
chosen — the current duplication is itself part of the defect.

### 4.2 Frappe Gantt leaks a `document`-level `mouseup` listener (known since T010, needs a plan now)

Already recorded as an accepted trade-off in `docs/architecture/upstream-provenance.md`'s "Known
upstream library limitations" section: `frappe-gantt@1.2.2`'s `Gantt` constructor attaches
`document.addEventListener('mouseup', ...)` internally and never removes it, and Wise View's own
architecture guard (no global-API monkey-patching) forbids the previous workaround (capturing and
later removing that specific listener by temporarily wrapping `document.addEventListener`). One
listener leaks per `new Gantt(...)` call (every config change or full rebuild) for the life of the
Obsidian window; it is inert once its container is detached but keeps that Gantt instance's
closures reachable.

This spec requires an actual follow-up investigation, not indefinite acceptance:

1. Check whether a Frappe Gantt version newer than 1.2.2 fixes this upstream, and whether
   upgrading is otherwise safe (check its changelog for breaking changes against our usage).
2. Check whether Frappe Gantt exposes any supported teardown/`off` method added since 1.2.2, or a
   constructor option to suppress this binding.
3. If neither exists, evaluate vendoring a minimally patched build (a local copy of just the
   offending `bind_bar_events` binding, with a proper SPDX/attribution header and a
   `THIRD_PARTY_NOTICES.md` entry for the modification) instead of accepting the leak forever.
4. If vendoring is rejected as disproportionate, document a concrete bound on the impact (e.g.
   confirm the leaked closures are small and rebuilds are infrequent enough that this is
   genuinely negligible) rather than leaving the risk unquantified.

### 4.3 Gantt: dependency lines are read-only visuals; no interactive editing

Today, a task's dependencies are set only through the "Dependencies" property (comma/array of
note references) or a right-click context menu action ("Add dependency" / "Clear dependencies");
Frappe Gantt then draws the connecting arrows from that data, but the arrows themselves are pure
visualization — dragging an arrow endpoint, or drawing a new connection between two bars directly
on the chart, is not implemented (Frappe Gantt does not support this out of the box).

**Scope for this spec:** design and build an interactive dependency-line editor: dragging a bar's
dependency handle to another bar creates or re-points a dependency; dragging an arrow away from a
bar removes it; every interactive change writes back to the same "Dependencies" property the
context-menu actions already use (single source of truth — no separate internal dependency
state). Because Frappe Gantt does not expose this interaction natively, this requires either a
custom SVG interaction overlay on top of Frappe Gantt's rendered arrows, or evaluating whether a
newer Frappe Gantt version or a different bundled Gantt library changes that calculus — this
decision belongs in the implementation plan, not this spec, but the plan must address it before
committing to an approach.

### 4.4 Timeline: row order and grouping should defer to Bases' own configuration

Timeline currently re-derives its own grouping from a Wise-View-specific `groupProperty` option
([src/views/timeline/timelineOptions.ts](../../src/views/timeline/timelineOptions.ts)) and builds
its row list by iterating `this.data.data` (already Bases-sorted) into a `Map` keyed by that
property, in first-seen order. The maintainer wants two things confirmed and, where not already
true, implemented:

1. **Row order must track whatever sort the user configures in the Bases toolbar directly** — no
   Timeline-specific reordering should ever compete with or override it. This needs a test that
   pins the contract (change the Bases sort, assert Timeline's row order changes to match, with no
   intermediate resort inside `buildTimelineModel` or `TimelineRenderer`), not just an assumption
   that consuming `this.data.data` unmodified already guarantees it.
2. **Investigate moving "Group by" onto Obsidian Bases' own native grouping** instead of (or as a
   migration path away from) the custom `groupProperty` option, so a user does not have to
   configure grouping twice (once in Bases' own UI, once in Timeline's view options) or wonder
   which one wins. This requires research into what `QueryController`/`BasesViewConfig` actually
   exposes for a view to read Bases' native group state (the reserved `groupBy` config key this
   program already learned not to write a plain property id into — see
   `docs/architecture/upstream-provenance.md`'s history) — confirm whether a read-only accessor
   for the *user's chosen* native grouping exists before committing to this migration, and if it
   does not, document why the custom option remains the only option and close this item rather
   than leave it open indefinitely.

## 5. Code organization goals

| File | Current size | Goal |
|---|---|---|
| `src/views/BasesSwimlaneView.ts` | ~2,770 lines | Split into a slim view class plus separate modules for: card rendering/cover resolution (partially done — `CoverImageResolver.ts` already extracted), column/swimlane ordering and drag-reorder state, badge/property rendering, and the view's options schema — mirroring `src/views/timeline/`'s `index.ts`/`*Model.ts`/`*Renderer.ts`/`*View.ts` split. |
| `src/views/BasesGanttView.ts` | ~1,660 lines | Split out: the options schema (`getGanttViewOptions`), the dependency-menu/mutation logic (§4.3 lands here too), the WBS sidebar, and the Frappe Gantt lifecycle wrapper (§4.2's fix also lands here) into separate modules under a `src/views/gantt/` (or similar) directory. |
| `src/views/BasesCalendarView.ts` | ~1,260 lines | Split out: the note-template/daily-note creation logic (§4.1's fix consolidates this anyway), FullCalendar event mapping, and the options schema. |

Each split must be behavior-preserving on its own (characterization tests before extraction,
matching this program's established `git mv`-and-extract pattern from T036/T037) — do not bundle
a refactor and a behavior change into the same step; land the defect fixes in §4 as their own
steps so a regression is attributable to one or the other, not both at once.

## 6. Performance goals

For each of the four active views, confirm (with a test, not inspection alone) that:

- A large Base (a fixture on the order of the platform program's 5,000-entry precedent) does not
  cause unbounded synchronous DOM construction on first render.
- Repeated identical `onDataUpdated()` calls take a fast path that skips rebuilding unchanged DOM,
  the way Timeline's `RenderScheduler` already does — verify Swimlane, Calendar, and Gantt each
  either already have an equivalent guard or get one added here.
- Drag/resize/scroll interactions (Swimlane's column drag, Gantt's bar drag, Calendar's view
  switch) do not accumulate uncancelled work across repeated fast interactions.

Where a view already meets this bar, record that as a passing verification rather than assuming
it and moving on — this spec's performance axis is about confirmed evidence, not assumption.

## 7. Verification policy

For every change under this spec:

1. Run the narrowest affected test suite during development; run `pnpm run check` before
   considering a change done.
2. A defect fix (§4) ships with a regression test that would have caught it.
3. A file split (§5) ships with characterization tests passing unchanged before and after the
   split — the split step itself must not need new test assertions to stay green.
4. A performance claim (§6) ships with the fixture/test that demonstrates it, not a comment
   asserting it.
5. Native acceptance (creating a note through Templater with the fix from §4.1, dragging a
   dependency arrow from §4.3, confirming Timeline's sort/group behavior from §4.4) is recorded
   separately from automated test results, the same way this program's prior native-acceptance
   checkpoints worked — automated green is necessary, not sufficient.

## 8. Definition of done

This specification's scope is complete when:

1. §4.1–§4.4's defects/features are implemented, each with its own regression test and a native
   acceptance note.
2. Swimlane and Gantt are each split into a small view class plus focused modules, matching
   Timeline's existing pattern, with no behavior change introduced by the split itself.
3. Each of the four active views has a documented, tested performance contract per §6.
4. `pnpm run check` (and `pnpm run check:ci` before any release) passes.
5. `docs/architecture/upstream-provenance.md` and `THIRD_PARTY_NOTICES.md` remain accurate for
   whatever Frappe Gantt fix direction §4.2 lands on.

## 9. Open questions for the maintainer

- §4.1: when Templater is not installed, should note creation fall back silently to today's
  plain-text behavior, or should it surface a one-time notice telling the user Templater/Templates
  isn't available so their `{{...}}`/`<% %>` template goes in unprocessed?
- §4.2: is vendoring a patched Frappe Gantt build (with attribution) acceptable, or should an
  upgrade/library-swap be preferred even if it costs more implementation time?
- §4.3: should the interactive dependency editor also support creating a *new* note as a
  dependency target by dragging to empty chart space, or only connect existing bars?
- §4.4: if Bases does not expose a read accessor for its native group state, is a one-time
  clarifying option (documentation only, no code) acceptable to close that half of the item, or
  does it need to stay open pending an Obsidian API change?

A plan and task breakdown follow once this specification is reviewed and its open questions are
answered.
