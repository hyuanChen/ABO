#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

bash "$ROOT/scripts/build_macos_app.sh"
python3 "$ROOT/scripts/update_homebrew_cask.py"

echo "Homebrew cask: $ROOT/Casks/abo.rb"
