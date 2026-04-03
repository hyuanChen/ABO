// src/components/ModuleConfigPanel.tsx
// Module configuration management for crawlers with subscription support

import { useEffect, useState } from "react";
import {
  Settings, Clock, Globe, ToggleLeft, ToggleRight, RefreshCw,
  Plus, X, Users, Hash, Podcast, HelpCircle, BookHeart, PlayCircle, Headphones
} from "lucide-react";
import { api } from "../core/api";
import { useStore } from "../core/store";

interface ModuleConfig {
  id: string;
  name: string;
  enabled: boolean;
  schedule: string;
  keywords?: string[];
  up_uids?: string[];
  user_ids?: string[];
  users?: string[];
  topics?: string[];
  podcast_ids?: string[];
  max_results?: number;
}

interface SubscriptionItem {
  type: string;
  label: string;
  placeholder: string;
  icon: React.ReactNode;
  value: string[];
  key: string;
}

export default function ModuleConfigPanel() {
  const [modules, setModules] = useState<ModuleConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [expandedModule, setExpandedModule] = useState<string | null>(null);
  const [newSubscriptions, setNewSubscriptions] = useState<Record<string, string>>({});
  const [newKeywords, setNewKeywords] = useState<Record<string, string>>({});
  const { addToast } = useStore();

  useEffect(() => {
    loadModules();
  }, []);

  async function loadModules() {
    try {
      setLoading(true);
      const data = await api.get<{ modules: any[] }>("/api/modules");

      // Fetch detailed config for each module
      const configs: ModuleConfig[] = [];
      for (const m of data.modules) {
        try {
          const configData = await api.get<ModuleConfig>(`/api/modules/${m.id}/config`);
          configs.push({
            ...configData,
            schedule: m.schedule || "0 10 * * *",
          });
        } catch {
          // Fallback to basic info if config fetch fails
          configs.push({
            id: m.id,
            name: m.name,
            enabled: m.enabled,
            schedule: m.schedule || "0 10 * * *",
            keywords: getDefaultKeywords(m.id),
            max_results: 20,
          });
        }
      }

      setModules(configs);
    } catch (e) {
      console.error("Failed to load modules:", e);
      addToast({ kind: "error", title: "加载模块配置失败" });
    } finally {
      setLoading(false);
    }
  }

  function getDefaultKeywords(moduleId: string): string[] {
    const defaults: Record<string, string[]> = {
      "xiaohongshu-tracker": ["科研工具", "论文写作", "学术日常"],
      "bilibili-tracker": ["深度学习", "机器学习", "论文解读"],
      "xiaoyuzhou-tracker": ["科技", "商业", "文化"],
      "zhihu-tracker": ["人工智能", "科研", "学术"],
      "arxiv-tracker": ["computer vision", "nlp", "multimodal"],
      "semantic-scholar-tracker": ["VGGT", "Gaussian Splatting", "NeRF"],
    };
    return defaults[moduleId] || [];
  }

  async function toggleModule(moduleId: string, enabled: boolean) {
    try {
      setSaving(moduleId);
      await api.patch(`/api/modules/${moduleId}/toggle`, {});

      setModules((prev) =>
        prev.map((m) => (m.id === moduleId ? { ...m, enabled: !enabled } : m))
      );

      addToast({
        kind: "success",
        title: enabled ? "模块已禁用" : "模块已启用",
      });
    } catch (e) {
      addToast({ kind: "error", title: "操作失败" });
    } finally {
      setSaving(null);
    }
  }

  async function addSubscription(moduleId: string, type: string, value: string) {
    if (!value.trim()) return;

    try {
      await api.post(`/api/modules/${moduleId}/subscriptions`, {
        type,
        value: value.trim(),
      });

      // Refresh module config
      const configData = await api.get<ModuleConfig>(`/api/modules/${moduleId}/config`);
      setModules((prev) =>
        prev.map((m) =>
          m.id === moduleId
            ? { ...m, ...configData, schedule: m.schedule }
            : m
        )
      );

      // Clear input
      setNewSubscriptions((prev) => ({ ...prev, [`${moduleId}-${type}`]: "" }));

      addToast({ kind: "success", title: "订阅添加成功" });
    } catch (e) {
      addToast({ kind: "error", title: "添加订阅失败" });
    }
  }

  async function removeSubscription(moduleId: string, type: string, value: string) {
    try {
      await api.delete(`/api/modules/${moduleId}/subscriptions`, {
        type,
        value,
      });

      // Refresh module config
      const configData = await api.get<ModuleConfig>(`/api/modules/${moduleId}/config`);
      setModules((prev) =>
        prev.map((m) =>
          m.id === moduleId
            ? { ...m, ...configData, schedule: m.schedule }
            : m
        )
      );

      addToast({ kind: "success", title: "订阅已移除" });
    } catch (e) {
      addToast({ kind: "error", title: "移除订阅失败" });
    }
  }

  async function addKeyword(moduleId: string, keyword: string) {
    if (!keyword.trim()) return;

    const module = modules.find((m) => m.id === moduleId);
    if (!module) return;

    const currentKeywords = module.keywords || [];
    if (currentKeywords.includes(keyword.trim())) {
      addToast({ kind: "info", title: "关键词已存在" });
      return;
    }

    try {
      const newKeywords = [...currentKeywords, keyword.trim()];
      await api.post(`/api/modules/${moduleId}/config`, {
        keywords: newKeywords,
      });

      setModules((prev) =>
        prev.map((m) =>
          m.id === moduleId ? { ...m, keywords: newKeywords } : m
        )
      );

      setNewKeywords((prev) => ({ ...prev, [moduleId]: "" }));
      addToast({ kind: "success", title: "关键词添加成功" });
    } catch (e) {
      addToast({ kind: "error", title: "添加关键词失败" });
    }
  }

  async function removeKeyword(moduleId: string, keyword: string) {
    const module = modules.find((m) => m.id === moduleId);
    if (!module) return;

    try {
      const newKeywords = (module.keywords || []).filter((k) => k !== keyword);
      await api.post(`/api/modules/${moduleId}/config`, {
        keywords: newKeywords,
      });

      setModules((prev) =>
        prev.map((m) =>
          m.id === moduleId ? { ...m, keywords: newKeywords } : m
        )
      );

      addToast({ kind: "success", title: "关键词已移除" });
    } catch (e) {
      addToast({ kind: "error", title: "移除关键词失败" });
    }
  }

  function getScheduleDescription(schedule: string): string {
    if (schedule === "0 8 * * *") return "每天 8:00";
    if (schedule === "0 9 * * *") return "每天 9:00";
    if (schedule === "0 10 * * *") return "每天 10:00";
    if (schedule === "0 11 * * *") return "每天 11:00";
    if (schedule === "0 12 * * *") return "每天 12:00";
    if (schedule === "0 13 * * *") return "每天 13:00";
    if (schedule.startsWith("*/5")) return "每5分钟";
    return schedule;
  }

  function getModuleIcon(moduleId: string): React.ReactNode {
    const icons: Record<string, React.ReactNode> = {
      "xiaohongshu-tracker": <BookHeart className="w-5 h-5" />,
      "bilibili-tracker": <PlayCircle className="w-5 h-5" />,
      "xiaoyuzhou-tracker": <Headphones className="w-5 h-5" />,
      "zhihu-tracker": <HelpCircle className="w-5 h-5" />,
      "arxiv-tracker": <Globe className="w-5 h-5" />,
      "semantic-scholar-tracker": <Settings className="w-5 h-5" />,
      "folder-monitor": <Settings className="w-5 h-5" />,
    };
    return icons[moduleId] || <Globe className="w-5 h-5" />;
  }

  function getSubscriptionConfig(moduleId: string): SubscriptionItem[] {
    const module = modules.find((m) => m.id === moduleId);
    if (!module) return [];

    const configs: Record<string, SubscriptionItem[]> = {
      "bilibili-tracker": [
        {
          type: "up_uid",
          label: "UP主 UID",
          placeholder: "输入UP主UID或空间链接",
          icon: <Users className="w-4 h-4" />,
          value: module.up_uids || [],
          key: "up_uids",
        },
      ],
      "xiaohongshu-tracker": [
        {
          type: "user_id",
          label: "用户ID",
          placeholder: "输入用户ID或主页链接",
          icon: <BookHeart className="w-4 h-4" />,
          value: module.user_ids || [],
          key: "user_ids",
        },
      ],
      "zhihu-tracker": [
        {
          type: "user",
          label: "用户",
          placeholder: "输入知乎用户ID或主页链接",
          icon: <Users className="w-4 h-4" />,
          value: module.users || [],
          key: "users",
        },
        {
          type: "topic",
          label: "话题",
          placeholder: "输入话题ID或话题链接",
          icon: <Hash className="w-4 h-4" />,
          value: module.topics || [],
          key: "topics",
        },
      ],
      "xiaoyuzhou-tracker": [
        {
          type: "podcast_id",
          label: "播客",
          placeholder: "输入播客ID或播客链接",
          icon: <Podcast className="w-4 h-4" />,
          value: module.podcast_ids || [],
          key: "podcast_ids",
        },
      ],
    };

    return configs[moduleId] || [];
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40" style={{ color: "var(--text-muted)" }}>
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
        加载模块配置...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2" style={{ color: "var(--text-main)" }}>
          <Settings className="w-5 h-5" style={{ color: "var(--color-primary)" }} />
          爬虫模块配置
        </h3>
        <button
          onClick={loadModules}
          className="text-xs flex items-center gap-1 transition-colors hover:opacity-80"
          style={{ color: "var(--text-muted)" }}
        >
          <RefreshCw className="w-3 h-3" />
          刷新
        </button>
      </div>

      <div className="grid gap-3">
        {modules.map((module) => {
          const isExpanded = expandedModule === module.id;
          const subscriptionConfig = getSubscriptionConfig(module.id);
          const hasSubscriptions = subscriptionConfig.length > 0;

          return (
            <div
              key={module.id}
              className="rounded-lg border transition-all"
              style={{
                background: module.enabled ? "var(--bg-card)" : "var(--bg-hover)",
                borderColor: module.enabled ? "var(--color-success)" : "var(--border-light)",
                opacity: module.enabled ? 1 : 0.7,
              }}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div style={{ color: module.enabled ? "var(--color-primary)" : "var(--text-muted)" }}>
                    {getModuleIcon(module.id)}
                  </div>
                  <div>
                    <div className="font-medium" style={{ color: "var(--text-main)" }}>{module.name}</div>
                    <div className="flex items-center gap-3 text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {getScheduleDescription(module.schedule)}
                      </span>
                      {module.keywords && module.keywords.length > 0 && (
                        <span className="flex items-center gap-1">
                          <Hash className="w-3 h-3" />
                          {module.keywords.length} 个关键词
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {hasSubscriptions && module.enabled && (
                    <button
                      onClick={() => setExpandedModule(isExpanded ? null : module.id)}
                      className="text-xs px-3 py-1.5 rounded-md transition-colors"
                      style={{
                        background: isExpanded ? "var(--color-primary)" : "var(--bg-hover)",
                        color: isExpanded ? "white" : "var(--text-secondary)",
                      }}
                    >
                      {isExpanded ? "收起" : "配置"}
                    </button>
                  )}
                  <button
                    onClick={() => toggleModule(module.id, module.enabled)}
                    disabled={saving === module.id}
                    className="p-2 rounded-lg transition-colors"
                    style={{
                      color: module.enabled ? "var(--color-success)" : "var(--text-light)",
                    }}
                  >
                    {saving === module.id ? (
                      <RefreshCw className="w-5 h-5 animate-spin" />
                    ) : module.enabled ? (
                      <ToggleRight className="w-6 h-6" />
                    ) : (
                      <ToggleLeft className="w-6 h-6" />
                    )}
                  </button>
                </div>
              </div>

              {/* Expanded Configuration */}
              {isExpanded && module.enabled && (
                <div className="px-4 pb-4 space-y-4" style={{ borderTop: "1px solid var(--border-light)" }}>
                  {/* Keywords Section */}
                  <div className="pt-3">
                    <div className="text-sm font-medium mb-2 flex items-center gap-2" style={{ color: "var(--text-secondary)" }}>
                      <Hash className="w-4 h-4" />
                      关键词筛选
                    </div>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {(module.keywords || []).map((kw) => (
                        <span
                          key={kw}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs"
                          style={{
                            background: "var(--bg-hover)",
                            color: "var(--text-secondary)",
                          }}
                        >
                          {kw}
                          <button
                            onClick={() => removeKeyword(module.id, kw)}
                            className="hover:opacity-70"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newKeywords[module.id] || ""}
                        onChange={(e) => setNewKeywords((prev) => ({ ...prev, [module.id]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            addKeyword(module.id, newKeywords[module.id] || "");
                          }
                        }}
                        placeholder="添加关键词..."
                        className="flex-1 px-3 py-1.5 rounded text-sm"
                        style={{
                          background: "var(--bg-hover)",
                          color: "var(--text-main)",
                          border: "1px solid var(--border-light)",
                        }}
                      />
                      <button
                        onClick={() => addKeyword(module.id, newKeywords[module.id] || "")}
                        className="px-3 py-1.5 rounded text-sm flex items-center gap-1"
                        style={{
                          background: "var(--color-primary)",
                          color: "white",
                        }}
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Subscriptions Section */}
                  {subscriptionConfig.map((sub) => (
                    <div key={sub.type} className="pt-2">
                      <div className="text-sm font-medium mb-2 flex items-center gap-2" style={{ color: "var(--text-secondary)" }}>
                        {sub.icon}
                        {sub.label}订阅
                      </div>
                      <div className="space-y-2 mb-2">
                        {sub.value.map((item) => (
                          <div
                            key={item}
                            className="flex items-center justify-between px-3 py-2 rounded text-sm"
                            style={{
                              background: "var(--bg-hover)",
                              color: "var(--text-main)",
                            }}
                          >
                            <span className="truncate flex-1">{item}</span>
                            <button
                              onClick={() => removeSubscription(module.id, sub.type, item)}
                              className="p-1 rounded hover:opacity-70"
                              style={{ color: "var(--color-danger)" }}
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newSubscriptions[`${module.id}-${sub.type}`] || ""}
                          onChange={(e) =>
                            setNewSubscriptions((prev) => ({
                              ...prev,
                              [`${module.id}-${sub.type}`]: e.target.value,
                            }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              addSubscription(
                                module.id,
                                sub.type,
                                newSubscriptions[`${module.id}-${sub.type}`] || ""
                              );
                            }
                          }}
                          placeholder={sub.placeholder}
                          className="flex-1 px-3 py-1.5 rounded text-sm"
                          style={{
                            background: "var(--bg-hover)",
                            color: "var(--text-main)",
                            border: "1px solid var(--border-light)",
                          }}
                        />
                        <button
                          onClick={() =>
                            addSubscription(
                              module.id,
                              sub.type,
                              newSubscriptions[`${module.id}-${sub.type}`] || ""
                            )
                          }
                          className="px-3 py-1.5 rounded text-sm flex items-center gap-1"
                          style={{
                            background: "var(--color-primary)",
                            color: "white",
                          }}
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 mt-4">
        <div className="rounded-lg p-3 text-center" style={{ background: "var(--bg-hover)" }}>
          <div className="text-2xl font-bold" style={{ color: "var(--color-success)" }}>
            {modules.filter((m) => m.enabled).length}
          </div>
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>已启用</div>
        </div>
        <div className="rounded-lg p-3 text-center" style={{ background: "var(--bg-hover)" }}>
          <div className="text-2xl font-bold" style={{ color: "var(--text-light)" }}>
            {modules.filter((m) => !m.enabled).length}
          </div>
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>已禁用</div>
        </div>
      </div>
    </div>
  );
}
