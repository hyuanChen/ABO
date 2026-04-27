import { ReactNode, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, ClipboardList, ExternalLink, Newspaper, Plus, RefreshCw } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Card } from "../../components/Layout";
import { api } from "../../core/api";
import { useToast } from "../../components/Toast";
import { useStore, type ActiveTab } from "../../core/store";

interface KeywordPreference {
  keyword: string;
  score: number;
  count: number;
}

interface IntelCard {
  id: string;
  module_id: string;
  title: string;
  summary: string;
  tags: string[];
  score: number;
  source_url?: string;
  created_at?: number;
}

interface TodoItem {
  id?: string;
  text: string;
  priority?: string;
  reason?: string;
  evidence?: string[];
  source?: string;
  done?: boolean;
  started_at?: number | null;
  duration_ms?: number | null;
  generated_at?: string;
}

interface DailyBriefingData {
  date: string;
  summary: string;
  focus: string;
  preferred_keywords: KeywordPreference[];
  suggested_todos: TodoItem[];
  intel_cards: IntelCard[];
  generated_at: string;
}

interface Props {
  briefing?: DailyBriefingData | null;
  onRefresh: () => void;
  currentTodos?: TodoItem[];
  onTodosChange?: (todos: TodoItem[]) => void;
  collapsible?: boolean;
  defaultExpanded?: boolean;
  summary?: ReactNode;
}

const MODULE_TAB_MAP: Array<[string, ActiveTab]> = [
  ["xiaohongshu", "xiaohongshu"],
  ["bilibili", "bilibili"],
  ["arxiv", "arxiv"],
  ["semantic-scholar", "arxiv"],
  ["semantic_scholar", "arxiv"],
  ["zhihu", "modules"],
  ["xiaoyuzhou", "modules"],
  ["podcast", "modules"],
  ["rss", "modules"],
];

function formatTimestamp(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function priorityStyle(priority?: string) {
  if (priority === "high") {
    return {
      color: "#C34F4F",
      bg: "color-mix(in srgb, #C34F4F 14%, var(--bg-card))",
      border: "color-mix(in srgb, #C34F4F 28%, transparent)",
    };
  }
  if (priority === "low") {
    return {
      color: "#4F78C3",
      bg: "color-mix(in srgb, #4F78C3 14%, var(--bg-card))",
      border: "color-mix(in srgb, #4F78C3 28%, transparent)",
    };
  }
  return {
    color: "#A67A24",
    bg: "color-mix(in srgb, #E0B45D 18%, var(--bg-card))",
    border: "color-mix(in srgb, #E0B45D 32%, transparent)",
  };
}

function surface(accent: string, amount = 14) {
  return `color-mix(in srgb, ${accent} ${amount}%, var(--bg-card))`;
}

function border(accent: string, amount = 28) {
  return `color-mix(in srgb, ${accent} ${amount}%, transparent)`;
}

export default function IntelligencePlanner({
  briefing,
  onRefresh,
  currentTodos = [],
  onTodosChange,
  collapsible = false,
  defaultExpanded = true,
  summary,
}: Props) {
  const [generating, setGenerating] = useState(false);
  const [addingTodoText, setAddingTodoText] = useState<string | null>(null);
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  const toast = useToast();
  const setActiveTab = useStore((s) => s.setActiveTab);

  const intelCards = useMemo(() => briefing?.intel_cards ?? [], [briefing?.intel_cards]);
  const topKeywords = useMemo(() => (briefing?.preferred_keywords ?? []).slice(0, 6), [briefing?.preferred_keywords]);
  const suggestedTodos = briefing?.suggested_todos ?? [];
  const existingTodoTexts = useMemo(
    () => new Set(currentTodos.map((todo) => todo.text.trim().toLowerCase()).filter(Boolean)),
    [currentTodos]
  );

  async function generatePlan() {
    if (intelCards.length === 0) {
      toast.error("今天还没有可用情报");
      return;
    }

    setGenerating(true);
    try {
      const result = await api.post<{ created_count: number }>("/api/profile/daily-briefing/generate", {});
      toast.success("情报消化任务已更新", `生成 ${result.created_count} 条`);
      onRefresh();
    } catch (error) {
      console.error(error);
      toast.error("情报消化生成失败");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSourceJump(card: IntelCard) {
    const targetUrl = String(card.source_url || "").trim();
    if (targetUrl) {
      try {
        await openUrl(targetUrl);
        return;
      } catch {
        window.open(targetUrl, "_blank", "noopener,noreferrer");
        return;
      }
    }

    const matched = MODULE_TAB_MAP.find(([key]) => card.module_id.includes(key));
    setActiveTab(matched?.[1] ?? "modules");
    toast.success("已跳转", `前往 ${card.module_id}`);
  }

  async function handleAddToToday(todo: TodoItem) {
    const normalizedText = todo.text.trim().toLowerCase();
    if (!normalizedText) return;
    if (existingTodoTexts.has(normalizedText)) {
      toast.info("已存在", "这条任务已经在今日待办里了");
      return;
    }

    const nextTodos: TodoItem[] = [
      ...currentTodos,
      {
        id: crypto.randomUUID(),
        text: todo.text.trim(),
        done: false,
        started_at: null,
        duration_ms: null,
        source: "agent",
        priority: todo.priority ?? "medium",
        reason: todo.reason ?? "",
        evidence: todo.evidence ?? [],
        generated_at: new Date().toISOString(),
      },
    ];

    setAddingTodoText(todo.text);
    try {
      await api.post("/api/profile/todos", { todos: nextTodos });
      onTodosChange?.(nextTodos);
      toast.success("已写入今日待办", todo.text);
    } catch (error) {
      console.error(error);
      toast.error("写入待办失败");
    } finally {
      setAddingTodoText(null);
    }
  }

  function toggleSources() {
    setSourcesExpanded((current) => !current);
  }

  return (
    <Card
      title="情报消化"
      icon={<Newspaper style={{ width: "18px", height: "18px", color: "var(--color-accent)" }} />}
      collapsible={collapsible}
      defaultExpanded={defaultExpanded}
      summary={summary}
      style={{ marginTop: "clamp(20px, 3vw, 28px)" }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <section
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            padding: "clamp(12px, 1.8vw, 16px)",
            borderRadius: "8px",
            background: `linear-gradient(135deg, ${surface("var(--color-accent)", 16)}, ${surface("var(--color-primary)", 10)})`,
            border: `1px solid ${border("var(--color-accent)", 26)}`,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center", marginBottom: "8px" }}>
              <span
                style={{
                  padding: "4px 10px",
                  borderRadius: "999px",
                  background: surface("var(--color-accent)", 20),
                  border: `1px solid ${border("var(--color-accent)", 32)}`,
                  color: "var(--text-secondary)",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                }}
              >
                今日情报 {intelCards.length} 条
              </span>
              {briefing?.generated_at && (
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  更新于 {formatTimestamp(briefing.generated_at)}
                </span>
              )}
            </div>

            <div
              style={{
                fontSize: "clamp(1.15rem, 1.8vw, 1.55rem)",
                fontWeight: 800,
                color: "var(--text-main)",
                lineHeight: 1.35,
                marginBottom: "6px",
              }}
            >
              {briefing?.focus || "先从今天最值得消化的一条线开始"}
            </div>

            <p
              style={{
                fontSize: "clamp(0.9rem, 1.3vw, 1rem)",
                color: "var(--text-secondary)",
                lineHeight: 1.65,
                maxWidth: "72ch",
              }}
            >
              {briefing?.summary || "系统会基于今天的情报流，自动收敛出值得你当下处理的问题、线索和消化动作。"}
            </p>

            {topKeywords.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "10px" }}>
                {topKeywords.map((item) => (
                  <span
                    key={item.keyword}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "5px 10px",
                      borderRadius: "999px",
                      background: surface("var(--color-success)", 18),
                      border: `1px solid ${border("var(--color-success)", 28)}`,
                      color: "var(--text-secondary)",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                    }}
                  >
                    {item.keyword}
                    <span style={{ color: "var(--color-success-text)", fontFamily: "monospace" }}>
                      +{item.score.toFixed(2)}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "8px" }}>
            <div style={{ padding: "8px 10px", borderRadius: "8px", background: "var(--bg-hover)" }}>
              <div style={{ fontSize: "0.6875rem", color: "var(--text-light)", marginBottom: "4px" }}>情报</div>
              <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "var(--text-main)" }}>{intelCards.length}</div>
            </div>
            <div style={{ padding: "8px 10px", borderRadius: "8px", background: "var(--bg-hover)" }}>
              <div style={{ fontSize: "0.6875rem", color: "var(--text-light)", marginBottom: "4px" }}>任务</div>
              <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "var(--text-main)" }}>{suggestedTodos.length}</div>
            </div>
            <div style={{ padding: "8px 10px", borderRadius: "8px", background: "var(--bg-hover)" }}>
              <div style={{ fontSize: "0.6875rem", color: "var(--text-light)", marginBottom: "4px" }}>状态</div>
              <div style={{ fontSize: "0.9rem", fontWeight: 800, color: "var(--text-main)" }}>
                {briefing?.summary ? "已生成" : "待整理"}
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              padding: "10px 12px",
              borderRadius: "8px",
              background: surface("var(--color-primary-light)", 10),
              border: "1px solid var(--border-light)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={toggleSources}
                style={{
                  flex: 1,
                  minWidth: "240px",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "10px",
                  padding: 0,
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <div style={{ paddingTop: "2px" }}>
                  {sourcesExpanded
                    ? <ChevronDown style={{ width: "15px", height: "15px", color: "var(--text-muted)" }} />
                    : <ChevronRight style={{ width: "15px", height: "15px", color: "var(--text-muted)" }} />
                  }
                </div>
                <div>
                  <div style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-main)", marginBottom: "4px" }}>
                    今日情报源
                  </div>
                  <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
                    {sourcesExpanded
                      ? "点右侧追源可打开原文；没有原链接时会跳到对应模块。"
                      : `点击展开 ${Math.min(intelCards.length, 6)} 条今日情报`}
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={generatePlan}
                disabled={generating || intelCards.length === 0}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  minHeight: "38px",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "none",
                  background: intelCards.length > 0
                    ? "linear-gradient(135deg, var(--color-accent), color-mix(in srgb, var(--color-accent) 72%, var(--color-primary)))"
                    : "var(--bg-disabled)",
                  color: "white",
                  fontSize: "0.8125rem",
                  fontWeight: 800,
                  cursor: generating || intelCards.length === 0 ? "default" : "pointer",
                  opacity: generating ? 0.76 : 1,
                }}
              >
                <RefreshCw style={{ width: "15px", height: "15px", animation: generating ? "spin 1s linear infinite" : "none" }} />
                {generating ? "整理中..." : "刷新新的任务"}
              </button>
            </div>

            {sourcesExpanded && (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {intelCards.length > 0 ? (
                  intelCards.slice(0, 6).map((card) => (
                    <div
                      key={card.id}
                      style={{
                        borderRadius: "8px",
                        border: "1px solid var(--border-light)",
                        background: "var(--bg-card)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: "100%",
                          display: "flex",
                          alignItems: "flex-start",
                          justifyContent: "space-between",
                          gap: "10px",
                          padding: "10px 12px",
                          background: "transparent",
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "4px" }}>
                          <div style={{ fontSize: "0.84375rem", fontWeight: 700, color: "var(--text-main)", lineHeight: 1.45 }}>
                            {card.title}
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
                            <span style={{ fontSize: "0.6875rem", color: "var(--text-light)" }}>
                              {card.module_id}
                            </span>
                            {card.tags?.slice(0, 2).map((tag) => (
                              <span
                                key={`${card.id}-${tag}`}
                                style={{
                                  padding: "1px 6px",
                                  borderRadius: "999px",
                                  background: surface("var(--color-accent)", 12),
                                  color: "var(--text-muted)",
                                  fontSize: "0.625rem",
                                  fontWeight: 700,
                                }}
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                          {card.summary && (
                            <div
                              style={{
                                fontSize: "0.75rem",
                                color: "var(--text-secondary)",
                                lineHeight: 1.5,
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                              }}
                            >
                              {card.summary}
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            void handleSourceJump(card);
                          }}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            padding: "6px 8px",
                            borderRadius: "7px",
                            border: "1px solid var(--border-light)",
                            background: "var(--bg-hover)",
                            color: "var(--text-secondary)",
                            cursor: "pointer",
                            flexShrink: 0,
                            fontSize: "0.6875rem",
                            fontWeight: 700,
                          }}
                        >
                          <ExternalLink style={{ width: "13px", height: "13px" }} />
                          追源
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div
                    style={{
                      padding: "14px 16px",
                      borderRadius: "8px",
                      background: "var(--bg-hover)",
                      border: "1px dashed var(--border-light)",
                      color: "var(--text-light)",
                      fontSize: "0.8125rem",
                      lineHeight: 1.6,
                    }}
                  >
                    今天的情报还没有进入这里。等抓取到卡片后，会自动作为消化任务的输入。
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        <section style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
            <ClipboardList style={{ width: "16px", height: "16px", color: "var(--color-success-text)" }} />
            <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-main)" }}>
              情报消化任务
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {suggestedTodos.length > 0 ? (
              suggestedTodos.map((todo) => {
                const badge = priorityStyle(todo.priority);
                const normalizedText = todo.text.trim().toLowerCase();
                const exists = existingTodoTexts.has(normalizedText);
                const isAdding = addingTodoText === todo.text;

                return (
                  <div
                    key={`${todo.text}-${todo.reason ?? ""}`}
                    style={{
                      padding: "10px 12px",
                      borderRadius: "8px",
                      background: "var(--bg-hover)",
                      border: "1px solid var(--border-light)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", gap: "10px", marginBottom: todo.reason ? "6px" : "4px" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-main)", lineHeight: 1.45 }}>
                          {todo.text}
                        </div>
                      </div>
                      <span
                        style={{
                          flexShrink: 0,
                          padding: "4px 8px",
                          borderRadius: "999px",
                          background: badge.bg,
                          border: `1px solid ${badge.border}`,
                          color: badge.color,
                          fontSize: "0.6875rem",
                          fontWeight: 800,
                        }}
                      >
                        {todo.priority ?? "medium"}
                      </span>
                    </div>

                    {todo.reason && (
                      <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                        {todo.reason}
                      </div>
                    )}

                    {(todo.evidence ?? []).length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "6px" }}>
                        {(todo.evidence ?? []).slice(0, 4).map((item) => (
                          <span
                            key={item}
                            style={{
                              padding: "3px 8px",
                              borderRadius: "999px",
                              background: surface("var(--color-primary)", 14),
                              color: "var(--text-muted)",
                              fontSize: "0.6875rem",
                              fontWeight: 600,
                            }}
                          >
                            {item}
                          </span>
                        ))}
                      </div>
                    )}

                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "8px" }}>
                      <button
                        type="button"
                        disabled={exists || isAdding}
                        onClick={() => void handleAddToToday(todo)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "7px",
                          padding: "7px 10px",
                          borderRadius: "8px",
                          border: exists ? "1px solid var(--border-light)" : "1px solid transparent",
                          background: exists
                            ? "var(--bg-disabled)"
                            : "linear-gradient(135deg, var(--color-success), color-mix(in srgb, var(--color-success) 70%, var(--color-primary)))",
                          color: exists ? "var(--text-muted)" : "white",
                          fontSize: "0.75rem",
                          fontWeight: 800,
                          cursor: exists || isAdding ? "default" : "pointer",
                          opacity: isAdding ? 0.75 : 1,
                        }}
                      >
                        <Plus style={{ width: "14px", height: "14px" }} />
                        {exists ? "已在今日待办" : isAdding ? "写入中..." : "写入今日待办"}
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
                <div
                  style={{
                    padding: "14px 16px",
                    borderRadius: "8px",
                    background: "var(--bg-hover)",
                    border: "1px dashed var(--border-light)",
                    color: "var(--text-light)",
                    fontSize: "0.8125rem",
                    lineHeight: 1.6,
                  }}
                >
                  先刷新一次任务，系统会基于你今天的情报、偏好和阅读轨迹生成可执行动作。
              </div>
            )}
          </div>
        </section>
      </div>
    </Card>
  );
}
