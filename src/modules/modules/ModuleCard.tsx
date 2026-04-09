import { useState, useEffect, useRef } from "react";
import {
  Play, Pause, Settings, AlertCircle, MoreVertical, RefreshCw,
  BookOpen, Video, ShoppingBag, Headphones, HelpCircle, Rss, FolderOpen, FileText,
} from "lucide-react";
import type { ModuleConfig, ModuleStatus } from "../../types/module";

interface ModuleCardProps {
  module: ModuleConfig;
  onClick: () => void;
  onRun: () => void;
  onToggle: () => void;
  onDiagnose: () => void;
}

const STATUS_STYLES: Record<ModuleStatus, { color: string; bg: string; border: string; label: string }> = {
  active: { color: "#22c55e", bg: "rgba(34,197,94,0.1)", border: "rgba(34,197,94,0.25)", label: "运行中" },
  paused: { color: "#eab308", bg: "rgba(234,179,8,0.1)", border: "rgba(234,179,8,0.25)", label: "已暂停" },
  error: { color: "#ef4444", bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.25)", label: "错误" },
  unconfigured: { color: "var(--text-muted)", bg: "var(--bg-hover)", border: "var(--border-light)", label: "未配置" },
};

const MODULE_ICONS: Record<string, React.FC<{ style?: React.CSSProperties }>> = {
  "arxiv-tracker": BookOpen,
  "semantic-scholar-tracker": FileText,
  "bilibili-tracker": Video,
  "xiaohongshu-tracker": ShoppingBag,
  "xiaoyuzhou-tracker": Headphones,
  "zhihu-tracker": HelpCircle,
  "folder-monitor": FolderOpen,
};

const MODULE_GRADIENTS: Record<string, string> = {
  "arxiv-tracker": "linear-gradient(135deg, #BCA4E3, #9D7BDB)",
  "semantic-scholar-tracker": "linear-gradient(135deg, #7BC8F0, #5BA8D0)",
  "bilibili-tracker": "linear-gradient(135deg, #FFB7B2, #E89B96)",
  "xiaohongshu-tracker": "linear-gradient(135deg, #FF6B6B, #E85555)",
  "xiaoyuzhou-tracker": "linear-gradient(135deg, #A8E6CF, #7DD3C0)",
  "zhihu-tracker": "linear-gradient(135deg, #4A9DFF, #3478CC)",
  "folder-monitor": "linear-gradient(135deg, #F5C88C, #D4A574)",
};

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "从未";
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m}分钟前`;
  const h = Math.floor(diff / 3600000);
  if (h < 24) return `${h}小时前`;
  const d = Math.floor(diff / 86400000);
  if (d < 7) return `${d}天前`;
  return new Date(dateStr).toLocaleDateString("zh-CN");
}

export function ModuleCard({ module, onClick, onRun, onToggle, onDiagnose }: ModuleCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [hovered, setHovered] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const status = STATUS_STYLES[module.status];
  const Icon = MODULE_ICONS[module.id] || Rss;
  const gradient = MODULE_GRADIENTS[module.id] || "linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))";

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "20px",
        borderRadius: "var(--radius-xl)",
        background: "var(--bg-card)",
        border: "1px solid var(--border-light)",
        cursor: "pointer",
        transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
        transform: hovered ? "translateY(-2px)" : "none",
        boxShadow: hovered ? "0 8px 32px rgba(0,0,0,0.08)" : "var(--shadow-soft)",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              width: "44px", height: "44px", borderRadius: "var(--radius-lg)",
              background: gradient, display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: `0 4px 12px ${status.color}33`,
            }}
          >
            <Icon style={{ width: "22px", height: "22px", color: "white" }} />
          </div>
          <div>
            <h3 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-main)", marginBottom: "4px" }}>
              {module.name}
            </h3>
            <span
              style={{
                display: "inline-flex", alignItems: "center", gap: "6px",
                padding: "2px 10px", borderRadius: "var(--radius-full)",
                fontSize: "0.6875rem", fontWeight: 600,
                background: status.bg, color: status.color, border: `1px solid ${status.border}`,
              }}
            >
              {module.status === "active" && (
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: status.color, animation: "pulse 2s infinite" }} />
              )}
              {status.label}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          {module.status === "active" ? (
            <button onClick={(e) => { e.stopPropagation(); onToggle(); }}
              style={{ ...iconBtnStyle, color: "#eab308" }} title="暂停">
              <Pause style={{ width: "18px", height: "18px" }} />
            </button>
          ) : module.status === "unconfigured" ? (
            <button onClick={(e) => { e.stopPropagation(); onClick(); }}
              style={{ ...iconBtnStyle, color: "var(--color-primary)" }} title="配置">
              <Settings style={{ width: "18px", height: "18px" }} />
            </button>
          ) : (
            <button onClick={(e) => { e.stopPropagation(); onToggle(); }}
              style={{ ...iconBtnStyle, color: "#22c55e" }} title="启动">
              <Play style={{ width: "18px", height: "18px" }} />
            </button>
          )}

          <div ref={menuRef} style={{ position: "relative" }}>
            <button onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
              style={{ ...iconBtnStyle, color: "var(--text-muted)" }}>
              <MoreVertical style={{ width: "18px", height: "18px" }} />
            </button>
            {showMenu && (
              <div style={{
                position: "absolute", right: 0, top: "100%", marginTop: "4px",
                background: "var(--bg-card)", borderRadius: "var(--radius-lg)",
                border: "1px solid var(--border-light)", boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
                minWidth: "150px", zIndex: 10, overflow: "hidden",
              }}>
                {[
                  { icon: <Play style={{ width: "14px", height: "14px" }} />, label: "立即运行", action: () => { onRun(); setShowMenu(false); } },
                  { icon: <AlertCircle style={{ width: "14px", height: "14px" }} />, label: "诊断问题", action: () => { onDiagnose(); setShowMenu(false); } },
                  { icon: <Settings style={{ width: "14px", height: "14px" }} />, label: "配置", action: () => { onClick(); setShowMenu(false); } },
                ].map((item, i) => (
                  <button key={i} onClick={(e) => { e.stopPropagation(); item.action(); }}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", gap: "10px",
                      padding: "10px 14px", border: "none", background: "transparent",
                      fontSize: "0.8125rem", color: "var(--text-secondary)", cursor: "pointer",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    {item.icon}{item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Description */}
      <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", lineHeight: 1.6, marginBottom: "14px" }}>
        {module.description}
      </p>

      {/* Cookie Status */}
      {module.config.cookie !== undefined && (
        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "12px" }}>
          <span style={{
            width: "6px", height: "6px", borderRadius: "50%",
            background: module.config.cookieValid ? "#22c55e" : "#ef4444",
          }} />
          <span style={{ fontSize: "0.6875rem", color: module.config.cookieValid ? "#22c55e" : "#ef4444" }}>
            Cookie {module.config.cookieValid ? "有效" : "无效"}
          </span>
        </div>
      )}

      {/* Keywords */}
      {module.config.keywords && module.config.keywords.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "14px" }}>
          {module.config.keywords.slice(0, 3).map((kw, i) => (
            <span key={i} style={{
              padding: "2px 10px", borderRadius: "var(--radius-full)",
              fontSize: "0.6875rem", fontWeight: 500,
              background: "rgba(188,164,227,0.12)", color: "var(--color-primary)",
            }}>
              {kw}
            </span>
          ))}
          {module.config.keywords.length > 3 && (
            <span style={{ padding: "2px 10px", borderRadius: "var(--radius-full)", fontSize: "0.6875rem", background: "var(--bg-hover)", color: "var(--text-muted)" }}>
              +{module.config.keywords.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "12px" }}>
        {[
          { label: "累计", value: module.stats.totalCards },
          { label: "本周", value: module.stats.thisWeek },
          { label: "成功率", value: `${module.stats.successRate}%`, color: module.stats.successRate >= 90 ? "#22c55e" : module.stats.successRate >= 70 ? "#eab308" : "#ef4444" },
        ].map((s, i) => (
          <div key={i} style={{ padding: "10px", borderRadius: "var(--radius-md)", background: "var(--bg-hover)", textAlign: "center" }}>
            <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginBottom: "2px" }}>{s.label}</div>
            <div style={{ fontSize: "0.9375rem", fontWeight: 700, color: (s as any).color || "var(--text-main)" }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Schedule */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "0.6875rem", color: "var(--text-muted)" }}>
        <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <RefreshCw style={{ width: "11px", height: "11px" }} />
          {module.schedule || "未设置"}
        </span>
        {module.lastRun && <span>上次: {formatRelativeTime(module.lastRun)}</span>}
      </div>

      {/* Error */}
      {module.stats.lastError && (
        <div style={{
          marginTop: "10px", padding: "8px 12px", borderRadius: "var(--radius-md)",
          background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)",
          fontSize: "0.75rem", color: "#ef4444", lineHeight: 1.5,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {module.stats.lastError}
        </div>
      )}

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
    </div>
  );
}

const iconBtnStyle: React.CSSProperties = {
  padding: "6px", borderRadius: "var(--radius-md)", border: "none",
  background: "transparent", cursor: "pointer", display: "flex",
  alignItems: "center", justifyContent: "center", transition: "background 0.15s",
};
