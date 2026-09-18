# Contributing

## Setup

Requirements:

- Node.js 24 LTS. The version is pinned in `.node-version`; with
  [fnm](https://github.com/Schniz/fnm) run `fnm use` (or enable `--use-on-cd`).
- pnpm 12, pinned in `package.json` (`packageManager`). Update a standalone install with
  `pnpm self-update`.

```bash
pnpm install --frozen-lockfile
```

pnpm settings live in `pnpm-workspace.yaml`. pnpm refuses to resolve packages published less
than 24 hours ago (`minimumReleaseAge`); wait a day before adopting a brand-new release.

Recommended branch naming:

- `feature/<slug>`
- `fix/<slug>`
- `refactor/<slug>`
- `docs/<slug>`
- `chore/<slug>`

## Local Development

Wise View builds with esbuild and outputs the Obsidian plugin artifacts at the repo root:

- `main.js`
- `manifest.json`
- `styles.css`

For local vault copying, create `.env` from `.env.example` and set:

```bash
OBSIDIAN_VAULT_PLUGIN_PATH=/absolute/path/to/TestVault/.obsidian/plugins/wise-view
```

Then run:

```bash
pnpm run dev
```

The dev build watches source files and copies the plugin artifacts to the configured vault plugin path when builds succeed.

## Checks

Run the full local quality gate before opening a pull request:

```bash
pnpm run check
```

The gate runs Biome lint, Obsidian ESLint rules, TypeScript `--noEmit`, and Vitest. Linting is read-only. To apply safe formatter/linter writes explicitly, run:

```bash
pnpm run lint:fix
```

CI uses the stricter release-oriented gate:

```bash
pnpm run check:ci
```

That command runs `check`, creates a production build, and verifies that `main.js`, `manifest.json`, and `styles.css` exist, are non-empty, and start with the license banner defined in `scripts/license-banner.mjs`.

## Versioning

Use `pnpm version` so the `version` lifecycle script runs. Pass an empty tag prefix: the
release workflow requires the tag to equal `manifest.json.version` (`1.2.3`, not `v1.2.3`).

```bash
pnpm version patch --tag-version-prefix=""
```

The version script syncs `manifest.json` to the package version and writes `versions[version] = manifest.minAppVersion` in `versions.json`.

Review the resulting diff before tagging or pushing.

## Release

Releases are created by pushing a release tag that exactly matches `manifest.json.version`.

```bash
git push origin main
git push origin 1.2.3
```

The GitHub release workflow installs with `pnpm install --frozen-lockfile`, runs `pnpm run check:ci`, uploads `main.js`, `manifest.json`, `styles.css`, `LICENSE`, and `THIRD_PARTY_NOTICES.md`, and attaches `wise-view.zip` containing all five.

## Manual QA Checklist

- Install the release artifacts into a test vault.
- Confirm the plugin loads on desktop.
- Confirm the plugin loads on mobile if available.
- Open a Bases view using Calendar, Kanban, and Gantt.
- Confirm view resize behavior in a narrow pane.
- Confirm light and dark themes render readable cards/bars.
- Confirm no unexpected file edits happen while opening views.
