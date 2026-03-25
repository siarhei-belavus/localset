# Development

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

For internal team distribution of a modified build, include the packaged legal notices under `Contents/Resources/legal/` in the macOS app bundle. This repo ships:

- `LICENSE.md` (upstream ELv2 license)
- `apps/desktop/MODIFIED_BUILD_NOTICE.md` (modified-build notice)

# Release

When building for release, make sure `node-pty` is built for the correct architecture with `bun run install:deps`, then run `bun run release`.

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