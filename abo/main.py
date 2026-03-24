"""ABO FastAPI backend — entry point.

Run standalone (dev):
    python -m abo.main
    uvicorn abo.main:app --reload --port 8765
"""
import json
from pathlib import Path

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from abo.config import load_config, save_config
from abo.game.state import init_state, load_state, save_state
from abo.vault.writer import ensure_vault_structure
from abo.obsidian.uri import open_file, search_vault

app = FastAPI(title="ABO Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:1420",
        "http://127.0.0.1:1420",
        "tauri://localhost",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health ──────────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}


# ── Config ──────────────────────────────────────────────────────────────────

class ConfigRequest(BaseModel):
    vault_path: str


@app.get("/api/config")
async def get_config():
    return load_config()


@app.post("/api/config")
async def set_config(body: ConfigRequest):
    vault = body.vault_path.strip()
    if not vault:
        raise HTTPException(status_code=400, detail="vault_path is required")

    vault_path = Path(vault).expanduser().resolve()
    vault_path.mkdir(parents=True, exist_ok=True)

    # Create standard vault structure
    ensure_vault_structure(str(vault_path))

    # Copy default skill-tree if not present
    skill_tree_dest = vault_path / ".abo" / "skill-tree.yaml"
    if not skill_tree_dest.exists():
        default = Path(__file__).parent / "default_skill_tree.yaml"
        skill_tree_dest.write_text(default.read_text(), encoding="utf-8")

    # Write .abo/config.json
    abo_config = {"vault_path": str(vault_path), "version": "0.1"}
    (vault_path / ".abo" / "config.json").write_text(
        json.dumps(abo_config, indent=2), encoding="utf-8"
    )

    # Initialize game state
    init_state(str(vault_path))

    config = save_config(str(vault_path))
    return config


# ── Game State ───────────────────────────────────────────────────────────────

@app.get("/api/game/state")
async def get_game_state():
    config = load_config()
    if not config.get("is_configured"):
        raise HTTPException(status_code=404, detail="Vault not configured")
    return load_state(config["vault_path"])


@app.post("/api/game/state")
async def update_game_state(updates: dict):
    config = load_config()
    if not config.get("is_configured"):
        raise HTTPException(status_code=404, detail="Vault not configured")
    return save_state(config["vault_path"], updates)



# ── Obsidian URI ─────────────────────────────────────────────────────────────

class ObsidianOpenRequest(BaseModel):
    vault_name: str
    file_path: str

class ObsidianSearchRequest(BaseModel):
    vault_name: str
    query: str

@app.post("/api/obsidian/open")
async def obsidian_open(body: ObsidianOpenRequest):
    """Open a file in local Obsidian via obsidian:// URI scheme."""
    open_file(body.vault_name, body.file_path)
    return {"status": "opened"}

@app.post("/api/obsidian/search")
async def obsidian_search(body: ObsidianSearchRequest):
    """Trigger Obsidian search via URI scheme."""
    search_vault(body.vault_name, body.query)
    return {"status": "searching"}


# ── Entry point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    uvicorn.run("abo.main:app", host="127.0.0.1", port=8765, reload=True)
