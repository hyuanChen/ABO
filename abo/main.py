"""
ABO Backend — FastAPI 入口
"""
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .config import get_vault_path, load as load_config, save as save_config
from .preferences.engine import PreferenceEngine
from .profile.routes import router as profile_router, init_routes as init_profile_routes
from .runtime.broadcaster import broadcaster
from .runtime.discovery import ModuleRegistry, start_watcher
from .runtime.runner import ModuleRunner
from .runtime.scheduler import ModuleScheduler
from .sdk.types import FeedbackAction
from .store.cards import CardStore

# ── 全局单例 ────────────────────────────────────────────────────
_registry = ModuleRegistry()
_card_store = CardStore()
_prefs = PreferenceEngine()
_scheduler: ModuleScheduler | None = None

init_profile_routes(_card_store)


def _write_sdk_readme():
    path = Path.home() / ".abo" / "sdk" / "README.md"
    if path.exists():
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "# ABO Module SDK\n\n"
        "ABO 自动发现 `~/.abo/modules/<name>/__init__.py` 中的模块。\n"
        "保存后立即热加载，无需重启。\n\n"
        "## 最小可用模块\n\n"
        "```python\n"
        "from abo.sdk import Module, Item, Card, claude_json\n\n"
        "class MyModule(Module):\n"
        "    id       = 'my-module'\n"
        "    name     = '我的模块'\n"
        "    schedule = '0 8 * * *'\n"
        "    icon     = 'rss'\n"
        "    output   = ['obsidian', 'ui']\n\n"
        "    async def fetch(self):\n"
        "        return [Item(id='1', raw={'title': '示例', 'url': ''})]\n\n"
        "    async def process(self, items, prefs):\n"
        "        result = await claude_json(\n"
        "            f'评分(1-10)并用中文总结：{items[0].raw[\"title\"]}',\n"
        "            prefs=prefs\n"
        "        )\n"
        "        return [Card(\n"
        "            id=items[0].id, title=items[0].raw['title'],\n"
        "            summary=result.get('summary', ''), score=result.get('score', 5) / 10,\n"
        "            tags=result.get('tags', []), source_url='',\n"
        "            obsidian_path='Notes/test.md'\n"
        "        )]\n"
        "```\n\n"
        "## 调度表达式示例\n\n"
        "```\n"
        "\"0 8 * * *\"      每天 08:00\n"
        "\"0 */2 * * *\"    每 2 小时\n"
        "\"*/30 * * * *\"   每 30 分钟\n"
        "```\n"
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _scheduler
    vault_path = get_vault_path()
    _registry.load_all()
    runner = ModuleRunner(_card_store, _prefs, broadcaster, vault_path)
    _scheduler = ModuleScheduler(runner)
    _scheduler.start(_registry.enabled())
    start_watcher(_registry, lambda reg: _scheduler.reschedule(reg.enabled()))
    _write_sdk_readme()
    yield
    if _scheduler:
        _scheduler.shutdown()


app = FastAPI(title="ABO Backend", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(profile_router)


# ── Health ───────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}


# ── WebSocket ────────────────────────────────────────────────────

@app.websocket("/ws/feed")
async def feed_ws(ws: WebSocket):
    await ws.accept()
    broadcaster.register(ws)
    try:
        while True:
            await ws.receive_text()
    except Exception:
        broadcaster.unregister(ws)


# ── Cards ────────────────────────────────────────────────────────

@app.get("/api/cards")
async def get_cards(
    module_id: str | None = None,
    unread_only: bool = False,
    limit: int = 50,
    offset: int = 0,
):
    cards = _card_store.list(
        module_id=module_id, unread_only=unread_only,
        limit=limit, offset=offset,
    )
    return {"cards": [c.to_dict() for c in cards]}


@app.get("/api/cards/unread-counts")
async def unread_counts():
    return _card_store.unread_counts()


class FeedbackReq(BaseModel):
    action: FeedbackAction


@app.post("/api/cards/{card_id}/feedback")
async def feedback(card_id: str, body: FeedbackReq):
    card = _card_store.get(card_id)
    if not card:
        raise HTTPException(404, "Card not found")
    _prefs.record_feedback(card.tags, body.action.value)
    _card_store.record_feedback(card_id, body.action.value)
    module = _registry.get(card.module_id)
    if module:
        await module.on_feedback(card_id, body.action)
    return {"ok": True}


# ── Modules ──────────────────────────────────────────────────────

@app.get("/api/modules")
async def list_modules():
    job_map = {j["id"]: j for j in (_scheduler.job_info() if _scheduler else [])}
    return {
        "modules": [
            {**m.get_status(), "next_run": job_map.get(m.id, {}).get("next_run")}
            for m in _registry.all()
        ]
    }


@app.post("/api/modules/{module_id}/run")
async def run_module(module_id: str):
    if not _scheduler:
        raise HTTPException(503, "Scheduler not ready")
    ok = await _scheduler.run_now(module_id, _registry)
    if not ok:
        raise HTTPException(404, f"Module {module_id} not found")
    return {"ok": True}


@app.patch("/api/modules/{module_id}/toggle")
async def toggle_module(module_id: str):
    module = _registry.get(module_id)
    if not module:
        raise HTTPException(404, "Module not found")
    module.enabled = not module.enabled
    return {"enabled": module.enabled}


# ── Config ───────────────────────────────────────────────────────

@app.get("/api/config")
async def get_config():
    return load_config()


@app.post("/api/config")
async def update_config(data: dict):
    save_config(data)
    return {"ok": True}


# ── Preferences ──────────────────────────────────────────────────

@app.get("/api/preferences")
async def get_prefs():
    return _prefs.all_data()


@app.post("/api/preferences")
async def update_prefs(data: dict):
    _prefs.update(data)
    return {"ok": True}


# ── Vault Browser ────────────────────────────────────────────────

class VaultItem(BaseModel):
    name: str
    path: str
    type: str  # "folder" or "file"
    size: int | None = None
    modified: float  # timestamp


@app.get("/api/vault/browse")
async def browse_vault(path: str = ""):
    """Browse vault folder structure."""
    vault_path = get_vault_path()
    if not vault_path:
        raise HTTPException(400, "Vault not configured")

    target = Path(vault_path) / path if path else Path(vault_path)

    if not str(target.resolve()).startswith(str(Path(vault_path).resolve())):
        raise HTTPException(403, "Access denied")

    if not target.exists():
        raise HTTPException(404, "Path not found")

    items = []
    try:
        for item in sorted(target.iterdir()):
            # Skip hidden files/folders (starting with .)
            if item.name.startswith("."):
                continue
            stat = item.stat()
            items.append(VaultItem(
                name=item.name,
                path=str(item.relative_to(vault_path)),
                type="folder" if item.is_dir() else "file",
                size=stat.st_size if item.is_file() else None,
                modified=stat.st_mtime,
            ))
    except PermissionError:
        raise HTTPException(403, "Permission denied")

    return {"items": items, "current_path": path}


@app.post("/api/vault/open")
async def open_vault_item(data: dict):
    """Open file or folder with system default application."""
    import subprocess
    vault_path = get_vault_path()
    if not vault_path:
        raise HTTPException(400, "Vault not configured")

    item_path = data.get("path", "")
    if not item_path:
        raise HTTPException(400, "Path required")

    target = Path(vault_path) / item_path

    # Security check - must be within vault
    if not str(target.resolve()).startswith(str(Path(vault_path).resolve())):
        raise HTTPException(403, "Access denied")

    if not target.exists():
        raise HTTPException(404, "Path not found")

    try:
        # Use macOS 'open' command to open with default application
        subprocess.run(["open", str(target.resolve())], check=True)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(500, f"Failed to open: {e}")


@app.post("/api/vault/open-obsidian")
async def open_in_obsidian(data: dict = None):
    """Open vault or specific file in Obsidian app."""
    import subprocess
    vault_path = get_vault_path()
    if not vault_path:
        raise HTTPException(400, "Vault not configured")

    item_path = data.get("path", "") if data else ""
    target = Path(vault_path) / item_path if item_path else Path(vault_path)

    # Security check
    if not str(target.resolve()).startswith(str(Path(vault_path).resolve())):
        raise HTTPException(403, "Access denied")

    try:
        # Use 'open' with Obsidian app bundle ID
        # Try to open the specific file/folder with Obsidian
        if target.is_file():
            # For files, use obsidian:// url scheme via 'open'
            vault_name = Path(vault_path).name
            relative_path = str(target.relative_to(vault_path))
            url = f"obsidian://open?vault={vault_name}&file={relative_path}"
            subprocess.run(["open", url], check=True)
        else:
            # For folders, just open the vault
            subprocess.run(["open", "-a", "Obsidian", str(target.resolve())], check=True)
        return {"ok": True}
    except Exception as e:
        # Fallback: try to just open Obsidian app
        try:
            subprocess.run(["open", "-a", "Obsidian"], check=True)
            return {"ok": True}
        except:
            raise HTTPException(500, f"Failed to open Obsidian: {e}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("abo.main:app", host="127.0.0.1", port=8765, log_level="info")
