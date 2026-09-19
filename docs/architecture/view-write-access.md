# Decision record: granting write access to a new view (Gantt Beta)

Status: Accepted 2026-09-19 (maintainer interview)
Context spec: [../specs/gantt-beta.md](../specs/gantt-beta.md) D2

## Context

The architecture guard (`tests/architecture.test.ts`, T005) forbids new views from mutating the
vault. Only the three legacy views (Calendar, Gantt, Swimlane) may write, and
`ViewCapabilities.legacyMutation` "must not be set on a new view without a separately approved
decision". Timeline, the only view added since, is read-only.

Gantt Beta cannot meet its purpose without writing: date, progress, dependency, parent, and
order edits all persist to note properties.

## Decision

Gantt Beta may write, under these conditions:

1. Writes go **only** through the capability interfaces in `src/platform/mutations/`
   (`DateMutationCapability`, `PropertyMutationCapability`, `DependencyMutationCapability`,
   `FileCreateCapability`). `src/views/gantt-beta/` joins `GUARDED_MUTATION_DIRS`, so a direct
   `processFrontMatter`/`vault.modify` call there fails the guard.
2. The grant is declared on the view descriptor as an explicit capability (not
   `legacyMutation`), and the registry hands a gateway only to descriptors that declare it.
3. Gantt Beta never trashes or moves notes, and never edits note bodies. It writes frontmatter
   properties and creates new notes from a template.

## Consequences for plugin compatibility

This is the first new view allowed to write, so it sets a precedent. Future decisions should
weigh the following before granting the same capability to another view:

- **Shared property ownership.** Gantt Beta writes to properties that other plugins may also
  own (task managers, Dataview/Tasks-style workflows, Templater-created fields, Obsidian
  Calendar/Full Calendar plugins). The same note can be edited by several plugins; Wise View
  writes must stay minimal (changed fields only) and format-preserving (keep list vs. comma
  shape, keep `Date` vs. `Date & time` shape) to avoid churn and conflicts.
- **Format contracts.** Gantt Beta writes local floating dates (`YYYY-MM-DD`,
  `YYYY-MM-DDTHH:mm`) and wiki-link lists. Plugins that expect ISO `Z` timestamps or plain-text
  ids will not interoperate without a conversion setting — a future change to either format is
  a compatibility change and needs its own decision.
- **New properties.** Gantt Beta introduces optional per-type dependency properties (SS/FF/SF)
  and an Order property. Their names are user-chosen in Bases options, never hard-coded, so
  users can align them with other plugins' conventions.
- **Write frequency.** A single gesture (summary drag, dependency cascade) can modify many
  notes. Other plugins reacting to `metadataCache` changes (indexers, sync, git plugins) will
  see bursts; batching and changed-fields-only writes are required, not optional.
- **Precedent scope.** This decision grants Gantt Beta only. Granting another view requires a
  new entry in this file naming the view, the capabilities, and the properties it writes.

## Revisit when

- Another view requests write access.
- Obsidian ships a first-party write API for Bases views that supersedes this gateway.
- A compatibility conflict with another plugin is reported against a Gantt Beta write.
