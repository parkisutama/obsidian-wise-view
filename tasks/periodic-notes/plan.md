# Implementation plan: Native periodic notes for Calendar

Status: Draft; implementation requires approval
Specification: [../../docs/specs/periodic-notes.md](../../docs/specs/periodic-notes.md)
Roadmap: [../../ROADMAP.md](../../ROADMAP.md)
Baseline: branch `dev`
Sequencing: starts only after `docs/specs/note-template.md` is Done.

## Overview

Add a pure path resolver and per-period Calendar settings, then route Calendar's daily-note,
journal-dot, hover, and event-creation flows through them, retiring the obsidian-journal / core
Daily Notes lookups. Note content stays the job of the general creation mechanism from
`note-template.md`.

## Phase 1: Design decisions

- Resolve the spec §5 questions: week numbering, which periods the UI links, unsafe-pattern
  handling, Notebook Navigator conventions.

### Checkpoint A

- Decisions recorded in the spec before any code is written.

## Phase 2: Resolver

- Implement the token formatter and `resolvePeriodicPath` as pure modules under
  `src/views/calendar/periodic/`, with table-driven tests.

### Checkpoint B

- Resolver tests cover every token and period, boundaries included; `pnpm run check` passes.

## Phase 3: Settings

- Add the per-period option group to Calendar's options schema and read it into a typed config.

### Checkpoint C

- Option keys are new, none Bases-reserved; existing keys are unchanged.

## Phase 4: Integrate and retire

- Route open/create, journal dot, hover, and event-note folder through the resolver and the
  general creation call.
- Remove the obsidian-journal and core Daily Notes lookups and the old substitution code.

### Checkpoint D

- Multi-day event yields one note; unsafe patterns are rejected; characterization tests replaced.

## Phase 5: Native acceptance

- Notebook Navigator-style vault and an unconfigured vault.

### Checkpoint E: Periodic Notes complete

- `pnpm run check` passes, native acceptance recorded, ROADMAP row Done.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Assuming Notebook Navigator's conventions instead of reading them | High | PN-001 requires checking its documentation; no assumed defaults |
| Week numbering off by one at year boundaries | Medium | Boundary table tests (Dec 29–Jan 3, non-Monday start) |
| Pattern escapes the vault | High | Reject `..` and absolute paths; test proves nothing is created |
| Overlaps `note-template` work | Medium | Strict sequencing; this spec never substitutes template text |

## Human gates

- Gate 1: approve PN-001 decisions before implementation.
- Gate 2: native acceptance before marking Done.
