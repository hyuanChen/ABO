#!/usr/bin/env python3
"""Build the bundled Python backend executable for Tauri."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VENV_DIR = ROOT / ".venv-packaging"
BUILD_ROOT = ROOT / "build-sidecar"
ENTRYPOINT = ROOT / "scripts" / "packaging" / "abo_backend_entry.py"
TAURI_BIN_DIR = ROOT / "src-tauri" / "binaries"
BACKEND_NAME = "abo-backend"


def run(cmd: list[str], *, env: dict[str, str] | None = None) -> str:
    print(f"[sidecar-build] {' '.join(cmd)}")
    completed = subprocess.run(
        cmd,
        cwd=ROOT,
        env=env,
        check=True,
        text=True,
        capture_output=True,
    )
    if completed.stdout.strip():
        print(completed.stdout.strip())
    if completed.stderr.strip():
        print(completed.stderr.strip())
    return completed.stdout.strip()


def venv_python() -> Path:
    if sys.platform == "win32":
        return VENV_DIR / "Scripts" / "python.exe"
    return VENV_DIR / "bin" / "python"


def ensure_venv() -> None:
    if venv_python().exists():
        return
    run([sys.executable, "-m", "venv", str(VENV_DIR)])


def host_triple() -> str:
    try:
        value = run(["rustc", "--print", "host-tuple"])
        if value:
            return value.splitlines()[-1].strip()
    except subprocess.CalledProcessError:
        pass

    value = run(["rustc", "-Vv"])
    for line in value.splitlines():
        if line.startswith("host:"):
            return line.split(":", 1)[1].strip()
    raise RuntimeError("Failed to determine Rust target triple")


def sidecar_filename(target: str) -> str:
    extension = ".exe" if target.endswith("windows-msvc") or target.endswith("windows-gnu") else ""
    return f"{BACKEND_NAME}-{target}{extension}"


def relevant_sources() -> list[Path]:
    sources = [
        ROOT / "requirements.txt",
        ROOT / "scripts" / "build_tauri_sidecar.py",
        ENTRYPOINT,
    ]
    sources.extend(ROOT.joinpath("abo").rglob("*.py"))
    return sources


def is_sidecar_current(output: Path) -> bool:
    if not output.exists():
        return False
    output_mtime = output.stat().st_mtime
    newest_source = max(path.stat().st_mtime for path in relevant_sources() if path.exists())
    return output_mtime >= newest_source


def install_build_dependencies() -> None:
    python = str(venv_python())
    run([python, "-m", "pip", "install", "--upgrade", "pip", "wheel", "setuptools"])
    run(
        [
            python,
            "-m",
            "pip",
            "install",
            "-r",
            str(ROOT / "requirements.txt"),
            "pyinstaller>=6.0",
        ]
    )


def build_sidecar() -> Path:
    python = str(venv_python())
    dist_dir = BUILD_ROOT / "dist"
    work_dir = BUILD_ROOT / "work"
    spec_dir = BUILD_ROOT / "spec"

    if BUILD_ROOT.exists():
        shutil.rmtree(BUILD_ROOT)

    env = os.environ.copy()
    env["PYTHONNOUSERSITE"] = "1"

    run(
        [
            python,
            "-m",
            "PyInstaller",
            "--noconfirm",
            "--clean",
            "--onefile",
            "--name",
            BACKEND_NAME,
            "--distpath",
            str(dist_dir),
            "--workpath",
            str(work_dir),
            "--specpath",
            str(spec_dir),
            "--paths",
            str(ROOT),
            "--collect-submodules",
            "uvicorn",
            "--collect-submodules",
            "watchdog",
            "--collect-submodules",
            "websockets",
            "--collect-submodules",
            "abo.default_modules",
            "--hidden-import",
            "browser_cookie3",
            "--hidden-import",
            "h11",
            str(ENTRYPOINT),
        ],
        env=env,
    )

    executable = dist_dir / (f"{BACKEND_NAME}.exe" if sys.platform == "win32" else BACKEND_NAME)
    if not executable.exists():
        raise FileNotFoundError(f"Built sidecar not found: {executable}")
    return executable


def install_sidecar(executable: Path) -> Path:
    target = host_triple()
    TAURI_BIN_DIR.mkdir(parents=True, exist_ok=True)
    output = TAURI_BIN_DIR / sidecar_filename(target)
    shutil.copy2(executable, output)
    output.chmod(0o755)
    print(f"[sidecar-build] installed {output}")
    return output


def main() -> None:
    target = host_triple()
    output = TAURI_BIN_DIR / sidecar_filename(target)
    if is_sidecar_current(output):
        print(f"[sidecar-build] up to date: {output}")
        return

    ensure_venv()
    install_build_dependencies()
    executable = build_sidecar()
    install_sidecar(executable)


if __name__ == "__main__":
    main()
