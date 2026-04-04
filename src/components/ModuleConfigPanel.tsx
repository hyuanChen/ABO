// src/components/ModuleConfigPanel.tsx
// Lightweight module overview panel that navigates to ModuleDetail for editing

import { useEffect, useState } from "react";
import { Settings, Clock, Globe, RefreshCw, Hash } from "lucide-react";
import { api } from "../core/api";
import { useStore } from "../core/store";
import ToggleSwitch from "./ToggleSwitch";
import SchedulerTimeline from "./SchedulerTimeline";

interface ModuleConfig {
  id: string;
  name: string;
  enabled: boolean;
  schedule: string;
  keywords?: string[];
}

export default function ModuleConfigPanel() {
  const [modules, setModules] = useState<ModuleConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const { addToast, setModuleToConfigure } = useStore();

  useEffect(() => {
    loadModules();
  }, []);

  async function loadModules() {
    try {
      setLoading(true);
      const data = await api.get<{ modules: any[] }>("/api/modules");

      const configs: ModuleConfig[] = [];
      for (const m of data.modules) {
        try {
          const configData = await api.get<ModuleConfig>(`/api/modules/${m.id}/config`);
          configs.push({
            ...configData,
            schedule: m.schedule || "0 10 * * *",
          });
        } catch {
          configs.push({
            id: m.id,
            name: m.name,
            enabled: m.enabled,
            schedule: m.schedule || "0 10 * * *",
            keywords: [],
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

  async function toggleModule(moduleId: string, currentEnabled: boolean) {
    try {
      await api.patch(`/api/modules/${moduleId}`, { enabled: !currentEnabled });
      setModules((prev) =>
        prev.map((m) => (m.id === moduleId ? { ...m, enabled: !currentEnabled } : m))
      );
      addToast({ kind: "success", title: currentEnabled ? "模块已禁用" : "模块已启用" });
    } catch {
      addToast({ kind: "error", title: "操作失败" });
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
    // Keep icon mapping lightweight; same icons as before
    const icons: Record<string, React.ReactNode> = {
      "xiaohongshu-tracker": <span className="text-lg">📕</span>,
      "bilibili-tracker": <span className="text-lg">📺</span>,
      "xiaoyuzhou-tracker": <span className="text-lg">🎙️</span>,
      "zhihu-tracker": <span className="text-lg">💡</span>,
      "arxiv-tracker": <Globe className="w-5 h-5" />,
      "semantic-scholar-tracker": <Settings className="w-5 h-5" />,
      "folder-monitor": <Settings className="w-5 h-5" />,
    };
    return icons[moduleId] || <Globe className="w-5 h-5" />;
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
          爬虫模块
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
        {modules.map((module) => (
          <div
            key={module.id}
            onClick={() => setModuleToConfigure(module.id)}
            className="rounded-lg border transition-all cursor-pointer"
            style={{
              background: module.enabled ? "var(--bg-card)" : "var(--bg-hover)",
              borderColor: module.enabled ? "var(--color-success)" : "var(--border-light)",
              opacity: module.enabled ? 1 : 0.7,
            }}
          >
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
                <ToggleSwitch
                  enabled={module.enabled}
                  onChange={() => toggleModule(module.id, module.enabled)}
                  size="sm"
                />
                <span
                  className="text-xs px-2 py-1 rounded-md"
                  style={{
                    background: module.enabled ? "rgba(16,185,129,0.15)" : "var(--bg-hover)",
                    color: module.enabled ? "var(--color-success)" : "var(--text-muted)",
                  }}
                >
                  {module.enabled ? "已启用" : "已禁用"}
                </span>
                <Settings className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
              </div>
            </div>
          </div>
        ))}
      </div>

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

      <div style={{ marginTop: "20px" }}>
        <h4
          style={{
            fontSize: "0.9375rem",
            fontWeight: 600,
            marginBottom: "12px",
            color: "var(--text-main)",
          }}
        >
          定时任务
        </h4>
        <SchedulerTimeline />
      </div>
    </div>
  );
}
