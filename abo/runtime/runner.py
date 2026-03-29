import os
from pathlib import Path

import frontmatter as fm

from ..sdk.base import Module
from ..sdk.types import Card
from ..preferences.engine import PreferenceEngine
from ..store.cards import CardStore
from .broadcaster import Broadcaster
from .. import config as cfg


class ModuleRunner:
    def __init__(self, store: CardStore, prefs: PreferenceEngine,
                 broadcaster: Broadcaster, vault_path: Path | None = None):
        self._store = store
        self._prefs = prefs
        self._broadcaster = broadcaster
        self._vault = vault_path or cfg.get_vault_path()

    async def run(self, module: Module) -> int:
        prefs = self._prefs.get_prefs_for_module(module.id)

        items = await module.fetch()
        cards = await module.process(items, prefs)

        threshold = self._prefs.threshold(module.id)
        cards = [c for c in cards if c.score >= threshold]

        max_n = self._prefs.max_cards(module.id)
        cards = sorted(cards, key=lambda c: c.score, reverse=True)[:max_n]

        count = 0
        for card in cards:
            card.module_id = module.id
            output = getattr(module, "output", ["obsidian", "ui"])

            if "obsidian" in output and card.obsidian_path:
                self._write_vault(card)

            self._store.save(card)

            if "ui" in output:
                await self._broadcaster.send_card(card)

            count += 1

        return count

    def _write_vault(self, card: Card):
        path = self._vault / card.obsidian_path
        path.parent.mkdir(parents=True, exist_ok=True)

        content = f"# {card.title}\n\n{card.summary}\n\n[原文链接]({card.source_url})\n"
        post = fm.Post(content=content)
        post.metadata.update({
            "abo-type": card.module_id,
            "relevance-score": round(card.score, 3),
            "tags": card.tags,
            **card.metadata,
        })

        tmp = path.with_suffix(".tmp")
        tmp.write_text(fm.dumps(post), encoding="utf-8")
        os.replace(tmp, path)
