from __future__ import annotations

from threading import Lock

from ..store.cards import CardStore


_hidden_cards_lock = Lock()
_temporarily_hidden_cards: dict[str, str] = {}


def clear_all_temporarily_hidden_cards() -> None:
    with _hidden_cards_lock:
        _temporarily_hidden_cards.clear()


def temporarily_hide_cards(store: CardStore, card_ids: list[str]) -> list[str]:
    hidden_ids: list[str] = []
    seen_ids: set[str] = set()

    with _hidden_cards_lock:
        for raw_card_id in card_ids:
            card_id = str(raw_card_id or "").strip()
            if not card_id or card_id in seen_ids:
                continue
            seen_ids.add(card_id)

            card = store.get(card_id)
            if not card:
                continue

            _temporarily_hidden_cards[card_id] = str(card.module_id or "").strip()
            hidden_ids.append(card_id)

    return hidden_ids


def clear_temporarily_hidden_cards_for_module(module_id: str) -> list[str]:
    normalized_module_id = str(module_id or "").strip()
    if not normalized_module_id:
        return []

    with _hidden_cards_lock:
        removed_ids = [
            card_id
            for card_id, hidden_module_id in _temporarily_hidden_cards.items()
            if hidden_module_id == normalized_module_id
        ]
        for card_id in removed_ids:
            _temporarily_hidden_cards.pop(card_id, None)

    return removed_ids


def is_card_temporarily_hidden(card_id: str) -> bool:
    normalized_card_id = str(card_id or "").strip()
    if not normalized_card_id:
        return False
    with _hidden_cards_lock:
        return normalized_card_id in _temporarily_hidden_cards


def filter_temporarily_hidden_card_ids(card_ids: list[str]) -> list[str]:
    if not card_ids:
        return []
    with _hidden_cards_lock:
        hidden_ids = set(_temporarily_hidden_cards)
    return [
        card_id
        for card_id in card_ids
        if str(card_id or "").strip() not in hidden_ids
    ]


def temporarily_hidden_unread_counts(store: CardStore) -> dict[str, int]:
    with _hidden_cards_lock:
        hidden_snapshot = dict(_temporarily_hidden_cards)

    counts: dict[str, int] = {}
    for card_id, module_id in hidden_snapshot.items():
        if not module_id or not store.is_unread(card_id):
            continue
        counts[module_id] = counts.get(module_id, 0) + 1
    return counts
