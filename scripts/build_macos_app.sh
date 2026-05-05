#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="ABO.app"
APP_BUNDLE_DIR="$ROOT/src-tauri/target/release/bundle/macos"
DMG_DIR="$ROOT/src-tauri/target/release/bundle/dmg"
APP_PATH="$APP_BUNDLE_DIR/$APP_NAME"
RELEASE_DIR="$ROOT/release"
INSTALL_NOTE_NAME="请先拖到 Applications 后再打开.txt"
mkdir -p "$DMG_DIR"
mkdir -p "$RELEASE_DIR"

sign_app_bundle() {
  local app_path="$1"
  xattr -cr "$app_path"
  codesign --force --deep --sign - "$app_path"
  codesign --verify --deep --strict --verbose=2 "$app_path"
}

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
npm run brand:build
npm run tauri:build

if [[ ! -d "$APP_PATH" ]]; then
  echo "App bundle not found: $APP_PATH" >&2
  exit 1
fi

sign_app_bundle "$APP_PATH"

rm -f "$DMG_PATH"
rm -rf "$STAGING_DIR/$APP_NAME" "$STAGING_DIR/Applications" "$STAGING_DIR/$INSTALL_NOTE_NAME"
ditto "$APP_PATH" "$STAGING_DIR/$APP_NAME"
sign_app_bundle "$STAGING_DIR/$APP_NAME"
ln -s /Applications "$STAGING_DIR/Applications"
cat > "$STAGING_DIR/$INSTALL_NOTE_NAME" <<'EOF'
ABO 安装说明

1. 先把 ABO.app 拖到 Applications
2. 再从 Applications 里打开

不要直接在 DMG 里双击运行。
这样启动会更慢，也更容易触发 macOS 安全提示。
EOF

hdiutil create \
  -volname "ABO" \
  -srcfolder "$STAGING_DIR" \
  -ov \
  -format UDZO \
  "$DMG_PATH"

rm -rf "$RELEASE_DIR/$APP_NAME"
rm -f "$RELEASE_DIR/${APP_NAME%.app}.dmg"
ditto "$APP_PATH" "$RELEASE_DIR/$APP_NAME"
sign_app_bundle "$RELEASE_DIR/$APP_NAME"
cp -f "$DMG_PATH" "$RELEASE_DIR/$DMG_NAME"

echo "App bundle: $APP_PATH"
echo "DMG: $DMG_PATH"
echo "Release app: $RELEASE_DIR/$APP_NAME"
echo "Release DMG: $RELEASE_DIR/$DMG_NAME"
