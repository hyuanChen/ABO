import { useState, useEffect } from "react";
import {
  LayoutGrid, List, Search, AlertCircle, CheckCircle,
  PauseCircle, Settings, RefreshCw, Filter,
} from "lucide-react";
import { api } from "../../core/api";
import { useStore } from "../../core/store";
import { ModuleCard } from "./ModuleCard";
import { ModuleDetailModal } from "./ModuleDetailModal";
import type { ModuleConfig, ModuleDashboard, ModuleStatus } from "../../types/module";

type ViewMode = "grid" | "list";
type FilterType = "all" | "active" | "paused" | "error" | "unconfigured";

const FILTER_OPTIONS: { key: FilterType; label: string; icon: React.ReactNode }[] = [
  { key: "all", label: "全部", icon: <Filter style={{ width: "14px", height: "14px" }} /> },
  { key: "active", label: "运行中", icon: <CheckCircle style={{ width: "14px", height: "14px" }} /> },
  { key: "paused", label: "已暂停", icon: <PauseCircle style={{ width: "14px", height: "14px" }} /> },
  { key: "error", label: "错误", icon: <AlertCircle style={{ width: "14px", height: "14px" }} /> },
  { key: "unconfigured", label: "未配置", icon: <Settings style={{ width: "14px", height: "14px" }} /> },
];

const STAT_ITEMS = [
  { key: "total", label: "总模块", color: "var(--color-primary)", bg: "rgba(188,164,227,0.1)" },
  { key: "active", label: "运行中", color: "#22c55e", bg: "rgba(34,197,94,0.1)" },
  { key: "paused", label: "已暂停", color: "#eab308", bg: "rgba(234,179,8,0.1)" },
  { key: "error", label: "错误", color: "#ef4444", bg: "rgba(239,68,68,0.1)" },
  { key: "totalCardsThisWeek", label: "本周卡片", color: "#8b5cf6", bg: "rgba(139,92,246,0.1)" },
] as const;

export function ModuleManagementPanel() {
  const [dashboard, setDashboard] = useState<ModuleDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [filter, setFilter] = useState<FilterType>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedModule, setSelectedModule] = useState<ModuleConfig | null>(null);
  const [initialTab, setInitialTab] = useState<"overview" | "config" | "history">("overview");
  const [, setRunningModules] = useState<Set<string>>(new Set());
  const { addToast, moduleHistoryId, setModuleHistoryId } = useStore();

  useEffect(() => {
    loadDashboard();
    const interval = setInterval(loadDashboard, 30000);
    return () => clearInterval(interval);
  }, []);

  // Watch for sidebar sub-module click → open history
  useEffect(() => {
    if (moduleHistoryId && dashboard) {
      const mod = dashboard.modules.find((m) => m.id === moduleHistoryId);
      if (mod) {
        setInitialTab("history");
        setSelectedModule(mod);
      }
      setModuleHistoryId(null);
    }
  }, [moduleHistoryId, dashboard]);

  const loadDashboard = async () => {
    try {
      const data = await api.get<ModuleDashboard>("/api/modules/dashboard");
      setDashboard(data);
    } catch (err) {
      addToast({ kind: "error", title: "加载失败", message: err instanceof Error ? err.message : "无法加载模块数据" });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleModule = async (moduleId: string) => {
    const module = dashboard?.modules.find((m) => m.id === moduleId);
    if (!module) return;
    try {
      const newStatus = module.status === "active" ? "paused" : "active";
      await api.post(`/api/modules/${moduleId}/toggle`, { status: newStatus });
      setDashboard((prev) =>
        prev ? {
          ...prev,
          modules: prev.modules.map((m) => m.id === moduleId ? { ...m, status: newStatus as ModuleStatus } : m),
          summary: {
            ...prev.summary,
            active: newStatus === "active" ? prev.summary.active + 1 : prev.summary.active - 1,
            paused: newStatus === "paused" ? prev.summary.paused + 1 : prev.summary.paused - 1,
          },
        } : null
      );
      addToast({ kind: "success", title: "状态已更新", message: `模块已${newStatus === "active" ? "启动" : "暂停"}` });
    } catch (err) {
      addToast({ kind: "error", title: "操作失败", message: err instanceof Error ? err.message : "无法切换模块状态" });
    }
  };

  const handleRunModule = async (moduleId: string) => {
    try {
      setRunningModules((prev) => new Set(prev).add(moduleId));
      await api.post(`/api/modules/${moduleId}/run`, {});
      addToast({ kind: "success", title: "运行成功", message: "模块已开始运行" });
      setTimeout(loadDashboard, 2000);
    } catch (err) {
      addToast({ kind: "error", title: "运行失败", message: err instanceof Error ? err.message : "无法运行模块" });
    } finally {
      setRunningModules((prev) => { const next = new Set(prev); next.delete(moduleId); return next; });
    }
  };

  const handleUpdateModule = (updatedModule: ModuleConfig) => {
    setDashboard((prev) =>
      prev ? { ...prev, modules: prev.modules.map((m) => m.id === updatedModule.id ? updatedModule : m) } : null
    );
    setSelectedModule(null);
    loadDashboard();
  };

  const filteredModules = dashboard?.modules.filter((module) => {
    if (filter !== "all" && module.status !== filter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return module.name.toLowerCase().includes(q) || module.description.toLowerCase().includes(q) || module.id.toLowerCase().includes(q) || module.config.keywords?.some((k) => k.toLowerCase().includes(q));
    }
    return true;
  }) || [];

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: "16px" }}>
        <RefreshCw style={{ width: "32px", height: "32px", color: "var(--color-primary)", animation: "spin 1s linear infinite" }} />
        <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>加载模块数据...</p>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: "16px" }}>
        <AlertCircle style={{ width: "48px", height: "48px", color: "#ef4444" }} />
        <h3 style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--text-main)" }}>加载失败</h3>
        <button onClick={loadDashboard} style={{
          padding: "10px 24px", borderRadius: "var(--radius-full)", border: "none",
          background: "linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))",
          color: "white", fontWeight: 600, cursor: "pointer",
        }}>
          重试
        </button>
      </div>
    );
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ padding: "24px 28px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
          <div>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-main)", fontFamily: "'M PLUS Rounded 1c', sans-serif" }}>
              模块管理
            </h1>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: "4px" }}>
              管理所有自动化模块的配置和运行状态
            </p>
          </div>
          <button onClick={loadDashboard} style={{
            display: "flex", alignItems: "center", gap: "8px",
            padding: "8px 16px", borderRadius: "var(--radius-full)",
            background: "var(--bg-hover)", border: "1px solid var(--border-light)",
            color: "var(--text-secondary)", fontSize: "0.8125rem", fontWeight: 600, cursor: "pointer",
            transition: "all 0.2s",
          }}>
            <RefreshCw style={{ width: "14px", height: "14px" }} /> 刷新
          </button>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "10px", marginBottom: "20px" }}>
          {STAT_ITEMS.map((s) => (
            <div key={s.key} style={{ padding: "14px 16px", borderRadius: "var(--radius-lg)", background: s.bg }}>
              <div style={{ fontSize: "1.375rem", fontWeight: 700, color: s.color }}>
                {dashboard.summary[s.key]}
              </div>
              <div style={{ fontSize: "0.6875rem", color: s.color, opacity: 0.7 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Alerts */}
        {dashboard.alerts.filter((a) => !a.acknowledged).length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "20px" }}>
            {dashboard.alerts.filter((a) => !a.acknowledged).slice(0, 3).map((alert) => (
              <div key={alert.id} style={{
                display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px",
                borderRadius: "var(--radius-md)",
                background: alert.severity === "error" ? "rgba(239,68,68,0.08)" : "rgba(234,179,8,0.08)",
                border: `1px solid ${alert.severity === "error" ? "rgba(239,68,68,0.2)" : "rgba(234,179,8,0.2)"}`,
              }}>
                <AlertCircle style={{ width: "16px", height: "16px", color: alert.severity === "error" ? "#ef4444" : "#eab308", flexShrink: 0 }} />
                <span style={{ fontSize: "0.8125rem", color: alert.severity === "error" ? "#ef4444" : "#eab308" }}>
                  {alert.message}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
          {/* Search */}
          <div style={{ flex: 1, position: "relative" }}>
            <Search style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", width: "16px", height: "16px", color: "var(--text-muted)" }} />
            <input
              type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索模块..."
              style={{
                width: "100%", padding: "8px 12px 8px 36px",
                borderRadius: "var(--radius-full)", border: "1px solid var(--border-light)",
                background: "var(--bg-hover)", color: "var(--text-main)", fontSize: "0.8125rem",
                outline: "none", transition: "border-color 0.2s",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "var(--color-primary)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border-light)"; }}
            />
          </div>

          {/* Filter Pills */}
          <div style={{ display: "flex", gap: "6px" }}>
            {FILTER_OPTIONS.map((f) => (
              <button key={f.key} onClick={() => setFilter(f.key)} style={{
                display: "flex", alignItems: "center", gap: "6px",
                padding: "6px 14px", borderRadius: "var(--radius-full)", border: "none",
                fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", transition: "all 0.2s",
                background: filter === f.key ? "linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))" : "var(--bg-hover)",
                color: filter === f.key ? "white" : "var(--text-secondary)",
              }}>
                {f.icon}{f.label}
              </button>
            ))}
          </div>

          {/* View Toggle */}
          <div style={{ display: "flex", background: "var(--bg-hover)", borderRadius: "var(--radius-md)", padding: "3px" }}>
            {([["grid", LayoutGrid], ["list", List]] as const).map(([mode, Icon]) => (
              <button key={mode} onClick={() => setViewMode(mode as ViewMode)} style={{
                padding: "6px 8px", borderRadius: "var(--radius-sm)", border: "none", cursor: "pointer",
                background: viewMode === mode ? "var(--bg-card)" : "transparent",
                boxShadow: viewMode === mode ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                color: viewMode === mode ? "var(--text-main)" : "var(--text-muted)",
                display: "flex", alignItems: "center", transition: "all 0.15s",
              }}>
                <Icon style={{ width: "16px", height: "16px" }} />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Module Grid/List */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 28px 28px" }}>
        {filteredModules.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", textAlign: "center" }}>
            <Settings style={{ width: "48px", height: "48px", color: "var(--text-muted)", opacity: 0.3, marginBottom: "16px" }} />
            <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-main)", marginBottom: "6px" }}>没有找到模块</h3>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
              {searchQuery ? "尝试其他搜索词" : "当前筛选条件下没有模块"}
            </p>
          </div>
        ) : (
          <div style={viewMode === "grid"
            ? { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "16px" }
            : { display: "flex", flexDirection: "column", gap: "12px" }
          }>
            {filteredModules.map((module) => (
              <ModuleCard
                key={module.id}
                module={module}
                onClick={() => { setInitialTab("overview"); setSelectedModule(module); }}
                onRun={() => handleRunModule(module.id)}
                onToggle={() => handleToggleModule(module.id)}
                onDiagnose={() => { setInitialTab("overview"); setSelectedModule(module); }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {selectedModule && (
        <ModuleDetailModal
          module={selectedModule}
          initialTab={initialTab}
          onClose={() => setSelectedModule(null)}
          onUpdate={handleUpdateModule}
        />
      )}
    </div>
  );
}
