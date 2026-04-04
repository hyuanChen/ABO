import { useEffect, useState } from "react";
import { ArrowLeft, Play, Clock, Calendar, User, Plus, X, Trash2, HelpCircle, History, Info } from "lucide-react";
import { api } from "../../core/api";
import { useStore, FeedModule } from "../../core/store";
import { PageContainer, PageHeader, PageContent, Card } from "../../components/Layout";
import { useToast } from "../../components/Toast";
import { CookieGuide } from "../../components/ConfigHelp";

const SCHEDULE_OPTIONS = [
  { label: "8:00", value: "0 8 * * *" },
  { label: "10:00", value: "0 10 * * *" },
  { label: "11:00", value: "0 11 * * *" },
  { label: "13:00", value: "0 13 * * *" },
  { label: "20:00", value: "0 20 * * *" },
];

// 各模块的订阅配置（仅支持订阅类型的模块）
const MODULE_SUB_CONFIG: Record<string, {
  types: { type: string; label: string; placeholder: string; example: string }[];
  desc: string;
}> = {
  "bilibili-tracker": {
    types: [
      { type: "up_uid", label: "UP主", placeholder: "输入UP主UID或空间链接", example: "1567748478" },
    ],
    desc: "添加UP主UID追踪其视频更新"
  },
  "xiaohongshu-tracker": {
    types: [
      { type: "user_id", label: "用户", placeholder: "输入用户主页链接或ID", example: "5f3c8b9a0000000001001234" },
    ],
    desc: "添加用户ID追踪小红书笔记"
  },
  "zhihu-tracker": {
    types: [
      { type: "topic", label: "话题", placeholder: "输入话题ID或链接", example: "19550728" },
      { type: "user", label: "用户", placeholder: "输入用户ID或主页链接", example: "zhihu-user" },
    ],
    desc: "添加话题或用户追踪知乎内容"
  },
  "xiaoyuzhou-tracker": {
    types: [
      { type: "podcast_id", label: "播客", placeholder: "输入播客ID或链接", example: "6169c4c8d8b44c5da7ea2e9b" },
    ],
    desc: "添加播客ID追踪节目更新"
  },
  "arxiv-tracker": {
    types: [],
    desc: "在下方配置关键词"
  },
  "semantic-scholar-tracker": {
    types: [],
    desc: "在下方配置关键词"
  },
  "folder-monitor": {
    types: [],
    desc: "监控文件夹变化"
  },
};

interface Props {
  module: FeedModule;
  onBack: () => void;
}

interface ModuleConfig {
  keywords?: string[];
  topics?: string[];
  users?: string[];
  podcast_ids?: string[];
  user_ids?: string[];
  folder_path?: string;
  up_uids?: string[];
  follow_feed?: boolean;
  sessdata?: string;
  api_key?: string;
}

interface SubscriptionDetail {
  type: string;
  value: string;
  added_at: string;
  added_by: string;
  last_fetched: string | null;
  fetch_count: number;
  is_active: boolean;
}

interface SubDetailData {
  module_id: string;
  module_name: string;
  subscriptions: SubscriptionDetail[];
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

export default function ModuleDetail({ module, onBack }: Props) {
  const toast = useToast();
  const { setFeedModules } = useStore();
  const [moduleConfig, setModuleConfig] = useState<ModuleConfig>({});
  const [running, setRunning] = useState(false);
  const [moduleEnabled, setModuleEnabled] = useState(module.enabled);
  const [schedule, setSchedule] = useState(module.schedule);
  const [subDetails, setSubDetails] = useState<SubDetailData | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedType, setSelectedType] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  const subConfig = MODULE_SUB_CONFIG[module.id] || { types: [], desc: "" };

  useEffect(() => {
    api.get<ModuleConfig>(`/api/modules/${module.id}/config`)
      .then((config) => {
        setModuleConfig(config);
      })
      .catch(() => setModuleConfig({}));

    // Load global config for semantic-scholar-tracker (for API key)
    if (module.id === "semantic-scholar-tracker") {
      api.get<{ semantic_scholar_api_key?: string }>("/api/config")
        .then((globalConfig) => {
          setModuleConfig((prev) => ({ ...prev, api_key: globalConfig.semantic_scholar_api_key || "" }));
        })
        .catch(() => {});
    }

    fetchSubscriptionDetails();
  }, [module.id]);

  // 设置默认选中类型
  useEffect(() => {
    if (subConfig.types.length > 0 && !selectedType) {
      setSelectedType(subConfig.types[0].type);
    }
  }, [subConfig.types, selectedType]);

  async function fetchSubscriptionDetails() {
    setLoadingDetails(true);
    try {
      const data = await api.get<SubDetailData>(`/api/modules/${module.id}/subscriptions/detail`);
      setSubDetails(data);
    } catch {
      setSubDetails(null);
    } finally {
      setLoadingDetails(false);
    }
  }

  async function saveRuntimeSettings() {
    try {
      await api.patch(`/api/modules/${module.id}`, {
        enabled: moduleEnabled,
        schedule: schedule,
      });
      toast.success("保存成功");
      const modulesRes = await api.get<{ modules: FeedModule[] }>("/api/modules");
      if (modulesRes?.modules) {
        setFeedModules(modulesRes.modules);
      }
    } catch {
      toast.error("保存失败");
    }
  }

  async function runNow() {
    setRunning(true);
    try {
      await api.post(`/api/modules/${module.id}/run`, {});
      toast.success("已开始运行");
    } catch {
      toast.error("运行失败");
    } finally {
      setRunning(false);
    }
  }

  async function addSubscription() {
    if (!inputValue.trim()) {
      toast.error("请输入内容");
      return;
    }
    if (!selectedType) {
      toast.error("请选择订阅类型");
      return;
    }
    try {
      await api.post(`/api/modules/${module.id}/subscriptions`, {
        type: selectedType,
        value: inputValue.trim()
      });
      toast.success("订阅已添加");
      fetchSubscriptionDetails();
      setInputValue("");
      setShowAddForm(false);
    } catch (err: any) {
      console.error("Add subscription error:", err);
      toast.error(`添加失败: ${err.message || "请检查网络连接"}`);
    }
  }

  async function removeSubscription(type: string, value: string) {
    try {
      await api.delete(`/api/modules/${module.id}/subscriptions`, { type, value } as any);
      toast.success("订阅已移除");
      fetchSubscriptionDetails();
    } catch {
      toast.error("移除失败");
    }
  }

  async function toggleSubscription(type: string, value: string, isActive: boolean) {
    if (isActive) {
      // 禁用（软删除）
      await removeSubscription(type, value);
    } else {
      // 重新添加
      try {
        await api.post(`/api/modules/${module.id}/subscriptions`, { type, value });
        toast.success("订阅已恢复");
        fetchSubscriptionDetails();
      } catch {
        toast.error("恢复失败");
      }
    }
  }

  function formatDateTime(isoString: string): string {
    try {
      const date = new Date(isoString);
      return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    } catch {
      return isoString;
    }
  }

  const currentTypeConfig = subConfig.types.find(t => t.type === selectedType);

  return (
    <PageContainer>
      <PageHeader
        title={module.name}
        subtitle={module.schedule}
        icon={Clock}
        actions={
          <>
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
            <button
              onClick={runNow}
              disabled={running}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 20px",
                borderRadius: "var(--radius-full)",
                background: "linear-gradient(135deg, var(--color-primary), var(--color-secondary))",
                color: "white",
                fontSize: "0.875rem",
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
              }}
            >
              <Play style={{ width: "16px", height: "16px" }} />
              {running ? "运行中..." : "立即运行"}
            </button>
          </>
        }
      />

      <PageContent maxWidth="700px">
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

          {/* 使用指南小卡片 */}
          <div style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "10px",
            padding: "10px 14px",
            borderRadius: "var(--radius-md)",
            background: "rgba(99, 205, 218, 0.1)",
            border: "1px solid rgba(99, 205, 218, 0.3)",
          }}>
            <Info style={{ width: "16px", height: "16px", color: "#63CDDA", flexShrink: 0, marginTop: "2px" }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-main)", marginBottom: "2px" }}>
                {subConfig.desc || `${module.name}模块`}
              </div>
              {subConfig.types.length > 0 && (
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "flex", flexWrap: "wrap", gap: "4px" }}>
                  支持类型:{subConfig.types.map(t => (
                    <span key={t.type} style={{ color: "var(--text-secondary)" }}>· {t.label}</span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 运行设置行 */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "12px 16px",
            borderRadius: "var(--radius-md)",
            background: "var(--bg-card)",
            border: "1px solid var(--border-light)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
              <div
                onClick={() => { setModuleEnabled(!moduleEnabled); }}
                style={{
                  width: "40px",
                  height: "22px",
                  borderRadius: "11px",
                  background: moduleEnabled ? "var(--color-primary)" : "var(--text-muted)",
                  position: "relative",
                  cursor: "pointer",
                  transition: "background 0.2s",
                }}
              >
                <div style={{
                  width: "18px",
                  height: "18px",
                  borderRadius: "50%",
                  background: "white",
                  position: "absolute",
                  top: "2px",
                  left: moduleEnabled ? "20px" : "2px",
                  transition: "left 0.2s",
                }} />
              </div>
              <span style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--text-main)" }}>
                {moduleEnabled ? "已开启" : "已关闭"}
              </span>
            </div>

            <div style={{ width: "1px", height: "20px", background: "var(--border-light)" }} />

            <Clock style={{ width: "14px", height: "14px", color: "var(--text-muted)", flexShrink: 0 }} />
            <select
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              style={{
                padding: "6px 10px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-light)",
                background: "var(--bg-app)",
                color: "var(--text-main)",
                fontSize: "0.8125rem",
                outline: "none",
                cursor: "pointer",
              }}
            >
              {SCHEDULE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            {module.next_run && (
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginLeft: "auto" }}>
                下次: {new Date(module.next_run).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </span>
            )}

            <button
              onClick={saveRuntimeSettings}
              style={{
                padding: "6px 12px",
                borderRadius: "var(--radius-md)",
                background: "var(--color-primary)",
                color: "white",
                fontSize: "0.75rem",
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              保存
            </button>
          </div>

          {/* 正在订阅卡片 */}
          <Card title={`正在订阅 (${subDetails?.subscriptions?.filter(s => s.is_active !== false).length || 0})`} icon={<Calendar style={{ width: "18px", height: "18px", color: "var(--color-primary)" }} />}>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>

              {/* 添加订阅按钮 */}
              {!showAddForm && subConfig.types.length > 0 && (
                <button
                  onClick={() => {
                    if (!selectedType && subConfig.types.length > 0) {
                      setSelectedType(subConfig.types[0].type);
                    }
                    setShowAddForm(true);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "12px 16px",
                    borderRadius: "var(--radius-md)",
                    border: "1px dashed var(--border-light)",
                    background: "var(--bg-hover)",
                    color: "var(--text-secondary)",
                    fontSize: "0.875rem",
                    cursor: "pointer",
                    width: "100%",
                  }}
                >
                  <Plus style={{ width: "16px", height: "16px" }} />
                  添加订阅
                </button>
              )}

              {/* 添加订阅表单 */}
              {showAddForm && (
                <div style={{
                  padding: "16px",
                  borderRadius: "var(--radius-md)",
                  background: "var(--bg-hover)",
                  border: "1px solid var(--border-light)",
                }}>
                  {/* 类型选择 */}
                  {subConfig.types.length > 1 && (
                    <div style={{ display: "flex", gap: "8px", marginBottom: "12px", flexWrap: "wrap" }}>
                      {subConfig.types.map((t) => (
                        <button
                          key={t.type}
                          onClick={() => { setSelectedType(t.type); setInputValue(""); }}
                          style={{
                            padding: "6px 12px",
                            borderRadius: "var(--radius-md)",
                            border: "1px solid var(--border-light)",
                            background: selectedType === t.type ? "var(--color-primary)" : "var(--bg-app)",
                            color: selectedType === t.type ? "white" : "var(--text-main)",
                            fontSize: "0.8125rem",
                            cursor: "pointer",
                          }}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* 输入框 */}
                  <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                    <input
                      type="text"
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      placeholder={currentTypeConfig?.placeholder || "输入..."}
                      style={{
                        flex: 1,
                        padding: "10px 14px",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid var(--border-light)",
                        background: "var(--bg-app)",
                        color: "var(--text-main)",
                        fontSize: "0.875rem",
                        outline: "none",
                      }}
                      onKeyDown={(e) => e.key === "Enter" && addSubscription()}
                    />
                    <button
                      onClick={addSubscription}
                      style={{
                        padding: "10px 20px",
                        borderRadius: "var(--radius-md)",
                        background: "var(--color-primary)",
                        color: "white",
                        fontSize: "0.875rem",
                        fontWeight: 600,
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      添加
                    </button>
                    <button
                      onClick={() => { setShowAddForm(false); setInputValue(""); }}
                      style={{
                        padding: "10px",
                        borderRadius: "var(--radius-md)",
                        background: "transparent",
                        color: "var(--text-muted)",
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      <X style={{ width: "18px", height: "18px" }} />
                    </button>
                  </div>

                  {/* 示例提示 */}
                  {currentTypeConfig?.example && (
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "10px 12px",
                      borderRadius: "var(--radius-md)",
                      background: "rgba(248, 181, 0, 0.1)",
                      border: "1px dashed rgba(248, 181, 0, 0.3)",
                    }}>
                      <HelpCircle style={{ width: "14px", height: "14px", color: "#F8B500" }} />
                      <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                        示例: <code style={{ background: "rgba(248,181,0,0.15)", padding: "2px 6px", borderRadius: "4px", color: "#B8860B" }}>{currentTypeConfig.example}</code>
                      </span>
                    </div>
                  )}

                  {/* 历史订阅快捷恢复 */}
                  {subDetails && subDetails.subscriptions.filter(s => s.is_active === false).length > 0 && (
                    <div style={{ marginTop: "12px" }}>
                      <div style={{
                        fontSize: "0.75rem",
                        color: "var(--text-muted)",
                        marginBottom: "8px",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px"
                      }}>
                        <History style={{ width: "12px", height: "12px" }} />
                        点击恢复历史订阅
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {subDetails.subscriptions
                          .filter(s => s.is_active === false)
                          .slice(0, 5)
                          .map((sub, idx) => (
                            <button
                              key={idx}
                              onClick={() => {
                                setSelectedType(sub.type);
                                setInputValue(sub.value);
                              }}
                              style={{
                                padding: "4px 10px",
                                borderRadius: "9999px",
                                border: "1px solid var(--border-light)",
                                background: "var(--bg-app)",
                                color: "var(--text-muted)",
                                fontSize: "0.75rem",
                                cursor: "pointer",
                                textDecoration: "line-through",
                              }}
                            >
                              {sub.value}
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 订阅列表 */}
              {loadingDetails ? (
                <div style={{ textAlign: "center", padding: "20px", color: "var(--text-muted)", fontSize: "0.875rem" }}>
                  加载中...
                </div>
              ) : !subDetails || subDetails.subscriptions.filter(s => s.is_active !== false).length === 0 ? (
                <div style={{ textAlign: "center", padding: "20px", color: "var(--text-muted)", fontSize: "0.875rem" }}>
                  暂无订阅，点击上方添加
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {subDetails.subscriptions
                    .filter(s => s.is_active !== false)
                    .map((sub, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          padding: "10px 12px",
                          borderRadius: "var(--radius-md)",
                          background: "var(--bg-hover)",
                          border: "1px solid var(--border-light)",
                        }}
                      >
                        {/* 开关按钮 */}
                        <div
                          onClick={() => toggleSubscription(sub.type, sub.value, true)}
                          style={{
                            width: "36px",
                            height: "20px",
                            borderRadius: "10px",
                            background: "#10B981",
                            position: "relative",
                            cursor: "pointer",
                            transition: "background 0.2s",
                            flexShrink: 0,
                          }}
                        >
                          <div style={{
                            width: "16px",
                            height: "16px",
                            borderRadius: "50%",
                            background: "white",
                            position: "absolute",
                            top: "2px",
                            left: "18px",
                            transition: "left 0.2s",
                          }} />
                        </div>

                        <span style={{
                          fontSize: "0.65rem",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          background: TYPE_COLORS[sub.type] || "var(--color-primary)",
                          color: "white",
                          fontWeight: 600,
                          flexShrink: 0,
                        }}>
                          {TYPE_LABELS[sub.type] || sub.type}
                        </span>
                        <span style={{
                          flex: 1,
                          fontSize: "0.875rem",
                          color: "var(--text-main)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}>
                          {sub.value}
                        </span>
                        <span style={{
                          fontSize: "0.75rem",
                          color: "var(--text-muted)",
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                        }}>
                          <User style={{ width: "10px", height: "10px" }} />
                          {sub.added_by}
                        </span>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                          {formatDateTime(sub.added_at)}
                        </span>
                        <button
                          onClick={() => removeSubscription(sub.type, sub.value)}
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
                          <Trash2 style={{ width: "14px", height: "14px" }} />
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </Card>

          {/* 历史订阅折叠 */}
          {subDetails && subDetails.subscriptions.filter(s => s.is_active === false).length > 0 && (
            <Card>
              <div
                onClick={() => setShowHistory(!showHistory)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  cursor: "pointer",
                  fontSize: "0.875rem",
                  color: "var(--text-secondary)",
                }}
              >
                <History style={{ width: "16px", height: "16px" }} />
                <span>已移除的订阅 ({subDetails.subscriptions.filter(s => s.is_active === false).length})</span>
                <span style={{ marginLeft: "auto", transform: showHistory ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▼</span>
              </div>

              {showHistory && (
                <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
                  {subDetails.subscriptions
                    .filter(s => s.is_active === false)
                    .map((sub, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          padding: "10px 12px",
                          borderRadius: "var(--radius-md)",
                          background: "var(--bg-hover)",
                          opacity: 0.7,
                        }}
                      >
                        {/* 开关按钮 - 可恢复 */}
                        <div
                          onClick={() => toggleSubscription(sub.type, sub.value, false)}
                          style={{
                            width: "36px",
                            height: "20px",
                            borderRadius: "10px",
                            background: "var(--text-muted)",
                            position: "relative",
                            cursor: "pointer",
                            flexShrink: 0,
                          }}
                        >
                          <div style={{
                            width: "16px",
                            height: "16px",
                            borderRadius: "50%",
                            background: "white",
                            position: "absolute",
                            top: "2px",
                            left: "2px",
                          }} />
                        </div>

                        <span style={{
                          fontSize: "0.65rem",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          background: "var(--text-muted)",
                          color: "white",
                          fontWeight: 600,
                        }}>
                          {TYPE_LABELS[sub.type] || sub.type}
                        </span>
                        <span style={{ flex: 1, fontSize: "0.875rem", color: "var(--text-main)", textDecoration: "line-through" }}>
                          {sub.value}
                        </span>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                          {formatDateTime(sub.added_at)}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </Card>
          )}

          {/* 模块特殊配置 */}
          {module.id === "bilibili-tracker" && (
            <Card title="B站登录" icon={<User style={{ width: "18px", height: "18px", color: "var(--color-secondary)" }} />}>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <input
                  type="password"
                  value={moduleConfig.sessdata || ""}
                  onChange={(e) => setModuleConfig({ ...moduleConfig, sessdata: e.target.value })}
                  placeholder="粘贴 SESSDATA Cookie..."
                  style={{
                    padding: "10px 14px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-light)",
                    background: "var(--bg-app)",
                    color: "var(--text-main)",
                    fontSize: "0.875rem",
                    outline: "none",
                  }}
                />
                <CookieGuide platform="bilibili" cookieName="SESSDATA" />
                <button
                  onClick={async () => {
                    try {
                      await api.post("/api/preferences", { modules: { [module.id]: { sessdata: moduleConfig.sessdata } } });
                      toast.success("已保存");
                    } catch {
                      toast.error("保存失败");
                    }
                  }}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "var(--radius-md)",
                    background: "var(--color-primary)",
                    color: "white",
                    fontSize: "0.8125rem",
                    fontWeight: 600,
                    border: "none",
                    cursor: "pointer",
                    alignSelf: "flex-start",
                  }}
                >
                  保存 Cookie
                </button>
              </div>
            </Card>
          )}

          {/* arXiv 关键词配置 */}
          {module.id === "arxiv-tracker" && (
            <Card title="关键词" icon={<span style={{ fontSize: "14px" }}>🔤</span>}>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <input
                  type="text"
                  value={(moduleConfig.keywords || []).join(", ")}
                  onChange={(e) => setModuleConfig({ ...moduleConfig, keywords: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
                  placeholder="robotics, manipulation, grasp"
                  style={{
                    padding: "10px 14px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-light)",
                    background: "var(--bg-app)",
                    color: "var(--text-main)",
                    fontSize: "0.875rem",
                    outline: "none",
                  }}
                />
                <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: 0 }}>
                  输入英文关键词，用逗号分隔。系统会自动追踪包含这些关键词的新论文
                </p>
                <button
                  onClick={async () => {
                    try {
                      await api.post("/api/preferences", { modules: { [module.id]: { keywords: moduleConfig.keywords } } });
                      toast.success("已保存");
                    } catch {
                      toast.error("保存失败");
                    }
                  }}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "var(--radius-md)",
                    background: "var(--color-primary)",
                    color: "white",
                    fontSize: "0.8125rem",
                    fontWeight: 600,
                    border: "none",
                    cursor: "pointer",
                    alignSelf: "flex-start",
                  }}
                >
                  保存关键词
                </button>
              </div>
            </Card>
          )}

          {/* Semantic Scholar API Key 配置 */}
          {module.id === "semantic-scholar-tracker" && (
            <Card title="API 配置" icon={<span style={{ fontSize: "14px" }}>🔑</span>}>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-secondary)" }}>
                    Semantic Scholar API Key
                  </label>
                  <input
                    type="password"
                    value={moduleConfig.api_key || ""}
                    onChange={(e) => setModuleConfig({ ...moduleConfig, api_key: e.target.value })}
                    placeholder="输入你的 API Key（可选）"
                    style={{
                      padding: "10px 14px",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--border-light)",
                      background: "var(--bg-app)",
                      color: "var(--text-main)",
                      fontSize: "0.875rem",
                      outline: "none",
                    }}
                  />
                  <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: 0 }}>
                    留空将使用默认 API Key。如需使用自己的 Key，请从
                    <a href="https://www.semanticscholar.org/product/api" target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-primary)", textDecoration: "underline" }}>Semantic Scholar</a>
                    申请
                  </p>
                </div>
                <button
                  onClick={async () => {
                    try {
                      await api.post("/api/config", { semantic_scholar_api_key: moduleConfig.api_key || "" });
                      toast.success("API Key 已保存");
                    } catch {
                      toast.error("保存失败");
                    }
                  }}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "var(--radius-md)",
                    background: "var(--color-primary)",
                    color: "white",
                    fontSize: "0.8125rem",
                    fontWeight: 600,
                    border: "none",
                    cursor: "pointer",
                    alignSelf: "flex-start",
                  }}
                >
                  保存 API Key
                </button>
              </div>
            </Card>
          )}

          {/* Semantic Scholar 关键词配置 */}
          {module.id === "semantic-scholar-tracker" && (
            <Card title="关键词" icon={<span style={{ fontSize: "14px" }}>🔤</span>}>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <input
                  type="text"
                  value={(moduleConfig.keywords || []).join(", ")}
                  onChange={(e) => setModuleConfig({ ...moduleConfig, keywords: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
                  placeholder="machine learning, NLP"
                  style={{
                    padding: "10px 14px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-light)",
                    background: "var(--bg-app)",
                    color: "var(--text-main)",
                    fontSize: "0.875rem",
                    outline: "none",
                  }}
                />
                <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: 0 }}>
                  输入英文关键词，用逗号分隔
                </p>
                <button
                  onClick={async () => {
                    try {
                      await api.post("/api/preferences", { modules: { [module.id]: { keywords: moduleConfig.keywords } } });
                      toast.success("已保存");
                    } catch {
                      toast.error("保存失败");
                    }
                  }}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "var(--radius-md)",
                    background: "var(--color-primary)",
                    color: "white",
                    fontSize: "0.8125rem",
                    fontWeight: 600,
                    border: "none",
                    cursor: "pointer",
                    alignSelf: "flex-start",
                  }}
                >
                  保存关键词
                </button>
              </div>
            </Card>
          )}

          {module.id === "folder-monitor" && (
            <Card title="文件夹路径" icon={<Calendar style={{ width: "18px", height: "18px", color: "var(--color-secondary)" }} />}>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <input
                  type="text"
                  value={moduleConfig.folder_path || ""}
                  onChange={(e) => setModuleConfig({ ...moduleConfig, folder_path: e.target.value })}
                  placeholder="/Users/xxx/Downloads/Papers"
                  style={{
                    padding: "10px 14px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-light)",
                    background: "var(--bg-app)",
                    color: "var(--text-main)",
                    fontSize: "0.875rem",
                    outline: "none",
                  }}
                />
                <button
                  onClick={async () => {
                    try {
                      await api.post("/api/preferences", { modules: { [module.id]: { folder_path: moduleConfig.folder_path } } });
                      toast.success("已保存");
                    } catch {
                      toast.error("保存失败");
                    }
                  }}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "var(--radius-md)",
                    background: "var(--color-primary)",
                    color: "white",
                    fontSize: "0.8125rem",
                    fontWeight: 600,
                    border: "none",
                    cursor: "pointer",
                    alignSelf: "flex-start",
                  }}
                >
                  保存路径
                </button>
              </div>
            </Card>
          )}

        </div>
      </PageContent>
    </PageContainer>
  );
}
