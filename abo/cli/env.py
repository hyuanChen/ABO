"""Helpers for resolving CLI executables in bundled desktop environments."""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path
from typing import Iterable

DEFAULT_PATH_SEGMENTS = (
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
    "/usr/local/bin",
    "/usr/local/sbin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
)
_SHELL_ENV_KEYS = {
    "PATH",
    "HOME",
    "SHELL",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
}
_cached_env: dict[str, str] | None = None


def _dedupe_path(parts: Iterable[str]) -> str:
    seen: set[str] = set()
    ordered: list[str] = []
    for raw_part in parts:
        part = raw_part.strip()
        if not part or part in seen:
            continue
        seen.add(part)
        ordered.append(part)
    return os.pathsep.join(ordered)


def _base_env() -> dict[str, str]:
    env = dict(os.environ)
    env["HOME"] = env.get("HOME") or str(Path.home())
    env["SHELL"] = env.get("SHELL") or "/bin/zsh"
    existing_path = env.get("PATH", "")
    env["PATH"] = _dedupe_path([*existing_path.split(os.pathsep), *DEFAULT_PATH_SEGMENTS])
    return env


def _load_login_shell_env(env: dict[str, str]) -> dict[str, str]:
    shell = env.get("SHELL") or "/bin/zsh"
    candidates = [shell]
    if shell != "/bin/zsh":
        candidates.append("/bin/zsh")

    for candidate in candidates:
        if not candidate or not os.path.exists(candidate):
            continue
        try:
            result = subprocess.run(
                [candidate, "-l", "-c", "env"],
                capture_output=True,
                text=True,
                timeout=5,
                env=env,
            )
        except Exception:
            continue

        if result.returncode != 0:
            continue

        merged = dict(env)
        for line in result.stdout.splitlines():
            if "=" not in line:
                continue
            key, value = line.split("=", 1)
            if key in _SHELL_ENV_KEYS:
                merged[key] = value

        merged["PATH"] = _dedupe_path([*merged.get("PATH", "").split(os.pathsep), *DEFAULT_PATH_SEGMENTS])
        return merged

    return env


def reset_enhanced_cli_env_cache() -> None:
    """Clear cached shell-derived environment."""
    global _cached_env
    _cached_env = None


def get_enhanced_cli_env(*, force_refresh: bool = False) -> dict[str, str]:
    """Return a best-effort shell environment for CLI discovery/execution."""
    global _cached_env

    if force_refresh:
        _cached_env = None

    if _cached_env is None:
        _cached_env = _load_login_shell_env(_base_env())

    return dict(_cached_env)


def resolve_cli_command(command: str, *, env: dict[str, str] | None = None) -> str | None:
    """Resolve a CLI command using the enhanced PATH."""
    if not command:
        return None

    if os.path.sep in command:
        candidate = Path(command).expanduser()
        return str(candidate) if candidate.exists() else None

    active_env = env or get_enhanced_cli_env()
    return shutil.which(command, path=active_env.get("PATH"))
