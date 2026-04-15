#!/usr/bin/env bash
set -euo pipefail

START_URL="${1:-https://www.xiaohongshu.com/explore}"

if [[ ! -d "/Applications/Microsoft Edge.app" ]]; then
  echo "未找到 Microsoft Edge.app" >&2
  exit 1
fi

osascript - "$START_URL" <<'APPLESCRIPT'
on run argv
  set startUrl to item 1 of argv
  tell application "System Events"
    set previousProcess to first application process whose frontmost is true
    set previousAppName to name of previousProcess
    set previousProcessId to unix id of previousProcess
  end tell

  tell application "Microsoft Edge"
    activate
    if not running then
      open location startUrl
      delay 0.5
    else
      set newWindow to make new window
      delay 0.3
      set URL of active tab of newWindow to startUrl
    end if
  end tell

  if previousAppName is not "Microsoft Edge" then
    tell application "System Events"
      set matches to application processes whose unix id is previousProcessId
      if (count of matches) > 0 then
        set frontmost of item 1 of matches to true
      end if
    end tell
  end if
end run
APPLESCRIPT

echo "已在当前 Edge 中打开独立窗口: $START_URL"
