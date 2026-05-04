#!/usr/bin/env python3
"""Run ABO backend and Vite dev server together for Tauri dev."""

from __future__ import annotations

import os
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BACKEND_PORT = 8765


def _default_dev_app_data_dir() -> str:
    home = Path.home()
    if sys.platform == "darwin":
        return str(home / "Library" / "Application Support" / "ABO Dev")

    if sys.platform == "win32":
        appdata = os.environ.get("APPDATA", "").strip()
        if appdata:
            return str(Path(appdata) / "ABO Dev")
        return str(home / "AppData" / "Roaming" / "ABO Dev")

    xdg_data_home = os.environ.get("XDG_DATA_HOME", "").strip()
    if xdg_data_home:
        return str(Path(xdg_data_home) / "ABO Dev")
    return str(home / ".local" / "share" / "ABO Dev")


def _port_is_open(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.2)
        return sock.connect_ex(("127.0.0.1", port)) == 0


def _pids_on_port(port: int) -> list[int]:
    try:
        out = subprocess.check_output(
            ["lsof", "-ti", f"TCP:{port}", "-sTCP:LISTEN"],
            text=True,
            stderr=subprocess.DEVNULL,
        )
    except (subprocess.CalledProcessError, FileNotFoundError):
        return []

    pids: list[int] = []
    for line in out.splitlines():
        try:
            pids.append(int(line.strip()))
        except ValueError:
            continue
    return pids


def _command_for_pid(pid: int) -> str:
    try:
        return subprocess.check_output(["ps", "-p", str(pid), "-o", "command="], text=True).strip()
    except subprocess.CalledProcessError:
        return ""


def _stop_stale_backend() -> None:
    for pid in _pids_on_port(BACKEND_PORT):
        command = _command_for_pid(pid)
        if "abo.main" not in command and "uvicorn" not in command:
            print(f"[dev] Port {BACKEND_PORT} is used by PID {pid}: {command}", flush=True)
            continue

        print(f"[dev] Stopping stale ABO backend PID {pid}", flush=True)
        try:
            os.kill(pid, signal.SIGTERM)
        except ProcessLookupError:
            continue

        deadline = time.time() + 5
        while time.time() < deadline and _port_is_open(BACKEND_PORT):
            time.sleep(0.1)

        if _port_is_open(BACKEND_PORT):
            print(f"[dev] Force stopping stale ABO backend PID {pid}", flush=True)
            try:
                os.kill(pid, signal.SIGKILL)
            except ProcessLookupError:
                pass


def _terminate(proc: subprocess.Popen[object] | None) -> None:
    if proc is None or proc.poll() is not None:
        return
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=5)


def main() -> int:
    _stop_stale_backend()

    dev_app_data_dir = _default_dev_app_data_dir()
    backend_env = os.environ.copy()
    backend_env["ABO_APP_DATA_DIR"] = dev_app_data_dir

    backend = subprocess.Popen(
        [sys.executable, "-m", "abo.main"],
        cwd=ROOT,
        env=backend_env,
    )
    frontend = subprocess.Popen(["npm", "run", "dev"], cwd=ROOT)
    children = [backend, frontend]

    stopping = False

    def handle_signal(signum: int, _frame: object) -> None:
        nonlocal stopping
        if stopping:
            return
        stopping = True
        print(f"[dev] Received signal {signum}, stopping dev processes", flush=True)
        for child in children:
            _terminate(child)

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    try:
        while True:
            for child in children:
                code = child.poll()
                if code is not None:
                    other = frontend if child is backend else backend
                    _terminate(other)
                    return code
            time.sleep(0.5)
    finally:
        for child in children:
            _terminate(child)


if __name__ == "__main__":
    raise SystemExit(main())
