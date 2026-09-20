# Implementation plan: Remove Frappe Gantt

Status: Approved 2026-09-20
Specification: [../../docs/specs/gantt-frappe-removal.md](../../docs/specs/gantt-frappe-removal.md)
Roadmap: [../../ROADMAP.md](../../ROADMAP.md)
Baseline: branch `dev`

## Overview

The Frappe footprint is contained: one view, one utility module, one type shim, one stylesheet, one
dependency, one settings section, and a handful of registrations and tests. It is removed in small
phases, each leaving the project green, so any phase can be reverted on its own.

## Phase 1: Rename and unregister

- Record the stability decision, mark GBETA-017 accepted, and create these documents (done before this
  phase starts).
- Rename the display name of the new view to "Gantt" (name, hover source, Notice and doc strings) and
  unregister the Frappe view in the same change, so two views are never both called "Gantt".
- Remove the Frappe settings section, defaults, and load-time merge.

### Checkpoint A

- `pnpm run check` passes. The plugin registers one Gantt view, named "Gantt".

## Phase 2: Delete the code

- Delete the view, utilities, type shim, stylesheet, tests, and fixtures listed in the spec, after a
  reference search for each shared symbol.

### Checkpoint B

- `pnpm run check` passes with no remaining import of a deleted file.

## Phase 3: Drop the dependency and its plumbing

- Remove `frappe-gantt` from `package.json` and the lockfile, `scopeFrappeGanttCss` and the stylesheet
  entry from `esbuild.config.mjs`, and the license banner, notice, and provenance entries.

### Checkpoint C

- `pnpm run check`, `pnpm run build`, and `pnpm run verify:artifacts` pass. Bundle sizes recorded.

## Phase 4: Documentation and close-out

- README migration note and breaking changes; supersede the old Gantt spec, plan, and tasks; update
  the roadmap; run the leftover search; maintainer review of the `obsidian-bases-gantt` attribution.

### Checkpoint D: workstream complete

- Definition of done in the spec is met and recorded.

## Risks and mitigations

See the spec, section 5.

## Human gates

- Gate 1: the `obsidian-bases-gantt` attribution decision (Phase 4), because it is a licensing call.
