import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  Bell,
  BookOpen,
  GitBranch,
  Play,
  Plus,
  Search,
  Trash2,
} from "lucide-react";

import { Card } from "../../components/Layout";
import ToggleSwitch from "../../components/ToggleSwitch";
import { useToast } from "../../components/Toast";
import { api } from "../../core/api";

type KeywordMonitor = {
  id: string;
  label: string;
  query: string;
  categories: string[];
  enabled: boolean;
};

type FollowUpMonitor = {
  id: string;
  label: string;
  query: string;
  enabled: boolean;
};

type ArxivConfigResponse = {
  keyword_monitors?: KeywordMonitor[];
  max_results?: number;
  days_back?: number | null;
};

type FollowUpConfigResponse = {
  followup_monitors?: FollowUpMonitor[];
  max_results?: number;
  days_back?: number | null;
  sort_by?: "recency" | "citation_count";
};

type ArxivMonitorConfig = {
  keyword_monitors: KeywordMonitor[];
  max_results: number;
  days_back: number;
};

type FollowUpMonitorConfig = {
  followup_monitors: FollowUpMonitor[];
  max_results: number;
  days_back: number;
  sort_by: "recency" | "citation_count";
};

function makeLocalId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeCategories(input: string): string[] {
  return input
    .split(/[,，\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function sectionHeaderStyle(): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    marginBottom: "12px",
  };
}

function pillStyle(active: boolean): CSSProperties {
  return {
    height: "38px",
    padding: "0 14px",
    borderRadius: "8px",
    border: `1px solid ${active ? "var(--color-primary)" : "var(--border-light)"}`,
    background: active ? "rgba(188, 164, 227, 0.12)" : "var(--bg-app)",
    color: active ? "var(--color-primary)" : "var(--text-secondary)",
    fontSize: "0.875rem",
    fontWeight: 600,
    cursor: "pointer",
  };
}

export default function PaperMonitorPanel() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [runningKey, setRunningKey] = useState<"arxiv" | "followup" | null>(null);

  const [arxivConfig, setArxivConfig] = useState<ArxivMonitorConfig>({
    keyword_monitors: [],
    max_results: 20,
    days_back: 30,
  });
  const [followupConfig, setFollowupConfig] = useState<FollowUpMonitorConfig>({
    followup_monitors: [],
    max_results: 20,
    days_back: 365,
    sort_by: "recency",
  });

  const [keywordLabelDraft, setKeywordLabelDraft] = useState("");
  const [keywordQueryDraft, setKeywordQueryDraft] = useState("");
  const [keywordCategoriesDraft, setKeywordCategoriesDraft] = useState("cs.AI, cs.LG");
  const [followupLabelDraft, setFollowupLabelDraft] = useState("");
  const [followupQueryDraft, setFollowupQueryDraft] = useState("");

  async function loadConfigs() {
    setLoading(true);
    try {
      const [arxivRes, followupRes] = await Promise.all([
        api.get<ArxivConfigResponse>("/api/modules/arxiv-tracker/config"),
        api.get<FollowUpConfigResponse>("/api/modules/semantic-scholar-tracker/config"),
      ]);

      setArxivConfig({
        keyword_monitors: arxivRes.keyword_monitors || [],
        max_results: Number(arxivRes.max_results || 20),
        days_back: Number(arxivRes.days_back || 30),
      });
      setFollowupConfig({
        followup_monitors: followupRes.followup_monitors || [],
        max_results: Number(followupRes.max_results || 20),
        days_back: Number(followupRes.days_back || 365),
        sort_by: followupRes.sort_by === "citation_count" ? "citation_count" : "recency",
      });
    } catch (error) {
      toast.error("加载监控配置失败", error instanceof Error ? error.message : "请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadConfigs();
  }, []);

  async function persistArxivConfig(nextConfig: ArxivMonitorConfig, successMessage?: string) {
    setSavingKey("arxiv");
    try {
      await api.post("/api/modules/arxiv-tracker/config", nextConfig);
      setArxivConfig(nextConfig);
      if (successMessage) {
        toast.success("关键词监控已更新", successMessage);
      }
    } catch (error) {
      toast.error("保存关键词监控失败", error instanceof Error ? error.message : "请稍后重试");
    } finally {
      setSavingKey(null);
    }
  }

  async function persistFollowupConfig(nextConfig: FollowUpMonitorConfig, successMessage?: string) {
    setSavingKey("followup");
    try {
      await api.post("/api/modules/semantic-scholar-tracker/config", nextConfig);
      setFollowupConfig(nextConfig);
      if (successMessage) {
        toast.success("Follow Up 监控已更新", successMessage);
      }
    } catch (error) {
      toast.error("保存 Follow Up 监控失败", error instanceof Error ? error.message : "请稍后重试");
    } finally {
      setSavingKey(null);
    }
  }

  async function runMonitor(moduleId: "arxiv-tracker" | "semantic-scholar-tracker") {
    const runKey = moduleId === "arxiv-tracker" ? "arxiv" : "followup";
    setRunningKey(runKey);
    try {
      await api.post(`/api/modules/${moduleId}/run`, {});
      toast.success(
        "监控已启动",
        moduleId === "arxiv-tracker" ? "关键词监控结果会进入今日情报" : "Follow Up 结果会进入今日情报"
      );
    } catch (error) {
      toast.error("启动监控失败", error instanceof Error ? error.message : "请稍后重试");
    } finally {
      setRunningKey(null);
    }
  }

  async function addKeywordMonitor() {
    const query = keywordQueryDraft.trim();
    if (!query) {
      toast.error("请输入关键词表达式", "支持逗号 AND 和 | 分组 OR");
      return;
    }

    const nextMonitor: KeywordMonitor = {
      id: makeLocalId("keyword"),
      label: keywordLabelDraft.trim() || query,
      query,
      categories: normalizeCategories(keywordCategoriesDraft),
      enabled: true,
    };

    if (
      arxivConfig.keyword_monitors.some(
        (monitor) => monitor.query.trim().toLowerCase() === nextMonitor.query.toLowerCase()
      )
    ) {
      toast.error("关键词监控已存在", "可以直接开关，或删除后重新添加");
      return;
    }

    const nextConfig = {
      ...arxivConfig,
      keyword_monitors: [...arxivConfig.keyword_monitors, nextMonitor],
    };
    await persistArxivConfig(nextConfig, `新增 ${nextMonitor.label}`);
    setKeywordLabelDraft("");
    setKeywordQueryDraft("");
  }

  async function addFollowupMonitor() {
    const query = followupQueryDraft.trim();
    if (!query) {
      toast.error("请输入论文全称", "Semantic Scholar 会按论文标题查找 follow up");
      return;
    }

    const nextMonitor: FollowUpMonitor = {
      id: makeLocalId("followup"),
      label: followupLabelDraft.trim() || query,
      query,
      enabled: true,
    };

    if (
      followupConfig.followup_monitors.some(
        (monitor) => monitor.query.trim().toLowerCase() === nextMonitor.query.toLowerCase()
      )
    ) {
      toast.error("Follow Up 监控已存在", "可以直接开关，或删除后重新添加");
      return;
    }

    const nextConfig = {
      ...followupConfig,
      followup_monitors: [...followupConfig.followup_monitors, nextMonitor],
    };
    await persistFollowupConfig(nextConfig, `新增 ${nextMonitor.label}`);
    setFollowupLabelDraft("");
    setFollowupQueryDraft("");
  }

  const keywordEnabledCount = useMemo(
    () => arxivConfig.keyword_monitors.filter((monitor) => monitor.enabled).length,
    [arxivConfig.keyword_monitors]
  );
  const followupEnabledCount = useMemo(
    () => followupConfig.followup_monitors.filter((monitor) => monitor.enabled).length,
    [followupConfig.followup_monitors]
  );

  return (
    <Card
      title="关注监控"
      icon={<Bell style={{ width: "18px", height: "18px", color: "var(--color-primary)" }} />}
      style={{ marginBottom: "24px" }}
    >
      <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "24px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "12px",
          }}
        >
          <div
            style={{
              padding: "14px 16px",
              borderRadius: "8px",
              border: "1px solid var(--border-light)",
              background: "var(--bg-hover)",
            }}
          >
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "6px" }}>
              关键词监控
            </div>
            <div style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--text-main)" }}>
              {keywordEnabledCount}/{arxivConfig.keyword_monitors.length || 0}
            </div>
          </div>
          <div
            style={{
              padding: "14px 16px",
              borderRadius: "8px",
              border: "1px solid var(--border-light)",
              background: "var(--bg-hover)",
            }}
          >
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "6px" }}>
              Follow Up 监控
            </div>
            <div style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--text-main)" }}>
              {followupEnabledCount}/{followupConfig.followup_monitors.length || 0}
            </div>
          </div>
        </div>

        <div
          style={{
            fontSize: "0.8125rem",
            color: "var(--text-muted)",
            lineHeight: 1.7,
            padding: "12px 14px",
            borderRadius: "8px",
            background: "var(--bg-hover)",
            border: "1px dashed var(--border-light)",
          }}
        >
          配好的监控会复用模块定时调度，抓到的新论文直接进入今日情报的论文追踪。关键词监控支持
          <code style={{ margin: "0 4px", padding: "2px 6px", borderRadius: "4px", background: "var(--bg-card)" }}>
            vision,language | robot,manipulation
          </code>
          这种 AND / OR 提示风格。
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "20px",
            alignItems: "start",
          }}
        >
          <section
            style={{
              border: "1px solid var(--border-light)",
              borderRadius: "8px",
              padding: "18px",
              background: "var(--bg-card)",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
            }}
          >
            <div style={sectionHeaderStyle()}>
              <Search style={{ width: "18px", height: "18px", color: "var(--color-primary)" }} />
              <div>
                <div style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-main)" }}>
                  arXiv 关键词追踪
                </div>
                <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                  按指定领域抓取，结果会落到今日情报的关键词分组
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: "6px", width: "128px" }}>
                <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", fontWeight: 600 }}>
                  每项最多
                </span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={arxivConfig.max_results}
                  onChange={(event) =>
                    setArxivConfig((current) => ({
                      ...current,
                      max_results: Math.min(100, Math.max(1, Number(event.target.value) || 20)),
                    }))
                  }
                  onBlur={() => persistArxivConfig(arxivConfig)}
                  style={{
                    height: "38px",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-light)",
                    background: "var(--bg-app)",
                    color: "var(--text-main)",
                    fontSize: "0.875rem",
                  }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: "6px", width: "128px" }}>
                <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", fontWeight: 600 }}>
                  最近天数
                </span>
                <input
                  type="number"
                  min={1}
                  max={3650}
                  value={arxivConfig.days_back}
                  onChange={(event) =>
                    setArxivConfig((current) => ({
                      ...current,
                      days_back: Math.min(3650, Math.max(1, Number(event.target.value) || 30)),
                    }))
                  }
                  onBlur={() => persistArxivConfig(arxivConfig)}
                  style={{
                    height: "38px",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-light)",
                    background: "var(--bg-app)",
                    color: "var(--text-main)",
                    fontSize: "0.875rem",
                  }}
                />
              </label>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {loading ? (
                <div style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>正在加载监控项…</div>
              ) : arxivConfig.keyword_monitors.length === 0 ? (
                <div
                  style={{
                    padding: "14px",
                    borderRadius: "8px",
                    border: "1px dashed var(--border-light)",
                    color: "var(--text-muted)",
                    fontSize: "0.875rem",
                  }}
                >
                  还没有关键词监控。建议先加 1-3 个高价值主题。
                </div>
              ) : (
                arxivConfig.keyword_monitors.map((monitor) => (
                  <div
                    key={monitor.id}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "12px",
                      padding: "12px 14px",
                      borderRadius: "8px",
                      border: "1px solid var(--border-light)",
                      background: "var(--bg-hover)",
                    }}
                  >
                    <ToggleSwitch
                      enabled={monitor.enabled}
                      size="sm"
                      disabled={savingKey === "arxiv"}
                      onChange={async (enabled) => {
                        const nextConfig = {
                          ...arxivConfig,
                          keyword_monitors: arxivConfig.keyword_monitors.map((item) =>
                            item.id === monitor.id ? { ...item, enabled } : item
                          ),
                        };
                        await persistArxivConfig(nextConfig);
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-main)", marginBottom: "4px" }}>
                        {monitor.label}
                      </div>
                      <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                        {monitor.query}
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "8px" }}>
                        {(monitor.categories.length ? monitor.categories : ["cs.*"]).map((category) => (
                          <span
                            key={`${monitor.id}-${category}`}
                            style={{
                              padding: "4px 8px",
                              borderRadius: "999px",
                              background: "rgba(188, 164, 227, 0.12)",
                              color: "var(--color-primary)",
                              fontSize: "0.75rem",
                              fontWeight: 600,
                            }}
                          >
                            {category}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        const nextConfig = {
                          ...arxivConfig,
                          keyword_monitors: arxivConfig.keyword_monitors.filter((item) => item.id !== monitor.id),
                        };
                        await persistArxivConfig(nextConfig, `删除 ${monitor.label}`);
                      }}
                      style={{
                        width: "34px",
                        height: "34px",
                        borderRadius: "8px",
                        border: "1px solid var(--border-light)",
                        background: "var(--bg-card)",
                        color: "var(--text-muted)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Trash2 style={{ width: "14px", height: "14px" }} />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div style={{ display: "grid", gap: "10px" }}>
              <input
                type="text"
                value={keywordLabelDraft}
                onChange={(event) => setKeywordLabelDraft(event.target.value)}
                placeholder="显示名称，可留空"
                style={{
                  height: "40px",
                  padding: "0 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-light)",
                  background: "var(--bg-app)",
                  color: "var(--text-main)",
                  fontSize: "0.875rem",
                }}
              />
              <input
                type="text"
                value={keywordQueryDraft}
                onChange={(event) => setKeywordQueryDraft(event.target.value)}
                placeholder="例如：vision,language | robot,manipulation"
                style={{
                  height: "40px",
                  padding: "0 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-light)",
                  background: "var(--bg-app)",
                  color: "var(--text-main)",
                  fontSize: "0.875rem",
                }}
              />
              <input
                type="text"
                value={keywordCategoriesDraft}
                onChange={(event) => setKeywordCategoriesDraft(event.target.value)}
                placeholder="领域代码，例如：cs.AI, cs.LG"
                style={{
                  height: "40px",
                  padding: "0 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-light)",
                  background: "var(--bg-app)",
                  color: "var(--text-main)",
                  fontSize: "0.875rem",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={addKeywordMonitor}
                disabled={savingKey === "arxiv"}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  border: "none",
                  background: "linear-gradient(135deg, var(--color-primary), var(--color-secondary))",
                  color: "white",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <Plus style={{ width: "16px", height: "16px" }} />
                添加关键词监控
              </button>
              <button
                type="button"
                onClick={() => runMonitor("arxiv-tracker")}
                disabled={runningKey === "arxiv"}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-light)",
                  background: "var(--bg-card)",
                  color: "var(--text-secondary)",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <Play style={{ width: "16px", height: "16px" }} />
                {runningKey === "arxiv" ? "执行中..." : "立即执行"}
              </button>
            </div>
          </section>

          <section
            style={{
              border: "1px solid var(--border-light)",
              borderRadius: "8px",
              padding: "18px",
              background: "var(--bg-card)",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
            }}
          >
            <div style={sectionHeaderStyle()}>
              <GitBranch style={{ width: "18px", height: "18px", color: "var(--color-primary)" }} />
              <div>
                <div style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-main)" }}>
                  Follow Up 论文追踪
                </div>
                <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                  复用 Semantic Scholar 后端，按论文全称追踪后续研究
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: "6px", width: "128px" }}>
                <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", fontWeight: 600 }}>
                  每项最多
                </span>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={followupConfig.max_results}
                  onChange={(event) =>
                    setFollowupConfig((current) => ({
                      ...current,
                      max_results: Math.min(500, Math.max(1, Number(event.target.value) || 20)),
                    }))
                  }
                  onBlur={() => persistFollowupConfig(followupConfig)}
                  style={{
                    height: "38px",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-light)",
                    background: "var(--bg-app)",
                    color: "var(--text-main)",
                    fontSize: "0.875rem",
                  }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: "6px", width: "128px" }}>
                <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", fontWeight: 600 }}>
                  最近天数
                </span>
                <input
                  type="number"
                  min={1}
                  max={3650}
                  value={followupConfig.days_back}
                  onChange={(event) =>
                    setFollowupConfig((current) => ({
                      ...current,
                      days_back: Math.min(3650, Math.max(1, Number(event.target.value) || 365)),
                    }))
                  }
                  onBlur={() => persistFollowupConfig(followupConfig)}
                  style={{
                    height: "38px",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-light)",
                    background: "var(--bg-app)",
                    color: "var(--text-main)",
                    fontSize: "0.875rem",
                  }}
                />
              </label>
            </div>

            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() =>
                  persistFollowupConfig({
                    ...followupConfig,
                    sort_by: "recency",
                  })
                }
                style={pillStyle(followupConfig.sort_by === "recency")}
              >
                最近优先
              </button>
              <button
                type="button"
                onClick={() =>
                  persistFollowupConfig({
                    ...followupConfig,
                    sort_by: "citation_count",
                  })
                }
                style={pillStyle(followupConfig.sort_by === "citation_count")}
              >
                被引优先
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {loading ? (
                <div style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>正在加载监控项…</div>
              ) : followupConfig.followup_monitors.length === 0 ? (
                <div
                  style={{
                    padding: "14px",
                    borderRadius: "8px",
                    border: "1px dashed var(--border-light)",
                    color: "var(--text-muted)",
                    fontSize: "0.875rem",
                  }}
                >
                  还没有 Follow Up 监控。建议优先加你最在意的基准论文或方法论文。
                </div>
              ) : (
                followupConfig.followup_monitors.map((monitor) => (
                  <div
                    key={monitor.id}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "12px",
                      padding: "12px 14px",
                      borderRadius: "8px",
                      border: "1px solid var(--border-light)",
                      background: "var(--bg-hover)",
                    }}
                  >
                    <ToggleSwitch
                      enabled={monitor.enabled}
                      size="sm"
                      disabled={savingKey === "followup"}
                      onChange={async (enabled) => {
                        const nextConfig = {
                          ...followupConfig,
                          followup_monitors: followupConfig.followup_monitors.map((item) =>
                            item.id === monitor.id ? { ...item, enabled } : item
                          ),
                        };
                        await persistFollowupConfig(nextConfig);
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-main)", marginBottom: "4px" }}>
                        {monitor.label}
                      </div>
                      <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                        {monitor.query}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        const nextConfig = {
                          ...followupConfig,
                          followup_monitors: followupConfig.followup_monitors.filter((item) => item.id !== monitor.id),
                        };
                        await persistFollowupConfig(nextConfig, `删除 ${monitor.label}`);
                      }}
                      style={{
                        width: "34px",
                        height: "34px",
                        borderRadius: "8px",
                        border: "1px solid var(--border-light)",
                        background: "var(--bg-card)",
                        color: "var(--text-muted)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Trash2 style={{ width: "14px", height: "14px" }} />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div style={{ display: "grid", gap: "10px" }}>
              <input
                type="text"
                value={followupLabelDraft}
                onChange={(event) => setFollowupLabelDraft(event.target.value)}
                placeholder="显示名称，可留空"
                style={{
                  height: "40px",
                  padding: "0 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-light)",
                  background: "var(--bg-app)",
                  color: "var(--text-main)",
                  fontSize: "0.875rem",
                }}
              />
              <textarea
                value={followupQueryDraft}
                onChange={(event) => setFollowupQueryDraft(event.target.value)}
                placeholder="输入论文全称，例如：World Action Models are Zero-shot Policies"
                rows={3}
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-light)",
                  background: "var(--bg-app)",
                  color: "var(--text-main)",
                  fontSize: "0.875rem",
                  resize: "vertical",
                  fontFamily: "inherit",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={addFollowupMonitor}
                disabled={savingKey === "followup"}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  border: "none",
                  background: "linear-gradient(135deg, var(--color-primary), var(--color-secondary))",
                  color: "white",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <Plus style={{ width: "16px", height: "16px" }} />
                添加 Follow Up 监控
              </button>
              <button
                type="button"
                onClick={() => runMonitor("semantic-scholar-tracker")}
                disabled={runningKey === "followup"}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-light)",
                  background: "var(--bg-card)",
                  color: "var(--text-secondary)",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <Play style={{ width: "16px", height: "16px" }} />
                {runningKey === "followup" ? "执行中..." : "立即执行"}
              </button>
            </div>
          </section>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            fontSize: "0.8125rem",
            color: "var(--text-muted)",
          }}
        >
          <BookOpen style={{ width: "16px", height: "16px" }} />
          保存按钮会继续复用现有“保存到文献库”的后端流程，监控卡片和手动查询卡片走的是同一套落库逻辑。
        </div>
      </div>
    </Card>
  );
}
