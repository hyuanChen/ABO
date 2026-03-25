"""Daily journal R/W — writes to vault Journal/YYYY-MM-DD.md."""
from datetime import date
from pathlib import Path


def _today_path(vault_path: str) -> Path:
    journal_dir = Path(vault_path) / "Journal"
    journal_dir.mkdir(parents=True, exist_ok=True)
    return journal_dir / f"{date.today().isoformat()}.md"


def read_today(vault_path: str) -> dict:
    path = _today_path(vault_path)
    if path.exists():
        content = path.read_text(encoding="utf-8")
        return {"date": date.today().isoformat(), "content": content, "exists": True}
    # Return template
    template = f"# {date.today().isoformat()}\n\n## 今日目标\n\n\n## 进展记录\n\n\n## 明日计划\n\n"
    return {"date": date.today().isoformat(), "content": template, "exists": False}


def write_today(vault_path: str, content: str) -> dict:
    path = _today_path(vault_path)
    path.write_text(content, encoding="utf-8")
    return {"date": date.today().isoformat(), "saved": True}
