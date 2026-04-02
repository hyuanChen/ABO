import { useState, useEffect, useRef } from "react";
import { Inbox, Sparkles, Wifi, WifiOff, Layers } from "lucide-react";
import { api } from "../../core/api";
import { useStore, FeedCard } from "../../core/store";
import CardView from "./CardView";

const WS_URL = "ws://127.0.0.1:8765/ws/feed";

// Load modules from API
async function loadModules(setFeedModules: (modules: any[]) => void) {
  try {
    const r = await api.get<{ modules: any[] }>("/api/modules");
    setFeedModules(r.modules);
  } catch {}
}

// Mock data generator for UI testing
function generateMockCards(): FeedCard[] {
  const now = Date.now();
  return [
    {
      id: "mock-1",
      title: "Attention Is All You Need: 从论文到工程的十年演进",
      module_id: "arxiv",
      category: "paper",
      created_at: now,
      summary: "Transformer架构自2017年问世以来，彻底改变了NLP领域。本文回顾了从原始论文到现代大语言模型的技术演进路径...",
      tags: ["transformer", "nlp", "llm"],
      score: 0.95,
      source_url: "",
      obsidian_path: "",
      metadata: {},
      read: false,
    },
    {
      id: "mock-2",
      title: "OpenAI 发布 GPT-5 技术报告：多模态推理能力大幅提升",
      module_id: "rss",
      category: "news",
      created_at: now - 3600000,
      summary: "最新发布的GPT-5在数学推理、代码生成和跨模态理解方面取得突破性进展，幻觉率降低40%...",
      tags: ["openai", "gpt5", "ai-news"],
      score: 0.88,
      source_url: "",
      obsidian_path: "",
      metadata: {},
      read: false,
    },
    {
      id: "mock-3",
      title: "研究灵感：将游戏化机制应用于学术阅读workflow",
      module_id: "folder_monitor",
      category: "idea",
      created_at: now - 7200000,
      summary: "如果把论文阅读设计成RPG经验值系统，每读一篇积累技能点，能否提升研究动力？关键设计要素包括...",
      tags: ["gamification", "workflow", "productivity"],
      score: 0.82,
      source_url: "",
      obsidian_path: "",
      metadata: {},
      read: false,
    },
    {
      id: "mock-4",
      title: "本周待办：完成NeurIPS 2024投稿论文的实验部分",
      module_id: "system",
      category: "todo",
      created_at: now - 10800000,
      summary: "距离截稿还有5天，需要完成：1) 补充对比实验 2) 修订Related Work 3) 检查格式要求...",
      tags: ["neurips", "deadline", "writing"],
      score: 1.0,
      source_url: "",
      obsidian_path: "",
      metadata: {},
      read: false,
    },
    {
      id: "mock-5",
      title: "DeepSeek-V3: 671B参数MoE模型训练成本仅557万美元",
      module_id: "arxiv",
      category: "paper",
      created_at: now - 14400000,
      summary: "DeepSeek团队展示了通过极致的工程优化，可以用极低成本训练出媲美GPT-4级别的大模型...",
      tags: ["deepseek", "moe", "efficiency"],
      score: 0.91,
      source_url: "",
      obsidian_path: "",
      metadata: {},
      read: false,
    },
    {
      id: "mock-6",
      title: "Claude 3.7 Sonnet 编程能力实测：与o3-mini对比",
      module_id: "rss",
      category: "news",
      created_at: now - 18000000,
      summary: "在SWE-bench和HumanEval基准测试中，Claude 3.7展现了出色的代码理解和生成能力，特别是在复杂重构任务上...",
      tags: ["claude", "coding", "benchmark"],
      score: 0.85,
      source_url: "",
      obsidian_path: "",
      metadata: {},
      read: false,
    },
  ];
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
  const [focusIdx, setFocusIdx] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [cardRatings, setCardRatings] = useState<Record<string, "like" | "neutral" | "dislike">>({});
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
    // Load modules first so FeedSidebar can display them
    loadModules(useStore.getState().setFeedModules);

    const params = activeModuleFilter
      ? `?module_id=${activeModuleFilter}&unread_only=true`
      : "?unread_only=true";
    api.get<{ cards: FeedCard[] }>(`/api/cards${params}`)
      .then((r) => {
        // Use mock data if no cards returned (for UI testing)
        const cards = r.cards?.length ? r.cards : generateMockCards();
        setFeedCards(cards);
        setFocusIdx(0);
      })
      .catch(() => {
        // Use mock data on error
        setFeedCards(generateMockCards());
        setFocusIdx(0);
      });

    api.get<Record<string, number>>("/api/cards/unread-counts")
      .then(setUnreadCounts)
      .catch(() => {});
  }, [activeModuleFilter, setFeedCards, setUnreadCounts]);

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
    return cards;
  }

  async function handleFeedback(cardId: string, action: string) {
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

          <div
            style={{
              marginTop: "24px",
              padding: "12px 16px",
              borderRadius: "var(--radius-lg)",
              background: isConnected ? "rgba(168, 230, 207, 0.1)" : "rgba(255, 183, 178, 0.1)",
              border: `1px solid ${isConnected ? "rgba(168, 230, 207, 0.3)" : "rgba(255, 183, 178, 0.3)"}`,
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <div
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: isConnected ? "#A8E6CF" : "#FFB7B2",
                boxShadow: isConnected ? "0 0 8px rgba(168, 230, 207, 0.8)" : "0 0 8px rgba(255, 183, 178, 0.8)",
              }}
            />
            <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: isConnected ? "#5BA88C" : "#D48984" }}>
              {isConnected ? "实时连接" : "已断开"}
            </span>
          </div>

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
