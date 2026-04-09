// src/components/ModuleConfigPanel.tsx
// Compact module overview with inline detail modal

import { useEffect, useState } from "react";
import { Clock, RefreshCw, Hash, Settings, AlertCircle } from "lucide-react";
import { api } from "../core/api";
import { useStore } from "../core/store";
import ToggleSwitch from "./ToggleSwitch";
import { ModuleDetailModal } from "../modules/modules/ModuleDetailModal";
import type { ModuleConfig, ModuleDashboard } from "../types/module";

const MODULE_ICONS: Record<string, string> = {
  "xiaohongshu-tracker": "📕",
  "bilibili-tracker": "📺",
  "xiaoyuzhou-tracker": "🎙️",
  "zhihu-tracker": "💡",
  "arxiv-tracker": "📄",
  "semantic-scholar-tracker": "🔬",
  "folder-monitor": "📁",
};

const STATUS_DOT: Record<string, string> = {
  active: "#22c55e",
  paused: "#eab308",
  error: "#ef4444",
  unconfigured: "var(--text-light)",
};

function scheduleLabel(schedule: string): string {
  if (schedule === "0 8 * * *") return "每天 8:00";
  if (schedule === "0 9 * * *") return "每天 9:00";
  if (schedule === "0 10 * * *") return "每天 10:00";
  if (schedule === "0 11 * * *") return "每天 11:00";
  if (schedule === "0 12 * * *") return "每天 12:00";
  if (schedule === "0 13 * * *") return "每天 13:00";
  if (schedule.startsWith("*/5")) return "每5分钟";
  return schedule;
}

export default function ModuleConfigPanel() {
  const [modules, setModules] = useState<ModuleConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedModule, setSelectedModule] = useState<ModuleConfig | null>(null);
  const { addToast } = useStore();

  useEffect(() => { loadModules(); }, []);

  async function loadModules() {
    try {
      setLoading(true);
      const data = await api.get<ModuleDashboard>("/api/modules/dashboard");
      setModules(data.modules);
    } catch {
      // Fallback to basic API
      try {
        const data = await api.get<{ modules: any[] }>("/api/modules");
        setModules(data.modules.map((m: any) => ({
          id: m.id, name: m.name, description: "",
          icon: m.icon || "", status: m.enabled ? "active" as const : "paused" as const,
          schedule: m.schedule || "0 10 * * *",
          lastRun: null, nextRun: m.next_run || null,
          stats: { totalCards: 0, thisWeek: 0, successRate: 100, errorCount: 0 },
          config: { keywords: [], maxResults: 50 },
        })));
      } catch (e) {
        console.error("Failed to load modules:", e);
        addToast({ kind: "error", title: "加载模块失败" });
      }
    } finally {
      setLoading(false);
    }
  }

  async function toggleModule(moduleId: string) {
    const mod = modules.find(m => m.id === moduleId);
    if (!mod) return;
    const newStatus = mod.status === "active" ? "paused" : "active";
    try {
      await api.post(`/api/modules/${moduleId}/toggle`, { status: newStatus });
      setModules(prev => prev.map(m =>
        m.id === moduleId ? { ...m, status: newStatus as any } : m
      ));
      addToast({ kind: "success", title: newStatus === "active" ? "模块已启用" : "模块已暂停" });
    } catch {
      addToast({ kind: "error", title: "操作失败" });
    }
  }

  function handleUpdateModule(updatedModule: ModuleConfig) {
    setModules(prev => prev.map(m => m.id === updatedModule.id ? updatedModule : m));
    setSelectedModule(null);
    loadModules();
  }

  if (loading) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "80px", color: "var(--text-muted)", fontSize: "0.8125rem",
      }}>
        <RefreshCw style={{ width: "14px", height: "14px", animation: "spin 1s linear infinite", marginRight: "6px" }} />
        加载中...
      </div>
    );
  }

  const activeCount = modules.filter(m => m.status === "active").length;

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        {/* Summary */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: "6px",
        }}>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            {activeCount}/{modules.length} 个模块运行中
          </span>
          <button
            onClick={loadModules}
            style={{
              fontSize: "0.6875rem", color: "var(--text-muted)",
              background: "transparent", border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", gap: "3px",
            }}
          >
            <RefreshCw style={{ width: "10px", height: "10px" }} /> 刷新
          </button>
        </div>

        {/* Module list */}
        {modules.map((mod) => {
          const isActive = mod.status === "active";
          const hasError = mod.status === "error";
          const unconfigured = mod.status === "unconfigured";
          const kwCount = mod.config?.keywords?.length || 0;

          return (
            <div
              key={mod.id}
              onClick={() => setSelectedModule(mod)}
              style={{
                display: "flex", alignItems: "center", gap: "10px",
                padding: "10px 12px", borderRadius: "10px",
                background: isActive ? "var(--bg-hover)" : "transparent",
                cursor: "pointer", transition: "background 0.15s ease",
                opacity: isActive || hasError ? 1 : 0.65,
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "var(--bg-hover)"; }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
            >
              {/* Icon */}
              <span style={{ fontSize: "1.125rem", flexShrink: 0, lineHeight: 1 }}>
                {MODULE_ICONS[mod.id] || "🔧"}
              </span>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  {/* Status dot */}
                  <span style={{
                    width: "6px", height: "6px", borderRadius: "50%", flexShrink: 0,
                    background: STATUS_DOT[mod.status] || "var(--text-light)",
                  }} />
                  <span style={{
                    fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-main)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {mod.name}
                  </span>
                  {hasError && (
                    <AlertCircle style={{ width: "12px", height: "12px", color: "#ef4444", flexShrink: 0 }} />
                  )}
                </div>
                <div style={{
                  fontSize: "0.6875rem", color: "var(--text-muted)", marginTop: "2px",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {mod.description || scheduleLabel(mod.schedule)}
                  {unconfigured && !mod.description && " · 待配置"}
                </div>
                {/* Keywords + schedule tags */}
                <div style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  fontSize: "0.625rem", color: "var(--text-light)", marginTop: "3px",
                }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "2px" }}>
                    <Clock style={{ width: "8px", height: "8px" }} />
                    {scheduleLabel(mod.schedule)}
                  </span>
                  {kwCount > 0 && (
                    <span style={{ display: "flex", alignItems: "center", gap: "2px" }}>
                      <Hash style={{ width: "8px", height: "8px" }} />
                      {kwCount} 关键词
                    </span>
                  )}
                  {kwCount === 0 && unconfigured && (
                    <span style={{ color: "#eab308" }}>需要配置关键词</span>
                  )}
                </div>
              </div>

              {/* Right: toggle + settings icon */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}
                onClick={e => e.stopPropagation()}
              >
                <ToggleSwitch
                  enabled={isActive}
                  onChange={() => toggleModule(mod.id)}
                  size="sm"
                />
              </div>
              <Settings style={{
                width: "13px", height: "13px", color: "var(--text-light)",
                flexShrink: 0,
              }} />
            </div>
          );
        })}
      </div>

      {/* Detail Modal */}
      {selectedModule && (
        <ModuleDetailModal
          module={selectedModule}
          initialTab="config"
          onClose={() => setSelectedModule(null)}
          onUpdate={handleUpdateModule}
        />
      )}
    </>
  );
}
