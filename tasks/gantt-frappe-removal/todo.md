# Tasks: Remove Frappe Gantt

Plan: [plan.md](plan.md)
Specification: [../../docs/specs/gantt-frappe-removal.md](../../docs/specs/gantt-frappe-removal.md)

## Phase 1: Rename and unregister

### GFR-001: Rename the new view to "Gantt" and unregister the Frappe view

**Description:** Change the display name, hover source, and user-facing strings from "Gantt Beta" to
"Gantt". Remove the Frappe registration, hover source, commands, settings (`GanttDefaults`, defaults,
settings tab section, load-time merge), and the `legacyMutation` grant for it.

**Acceptance criteria:**

- [ ] The plugin registers exactly one Gantt view, named "Gantt", with ID `wise-view-gantt-beta`.
- [ ] No Frappe command, setting, or hover source remains in `src/main.ts` or the settings tab.
- [ ] Saved `ganttDefaults` data loads without error and is not written back.
- [ ] Registry and architecture tests updated and passing.

**Verification:** `pnpm run check`

**Dependencies:** none.

**Likely files:** `src/main.ts`, `src/views/gantt-beta/index.ts`, `src/types/settings.ts`,
`src/settings/SettingsTab.ts`, `tests/view-registry.test.ts`, `tests/architecture.test.ts`

**Estimated scope:** M

## Phase 2: Delete the code

### GFR-002: Delete the Frappe view, utilities, styles, and tests

**Description:** Remove every file in the spec's section 3.1 that is code, styles, or tests, after a
reference search for each symbol another file might still import.

**Acceptance criteria:**

- [ ] `BasesGanttView.ts`, `ganttUtils.ts`, `frappe-gantt.d.ts`, `gantt.css`, `gantt-view.test.ts`, and
  `fixtures/gantt.ts` are gone.
- [ ] No file imports a deleted module; typecheck passes.
- [ ] Any helper still needed by a live module is moved, not duplicated, with its test.

**Verification:** `pnpm run check`

**Dependencies:** GFR-001.

**Likely files:** as listed.

**Estimated scope:** M

## Phase 3: Drop the dependency

### GFR-003: Remove `frappe-gantt` and its build, license, and provenance plumbing

**Description:** Remove the dependency, `scopeFrappeGanttCss`, the stylesheet entry, the banner and
notice entries, and the provenance ledger's Frappe rows and known-limitation section.

**Acceptance criteria:**

- [ ] `frappe-gantt` is absent from `package.json` and the lockfile.
- [ ] `pnpm run build && pnpm run verify:artifacts` pass.
- [ ] `main.js` and `styles.css` sizes are recorded before and after.
- [ ] A guard test asserts `frappe-gantt` is not a dependency.

**Verification:** `pnpm run check && pnpm run build && pnpm run verify:artifacts`

**Dependencies:** GFR-002.

**Likely files:** `package.json`, `pnpm-lock.yaml`, `esbuild.config.mjs`, `scripts/license-banner.mjs`,
`THIRD_PARTY_NOTICES.md`, `docs/architecture/upstream-provenance.md`, `tests/architecture.test.ts`

**Estimated scope:** M

## Phase 4: Documentation and close-out

### GFR-004: README, migration note, and superseded documents

**Description:** README describes the single Gantt view and lists breaking changes with the migration
steps from the spec. Mark the old Gantt spec, plan, and tasks superseded, update the roadmap, and
remove `docs/gantt-view-improvement-prompt.md`.

**Acceptance criteria:**

- [ ] README carries the migration note and the list of removed commands and settings.
- [ ] `docs/specs/gantt.md`, `tasks/gantt/plan.md`, and `tasks/gantt/todo.md` say "Superseded".
- [ ] `ROADMAP.md` shows Gantt as Done and the row for this removal.

**Verification:** Documentation review.

**Dependencies:** GFR-003.

**Likely files:** `README.md`, `ROADMAP.md`, `docs/specs/gantt.md`, `tasks/gantt/*`

**Estimated scope:** S

### GFR-005: Leftover search and attribution review

**Description:** Search the repository for any remaining Frappe reference, and ask the maintainer to
decide whether the `obsidian-bases-gantt` attribution can go.

**Acceptance criteria:**

- [ ] The search finds no `frappe`, `BasesGanttView`, `ganttUtils`, `GanttDefaults`, or
  `bases-gantt-view` outside history, provenance notes, and the removal spec.
- [ ] The attribution decision is recorded in the spec (keep or remove, with the reason).

**Verification:** Search output recorded in this file.

**Dependencies:** GFR-004.

**Likely files:** `docs/specs/gantt-frappe-removal.md`

**Estimated scope:** S
