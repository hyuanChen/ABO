#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="ABO.app"
APP_BUNDLE_DIR="$ROOT/src-tauri/target/release/bundle/macos"
DMG_DIR="$ROOT/src-tauri/target/release/bundle/dmg"
APP_PATH="$APP_BUNDLE_DIR/$APP_NAME"
RELEASE_DIR="$ROOT/release"
mkdir -p "$DMG_DIR"
mkdir -p "$RELEASE_DIR"

VERSION="$(python3 - <<'PY'
import json
from pathlib import Path
data = json.loads(Path("src-tauri/tauri.conf.json").read_text(encoding="utf-8"))
print(data["version"])
PY
)"

ARCH="$(rustc --print host-tuple | cut -d- -f1)"
DMG_NAME="ABO_${VERSION}_${ARCH}.dmg"
DMG_PATH="$DMG_DIR/$DMG_NAME"
STAGING_DIR="$(mktemp -d "$DMG_DIR/abo-dmg-stage.XXXXXX")"

cleanup() {
  rm -rf "$STAGING_DIR"
}
trap cleanup EXIT

cd "$ROOT"
npm run tauri:build

if [[ ! -d "$APP_PATH" ]]; then
  echo "App bundle not found: $APP_PATH" >&2
  exit 1
fi

rm -f "$DMG_PATH"
rm -rf "$STAGING_DIR/$APP_NAME" "$STAGING_DIR/Applications"
cp -R "$APP_PATH" "$STAGING_DIR/"
ln -s /Applications "$STAGING_DIR/Applications"

hdiutil create \
  -volname "ABO" \
  -srcfolder "$STAGING_DIR" \
  -ov \
  -format UDZO \
  "$DMG_PATH"

rm -rf "$RELEASE_DIR/$APP_NAME"
cp -R "$APP_PATH" "$RELEASE_DIR/"
cp -f "$DMG_PATH" "$RELEASE_DIR/"

echo "App bundle: $APP_PATH"
echo "DMG: $DMG_PATH"
echo "Release app: $RELEASE_DIR/$APP_NAME"
echo "Release DMG: $RELEASE_DIR/$DMG_NAME"
