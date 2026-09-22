# Native acceptance: Timeline native sort/group adoption

Spec: [../../docs/specs/timeline.md](../../docs/specs/timeline.md)
Date: 2026-09-22
Accepted by: maintainer

## Verified

- Row order and grouping follow Bases' own sort/group configuration (not a Timeline-specific
  option), matching TL-001..TL-003's regression tests and the native-only grouping decision
  recorded in the spec (2026-09-19, `groupProperty` removed).
- No regression versus the previously accepted Timeline behavior
  (`tasks/timeline-native-acceptance.md`, 2026-09-19: zoom, quick scheduling, scroll-to-today,
  desktop fidelity).

## Waived

- **Mobile UX**: functional but not tuned for mobile, per the ROADMAP's mobile-friendly-UX
  follow-up (desktop-first is the deliberate current focus; a dedicated mobile workstream is
  planned later for every view, not Timeline-specific).
- Popout-window acceptance remains open and non-blocking, carried over from the 2026-09-19 record.

## Definition of done (spec) — status

All of TL-001 through TL-004 are complete; this record closes TL-004 and the workstream.
