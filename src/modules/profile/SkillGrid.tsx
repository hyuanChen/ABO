// src/modules/profile/SkillGrid.tsx
import { useEffect, useState } from "react";

interface SkillNode {
  id: string;
  label: string;
  dim: string;
  target: number;
  current: number;
  unit: string;
}

const SKILLS: SkillNode[] = [
  // 研究力
  { id: "lit-10",    label: "初窥门径", dim: "research",  target: 10,  current: 0, unit: "篇文献" },
  { id: "lit-50",    label: "文献猎手", dim: "research",  target: 50,  current: 0, unit: "篇文献" },
  { id: "idea-20",   label: "领域综述", dim: "research",  target: 20,  current: 0, unit: "Idea节点" },
  // 产出力
  { id: "meet-1",    label: "初次汇报", dim: "output",    target: 1,   current: 0, unit: "次汇报" },
  { id: "meet-10",   label: "周会常客", dim: "output",    target: 10,  current: 0, unit: "次汇报" },
  { id: "idea-wk",   label: "想法喷涌", dim: "output",    target: 10,  current: 0, unit: "Idea/周" },
  // 健康力
  { id: "slp-7",     label: "早睡早起", dim: "health",    target: 7,   current: 0, unit: "天连续" },
  { id: "chk-30",    label: "运动达人", dim: "health",    target: 30,  current: 0, unit: "天打卡" },
  { id: "nrg-90",    label: "精力管理", dim: "health",    target: 90,  current: 0, unit: "精力值" },
  // 学习力
  { id: "pod-10",    label: "耳听八方", dim: "learning",  target: 10,  current: 0, unit: "播客" },
  { id: "trd-20",    label: "趋势捕手", dim: "learning",  target: 20,  current: 0, unit: "次探索" },
  // SAN
  { id: "san-7d",    label: "情绪稳定", dim: "san",       target: 7,   current: 0, unit: "天≥6" },
  { id: "san-30d",   label: "心如止水", dim: "san",       target: 30,  current: 0, unit: "天≥7" },
  // 幸福
  { id: "hap-80",    label: "小确幸",   dim: "happiness", target: 80,  current: 0, unit: "幸福指数" },
  { id: "bal",       label: "工作平衡", dim: "happiness", target: 2,   current: 0, unit: "维度≥60" },
];

const DIM_COLORS: Record<string, string> = {
  research: "#6366F1", output: "#10B981", health: "#F59E0B",
  learning: "#3B82F6", san: "#EC4899",   happiness: "#8B5CF6",
};

const DIM_LABELS: Record<string, string> = {
  research: "研究力", output: "产出力", health: "健康力",
  learning: "学习力", san: "SAN值",   happiness: "幸福感",
};

interface Props {
  unlockedSkills: Record<string, { unlocked_at: string }>;
}

export default function SkillGrid({ unlockedSkills }: Props) {
  const [newlyUnlocked, setNewlyUnlocked] = useState<string | null>(null);

  useEffect(() => {
    if (newlyUnlocked) {
      const t = setTimeout(() => setNewlyUnlocked(null), 3000);
      return () => clearTimeout(t);
    }
  }, [newlyUnlocked]);

  function getPct(skill: SkillNode): number {
    if (unlockedSkills[skill.id]) return 100;
    return Math.min(100, Math.round((skill.current / skill.target) * 100));
  }

  const dims = [...new Set(SKILLS.map((s) => s.dim))];

  return (
    <div className="space-y-6">
      {dims.map((dim) => {
        const dimSkills = SKILLS.filter((s) => s.dim === dim);
        const color = DIM_COLORS[dim];
        return (
          <div key={dim}>
            <h3 className="text-sm font-medium mb-3" style={{ color }}>
              {DIM_LABELS[dim]}
            </h3>
            <div className="flex flex-wrap gap-3">
              {dimSkills.map((skill) => {
                const pct = getPct(skill);
                const unlocked = pct >= 100;
                const isNew = newlyUnlocked === skill.id;
                const unlockDate = unlockedSkills[skill.id]?.unlocked_at?.slice(0, 10);

                return (
                  <div
                    key={skill.id}
                    className={`
                      relative w-24 rounded-xl border-2 p-2 text-center text-xs
                      transition-all duration-300
                      ${unlocked
                        ? "bg-slate-800 text-white"
                        : "bg-slate-900 border-slate-700 text-slate-400"
                      }
                      ${isNew ? "ring-2 ring-offset-1 ring-amber-400" : ""}
                    `}
                    style={{ borderColor: unlocked ? color : undefined }}
                    title={
                      unlocked && unlockDate
                        ? `解锁于 ${unlockDate}`
                        : `${skill.current}/${skill.target} ${skill.unit}`
                    }
                  >
                    <div className={`font-medium mb-1 ${unlocked ? "text-white" : ""}`}>
                      {skill.label}
                    </div>
                    {unlocked ? (
                      <div className="text-xs" style={{ color }}>✓ 已解锁</div>
                    ) : (
                      <>
                        <div className="text-slate-500 mb-1">{pct}%</div>
                        <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${pct}%`, backgroundColor: color }}
                          />
                        </div>
                      </>
                    )}
                    {unlocked && (
                      <div
                        className="absolute inset-0 rounded-xl pointer-events-none"
                        style={{ boxShadow: `0 0 8px 2px ${color}40` }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
