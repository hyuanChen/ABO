// src/components/ModuleConfigPanel.tsx
// Module configuration management for crawlers

import { useEffect, useState } from "react";
import { Settings, Clock, Globe, ToggleLeft, ToggleRight, RefreshCw } from "lucide-react";
import { api } from "../core/api";
import { useStore } from "../core/store";

interface ModuleConfig {
  id: string;
  name: string;
  enabled: boolean;
  schedule: string;
  keywords?: string[];
  user_ids?: string[];
  max_results?: number;
}

export default function ModuleConfigPanel() {
  const [modules, setModules] = useState<ModuleConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const { addToast } = useStore();

  useEffect(() => {
    loadModules();
  }, []);

  async function loadModules() {
    try {
      setLoading(true);
      const data = await api.get<{ modules: any[] }>("/api/modules");

      // Transform to config format
      const configs: ModuleConfig[] = data.modules.map((m) => ({
        id: m.id,
        name: m.name,
        enabled: m.enabled,
        schedule: m.schedule || "0 10 * * *",
        keywords: m.keywords || getDefaultKeywords(m.id),
        max_results: m.max_results || 20,
      }));

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

  function getScheduleDescription(schedule: string): string {
    if (schedule === "0 9 * * *") return "每天 9:00";
    if (schedule === "0 10 * * *") return "每天 10:00";
    if (schedule === "0 11 * * *") return "每天 11:00";
    if (schedule === "0 12 * * *") return "每天 12:00";
    return schedule;
  }

  function getModuleIcon(moduleId: string): string {
    const icons: Record<string, string> = {
      "xiaohongshu-tracker": "📕",
      "bilibili-tracker": "📺",
      "xiaoyuzhou-tracker": "🎧",
      "zhihu-tracker": "❓",
      "arxiv-tracker": "📄",
      "semantic-scholar-tracker": "🔬",
      "folder-monitor": "📁",
      "podcast-digest": "🎙️",
    };
    return icons[moduleId] || "🔧";
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 text-slate-500">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
        加载模块配置...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Settings className="w-5 h-5 text-indigo-400" />
          爬虫模块配置
        </h3>
        <button
          onClick={loadModules}
          className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
        >
          <RefreshCw className="w-3 h-3" />
          刷新
        </button>
      </div>

      <div className="grid gap-3">
        {modules.map((module) => (
          <div
            key={module.id}
            className={`bg-slate-800/50 rounded-lg p-4 border transition-all ${
              module.enabled
                ? "border-emerald-800/50 hover:border-emerald-700"
                : "border-slate-700/50 opacity-60"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{getModuleIcon(module.id)}</span>
                <div>
                  <div className="font-medium text-white">{module.name}</div>
                  <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {getScheduleDescription(module.schedule)}
                    </span>
                    {module.keywords && module.keywords.length > 0 && (
                      <span className="flex items-center gap-1">
                        <Globe className="w-3 h-3" />
                        {module.keywords.slice(0, 3).join(", ")}
                        {module.keywords.length > 3 && "..."}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <button
                onClick={() => toggleModule(module.id, module.enabled)}
                disabled={saving === module.id}
                className={`p-2 rounded-lg transition-colors ${
                  module.enabled
                    ? "text-emerald-400 hover:bg-emerald-950/30"
                    : "text-slate-500 hover:bg-slate-700/50"
                }`}
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

            {/* Keywords display */}
            {module.enabled && module.keywords && module.keywords.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-700/50">
                <div className="flex flex-wrap gap-2">
                  {module.keywords.map((kw) => (
                    <span
                      key={kw}
                      className="px-2 py-1 bg-slate-700/50 rounded text-xs text-slate-300"
                    >
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 mt-4">
        <div className="bg-slate-800/30 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-emerald-400">
            {modules.filter((m) => m.enabled).length}
          </div>
          <div className="text-xs text-slate-500">已启用</div>
        </div>
        <div className="bg-slate-800/30 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-slate-400">
            {modules.filter((m) => !m.enabled).length}
          </div>
          <div className="text-xs text-slate-500">已禁用</div>
        </div>
      </div>
    </div>
  );
}
