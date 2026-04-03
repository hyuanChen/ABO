// src/components/GamePanel.tsx
// Phase 3: Gamification status panel - XP, Level, Happiness, SAN

import { useEffect } from "react";
import { Sparkles, Heart, Brain, Zap, Trophy } from "lucide-react";
import { useStore } from "../core/store";
import { api } from "../core/api";

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  max?: number;
  color: string;
  subtitle?: string;
}

function StatCard({ icon, label, value, max, color, subtitle }: StatCardProps) {
  const isNumber = typeof value === "number";
  const percentage = isNumber && max ? (value / max) * 100 : 0;

  return (
    <div
      className="rounded-xl p-4 border transition-all hover:border-opacity-80"
      style={{
        background: `linear-gradient(135deg, var(--bg-card), var(--bg-hover))`,
        borderColor: "var(--border-light)",
      }}
    >
      <div className="flex items-center gap-3 mb-2">
        <div
          className="p-2 rounded-lg"
          style={{ background: `${color}20` }}
        >
          {icon}
        </div>
        <div>
          <div
            className="text-xs uppercase tracking-wider"
            style={{ color: "var(--text-muted)" }}
          >
            {label}
          </div>
          <div
            className="text-xl font-bold"
            style={{ color: "var(--text-main)" }}
          >
            {isNumber ? Math.round(value) : value}
            {max && (
              <span style={{ color: "var(--text-light)", fontSize: "0.875rem" }}>
                /{max}
              </span>
            )}
          </div>
        </div>
      </div>
      {max && (
        <div
          className="h-2 rounded-full overflow-hidden"
          style={{ background: "var(--bg-hover)" }}
        >
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.max(5, percentage)}%`,
              background:
                percentage > 70
                  ? "var(--color-success)"
                  : percentage > 40
                  ? "var(--color-warning)"
                  : "var(--color-danger)",
            }}
          />
        </div>
      )}
      {subtitle && (
        <div className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}

export default function GamePanel() {
  const { gameStats, todayXP, totalXP, level, setGameStats } = useStore();

  useEffect(() => {
    loadGameStats();
    const interval = setInterval(loadGameStats, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  async function loadGameStats() {
    try {
      const stats = await api.get<any>("/api/game/stats");
      setGameStats(stats);
    } catch (e) {
      console.error("Failed to load game stats:", e);
    }
  }

  // XP progress to next level
  const xpForCurrentLevel = (level - 1) * 100;
  const xpProgress = totalXP - xpForCurrentLevel;
  const xpToNextLevel = 100;

  return (
    <div className="space-y-4">
      {/* Level & XP Header */}
      <div
        className="rounded-xl p-5 text-white"
        style={{
          background: `linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))`,
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Trophy className="w-6 h-6" style={{ color: "var(--color-warning)" }} />
              <span className="text-3xl font-bold">Lv.{level}</span>
            </div>
            <div style={{ color: "rgba(255,255,255,0.8)", marginTop: "4px" }}>
              Researcher
            </div>
          </div>
          <div className="text-right">
            <div style={{ color: "rgba(255,255,255,0.8)", fontSize: "0.875rem" }}>
              今日 XP
            </div>
            <div className="text-2xl font-bold">+{todayXP}</div>
          </div>
        </div>
        <div className="mt-4">
          <div
            className="flex justify-between text-xs mb-1"
            style={{ color: "rgba(255,255,255,0.8)" }}
          >
            <span>升级进度</span>
            <span>
              {xpProgress}/{xpToNextLevel} XP
            </span>
          </div>
          <div
            className="h-2 rounded-full overflow-hidden"
            style={{ background: "rgba(0,0,0,0.2)" }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${(xpProgress / xpToNextLevel) * 100}%`,
                background: `linear-gradient(90deg, var(--color-warning), var(--color-secondary))`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          icon={<Heart className="w-5 h-5" style={{ color: "var(--color-secondary)" }} />}
          label="幸福度"
          value={gameStats?.happiness || 0}
          max={100}
          color="var(--color-secondary)"
          subtitle="基于喜欢的内容"
        />
        <StatCard
          icon={<Brain className="w-5 h-5" style={{ color: "var(--color-accent)" }} />}
          label="SAN值"
          value={(gameStats?.san_7d_avg || 0) * 10}
          max={100}
          color="var(--color-accent)"
          subtitle="7日平均精神状态"
        />
        <StatCard
          icon={<Zap className="w-5 h-5" style={{ color: "var(--color-warning)" }} />}
          label="能量"
          value={gameStats?.energy || 70}
          max={100}
          color="var(--color-warning)"
          subtitle="今日精力状态"
        />
        <StatCard
          icon={<Sparkles className="w-5 h-5" style={{ color: "var(--color-primary)" }} />}
          label="成就"
          value={gameStats?.achievements?.length || 0}
          color="var(--color-primary)"
          subtitle="已解锁成就"
        />
      </div>

      {/* Total XP Footer */}
      <div
        className="flex items-center justify-between px-2 text-sm"
        style={{ color: "var(--text-muted)" }}
      >
        <span>总 XP</span>
        <span className="font-mono" style={{ color: "var(--text-secondary)" }}>
          {totalXP.toLocaleString()}
        </span>
      </div>
    </div>
  );
}
