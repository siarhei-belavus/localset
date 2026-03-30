# Development

## Recommended Local Testing Workflow

Use three separate lanes on macOS so your installed app, live dev session, and preview build do not fight over the same state:

1. `Stable`: your normal installed `Localset.app` using the default home dir.
2. `Dev`: live-reload development from the repo with an isolated home dir.
3. `Preview`: a packaged `Localset Internal.app` launched with its own isolated home dir.

From the repo root:

```bash
# Live development with isolated state under ~/.superset-dev
bun run desktop:dev:isolated

# Build a preview app with a separate app identity
bun run desktop:package:internal

# Launch the packaged preview app with isolated state under ~/.superset-preview
bun run desktop:preview:internal
```

Default directories for the recommended workflow:

- `Stable`: `~/.superset`
- `Dev`: `~/.superset-dev`
- `Preview`: `~/.superset-preview`

Why this matters:

- `SUPERSET_HOME_DIR` controls where local state, app state, hooks, sockets, and the local DB live.
- `SUPERSET_WORKSPACE_NAME` affects instance isolation and protocol naming.
- `Localset Internal.app` uses a distinct app identity, but you still need a separate `SUPERSET_HOME_DIR` to keep preview data isolated from your installed app.

Run the dev server without env validation or auth:

```bash
SKIP_ENV_VALIDATION=1 bun run dev
```

This skips environment variable validation and the sign-in screen, useful for local development without credentials.

Important: the plain command above uses the default Superset home dir (`~/.superset`), so it shares app state/config/hooks with the installed production app.

For side-by-side local dev with an installed Superset app, use an isolated home dir + workspace name:

```bash
PATH="/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:$PATH" \
CC=/usr/bin/cc \
CXX=/usr/bin/c++ \
SKIP_ENV_VALIDATION=1 \
SUPERSET_HOME_DIR="$HOME/.superset-dev" \
SUPERSET_WORKSPACE_NAME="dev" \
bun run dev
```

This keeps local dev state under `~/.superset-dev` instead of `~/.superset` and helps distinguish the dev app/workspace from the installed app.

## Preview Build Testing

To test a packaged build in parallel with your installed app on macOS:

```bash
bun run desktop:package:internal
bun run desktop:preview:internal
```

The preview launcher:

- looks for `Localset Internal.app` under `apps/desktop/release/`
- defaults to `SUPERSET_HOME_DIR="$HOME/.superset-preview"`
- defaults to `SUPERSET_WORKSPACE_NAME="preview"`

You can override those env vars if you want multiple preview lanes.

## Modified Build Distribution

When distributing a modified desktop build, keep the packaged legal notices under `Contents/Resources/legal/` in the macOS app bundle. This repo already ships:

- `LICENSE.md` (upstream ELv2 license)
- `apps/desktop/MODIFIED_BUILD_NOTICE.md` (modified-build notice)

The default Electron Builder config already copies both files into the packaged app bundle.

Recommended checklist for a redistributed forked build:

1. Keep `LICENSE.md` in the distributed app/archive.
2. Keep `MODIFIED_BUILD_NOTICE.md` in the distributed app/archive and update it to describe your fork.
3. Add a prominent notice in your download page and/or app UI that this is a modified build and not an official Superset release.
4. Do not remove or obscure upstream licensing, copyright, or trademark notices.
5. Do not market the build as an official Superset release.
6. Review whether your distribution model is a downloadable app or a hosted/managed service. ELv2 redistribution of an app build is different from offering the software as a managed service.

Suggested wording for external distribution:

- `Modified build of Superset desktop`
- `Not an official Superset release`
- `Distributed with local modifications under Elastic License 2.0`

If you are preparing a public or customer-facing fork, also review `apps/desktop/RELEASE.md` and update product name, icons, and release copy so users are not misled about the build's origin.

# Release

When building for release, make sure `node-pty` is built for the correct architecture with `bun run install:deps`, then run `bun run release`.

For the Localset fork's actual version bump, PR, tag, and release workflow, follow `apps/desktop/RELEASE.md`.

# Linux (AppImage) local build

From `apps/desktop`:

```bash
bun run clean:dev
bun run compile:app
bun run package -- --publish never --config electron-builder.ts
```

Expected outputs in `apps/desktop/release/`:

- `*.AppImage`
- `*-linux.yml` (Linux auto-update manifest)

# Linux auto-update verification (local)

From `apps/desktop` after packaging:

```bash
ls -la release/*.AppImage
ls -la release/*-linux.yml
```

If both files exist, packaging produced the Linux artifact + updater metadata that `electron-updater` expects.
