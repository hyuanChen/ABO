import { useEffect, useState } from "react";
import { ArrowLeft, Play, Clock, Calendar, User, Plus, X, Trash2, HelpCircle, History, Info, ChevronDown, ChevronUp } from "lucide-react";
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

const BILIBILI_GROUP_OPTIONS = [
  { value: "ai-tech", label: "AI科技" },
  { value: "study", label: "学习知识" },
  { value: "digital", label: "数码影音" },
  { value: "game", label: "游戏" },
  { value: "finance", label: "财经商业" },
  { value: "creative", label: "设计创作" },
  { value: "entertainment", label: "生活娱乐" },
  { value: "other", label: "其他" },
];

const XHS_CREATOR_GROUP_OPTIONS = [
  { value: "research", label: "科研学习" },
  { value: "writing", label: "论文写作" },
  { value: "ai", label: "AI工具" },
  { value: "productivity", label: "效率知识库" },
  { value: "study_abroad", label: "留学读博" },
  { value: "lifestyle", label: "日常生活" },
  { value: "other", label: "其他" },
];

const BILIBILI_DYNAMIC_TYPE_OPTIONS = [
  { value: 8, label: "视频" },
  { value: 2, label: "图文" },
  { value: 4, label: "文字" },
  { value: 64, label: "专栏" },
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
  followed_up_groups?: string[];
  followed_up_original_groups?: number[];
  sessdata?: string;
  api_key?: string;
  cookie?: string;
  web_session?: string;
  id_token?: string;
  enable_keyword_search?: boolean;
  keyword_min_likes?: number;
  keyword_search_limit?: number;
  follow_feed?: boolean;
  follow_feed_types?: number[];
  fetch_follow_limit?: number;
  creator_push_enabled?: boolean;
  keyword_filter?: boolean;
  followed_up_group_options?: { value: string; label: string }[];
  creator_groups?: string[];
  creator_group_options?: { value: string; label: string }[];
  creator_profiles?: Record<string, {
    author?: string;
    author_id?: string;
    smart_groups?: string[];
    latest_title?: string;
    sample_titles?: string[];
  }>;
}

interface BilibiliOriginalGroupOption {
  tag_id: number;
  name: string;
  count: number;
  tip: string;
}

interface BilibiliFollowedUpsConfigResponse {
  total: number;
  groups: BilibiliOriginalGroupOption[];
  ups: Array<{
    mid: string;
    uname: string;
    tag_ids: number[];
    tag_names: string[];
  }>;
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
  const [bilibiliOriginalGroups, setBilibiliOriginalGroups] = useState<BilibiliOriginalGroupOption[]>([]);
  const [loadingBilibiliGroups, setLoadingBilibiliGroups] = useState(false);
  const [showXhsCreatorConfig, setShowXhsCreatorConfig] = useState(false);

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

  useEffect(() => {
    if (module.id !== "bilibili-tracker") return;
    if (!moduleConfig.sessdata?.trim()) {
      setBilibiliOriginalGroups([]);
      return;
    }

    let cancelled = false;
    setLoadingBilibiliGroups(true);
    api.post<BilibiliFollowedUpsConfigResponse>("/api/tools/bilibili/followed-ups", {
      sessdata: moduleConfig.sessdata,
      max_count: 5000,
    })
      .then((res) => {
        if (!cancelled) {
          setBilibiliOriginalGroups(res.groups || []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBilibiliOriginalGroups([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingBilibiliGroups(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [module.id, moduleConfig.sessdata]);

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

  async function saveModuleConfig(patch: Partial<ModuleConfig>, successTitle = "已保存") {
    try {
      const nextConfig = { ...moduleConfig, ...patch };
      await api.post(`/api/modules/${module.id}/config`, nextConfig);
      setModuleConfig(nextConfig);
      toast.success(successTitle);
    } catch {
      toast.error("保存失败");
    }
  }

  function toggleBilibiliGroup(group: string) {
    const current = moduleConfig.followed_up_groups || [];
    const next = current.includes(group)
      ? current.filter((item) => item !== group)
      : [...current, group];
    setModuleConfig({ ...moduleConfig, followed_up_groups: next });
  }

  function toggleBilibiliOriginalGroup(groupId: number) {
    const current = moduleConfig.followed_up_original_groups || [];
    const next = current.includes(groupId)
      ? current.filter((item) => item !== groupId)
      : [...current, groupId];
    setModuleConfig({ ...moduleConfig, followed_up_original_groups: next });
  }

  function toggleXhsCreatorGroup(group: string) {
    const current = moduleConfig.creator_groups || [];
    const next = current.includes(group)
      ? current.filter((item) => item !== group)
      : [...current, group];
    setModuleConfig({ ...moduleConfig, creator_groups: next });
  }

  function toggleBilibiliDynamicType(type: number) {
    const current = moduleConfig.follow_feed_types || [8, 2, 4, 64];
    if (current.includes(type) && current.length === 1) {
      return;
    }
    const next = current.includes(type)
      ? current.filter((item) => item !== type)
      : [...current, type].sort((a, b) => a - b);
    setModuleConfig({ ...moduleConfig, follow_feed_types: next });
  }

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
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-secondary)" }}>
                    SESSDATA
                  </label>
                  <input
                    type="password"
                    value={moduleConfig.sessdata || ""}
                    onChange={(e) => setModuleConfig({ ...moduleConfig, sessdata: e.target.value })}
                    placeholder="从 Cookie-Editor 复制 SESSDATA 的值"
                    style={{
                      padding: "10px 14px",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--border-light)",
                      background: "var(--bg-app)",
                      color: "var(--text-main)",
                      fontSize: "0.875rem",
                      outline: "none",
                      fontFamily: "monospace",
                    }}
                  />
                </div>
                <CookieGuide platform="bilibili" cookieName="SESSDATA" />
                <button
                  onClick={async () => {
                    await saveModuleConfig({
                      sessdata: moduleConfig.sessdata || "",
                    }, "Cookie 已保存");
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

          {module.id === "bilibili-tracker" && (
            <Card title="自动爬取策略" icon={<span style={{ fontSize: "16px" }}>🕸️</span>}>
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
                  padding: "12px 14px",
                  borderRadius: "var(--radius-md)",
                  background: "var(--bg-hover)",
                  border: "1px solid var(--border-light)",
                }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: 1 }}>
                    <span style={{ fontSize: "0.875rem", color: "var(--text-main)", fontWeight: 500 }}>
                      关注流自动爬取
                    </span>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      定时抓取你的关注动态，再按指定 UP 和关注分组过滤。
                    </span>
                  </div>
                  <input
                    type="number"
                    min={1}
                    value={moduleConfig.fetch_follow_limit ?? 20}
                    onChange={(e) => setModuleConfig({
                      ...moduleConfig,
                      fetch_follow_limit: Number(e.target.value || 1),
                    })}
                    style={{
                      width: "88px",
                      padding: "8px 10px",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--border-light)",
                      background: "var(--bg-app)",
                      color: "var(--text-main)",
                      fontSize: "0.8125rem",
                      outline: "none",
                    }}
                  />
                  <div
                    onClick={() => setModuleConfig({ ...moduleConfig, follow_feed: !(moduleConfig.follow_feed ?? false) })}
                    style={{
                      width: "40px",
                      height: "22px",
                      borderRadius: "11px",
                      background: (moduleConfig.follow_feed ?? false) ? "var(--color-primary)" : "var(--text-muted)",
                      position: "relative",
                      cursor: "pointer",
                      transition: "background 0.2s",
                      flexShrink: 0,
                    }}
                  >
                    <div style={{
                      width: "18px",
                      height: "18px",
                      borderRadius: "50%",
                      background: "white",
                      position: "absolute",
                      top: "2px",
                      left: (moduleConfig.follow_feed ?? false) ? "20px" : "2px",
                      transition: "left 0.2s",
                    }} />
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-secondary)" }}>
                    关键词推送
                  </label>
                  <input
                    type="text"
                    value={(moduleConfig.keywords || []).join(", ")}
                    onChange={(e) => setModuleConfig({
                      ...moduleConfig,
                      keywords: e.target.value.split(",").map(s => s.trim()).filter(Boolean),
                    })}
                    placeholder="科研, 学术, AI, 论文"
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
                </div>

                <div style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  padding: "12px 14px",
                  borderRadius: "var(--radius-md)",
                  background: "var(--bg-hover)",
                  border: "1px solid var(--border-light)",
                }}>
                  <div style={{ fontSize: "0.875rem", color: "var(--text-main)", fontWeight: 600 }}>
                    分组推送
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
                    你可以在这里决定具体开启哪些分组的推送。原始分组是 B 站里手动维护的分组，智能分组是在原始分组基础上的进一步细分。
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                    <span>已开原始分组 {(moduleConfig.followed_up_original_groups || []).length} 个</span>
                    <span>已开智能分组 {(moduleConfig.followed_up_groups || []).length} 个</span>
                    <span>都不选时表示不过滤分组，按关键词抓全部关注动态</span>
                  </div>
                </div>

                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
                  padding: "12px 14px",
                  borderRadius: "var(--radius-md)",
                  background: "var(--bg-hover)",
                  border: "1px solid var(--border-light)",
                }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: 1 }}>
                    <span style={{ fontSize: "0.875rem", color: "var(--text-main)", fontWeight: 500 }}>
                      启用关键词过滤
                    </span>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      关闭后会抓取选中的 UP 和分组下的全部动态。
                    </span>
                  </div>
                  <div
                    onClick={() => setModuleConfig({ ...moduleConfig, keyword_filter: !(moduleConfig.keyword_filter ?? true) })}
                    style={{
                      width: "40px",
                      height: "22px",
                      borderRadius: "11px",
                      background: (moduleConfig.keyword_filter ?? true) ? "var(--color-primary)" : "var(--text-muted)",
                      position: "relative",
                      cursor: "pointer",
                      transition: "background 0.2s",
                      flexShrink: 0,
                    }}
                  >
                    <div style={{
                      width: "18px",
                      height: "18px",
                      borderRadius: "50%",
                      background: "white",
                      position: "absolute",
                      top: "2px",
                      left: (moduleConfig.keyword_filter ?? true) ? "20px" : "2px",
                      transition: "left 0.2s",
                    }} />
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <label style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-secondary)" }}>
                    动态类型
                  </label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {BILIBILI_DYNAMIC_TYPE_OPTIONS.map((option) => {
                      const active = (moduleConfig.follow_feed_types || [8, 2, 4, 64]).includes(option.value);
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => toggleBilibiliDynamicType(option.value)}
                          style={{
                            padding: "7px 12px",
                            borderRadius: "999px",
                            border: `1px solid ${active ? "var(--color-primary)" : "var(--border-light)"}`,
                            background: active ? "rgba(99, 102, 241, 0.12)" : "var(--bg-app)",
                            color: active ? "var(--color-primary)" : "var(--text-secondary)",
                            fontSize: "0.8125rem",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <label style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-secondary)" }}>
                    开启原始分组推送
                  </label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {loadingBilibiliGroups ? (
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>正在读取 B 站原始分组...</span>
                    ) : bilibiliOriginalGroups.length > 0 ? (
                      bilibiliOriginalGroups.map((group) => {
                        const active = (moduleConfig.followed_up_original_groups || []).includes(group.tag_id);
                        return (
                          <button
                            key={group.tag_id}
                            type="button"
                            onClick={() => toggleBilibiliOriginalGroup(group.tag_id)}
                            title={group.tip || group.name}
                            style={{
                              padding: "7px 12px",
                              borderRadius: "999px",
                              border: `1px solid ${active ? "#FB7299" : "var(--border-light)"}`,
                              background: active ? "rgba(251, 114, 153, 0.12)" : "var(--bg-app)",
                              color: active ? "#D64078" : "var(--text-secondary)",
                              fontSize: "0.8125rem",
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            {group.name} {group.count ? `· ${group.count}` : ""}
                          </button>
                        );
                      })
                    ) : (
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        保存有效 SESSDATA 后会自动读取你在 B 站里的原始关注分组。
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: 0 }}>
                    这里对应的是你在 B 站里手动建的分组。选中的分组才会进入定时推送。
                  </p>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <label style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-secondary)" }}>
                    开启智能分组推送
                  </label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {(moduleConfig.followed_up_group_options || BILIBILI_GROUP_OPTIONS).map((option) => {
                      const active = (moduleConfig.followed_up_groups || []).includes(option.value);
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => toggleBilibiliGroup(option.value)}
                          style={{
                            padding: "7px 12px",
                            borderRadius: "999px",
                            border: `1px solid ${active ? "var(--color-primary)" : "var(--border-light)"}`,
                            background: active ? "rgba(99, 102, 241, 0.12)" : "var(--bg-app)",
                            color: active ? "var(--color-primary)" : "var(--text-secondary)",
                            fontSize: "0.8125rem",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                  <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: 0 }}>
                    智能分组会在原始分组基础上进一步细分。选中的细分组才会进入定时推送。
                  </p>
                </div>

                <button
                  onClick={async () => {
                    await saveModuleConfig({
                      sessdata: moduleConfig.sessdata || "",
                      keywords: moduleConfig.keywords || [],
                      follow_feed: moduleConfig.follow_feed ?? false,
                      follow_feed_types: moduleConfig.follow_feed_types || [8, 2, 4, 64],
                      fetch_follow_limit: moduleConfig.fetch_follow_limit ?? 20,
                      keyword_filter: moduleConfig.keyword_filter ?? true,
                      followed_up_original_groups: moduleConfig.followed_up_original_groups || [],
                      followed_up_groups: moduleConfig.followed_up_groups || [],
                    }, "B站爬取策略已保存");
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
                  保存爬取策略
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

          {/* 小红书 Cookie 配置 */}
          {module.id === "xiaohongshu-tracker" && (
            <Card title="小红书登录" icon={<span style={{ fontSize: "18px" }}>📕</span>}>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-secondary)" }}>
                    web_session
                  </label>
                  <input
                    type="password"
                    value={moduleConfig.web_session || ""}
                    onChange={(e) => setModuleConfig({ ...moduleConfig, web_session: e.target.value })}
                    placeholder="从 Cookie-Editor 复制 web_session 的值"
                    style={{
                      padding: "10px 14px",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--border-light)",
                      background: "var(--bg-app)",
                      color: "var(--text-main)",
                      fontSize: "0.875rem",
                      outline: "none",
                      fontFamily: "monospace",
                    }}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-secondary)" }}>
                    id_token <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 400 }}>(可选)</span>
                  </label>
                  <input
                    type="password"
                    value={moduleConfig.id_token || ""}
                    onChange={(e) => setModuleConfig({ ...moduleConfig, id_token: e.target.value })}
                    placeholder="从 Cookie-Editor 复制 id_token 的值"
                    style={{
                      padding: "10px 14px",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--border-light)",
                      background: "var(--bg-app)",
                      color: "var(--text-main)",
                      fontSize: "0.875rem",
                      outline: "none",
                      fontFamily: "monospace",
                    }}
                  />
                </div>
                <CookieGuide platform="xiaohongshu" cookieName="Cookie" />
                <button
                  onClick={async () => {
                    await saveModuleConfig({
                      web_session: moduleConfig.web_session || "",
                      id_token: moduleConfig.id_token || "",
                    });
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

          {module.id === "xiaohongshu-tracker" && (
            <Card title="自动爬取策略" icon={<span style={{ fontSize: "16px" }}>🕸️</span>}>
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div
                  onClick={() => setShowXhsCreatorConfig(!showXhsCreatorConfig)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "12px 14px",
                    borderRadius: "var(--radius-md)",
                    background: "var(--bg-hover)",
                    border: "1px solid var(--border-light)",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "4px" }}>
                    <span style={{ fontSize: "0.875rem", color: "var(--text-main)", fontWeight: 600 }}>
                      博主推送配置
                    </span>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      已同步博主 {(moduleConfig.user_ids || []).length} 个 · 已开智能分组 {(moduleConfig.creator_groups || []).length} 个
                    </span>
                  </div>
                  {showXhsCreatorConfig ? (
                    <ChevronUp style={{ width: "16px", height: "16px", color: "var(--text-muted)" }} />
                  ) : (
                    <ChevronDown style={{ width: "16px", height: "16px", color: "var(--text-muted)" }} />
                  )}
                </div>

                {showXhsCreatorConfig && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                      padding: "12px 14px",
                      borderRadius: "var(--radius-md)",
                      background: "var(--bg-hover)",
                      border: "1px solid var(--border-light)",
                    }}>
                      <div style={{ fontSize: "0.875rem", color: "var(--text-main)", fontWeight: 600 }}>
                        智能分组推送
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
                        和 B 站一样，博主先进入原始池，再根据最近样本内容做智能分组。选中的分组才会进入定时推送；都不选表示所有已同步博主都推送。
                      </div>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      <label style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-secondary)" }}>
                        开启智能分组推送
                      </label>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                        {(moduleConfig.creator_group_options || XHS_CREATOR_GROUP_OPTIONS).map((option) => {
                          const active = (moduleConfig.creator_groups || []).includes(option.value);
                          const profileCount = Object.values(moduleConfig.creator_profiles || {}).filter((profile) =>
                            (profile.smart_groups || []).includes(option.value)
                          ).length;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => toggleXhsCreatorGroup(option.value)}
                              style={{
                                padding: "7px 12px",
                                borderRadius: "999px",
                                border: `1px solid ${active ? "var(--color-primary)" : "var(--border-light)"}`,
                                background: active ? "rgba(99, 102, 241, 0.12)" : "var(--bg-app)",
                                color: active ? "var(--color-primary)" : "var(--text-secondary)",
                                fontSize: "0.8125rem",
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                            >
                              {option.label} {profileCount ? `· ${profileCount}` : ""}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      <label style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-secondary)" }}>
                        已同步博主池
                      </label>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                        {(moduleConfig.user_ids || []).length > 0 ? (
                          (moduleConfig.user_ids || []).map((userId) => {
                            const profile = moduleConfig.creator_profiles?.[userId];
                            const label = profile?.author || userId;
                            const groups = (profile?.smart_groups || []).map((group) =>
                              (moduleConfig.creator_group_options || XHS_CREATOR_GROUP_OPTIONS).find((item) => item.value === group)?.label || group
                            );
                            return (
                              <div
                                key={userId}
                                style={{
                                  padding: "8px 10px",
                                  borderRadius: "10px",
                                  border: "1px solid var(--border-light)",
                                  background: "var(--bg-app)",
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: "4px",
                                }}
                              >
                                <span style={{ fontSize: "0.8125rem", color: "var(--text-main)", fontWeight: 600 }}>{label}</span>
                                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{userId}</span>
                                {groups.length > 0 && (
                                  <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                                    {groups.join(" · ")}
                                  </span>
                                )}
                              </div>
                            );
                          })
                        ) : (
                          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                            先去小红书工具的“收藏反推博主”里同步候选博主，这里才会出现原始池和智能分组。
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-secondary)" }}>
                    关键词
                  </label>
                  <input
                    type="text"
                    value={(moduleConfig.keywords || []).join(", ")}
                    onChange={(e) => setModuleConfig({
                      ...moduleConfig,
                      keywords: e.target.value.split(",").map(s => s.trim()).filter(Boolean),
                    })}
                    placeholder="科研工具, 论文写作, 学术日常"
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
                    每个关键词会走小红书搜索页抓取，并按高赞优先回收笔记。
                  </p>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <label style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-secondary)" }}>
                      最低点赞数
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={moduleConfig.keyword_min_likes ?? 500}
                      onChange={(e) => setModuleConfig({
                        ...moduleConfig,
                        keyword_min_likes: Number(e.target.value || 0),
                      })}
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
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <label style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-secondary)" }}>
                      每个关键词抓取数
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={moduleConfig.keyword_search_limit ?? 10}
                      onChange={(e) => setModuleConfig({
                        ...moduleConfig,
                        keyword_search_limit: Number(e.target.value || 1),
                      })}
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
                  </div>
                </div>

                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
                  padding: "12px 14px",
                  borderRadius: "var(--radius-md)",
                  background: "var(--bg-hover)",
                  border: "1px solid var(--border-light)",
                }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <span style={{ fontSize: "0.875rem", color: "var(--text-main)", fontWeight: 500 }}>
                      关键词高赞爬取
                    </span>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      按关键词搜索并按点赞排序抓取。
                    </span>
                  </div>
                  <div
                    onClick={() => setModuleConfig({ ...moduleConfig, enable_keyword_search: !(moduleConfig.enable_keyword_search ?? true) })}
                    style={{
                      width: "40px",
                      height: "22px",
                      borderRadius: "11px",
                      background: (moduleConfig.enable_keyword_search ?? true) ? "var(--color-primary)" : "var(--text-muted)",
                      position: "relative",
                      cursor: "pointer",
                      transition: "background 0.2s",
                      flexShrink: 0,
                    }}
                  >
                    <div style={{
                      width: "18px",
                      height: "18px",
                      borderRadius: "50%",
                      background: "white",
                      position: "absolute",
                      top: "2px",
                      left: (moduleConfig.enable_keyword_search ?? true) ? "20px" : "2px",
                      transition: "left 0.2s",
                    }} />
                  </div>
                </div>

                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
                  padding: "12px 14px",
                  borderRadius: "var(--radius-md)",
                  background: "var(--bg-hover)",
                  border: "1px solid var(--border-light)",
                }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: 1 }}>
                    <span style={{ fontSize: "0.875rem", color: "var(--text-main)", fontWeight: 500 }}>
                      关注流爬取
                    </span>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      用当前账号的关注页抓取，再按关键词筛选。
                    </span>
                  </div>
                  <input
                    type="number"
                    min={1}
                    value={moduleConfig.fetch_follow_limit ?? 20}
                    onChange={(e) => setModuleConfig({
                      ...moduleConfig,
                      fetch_follow_limit: Number(e.target.value || 1),
                    })}
                    style={{
                      width: "88px",
                      padding: "8px 10px",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--border-light)",
                      background: "var(--bg-app)",
                      color: "var(--text-main)",
                      fontSize: "0.8125rem",
                      outline: "none",
                    }}
                  />
                  <div
                    onClick={() => setModuleConfig({ ...moduleConfig, follow_feed: !moduleConfig.follow_feed })}
                    style={{
                      width: "40px",
                      height: "22px",
                      borderRadius: "11px",
                      background: moduleConfig.follow_feed ? "var(--color-primary)" : "var(--text-muted)",
                      position: "relative",
                      cursor: "pointer",
                      transition: "background 0.2s",
                      flexShrink: 0,
                    }}
                  >
                    <div style={{
                      width: "18px",
                      height: "18px",
                      borderRadius: "50%",
                      background: "white",
                      position: "absolute",
                      top: "2px",
                      left: moduleConfig.follow_feed ? "20px" : "2px",
                      transition: "left 0.2s",
                    }} />
                  </div>
                </div>

                <button
                  onClick={async () => {
                    await saveModuleConfig({
                      keywords: moduleConfig.keywords || [],
                      enable_keyword_search: moduleConfig.enable_keyword_search ?? true,
                      keyword_min_likes: moduleConfig.keyword_min_likes ?? 500,
                      keyword_search_limit: moduleConfig.keyword_search_limit ?? 10,
                      follow_feed: moduleConfig.follow_feed ?? false,
                      fetch_follow_limit: moduleConfig.fetch_follow_limit ?? 20,
                      creator_groups: moduleConfig.creator_groups || [],
                    }, "爬取策略已保存");
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
                  保存爬取策略
                </button>
              </div>
            </Card>
          )}

          {/* 知乎 Cookie 配置 */}
          {module.id === "zhihu-tracker" && (
            <Card title="知乎登录" icon={<span style={{ fontSize: "18px" }}>❓</span>}>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <input
                  type="password"
                  value={moduleConfig.cookie || ""}
                  onChange={(e) => setModuleConfig({ ...moduleConfig, cookie: e.target.value })}
                  placeholder="粘贴知乎 Cookie..."
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
                <CookieGuide platform="zhihu" cookieName="Cookie" />
                <button
                  onClick={async () => {
                    try {
                      await api.post("/api/preferences", { modules: { [module.id]: { cookie: moduleConfig.cookie } } });
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
