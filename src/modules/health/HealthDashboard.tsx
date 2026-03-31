import { useState } from "react";
import { Heart, Activity, Moon, Sun, Droplets, Flame, CheckCircle2, Circle, TrendingUp } from "lucide-react";
import { PageContainer, PageHeader, PageContent, Card, Grid } from "../../components/Layout";

interface HealthMetric {
  id: string;
  name: string;
  value: number;
  unit: string;
  target: number;
  icon: React.ReactNode;
  color: string;
}

interface Habit {
  id: string;
  name: string;
  completed: boolean;
  streak: number;
  icon: React.ReactNode;
}

export default function HealthDashboard() {
  const [metrics] = useState<HealthMetric[]>([
    { id: "steps", name: "步数", value: 8234, unit: "步", target: 10000, icon: <Activity style={{ width: "20px", height: "20px" }} />, color: "#A8E6CF" },
    { id: "sleep", name: "睡眠", value: 7.5, unit: "小时", target: 8, icon: <Moon style={{ width: "20px", height: "20px" }} />, color: "#9D7BDB" },
    { id: "water", name: "饮水", value: 1500, unit: "ml", target: 2000, icon: <Droplets style={{ width: "20px", height: "20px" }} />, color: "#7BC8F0" },
    { id: "calories", name: "消耗", value: 420, unit: "千卡", target: 500, icon: <Flame style={{ width: "20px", height: "20px" }} />, color: "#FFB7B2" },
  ]);

  const [habits, setHabits] = useState<Habit[]>([
    { id: "1", name: "晨间拉伸", completed: true, streak: 12, icon: <Sun style={{ width: "18px", height: "18px" }} /> },
    { id: "2", name: "喝水 2L", completed: false, streak: 5, icon: <Droplets style={{ width: "18px", height: "18px" }} /> },
    { id: "3", name: "睡前阅读", completed: false, streak: 8, icon: <Moon style={{ width: "18px", height: "18px" }} /> },
    { id: "4", name: "站立办公", completed: true, streak: 15, icon: <Activity style={{ width: "18px", height: "18px" }} /> },
  ]);

  const toggleHabit = (id: string) => {
    setHabits(prev => prev.map(h =>
      h.id === id ? { ...h, completed: !h.completed } : h
    ));
  };

  const completedHabits = habits.filter(h => h.completed).length;
  const totalStreak = habits.reduce((sum, h) => sum + h.streak, 0);

  return (
    <PageContainer>
      <PageHeader
        title="健康管理"
        subtitle="追踪健康指标，养成好习惯"
        icon={Heart}
      />
      <PageContent maxWidth="1200px">
        {/* Summary Card */}
        <div
          style={{
            background: "linear-gradient(135deg, rgba(168, 230, 207, 0.2), rgba(157, 123, 219, 0.15))",
            borderRadius: "var(--radius-lg)",
            padding: "clamp(20px, 3vw, 28px)",
            border: "1px solid rgba(168, 230, 207, 0.3)",
            marginBottom: "clamp(20px, 3vw, 28px)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
            <div
              style={{
                width: "64px",
                height: "64px",
                borderRadius: "50%",
                background: "linear-gradient(135deg, #A8E6CF, #7DD3C0)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 4px 16px rgba(168, 230, 207, 0.4)",
                flexShrink: 0,
              }}
            >
              <Heart style={{ width: "32px", height: "32px", color: "white" }} />
            </div>
            <div style={{ flex: 1, minWidth: "200px" }}>
              <h2 style={{ fontSize: "clamp(1.125rem, 2vw, 1.25rem)", fontWeight: 700, color: "var(--text-main)", marginBottom: "4px" }}>
                今日健康概览
              </h2>
              <p style={{ fontSize: "0.9375rem", color: "var(--text-muted)" }}>
                已完成 {completedHabits}/{habits.length} 个习惯 · 连续打卡 {totalStreak} 天
              </p>
            </div>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <div style={{ textAlign: "center", padding: "12px 20px", background: "var(--bg-card)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-light)" }}>
                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#5BA88C" }}>{completedHabits}/{habits.length}</div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>今日习惯</div>
              </div>
              <div style={{ textAlign: "center", padding: "12px 20px", background: "var(--bg-card)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-light)" }}>
                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--color-primary)" }}>{totalStreak}</div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>累计打卡</div>
              </div>
            </div>
          </div>
        </div>

        {/* Health Metrics Grid */}
        <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-main)", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
          <Activity style={{ width: "20px", height: "20px", color: "var(--color-primary)" }} />
          健康指标
        </h3>
        <Grid columns={2} gap="md" style={{ marginBottom: "clamp(20px, 3vw, 28px)" }}>
          {metrics.map((metric) => {
            const percentage = Math.min((metric.value / metric.target) * 100, 100);
            return (
              <Card key={metric.id} style={{ padding: "20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
                  <div style={{ color: metric.color }}>{metric.icon}</div>
                  <span style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text-secondary)" }}>{metric.name}</span>
                  <span style={{ marginLeft: "auto", fontSize: "0.875rem", color: "var(--text-muted)" }}>
                    目标 {metric.target}{metric.unit}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "12px" }}>
                  <span style={{ fontSize: "2rem", fontWeight: 700, color: "var(--text-main)" }}>{metric.value}</span>
                  <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>{metric.unit}</span>
                  <span style={{ marginLeft: "auto", fontSize: "0.875rem", fontWeight: 600, color: percentage >= 100 ? "#5BA88C" : "var(--color-primary)" }}>
                    {percentage.toFixed(0)}%
                  </span>
                </div>
                <div style={{ height: "8px", background: "var(--bg-hover)", borderRadius: "var(--radius-full)", overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${percentage}%`,
                      background: `linear-gradient(90deg, ${metric.color}, ${metric.color}dd)`,
                      borderRadius: "var(--radius-full)",
                      transition: "width 0.5s ease",
                    }}
                  />
                </div>
              </Card>
            );
          })}
        </Grid>

        {/* Daily Habits */}
        <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-main)", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
          <CheckCircle2 style={{ width: "20px", height: "20px", color: "var(--color-primary)" }} />
          今日习惯打卡
        </h3>
        <Card>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {habits.map((habit) => (
              <button
                key={habit.id}
                onClick={() => toggleHabit(habit.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "16px",
                  padding: "16px 20px",
                  borderRadius: "var(--radius-md)",
                  background: habit.completed ? "rgba(168, 230, 207, 0.15)" : "var(--bg-hover)",
                  border: `1px solid ${habit.completed ? "rgba(168, 230, 207, 0.4)" : "var(--border-light)"}`,
                  cursor: "pointer",
                  transition: "all 0.3s ease",
                  textAlign: "left",
                  width: "100%",
                }}
              >
                <div style={{ color: habit.completed ? "#5BA88C" : "var(--text-muted)", flexShrink: 0 }}>
                  {habit.completed ? (
                    <CheckCircle2 style={{ width: "24px", height: "24px" }} />
                  ) : (
                    <Circle style={{ width: "24px", height: "24px" }} />
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "1rem", fontWeight: 600, color: habit.completed ? "#5BA88C" : "var(--text-main)" }}>
                    {habit.name}
                  </div>
                  <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: "2px" }}>
                    连续 {habit.streak} 天
                  </div>
                </div>
                <div style={{ color: habit.completed ? "#5BA88C" : "var(--text-muted)", opacity: 0.6 }}>
                  {habit.icon}
                </div>
              </button>
            ))}
          </div>
        </Card>

        {/* Weekly Trend Hint */}
        <div style={{ marginTop: "24px", textAlign: "center" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "12px 20px", borderRadius: "var(--radius-full)", background: "var(--bg-card)", border: "1px solid var(--border-light)" }}>
            <TrendingUp style={{ width: "18px", height: "18px", color: "var(--color-primary)" }} />
            <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>健康数据自动同步到 Journal</span>
          </div>
        </div>
      </PageContent>
    </PageContainer>
  );
}
