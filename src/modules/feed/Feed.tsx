import { useState, useEffect, useRef } from "react";
import { Inbox, Sparkles, Wifi, WifiOff, Layers } from "lucide-react";
import { api } from "../../core/api";
import { useStore, FeedCard } from "../../core/store";
import CardView from "./CardView";
import { useToast } from "../../components/Toast";

const WS_URL = "ws://127.0.0.1:8765/ws/feed";

// Load modules from API
async function loadModules(setFeedModules: (modules: any[]) => void) {
  try {
    const r = await api.get<{ modules: any[] }>("/api/modules");
    setFeedModules(r.modules);
  } catch {}
}

type PaperTrackingKind = "all" | "keyword" | "followup";

function getPaperTrackingType(card: FeedCard): "keyword" | "followup" | null {
  const value = typeof card.metadata?.paper_tracking_type === "string"
    ? card.metadata.paper_tracking_type
    : "";
  if (value === "keyword" || value === "followup") {
    return value;
  }
  if (card.module_id === "arxiv-tracker") return "keyword";
  if (card.module_id === "semantic-scholar-tracker") return "followup";
  return null;
}

function getPaperTrackingLabels(card: FeedCard): string[] {
  const labels = Array.isArray(card.metadata?.paper_tracking_labels)
    ? card.metadata.paper_tracking_labels.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  if (labels.length > 0) return labels;

  const single = typeof card.metadata?.paper_tracking_label === "string"
    ? card.metadata.paper_tracking_label.trim()
    : "";
  if (single) return [single];

  const sourceTitle = typeof card.metadata?.source_paper_title === "string"
    ? card.metadata.source_paper_title.trim()
    : "";
  return sourceTitle ? [sourceTitle] : [];
}


// Module Filter Component - 模块筛选
function ModuleFilter({
  modules,
  activeFilter,
  onSelect,
  unreadCounts,
}: {
  modules: { id: string; name: string; enabled: boolean }[];
  activeFilter: string | null;
  onSelect: (id: string | null) => void;
  unreadCounts: Record<string, number>;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      {/* 全部模块按钮 */}
      <button
        onClick={() => onSelect(null)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          width: "100%",
          padding: "12px 16px",
          borderRadius: "var(--radius-lg)",
          background: activeFilter === null ? "var(--bg-card)" : "transparent",
          border: activeFilter === null ? "1px solid var(--border-light)" : "1px solid transparent",
          color: activeFilter === null ? "var(--color-primary)" : "var(--text-secondary)",
          fontSize: "0.9375rem",
          fontWeight: activeFilter === null ? 700 : 600,
          cursor: "pointer",
          transition: "all 0.2s ease",
          boxShadow: activeFilter === null ? "var(--shadow-soft)" : "none",
        }}
      >
        <Layers style={{ width: "18px", height: "18px" }} />
        <span style={{ flex: 1, textAlign: "left" }}>全部情报</span>
      </button>

      <div style={{ height: "1px", background: "var(--border-light)", margin: "8px 0" }} />

      {/* 各模块按钮 */}
      {modules.map((mod) => {
        const count = unreadCounts[mod.id] ?? 0;
        const isActive = activeFilter === mod.id;
        return (
          <button
            key={mod.id}
            onClick={() => onSelect(isActive ? null : mod.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              width: "100%",
              padding: "10px 14px",
              borderRadius: "var(--radius-md)",
              background: isActive ? "rgba(188, 164, 227, 0.15)" : "transparent",
              border: isActive ? "1px solid rgba(188, 164, 227, 0.3)" : "1px solid transparent",
              color: isActive ? "var(--color-primary)" : "var(--text-secondary)",
              fontSize: "0.875rem",
              fontWeight: isActive ? 600 : 500,
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            <div
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: mod.enabled ? "#A8E6CF" : "var(--text-muted)",
                flexShrink: 0,
              }}
            />
            <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {mod.name}
            </span>
            {count > 0 && (
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: "var(--radius-full)",
                  background: isActive ? "rgba(188, 164, 227, 0.25)" : "var(--bg-hover)",
                  color: isActive ? "var(--color-primary)" : "var(--text-muted)",
                  flexShrink: 0,
                }}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default function Feed() {
  const {
    feedCards, setFeedCards, prependCard,
    activeModuleFilter, setActiveModuleFilter,
    setUnreadCounts, feedModules, unreadCounts,
  } = useStore();
  const toast = useToast();
  const [focusIdx, setFocusIdx] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [cardRatings, setCardRatings] = useState<Record<string, "like" | "neutral" | "dislike">>({});
  const [paperTrackingFilter, setPaperTrackingFilter] = useState<PaperTrackingKind>("all");
  const [paperTrackingLabel, setPaperTrackingLabel] = useState("all");
  const wsRef = useRef<WebSocket | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Check mobile on mount and resize
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Initial load
  useEffect(() => {
    loadCards();
  }, [activeModuleFilter, setFeedCards, setUnreadCounts]);

  useEffect(() => {
    setPaperTrackingLabel("all");
    if (activeModuleFilter !== "arxiv-tracker" && activeModuleFilter !== "semantic-scholar-tracker") {
      setPaperTrackingFilter("all");
    }
  }, [activeModuleFilter]);

  useEffect(() => {
    setFocusIdx(0);
  }, [activeModuleFilter, paperTrackingFilter, paperTrackingLabel]);

  async function loadCards() {
    // Load modules first so FeedSidebar can display them
    loadModules(useStore.getState().setFeedModules);

    try {
      let cards: FeedCard[] = [];

      // Default: time-based sorting
      {
        const params = activeModuleFilter
          ? `?module_id=${activeModuleFilter}&unread_only=true`
          : "?unread_only=true";
        const r = await api.get<{ cards: FeedCard[] }>(`/api/cards${params}`);
        cards = r.cards || [];
      }

      setFeedCards(cards);
      setFocusIdx(0);
    } catch (e) {
      setFeedCards([]);
      setFocusIdx(0);
    }

    // Load unread counts
    api.get<Record<string, number>>("/api/cards/unread-counts")
      .then(setUnreadCounts)
      .catch(() => {});
  }

  // WebSocket
  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    ws.onopen = () => setIsConnected(true);
    ws.onclose = () => setIsConnected(false);
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "new_card") {
          prependCard(data.card as FeedCard);
          setFocusIdx(0);
        }
        // Phase 4: Handle reward notifications
        if (data.type === "reward_earned") {
          const store = useStore.getState();
          store.addReward({
            action: data.action,
            xp: data.rewards?.xp || 0,
            happiness_delta: data.rewards?.happiness_delta || 0,
            san_delta: data.rewards?.san_delta || 0,
            message: data.metadata?.card_title || "",
          });
        }
      } catch {}
    };
    ws.onerror = () => setIsConnected(false);
    wsRef.current = ws;
    return () => ws.close();
  }, [prependCard]);

  // Keyboard navigation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const visible = filteredCards();
      const card = visible[focusIdx];
      switch (e.key) {
        case "j": e.preventDefault(); setFocusIdx((i) => Math.min(i + 1, visible.length - 1)); break;
        case "k": e.preventDefault(); setFocusIdx((i) => Math.max(i - 1, 0)); break;
        case "l": if (card) { e.preventDefault(); handleRating(card.id, "like"); } break;
        case "n": if (card) { e.preventDefault(); handleRating(card.id, "neutral"); } break;
        case "d": if (card) { e.preventDefault(); handleRating(card.id, "dislike"); } break;
        case "s": if (card) { e.preventDefault(); handleFeedback(card.id, "save"); } break;
        case "x": if (card) { e.preventDefault(); handleFeedback(card.id, "skip"); } break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusIdx, feedCards, activeModuleFilter, cardRatings]);

  // Auto-scroll
  useEffect(() => {
    if (containerRef.current) {
      const focusedElement = containerRef.current.children[focusIdx + 1] as HTMLElement;
      if (focusedElement) {
        focusedElement.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
  }, [focusIdx]);

  function filteredCards(): FeedCard[] {
    let cards = feedCards;
    if (activeModuleFilter) {
      cards = cards.filter((c) => c.module_id === activeModuleFilter);
    }
    if (paperTrackingFilter !== "all") {
      cards = cards.filter((card) => getPaperTrackingType(card) === paperTrackingFilter);
    }
    if (paperTrackingLabel !== "all") {
      cards = cards.filter((card) => getPaperTrackingLabels(card).includes(paperTrackingLabel));
    }
    return cards;
  }

  async function savePaperCard(card: FeedCard): Promise<boolean> {
    const trackingType = getPaperTrackingType(card);
    if (!trackingType) {
      return true;
    }

    const payload = {
      paper: {
        id: card.id,
        title: card.title,
        summary: card.summary,
        score: card.score,
        tags: card.tags,
        source_url: card.source_url,
        metadata: card.metadata,
      },
      save_pdf: true,
      max_figures: 5,
    };

    try {
      if (trackingType === "keyword") {
        await api.post("/api/modules/arxiv-tracker/save-to-literature", payload);
      } else {
        await api.post("/api/modules/semantic-scholar/save-to-literature", payload);
      }
      toast.success("已保存到文献库", trackingType === "keyword" ? "关键词论文已入库" : "Follow Up 论文已入库");
      return true;
    } catch (error) {
      toast.error("保存失败", error instanceof Error ? error.message : "请检查文献库路径");
      return false;
    }
  }

  async function handleFeedback(cardId: string, action: string) {
    const card = feedCards.find((c) => c.id === cardId);
    if (action === "wiki") {
      // 摘录到 Wiki（情报库）
      if (card) {
        try {
          await api.post("/api/wiki/intel/ingest", {
            source_type: "card",
            source_id: card.id,
            source_content: JSON.stringify({
              id: card.id,
              title: card.title,
              summary: card.summary,
              tags: card.tags,
              source_url: card.source_url,
            }),
          });
        } catch {
          // ignore errors silently
        }
      }
      return;
    }

    if (action === "save" && card) {
      const saved = await savePaperCard(card);
      if (!saved) {
        return;
      }
    }

    await api.post(`/api/cards/${cardId}/feedback`, { action }).catch(() => {});
    if (action === "skip") {
      setFeedCards(feedCards.filter((c) => c.id !== cardId));
    }
  }

  async function handleRating(cardId: string, rating: "like" | "neutral" | "dislike") {
    // Update local state
    setCardRatings(prev => ({ ...prev, [cardId]: rating }));
    // Send to backend
    await api.post(`/api/cards/${cardId}/feedback`, { action: rating }).catch(() => {});
  }

  const visible = filteredCards();
  const scopedCards = activeModuleFilter
    ? feedCards.filter((card) => card.module_id === activeModuleFilter)
    : feedCards;
  const paperCards = scopedCards.filter((card) => getPaperTrackingType(card) !== null);
  const showPaperTrackingFilters =
    paperCards.length > 0 || activeModuleFilter === "arxiv-tracker" || activeModuleFilter === "semantic-scholar-tracker";
  const paperTrackingOptions = [
    {
      key: "keyword" as const,
      label: "关键词",
      count: paperCards.filter((card) => getPaperTrackingType(card) === "keyword").length,
    },
    {
      key: "followup" as const,
      label: "Follow Up",
      count: paperCards.filter((card) => getPaperTrackingType(card) === "followup").length,
    },
  ];
  const paperTrackingSubOptions = Array.from(
    new Set(
      paperCards
        .filter((card) => paperTrackingFilter === "all" || getPaperTrackingType(card) === paperTrackingFilter)
        .flatMap((card) => getPaperTrackingLabels(card))
    )
  );

  // Empty State - only when there are no cards at all (not due to filtering)
  if (feedCards.length === 0) {
    return (
      <div
        style={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "clamp(20px, 4vw, 32px)",
          color: "var(--text-muted)",
          padding: "clamp(24px, 5vw, 48px)",
          background: "linear-gradient(135deg, var(--bg-app) 0%, rgba(188, 164, 227, 0.05) 100%)",
        }}
      >
        <div style={{ position: "relative" }}>
          <div
            style={{
              width: "clamp(80px, 12vw, 100px)",
              height: "clamp(80px, 12vw, 100px)",
              borderRadius: "50%",
              background: "linear-gradient(135deg, rgba(188, 164, 227, 0.25), rgba(255, 183, 178, 0.2))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backdropFilter: "blur(12px)",
              border: "2px solid var(--border-light)",
              boxShadow: "var(--shadow-soft)",
            }}
          >
            <Inbox style={{ width: "clamp(36px, 5vw, 44px)", height: "clamp(36px, 5vw, 44px)", opacity: 0.6, color: "var(--color-primary)" }} aria-hidden />
          </div>
          <div style={{ position: "absolute", top: "-12px", right: "-12px", animation: "float 3s ease-in-out infinite" }}>
            <Sparkles style={{ width: "28px", height: "28px", color: "var(--color-secondary)" }} aria-hidden />
          </div>
        </div>

        <div style={{ textAlign: "center", maxWidth: "400px" }}>
          <h2 style={{ fontFamily: "'M PLUS Rounded 1c', sans-serif", fontSize: "clamp(1.25rem, 3vw, 1.5rem)", fontWeight: 700, color: "var(--text-main)", marginBottom: "12px" }}>
            今日 Feed 已清空
          </h2>
          <p style={{ fontSize: "clamp(0.9375rem, 2vw, 1rem)", color: "var(--text-muted)", lineHeight: 1.6 }}>
            所有情报已处理完毕，休息一下吧 ✨
          </p>
        </div>

        {!isMobile && (
          <div style={{ display: "flex", gap: "10px", padding: "16px 24px", borderRadius: "var(--radius-xl)", background: "var(--bg-card)", border: "1px solid var(--border-light)", boxShadow: "var(--shadow-soft)", flexWrap: "wrap", justifyContent: "center" }}>
            {["J ↓", "K ↑", "S 保存", "X 跳过", "F 精华", "D 深度"].map((hint) => (
              <span key={hint} style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-secondary)", padding: "6px 12px", borderRadius: "8px", background: "var(--bg-hover)", fontFamily: "monospace" }}>
                {hint}
              </span>
            ))}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 20px", borderRadius: "var(--radius-full)", background: isConnected ? "rgba(168, 230, 207, 0.2)" : "rgba(255, 183, 178, 0.2)", border: `1px solid ${isConnected ? "rgba(168, 230, 207, 0.4)" : "rgba(255, 183, 178, 0.4)"}` }}>
          {isConnected ? <Wifi style={{ width: "16px", height: "16px", color: "#5BA88C" }} /> : <WifiOff style={{ width: "16px", height: "16px", color: "#D48984" }} />}
          <span style={{ fontSize: "0.875rem", fontWeight: 600, color: isConnected ? "#5BA88C" : "#D48984" }}>
            {isConnected ? "实时连接正常" : "连接已断开"}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ height: "100%", overflowY: "auto", background: "var(--bg-app)" }}>
      <div style={{ maxWidth: "min(1100px, 95vw)", margin: "0 auto", padding: "clamp(20px, 3vw, 32px) clamp(16px, 3vw, 32px)", display: "flex", gap: "clamp(24px, 3vw, 40px)" }}>
        {/* Left Sidebar - Module Filter */}
        <div style={{ width: "180px", flexShrink: 0, position: "sticky", top: "20px", height: "fit-content" }}>
          <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "12px", paddingLeft: "8px" }}>
            情报模块
          </div>
          <ModuleFilter
            modules={feedModules}
            activeFilter={activeModuleFilter}
            onSelect={setActiveModuleFilter}
            unreadCounts={unreadCounts}
          />

          {!isMobile && (
            <div style={{ marginTop: "24px", padding: "16px", borderRadius: "var(--radius-lg)", background: "var(--bg-card)", border: "1px solid var(--border-light)" }}>
              <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "10px", fontWeight: 600 }}>快捷键</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {["J ↓ 下一条", "K ↑ 上一条", "L 👍 喜欢", "N 😐 中立", "D 👎 不喜欢", "S 💾 保存", "X ⏭ 跳过"].map((hint) => (
                  <span key={hint} style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", fontFamily: "monospace" }}>
                    {hint}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Main Content - Cards */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "clamp(16px, 2vw, 24px)" }}>
          {/* Header Section */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "var(--radius-md)",
                  background: "linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 4px 16px rgba(188, 164, 227, 0.35)",
                  flexShrink: 0,
                }}
              >
                <Layers style={{ width: "24px", height: "24px", color: "white" }} />
              </div>
              <div>
                <h1 style={{ fontFamily: "'M PLUS Rounded 1c', sans-serif", fontSize: "clamp(1.25rem, 2.5vw, 1.5rem)", fontWeight: 700, color: "var(--text-main)", marginBottom: "4px" }}>
                  情报 Feed
                </h1>
                <p style={{ fontSize: "0.9375rem", color: "var(--text-muted)" }}>
                  {visible.length} 条待处理 · 实时推送
                </p>
              </div>
            </div>
          </div>

          {showPaperTrackingFilters && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                padding: "16px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-light)",
                background: "var(--bg-card)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-main)" }}>
                  论文追踪
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setPaperTrackingFilter("all");
                    setPaperTrackingLabel("all");
                  }}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "8px",
                    border: `1px solid ${paperTrackingFilter === "all" ? "var(--color-primary)" : "var(--border-light)"}`,
                    background: paperTrackingFilter === "all" ? "rgba(188, 164, 227, 0.12)" : "var(--bg-app)",
                    color: paperTrackingFilter === "all" ? "var(--color-primary)" : "var(--text-secondary)",
                    fontSize: "0.8125rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  全部
                </button>
                {paperTrackingOptions.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => {
                      setPaperTrackingFilter(option.key);
                      setPaperTrackingLabel("all");
                    }}
                    style={{
                      padding: "6px 12px",
                      borderRadius: "8px",
                      border: `1px solid ${paperTrackingFilter === option.key ? "var(--color-primary)" : "var(--border-light)"}`,
                      background: paperTrackingFilter === option.key ? "rgba(188, 164, 227, 0.12)" : "var(--bg-app)",
                      color: paperTrackingFilter === option.key ? "var(--color-primary)" : "var(--text-secondary)",
                      fontSize: "0.8125rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {option.label} {option.count > 0 ? `(${option.count})` : ""}
                  </button>
                ))}
              </div>

              {paperTrackingFilter !== "all" && paperTrackingSubOptions.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => setPaperTrackingLabel("all")}
                    style={{
                      padding: "5px 10px",
                      borderRadius: "999px",
                      border: `1px solid ${paperTrackingLabel === "all" ? "var(--color-primary)" : "var(--border-light)"}`,
                      background: paperTrackingLabel === "all" ? "rgba(188, 164, 227, 0.12)" : "var(--bg-app)",
                      color: paperTrackingLabel === "all" ? "var(--color-primary)" : "var(--text-secondary)",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    全部子项
                  </button>
                  {paperTrackingSubOptions.map((label) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setPaperTrackingLabel(label)}
                      style={{
                        padding: "5px 10px",
                        borderRadius: "999px",
                        border: `1px solid ${paperTrackingLabel === label ? "var(--color-primary)" : "var(--border-light)"}`,
                        background: paperTrackingLabel === label ? "rgba(188, 164, 227, 0.12)" : "var(--bg-app)",
                        color: paperTrackingLabel === label ? "var(--color-primary)" : "var(--text-secondary)",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: "clamp(12px, 1.5vw, 16px)" }}>
            {visible.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-muted)" }}>
                <p style={{ fontSize: "1rem", marginBottom: "8px" }}>
                  该分类下暂无情报
                </p>
                <p style={{ fontSize: "0.875rem", opacity: 0.7 }}>
                  请选择其他分类
                </p>
              </div>
            ) : (
              visible.map((card, i) => (
                <CardView
                  key={card.id}
                  card={card}
                  focused={i === focusIdx}
                  onClick={() => setFocusIdx(i)}
                  onFeedback={(action) => handleFeedback(card.id, action)}
                  onRating={(rating) => handleRating(card.id, rating)}
                  userRating={cardRatings[card.id]}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
