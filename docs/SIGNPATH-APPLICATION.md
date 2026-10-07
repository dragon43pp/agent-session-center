# Code signing application: SignPath Foundation

This document records how Agent Session Center satisfies the
[SignPath Foundation conditions for open source projects](https://signpath.org/terms.html), and
what remains to be configured in the SignPath portal once the application is approved.

It is the operational companion to the [Code signing policy](../README.md#code-signing-policy)
section in the README, which is the public-facing statement.

## Status

| | |
| --- | --- |
| Application | Not submitted yet. Repository prerequisites are in place; the form is at <https://signpath.org/apply>. |
| Certificate | None. Every published Windows installer is currently **unsigned**. |
| Artifacts in scope | Windows x64 NSIS installer, released from `main` |
| Programs relying on it | The Windows installer, its `.blockmap`, and `latest.yml` |

Until a certificate is issued, releases keep shipping unsigned plus a published SHA-256
checksum, and the README says so plainly.

## Conditions and how this repository meets them

| SignPath condition | Where it is satisfied |
| --- | --- |
| OSI-approved licence, no commercial dual-licensing | [`LICENSE`](../LICENSE) — Apache License 2.0 |
| No proprietary components | ✅ Satisfied as of 2026-10-07 — every bundled runtime and library is open source; see [Component licensing](#component-licensing) below |
| Actively maintained | [`CONTRIBUTING.md`](../CONTRIBUTING.md) — first response within 72 hours; commits on `main` |
| Already released in the form to be signed | [v1.0.0](https://github.com/fatedawn/agent-session-center/releases/tag/v1.0.0) ships the Windows NSIS installer |
| Functionality documented on the download page | [`README.md`](../README.md) plus the Release notes |
| No hacking tools | ASC is a session browser: it reads the session files other agents wrote and drives terminals the user starts. It contains no vulnerability scanner, no exploit code, and nothing that probes or circumvents the security of its environment. |
| Respect user privacy | [`PRIVACY.md`](../PRIVACY.md) — full disclosure of every outbound request; the one automatic request is disableable with `ASC_DISABLE_UPDATES=1` |
| Announce system changes | Hook installation into an agent's own config directory is offered explicitly and shown for the user to trust before it takes effect; see [`PRIVACY.md`](../PRIVACY.md) §1 |
| Provide uninstallation | The NSIS installer registers a standard uninstaller; macOS and Linux packages are removable by normal means |
| MFA on GitHub and SignPath | Enabled by the maintainer on both accounts |
| Authors / Reviewers / Approvers defined | [README, Team roles](../README.md#team-roles) and [`CONTRIBUTING.md`](../CONTRIBUTING.md#代码签名角色) |
| Artifacts built verifiably from source | [`.github/workflows/release-windows.yml`](../.github/workflows/release-windows.yml) |

## Component licensing

SignPath's policy forbids proprietary, non-open-source components in the signed package, with a
narrow allowance for system libraries. The bundle was reviewed against that rule, and **it now
passes**: every bundled runtime and library is open source under a permissive licence.

**Bundled code** — all under permissive licences and redistributable:

| Component | Licence |
| --- | --- |
| Electron | MIT |
| `node-pty` | MIT |
| `ws` | MIT |
| `electron-updater` / `builder-util-runtime` | MIT |
| `@larksuiteoapi/node-sdk` | MIT |
| React, CodeMirror, xterm.js, lucide, gsap, motion, zustand, … | MIT / ISC / Apache-2.0 |

### The one finding, and how it was closed

Until 2026-10-07 the bundle also contained **Live2D Cubism Core** — the runtime behind the
`builtin/live2d-mao` floating skin. It is redistributable under its own licence and shipped
`LICENSE.md`, `NOTICE.md` and `RedistributableFiles.txt`, but it is **proprietary and
non-open-source** and is not a system library, so it failed the *no proprietary code* condition.

It was removable with no functional loss, and it has been removed:

- It was one of two built-in floating renderers; the other, `builtin/default`, lives in code and
  is the default (`shared/floating-window.ts`, `electron/main-prefs.ts`).
- `FloatingWindowController` falls back to `builtin/default`, so nothing depended on it.

`resources/floating-renderers/` — 48 files: the Cubism runtime and the Mao sample model — is gone
from the repository and from the installer. The floating window now has exactly one built-in
renderer. Users may still install their own renderers, but any third-party runtime or model is
then supplied and licensed by that user, not redistributed by this project.

[`NOTICE`](../NOTICE) keeps the removal on the record.

One boundary is worth stating explicitly: the removal lands in **v1.0.1**. The already-published
[v1.0.0](https://github.com/fatedawn/agent-session-center/releases/tag/v1.0.0) installer predates
it and still contains that runtime. v1.0.0 is **not** and will **not** be submitted for signing —
only artifacts built from the current source by this repository's CI will ever be submitted.

**Bundled assets** — fonts and one sound, not code. They are not what the certificate covers,
but they ship inside the installer, so they are recorded here too:

| Asset | Licence | Note |
| --- | --- | --- |
| Maple Mono | SIL OFL 1.1 | Unmodified upstream release files |
| Ammonite (brand wordmark only) | "Free for commercial and personal use" by Dan Bennett | Freeware, not an OSI licence. Only the five glyphs of the `asc` wordmark ship, as a `woff2` subset. |
| PingFang SC (UI font) | Proprietary (Apple) | Full faces are kept in the repository for build-time subsetting only. The package receives a subset of the three weights actually used, asserted under 1 MB by `scripts/assert-font-size.mjs`. |
| `resources/done.mp3` | Provenance not recorded | Notification sound; users can replace it |

Asset provenance is logged in [`NOTICE`](../NOTICE).

## Relationship to upstream

This repository derives from the public Apache-2.0 project
[`UniRound-Tec/hrack`](https://github.com/UniRound-Tec/hrack), which is **unaffiliated with this
project** and maintained by someone else. The inheritance was measured with git blob content
addressing against `hrack@main` on 2026-10-07 — an identical blob hash means a byte-identical
file:

| | |
| --- | --- |
| Files under version control here | 617 |
| Byte-identical to upstream | 217 (35.2%) |
| Same path, content changed | 191 |
| Present only in this repository | 209 (33.9%) |

The byte-identical set includes core subsystems — `electron/agents/**` (the whole observer and
adapter framework), `electron/bridge/**`, `electron/pty/**`, `src/terminal/**`,
`src/session-navigation/**`, and the theme JSON.

Three things follow, and all three are disclosed to SignPath rather than left to be discovered:

1. The upstream publishes **unsigned builds only**, so the "upstream publishes signed builds"
   condition for modified upstream software cannot be satisfied.
2. This repository is **not registered with GitHub's fork feature** — the history was rewritten
   during a rebrand, so there is no shared ancestry for GitHub to link.
3. No upstream binary is ever signed with this project's certificate or redistributed under
   this project's name.

What *is* satisfied is the condition immediately above: every file in this repository is
maintained by this project's team, including the files whose content still matches upstream.


## Build origin

SignPath verifies that each signed file was produced by CI from this repository. The chain is:

```
tag vX.Y.Z
  → .github/workflows/release-windows.yml        (windows-latest, npm ci --ignore-scripts)
  → npm run release:win                          (the same guarded scripts a local release uses)
  → artifacts/AgentSessionCenter-Setup-X.Y.Z.exe (UNSIGNED workflow artifact)
  → SignPath signing request + manual approval
  → signed installer
  → GitHub Release
```

Everything that can influence what gets signed — the workflow, `scripts/release-win.ps1`, the
electron-builder config in `package.json`, and the packaging assertions — is in the repository
and is reviewed as source.

The chain has been exercised end to end on a real runner. Pushing tag `v1.0.1` triggered
[run 37626513568](https://github.com/fatedawn/agent-session-center/actions/runs/37626513568)
on commit `540a314e`, which built `AgentSessionCenter-Setup-1.0.1.exe`
(SHA-256 `eee8e938ef3443f0e8effee461ab9139420b6ec9593b719eb110444f5dc9586d`, 94.03 MiB) and
uploaded it as the unsigned artifact `asc-windows-unsigned-540a314e…`. The build reported
`Signature: NotSigned`, so no signing was performed anywhere in the chain.

Local builds still exist for development, but they are not signed. The signing path starts from
CI only. See [`docs/RELEASING.md`](./RELEASING.md#code-signing).

## Verification and release approval

The workflow deliberately stops at an **unsigned artifact**. Signing requires an explicit,
manual approval in the SignPath portal by an Approver; a workflow run cannot sign itself.

Before approving a request:

1. Check that the workflow run's commit is the release commit, and that its tag matches
   `package.json` version.
2. Read the diff between the previous release tag and this one.
3. Confirm the workflow's summary hash matches the artifact being submitted.

After signing, before publishing:

1. `Get-AuthenticodeSignature` reports `Status: Valid` with **SignPath Foundation** as the signer.
2. The SHA-256 of the signed installer matches what is published in the release notes.
3. The installer, its `.blockmap`, its `.sha256`, and `latest.yml` are attached to the **same**
   Release — `electron-updater` cannot resolve an update otherwise.

## Portal configuration

To be filled in after approval. The values below come from the shipped v1.0.0 installer's
version resource, read with `(Get-Item <installer>).VersionInfo`.

**Project slug / signing policy slug** — assigned by SignPath.

**Artifact configuration** — one Authenticode signature over the installer. Note that a GitHub
Actions artifact is delivered as a **ZIP**, so the configuration root has to unpack that ZIP
first and then sign the PE file inside it:

- Root element: a ZIP file (that is how the action receives the GitHub artifact)
- Inside it: a Windows PE file, path pattern `AgentSessionCenter-Setup-*.exe`
- Action: Authenticode sign
- Nothing needs to be signed inside the installer. Its nested executables belong to other
  projects and must not be re-signed — see **Nested binaries** below.
- The `.blockmap` and `latest.yml` are **not** signed. They are covered by the published SHA-256.

**Nested binaries** — the installer contains third-party executables, and SignPath's policy
allows them unsigned but forbids re-signing them with our certificate:

| Nested file | Current state |
| --- | --- |
| `node-pty/third_party/conpty/*/OpenConsole.exe`, `prebuilds/win32-x64/conpty/OpenConsole.exe` | Signed by **Microsoft Corporation** (valid) |
| `node-pty/prebuilds/win32-x64/winpty-agent.exe` | Unsigned |

Neither may be signed with our certificate. In practice only the top-level installer goes to
SignPath, so this holds by construction. The trap to avoid is configuring electron-builder's own
signing (`win.certificateFile` or `win.azureSignOptions`) later: electron-builder does walk those
nested files, so enabling it would sign upstream binaries under our name. Signing goes through
SignPath, never through electron-builder.

**File metadata restrictions** — enforced so a mis-built binary cannot be signed:

| Attribute | Value to enforce |
| --- | --- |
| `ProductName` | `Agent Session Center` |
| `ProductVersion` | the release version, e.g. `1.0.0` |
| `CompanyName` | `fatedawn` |

The same restriction set applies to every build; only `ProductVersion` changes per release, and
it must equal `package.json`'s `version` in that build.

## Portal setup after approval

Approval yields an organization id plus slugs you choose yourself. Do these in order:

1. Install the [SignPath GitHub App](https://github.com/apps/signpath) on this repository.
2. In the SignPath console, create the **project** (suggested slug `agent-session-center`) and add
   GitHub Actions as a **trusted build system** pointing at this repository and at
   `.github/workflows/release-windows.yml`.
3. Create the **artifact configuration** described above — suggested slug `windows-installer`.
4. Create the **signing policy** bound to the Foundation certificate — suggested slug
   `release-signing`. Approval mode: **manual**, so each request waits for an Approver.
5. Create an **API token** with the submitter role for this project.
6. Add these to the repository (Settings → Secrets and variables → Actions):

| Name | Kind | Value |
| --- | --- | --- |
| `SIGNPATH_API_TOKEN` | secret | the API token from step 5 |
| `SIGNPATH_ORGANIZATION_ID` | variable | organization id |
| `SIGNPATH_PROJECT_SLUG` | variable | `agent-session-center` |
| `SIGNPATH_ARTIFACT_CONFIGURATION_SLUG` | variable | `windows-installer` |
| `SIGNPATH_SIGNING_POLICY_SLUG` | variable | `release-signing` |

## Signing workflow to add after approval

Not committed yet: it cannot run without the slugs above, and a workflow that always fails is
worse than a documented one.

Two things to check against the action's README when you add it, because both are easy to get
wrong and neither fails loudly:

- `github-artifact-id` expects the **artifact id**, not the run id. Resolve it first
  (`gh api repos/{owner}/{repo}/actions/runs/<run_id>/artifacts`) rather than passing the run id.
- SignPath versions the action and has renamed inputs before. Verify every input name against
  the current README instead of copying this template blindly.

```yaml
name: Sign Windows installer

on:
  workflow_dispatch:
    inputs:
      unsigned_run_id:
        description: 'Run id of the release-windows.yml run that produced the artifact'
        required: true
        type: string

permissions:
  contents: read
  actions: read

jobs:
  sign:
    runs-on: ubuntu-latest
    steps:
      - name: Resolve the unsigned artifact id
        id: artifact
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          RUN_ID: ${{ inputs.unsigned_run_id }}
        run: |
          id=$(gh api "repos/${{ github.repository }}/actions/runs/$RUN_ID/artifacts" \
            --jq '.artifacts[] | select(.name | startswith("asc-windows-unsigned-")) | .id' | head -1)
          if [ -z "$id" ]; then echo "No unsigned artifact on run $RUN_ID" >&2; exit 1; fi
          echo "id=$id" >> "$GITHUB_OUTPUT"

      - name: Submit the signing request
        uses: signpath/github-action-submit-signing-request@v1
        with:
          api-token: ${{ secrets.SIGNPATH_API_TOKEN }}
          organization-id: ${{ vars.SIGNPATH_ORGANIZATION_ID }}
          project-slug: ${{ vars.SIGNPATH_PROJECT_SLUG }}
          signing-policy-slug: ${{ vars.SIGNPATH_SIGNING_POLICY_SLUG }}
          artifact-configuration-slug: ${{ vars.SIGNPATH_ARTIFACT_CONFIGURATION_SLUG }}
          github-artifact-id: ${{ steps.artifact.outputs.id }}
          wait-for-completion: true
          output-artifact-directory: signed

      - name: Verify the returned signature
        run: |
          sudo apt-get update && sudo apt-get install -y osslsigncode
          osslsigncode verify -in signed/AgentSessionCenter-Setup-*.exe

      - uses: actions/upload-artifact@v4
        with:
          name: asc-windows-signed
          if-no-files-found: error
          path: signed/
```

The release step after this is unchanged: attach the **signed** installer, its `.blockmap`, its
`.sha256`, and `latest.yml` to the same GitHub Release.
