import { useState, useEffect } from "react";
import { Inbox, BookOpen, Clock, BookHeart, FileText } from "lucide-react";
import { PageContainer, PageHeader, LoadingState } from "../../components/Layout";
import { api } from "../../core/api";
import type { WikiType } from "./Wiki";

interface WikiStatsResponse {
  total: number;
  by_category: Record<string, number>;
  wiki_type: string;
}

interface WikiStats {
  page_count: number;
  entity_count?: number;
  concept_count?: number;
  paper_count?: number;
  topic_count?: number;
  recent_pages: Array<{
    slug: string;
    title: string;
    wiki_type: string;
    updated: string;
  }>;
}

function parseStats(raw: WikiStatsResponse, _wikiType: string): WikiStats {
  const bc = raw.by_category ?? {};
  return {
    page_count: raw.total ?? 0,
    entity_count: bc.entity ?? 0,
    concept_count: bc.concept ?? 0,
    paper_count: bc.paper ?? 0,
    topic_count: bc.topic ?? 0,
    recent_pages: [],
  };
}

interface Props {
  onSelectWiki: (type: WikiType) => void;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin}分钟前`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}小时前`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 30) return `${diffD}天前`;
  return dateStr.slice(0, 10);
}

export default function WikiHome({ onSelectWiki }: Props) {
  const [intelStats, setIntelStats] = useState<WikiStats | null>(null);
  const [litStats, setLitStats] = useState<WikiStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchStats() {
      setLoading(true);
      try {
        const [intel, lit] = await Promise.allSettled([
          api.get<WikiStatsResponse>("/api/wiki/intel/stats"),
          api.get<WikiStatsResponse>("/api/wiki/lit/stats"),
        ]);
        if (!cancelled) {
          setIntelStats(intel.status === "fulfilled" ? parseStats(intel.value, "intel") : { page_count: 0, entity_count: 0, concept_count: 0, recent_pages: [] });
          setLitStats(lit.status === "fulfilled" ? parseStats(lit.value, "lit") : { page_count: 0, paper_count: 0, topic_count: 0, recent_pages: [] });
        }
      } catch {
        // Use empty defaults on failure
        if (!cancelled) {
          setIntelStats({ page_count: 0, entity_count: 0, concept_count: 0, recent_pages: [] });
          setLitStats({ page_count: 0, paper_count: 0, topic_count: 0, recent_pages: [] });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchStats();
    return () => { cancelled = true; };
  }, []);

  // Combine recent pages from both wikis
  const recentPages = [
    ...(intelStats?.recent_pages ?? []),
    ...(litStats?.recent_pages ?? []),
  ]
    .sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime())
    .slice(0, 5);

  if (loading) {
    return (
      <PageContainer>
        <PageHeader title="知识库" subtitle="情报库 + 文献库 Wiki 系统" icon={BookHeart} />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <LoadingState message="加载知识库..." />
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader title="知识库" subtitle="情报库 + 文献库 Wiki 系统" icon={BookHeart} />

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "clamp(20px, 3vw, 40px)",
        }}
      >
        <div
          style={{
            maxWidth: "900px",
            margin: "0 auto",
          }}
        >
          {/* Two wiki cards side by side */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: "24px",
              marginBottom: "40px",
            }}
          >
            {/* Intel Wiki Card */}
            <button
              onClick={() => onSelectWiki("intel")}
              onMouseEnter={() => setHoveredCard("intel")}
              onMouseLeave={() => setHoveredCard(null)}
              style={{
                padding: "32px 28px",
                borderRadius: "var(--radius-lg, 16px)",
                background: hoveredCard === "intel"
                  ? "linear-gradient(135deg, rgba(188, 164, 227, 0.2), rgba(168, 230, 207, 0.15))"
                  : "var(--bg-card)",
                border: "1px solid var(--border-light)",
                boxShadow: hoveredCard === "intel"
                  ? "0 8px 32px rgba(188, 164, 227, 0.25)"
                  : "var(--shadow-soft)",
                cursor: "pointer",
                transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
                transform: hoveredCard === "intel" ? "translateY(-4px) scale(1.02)" : "translateY(0) scale(1)",
                textAlign: "left",
                display: "flex",
                flexDirection: "column",
                gap: "16px",
              }}
            >
              <div
                style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "var(--radius-md)",
                  background: "linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 4px 16px rgba(188, 164, 227, 0.35)",
                }}
              >
                <Inbox style={{ width: "28px", height: "28px", color: "white" }} />
              </div>

              <div>
                <h2
                  style={{
                    fontFamily: "'M PLUS Rounded 1c', sans-serif",
                    fontSize: "1.375rem",
                    fontWeight: 700,
                    color: "var(--text-main)",
                    marginBottom: "6px",
                  }}
                >
                  情报库 Wiki
                </h2>
                <p style={{ fontSize: "0.9375rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
                  行业动态 · 竞品 · 趋势
                </p>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: "16px",
                  fontSize: "0.8125rem",
                  color: "var(--text-secondary)",
                  fontWeight: 600,
                }}
              >
                <span
                  style={{
                    padding: "4px 12px",
                    borderRadius: "var(--radius-full)",
                    background: "rgba(188, 164, 227, 0.12)",
                  }}
                >
                  {intelStats?.page_count ?? 0} 页
                </span>
                <span
                  style={{
                    padding: "4px 12px",
                    borderRadius: "var(--radius-full)",
                    background: "rgba(168, 230, 207, 0.15)",
                  }}
                >
                  {intelStats?.entity_count ?? 0} 实体
                </span>
              </div>
            </button>

            {/* Lit Wiki Card */}
            <button
              onClick={() => onSelectWiki("lit")}
              onMouseEnter={() => setHoveredCard("lit")}
              onMouseLeave={() => setHoveredCard(null)}
              style={{
                padding: "32px 28px",
                borderRadius: "var(--radius-lg, 16px)",
                background: hoveredCard === "lit"
                  ? "linear-gradient(135deg, rgba(168, 230, 207, 0.2), rgba(188, 164, 227, 0.15))"
                  : "var(--bg-card)",
                border: "1px solid var(--border-light)",
                boxShadow: hoveredCard === "lit"
                  ? "0 8px 32px rgba(168, 230, 207, 0.25)"
                  : "var(--shadow-soft)",
                cursor: "pointer",
                transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
                transform: hoveredCard === "lit" ? "translateY(-4px) scale(1.02)" : "translateY(0) scale(1)",
                textAlign: "left",
                display: "flex",
                flexDirection: "column",
                gap: "16px",
              }}
            >
              <div
                style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "var(--radius-md)",
                  background: "linear-gradient(135deg, #A8E6CF, #7DD3C0)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 4px 16px rgba(168, 230, 207, 0.35)",
                }}
              >
                <BookOpen style={{ width: "28px", height: "28px", color: "white" }} />
              </div>

              <div>
                <h2
                  style={{
                    fontFamily: "'M PLUS Rounded 1c', sans-serif",
                    fontSize: "1.375rem",
                    fontWeight: 700,
                    color: "var(--text-main)",
                    marginBottom: "6px",
                  }}
                >
                  文献库 Wiki
                </h2>
                <p style={{ fontSize: "0.9375rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
                  论文 · 方法 · 领域
                </p>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: "16px",
                  fontSize: "0.8125rem",
                  color: "var(--text-secondary)",
                  fontWeight: 600,
                }}
              >
                <span
                  style={{
                    padding: "4px 12px",
                    borderRadius: "var(--radius-full)",
                    background: "rgba(168, 230, 207, 0.15)",
                  }}
                >
                  {litStats?.page_count ?? 0} 页
                </span>
                <span
                  style={{
                    padding: "4px 12px",
                    borderRadius: "var(--radius-full)",
                    background: "rgba(188, 164, 227, 0.12)",
                  }}
                >
                  {litStats?.topic_count ?? 0} 主题
                </span>
              </div>
            </button>
          </div>

          {/* Recent Updates */}
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginBottom: "16px",
              }}
            >
              <Clock style={{ width: "16px", height: "16px", color: "var(--text-muted)" }} />
              <h3
                style={{
                  fontFamily: "'M PLUS Rounded 1c', sans-serif",
                  fontSize: "1rem",
                  fontWeight: 700,
                  color: "var(--text-secondary)",
                }}
              >
                最近更新
              </h3>
            </div>

            {recentPages.length === 0 ? (
              <div
                style={{
                  padding: "32px",
                  textAlign: "center",
                  color: "var(--text-muted)",
                  background: "var(--bg-card)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-light)",
                }}
              >
                <FileText
                  style={{
                    width: "36px",
                    height: "36px",
                    margin: "0 auto 12px",
                    opacity: 0.4,
                  }}
                />
                <p style={{ fontSize: "0.9375rem", fontWeight: 500 }}>
                  还没有 Wiki 页面
                </p>
                <p style={{ fontSize: "0.8125rem", marginTop: "4px", opacity: 0.7 }}>
                  从情报卡片或文献中摘录第一条知识开始
                </p>
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                {recentPages.map((page) => (
                  <button
                    key={`${page.wiki_type}-${page.slug}`}
                    onClick={() => onSelectWiki(page.wiki_type as WikiType)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      padding: "12px 16px",
                      borderRadius: "var(--radius-md)",
                      background: "var(--bg-card)",
                      border: "1px solid var(--border-light)",
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                      textAlign: "left",
                      width: "100%",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "var(--bg-hover)";
                      e.currentTarget.style.transform = "translateX(4px)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "var(--bg-card)";
                      e.currentTarget.style.transform = "translateX(0)";
                    }}
                  >
                    <div
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background: page.wiki_type === "intel"
                          ? "linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))"
                          : "linear-gradient(135deg, #A8E6CF, #7DD3C0)",
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        flex: 1,
                        fontSize: "0.9375rem",
                        fontWeight: 600,
                        color: "var(--text-main)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {page.title}
                    </span>
                    <span
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--text-muted)",
                        flexShrink: 0,
                      }}
                    >
                      {page.wiki_type === "intel" ? "情报库" : "文献库"}
                    </span>
                    <span
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--text-muted)",
                        flexShrink: 0,
                      }}
                    >
                      {timeAgo(page.updated)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
