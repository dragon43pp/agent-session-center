#!/usr/bin/env node
// Merge the per-architecture `latest-mac.yml` files that a matrix macOS build produces
// into the single file electron-updater actually reads.
//
// Why this exists
// ---------------
// electron-updater's `Provider.getChannelFilePrefix()` only appends an architecture
// suffix on Linux — arm64 Linux asks for `latest-linux-arm64.yml`. For darwin it
// unconditionally returns the bare `-mac` suffix, so a Mac always requests
// `latest-mac.yml`: one file, never one per architecture. That single file is expected
// to list the artifacts of *every* architecture in its `files:` array, and
// `MacUpdater.filterFilesForArch()` narrows them down at runtime by looking for the
// literal string "arm64" in the URL:
//
//     arm64 Mac -> keep the arm64 entries (they win over any x64 entry present)
//     x64 Mac   -> drop every arm64 entry
//     then findFile(files, "zip") picks the update archive
//
// Our `release-mac.yml` builds arm64 and x64 as two separate matrix jobs — on purpose,
// so each one is verified on a *native* runner (`macos-latest` is arm64,
// `macos-15-intel` is Intel) instead of running an x64 binary under Rosetta. Each job
// therefore emits its own `latest-mac.yml` covering only its own architecture.
//
// Uploading both to a Release is impossible: the second one is rejected with
//
//     HTTP 422: Validation Failed (…/assets?name=latest-mac.yml)
//     ReleaseAsset.name already exists
//
// and because `gh release upload` is handed the whole file list at once, that single
// collision aborts the entire step — the Release ends up with the checksum files and
// the metadata but none of the binaries, which is worse than uploading nothing: an
// installed Mac build would be offered an update it cannot download. So the two
// metadata files are concatenated here, in the publish job, before anything reaches
// the Release.
//
// Usage
// -----
//   node merge-mac-update-metadata.cjs <download-root> <output-file>
//
// Scans <download-root> recursively for `latest-mac*.yml`, merges them into
// <output-file>, asserts that every artifact they reference is actually present under
// <download-root>, and deletes the per-architecture inputs.
//
// Merging is done textually rather than by round-tripping through a YAML parser on
// purpose: the `releaseNotes:` field is a literal block scalar whose contents are read
// verbatim by the update dialog, and a re-dump would reflow it into a quoted string.
// `assert-update-metadata.cjs` requires the `releaseNotes: |-` form, so the block has to
// survive untouched.

const {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} = require('node:fs')
const { dirname, join, resolve } = require('node:path')

const METADATA_NAME = /^latest-mac(-[A-Za-z0-9_]+)?\.ya?ml$/

function fail(message) {
  console.error(`merge-mac-update-metadata: ${message}`)
  process.exit(1)
}

function walk(directory, visit) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      walk(path, visit)
    } else if (entry.isFile()) {
      visit(path)
    }
  }
}

/** Basename of a metadata `url:` / `path:` value, tolerating absolute and URL forms. */
function basenameOf(value) {
  const trimmed = value.trim()
  const pathname = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? new URL(trimmed).pathname
    : trimmed
  const name = pathname.split('/').pop() ?? ''
  return decodeURIComponent(name)
}

/**
 * Split one `latest-mac.yml` into the pieces needed to re-emit several of them as one.
 *
 * electron-builder writes these files with a fixed top-level key order:
 *
 *     version: <semver>
 *     files:
 *       - url: <artifact>
 *         sha512: <base64>
 *         size: <bytes>
 *     path: <legacy duplicate of files[0].url>
 *     sha512: <legacy duplicate of files[0].sha512>
 *     releaseDate: '…'
 *     releaseNotes: |-
 *       ## [x.y.z] …
 *
 * so the `files:` block always runs from the `files:` line to the next line that is not
 * indented. Everything from there on is identical between two builds of the same
 * version and is kept from whichever file is merged first.
 */
function split(source, label) {
  const text = source.replace(/\r\n/g, '\n').trimEnd()
  const lines = text.split('\n')

  const versionMatch = text.match(/^version:\s*(.+?)\s*$/m)
  if (!versionMatch) {
    fail(`${label} has no top-level version: field`)
  }

  const filesIndex = lines.findIndex((line) => /^files:\s*$/.test(line))
  if (filesIndex === -1) {
    fail(`${label} has no top-level files: block`)
  }

  let filesEnd = lines.length
  for (let index = filesIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.trim() === '') continue
    // A non-indented line marks the end of the files block.
    if (!/^\s/.test(line)) {
      filesEnd = index
      break
    }
  }

  // Each `files:` entry is a multi-line block — `- url:` followed by deeper-indented
  // `sha512:` / `size:` — so group by "a line that opens a new entry", not by line.
  const groups = []
  for (const line of lines.slice(filesIndex + 1, filesEnd)) {
    if (line.trim() === '') continue
    if (/^\s+-\s+url:\s*\S+/.test(line)) {
      groups.push([line])
    } else if (/^\s+\S/.test(line) && groups.length > 0) {
      groups[groups.length - 1].push(line)
    } else {
      fail(`${label} has an unexpected line in files: — ${JSON.stringify(line)}`)
    }
  }
  if (groups.length === 0) {
    fail(`${label} has an empty files: block`)
  }

  return {
    version: versionMatch[1].replace(/^["']|["']$/g, ''),
    entries: groups.map((group) => group.join('\n')),
    tail: lines.slice(filesEnd).join('\n').trim(),
    urls: groups.map((group) =>
      basenameOf(group[0].replace(/^\s+-\s+url:\s*/, ''))
    ),
  }
}

const [rootArgument, outputArgument] = process.argv.slice(2)
if (!rootArgument || !outputArgument) {
  fail('Usage: node merge-mac-update-metadata.cjs <download-root> <output-file>')
}

const root = resolve(rootArgument)
const output = resolve(outputArgument)
if (!existsSync(root) || !statSync(root).isDirectory()) {
  fail(`download root is not a directory: ${root}`)
}

const inputs = []
const available = new Set()
walk(root, (path) => {
  available.add(path.split(/[\\/]/).pop())
  if (METADATA_NAME.test(path.split(/[\\/]/).pop())) {
    inputs.push(path)
  }
})

if (inputs.length === 0) {
  // Not an error in itself: a Windows or Linux run legitimately has no macOS metadata.
  // The publish job decides whether that is acceptable.
  console.log(
    `merge-mac-update-metadata: no latest-mac metadata found under ${root}; nothing to do.`
  )
  process.exit(0)
}

const parts = inputs
  .sort()
  .map((path) => split(readFileSync(path, 'utf8'), path.split(/[\\/]/).pop()))

const version = parts[0].version
for (const part of parts) {
  if (part.version !== version) {
    fail(
      `update metadata version mismatch: ${version} vs ${part.version} — these artifacts are not from one release.`
    )
  }
}

// `files:` must list each artifact exactly once: a duplicate would make `findFile` pick
// whichever copy happens to sort first, and the two copies can disagree (that is exactly
// the state an interrupted multi-architecture upload leaves behind).
const seen = new Map()
const entries = []
for (const part of parts) {
  for (let index = 0; index < part.entries.length; index += 1) {
    const url = part.urls[index]
    const previous = seen.get(url)
    if (previous !== undefined) {
      if (previous.trim() !== part.entries[index].trim()) {
        fail(`conflicting duplicate entry for ${url}`)
      }
      continue
    }
    seen.set(url, part.entries[index])
    entries.push(part.entries[index])
  }
}

const missing = [...seen.keys()].filter((name) => !available.has(name))
if (missing.length > 0) {
  fail(
    `update metadata references ${missing.length} artifact(s) that are not in this run: ${missing.join(', ')}`
  )
}

const merged = `version: ${version}\nfiles:\n${entries.join('\n')}\n${parts[0].tail}\n`

mkdirSync(dirname(output), { recursive: true })
writeFileSync(output, merged, 'utf8')

for (const input of inputs) {
  if (resolve(input) !== output) {
    rmSync(input, { force: true })
  }
}

const mergedUrls = seen.keys()
console.log(
  `merge-mac-update-metadata: merged ${inputs.length} metadata file(s) into ${output}`
)
console.log(`  version: ${version}`)
for (const url of mergedUrls) {
  console.log(`  files: ${url}`)
}
