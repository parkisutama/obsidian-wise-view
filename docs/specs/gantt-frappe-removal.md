# Spec: Remove Frappe Gantt and make Gantt the only Gantt view

Status: Approved 2026-09-20 (maintainer decision recorded in [gantt-beta.md §11](gantt-beta.md))
Baseline branch: `dev`
Prepared: 2026-09-20
Roadmap: [../../ROADMAP.md](../../ROADMAP.md)
Plan: [../../tasks/gantt-frappe-removal/plan.md](../../tasks/gantt-frappe-removal/plan.md)
Tasks: [../../tasks/gantt-frappe-removal/todo.md](../../tasks/gantt-frappe-removal/todo.md)

## 1. Objective

Delete the Frappe-based Gantt view (`wise-view-gantt`) and everything that exists only for it, and
present the `@jaeungkim/gantt-chart` view (`wise-view-gantt-beta`) under the name **Gantt**. After
this workstream the plugin has one Gantt view, one Gantt dependency, and no Frappe code, CSS, settings,
commands, notices, or docs.

## 2. Decisions (2026-09-20)

| # | Topic | Decision |
|---|---|---|
| R1 | Timing | Remove now, in this workstream, on `dev`. Nothing here has shipped to users from `dev`, so no deprecation release. |
| R2 | Display name | The new view's display name becomes **Gantt** (registration name and hover source). Its ID stays `wise-view-gantt-beta` for ever (gantt-beta.md D3); the source folder stays `src/views/gantt-beta/`. |
| R3 | Existing `.base` files | Hard removal, no shim and no alias. A `.base` view of type `wise-view-gantt` shows Obsidian's unknown-view state; the user picks **Gantt** and configures its properties. This follows gantt-beta.md D3. |
| R4 | Commands and settings | Frappe's command-palette commands (`gantt-scroll-today`, `gantt-create-note`, `gantt-view-*`) and the "Gantt defaults" settings section are removed with it. Gantt does not carry them over (gantt-beta.md D6). Saved `ganttDefaults` data is ignored on load, then dropped on the next save. |
| R5 | Attribution | `frappe-gantt` leaves the bundle, so its notice and banner entry go. The `obsidian-bases-gantt` attribution stays until a maintainer review confirms no adapted code remains (§5). |

## 3. Scope

### 3.1 Delete

- `src/views/BasesGanttView.ts`, `src/utils/ganttUtils.ts`, `src/types/frappe-gantt.d.ts`
- `src/styles/views/gantt.css` and its entry in `FIRST_PARTY_CSS`
- `tests/gantt-view.test.ts`, `tests/fixtures/gantt.ts`, and the Frappe rows in `tests/view-registry.test.ts`
- The `frappe-gantt` dependency in `package.json` and the lockfile
- `scopeFrappeGanttCss` and the Frappe stylesheet entry in `esbuild.config.mjs`
- The `GanttDefaults` type, its default values, and the "Gantt" section of the settings tab
- The Frappe registration, hover source, and `buildGanttCommands` in `src/main.ts`
- The Frappe entries in `scripts/license-banner.mjs`, `THIRD_PARTY_NOTICES.md`, and the provenance
  ledger (the "known limitation" about the leaked listener goes with the library)
- `docs/gantt-view-improvement-prompt.md`

### 3.2 Change

- Rename the display name and user-facing strings "Gantt Beta" to "Gantt" (view name, hover source,
  Notice texts, spec and README wording). Keep the ID, folder, class names, and option keys.
- `tests/architecture.test.ts`: drop `BasesGanttView.ts` from the legacy mutation allowlist; assert
  `frappe-gantt` is not a dependency.
- `docs/specs/gantt.md` and `tasks/gantt/*`: status "Superseded — removed by gantt-frappe-removal",
  kept as history.
- README: describe the single Gantt view, list the breaking changes, and explain how to move an old
  base (§4).

### 3.3 Keep

- Every Gantt Beta behavior, option key, and test. This workstream removes code; it adds none except
  the rename.
- Calendar, Swimlane, Timeline, and shared platform code, unless a file is only used by the Frappe view.
  Anything shared is checked with a reference search before deletion.

## 4. Migration note for users (README and release notes)

1. Open the base whose Gantt view shows an unknown view type.
2. Add or switch the view to **Gantt**.
3. Set Start date, End date, and optionally Label, Parent, Progress, Color by, and Depends on.
   The old option names map as: `startDate` to Start date, `endDate` to End date, `label` to Label,
   `dependencies` to Depends on, `parentProp` to Parent, `progress` to Progress, `colorBy` to Color by,
   `viewMode` to Scale.
4. Not carried over: expected progress, Hour / Quarter day / Half day scales, the right-click menu,
   the WBS sidebar (replaced by the task list and phases), and the Gantt command-palette commands.
5. Dependencies stay in the same property. The old view wrote them as comma-separated links; Gantt
   writes lists and reads both.

## 5. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| A shared helper is deleted while something else imports it | High | Reference search before each deletion; typecheck and the full test suite after each phase |
| `obsidian-bases-gantt` attribution dropped while adapted code remains | High (license) | Keep the entry; remove only after a maintainer review of `src/main.ts` and remaining files (GFR-005) |
| Users with existing Frappe bases lose the view | Medium | Accepted (R3); README and release notes carry the migration steps |
| Mobile, popout window, and keyboard were not natively verified before the switch | Medium | Waived by the maintainer on 2026-09-20 (gantt-beta.md §11); tracked as follow-ups, checked before the next release |
| Bundle and stylesheet shrink hides a missing rule | Low | Compare `main.js` and `styles.css` sizes before and after; Gantt has its own CSS file |

## 6. Verification policy

1. After each phase: `pnpm run check`.
2. After the last phase: `pnpm run build && pnpm run verify:artifacts`, plus a repository search that
   finds no `frappe`, `BasesGanttView`, `ganttUtils`, `GanttDefaults`, or `bases-gantt-view` outside
   history, provenance notes, and this spec.
3. Record bundle and stylesheet sizes before and after.

## 7. Definition of done

1. Nothing listed in §3.1 exists, and no code imports it.
2. The view is named **Gantt**; its ID is unchanged.
3. `pnpm run check`, the production build, and `verify:artifacts` pass; the leftover search is clean.
4. README carries the migration note and breaking changes.
5. `ROADMAP.md` marks Gantt as Done and the old Gantt workstream as Superseded.
