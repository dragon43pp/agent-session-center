#!/usr/bin/env bash

set -euo pipefail

workspace="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
package_path="$workspace/package.json"
version="$(node -p "require('$package_path').version")"
# HRACK_MAC_ARCH 是历史遗留的环境变量名（早期工作名 HRack），保留以兼容既有
# CI/本地配置。默认值 arm64 与 package.json 的 mac.target arch 一致。
arch="${HRACK_MAC_ARCH:-arm64}"
artifact_dir="$workspace/artifacts"
image_name="GrokBuildCenter-${version}-macos-${arch}.dmg"
archive_name="GrokBuildCenter-${version}-macos-${arch}.zip"
release_root="${TMPDIR:-/tmp}"
release_root="${release_root%/}"
release_dir="$(mktemp -d "$release_root/gbc-release-mac.XXXXXX")"
mount_dir="$release_dir/mount"
mounted=false

cleanup() {
  if [[ "$mounted" == true ]]; then
    hdiutil detach "$mount_dir" -quiet || true
  fi
  if [[ -d "$release_dir" && "$release_dir" == "$release_root"/gbc-release-mac.* ]]; then
    rm -rf -- "$release_dir"
  fi
}
trap cleanup EXIT

if [[ "$(uname -s)" != Darwin ]]; then
  echo 'macOS packaging must run on macOS.' >&2
  exit 1
fi
if [[ "$arch" != arm64 && "$arch" != x64 ]]; then
  echo "Unsupported macOS architecture: $arch" >&2
  exit 1
fi

cd "$workspace"
npm run build

CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder \
  --mac dmg zip \
  "--$arch" \
  --publish never \
  "--config.directories.output=$release_dir"

image_path="$release_dir/$image_name"
blockmap_path="$image_path.blockmap"
archive_path="$release_dir/$archive_name"
archive_blockmap_path="$archive_path.blockmap"
metadata_path="$release_dir/latest-mac.yml"
app_path="$(find "$release_dir" -maxdepth 3 -type d -name 'Grok Build Center.app' -print -quit)"
executable_path="$app_path/Contents/MacOS/Grok Build Center"
info_plist="$app_path/Contents/Info.plist"
packaged_update_config="$app_path/Contents/Resources/app-update.yml"

for required in \
  "$image_path" \
  "$blockmap_path" \
  "$archive_path" \
  "$archive_blockmap_path" \
  "$metadata_path" \
  "$executable_path" \
  "$info_plist" \
  "$packaged_update_config"; do
  if [[ ! -e "$required" ]]; then
    echo "Release output is missing: $required" >&2
    exit 1
  fi
done

node "$workspace/scripts/inject-release-notes.cjs" \
  "$metadata_path" \
  "$workspace/CHANGELOG.md" \
  "$version"
node "$workspace/scripts/assert-update-metadata.cjs" \
  "$metadata_path" \
  "$release_dir" \
  "$version" \
  "$archive_name" \
  "$image_name"
node "$workspace/scripts/assert-packaged-update-config.cjs" "$packaged_update_config"

bundle_id="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$info_plist")"
bundle_version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$info_plist")"
bundle_icon="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIconFile' "$info_plist")"
if [[ "$bundle_id" != com.grokbuildcenter.app ]]; then
  echo "Unexpected bundle identifier: $bundle_id" >&2
  exit 1
fi
if [[ "$bundle_version" != "$version" ]]; then
  echo "Bundle version $bundle_version does not match package version $version." >&2
  exit 1
fi
if [[ -z "$bundle_icon" || ! -f "$app_path/Contents/Resources/$bundle_icon" ]]; then
  echo "Packaged application icon is missing: $bundle_icon" >&2
  exit 1
fi
arch_pattern="$arch"
if [[ "$arch" == x64 ]]; then
  arch_pattern=x86_64
fi
if ! file "$executable_path" | grep -q "$arch_pattern"; then
  echo "Packaged executable does not contain the expected $arch architecture." >&2
  exit 1
fi

hdiutil verify "$image_path"
mkdir -p "$mount_dir"
hdiutil attach "$image_path" -readonly -nobrowse -mountpoint "$mount_dir" >/dev/null
mounted=true

mounted_executable="$mount_dir/Grok Build Center.app/Contents/MacOS/Grok Build Center"
if [[ ! -x "$mounted_executable" ]]; then
  echo 'Mounted DMG does not contain an executable Grok Build Center.app.' >&2
  exit 1
fi
node "$workspace/scripts/verify-packaged-tray.cjs" "$mounted_executable"

mounted_dsh="$mount_dir/Grok Build Center.app/Contents/Resources/dsh-runtime"
if [[ -e "$mounted_dsh" ]]; then
  echo "Packaged dsh runtime must be absent: $mounted_dsh" >&2
  exit 1
fi

hdiutil detach "$mount_dir" -quiet
mounted=false

mkdir -p "$artifact_dir"
cp -f "$image_path" "$artifact_dir/$image_name"
cp -f "$blockmap_path" "$artifact_dir/$image_name.blockmap"
cp -f "$archive_path" "$artifact_dir/$archive_name"
cp -f "$archive_blockmap_path" "$artifact_dir/$archive_name.blockmap"
cp -f "$metadata_path" "$artifact_dir/latest-mac.yml"

final_image="$artifact_dir/$image_name"
final_archive="$artifact_dir/$archive_name"
digest="$(shasum -a 256 "$final_image" | awk '{print $1}')"
printf '%s  %s\n' "$digest" "$image_name" > "$final_image.sha256"
archive_digest="$(shasum -a 256 "$final_archive" | awk '{print $1}')"
printf '%s  %s\n' "$archive_digest" "$archive_name" > "$final_archive.sha256"

size_mib="$(du -m "$final_image" | awk '{print $1}')"
printf 'macOS release image verified:\n'
printf '  Path: %s\n' "$final_image"
printf '  Architecture: %s\n' "$arch"
printf '  Version: %s\n' "$version"
printf '  Size: %s MiB\n' "$size_mib"
printf '  SHA256: %s\n' "$digest"
printf '  Update archive: %s\n' "$final_archive"
printf '  Update metadata: %s\n' "$artifact_dir/latest-mac.yml"
printf '  Signing: unsigned\n'
printf '  DMG integrity: verified\n'
printf '  Packaged runtime/tray: verified\n'
