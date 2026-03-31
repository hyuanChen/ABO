// src/modules/profile/RoleCard.tsx
import { useState } from "react";
import { Edit3, RefreshCw, Zap } from "lucide-react";
import { api } from "../../core/api";
import { useToast } from "../../components/Toast";
import PixelAvatar from "./PixelAvatar";

interface Props {
  codename: string;
  longTermGoal: string;
  motto: string;
  description: string;
  energy: number;
  san: number;
  onUpdated: () => void;
}

export default function RoleCard({
  codename, longTermGoal, motto, description, energy, san, onUpdated,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(codename);
  const [editGoal, setEditGoal] = useState(longTermGoal);
  const [generatingMotto, setGeneratingMotto] = useState(false);
  const toast = useToast();

  const energyColor = energy >= 70 ? "#10B981" : energy >= 40 ? "#F59E0B" : "#EF4444";
  const energyGradient = energy >= 70
    ? "linear-gradient(135deg, #34D399, #10B981)"
    : energy >= 40
    ? "linear-gradient(135deg, #FBBF24, #F59E0B)"
    : "linear-gradient(135deg, #F87171, #EF4444)";

  async function saveName() {
    try {
      await api.post("/api/profile/identity", {
        codename: editName,
        long_term_goal: editGoal,
      });
      toast.success("身份信息已保存");
      setEditing(false);
      onUpdated();
    } catch {
      toast.error("保存失败");
    }
  }

  async function refreshMotto() {
    setGeneratingMotto(true);
    try {
      const r = await api.post<{ motto: string }>("/api/profile/generate-motto", {});
      toast.success("座右铭已更新", r.motto);
      onUpdated();
    } catch {
      toast.error("生成失败，Claude 可能未运行");
    } finally {
      setGeneratingMotto(false);
    }
  }

  // Theme-aware gradient
  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  const cardBg = isDark
    ? "linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(139, 92, 246, 0.1) 50%, rgba(236, 72, 153, 0.08) 100%)"
    : "linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(168, 164, 227, 0.12) 50%, rgba(255, 183, 178, 0.1) 100%)";
  const cardBorder = isDark
    ? "1px solid rgba(99, 102, 241, 0.2)"
    : "1px solid rgba(99, 102, 241, 0.15)";
  const textMain = "var(--text-main)";
  const textSecondary = "var(--text-secondary)";
  const textMuted = "var(--text-muted)";

  return (
    <div style={{
      position: "relative", overflow: "hidden", borderRadius: "24px",
      background: cardBg, border: cardBorder, padding: "24px",
      boxShadow: "var(--shadow-soft)", backdropFilter: "blur(20px)"
    }}>
      {/* Background decoration - softer for light theme */}
      <div style={{
        position: "absolute", top: 0, right: 0, width: "256px", height: "256px",
        borderRadius: "50%", background: isDark ? "rgba(99, 102, 241, 0.1)" : "rgba(188, 164, 227, 0.15)",
        filter: "blur(60px)", transform: "translateY(-50%) translateX(50%)"
      }} />
      <div style={{
        position: "absolute", bottom: 0, left: 0, width: "192px", height: "192px",
        borderRadius: "50%", background: isDark ? "rgba(168, 85, 247, 0.08)" : "rgba(255, 183, 178, 0.12)",
        filter: "blur(50px)", transform: "translateY(50%) translateX(-50%)"
      }} />

      <div style={{ position: "relative", display: "flex", gap: "24px", alignItems: "flex-start" }}>
        {/* Pixel avatar + energy */}
        <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
          <div style={{
            padding: "4px", borderRadius: "16px",
            background: energyGradient,
            boxShadow: `0 4px 20px ${energyColor}40`
          }}>
            <div style={{ padding: "8px", background: "var(--bg-card)", borderRadius: "12px" }}>
              <PixelAvatar san={san} energy={energy} size={6} />
            </div>
          </div>
          <div style={{ width: "64px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", marginBottom: "4px" }}>
              <Zap style={{ width: "12px", height: "12px", color: energyColor }} />
              <span style={{ fontSize: "12px", fontWeight: 700, color: textMain }}>{energy}%</span>
            </div>
            <div style={{ height: "8px", background: "var(--bg-hover)", borderRadius: "4px", overflow: "hidden" }}>
              <div style={{
                height: "100%", width: `${energy}%`,
                background: energyGradient,
                borderRadius: "4px", transition: "width 0.7s ease"
              }} />
            </div>
          </div>
        </div>

        {/* Identity */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {editing ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="研究员代号"
                style={{
                  width: "100%", padding: "10px 16px", borderRadius: "12px",
                  background: "var(--bg-hover)", border: "1px solid var(--border-light)",
                  color: textMain, fontSize: "14px", outline: "none"
                }}
              />
              <textarea
                value={editGoal}
                onChange={(e) => setEditGoal(e.target.value)}
                placeholder="预期目标..."
                rows={2}
                style={{
                  width: "100%", padding: "10px 16px", borderRadius: "12px",
                  background: "var(--bg-hover)", border: "1px solid var(--border-light)",
                  color: textMain, fontSize: "14px", outline: "none", resize: "none"
                }}
              />
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={saveName}
                  style={{
                    padding: "8px 16px", borderRadius: "12px",
                    background: "linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))",
                    color: "white", fontSize: "14px", fontWeight: 600, border: "none", cursor: "pointer"
                  }}
                >
                  保存
                </button>
                <button
                  onClick={() => setEditing(false)}
                  style={{
                    padding: "8px 16px", borderRadius: "12px",
                    background: "var(--bg-hover)", color: textSecondary,
                    fontSize: "14px", border: "none", cursor: "pointer"
                  }}
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                <h2 style={{ fontSize: "20px", fontWeight: 700, color: textMain }}>
                  {codename || "未设置代号"}
                </h2>
                <button
                  onClick={() => {
                    setEditing(true);
                    setEditName(codename);
                    setEditGoal(longTermGoal);
                  }}
                  style={{
                    padding: "6px", borderRadius: "8px",
                    color: textMuted, background: "transparent", border: "none", cursor: "pointer"
                  }}
                  aria-label="编辑身份信息"
                >
                  <Edit3 style={{ width: "16px", height: "16px" }} />
                </button>
              </div>
              {longTermGoal && (
                <p style={{ fontSize: "14px", color: "var(--color-primary)", marginBottom: "8px", fontWeight: 500 }}>
                  {longTermGoal}
                </p>
              )}
              {description && (
                <p style={{ fontSize: "12px", color: textMuted, marginBottom: "16px", fontStyle: "italic" }}>
                  {description}
                </p>
              )}

              {/* Motto card */}
              <div style={{
                position: "relative", overflow: "hidden", borderRadius: "16px",
                background: "linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(251, 191, 36, 0.1))",
                padding: "16px", border: "1px solid rgba(245, 158, 11, 0.2)"
              }}>
                <div style={{
                  position: "absolute", inset: 0,
                  background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)",
                  animation: "shimmer 2s infinite"
                }} />
                <div style={{ position: "relative", display: "flex", alignItems: "flex-start", gap: "12px" }}>
                  <div style={{
                    padding: "6px", borderRadius: "8px",
                    background: "rgba(245, 158, 11, 0.2)", flexShrink: 0
                  }}>
                    <Zap style={{ width: "16px", height: "16px", color: "#F59E0B" }} />
                  </div>
                  <p style={{
                    fontSize: "14px", color: isDark ? "rgba(251, 191, 36, 0.9)" : "#B45309",
                    flex: 1, lineHeight: 1.6
                  }}>
                    {motto || "点击刷新生成今日座右铭"}
                  </p>
                  <button
                    onClick={refreshMotto}
                    disabled={generatingMotto}
                    style={{
                      padding: "6px", borderRadius: "8px",
                      color: textMuted, background: "transparent", border: "none", cursor: generatingMotto ? "not-allowed" : "pointer",
                      flexShrink: 0
                    }}
                    aria-label="重新生成座右铭"
                  >
                    <RefreshCw style={{ width: "16px", height: "16px", animation: generatingMotto ? "spin 1s linear infinite" : "none" }} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
