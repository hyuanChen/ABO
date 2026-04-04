import { useEffect, useState } from "react";
import { PageContainer, PageHeader, PageContent, Card } from "../../components/Layout";
import { api } from "../../core/api";
import { useStore } from "../../core/store";
import { Calendar, User, Clock, CheckCircle, XCircle, RefreshCw, ExternalLink } from "lucide-react";

interface Subscription {
  value: string;
  added_at: string;
  added_by: string;
  last_fetched: string | null;
  fetch_count: number;
  is_active: boolean;
}

interface ModuleSummary {
  total: number;
  active: number;
  by_type: Record<string, Subscription[]>;
  module_name: string;
}

interface SummaryData {
  total_modules: number;
  total_subscriptions: number;
  modules: Record<string, ModuleSummary>;
}

const typeLabels: Record<string, string> = {
  up_uid: "UP主",
  user_id: "用户ID",
  user: "用户",
  topic: "话题",
  podcast_id: "播客",
};

export default function SubscriptionSummary() {
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});
  const { setActiveTab, setModuleToConfigure } = useStore();

  useEffect(() => {
    fetchSummary();
  }, []);

  async function fetchSummary() {
    setLoading(true);
    try {
      const result = await api.get<SummaryData>("/api/subscriptions/summary");
      setData(result);
    } catch (err) {
      console.error("Failed to fetch subscription summary:", err);
    } finally {
      setLoading(false);
    }
  }

  function formatDateTime(isoString: string): string {
    try {
      const date = new Date(isoString);
      return date.toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  }

  function toggleModule(moduleId: string) {
    setExpandedModules((prev) => ({ ...prev, [moduleId]: !prev[moduleId] }));
  }

  function goToModule(moduleId: string) {
    setModuleToConfigure(moduleId);
    setActiveTab("modules");
  }

  if (loading) {
    return (
      <PageContainer>
        <PageHeader title="订阅总表" subtitle="管理所有模块的订阅" icon={Clock} />
        <PageContent>
          <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-muted)" }}>
            <RefreshCw style={{ width: "32px", height: "32px", margin: "0 auto 16px", animation: "spin 1s linear infinite" }} />
            <p>加载订阅数据中...</p>
          </div>
        </PageContent>
      </PageContainer>
    );
  }

  if (!data || data.total_subscriptions === 0) {
    return (
      <PageContainer>
        <PageHeader title="订阅总表" subtitle="管理所有模块的订阅" icon={Clock} />
        <PageContent>
          <Card>
            <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-muted)" }}>
              <CheckCircle style={{ width: "48px", height: "48px", margin: "0 auto 16px", opacity: 0.5 }} />
              <h3 style={{ fontSize: "1.125rem", fontWeight: 600, color: "var(--text-main)", marginBottom: "8px" }}>
                暂无订阅记录
              </h3>
              <p style={{ fontSize: "0.9375rem", marginBottom: "20px" }}>
                您还没有添加任何订阅，请在模块管理中配置订阅源
              </p>
              <button
                onClick={() => setActiveTab("modules")}
                style={{
                  padding: "12px 24px",
                  borderRadius: "var(--radius-full)",
                  background: "linear-gradient(135deg, var(--color-primary), var(--color-secondary))",
                  color: "white",
                  fontSize: "0.9375rem",
                  fontWeight: 600,
                  border: "none",
                  cursor: "pointer",
                }}
              >
                前往模块管理
              </button>
            </div>
          </Card>
        </PageContent>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="订阅总表"
        subtitle={`${data.total_modules} 个模块 · ${data.total_subscriptions} 条订阅`}
        icon={Clock}
        actions={
          <button
            onClick={fetchSummary}
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
              border: "1px solid var(--border-light)",
              cursor: "pointer",
            }}
          >
            <RefreshCw style={{ width: "16px", height: "16px" }} />
            刷新
          </button>
        }
      />

      <PageContent maxWidth="800px">
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Summary Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
            <Card>
              <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                <div style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "50%",
                  background: "rgba(188, 164, 227, 0.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  <CheckCircle style={{ width: "24px", height: "24px", color: "var(--color-primary)" }} />
                </div>
                <div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-main)" }}>
                    {Object.values(data.modules).reduce((sum, m) => sum + m.active, 0)}
                  </div>
                  <div style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>活跃订阅</div>
                </div>
              </div>
            </Card>
            <Card>
              <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                <div style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "50%",
                  background: "rgba(255, 183, 178, 0.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  <XCircle style={{ width: "24px", height: "24px", color: "#D48984" }} />
                </div>
                <div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-main)" }}>
                    {data.total_subscriptions - Object.values(data.modules).reduce((sum, m) => sum + m.active, 0)}
                  </div>
                  <div style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>已移除</div>
                </div>
              </div>
            </Card>
            <Card>
              <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                <div style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "50%",
                  background: "rgba(168, 230, 207, 0.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  <Calendar style={{ width: "24px", height: "24px", color: "#5BA88C" }} />
                </div>
                <div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-main)" }}>
                    {data.total_modules}
                  </div>
                  <div style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>模块数量</div>
                </div>
              </div>
            </Card>
          </div>

          {/* Module List */}
          {Object.entries(data.modules).map(([moduleId, moduleData]) => (
            <Card key={moduleId}>
              <div
                onClick={() => toggleModule(moduleId)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  cursor: "pointer",
                  padding: "4px",
                }}
              >
                <div style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  background: moduleData.active > 0 ? "#10B981" : "var(--text-muted)",
                  flexShrink: 0,
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-main)", marginBottom: "2px" }}>
                    {moduleData.module_name}
                  </div>
                  <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)", display: "flex", gap: "12px" }}>
                    <span>总计: {moduleData.total}</span>
                    <span style={{ color: "#10B981" }}>活跃: {moduleData.active}</span>
                    {moduleData.total > moduleData.active && (
                      <span style={{ color: "var(--text-muted)" }}>已移除: {moduleData.total - moduleData.active}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    goToModule(moduleId);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    padding: "6px 12px",
                    borderRadius: "var(--radius-full)",
                    background: "var(--bg-hover)",
                    border: "1px solid var(--border-light)",
                    color: "var(--text-secondary)",
                    fontSize: "0.75rem",
                    cursor: "pointer",
                  }}
                >
                  <ExternalLink style={{ width: "12px", height: "12px" }} />
                  管理
                </button>
                <div style={{
                  transform: expandedModules[moduleId] ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.3s ease",
                }}>
                  ▼
                </div>
              </div>

              {/* Expanded Details */}
              {expandedModules[moduleId] && (
                <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid var(--border-light)" }}>
                  {Object.entries(moduleData.by_type).map(([subType, subscriptions]) => (
                    <div key={subType} style={{ marginBottom: "16px" }}>
                      <div style={{
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        color: "var(--color-primary)",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        marginBottom: "8px",
                      }}>
                        {typeLabels[subType] || subType} ({subscriptions.length})
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {subscriptions.map((sub, idx) => (
                          <div
                            key={idx}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "12px",
                              padding: "10px 14px",
                              borderRadius: "var(--radius-md)",
                              background: sub.is_active ? "rgba(16, 185, 129, 0.06)" : "var(--bg-hover)",
                              border: `1px solid ${sub.is_active ? "rgba(16, 185, 129, 0.15)" : "var(--border-light)"}`,
                            }}
                          >
                            <div style={{
                              width: "6px",
                              height: "6px",
                              borderRadius: "50%",
                              background: sub.is_active ? "#10B981" : "var(--text-muted)",
                              flexShrink: 0,
                            }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{
                                fontSize: "0.9375rem",
                                fontWeight: 500,
                                color: "var(--text-main)",
                                marginBottom: "2px",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}>
                                {sub.value}
                              </div>
                              <div style={{
                                fontSize: "0.75rem",
                                color: "var(--text-muted)",
                                display: "flex",
                                gap: "12px",
                                flexWrap: "wrap",
                              }}>
                                <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                  <Calendar style={{ width: "10px", height: "10px" }} />
                                  {formatDateTime(sub.added_at)}
                                </span>
                                {sub.added_by && (
                                  <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                    <User style={{ width: "10px", height: "10px" }} />
                                    {sub.added_by}
                                  </span>
                                )}
                              </div>
                            </div>
                            {sub.fetch_count > 0 && (
                              <div style={{
                                fontSize: "0.75rem",
                                color: "var(--text-muted)",
                                textAlign: "center",
                              }}>
                                <div style={{ fontWeight: 600 }}>{sub.fetch_count}</div>
                                <div>次</div>
                              </div>
                            )}
                            {!sub.is_active && (
                              <span style={{
                                fontSize: "0.65rem",
                                padding: "2px 6px",
                                borderRadius: "4px",
                                background: "var(--text-muted)",
                                color: "white",
                              }}>
                                已移除
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      </PageContent>
    </PageContainer>
  );
}
