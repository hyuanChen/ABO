"""Task system — store tasks in Journal/YYYY-MM-DD.md frontmatter."""
import uuid
from datetime import date
from pathlib import Path
from typing import Any

import frontmatter

from abo.game.skills import award_xp
from abo.game.energy import get_multiplier, log_energy_event
from abo.game.state import load_state


def _today_path(vault_path: str) -> Path:
    return Path(vault_path) / "Journal" / f"{date.today().isoformat()}.md"


def _load_journal(vault_path: str) -> frontmatter.Post:
    path = _today_path(vault_path)
    if not path.exists():
        post = frontmatter.Post(
            "",
            **{
                "abo-type": "journal",
                "date": date.today().isoformat(),
                "tasks": [],
            },
        )
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(frontmatter.dumps(post), encoding="utf-8")
        return post
    return frontmatter.load(str(path))


def _save_journal(vault_path: str, post: frontmatter.Post) -> None:
    _today_path(vault_path).write_text(frontmatter.dumps(post), encoding="utf-8")


def get_today_tasks(vault_path: str) -> list[dict]:
    post = _load_journal(vault_path)
    return post.get("tasks", [])


def add_task(vault_path: str, label: str, xp: int = 20, skill: str | None = None) -> dict:
    post = _load_journal(vault_path)
    tasks: list[Any] = post.get("tasks", [])
    task = {"id": str(uuid.uuid4())[:8], "label": label, "done": False, "xp": xp, "skill": skill}
    tasks.append(task)
    post["tasks"] = tasks
    _save_journal(vault_path, post)
    return task


def complete_task(vault_path: str, task_id: str) -> dict | None:
    """Mark task done, award XP (with energy multiplier), cost energy."""
    post = _load_journal(vault_path)
    tasks: list[Any] = post.get("tasks", [])

    target = next((t for t in tasks if t["id"] == task_id), None)
    if not target or target.get("done"):
        return None

    target["done"] = True
    post["tasks"] = tasks
    _save_journal(vault_path, post)

    # Award XP with energy multiplier
    state = load_state(vault_path)
    energy = state["energy"]
    multiplier = get_multiplier(energy["current"], energy["max"])
    skill = target.get("skill")
    xp = int(target.get("xp", 20) * multiplier)
    if skill:
        award_xp(vault_path, skill, xp)

    # Deduct energy for the task
    log_energy_event(vault_path, "focus")

    return {**target, "xp_awarded": xp, "multiplier": multiplier}


def delete_task(vault_path: str, task_id: str) -> bool:
    post = _load_journal(vault_path)
    tasks: list[Any] = post.get("tasks", [])
    new_tasks = [t for t in tasks if t["id"] != task_id]
    if len(new_tasks) == len(tasks):
        return False
    post["tasks"] = new_tasks
    _save_journal(vault_path, post)
    return True
