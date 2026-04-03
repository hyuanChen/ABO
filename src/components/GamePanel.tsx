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
    <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-4 border border-slate-700/50 hover:border-slate-600 transition-all">
      <div className="flex items-center gap-3 mb-2">
        <div className={`p-2 rounded-lg ${color}`}>{icon}</div>
        <div>
          <div className="text-xs text-slate-400 uppercase tracking-wider">{label}</div>
          <div className="text-xl font-bold text-white">
            {isNumber ? Math.round(value) : value}
            {max && <span className="text-sm text-slate-500">/{max}</span>}
          </div>
        </div>
      </div>
      {max && (
        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              percentage > 70 ? "bg-emerald-500" : percentage > 40 ? "bg-amber-500" : "bg-rose-500"
            }`}
            style={{ width: `${Math.max(5, percentage)}%` }}
          />
        </div>
      )}
      {subtitle && <div className="text-xs text-slate-500 mt-2">{subtitle}</div>}
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
      <div className="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-xl p-5 text-white">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Trophy className="w-6 h-6 text-yellow-300" />
              <span className="text-3xl font-bold">Lv.{level}</span>
            </div>
            <div className="text-indigo-100 mt-1">Researcher</div>
          </div>
          <div className="text-right">
            <div className="text-sm text-indigo-100">今日 XP</div>
            <div className="text-2xl font-bold">+{todayXP}</div>
          </div>
        </div>
        <div className="mt-4">
          <div className="flex justify-between text-xs text-indigo-100 mb-1">
            <span>升级进度</span>
            <span>{xpProgress}/{xpToNextLevel} XP</span>
          </div>
          <div className="h-2 bg-indigo-900/50 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-yellow-300 to-amber-400 rounded-full transition-all"
              style={{ width: `${(xpProgress / xpToNextLevel) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          icon={<Heart className="w-5 h-5 text-rose-400" />}
          label="幸福度"
          value={gameStats?.happiness || 0}
          max={100}
          color="bg-rose-500/20"
          subtitle="基于喜欢的内容"
        />
        <StatCard
          icon={<Brain className="w-5 h-5 text-cyan-400" />}
          label="SAN值"
          value={(gameStats?.san_7d_avg || 0) * 10}
          max={100}
          color="bg-cyan-500/20"
          subtitle="7日平均精神状态"
        />
        <StatCard
          icon={<Zap className="w-5 h-5 text-amber-400" />}
          label="能量"
          value={gameStats?.energy || 70}
          max={100}
          color="bg-amber-500/20"
          subtitle="今日精力状态"
        />
        <StatCard
          icon={<Sparkles className="w-5 h-5 text-purple-400" />}
          label="成就"
          value={gameStats?.achievements?.length || 0}
          color="bg-purple-500/20"
          subtitle="已解锁成就"
        />
      </div>

      {/* Total XP Footer */}
      <div className="flex items-center justify-between px-2 text-sm text-slate-400">
        <span>总 XP</span>
        <span className="font-mono text-slate-300">{totalXP.toLocaleString()}</span>
      </div>
    </div>
  );
}
