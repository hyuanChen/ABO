import { useEffect, useRef, useState } from "react";
import { Inbox } from "lucide-react";
import { api } from "../../core/api";
import { useStore, FeedCard } from "../../core/store";
import CardView from "./CardView";

const WS_URL = "ws://127.0.0.1:8765/ws/feed";

export default function Feed() {
  const {
    feedCards, setFeedCards, prependCard,
    activeModuleFilter, setUnreadCounts,
  } = useStore();
  const [focusIdx, setFocusIdx] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);

  // 初始加载
  useEffect(() => {
    const params = activeModuleFilter
      ? `?module_id=${activeModuleFilter}&unread_only=true`
      : "?unread_only=true";
    api.get<{ cards: FeedCard[] }>(`/api/cards${params}`)
      .then((r) => { setFeedCards(r.cards); setFocusIdx(0); })
      .catch(() => {});

    api.get<Record<string, number>>("/api/cards/unread-counts")
      .then(setUnreadCounts)
      .catch(() => {});
  }, [activeModuleFilter, setFeedCards, setUnreadCounts]);

  // WebSocket 实时推送
  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "new_card") {
          prependCard(data.card as FeedCard);
          setFocusIdx(0);
        }
      } catch {}
    };
    ws.onerror = () => {};
    wsRef.current = ws;
    return () => ws.close();
  }, [prependCard]);

  // 键盘导航
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const visible = filteredCards();
      const card = visible[focusIdx];
      switch (e.key) {
        case "j": e.preventDefault(); setFocusIdx((i) => Math.min(i + 1, visible.length - 1)); break;
        case "k": e.preventDefault(); setFocusIdx((i) => Math.max(i - 1, 0)); break;
        case "s": if (card) { e.preventDefault(); handleFeedback(card.id, "save"); } break;
        case "x": if (card) { e.preventDefault(); handleFeedback(card.id, "skip"); } break;
        case "f": if (card) { e.preventDefault(); handleFeedback(card.id, "star"); } break;
        case "d": if (card) { e.preventDefault(); handleFeedback(card.id, "deep_dive"); } break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusIdx, feedCards, activeModuleFilter]);

  function filteredCards(): FeedCard[] {
    if (!activeModuleFilter) return feedCards;
    return feedCards.filter((c) => c.module_id === activeModuleFilter);
  }

  async function handleFeedback(cardId: string, action: string) {
    await api.post(`/api/cards/${cardId}/feedback`, { action }).catch(() => {});
    if (action === "skip") {
      setFeedCards(feedCards.filter((c) => c.id !== cardId));
    }
  }

  const visible = filteredCards();

  if (visible.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 text-slate-400 dark:text-slate-600">
        <Inbox className="w-12 h-12" aria-hidden />
        <p className="text-sm">今日 Feed 已清空</p>
        <p className="text-xs">J/K 导航 · S 保存 · X 跳过 · F 精华 · D 深度</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-6 flex flex-col gap-3">
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-1">
          {visible.length} 条未读 · J/K 导航 · S 保存 · X 跳过 · F 精华 · D 深度
        </p>
        {visible.map((card, i) => (
          <CardView
            key={card.id}
            card={card}
            focused={i === focusIdx}
            onClick={() => setFocusIdx(i)}
            onFeedback={(action) => handleFeedback(card.id, action)}
          />
        ))}
      </div>
    </div>
  );
}
