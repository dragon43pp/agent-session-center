import { expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { MacUpdater } from 'electron-updater/out/MacUpdater'
import {
  findFile,
  parseUpdateInfo,
  resolveFiles
} from 'electron-updater/out/providers/Provider'

test('embeds raw changelog Markdown in updater metadata', () => {
  const directory = mkdtempSync(join(tmpdir(), 'asc-release-notes-test-'))
  const metadataPath = join(directory, 'latest.yml')
  const changelogPath = join(directory, 'CHANGELOG.md')
  const artifactPath = join(directory, 'ASC-Setup-0.4.1.exe')

  try {
    writeFileSync(
      metadataPath,
      [
        'version: 0.4.1',
        'files:',
        '  - url: ASC-Setup-0.4.1.exe',
        '    sha512: test-sha512',
        'path: ASC-Setup-0.4.1.exe',
        'sha512: test-sha512',
        "releaseDate: '2026-08-25T00:00:00.000Z'",
        ''
      ].join('\n')
    )
    writeFileSync(
      changelogPath,
      [
        '# Changelog',
        '',
        '## [Unreleased]',
        '',
        '### 修复',
        '',
        '- Future release only.',
        '',
        '## [0.4.1] - 2026-08-25',
        '',
        '### 修复',
        '',
        '- **修复** 更新说明 Markdown。',
        '',
        '## [0.4.0] - 2026-08-24',
        '',
        '- Previous release.',
        ''
      ].join('\n')
    )
    writeFileSync(artifactPath, '')

    execFileSync(
      process.execPath,
      [resolve('scripts/inject-release-notes.cjs'), metadataPath, changelogPath, '0.4.1'],
      { stdio: 'pipe' }
    )
    execFileSync(
      process.execPath,
      [
        resolve('scripts/assert-update-metadata.cjs'),
        metadataPath,
        directory,
        '0.4.1',
        'ASC-Setup-0.4.1.exe'
      ],
      { stdio: 'pipe' }
    )

    const updateInfo = parseUpdateInfo(
      readFileSync(metadataPath, 'utf8'),
      'latest.yml',
      new URL('https://github.com/fatedawn/agent-session-center/releases/download/v1.0.0/latest.yml')
    )

    expect(updateInfo.releaseNotes).toBe(
      [
        '## [0.4.1] - 2026-08-25',
        '',
        '### 修复',
        '',
        '- **修复** 更新说明 Markdown。'
      ].join('\n')
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

/**
 * `MacUpdater.filterFilesForArch` is `protected static` — reachable at runtime, but the
 * type system hides it. This is the function that decides which update archive a given
 * Mac downloads, so the test drives the real one rather than a reimplementation.
 */
function filterFilesForArch(
  files: ReturnType<typeof resolveFiles>,
  isArm64Mac: boolean
): ReturnType<typeof resolveFiles> {
  return (
    MacUpdater as unknown as {
      filterFilesForArch: (
        files: ReturnType<typeof resolveFiles>,
        isArm64Mac: boolean
      ) => ReturnType<typeof resolveFiles>
    }
  ).filterFilesForArch(files, isArm64Mac)
}

const MAC_ARTIFACTS = {
  armZip: 'AgentSessionCenter-1.0.1-macos-arm64.zip',
  armDmg: 'AgentSessionCenter-1.0.1-macos-arm64.dmg',
  x64Zip: 'AgentSessionCenter-1.0.1-macos-x64.zip',
  x64Dmg: 'AgentSessionCenter-1.0.1-macos-x64.dmg'
}

function macMetadata(
  zipName: string,
  dmgName: string,
  zipSha: string,
  dmgSha: string
): string {
  return `${[
    'version: 1.0.1',
    'files:',
    `  - url: ${zipName}`,
    `    sha512: ${zipSha}`,
    '    size: 1024',
    `  - url: ${dmgName}`,
    `    sha512: ${dmgSha}`,
    '    size: 2048',
    `path: ${zipName}`,
    `sha512: ${zipSha}`,
    "releaseDate: '2026-10-08T00:00:00.000Z'",
    'releaseNotes: |-',
    '  ## [1.0.1] - 2026-10-07',
    '',
    '  ### Added',
    '',
    '  - Something.'
  ].join('\n')}\n`
}

/** Lay out two per-architecture artifact directories the way a matrix run downloads them. */
function writeMacArtifacts(directory: string): {
  armDirectory: string
  intelDirectory: string
} {
  const armDirectory = join(directory, 'asc-macos-unsigned-arm64')
  const intelDirectory = join(directory, 'asc-macos-unsigned-x64')
  mkdirSync(armDirectory, { recursive: true })
  mkdirSync(intelDirectory, { recursive: true })

  writeFileSync(
    join(armDirectory, 'latest-mac.yml'),
    macMetadata(MAC_ARTIFACTS.armZip, MAC_ARTIFACTS.armDmg, 'arm-zip-sha', 'arm-dmg-sha')
  )
  writeFileSync(
    join(intelDirectory, 'latest-mac.yml'),
    macMetadata(MAC_ARTIFACTS.x64Zip, MAC_ARTIFACTS.x64Dmg, 'x64-zip-sha', 'x64-dmg-sha')
  )

  for (const name of [MAC_ARTIFACTS.armZip, MAC_ARTIFACTS.armDmg]) {
    writeFileSync(join(armDirectory, name), '')
  }
  for (const name of [MAC_ARTIFACTS.x64Zip, MAC_ARTIFACTS.x64Dmg]) {
    writeFileSync(join(intelDirectory, name), '')
  }

  return { armDirectory, intelDirectory }
}

/**
 * A Mac only ever asks electron-updater for `latest-mac.yml` — `getChannelFilePrefix()`
 * appends the architecture on Linux but not on darwin — so that one file has to list
 * every architecture and `MacUpdater` narrows it down at runtime. Our macOS release
 * builds arm64 and x64 as separate matrix jobs (each verified on a *native* runner), so
 * each one emits its own `latest-mac.yml`. Handing both to `gh release upload` at once
 * is what broke the v1.0.1 publish: GitHub answered
 * `422 ReleaseAsset.name already exists`, the whole step aborted, and the Release was
 * left advertising macOS updates whose binaries did not exist.
 */
test('merges the per-architecture macOS metadata into the one file a Mac asks for', () => {
  const directory = mkdtempSync(join(tmpdir(), 'asc-mac-metadata-test-'))
  const mergedPath = join(directory, 'latest-mac.yml')

  try {
    const { armDirectory, intelDirectory } = writeMacArtifacts(directory)

    execFileSync(
      process.execPath,
      [resolve('scripts/merge-mac-update-metadata.cjs'), directory, mergedPath],
      { stdio: 'pipe' }
    )

    // The per-architecture inputs must be gone, or the publish step uploads the same
    // filename twice and hits the 422 all over again.
    expect(existsSync(join(armDirectory, 'latest-mac.yml'))).toBe(false)
    expect(existsSync(join(intelDirectory, 'latest-mac.yml'))).toBe(false)

    const updateInfo = parseUpdateInfo(
      readFileSync(mergedPath, 'utf8'),
      'latest-mac.yml',
      new URL(
        'https://github.com/fatedawn/agent-session-center/releases/download/v1.0.1/latest-mac.yml'
      )
    )
    expect(updateInfo.version).toBe('1.0.1')
    expect(updateInfo.files.map((file: { url: string }) => basename(file.url))).toEqual([
      MAC_ARTIFACTS.armZip,
      MAC_ARTIFACTS.armDmg,
      MAC_ARTIFACTS.x64Zip,
      MAC_ARTIFACTS.x64Dmg
    ])

    // The release notes are a literal YAML block scalar; a merge that round-trips the
    // document through a YAML dumper would reflow them and the update dialog would show
    // a quoted one-liner instead of Markdown.
    expect(updateInfo.releaseNotes).toBe(
      ['## [1.0.1] - 2026-10-07', '', '### Added', '', '- Something.'].join('\n')
    )

    const resolved = resolveFiles(
      updateInfo,
      new URL('https://github.com/fatedawn/agent-session-center/releases/download/v1.0.1/')
    )
    expect(filterFilesForArch(resolved, true).map((file) => basename(file.url.pathname))).toEqual([
      MAC_ARTIFACTS.armZip,
      MAC_ARTIFACTS.armDmg
    ])
    expect(filterFilesForArch(resolved, false).map((file) => basename(file.url.pathname))).toEqual([
      MAC_ARTIFACTS.x64Zip,
      MAC_ARTIFACTS.x64Dmg
    ])

    // And the two Macs must end up on different zips — the same file served to both would
    // mean one of them installs a build it cannot run.
    expect(
      basename(findFile(filterFilesForArch(resolved, true), 'zip')!.url.pathname)
    ).toBe(MAC_ARTIFACTS.armZip)
    expect(
      basename(findFile(filterFilesForArch(resolved, false), 'zip')!.url.pathname)
    ).toBe(MAC_ARTIFACTS.x64Zip)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('refuses to merge macOS metadata whose artifacts are missing from the run', () => {
  const directory = mkdtempSync(join(tmpdir(), 'asc-mac-metadata-missing-test-'))
  const mergedPath = join(directory, 'latest-mac.yml')

  try {
    const { armDirectory } = writeMacArtifacts(directory)
    // A partial upload leaves exactly this shape behind: metadata that promises a binary
    // nobody can download. Merging it would propagate the lie into the Release.
    rmSync(join(armDirectory, MAC_ARTIFACTS.armDmg))

    expect(() =>
      execFileSync(
        process.execPath,
        [resolve('scripts/merge-mac-update-metadata.cjs'), directory, mergedPath],
        { stdio: 'pipe' }
      )
    ).toThrow()
    expect(existsSync(mergedPath)).toBe(false)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
