# Release guide

Do not invoke `electron-builder` manually for a deliverable. The supported Windows release entry is:

```powershell
npm run release:win
```

`npm run build:win` is an alias of the same guarded release flow; it cannot bypass validation.

The command reads the version from `package.json`, builds into an isolated temporary directory, validates the result, and only then replaces the files in `artifacts/`.

## Changing the version

Update both `package.json` and `package-lock.json` without creating a Git tag:

```powershell
npm version 0.1.1 --no-git-tag-version
npm run release:win
```

## Hard release gates

The Windows release fails before delivery when any of these conditions is not met:

- NSIS is a guided installer (`oneClick: false`).
- The installation directory can be changed.
- The application and installer use the Agent Session Center icon rather than Electron's default icon.
- All black, white, and macOS template tray PNGs exist in the packaged resources directory.
- Remote source submodules, prior build outputs, development state, logs, and local `*.dsh` data never enter `app.asar`.
- The packaged application starts, creates a Tray instance, and loads a non-empty 16×16 image.
- The installer product version matches `package.json`.
- The installer, blockmap, and `latest.yml` all exist.
- `latest.yml` matches `package.json`, references the exact installer filename, and contains SHA-512 metadata.
- `latest.yml` carries the `## [<version>]` section of `CHANGELOG.md` as `releaseNotes`.
- The packaged `app-update.yml` points to the public `fatedawn/agent-session-center` GitHub repository and contains no credentials.

### Why the Windows packager passes `--config.npmRebuild=false`

`node-pty` 1.1.0 is an N-API addon (`node-addon-api ^7`), so its bundled prebuilt binaries
are ABI-stable and load under any Electron version. At runtime `node-pty/lib/utils.js`
resolves the addon in this order:

```text
build/Release → build/Debug → prebuilds/<platform>-<arch>
```

Rebuilding on Windows is therefore unnecessary, and on a machine without the Visual Studio
Spectre-mitigation libraries it is fatal: the generated `.vcxproj` files hard-code
`<SpectreMitigation>Spectre</SpectreMitigation>`, `MSBuild` fails with **MSB8040**, and
packaging aborts before any artifact is produced.

This applies to **Windows only**. `node-pty` ships prebuilds for `win32-x64`, `win32-arm64`,
`darwin-arm64` and `darwin-x64` — but **none for Linux**, so the Linux release script must
keep rebuilding from source.

`scripts/assert-packaged-tray-assets.cjs` runs inside electron-builder's `afterPack` phase, so even direct packaging cannot silently omit tray assets. `scripts/verify-packaged-tray.cjs` performs the runtime Tray check. `scripts/release-win.ps1` composes all release checks and copies the verified artifacts.

## Delivery checklist

1. Run `npm run release:win` and require a zero exit code.
2. For direct installer delivery, use `artifacts/AgentSessionCenter-Setup-<version>.exe`. For a GitHub Release, keep the installer, blockmap, SHA-256 file, and `latest.yml` together.
3. Include the SHA-256 printed by the release command.
4. If the signature status is not `Present`, explicitly warn that Windows may show a security prompt.
5. Never deliver an installer created before the latest source change.

The guarded macOS and Linux commands perform equivalent runtime/resource and update-metadata checks. macOS artifacts are currently unsigned, so signing/notarization is still required before production auto-install can be considered supported there.

## GitHub Release workflow

There is **no automatic release workflow**. `.github/workflows/ci.yml` only runs
`npm run typecheck` and `npm run build` on push and pull request; publishing is a
manual, maintainer-confirmed step because it is irreversible and because the e2e
suite needs a real DeepSeek Harness host that GitHub runners cannot provide.

Rehearse the whole Windows chain (tag/version gate + guarded packaging + checksum)
without touching GitHub:

```powershell
npm run release:github:win -- -TagName vX.Y.Z
```

`scripts/release-github-win.ps1` refuses to continue unless `-TagName` equals
`v<package.json version>`. It runs `npm run typecheck`, delegates to
`npm run release:win`, then writes
`artifacts/AgentSessionCenter-Setup-<version>.exe.sha256` next to the artifacts.

Publish by creating the tag and then the Release yourself, attaching every file
that `latest.yml` references:

```powershell
git tag -a v1.0.0 -m "Agent Session Center v1.0.0"
git push origin v1.0.0
gh release create v1.0.0 `
  artifacts/AgentSessionCenter-Setup-1.0.0.exe `
  artifacts/AgentSessionCenter-Setup-1.0.0.exe.blockmap `
  artifacts/AgentSessionCenter-Setup-1.0.0.exe.sha256 `
  artifacts/latest.yml `
  --title "Agent Session Center v1.0.0" --notes-file <notes.md>
```

The Windows Release must contain at least these four non-empty assets — the
installer, its blockmap, its SHA-256 file, and `latest.yml` — or existing clients
cannot resolve an update. macOS and Linux assets (`latest-mac.yml`,
`latest-linux.yml`, dmg/zip/AppImage/deb and their checksums) are added when those
platforms are built on their own machines. A tag with a prerelease suffix (for
example `v1.1.0-beta.1`) is published as a GitHub prerelease; stable clients ignore
prereleases.

## Application update contract

Packaged Agent Session Center clients check the public `fatedawn/agent-session-center` Release feed once at startup. Updates are announced but never downloaded in the background; the user stays in control of when to install. Set `ASC_DISABLE_UPDATES=1` to skip update checks entirely (useful for regression testing). Development builds do not contact the update service.

Never upload only the installer/package files. `electron-updater` discovers releases through the platform metadata file, and every file referenced by that metadata must be attached to the same GitHub Release. The guarded release scripts validate this before copying anything into `artifacts/`.

`v1.0.0` is the first release whose packaged clients contain the updater, making it the baseline that can receive subsequent updates. Every later release must keep attaching the metadata assets alongside the installer.

Create the version bump and the release commit before tagging:

```powershell
npm version 1.0.1 --no-git-tag-version
# 1. Add the matching `## [1.0.1]` section to CHANGELOG.md — release-win.ps1 fails
#    without it, because it injects that section into latest.yml.
# 2. Commit and push the release commit.
git tag -a v1.0.1 -m "Agent Session Center v1.0.1"
git push origin v1.0.1
```

`CHANGELOG.md` is a hard dependency, not documentation: `scripts/inject-release-notes.cjs`
throws when the section for the packaged version is missing.

The guarded Windows packager always passes `--publish never` to electron-builder, so
packaging can never publish on its own. Only the maintainer's `gh release create`
step uploads a GitHub Release, and it fails rather than replacing an existing
release with the same tag.

Icon validation does not require Electron's development executable to exist on
the runner. The release gate always checks the configured source icon and that
the installer and packaged application use the same icon; it additionally
compares against Electron's default icon when that local reference is available.
