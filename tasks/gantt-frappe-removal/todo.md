# Tasks: Remove Frappe Gantt

Plan: [plan.md](plan.md)
Specification: [../../docs/specs/gantt-frappe-removal.md](../../docs/specs/gantt-frappe-removal.md)

## Phase 1: Rename and unregister

### GFR-001: Rename the new view to "Gantt" and unregister the Frappe view

**Status:** Complete 2026-09-20. The new view is registered as Gantt (ID unchanged); the Frappe registration, hover source, commands, settings, and saved ganttDefaults are gone. The Gantt settings tab keeps only the colour note, which still applies.

**Description:** Change the display name, hover source, and user-facing strings from "Gantt" to
"Gantt". Remove the Frappe registration, hover source, commands, settings (`GanttDefaults`, defaults,
settings tab section, load-time merge), and the `legacyMutation` grant for it.

**Acceptance criteria:**

- [x] The plugin registers exactly one Gantt view, named "Gantt", with ID `wise-view-gantt-beta` (changed to `wise-view-gantt` by GFR-006).
- [x] No Frappe command, setting, or hover source remains in `src/main.ts` or the settings tab.
- [x] Saved `ganttDefaults` data loads without error and is not written back.
- [x] Registry and architecture tests updated and passing.

**Verification:** `pnpm run check`

**Dependencies:** none.

**Likely files:** `src/main.ts`, `src/views/gantt/index.ts`, `src/types/settings.ts`,
`src/settings/SettingsTab.ts`, `tests/view-registry.test.ts`, `tests/architecture.test.ts`

**Estimated scope:** M

## Phase 2: Delete the code

### GFR-002: Delete the Frappe view, utilities, styles, and tests

**Status:** Complete 2026-09-20. BasesGanttView.ts, ganttUtils.ts, frappe-gantt.d.ts, gantt.css, gantt-view.test.ts, and fixtures/gantt.ts are deleted; nothing else imported them (typecheck and the full suite pass). gantt-view.test.ts carried uncommitted characterization tests from the frozen GAN-001 work; they went with the view.

**Description:** Remove every file in the spec's section 3.1 that is code, styles, or tests, after a
reference search for each symbol another file might still import.

**Acceptance criteria:**

- [x] `BasesGanttView.ts`, `ganttUtils.ts`, `frappe-gantt.d.ts`, `gantt.css`, `gantt-view.test.ts`, and
  `fixtures/gantt.ts` are gone.
- [x] No file imports a deleted module; typecheck passes.
- [x] Any helper still needed by a live module is moved, not duplicated, with its test.

**Verification:** `pnpm run check`

**Dependencies:** GFR-001.

**Likely files:** as listed.

**Estimated scope:** M

## Phase 3: Drop the dependency

### GFR-003: Remove `frappe-gantt` and its build, license, and provenance plumbing

**Status:** Complete 2026-09-20. frappe-gantt, its stylesheet scoper, banner and notice entries, and the provenance limitation are gone; a guard test forbids the dependency. Production build: main.js 694,169 to 608,345 bytes (-85,824, -12%); styles.css 124,495 to 95,183 bytes (-29,312, -24%). Neither file contains the string frappe. The obsidian-bases-gantt notice stays, with its file list corrected.

**Description:** Remove the dependency, `scopeFrappeGanttCss`, the stylesheet entry, the banner and
notice entries, and the provenance ledger's Frappe rows and known-limitation section.

**Acceptance criteria:**

- [x] `frappe-gantt` is absent from `package.json` and the lockfile.
- [x] `pnpm run build && pnpm run verify:artifacts` pass.
- [x] `main.js` and `styles.css` sizes are recorded before and after.
- [x] A guard test asserts `frappe-gantt` is not a dependency.

**Verification:** `pnpm run check && pnpm run build && pnpm run verify:artifacts`

**Dependencies:** GFR-002.

**Likely files:** `package.json`, `pnpm-lock.yaml`, `esbuild.config.mjs`, `scripts/license-banner.mjs`,
`THIRD_PARTY_NOTICES.md`, `docs/architecture/upstream-provenance.md`, `tests/architecture.test.ts`

**Estimated scope:** M

## Phase 3b: Permanent id and option keys

### GFR-006: Make the id `wise-view-gantt` and drop "Beta" from every stored key

**Status:** Complete 2026-09-21. The view id is `wise-view-gantt` and every option key is `gantt*`.
Settings saved by the released Frappe view and by development builds are imported once
(`legacyOptions.ts`, gantt.md §3.8). `wise-view-gantt-beta` was never released and is not registered.

**Description:** Reuse the released id, rename the stored option keys, and import older settings so a
base saved by the Frappe release keeps its schedule instead of opening empty.

**Acceptance criteria:**

- [x] `BASES_GANTT_VIEW_ID` is `wise-view-gantt`; the scoped-write approval and hover source use it.
- [x] No stored key contains "beta"; a test checks the key list against the option schema.
- [x] A Frappe-era base and a development-build base are imported once, with the precedence, marker, and
  no-op rules in gantt.md §3.8, each covered by a test.
- [x] Read only stays the default, so an imported legacy base cannot write until the user opts in.
- [x] The user is told what was imported, and whether the chart is read-only.

**Verification:** `pnpm run check`

**Dependencies:** GFR-003.

**Likely files:** `src/views/gantt/legacyOptions.ts`, `src/views/gantt/options.ts`,
`src/viewRegistry.ts`, `tests/gantt-legacy-options.test.ts`

**Estimated scope:** M

### GFR-007: One name everywhere

**Status:** Complete 2026-09-21. Folder, files, classes, identifiers, tests, specification, and tasks all say
"Gantt" (docs/specs/gantt-frappe-removal.md R7). Checked: typecheck, lint, 490 tests, production build, and a
script that compares every `wise-view-gantt-*` class used in code with the stylesheet (no gaps, no unused
rules) and with the library's own classes (no collisions). A first pass renamed `gantt-beta-detail` to
`gantt-detail`, which the library already defines; it was caught by that comparison and namespaced instead.

**Acceptance criteria:**

- [x] No source folder, file, class, identifier, or test name contains "beta", except the legacy import.
- [x] No class we define is also defined by the library.
- [x] Links between specifications, plans, tasks, README, roadmap, and the guide resolve.

**Verification:** `pnpm run check && pnpm run build && pnpm run verify:artifacts`

**Dependencies:** GFR-006.

**Likely files:** as renamed.

**Estimated scope:** M

## Phase 4: Documentation and close-out

### GFR-004: README, migration note, and superseded documents

**Status:** Complete 2026-09-20. README describes the single Gantt view, the migration steps, and the removed commands and settings. The user guide moved to docs/gantt-view.md and now documents editing, Blocks, and navigation. The old Gantt spec, plan, and tasks are marked superseded, docs/gantt-view-improvement-prompt.md is gone, and AGENTS.md no longer tells agents to build on Frappe.

**Description:** README describes the single Gantt view and lists breaking changes with the migration
steps from the spec. Mark the old Gantt spec, plan, and tasks superseded, update the roadmap, and
remove `docs/gantt-view-improvement-prompt.md`.

**Acceptance criteria:**

- [x] README carries the migration note and the list of removed commands and settings.
- [x] The Frappe spec, plan, and tasks (now `docs/specs/gantt-frappe.md` and `tasks/gantt-frappe/`) say "Superseded".
- [x] `ROADMAP.md` shows Gantt as Done and the row for this removal.

**Verification:** Documentation review.

**Dependencies:** GFR-003.

**Likely files:** `README.md`, `ROADMAP.md`, `docs/specs/gantt-frappe.md`, `tasks/gantt-frappe/*`

**Estimated scope:** S

### GFR-005: Leftover search and attribution review

**Status:** Search complete 2026-09-20; attribution decision recorded as **keep**, awaiting maintainer
confirmation (Gate 1). Search command: `grep -rniE "frappe|BasesGanttView|ganttUtils|GanttDefaults|bases-gantt-view"`
over the repository, excluding `node_modules`, `.git`, `coverage`, generated `main.js`, and the lockfile.
Remaining hits are all intentional: this workstream's own documents, the superseded Gantt spec, plan and
tasks, the migration note in the README, the provenance and notice text explaining the removal, the
license-compliance plan (history), the guard test that forbids the dependency, and a load-time comment in
`src/main.ts`. `tasks/note-template/todo.md` still names `src/views/BasesGanttView.ts`; it belongs to the
note-template workstream (uncommitted edits by another session) and needs its own update there.

**Description:** Search the repository for any remaining Frappe reference, and ask the maintainer to
decide whether the `obsidian-bases-gantt` attribution can go.

**Acceptance criteria:**

- [x] The search finds no `frappe`, `BasesGanttView`, `ganttUtils`, `GanttDefaults`, or
  `bases-gantt-view` outside history, provenance notes, and the removal spec.
- [ ] The attribution decision is recorded in the spec (keep or remove, with the reason).

**Verification:** Search output recorded in this file.

**Dependencies:** GFR-004.

**Likely files:** `docs/specs/gantt-frappe-removal.md`

**Estimated scope:** S
