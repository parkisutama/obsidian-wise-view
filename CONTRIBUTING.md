# Contributing

## Setup

Use the pinned package manager from `package.json`.

```bash
pnpm install --frozen-lockfile
```

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

That command runs `check`, creates a production build, and verifies that `main.js`, `manifest.json`, and `styles.css` exist and are non-empty.

## Versioning

Use `pnpm version` so npm runs the `version` lifecycle script:

```bash
pnpm version patch
```

The version script syncs `manifest.json` to the package version and writes `versions[version] = manifest.minAppVersion` in `versions.json`.

Review the resulting diff before tagging or pushing.

## Release

Releases are created by pushing a release tag that matches `v*.*.*`.

```bash
git push origin main
git push origin v1.2.3
```

The GitHub release workflow installs with `pnpm install --frozen-lockfile`, runs `pnpm run check:ci`, uploads `main.js`, `manifest.json`, `styles.css`, and attaches `wise-view.zip`.

## Manual QA Checklist

- Install the release artifacts into a test vault.
- Confirm the plugin loads on desktop.
- Confirm the plugin loads on mobile if available.
- Open a Bases view using Calendar, Kanban, and Gantt.
- Confirm view resize behavior in a narrow pane.
- Confirm light and dark themes render readable cards/bars.
- Confirm no unexpected file edits happen while opening views.
