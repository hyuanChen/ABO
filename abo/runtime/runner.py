from pathlib import Path

from ..sdk.base import Module
from ..sdk.types import Card
from ..preferences.engine import PreferenceEngine
from ..store.cards import CardStore
from ..store.papers import PaperStore
from .broadcaster import Broadcaster
from .. import config as cfg
from ..vault.unified_entry import UnifiedVaultEntry, entry_type_from_metadata, first_non_empty, normalize_string_list
from ..vault.writer import write_unified_note


class ModuleRunner:
    def __init__(self, store: CardStore, prefs: PreferenceEngine,
                 broadcaster: Broadcaster, vault_path: Path | None = None,
                 paper_store: PaperStore | None = None):
        self._store = store
        self._prefs = prefs
        self._broadcaster = broadcaster
        self._vault = vault_path or cfg.get_vault_path()
        self._paper_store = paper_store

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

            if "obsidian" in output and card.obsidian_path and not self._should_skip_vault_write(card):
                card = await self._write_vault(card)

            self._store.save(card)
            if self._paper_store:
                self._paper_store.upsert_from_card(card)

            if "ui" in output and self._store.is_unread(card.id):
                await self._broadcaster.send_card(card)

            count += 1

        return count

    def _should_skip_vault_write(self, card: Card) -> bool:
        return self._is_paper_tracking_card(card)

    async def _write_vault(self, card: Card) -> Card:
        self._write_generic_vault(card)
        return card

    def _is_paper_tracking_card(self, card: Card) -> bool:
        if card.module_id == "arxiv-tracker":
            return True
        if card.module_id == "semantic-scholar-tracker":
            return True
        tracking_type = first_non_empty(card.metadata.get("paper_tracking_type"))
        return tracking_type in {"keyword", "followup"}

    def _write_generic_vault(self, card: Card):
        path = self._vault / card.obsidian_path

        # Build content with abstract if available
        abstract = card.metadata.get("abstract", "")
        contribution = card.metadata.get("contribution", "")

        content_parts = [f"# {card.title}\n"]

        if contribution:
            content_parts.append(f"**核心创新**: {contribution}\n")

        content_parts.append(f"{card.summary}\n")

        if abstract:
            content_parts.append("## 摘要\n")
            content_parts.append(f"{abstract}\n")

        content_parts.append(f"[原文链接]({card.source_url})")

        content = "\n".join(content_parts)
        entry = UnifiedVaultEntry(
            entry_id=first_non_empty(
                card.metadata.get("entry-id"),
                card.metadata.get("content_id"),
                card.metadata.get("note_id"),
                card.metadata.get("paper_id"),
                card.metadata.get("arxiv_id"),
                card.metadata.get("dynamic_id"),
                card.metadata.get("bvid"),
                card.id,
            ),
            entry_type=entry_type_from_metadata(card.metadata, default="intelligence-card"),
            title=card.title,
            summary=card.summary,
            source_url=card.source_url,
            source_platform=first_non_empty(card.metadata.get("platform")),
            source_module=card.module_id,
            author=first_non_empty(
                card.metadata.get("author"),
                card.metadata.get("author_name"),
                card.metadata.get("up_name"),
                card.metadata.get("creator"),
                card.metadata.get("creator_name"),
                card.metadata.get("user_nickname"),
            ),
            author_id=first_non_empty(
                card.metadata.get("author_id"),
                card.metadata.get("user_id"),
                card.metadata.get("up_uid"),
                card.metadata.get("mid"),
            ),
            authors=normalize_string_list(card.metadata.get("authors")),
            published=first_non_empty(
                card.metadata.get("published"),
                card.metadata.get("created_at"),
                card.metadata.get("publish_time"),
                card.metadata.get("display_time"),
            ),
            tags=card.tags,
            score=card.score,
            obsidian_path=card.obsidian_path,
            metadata={
                "abo-type": card.module_id,
                "relevance-score": round(card.score, 3),
                **{k: v for k, v in card.metadata.items() if k != "abstract"},
            },
        )
        card.metadata = {
            **card.metadata,
            **entry.to_metadata(),
            "relevance-score": round(card.score, 3),
        }
        write_unified_note(path, entry, content)
