#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_ICON="${1:-$ROOT_DIR/src/assets/branding/abo-logo-source.png}"
MARK_OUTPUT="$ROOT_DIR/src/assets/branding/abo-mark.png"
ICON_SOURCE_OUTPUT="$ROOT_DIR/src-tauri/icons/app-icon-source.png"
FAVICON_OUTPUT="$ROOT_DIR/public/abo-favicon.png"

if [[ ! -f "$SOURCE_ICON" ]]; then
  echo "Brand source icon not found: $SOURCE_ICON" >&2
  exit 1
fi

if ! command -v magick >/dev/null 2>&1; then
  echo "ImageMagick 'magick' is required to build brand assets." >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
ICON_MASK="$TMP_DIR/icon-mask.png"

mkdir -p "$(dirname "$MARK_OUTPUT")" "$(dirname "$ICON_SOURCE_OUTPUT")" "$(dirname "$FAVICON_OUTPUT")"

# Trim the original RGBA mark and keep generous padding so it stays legible in the sidebar.
magick "$SOURCE_ICON" \
  -trim +repage \
  -modulate 102,114,100 \
  -background none \
  -gravity center \
  -extent 840x840 \
  "$MARK_OUTPUT"

magick "$SOURCE_ICON" \
  -trim +repage \
  -modulate 103,118,100 \
  -resize 610x610 \
  "$TMP_DIR/mark.png"

magick -size 860x860 radial-gradient:'#fffbf7-#f4eeff' \
  \( -size 860x860 xc:none -fill white -draw "roundrectangle 0,0 859,859 210,210" \) \
  -alpha off \
  -compose CopyOpacity \
  -composite \
  "$TMP_DIR/card.png"

magick "$TMP_DIR/card.png" \
  -fill 'rgba(255,255,255,0.55)' \
  -draw 'roundrectangle 9,9 850,850 200,200' \
  -fill none \
  -stroke 'rgba(225,205,255,0.52)' \
  -strokewidth 2 \
  -draw 'roundrectangle 1,1 858,858 210,210' \
  "$TMP_DIR/card-finish.png"

magick -size 860x860 xc:none \
  -stroke 'rgba(255,255,255,0.35)' \
  -strokewidth 12 \
  -draw 'line -40,290 900,-10' \
  -stroke 'rgba(255,255,255,0.18)' \
  -strokewidth 6 \
  -draw 'line -20,380 920,80' \
  -blur 0x2 \
  "$TMP_DIR/sheen.png"

magick -size 320x320 radial-gradient:'rgba(255,209,168,0.33)-rgba(255,209,168,0)' \
  "$TMP_DIR/glow.png"

magick -size 1024x1024 xc:none \
  "$TMP_DIR/card-finish.png" \
  -gravity center \
  -compose over \
  -composite \
  "$TMP_DIR/base.png"

magick "$TMP_DIR/base.png" \
  "$TMP_DIR/sheen.png" \
  -gravity center \
  -compose screen \
  -composite \
  "$TMP_DIR/base-sheen.png"

magick "$TMP_DIR/base-sheen.png" \
  "$TMP_DIR/glow.png" \
  -gravity center \
  -geometry +0-42 \
  -compose screen \
  -composite \
  "$TMP_DIR/base-glow.png"

magick "$TMP_DIR/base-glow.png" \
  \( "$TMP_DIR/mark.png" +clone -background 'rgba(169,150,208,0.08)' -shadow 52x18+0+8 \) \
  -gravity center \
  -geometry +0+42 \
  -compose over \
  -composite \
  "$TMP_DIR/mark.png" \
  -gravity center \
  -geometry +0+4 \
  -compose over \
  -composite \
  "$TMP_DIR/icon-raw.png"

# `tauri icon` preserves semi-transparent corner pixels in the source image.
# Clamp the final app icon to the same rounded-rect silhouette so macOS does not
# render a dark square behind the icon.
magick -size 1024x1024 xc:none \
  -fill white \
  -draw 'roundrectangle 82,82 941,941 210,210' \
  "$ICON_MASK"

magick "$TMP_DIR/icon-raw.png" \
  "$ICON_MASK" \
  -compose DstIn \
  -composite \
  "$ICON_SOURCE_OUTPUT"

magick "$ICON_SOURCE_OUTPUT" -resize 256x256 "$FAVICON_OUTPUT"

(
  cd "$ROOT_DIR"
  mkdir -p "$TMP_DIR/tauri-icons"
  npx tauri icon "$ICON_SOURCE_OUTPUT" -o "$TMP_DIR/tauri-icons" >/dev/null
)

for output_name in \
  32x32.png \
  128x128.png \
  128x128@2x.png \
  icon.png \
  icon.icns \
  icon.ico \
  StoreLogo.png \
  Square30x30Logo.png \
  Square44x44Logo.png \
  Square71x71Logo.png \
  Square89x89Logo.png \
  Square107x107Logo.png \
  Square142x142Logo.png \
  Square150x150Logo.png \
  Square284x284Logo.png \
  Square310x310Logo.png
do
  cp "$TMP_DIR/tauri-icons/$output_name" "$ROOT_DIR/src-tauri/icons/$output_name"
done
