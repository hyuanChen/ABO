#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
EXT_PATH="$ROOT/extension"
PROFILE_DIR="${ABO_XHS_PROFILE_DIR:-$HOME/.abo/xhs-browser-profile}"
CDP_PORT="${ABO_XHS_CDP_PORT:-9222}"
START_URL="${1:-https://www.xiaohongshu.com/}"
WINDOW_MODE="${ABO_XHS_WINDOW_MODE:-shared}"

if [[ ! -d "$EXT_PATH" ]]; then
  echo "extension 目录不存在: $EXT_PATH" >&2
  exit 1
fi

mkdir -p "$PROFILE_DIR"

if [[ -d "/Applications/Microsoft Edge.app" ]]; then
  APP="/Applications/Microsoft Edge.app"
elif [[ -d "/Applications/Google Chrome.app" ]]; then
  APP="/Applications/Google Chrome.app"
else
  echo "未找到 Microsoft Edge 或 Google Chrome" >&2
  exit 1
fi

echo "启动浏览器: $APP"
echo "扩展目录: $EXT_PATH"
echo "用户数据目录: $PROFILE_DIR"
echo "CDP 端口: $CDP_PORT"
echo "起始页面: $START_URL"
echo "窗口模式: $WINDOW_MODE"

EXTRA_ARGS=()
if [[ "$WINDOW_MODE" == "dedicated" ]]; then
  EXTRA_ARGS+=(--new-window)
fi

open -na "$APP" --args \
  --remote-debugging-port="$CDP_PORT" \
  --load-extension="$EXT_PATH" \
  --user-data-dir="$PROFILE_DIR" \
  "${EXTRA_ARGS[@]}" \
  "$START_URL"

echo
echo "浏览器已启动。首次使用请在该浏览器实例里登录小红书。"
