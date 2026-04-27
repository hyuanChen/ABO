// src/modules/profile/RoleCard.tsx
import { KeyboardEvent, MouseEvent, useState } from "react";
import { ChevronDown, ChevronRight, Edit3, RefreshCw, Zap } from "lucide-react";
import { api } from "../../core/api";
import { useToast } from "../../components/Toast";
import { useStore } from "../../core/store";
import { useThemeMode } from "../../core/theme";
import AvatarDisplay from "./AvatarDisplay";
import { nameToSBTI, SBTI_INFO, SBTIType } from "./SBTIAvatar";
import SBTIPicker from "./SBTIPicker";

interface Props {
  codename: string;
  longTermGoal: string;
  motto: string;
  description: string;
  energy: number;
  san: number;
  predictedSbti?: string | null;
  onUpdated: () => void;
  defaultExpanded?: boolean;
}

export default function RoleCard({
  codename, longTermGoal, motto, description, energy, san, predictedSbti, onUpdated, defaultExpanded = true,
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(codename);
  const [editGoal, setEditGoal] = useState(longTermGoal);
  const [generatingMotto, setGeneratingMotto] = useState(false);
  const toast = useToast();
  const showcaseMode = useStore((s) => s.showcaseMode);
  const { isDark } = useThemeMode();
  const sbtiOverride = useStore((s) => s.sbtiOverride);
  const derivedSbti =
    (sbtiOverride as SBTIType | null)
    ?? ((predictedSbti && predictedSbti in SBTI_INFO ? predictedSbti : null) as SBTIType | null)
    ?? nameToSBTI(codename);

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
      toast.error("生成失败，后台 Agent 可能未运行");
    } finally {
      setGeneratingMotto(false);
    }
  }

  const cardBg = isDark
    ? "linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(139, 92, 246, 0.1) 50%, rgba(236, 72, 153, 0.08) 100%)"
    : "linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(168, 164, 227, 0.12) 50%, rgba(255, 183, 178, 0.1) 100%)";
  const cardBorder = isDark
    ? "1px solid rgba(99, 102, 241, 0.2)"
    : "1px solid rgba(99, 102, 241, 0.15)";
  const textMain = "var(--text-main)";
  const textSecondary = "var(--text-secondary)";
  const textMuted = "var(--text-muted)";
  const sbtiInfo = SBTI_INFO[derivedSbti];

  function isInteractiveTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(target.closest("button, a, input, textarea, select, label, [role='button'], [contenteditable='true']"));
  }

  function handleExpandedCardClick(event: MouseEvent<HTMLDivElement>) {
    if (isInteractiveTarget(event.target)) return;
    setExpanded(false);
  }

  function handleCollapsedKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setExpanded(true);
    }
  }

  if (!expanded) {
    return (
      <div
        role="button"
        tabIndex={0}
        aria-expanded={false}
        onClick={() => setExpanded(true)}
        onKeyDown={handleCollapsedKeyDown}
        style={{
          position: "relative",
          overflow: "hidden",
          borderRadius: showcaseMode ? "28px" : "24px",
          background: showcaseMode
            ? (isDark
              ? "linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(139, 92, 246, 0.15) 50%, rgba(236, 72, 153, 0.1) 100%)"
              : "linear-gradient(135deg, rgba(188, 164, 227, 0.22) 0%, rgba(255, 183, 178, 0.14) 50%, rgba(168, 216, 255, 0.12) 100%)")
            : cardBg,
          border: showcaseMode ? (isDark ? "1px solid rgba(139, 92, 246, 0.3)" : "1px solid rgba(188, 164, 227, 0.35)") : cardBorder,
          padding: showcaseMode ? "24px 28px" : "18px 20px",
          boxShadow: showcaseMode
            ? (isDark
              ? "0 12px 48px rgba(99, 102, 241, 0.2), 0 0 80px rgba(139, 92, 246, 0.08)"
              : "0 12px 48px rgba(188, 164, 227, 0.25), 0 0 80px rgba(188, 164, 227, 0.1)")
            : "var(--shadow-soft)",
          backdropFilter: "blur(20px)",
          cursor: "pointer",
        }}
      >
        <div style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: showcaseMode ? "220px" : "180px",
          height: showcaseMode ? "220px" : "180px",
          borderRadius: "50%",
          background: isDark ? "rgba(99, 102, 241, 0.1)" : "rgba(188, 164, 227, 0.14)",
          filter: "blur(60px)",
          transform: "translateY(-50%) translateX(50%)",
        }} />

        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{
              padding: showcaseMode ? "5px" : "4px",
              borderRadius: showcaseMode ? "18px" : "16px",
              background: energyGradient,
              boxShadow: `0 4px 20px ${energyColor}40`,
            }}>
              <div style={{
                padding: showcaseMode ? "10px" : "8px",
                background: "var(--bg-card)",
                borderRadius: showcaseMode ? "14px" : "12px",
              }}>
                <AvatarDisplay codename={codename} san={san} energy={energy} size={showcaseMode ? 5 : 4} />
              </div>
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", minWidth: 0 }}>
              <h2 style={{
                fontSize: showcaseMode ? "1.1rem" : "1rem",
                fontWeight: 800,
                color: textMain,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: "100%",
              }}>
                {codename || "未设置代号"}
              </h2>
              <span style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                padding: showcaseMode ? "4px 10px" : "3px 9px",
                borderRadius: "999px",
                background: `${sbtiInfo.color}18`,
                border: `1px solid ${sbtiInfo.color}28`,
                color: sbtiInfo.color,
                fontSize: "0.6875rem",
                fontWeight: 800,
                fontFamily: "monospace",
              }}>
                {sbtiInfo.code} · {sbtiInfo.cn}
              </span>
            </div>

            {longTermGoal && (
              <p style={{
                fontSize: "0.8125rem",
                color: "var(--text-secondary)",
                lineHeight: 1.6,
                display: "-webkit-box",
                WebkitLineClamp: 1,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}>
                {longTermGoal}
              </p>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <Zap style={{ width: "13px", height: "13px", color: energyColor }} />
                <span style={{ fontSize: "0.75rem", fontWeight: 700, color: textMain }}>
                  今日能量 {energy}%
                </span>
              </div>
              <div style={{
                flex: "0 1 180px",
                minWidth: "120px",
                height: "8px",
                background: "var(--bg-hover)",
                borderRadius: "999px",
                overflow: "hidden",
              }}>
                <div style={{
                  height: "100%",
                  width: `${energy}%`,
                  background: energyGradient,
                  borderRadius: "999px",
                }} />
              </div>
            </div>
          </div>

          <div style={{
            width: showcaseMode ? "34px" : "30px",
            height: showcaseMode ? "34px" : "30px",
            borderRadius: "999px",
            border: "1px solid var(--border-light)",
            background: "color-mix(in srgb, var(--bg-card) 88%, transparent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}>
            <ChevronRight style={{ width: "16px", height: "16px", color: textMuted }} />
          </div>
        </div>
      </div>
    );
  }

  // ── Showcase Hero Mode ──────────────────────────────────────
  if (showcaseMode) {
    return (
      <div style={{
        position: "relative", overflow: "hidden", borderRadius: "28px",
        background: isDark
          ? "linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(139, 92, 246, 0.15) 30%, rgba(236, 72, 153, 0.1) 60%, rgba(59, 130, 246, 0.1) 100%)"
          : "linear-gradient(135deg, rgba(188, 164, 227, 0.25) 0%, rgba(255, 183, 178, 0.15) 30%, rgba(168, 216, 255, 0.12) 60%, rgba(188, 164, 227, 0.2) 100%)",
        border: isDark ? "1px solid rgba(139, 92, 246, 0.3)" : "1px solid rgba(188, 164, 227, 0.35)",
        padding: "36px 32px",
        boxShadow: isDark
          ? "0 12px 48px rgba(99, 102, 241, 0.2), 0 0 80px rgba(139, 92, 246, 0.08)"
          : "0 12px 48px rgba(188, 164, 227, 0.25), 0 0 80px rgba(188, 164, 227, 0.1)",
        backdropFilter: "blur(24px)",
      }}
      onClick={handleExpandedCardClick}
      >
        {/* Aurora gradient background - animated */}
        <div style={{
          position: "absolute", inset: 0,
          background: isDark
            ? "linear-gradient(135deg, rgba(99,102,241,0.12), rgba(168,85,247,0.08), rgba(236,72,153,0.06), rgba(59,130,246,0.1))"
            : "linear-gradient(135deg, rgba(188,164,227,0.15), rgba(255,183,178,0.1), rgba(168,216,255,0.08), rgba(188,164,227,0.12))",
          backgroundSize: "400% 400%",
          animation: "showcase-aurora 8s ease infinite",
        }} />

        {/* Floating orbs */}
        <div style={{
          position: "absolute", top: "-30px", right: "-20px", width: "200px", height: "200px",
          borderRadius: "50%",
          background: isDark ? "rgba(139, 92, 246, 0.15)" : "rgba(188, 164, 227, 0.2)",
          filter: "blur(50px)",
          animation: "showcase-float-1 8s ease-in-out infinite",
        }} />
        <div style={{
          position: "absolute", bottom: "-40px", left: "10%", width: "160px", height: "160px",
          borderRadius: "50%",
          background: isDark ? "rgba(236, 72, 153, 0.1)" : "rgba(255, 183, 178, 0.18)",
          filter: "blur(45px)",
          animation: "showcase-float-2 10s ease-in-out infinite",
        }} />
        <div style={{
          position: "absolute", top: "20%", left: "60%", width: "120px", height: "120px",
          borderRadius: "50%",
          background: isDark ? "rgba(59, 130, 246, 0.08)" : "rgba(168, 216, 255, 0.15)",
          filter: "blur(40px)",
          animation: "showcase-float-3 12s ease-in-out infinite",
        }} />

        {/* Sparkle particles */}
        {[...Array(6)].map((_, i) => (
          <div key={i} style={{
            position: "absolute",
            width: "4px", height: "4px",
            borderRadius: "50%",
            background: ["#BCA4E3", "#FFB7B2", "#A8D8FF", "#FCD34D", "#A8E6CF", "#C084FC"][i],
            top: `${15 + i * 12}%`,
            left: `${10 + i * 15}%`,
            animation: `showcase-sparkle ${2 + i * 0.5}s ease-in-out ${i * 0.3}s infinite`,
            boxShadow: `0 0 8px ${["#BCA4E3", "#FFB7B2", "#A8D8FF", "#FCD34D", "#A8E6CF", "#C084FC"][i]}60`,
          }} />
        ))}

        <div style={{
          position: "absolute",
          top: "18px",
          right: "18px",
          width: "34px",
          height: "34px",
          borderRadius: "999px",
          border: "1px solid rgba(255, 255, 255, 0.18)",
          background: "rgba(255, 255, 255, 0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 2,
          backdropFilter: "blur(16px)",
        }}>
          <ChevronDown style={{ width: "16px", height: "16px", color: "var(--text-main)" }} />
        </div>

        <div style={{ position: "relative", display: "flex", gap: "28px", alignItems: "center" }}>
          {/* Enhanced avatar with glow ring */}
          <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
            <div style={{ position: "relative" }}>
              {/* Rotating glow ring */}
              <div style={{
                position: "absolute", inset: "-8px",
                borderRadius: "20px",
                background: `conic-gradient(from 0deg, ${energyColor}80, transparent, ${energyColor}40, transparent, ${energyColor}80)`,
                animation: "showcase-glow-ring 4s linear infinite",
                opacity: 0.6,
              }} />
              <div style={{
                position: "relative",
                padding: "5px", borderRadius: "18px",
                background: energyGradient,
                boxShadow: `0 6px 30px ${energyColor}50, 0 0 60px ${energyColor}20`,
              }}>
                <div style={{ padding: "12px", background: "var(--bg-card)", borderRadius: "14px" }}>
                  <AvatarDisplay codename={codename} san={san} energy={energy} size={7} />
                </div>
              </div>
            </div>
            {/* Energy bar - enhanced */}
            <div style={{ width: "88px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", marginBottom: "6px" }}>
                <Zap style={{ width: "14px", height: "14px", color: energyColor, filter: `drop-shadow(0 0 4px ${energyColor})` }} />
                <span style={{
                  fontSize: "14px", fontWeight: 800, color: textMain,
                  animation: "showcase-counter-glow 3s ease-in-out infinite",
                }}>
                  {energy}%
                </span>
              </div>
              <div style={{
                height: "10px",
                background: "var(--bg-hover)",
                borderRadius: "5px",
                overflow: "hidden",
                boxShadow: "inset 0 2px 4px rgba(0,0,0,0.1)",
              }}>
                <div style={{
                  height: "100%", width: `${energy}%`,
                  background: energyGradient,
                  borderRadius: "5px",
                  transition: "width 0.7s ease",
                  boxShadow: `0 0 12px ${energyColor}60`,
                }} />
              </div>
            </div>
          </div>

          {/* Identity - enhanced typography */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {editing ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <input
                  value={editName} onChange={(e) => setEditName(e.target.value)}
                  placeholder="研究员代号"
                  style={{
                    width: "100%", padding: "10px 16px", borderRadius: "12px",
                    background: "var(--bg-hover)", border: "1px solid var(--border-light)",
                    color: textMain, fontSize: "14px", outline: "none",
                  }}
                />
                <textarea
                  value={editGoal} onChange={(e) => setEditGoal(e.target.value)}
                  placeholder="预期目标..." rows={2}
                  style={{
                    width: "100%", padding: "10px 16px", borderRadius: "12px",
                    background: "var(--bg-hover)", border: "1px solid var(--border-light)",
                    color: textMain, fontSize: "14px", outline: "none", resize: "none",
                  }}
                />
                <div style={{ display: "flex", gap: "8px" }}>
                  <button onClick={saveName} style={{
                    padding: "8px 16px", borderRadius: "12px",
                    background: "linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))",
                    color: "white", fontSize: "14px", fontWeight: 600, border: "none", cursor: "pointer",
                  }}>保存</button>
                  <button onClick={() => setEditing(false)} style={{
                    padding: "8px 16px", borderRadius: "12px",
                    background: "var(--bg-hover)", color: textSecondary,
                    fontSize: "14px", border: "none", cursor: "pointer",
                  }}>取消</button>
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px", flexWrap: "wrap" }}>
                  <h2 style={{
                    fontSize: "26px", fontWeight: 800, letterSpacing: "-0.02em",
                    background: isDark
                      ? "linear-gradient(135deg, #E0D4F5, #FFD4D1, #C8E8FF)"
                      : "linear-gradient(135deg, #6D5BA3, #C084FC, #818CF8)",
                    WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
                    fontFamily: "'M PLUS Rounded 1c', sans-serif",
                  }}>
                    {codename || "未设置代号"}
                  </h2>
                  {/* SBTI Badge + picker */}
                  {(() => {
                    const info = SBTI_INFO[derivedSbti];
                    return (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: "6px",
                          padding: "4px 12px", borderRadius: "9999px",
                          background: `linear-gradient(135deg, ${info.color}20, ${info.accent}15)`,
                          border: `1px solid ${info.color}30`,
                          fontSize: "0.75rem", fontWeight: 700, fontFamily: "monospace",
                          color: info.color,
                          boxShadow: `0 2px 8px ${info.color}15`,
                        }} title={info.intro}>
                          {info.code} · {info.cn}
                        </span>
                        <SBTIPicker />
                      </span>
                    );
                  })()}
                  <button onClick={() => { setEditing(true); setEditName(codename); setEditGoal(longTermGoal); }}
                    style={{
                      padding: "6px", borderRadius: "8px",
                      color: textMuted, background: "transparent", border: "none", cursor: "pointer",
                    }}
                    aria-label="编辑身份信息"
                  >
                    <Edit3 style={{ width: "16px", height: "16px" }} />
                  </button>
                </div>
                {longTermGoal && (
                  <p style={{
                    fontSize: "15px", color: "var(--color-primary)", marginBottom: "10px", fontWeight: 600,
                    letterSpacing: "0.01em",
                  }}>
                    {longTermGoal}
                  </p>
                )}
                {description && (
                  <p style={{ fontSize: "12px", color: textMuted, marginBottom: "18px", fontStyle: "italic" }}>
                    {description}
                  </p>
                )}

                {/* Enhanced motto card with glow */}
                <div style={{
                  position: "relative", overflow: "hidden", borderRadius: "18px",
                  background: isDark
                    ? "linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(251, 191, 36, 0.12), rgba(252, 211, 77, 0.08))"
                    : "linear-gradient(135deg, rgba(245, 158, 11, 0.18), rgba(251, 191, 36, 0.12))",
                  padding: "18px",
                  border: "1px solid rgba(245, 158, 11, 0.25)",
                  boxShadow: "0 4px 24px rgba(245, 158, 11, 0.12), 0 0 40px rgba(245, 158, 11, 0.05)",
                }}>
                  <div style={{
                    position: "absolute", inset: 0,
                    background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)",
                    backgroundSize: "200% 100%",
                    animation: "shimmer 2.5s infinite",
                  }} />
                  <div style={{ position: "relative", display: "flex", alignItems: "flex-start", gap: "12px" }}>
                    <div style={{
                      padding: "8px", borderRadius: "10px",
                      background: "rgba(245, 158, 11, 0.25)", flexShrink: 0,
                    }}>
                      <Zap style={{
                        width: "18px", height: "18px", color: "#F59E0B",
                        filter: "drop-shadow(0 0 6px rgba(245, 158, 11, 0.5))",
                      }} />
                    </div>
                    <p style={{
                      fontSize: "15px",
                      color: isDark ? "rgba(251, 191, 36, 0.95)" : "#92400E",
                      flex: 1, lineHeight: 1.7, fontWeight: 500,
                    }}>
                      {motto || "点击刷新生成今日座右铭"}
                    </p>
                    <button onClick={refreshMotto} disabled={generatingMotto}
                      style={{
                        padding: "6px", borderRadius: "8px",
                        color: textMuted, background: "transparent", border: "none",
                        cursor: generatingMotto ? "not-allowed" : "pointer", flexShrink: 0,
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

  // ── Standard Mode ─────────────────────────────────────────
  return (
    <div style={{
      position: "relative", overflow: "hidden", borderRadius: "24px",
      background: cardBg, border: cardBorder, padding: "24px",
      boxShadow: "var(--shadow-soft)", backdropFilter: "blur(20px)"
    }}
    onClick={handleExpandedCardClick}
    >
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
      <div style={{
        position: "absolute",
        top: "16px",
        right: "16px",
        width: "30px",
        height: "30px",
        borderRadius: "999px",
        border: "1px solid var(--border-light)",
        background: "rgba(255, 255, 255, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backdropFilter: "blur(12px)",
      }}>
        <ChevronDown style={{ width: "16px", height: "16px", color: textMuted }} />
      </div>

      <div style={{ position: "relative", display: "flex", gap: "24px", alignItems: "flex-start" }}>
        {/* Pixel avatar + energy */}
        <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
          <div style={{
            padding: "4px", borderRadius: "16px",
            background: energyGradient,
            boxShadow: `0 4px 20px ${energyColor}40`
          }}>
            <div style={{ padding: "8px", background: "var(--bg-card)", borderRadius: "12px" }}>
              <AvatarDisplay codename={codename} san={san} energy={energy} size={6} />
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
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
                <h2 style={{ fontSize: "20px", fontWeight: 700, color: textMain }}>
                  {codename || "未设置代号"}
                </h2>
                {/* SBTI Badge + picker */}
                {(() => {
                  const sbti: SBTIType = (sbtiOverride as SBTIType | null) ?? nameToSBTI(codename);
                  const info = SBTI_INFO[sbti];
                  return (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: "4px",
                        padding: "3px 10px", borderRadius: "9999px",
                        background: `${info.color}15`,
                        border: `1px solid ${info.color}25`,
                        fontSize: "0.6875rem", fontWeight: 700, fontFamily: "monospace",
                        color: info.color,
                      }} title={info.intro}>
                        {info.code} · {info.cn}
                      </span>
                      <SBTIPicker />
                    </span>
                  );
                })()}
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
