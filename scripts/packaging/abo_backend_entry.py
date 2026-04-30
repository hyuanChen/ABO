#!/usr/bin/env python3
"""Bundled FastAPI entrypoint for the Tauri sidecar build."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import uvicorn

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from abo.main import app


def main() -> None:
    host = os.environ.get("ABO_BACKEND_HOST", "127.0.0.1")
    port = int(os.environ.get("ABO_BACKEND_PORT", "8765"))
    log_level = os.environ.get("ABO_BACKEND_LOG_LEVEL", "info")

    config = uvicorn.Config(
        app,
        host=host,
        port=port,
        loop="asyncio",
        http="h11",
        ws="websockets",
        lifespan="on",
        log_level=log_level,
        access_log=False,
    )
    server = uvicorn.Server(config)
    server.run()


if __name__ == "__main__":
    main()
