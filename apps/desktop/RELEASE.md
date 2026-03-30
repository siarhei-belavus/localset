# Desktop App Release Process

## Quick Start

From the monorepo root:

```bash
./apps/desktop/create-release.sh
```

The script will:
1. Show current version and prompt for new version (patch/minor/major/custom)
2. Update `package.json` version
3. Create and push a `desktop-v<version>` tag for the default unsigned release workflow
4. Monitor the GitHub Actions build
5. Create a **draft release** for review

### Options

```bash
# Interactive version selection (recommended)
./apps/desktop/create-release.sh

# Explicit version
./apps/desktop/create-release.sh 0.0.50

# Auto-publish (skip draft)
./apps/desktop/create-release.sh --publish
./apps/desktop/create-release.sh 0.0.50 --publish
```

To publish a draft:

```bash
gh release edit desktop-v0.0.50 --draft=false
```

### Requirements

- GitHub CLI (`gh`) installed and authenticated
- Clean git working directory

## Modified Fork Releases

If you are shipping a modified fork instead of the upstream Superset desktop release:

- keep `LICENSE.md` and `apps/desktop/MODIFIED_BUILD_NOTICE.md` in the packaged bundle
- clearly label the app/download as a modified build and not an official Superset release
- review `productName`, icons, release names, and update feeds before publishing
- avoid shipping a fork that looks indistinguishable from the official build

For macOS bundles, the default build already copies legal notices to:

- `Contents/Resources/legal/LICENSE.md`
- `Contents/Resources/legal/MODIFIED_BUILD_NOTICE.md`

Before distributing a forked build, update `apps/desktop/MODIFIED_BUILD_NOTICE.md` with your organization name and a short summary of your modifications.

## Release Channels

- `desktop-v<version>` triggers the default unsigned `Localset` release workflow and is the current recommended path for this fork
- `desktop-signed-v<version>` triggers the signed macOS workflow for future use once Apple signing secrets are configured
- `desktop-canary` remains the unsigned canary channel

## macOS Auto-update Limitation

Unsigned macOS desktop builds do not support in-app auto-update reliably. ShipIt / Squirrel.Mac validates the downloaded app bundle signature before swapping the app, so Localset's unsigned macOS channel should be treated as manual-update-only.

If you want in-app auto-updates on macOS, publish from the signed `desktop-signed-v<version>` workflow instead of the unsigned `desktop-v<version>` workflow.

## Manual Release

If you prefer not to use the script:

```bash
git tag desktop-v1.0.0
git push origin desktop-v1.0.0
```

This creates a draft release. Publish it manually at GitHub Releases.

For a future signed release:

```bash
git tag desktop-signed-v1.0.0
git push origin desktop-signed-v1.0.0
```

## Auto-update

The app checks for updates at launch and every x hours using:

- **macOS manifest**: `https://github.com/superset-sh/superset/releases/latest/download/latest-mac.yml`
- **Linux manifest**: `https://github.com/superset-sh/superset/releases/latest/download/latest-linux.yml`
- **macOS installer**: `https://github.com/superset-sh/superset/releases/latest/download/Superset-arm64.dmg`
- **Linux installer**: `https://github.com/superset-sh/superset/releases/latest/download/Superset-x64.AppImage`

The workflow creates stable-named copies (without version) so these URLs always point to the latest build.

If you are publishing a fork, review the auto-update settings before release. The default configuration points to the upstream `superset-sh/superset` GitHub releases. A forked build should either:

- publish to its own release feed, or
- disable auto-update until a fork-specific feed is configured

## Code Signing

macOS code signing uses these repository secrets:

- `MAC_CERTIFICATE` / `MAC_CERTIFICATE_PASSWORD`
- `APPLE_ID` / `APPLE_ID_PASSWORD` / `APPLE_TEAM_ID`

These secrets are only required for the signed release workflow. The default unsigned workflow uses `electron-builder.local.ts` and does not require Apple signing credentials.

## Local Testing

```bash
cd apps/desktop
bun run clean:dev
bun run compile:app
bun run package
```

Output: `apps/desktop/release/`

Linux output should include:

- `*.AppImage`
- `*-linux.yml` (auto-update manifest)

## Troubleshooting

- **Linux auto-update not working**: Verify `release/*-linux.yml` is uploaded to the GitHub release
- **Build icon warnings/failures**: Add icons under `src/resources/build/icons/` (`icon.icns`, `icon.ico`, optional Linux `.png`)
- **Native module errors**: Ensure `node-pty` is in externals in both `electron.vite.config.ts` and `electron-builder.ts`
- **Unsigned macOS build warning**: On first launch, use `Right-click > Open` or macOS `Open Anyway`
