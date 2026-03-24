"""Canvas JSON persistence — React Flow nodes/edges stored in Ideas/."""
import json
import re
import uuid
from datetime import datetime
from pathlib import Path


def _ideas_dir(vault_path: str) -> Path:
    d = Path(vault_path) / "Ideas"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _canvas_path(vault_path: str, canvas_id: str) -> Path:
    return _ideas_dir(vault_path) / f"{canvas_id}.json"


def list_canvases(vault_path: str) -> list[dict]:
    ideas_dir = _ideas_dir(vault_path)
    canvases = []
    for f in sorted(ideas_dir.glob("*.json")):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            canvases.append({
                "id": f.stem,
                "name": data.get("name", f.stem),
                "node_count": len(data.get("nodes", [])),
                "updated_at": data.get("updated_at", ""),
            })
        except Exception:
            pass
    return canvases


def create_canvas(vault_path: str, name: str) -> dict:
    canvas_id = re.sub(r"[^\w-]", "_", name.lower())[:40] or str(uuid.uuid4())[:8]
    path = _canvas_path(vault_path, canvas_id)
    if path.exists():
        canvas_id = f"{canvas_id}-{uuid.uuid4().hex[:6]}"
        path = _canvas_path(vault_path, canvas_id)
    data = {
        "id": canvas_id,
        "name": name,
        "nodes": [],
        "edges": [],
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat(),
    }
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return data


def load_canvas(vault_path: str, canvas_id: str) -> dict | None:
    path = _canvas_path(vault_path, canvas_id)
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def save_canvas(vault_path: str, canvas_id: str, nodes: list, edges: list) -> dict:
    path = _canvas_path(vault_path, canvas_id)
    if path.exists():
        data = json.loads(path.read_text(encoding="utf-8"))
    else:
        data = {"id": canvas_id, "name": canvas_id, "created_at": datetime.now().isoformat()}
    data["nodes"] = nodes
    data["edges"] = edges
    data["updated_at"] = datetime.now().isoformat()
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return data
