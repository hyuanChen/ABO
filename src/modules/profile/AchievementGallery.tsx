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
  showHeader?: boolean;
}

export default function AchievementGallery({ achievements, showHeader = true }: Props) {
  const unlockedMap = new Map(achievements.map((a) => [a.id, a]));

  return (
    <div>
      {showHeader && (
        <h3 style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "12px" }}>成就徽章</h3>
      )}
      <div style={{ display: "flex", gap: "12px", overflowX: "auto", paddingBottom: "8px" }}>
        {ALL_ACHIEVEMENTS.map(({ id, label, desc, icon }) => {
          const unlocked = unlockedMap.get(id);
          return (
            <div
              key={id}
              style={{
                position: "relative",
                flexShrink: 0,
                width: "80px",
                borderRadius: "var(--radius-lg)",
                border: "2px solid",
                borderColor: unlocked ? "#F59E0B" : "var(--border-color)",
                padding: "8px",
                textAlign: "center",
                transition: "all 0.2s ease",
                background: unlocked ? "var(--bg-card)" : "var(--bg-hover)",
                opacity: unlocked ? 1 : 0.4,
                filter: unlocked ? "none" : "grayscale(100%)",
              }}
              title={
                unlocked
                  ? `解锁于 ${unlocked.unlocked_at.slice(0, 10)}\n${desc}`
                  : desc
              }
            >
              <div style={{ fontSize: "1.5rem", marginBottom: "4px" }}>{icon}</div>
              <div
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 500,
                  lineHeight: 1.25,
                  color: unlocked ? "#F59E0B" : "var(--text-muted)",
                }}
              >
                {label}
              </div>
              {unlocked && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: "var(--radius-lg)",
                    pointerEvents: "none",
                    boxShadow: "0 0 10px 2px rgba(245,158,11,0.3)",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
