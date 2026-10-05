#!/usr/bin/env bash

set -euo pipefail

workspace="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tag_name="${1:-${GITHUB_REF_NAME:-}}"
version="$(node -p "require('$workspace/package.json').version")"
expected_tag="v$version"

# 环境变量名必须与 release-mac.sh 完全一致，默认值也必须相同，
# 否则这里会去找不存在的产物。
arch="${ASC_MAC_ARCH:-arm64}"

if [[ -z "$tag_name" ]]; then
  echo 'A release tag is required. Pass vX.Y.Z or set GITHUB_REF_NAME.' >&2
  exit 1
fi
if [[ "$tag_name" != "$expected_tag" ]]; then
  echo "Release tag $tag_name does not match package.json version $version (expected $expected_tag)." >&2
  exit 1
fi

cd "$workspace"
npm run typecheck
npm run release:mac

image_name="AgentSessionCenter-${version}-macos-${arch}.dmg"
archive_name="AgentSessionCenter-${version}-macos-${arch}.zip"
for required in \
  "$workspace/artifacts/$image_name" \
  "$workspace/artifacts/$image_name.blockmap" \
  "$workspace/artifacts/$image_name.sha256" \
  "$workspace/artifacts/$archive_name" \
  "$workspace/artifacts/$archive_name.blockmap" \
  "$workspace/artifacts/$archive_name.sha256" \
  "$workspace/artifacts/latest-mac.yml"; do
  if [[ ! -f "$required" ]]; then
    echo "Release output is missing: $required" >&2
    exit 1
  fi
done

printf 'GitHub macOS release assets ready for %s:\n' "$tag_name"
printf '  %s\n' "$workspace/artifacts/$image_name"
printf '  %s\n' "$workspace/artifacts/$image_name.blockmap"
printf '  %s\n' "$workspace/artifacts/$image_name.sha256"
printf '  %s\n' "$workspace/artifacts/$archive_name"
printf '  %s\n' "$workspace/artifacts/$archive_name.blockmap"
printf '  %s\n' "$workspace/artifacts/$archive_name.sha256"
printf '  %s\n' "$workspace/artifacts/latest-mac.yml"
