import { useEffect, useState } from "react";
import { ArrowLeft, Rss, Clock, User, Trash2, RefreshCw } from "lucide-react";
import { api } from "../../core/api";
import { PageContainer, PageHeader, PageContent, Card } from "../../components/Layout";
import { useToast } from "../../components/Toast";

interface ModuleInfo {
  name: string;
  icon: string;
  total: number;
  by_type: Record<string, Array<{
    value: string;
    added_at: string;
    added_by: string;
    last_fetched: string | null;
    fetch_count: number;
  }>>;
}

interface SummaryData {
  total_modules: number;
  total_subscriptions: number;
  modules: Record<string, ModuleInfo>;
  modules_info: Record<string, { name: string; icon: string }>;
}

const TYPE_LABELS: Record<string, string> = {
  up_uid: "UP主",
  user_id: "用户ID",
  user: "用户",
  topic: "话题",
  podcast_id: "播客",
  keyword: "关键词",
};

const TYPE_COLORS: Record<string, string> = {
  up_uid: "#FF6B6B",
  user_id: "#FF6B9D",
  user: "#C44569",
  topic: "#786FA6",
  podcast_id: "#63CDDA",
  keyword: "#F8B500",
};

interface Props {
  onBack: () => void;
}

export default function SubscriptionSummary({ onBack }: Props) {
  const toast = useToast();
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());

  async function fetchSummary() {
    setLoading(true);
    try {
      const data = await api.get<SummaryData>("/api/subscriptions/summary");
      setSummary(data);
    } catch {
      toast.error("加载订阅总表失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchSummary();
  }, []);

  function toggleModule(moduleId: string) {
    const newSet = new Set(expandedModules);
    if (newSet.has(moduleId)) {
      newSet.delete(moduleId);
    } else {
      newSet.add(moduleId);
    }
    setExpandedModules(newSet);
  }

  function formatDateTime(isoString: string | null): string {
    if (!isoString) return "从未";
    try {
      const date = new Date(isoString);
      return date.toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  }

  async function removeSubscription(moduleId: string, type: string, value: string) {
    try {
      await api.delete(`/api/modules/${moduleId}/subscriptions`, { type, value } as any);
      toast.success("订阅已移除");
      fetchSummary();
    } catch {
      toast.error("移除失败");
    }
  }

  if (loading) {
    return (
      <PageContainer>
        <PageHeader title="订阅总表" subtitle="加载中..." icon={Rss} />
        <PageContent maxWidth="700px">
          <div style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
            加载中...
          </div>
        </PageContent>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="订阅总表"
        subtitle={`${summary?.total_subscriptions || 0} 个订阅 · ${summary?.total_modules || 0} 个模块`}
        icon={Rss}
        actions={
          <>
            <button
              onClick={fetchSummary}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 14px",
                borderRadius: "var(--radius-full)",
                background: "var(--bg-hover)",
                color: "var(--text-secondary)",
                fontSize: "0.8125rem",
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
              }}
            >
              <RefreshCw style={{ width: "14px", height: "14px" }} />
              刷新
            </button>
            <button
              onClick={onBack}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 16px",
                borderRadius: "var(--radius-full)",
                background: "var(--bg-hover)",
                color: "var(--text-secondary)",
                fontSize: "0.875rem",
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
              }}
            >
              <ArrowLeft style={{ width: "16px", height: "16px" }} />
              返回
            </button>
          </>
        }
      />

      <PageContent maxWidth="700px">
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* 统计卡片 */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "12px",
            }}
          >
            <div
              style={{
                padding: "16px",
                borderRadius: "var(--radius-md)",
                background: "var(--bg-card)",
                border: "1px solid var(--border-light)",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: "1.75rem",
                  fontWeight: 700,
                  color: "var(--color-primary)",
                }}
              >
                {summary?.total_subscriptions || 0}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "4px" }}>
                总订阅数
              </div>
            </div>
            <div
              style={{
                padding: "16px",
                borderRadius: "var(--radius-md)",
                background: "var(--bg-card)",
                border: "1px solid var(--border-light)",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: "1.75rem",
                  fontWeight: 700,
                  color: "var(--color-secondary)",
                }}
              >
                {summary?.total_modules || 0}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "4px" }}>
                活跃模块
              </div>
            </div>
            <div
              style={{
                padding: "16px",
                borderRadius: "var(--radius-md)",
                background: "var(--bg-card)",
                border: "1px solid var(--border-light)",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: "1.75rem",
                  fontWeight: 700,
                  color: "#F8B500",
                }}
              >
                {Object.values(summary?.modules || {}).reduce(
                  (acc, m) => acc + Object.keys(m.by_type).length,
                  0
                )}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "4px" }}>
                订阅类型
              </div>
            </div>
          </div>

          {/* 模块列表 */}
          {summary?.modules && Object.entries(summary.modules).length > 0 ? (
            Object.entries(summary.modules).map(([moduleId, moduleData]) => {
              const moduleInfo = summary.modules_info[moduleId] || {
                name: moduleId,
                icon: "rss",
              };
              const isExpanded = expandedModules.has(moduleId);
              const allSubs = Object.values(moduleData.by_type).flat();

              return (
                <Card
                  key={moduleId}
                  title={`${moduleInfo.name} (${allSubs.length} 个订阅)`}
                  icon={<Rss style={{ width: "18px", height: "18px", color: "var(--color-primary)" }} />}
                >
                  {/* 按类型分组的订阅 */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {Object.entries(moduleData.by_type).map(([type, subs]) => (
                      <div key={type}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            marginBottom: "8px",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "0.65rem",
                              padding: "2px 8px",
                              borderRadius: "4px",
                              background: TYPE_COLORS[type] || "var(--color-primary)",
                              color: "white",
                              fontWeight: 600,
                            }}
                          >
                            {TYPE_LABELS[type] || type}
                          </span>
                          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                            {subs.length} 个
                          </span>
                        </div>

                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "6px",
                          }}
                        >
                          {(isExpanded ? subs : subs.slice(0, 3)).map((sub, idx) => (
                            <div
                              key={idx}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "10px",
                                padding: "8px 10px",
                                borderRadius: "var(--radius-md)",
                                background: "var(--bg-hover)",
                                border: "1px solid var(--border-light)",
                              }}
                            >
                              <span
                                style={{
                                  flex: 1,
                                  fontSize: "0.8125rem",
                                  color: "var(--text-main)",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {sub.value}
                              </span>
                              <span
                                style={{
                                  fontSize: "0.7rem",
                                  color: "var(--text-muted)",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "3px",
                                }}
                              >
                                <User style={{ width: "10px", height: "10px" }} />
                                {sub.added_by}
                              </span>
                              <span
                                style={{
                                  fontSize: "0.7rem",
                                  color: "var(--text-muted)",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "3px",
                                }}
                              >
                                <Clock style={{ width: "10px", height: "10px" }} />
                                {formatDateTime(sub.added_at)}
                              </span>
                              <button
                                onClick={() => removeSubscription(moduleId, type, sub.value)}
                                style={{
                                  padding: "4px",
                                  borderRadius: "4px",
                                  background: "transparent",
                                  color: "var(--text-muted)",
                                  border: "none",
                                  cursor: "pointer",
                                  opacity: 0.6,
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                                onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.6")}
                              >
                                <Trash2 style={{ width: "12px", height: "12px" }} />
                              </button>
                            </div>
                          ))}

                          {!isExpanded && subs.length > 3 && (
                            <button
                              onClick={() => toggleModule(moduleId)}
                              style={{
                                padding: "6px",
                                borderRadius: "var(--radius-md)",
                                background: "transparent",
                                color: "var(--text-muted)",
                                border: "1px dashed var(--border-light)",
                                cursor: "pointer",
                                fontSize: "0.75rem",
                              }}
                            >
                              + {subs.length - 3} 更多
                            </button>
                          )}
                        </div>
                      </div>
                    ))}

                    {isExpanded && (
                      <button
                        onClick={() => toggleModule(moduleId)}
                        style={{
                          padding: "6px",
                          borderRadius: "var(--radius-md)",
                          background: "transparent",
                          color: "var(--text-muted)",
                          border: "1px dashed var(--border-light)",
                          cursor: "pointer",
                          fontSize: "0.75rem",
                        }}
                      >
                        收起
                      </button>
                    )}
                  </div>
                </Card>
              );
            })
          ) : (
            <Card>
              <div
                style={{
                  textAlign: "center",
                  padding: "40px",
                  color: "var(--text-muted)",
                }}
              >
                <Rss style={{ width: "48px", height: "48px", opacity: 0.3, marginBottom: "16px" }} />
                <div style={{ fontSize: "0.875rem" }}>暂无订阅</div>
                <div style={{ fontSize: "0.75rem", marginTop: "8px" }}>
                  前往各模块页面添加订阅
                </div>
              </div>
            </Card>
          )}
        </div>
      </PageContent>
    </PageContainer>
  );
}
