import hashlib
import json
from datetime import datetime
from pathlib import Path

from abo.sdk import Module, Item, Card, agent_json
from abo.storage_paths import get_preferences_path, resolve_app_data_file


class FolderMonitor(Module):
    id       = "folder-monitor"
    name     = "文件夹监控"
    schedule = "*/5 * * * *"
    icon     = "folder-open"
    output   = ["obsidian", "ui"]

    _STATE_PATH = resolve_app_data_file("folder_monitor_seen.json")

    def _load_seen(self) -> set[str]:
        if self._STATE_PATH.exists():
            return set(json.loads(self._STATE_PATH.read_text()))
        return set()

    def _save_seen(self, seen: set[str]):
        self._STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
        self._STATE_PATH.write_text(json.dumps(list(seen)))

    async def fetch(self) -> list[Item]:
        prefs_path = get_preferences_path()
        watch_dirs: list[str] = [str(Path.home() / "Downloads")]
        if prefs_path.exists():
            data = json.loads(prefs_path.read_text(encoding="utf-8"))
            watch_dirs = data.get("modules", {}).get("folder-monitor", {}).get(
                "watch_dirs", watch_dirs
            )

        seen = self._load_seen()
        new_items = []

        for dir_str in watch_dirs:
            d = Path(dir_str)
            if not d.exists():
                continue
            for f in d.glob("*.pdf"):
                fid = hashlib.md5(str(f).encode()).hexdigest()
                if fid in seen:
                    continue
                seen.add(fid)
                try:
                    from pypdf import PdfReader
                    reader = PdfReader(str(f))
                    text = "\n".join(
                        page.extract_text() or "" for page in reader.pages[:5]
                    )
                    new_items.append(Item(
                        id=fid,
                        raw={"path": str(f), "text": text[:3000], "filename": f.name}
                    ))
                except Exception:
                    pass

        self._save_seen(seen)
        return new_items

    async def process(self, items: list[Item], prefs: dict) -> list[Card]:
        cards = []
        for item in items:
            p = item.raw
            prompt = (
                f"分析以下 PDF 内容，返回 JSON：\n"
                f'{{"score":6,"title":"<文档标题>","summary":"<100字以内中文摘要>",'
                f'"type":"paper|report|notes|other","tags":["<tag1>","<tag2>"]}}\n\n'
                f"文件名：{p['filename']}\n\n内容（前3000字）：{p['text']}"
            )
            result = await agent_json(prompt, prefs=prefs)

            date_str = datetime.now().strftime("%Y-%m-%d")
            safe_name = Path(p["filename"]).stem[:50].replace(" ", "-")
            cards.append(Card(
                id=item.id,
                title=result.get("title", p["filename"]),
                summary=result.get("summary", ""),
                score=result.get("score", 6) / 10,
                tags=result.get("tags", []),
                source_url=f"file://{p['path']}",
                obsidian_path=f"Literature/{date_str}-{safe_name}.md",
                metadata={
                    "source-file": p["path"],
                    "doc-type": result.get("type", "unknown"),
                },
            ))
        return cards
