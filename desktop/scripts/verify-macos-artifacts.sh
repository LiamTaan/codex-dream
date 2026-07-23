#!/bin/bash
set -euo pipefail

EXPECTED_IDENTIFIER="com.liamtaan.codexdreamskin"
DIST_DIR="${1:-$(cd "$(dirname "$0")/.." && pwd)/dist}"
mount_points=()

cleanup() {
  local mount_point
  for mount_point in "${mount_points[@]}"; do
    if mount | grep -Fq " on ${mount_point} "; then
      hdiutil detach "$mount_point" >/dev/null
    fi
  done
}
trap cleanup EXIT

shopt -s nullglob
dmgs=("$DIST_DIR"/*.dmg)
if (( ${#dmgs[@]} == 0 )); then
  echo "No macOS DMG artifacts found in $DIST_DIR" >&2
  exit 1
fi

verified_arches=()
for dmg in "${dmgs[@]}"; do
  mount_point="$(mktemp -d "${TMPDIR:-/tmp}/codex-dream-skin.XXXXXX")"
  mount_points+=("$mount_point")
  hdiutil attach -readonly -nobrowse -mountpoint "$mount_point" "$dmg" >/dev/null

  app="$mount_point/Codex Dream Skin.app"
  if [[ ! -d "$app" ]]; then
    echo "Missing application bundle in $dmg" >&2
    exit 1
  fi

  codesign --verify --deep --strict --verbose=4 "$app"
  identifier="$(codesign -dv --verbose=4 "$app" 2>&1 | sed -n 's/^Identifier=//p')"
  if [[ "$identifier" != "$EXPECTED_IDENTIFIER" ]]; then
    echo "Unexpected identifier in $dmg: $identifier" >&2
    exit 1
  fi

  executable="$app/Contents/MacOS/Codex Dream Skin"
  architectures="$(lipo -archs "$executable")"
  case "$(basename "$dmg")" in
    *arm64*) expected_arch="arm64" ;;
    *) expected_arch="x86_64" ;;
  esac
  if [[ " $architectures " != *" $expected_arch "* ]]; then
    echo "Expected $expected_arch in $dmg, found: $architectures" >&2
    exit 1
  fi
  verified_arches+=("$expected_arch")

  hdiutil detach "$mount_point" >/dev/null
  rmdir "$mount_point"
done

if [[ " ${verified_arches[*]} " != *" arm64 "* || " ${verified_arches[*]} " != *" x86_64 "* ]]; then
  echo "Both arm64 and x64 DMG artifacts must be verified" >&2
  exit 1
fi

echo "Verified ${#dmgs[@]} macOS DMG artifacts with complete bundle signatures."
