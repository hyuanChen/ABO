// src/modules/profile/DailyCheckInModal.tsx
import { useState } from "react";
import { MoonStar, Sun, Sunset, Sunrise } from "lucide-react";
import { api } from "../../core/api";
import { useToast } from "../../components/Toast";
import { DayPhase, useDayPhase } from "../../core/dayPhase";

interface Props {
  onClose: () => void;
}

interface PhasePalette {
  label: string;
  icon: typeof Sunrise;
  panel: string;
  border: string;
  shadow: string;
  overlay: string;
  badgeBg: string;
  badgeColor: string;
  titleColor: string;
  textColor: string;
  mutedColor: string;
  labelColor: string;
  rangeColor: string;
  buttonBg: string;
  buttonShadow: string;
  ghostBg: string;
  ghostText: string;
}

const PALETTES: Record<DayPhase, PhasePalette> = {
  morning: {
    label: "清晨模式",
    icon: Sunrise,
    panel: "linear-gradient(180deg, rgba(255, 251, 235, 0.98) 0%, rgba(255, 244, 214, 0.96) 100%)",
    border: "1px solid rgba(245, 158, 11, 0.18)",
    shadow: "0 24px 60px rgba(245, 158, 11, 0.16)",
    overlay: "linear-gradient(180deg, rgba(255, 247, 237, 0.72) 0%, rgba(255, 237, 213, 0.64) 100%)",
    badgeBg: "rgba(251, 191, 36, 0.14)",
    badgeColor: "#B45309",
    titleColor: "#7C2D12",
    textColor: "#9A3412",
    mutedColor: "#C2410C",
    labelColor: "#D97706",
    rangeColor: "#F59E0B",
    buttonBg: "linear-gradient(135deg, #F59E0B, #FB7185)",
    buttonShadow: "0 12px 24px rgba(245, 158, 11, 0.25)",
    ghostBg: "rgba(255, 255, 255, 0.6)",
    ghostText: "#9A3412",
  },
  day: {
    label: "白天模式",
    icon: Sun,
    panel: "linear-gradient(180deg, rgba(248, 252, 255, 0.98) 0%, rgba(238, 247, 255, 0.96) 100%)",
    border: "1px solid rgba(96, 165, 250, 0.2)",
    shadow: "0 24px 60px rgba(96, 165, 250, 0.16)",
    overlay: "linear-gradient(180deg, rgba(239, 246, 255, 0.72) 0%, rgba(219, 234, 254, 0.62) 100%)",
    badgeBg: "rgba(59, 130, 246, 0.12)",
    badgeColor: "#1D4ED8",
    titleColor: "#1E3A8A",
    textColor: "#1D4ED8",
    mutedColor: "#475569",
    labelColor: "#2563EB",
    rangeColor: "#3B82F6",
    buttonBg: "linear-gradient(135deg, #60A5FA, #6366F1)",
    buttonShadow: "0 12px 24px rgba(99, 102, 241, 0.2)",
    ghostBg: "rgba(255, 255, 255, 0.62)",
    ghostText: "#334155",
  },
  sunset: {
    label: "傍晚模式",
    icon: Sunset,
    panel: "linear-gradient(180deg, rgba(255, 247, 237, 0.98) 0%, rgba(254, 226, 226, 0.96) 100%)",
    border: "1px solid rgba(249, 115, 22, 0.18)",
    shadow: "0 24px 60px rgba(251, 146, 60, 0.18)",
    overlay: "linear-gradient(180deg, rgba(255, 237, 213, 0.72) 0%, rgba(254, 215, 170, 0.62) 100%)",
    badgeBg: "rgba(249, 115, 22, 0.12)",
    badgeColor: "#C2410C",
    titleColor: "#7C2D12",
    textColor: "#9A3412",
    mutedColor: "#78716C",
    labelColor: "#EA580C",
    rangeColor: "#F97316",
    buttonBg: "linear-gradient(135deg, #FB923C, #F43F5E)",
    buttonShadow: "0 12px 24px rgba(249, 115, 22, 0.24)",
    ghostBg: "rgba(255, 255, 255, 0.56)",
    ghostText: "#7C2D12",
  },
  night: {
    label: "夜间模式",
    icon: MoonStar,
    panel: "linear-gradient(180deg, rgba(15, 23, 42, 0.96) 0%, rgba(30, 41, 59, 0.94) 100%)",
    border: "1px solid rgba(99, 102, 241, 0.24)",
    shadow: "0 28px 72px rgba(15, 23, 42, 0.45)",
    overlay: "linear-gradient(180deg, rgba(2, 6, 23, 0.78) 0%, rgba(15, 23, 42, 0.74) 100%)",
    badgeBg: "rgba(99, 102, 241, 0.16)",
    badgeColor: "#C7D2FE",
    titleColor: "#F8FAFC",
    textColor: "#E2E8F0",
    mutedColor: "#94A3B8",
    labelColor: "#C4B5FD",
    rangeColor: "#8B5CF6",
    buttonBg: "linear-gradient(135deg, #6366F1, #A855F7)",
    buttonShadow: "0 12px 24px rgba(99, 102, 241, 0.3)",
    ghostBg: "rgba(51, 65, 85, 0.7)",
    ghostText: "#E2E8F0",
  },
};

export default function DailyCheckInModal({ onClose }: Props) {
  const [san, setSan] = useState(5);
  const [happiness, setHappiness] = useState(5);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const phase = useDayPhase();
  const palette = PALETTES[phase];
  const PhaseIcon = palette.icon;

  async function submit() {
    setSaving(true);
    try {
      await api.post("/api/health/checkin", {
        san,
        happiness,
      });
      toast.success("每日打卡完成");
      onClose();
    } catch {
      toast.error("打卡失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{ background: palette.overlay, backdropFilter: "blur(14px)" }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          padding: "24px",
          borderRadius: "28px",
          background: palette.panel,
          border: palette.border,
          boxShadow: palette.shadow,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "12px" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "7px 12px",
              borderRadius: "999px",
              background: palette.badgeBg,
              color: palette.badgeColor,
              fontSize: "0.8125rem",
              fontWeight: 700,
            }}
          >
            <PhaseIcon size={16} />
            {palette.label}
          </span>
          <span style={{ fontSize: "0.8125rem", color: palette.mutedColor }}>
            跟随当前时段切换
          </span>
        </div>

        <h2 style={{ fontSize: "1.2rem", fontWeight: 800, color: palette.titleColor, marginBottom: "6px" }}>
          每日状态打卡
        </h2>
        <p style={{ fontSize: "0.9375rem", color: palette.textColor, lineHeight: 1.7, marginBottom: "22px" }}>
          记录今天的状态，帮助角色主页和成长曲线保持同步，不再固定成夜间视觉。
        </p>

        <div style={{ marginBottom: "18px" }}>
          <label
            style={{
              display: "block",
              fontSize: "0.9rem",
              fontWeight: 700,
              color: palette.labelColor,
              marginBottom: "8px",
            }}
          >
            SAN 值 <span style={{ color: palette.titleColor }}>— {san}/10</span>
          </label>
          <input
            type="range"
            min="1"
            max="10"
            value={san}
            onChange={(e) => setSan(Number(e.target.value))}
            className="w-full"
            style={{ accentColor: palette.rangeColor }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: palette.mutedColor, marginTop: "6px" }}>
            <span>精神崩溃</span>
            <span>心如止水</span>
          </div>
        </div>

        <div style={{ marginBottom: "24px" }}>
          <label
            style={{
              display: "block",
              fontSize: "0.9rem",
              fontWeight: 700,
              color: palette.labelColor,
              marginBottom: "8px",
            }}
          >
            幸福感 <span style={{ color: palette.titleColor }}>— {happiness}/10</span>
          </label>
          <input
            type="range"
            min="1"
            max="10"
            value={happiness}
            onChange={(e) => setHappiness(Number(e.target.value))}
            className="w-full"
            style={{ accentColor: palette.rangeColor }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: palette.mutedColor, marginTop: "6px" }}>
            <span>很痛苦</span>
            <span>非常幸福</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: "12px" }}>
          <button
            onClick={submit}
            disabled={saving}
            style={{
              flex: 1,
              border: "none",
              borderRadius: "16px",
              padding: "11px 16px",
              background: palette.buttonBg,
              color: "#fff",
              fontSize: "0.9375rem",
              fontWeight: 700,
              boxShadow: palette.buttonShadow,
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.72 : 1,
            }}
          >
            {saving ? "保存中..." : "完成打卡"}
          </button>
          <button
            onClick={onClose}
            style={{
              padding: "11px 18px",
              borderRadius: "16px",
              border: "none",
              background: palette.ghostBg,
              color: palette.ghostText,
              fontSize: "0.9375rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            跳过
          </button>
        </div>
      </div>
    </div>
  );
}
