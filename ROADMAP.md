# Wise View roadmap

Status: Active
Last updated: 2026-09-19

This is the navigation hub for Wise View's current work: which workstream is being worked on,
what depends on what, and where each workstream's own specification, plan, and task list live.
Update the status table below whenever a workstream's phase changes — this file does not carry
implementation detail itself, only pointers and sequencing.

## Why this replaced the extensible-view-platform program

Wise View previously ran one program-wide specification covering Calendar, Gantt, Swimlane,
Timeline, and five planned new views (Grid, Masonry, Feed, Keep). Timeline shipped and was
accepted; Grid did not — three rounds of native testing each surfaced a different CSS Grid layout
failure even after direct, evidence-based fixes, and the maintainer removed it rather than keep
guessing or leave half-working code in the tree (history: `git log` around 2026-09-19, and
`docs/architecture/upstream-provenance.md`'s Dynamic Views entry).

That result changed priorities: harden what already ships (Swimlane, Calendar, Gantt, Timeline)
before adding another new view type. This roadmap replaces the single program-wide spec/plan/task
set with one workstream per concern, so each can be scoped, reviewed, and closed independently on
the same `dev` branch, instead of one large document that has to move together.

## Workstreams

| Workstream | Spec | Plan | Tasks | Status |
|---|---|---|---|---|
| Swimlane | [docs/specs/swimlane.md](docs/specs/swimlane.md) | [tasks/swimlane/plan.md](tasks/swimlane/plan.md) | [tasks/swimlane/todo.md](tasks/swimlane/todo.md) | Done (native-accepted 2026-09-19) — [record](tasks/swimlane/native-acceptance.md) |
| Calendar | [docs/specs/calendar.md](docs/specs/calendar.md) | [tasks/calendar/plan.md](tasks/calendar/plan.md) | [tasks/calendar/todo.md](tasks/calendar/todo.md) | Not started |
| Gantt (Frappe) | [docs/specs/gantt.md](docs/specs/gantt.md) | [tasks/gantt/plan.md](tasks/gantt/plan.md) | [tasks/gantt/todo.md](tasks/gantt/todo.md) | Superseded 2026-09-20 — being removed by the workstream below |
| Gantt (was Gantt Beta) | [docs/specs/gantt-beta.md](docs/specs/gantt-beta.md) | [tasks/gantt-beta/plan.md](tasks/gantt-beta/plan.md) | [tasks/gantt-beta/todo.md](tasks/gantt-beta/todo.md) | Accepted 2026-09-20 with waivers (mobile, popout, keyboard unverified) — [record](tasks/gantt-beta/native-acceptance.md) |
| Gantt Frappe removal | [docs/specs/gantt-frappe-removal.md](docs/specs/gantt-frappe-removal.md) | [tasks/gantt-frappe-removal/plan.md](tasks/gantt-frappe-removal/plan.md) | [tasks/gantt-frappe-removal/todo.md](tasks/gantt-frappe-removal/todo.md) | In progress — started 2026-09-20 |
| Timeline | [docs/specs/timeline.md](docs/specs/timeline.md) | [tasks/timeline/plan.md](tasks/timeline/plan.md) | [tasks/timeline/todo.md](tasks/timeline/todo.md) | Implemented; native acceptance pending |
| Performance | [docs/specs/performance.md](docs/specs/performance.md) | [tasks/performance/plan.md](tasks/performance/plan.md) | [tasks/performance/todo.md](tasks/performance/todo.md) | Blocked — waits for the four view workstreams |
| Note Template | [docs/specs/note-template.md](docs/specs/note-template.md) | [tasks/note-template/plan.md](tasks/note-template/plan.md) | [tasks/note-template/todo.md](tasks/note-template/todo.md) | Blocked — waits for Performance |

Status values: **Not started**, **In progress**, **Blocked — <reason>**, **Frozen — <reason>**, **Done (native-accepted
<date>)**. Update this table as the source of truth; do not let an individual workstream's own
doc silently drift out of sync with it.

## Sequencing

```text
Swimlane  ─┐
Calendar  ─┤  any order, independently completable
Gantt     ─┤  (each view's own defects/reorganization; no cross-workstream dependency)
Timeline  ─┘
     |
     v
Performance   (general, cross-view; needs the four views' reorganization settled first so a
               performance fix lands in the right module, not a file about to be split)
     |
     v
Note Template (general, cross-view; deliberately last — see below)
```

- The four view workstreams (Swimlane, Calendar, Gantt, Timeline) have no dependency on each
  other and may be worked in any order, including in parallel across sessions, since each is
  scoped to its own view's files.
- **Gantt Beta** (added 2026-09-19) is a new view, independent of the four workstreams above;
  Performance does not wait for it. It calls `NoteTemplateService` as-is, so the Note Template
  redesign must also cover Gantt Beta's creation path.
- **Performance** is cross-cutting by nature (a shared render-scheduling/virtualization pattern
  applied consistently across views) and is sequenced after the four view workstreams so it is
  built against each view's settled internal structure, not against files that are about to move.
- **Note Template** is deliberately last. The current bug (creating a note does not integrate
  with Templater; see `docs/specs/note-template.md`) touches Calendar and Gantt today, but the fix
  is explicitly a general, all-views-level redesign (delegate to Templater/Obsidian's Templates
  plugin instead of the two duplicated regex-substitution engines) — implementing it before the
  view-specific reorganization work would mean rewriting the integration points twice. It also
  waits specifically for Performance (not just the four views) to land first, per the maintainer's
  explicit sequencing decision on 2026-09-19.

## Follow-ups (not blocking any workstream)

- **Mobile-friendly sizing per view.** Swimlane, Calendar, Gantt, and Timeline are functional on
  mobile but sized for desktop. Each needs its own mobile CSS configuration, so plan it per view
  after the current workstreams rather than as one shared change. Raised 2026-09-19 during
  Swimlane native acceptance.

## How to update this file

- When a workstream starts, change its status to **In progress** and note the date.
- When a workstream's own Definition of Done is met and native acceptance is recorded, change its
  status to **Done (native-accepted YYYY-MM-DD)** and link the acceptance record if one exists
  (see `tasks/timeline-native-acceptance.md` for the pattern from the prior program).
- When a workstream is blocked on something not shown above, say so in its status cell with a
  short reason — do not leave "Blocked" unexplained.
- Do not add a new workstream row without also creating its spec/plan/tasks docs in the same
  change — this table must never point at a file that does not exist.
