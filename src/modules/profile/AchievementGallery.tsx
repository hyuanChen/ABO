// src/modules/profile/AchievementGallery.tsx

interface Achievement {
  id: string;
  name: string;
  unlocked_at: string;
}

const ALL_ACHIEVEMENTS = [
  { id: "omni",      label: "全能研究者",  desc: "六维同时 ≥ 60",                icon: "⬡" },
  { id: "earlybird", label: "早起鸟",      desc: "连续 30 天 08:00 前打开 ABO", icon: "☀" },
  { id: "nightowl",  label: "深夜斗士",    desc: "23:00 后保存文献累计 50 次",  icon: "◑" },
  { id: "deepread",  label: "深度阅读",    desc: "文献 digest 达到 3 级",       icon: "◎" },
  { id: "automaster",label: "自动化大师",  desc: "创建 3 个自定义模块",         icon: "⚙" },
  { id: "loop",      label: "知识闭环",    desc: "arXiv → Idea → 组会完整走通", icon: "∞" },
];

interface Props {
  achievements: Achievement[];
}

export default function AchievementGallery({ achievements }: Props) {
  const unlockedMap = new Map(achievements.map((a) => [a.id, a]));

  return (
    <div>
      <h3 className="text-sm font-medium text-slate-400 mb-3">成就徽章</h3>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {ALL_ACHIEVEMENTS.map(({ id, label, desc, icon }) => {
          const unlocked = unlockedMap.get(id);
          return (
            <div
              key={id}
              className={`
                relative flex-shrink-0 w-20 rounded-xl border-2 p-2 text-center
                transition-all duration-200
                ${unlocked
                  ? "bg-slate-800 border-amber-500"
                  : "bg-slate-900/50 border-slate-700 opacity-40 grayscale"
                }
              `}
              title={
                unlocked
                  ? `解锁于 ${unlocked.unlocked_at.slice(0, 10)}\n${desc}`
                  : desc
              }
            >
              <div className="text-2xl mb-1">{icon}</div>
              <div
                className={`text-xs font-medium leading-tight ${
                  unlocked ? "text-amber-400" : "text-slate-500"
                }`}
              >
                {label}
              </div>
              {unlocked && (
                <div
                  className="absolute inset-0 rounded-xl pointer-events-none"
                  style={{ boxShadow: "0 0 10px 2px rgba(245,158,11,0.3)" }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
