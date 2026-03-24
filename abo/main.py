"""ABO FastAPI backend — entry point.

Run standalone (dev):
    python -m abo.main
    uvicorn abo.main:app --reload --port 8765
"""
import json
from pathlib import Path

import uvicorn
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from abo.config import load_config, save_config
from abo.game.state import init_state, load_state, save_state
from abo.game.energy import log_energy_event, ALL_EVENTS
from abo.game.skills import get_skills_with_state, award_xp
from abo.game.tasks import get_today_tasks, add_task, complete_task, delete_task
from abo.literature.indexer import search_papers, list_papers
from abo.literature.importer import import_pdf, import_doi, upgrade_digest
from abo.claude_bridge.runner import stream_call, batch_call
from abo.claude_bridge.context_builder import build_context
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



# ── Energy ───────────────────────────────────────────────────────────────────

@app.get("/api/energy/events")
async def list_energy_events():
    return {"events": [{"id": k, **v} for k, v in ALL_EVENTS.items()]}


class EnergyLogRequest(BaseModel):
    event_type: str


@app.post("/api/energy/log")
async def post_energy_log(body: EnergyLogRequest):
    config = load_config()
    if not config.get("is_configured"):
        raise HTTPException(status_code=404, detail="Vault not configured")
    try:
        return log_energy_event(config["vault_path"], body.event_type)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Skills ───────────────────────────────────────────────────────────────────

@app.get("/api/skills")
async def get_skills():
    config = load_config()
    if not config.get("is_configured"):
        raise HTTPException(status_code=404, detail="Vault not configured")
    return {"skills": get_skills_with_state(config["vault_path"])}


class XpRequest(BaseModel):
    xp: int


@app.post("/api/skills/{skill_id}/xp")
async def post_skill_xp(skill_id: str, body: XpRequest):
    config = load_config()
    if not config.get("is_configured"):
        raise HTTPException(status_code=404, detail="Vault not configured")
    return award_xp(config["vault_path"], skill_id, body.xp)


# ── Tasks ────────────────────────────────────────────────────────────────────

@app.get("/api/tasks/today")
async def get_tasks_today():
    config = load_config()
    if not config.get("is_configured"):
        raise HTTPException(status_code=404, detail="Vault not configured")
    return {"tasks": get_today_tasks(config["vault_path"])}


class TaskCreateRequest(BaseModel):
    label: str
    xp: int = 20
    skill: str | None = None


@app.post("/api/tasks")
async def create_task(body: TaskCreateRequest):
    config = load_config()
    if not config.get("is_configured"):
        raise HTTPException(status_code=404, detail="Vault not configured")
    return add_task(config["vault_path"], body.label, body.xp, body.skill)


@app.patch("/api/tasks/{task_id}/complete")
async def complete_task_route(task_id: str):
    config = load_config()
    if not config.get("is_configured"):
        raise HTTPException(status_code=404, detail="Vault not configured")
    result = complete_task(config["vault_path"], task_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Task not found or already done")
    return result


@app.delete("/api/tasks/{task_id}")
async def delete_task_route(task_id: str):
    config = load_config()
    if not config.get("is_configured"):
        raise HTTPException(status_code=404, detail="Vault not configured")
    ok = delete_task(config["vault_path"], task_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"deleted": task_id}


# ── Literature ───────────────────────────────────────────────────────────────

@app.get("/api/literature")
async def get_literature():
    config = load_config()
    if not config.get("is_configured"):
        raise HTTPException(status_code=404, detail="Vault not configured")
    papers = list_papers(config["vault_path"])
    # Enrich with frontmatter title/authors
    from pathlib import Path
    import frontmatter as fm
    enriched = []
    for p in papers:
        md = Path(p["md_path"])
        if md.exists():
            post = fm.load(str(md))
            p["title"] = post.get("title", p["paper_id"])
            p["authors"] = post.get("authors", "")
        else:
            p["title"] = p["paper_id"]
            p["authors"] = ""
        enriched.append(p)
    return {"papers": enriched}


@app.get("/api/literature/search")
async def search_literature(q: str):
    config = load_config()
    if not config.get("is_configured"):
        raise HTTPException(status_code=404, detail="Vault not configured")
    return {"results": search_papers(config["vault_path"], q)}


class ImportPdfRequest(BaseModel):
    pdf_path: str
    run_claude: bool = False


@app.post("/api/literature/import/pdf")
async def literature_import_pdf(body: ImportPdfRequest):
    config = load_config()
    if not config.get("is_configured"):
        raise HTTPException(status_code=404, detail="Vault not configured")
    try:
        return await import_pdf(body.pdf_path, config["vault_path"], run_claude=body.run_claude)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


class ImportDoiRequest(BaseModel):
    doi: str
    run_claude: bool = False


@app.post("/api/literature/import/doi")
async def literature_import_doi(body: ImportDoiRequest):
    config = load_config()
    if not config.get("is_configured"):
        raise HTTPException(status_code=404, detail="Vault not configured")
    try:
        return await import_doi(body.doi, config["vault_path"], run_claude=body.run_claude)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


class DigestRequest(BaseModel):
    level: int


@app.post("/api/literature/{paper_id}/digest")
async def literature_upgrade_digest(paper_id: str, body: DigestRequest):
    config = load_config()
    if not config.get("is_configured"):
        raise HTTPException(status_code=404, detail="Vault not configured")
    try:
        return upgrade_digest(config["vault_path"], paper_id, body.level)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Paper {paper_id} not found")


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


# ── Claude WebSocket ─────────────────────────────────────────────────────────

@app.websocket("/ws/claude")
async def claude_ws(websocket: WebSocket, current_file: str | None = None):
    """Stream Claude responses over WebSocket. Send text prompt, receive stream-json lines."""
    await websocket.accept()
    config = load_config()
    if not config.get("is_configured"):
        await websocket.close(code=1008)
        return
    try:
        while True:
            prompt = await websocket.receive_text()
            context = build_context(config["vault_path"], current_file)
            await stream_call(prompt, context, websocket)
            # Send sentinel to signal end of response
            await websocket.send_text('{"type":"done"}')
    except WebSocketDisconnect:
        pass


# ── Mindmap ───────────────────────────────────────────────────────────────────

from abo.mindmap.canvas import load_canvas, save_canvas, list_canvases, create_canvas
from abo.mindmap.collider import collide_ab


@app.get("/api/mindmap/canvases")
async def get_canvases():
    config = load_config()
    if not config.get("is_configured"):
        raise HTTPException(status_code=404, detail="Vault not configured")
    return {"canvases": list_canvases(config["vault_path"])}


class CanvasCreateRequest(BaseModel):
    name: str


@app.post("/api/mindmap/canvases")
async def post_canvas(body: CanvasCreateRequest):
    config = load_config()
    if not config.get("is_configured"):
        raise HTTPException(status_code=404, detail="Vault not configured")
    return create_canvas(config["vault_path"], body.name)


@app.get("/api/mindmap/{canvas_id}")
async def get_canvas(canvas_id: str):
    config = load_config()
    if not config.get("is_configured"):
        raise HTTPException(status_code=404, detail="Vault not configured")
    data = load_canvas(config["vault_path"], canvas_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Canvas not found")
    return data


class CanvasSaveRequest(BaseModel):
    nodes: list
    edges: list


@app.put("/api/mindmap/{canvas_id}")
async def put_canvas(canvas_id: str, body: CanvasSaveRequest):
    config = load_config()
    if not config.get("is_configured"):
        raise HTTPException(status_code=404, detail="Vault not configured")
    return save_canvas(config["vault_path"], canvas_id, body.nodes, body.edges)


class CollideRequest(BaseModel):
    idea_a: str
    idea_b: str


@app.post("/api/mindmap/collide")
async def mindmap_collide(body: CollideRequest):
    config = load_config()
    if not config.get("is_configured"):
        raise HTTPException(status_code=404, detail="Vault not configured")
    result = await collide_ab(body.idea_a, body.idea_b)
    return result


# ── Entry point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    uvicorn.run("abo.main:app", host="127.0.0.1", port=8765, reload=True)
