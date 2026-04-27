import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  Activity,
  ArrowUpRight,
  Bell,
  BookOpen,
  CheckCircle2,
  Circle,
  Clock,
  Droplets,
  Flame,
  Heart,
  Moon,
  Plus,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import { api } from "../../core/api";
import { useToast } from "../../components/Toast";
import { PageContainer, PageContent, PageHeader, Card, Grid } from "../../components/Layout";

interface HealthToday {
  date: string;
  sleep_hours: number | null;
  mood: number | null;
  energy: number | null;
  san: number | null;
  happiness: number | null;
  exercise_minutes: number | null;
  focus_minutes: number | null;
  water_ml: number | null;
  notes: string;
  identity_focus: string;
  work_mode: string;
  completed_habits: string[];
  completed_habits_count: number;
  enabled_habits_count: number;
  checkin_done: boolean;
}

interface HealthSummary {
  streak_days: number;
  avg_sleep_7d: number;
  avg_mood_7d: number;
  habit_completion_rate_7d: number;
  exercise_days_7d: number;
  health_score: number;
  last_checkin_date: string;
}

interface HealthHabit {
  id: string;
  name: string;
  cue: string;
  identity_anchor: string;
  preferred_window: string;
  category: string;
  enabled: boolean;
  completed_today: boolean;
}

interface ActivityBlock {
  id: string;
  label: string;
  start: string;
  end: string;
  duration_minutes: number;
  activity_count: number;
  dominant_type: string;
}

interface GuidanceItem {
  kind: string;
  title: string;
  detail: string;
  reason: string;
}

interface HistoryPoint {
  date: string;
  sleep_hours: number | null;
  mood: number | null;
  energy: number | null;
  exercise_minutes: number;
  focus_minutes: number;
  water_ml: number;
  completed_habits_count: number;
}

interface HealthDashboardData {
  today: HealthToday;
  summary: HealthSummary;
  identity: { codename: string; long_term_goal: string };
  motto: { motto: string; description: string; date: string };
  phase: { tone: string; label: string; detail: string };
  guidance: GuidanceItem[];
  reminders: ReminderItem[];
  reminder_preferences: ReminderPreferences;
  habits: HealthHabit[];
  activity_blocks: ActivityBlock[];
  history: HistoryPoint[];
  weekly_review: WeeklyReview;
  journal: { available: boolean; path: string | null; url: string | null };
}

interface ReminderItem {
  id: string;
  kind: string;
  title: string;
  body: string;
  level: string;
  due_now: boolean;
}

interface ReminderPreferences {
  notifications_enabled: boolean;
  checkin_reminder_enabled: boolean;
  hydration_reminder_enabled: boolean;
  movement_reminder_enabled: boolean;
  closure_reminder_enabled: boolean;
  review_reminder_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  poll_interval_minutes: number;
}

interface WeeklyReview {
  ready: boolean;
  headline: string;
  summary: string;
  wins: string[];
  risks: string[];
  experiments: string[];
  metrics: {
    days_recorded: number;
    avg_sleep: number;
    avg_mood: number;
    habit_completion_rate: number;
    exercise_days: number;
  };
}

interface CheckinFormState {
  sleep_hours: number;
  mood: number;
  energy: number;
  san: number;
  happiness: number;
  water_ml: number;
  exercise_minutes: number;
  focus_minutes: number;
  identity_focus: string;
  notes: string;
  work_mode: string;
}

interface HabitDraft {
  name: string;
  cue: string;
  identity_anchor: string;
  preferred_window: string;
}

interface DashboardResponse {
  ok?: boolean;
  dashboard: HealthDashboardData;
}

const WORK_MODE_OPTIONS = [
  { value: "deep", label: "深度推进日", hint: "适合集中收敛一个重点" },
  { value: "mixed", label: "混合处理日", hint: "输入、推进、收口都要兼顾" },
  { value: "recovery", label: "恢复维护日", hint: "优先把系统和身体拉回稳定" },
];

const MOOD_OPTIONS = [
  { value: 1, label: "很差" },
  { value: 2, label: "有点累" },
  { value: 3, label: "还行" },
  { value: 4, label: "不错" },
  { value: 5, label: "很好" },
];

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatShortDate(dateText: string): string {
  const parsed = new Date(dateText);
  return `${parsed.getMonth() + 1}/${parsed.getDate()}`;
}

function buildLinePath(points: Array<{ x: number; y: number }>): string {
  if (points.length < 2) return "";
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length; index += 1) {
    const prev = points[index - 1];
    const current = points[index];
    const cp1x = prev.x + (current.x - prev.x) / 3;
    const cp2x = prev.x + (current.x - prev.x) * 2 / 3;
    path += ` C ${cp1x} ${prev.y}, ${cp2x} ${current.y}, ${current.x} ${current.y}`;
  }
  return path;
}

function metricCardStyle(color: string): CSSProperties {
  return {
    padding: "18px 18px 16px",
    borderRadius: "20px",
    background: `linear-gradient(180deg, color-mix(in srgb, ${color} 12%, white) 0%, rgba(255,255,255,0.9) 100%)`,
    border: `1px solid color-mix(in srgb, ${color} 28%, rgba(148, 163, 184, 0.18))`,
    boxShadow: "0 14px 34px rgba(15, 23, 42, 0.06)",
  };
}

function hydrateForm(data: HealthDashboardData): CheckinFormState {
  return {
    sleep_hours: data.today.sleep_hours ?? 7,
    mood: data.today.mood ?? 3,
    energy: data.today.energy ?? 70,
    san: data.today.san ?? 6,
    happiness: data.today.happiness ?? 6,
    water_ml: data.today.water_ml ?? 900,
    exercise_minutes: data.today.exercise_minutes ?? 0,
    focus_minutes: data.today.focus_minutes ?? 0,
    identity_focus: data.today.identity_focus ?? "",
    notes: data.today.notes ?? "",
    work_mode: data.today.work_mode || "mixed",
  };
}

function HealthBars({
  title,
  subtitle,
  data,
}: {
  title: string;
  subtitle: string;
  data: HistoryPoint[];
}) {
  const visible = data.slice(-10);
  const maxValue = Math.max(...visible.map((item) => item.focus_minutes), 30);

  return (
    <Card title={title} summary={subtitle} style={{ height: "100%" }}>
      <div style={{ display: "grid", gap: "12px" }}>
        {visible.map((item) => (
          <div key={item.date}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px", marginBottom: "5px" }}>
              <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)", fontWeight: 700 }}>{formatShortDate(item.date)}</span>
              <span style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>
                专注 {item.focus_minutes} 分钟 · 习惯 {item.completed_habits_count} 项
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ flex: 1, height: "10px", borderRadius: "999px", background: "rgba(226, 232, 240, 0.8)", overflow: "hidden" }}>
                <div
                  style={{
                    width: `${Math.max(8, (item.focus_minutes / maxValue) * 100)}%`,
                    height: "100%",
                    borderRadius: "999px",
                    background: "linear-gradient(90deg, #c779d0 0%, #4bc0c8 100%)",
                  }}
                />
              </div>
              <span style={{ minWidth: "48px", textAlign: "right", fontSize: "0.76rem", color: "var(--text-secondary)", fontWeight: 700 }}>
                {item.exercise_minutes} min
              </span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function HealthDashboard() {
  const toast = useToast();
  const [dashboard, setDashboard] = useState<HealthDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [habitSaving, setHabitSaving] = useState<string | null>(null);
  const [creatingHabit, setCreatingHabit] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [preferenceSaving, setPreferenceSaving] = useState(false);
  const [form, setForm] = useState<CheckinFormState>({
    sleep_hours: 7,
    mood: 3,
    energy: 70,
    san: 6,
    happiness: 6,
    water_ml: 900,
    exercise_minutes: 0,
    focus_minutes: 0,
    identity_focus: "",
    notes: "",
    work_mode: "mixed",
  });
  const [habitDraft, setHabitDraft] = useState<HabitDraft>({
    name: "",
    cue: "",
    identity_anchor: "",
    preferred_window: "",
  });

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard(silent = false) {
    try {
      if (!silent) setLoading(true);
      const data = await api.get<HealthDashboardData>("/api/health/dashboard");
      setDashboard(data);
      setForm(hydrateForm(data));
      setErrorMessage("");
    } catch (error) {
      console.error("Failed to load health dashboard", error);
      setErrorMessage(error instanceof Error ? error.message : "健康仪表盘接口暂时不可用");
      toast.error("健康模块加载失败");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function refreshDashboard() {
    try {
      setRefreshing(true);
      await loadDashboard(true);
    } finally {
      setRefreshing(false);
    }
  }

  async function submitCheckin() {
    try {
      setSaving(true);
      const response = await api.post<DashboardResponse>("/api/health/checkin", form);
      setDashboard(response.dashboard);
      setForm(hydrateForm(response.dashboard));
      toast.success("今日健康记录已更新", "系统会按这份状态继续判断今天的提醒。");
    } catch (error) {
      console.error("Failed to save health checkin", error);
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function toggleHabit(habit: HealthHabit) {
    try {
      setHabitSaving(habit.id);
      const response = await api.post<DashboardResponse>(`/api/health/habits/${habit.id}/toggle`, {
        completed: !habit.completed_today,
      });
      setDashboard(response.dashboard);
      setForm(hydrateForm(response.dashboard));
    } catch (error) {
      console.error("Failed to toggle habit", error);
      toast.error("打卡失败");
    } finally {
      setHabitSaving(null);
    }
  }

  async function addHabit() {
    const name = habitDraft.name.trim();
    if (!name) {
      toast.info("先写一个习惯名称");
      return;
    }
    try {
      setCreatingHabit(true);
      const response = await api.post<DashboardResponse>("/api/health/habits", habitDraft);
      setDashboard(response.dashboard);
      setForm(hydrateForm(response.dashboard));
      setHabitDraft({ name: "", cue: "", identity_anchor: "", preferred_window: "" });
      toast.success("已加入新的打卡项");
    } catch (error) {
      console.error("Failed to add habit", error);
      toast.error("新增习惯失败");
    } finally {
      setCreatingHabit(false);
    }
  }

  async function updateReminderPreference(patch: Partial<ReminderPreferences>) {
    try {
      setPreferenceSaving(true);
      const response = await api.post<DashboardResponse>("/api/health/preferences", patch);
      setDashboard(response.dashboard);
      if (patch.notifications_enabled && "Notification" in window && Notification.permission === "default") {
        await Notification.requestPermission();
      }
      toast.success("提醒设置已更新");
    } catch (error) {
      console.error("Failed to update reminder preferences", error);
      toast.error("提醒设置保存失败");
    } finally {
      setPreferenceSaving(false);
    }
  }

  const chartData = useMemo(() => {
    if (!dashboard) return [];
    return dashboard.history.slice(-14);
  }, [dashboard]);

  if (loading) {
    return (
      <PageContainer>
        <PageHeader title="健康管理" subtitle="把今天的节律、恢复和习惯放到同一张工作台里看" icon={Heart} />
        <PageContent maxWidth="1240px">
          <div style={{ minHeight: "360px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "14px", color: "var(--text-muted)" }}>
              <RefreshCw style={{ width: "20px", height: "20px", animation: "spin 1s linear infinite" }} />
              <span style={{ fontSize: "0.95rem" }}>正在整理你今天的健康工作台...</span>
            </div>
          </div>
        </PageContent>
      </PageContainer>
    );
  }

  if (!dashboard) {
    return (
      <PageContainer>
        <PageHeader title="健康管理" subtitle="把今天的节律、恢复和习惯放到同一张工作台里看" icon={Heart} />
        <PageContent maxWidth="860px">
          <Card title="健康模块暂时没加载出来" summary="先给你一个可恢复状态，不让页面一直卡在空白加载里">
            <div style={{ display: "grid", gap: "14px" }}>
              <div style={{ fontSize: "0.92rem", lineHeight: 1.8, color: "var(--text-secondary)" }}>
                这通常是后端接口没起来、旧进程还没重载，或者当前健康数据文件损坏。页面已经避免白屏，你可以直接重试。
              </div>
              {errorMessage && (
                <div style={{ padding: "12px 14px", borderRadius: "16px", background: "var(--bg-hover)", color: "var(--text-secondary)", fontSize: "0.82rem", lineHeight: 1.7 }}>
                  {errorMessage}
                </div>
              )}
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                <button
                  onClick={() => loadDashboard()}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    border: "none",
                    borderRadius: "999px",
                    padding: "11px 16px",
                    background: "linear-gradient(135deg, #ec8f5e 0%, #b88af7 100%)",
                    color: "#fff",
                    fontSize: "0.86rem",
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  <RefreshCw style={{ width: "15px", height: "15px" }} />
                  重试加载
                </button>
              </div>
            </div>
          </Card>
        </PageContent>
      </PageContainer>
    );
  }

  const identityTitle = dashboard.identity.codename || "研究者";
  const completionLabel = `${dashboard.today.completed_habits_count}/${dashboard.today.enabled_habits_count || dashboard.habits.length}`;

  return (
    <PageContainer>
      <PageHeader
        title="健康管理"
        subtitle="不是单独打卡页，而是会结合今天行为节律给出提醒的健康工作台"
        icon={Heart}
        actions={(
          <>
            {dashboard.journal.available && dashboard.journal.url && (
              <button
                onClick={() => { window.location.href = dashboard.journal.url as string; }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 14px",
                  borderRadius: "999px",
                  border: "1px solid var(--border-light)",
                  background: "var(--bg-card)",
                  color: "var(--text-secondary)",
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                <BookOpen style={{ width: "15px", height: "15px" }} />
                今日日志
                <ArrowUpRight style={{ width: "14px", height: "14px" }} />
              </button>
            )}
            <button
              onClick={refreshDashboard}
              disabled={refreshing}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 14px",
                borderRadius: "999px",
                border: "1px solid rgba(124, 58, 237, 0.14)",
                background: "linear-gradient(135deg, rgba(255,255,255,0.96), rgba(246, 244, 255, 0.96))",
                color: "var(--text-main)",
                fontSize: "0.85rem",
                fontWeight: 700,
                cursor: refreshing ? "wait" : "pointer",
              }}
            >
              <RefreshCw style={{ width: "15px", height: "15px", animation: refreshing ? "spin 1s linear infinite" : undefined }} />
              刷新判断
            </button>
          </>
        )}
      />
      <PageContent maxWidth="1280px">
        <section
          style={{
            position: "relative",
            marginBottom: "28px",
            padding: "clamp(20px, 3vw, 30px)",
            borderRadius: "28px",
            background: "linear-gradient(135deg, rgba(255, 248, 244, 0.96) 0%, rgba(249, 247, 255, 0.98) 46%, rgba(240, 249, 255, 0.98) 100%)",
            border: "1px solid rgba(148, 163, 184, 0.18)",
            boxShadow: "0 24px 60px rgba(15, 23, 42, 0.08)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              background: "radial-gradient(circle at top right, rgba(255, 196, 164, 0.22) 0%, transparent 32%), radial-gradient(circle at bottom left, rgba(179, 168, 255, 0.18) 0%, transparent 34%)",
            }}
          />
          <div style={{ position: "relative", display: "grid", gap: "24px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "18px", flexWrap: "wrap" }}>
              <div style={{ maxWidth: "720px" }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "7px 12px", borderRadius: "999px", background: "rgba(255, 255, 255, 0.78)", border: "1px solid rgba(148, 163, 184, 0.16)", color: "var(--text-secondary)", fontSize: "0.76rem", fontWeight: 700, marginBottom: "14px" }}>
                  <Sparkles style={{ width: "14px", height: "14px", color: "#d97706" }} />
                  后台判断基于今天在 ABO 里的时间线、打卡和你的主观状态
                </div>
                <h2 style={{ fontSize: "clamp(1.45rem, 2.8vw, 2.2rem)", lineHeight: 1.15, fontWeight: 800, color: "var(--text-main)", marginBottom: "10px", maxWidth: "16ch" }}>
                  {dashboard.phase.label}，{identityTitle} 今天先把节律守住，再把任务推进好。
                </h2>
                <p style={{ fontSize: "0.98rem", lineHeight: 1.75, color: "var(--text-secondary)", maxWidth: "62ch", marginBottom: "10px" }}>
                  {dashboard.phase.detail}
                </p>
                <p style={{ fontSize: "0.84rem", lineHeight: 1.7, color: "var(--text-muted)", maxWidth: "68ch" }}>
                  {dashboard.identity.long_term_goal || "把今天的健康与工作节律放进长期成长视角里。"}
                </p>
              </div>
              <div style={{ minWidth: "220px", padding: "18px 18px 16px", borderRadius: "22px", background: "rgba(255,255,255,0.78)", border: "1px solid rgba(148, 163, 184, 0.14)" }}>
                <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: "8px" }}>今日一句</div>
                <div style={{ fontSize: "1rem", lineHeight: 1.7, fontWeight: 700, color: "var(--text-main)" }}>
                  {dashboard.motto.motto || "先记录，才能形成会理解你的提醒。"}
                </div>
                {dashboard.motto.description && (
                  <div style={{ marginTop: "8px", fontSize: "0.8rem", lineHeight: 1.7, color: "var(--text-secondary)" }}>
                    {dashboard.motto.description}
                  </div>
                )}
              </div>
            </div>

            <Grid columns={4} gap="md">
              <div style={metricCardStyle("#f59e0b")}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", color: "#9a3412" }}>
                  <Heart style={{ width: "16px", height: "16px" }} />
                  <span style={{ fontSize: "0.8rem", fontWeight: 700 }}>健康分</span>
                </div>
                <div style={{ fontSize: "2.1rem", fontWeight: 800, lineHeight: 1, color: "var(--text-main)" }}>{dashboard.summary.health_score}</div>
                <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginTop: "8px", lineHeight: 1.65 }}>
                  最近 7 天睡眠、情绪、习惯和连续记录共同计算。
                </div>
              </div>
              <div style={metricCardStyle("#34d399")}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", color: "#047857" }}>
                  <TrendingUp style={{ width: "16px", height: "16px" }} />
                  <span style={{ fontSize: "0.8rem", fontWeight: 700 }}>连续记录</span>
                </div>
                <div style={{ fontSize: "2.1rem", fontWeight: 800, lineHeight: 1, color: "var(--text-main)" }}>{dashboard.summary.streak_days}</div>
                <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginTop: "8px", lineHeight: 1.65 }}>
                  今天已打卡：{dashboard.today.checkin_done ? "是" : "否"}，上次记录 {dashboard.summary.last_checkin_date || "暂无"}。
                </div>
              </div>
              <div style={metricCardStyle("#60a5fa")}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", color: "#1d4ed8" }}>
                  <Moon style={{ width: "16px", height: "16px" }} />
                  <span style={{ fontSize: "0.8rem", fontWeight: 700 }}>平均睡眠</span>
                </div>
                <div style={{ fontSize: "2.1rem", fontWeight: 800, lineHeight: 1, color: "var(--text-main)" }}>{dashboard.summary.avg_sleep_7d || "--"}</div>
                <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginTop: "8px", lineHeight: 1.65 }}>
                  最近 7 天情绪均值 {dashboard.summary.avg_mood_7d || "--"} / 5。
                </div>
              </div>
              <div style={metricCardStyle("#a78bfa")}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", color: "#6d28d9" }}>
                  <CheckCircle2 style={{ width: "16px", height: "16px" }} />
                  <span style={{ fontSize: "0.8rem", fontWeight: 700 }}>习惯执行</span>
                </div>
                <div style={{ fontSize: "2.1rem", fontWeight: 800, lineHeight: 1, color: "var(--text-main)" }}>{completionLabel}</div>
                <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginTop: "8px", lineHeight: 1.65 }}>
                  近 7 天完成率 {formatPercent(dashboard.summary.habit_completion_rate_7d)}。
                </div>
              </div>
            </Grid>
          </div>
        </section>

        <Grid columns={2} gap="lg" style={{ marginBottom: "28px" }}>
          <Card
            title="今日状态校准"
            summary="只填少量关键状态，系统会根据这份记录继续判断今天提醒"
            style={{ height: "100%" }}
          >
            <div style={{ display: "grid", gap: "18px" }}>
              <div style={{ display: "grid", gap: "14px" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "8px" }}>
                    <label style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--text-main)" }}>睡眠时长</label>
                    <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>{form.sleep_hours.toFixed(1)} 小时</span>
                  </div>
                  <input type="range" min="0" max="12" step="0.5" value={form.sleep_hours} onChange={(event) => setForm((current) => ({ ...current, sleep_hours: Number(event.target.value) }))} className="w-full" />
                </div>

                <div>
                  <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--text-main)", marginBottom: "10px" }}>今天心情</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: "8px" }}>
                    {MOOD_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => setForm((current) => ({ ...current, mood: option.value }))}
                        style={{
                          padding: "10px 8px",
                          borderRadius: "14px",
                          border: option.value === form.mood ? "1px solid rgba(217, 119, 6, 0.38)" : "1px solid var(--border-light)",
                          background: option.value === form.mood ? "rgba(255, 247, 237, 0.96)" : "var(--bg-card)",
                          color: option.value === form.mood ? "#9a3412" : "var(--text-secondary)",
                          fontSize: "0.78rem",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "8px" }}>
                    <label style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--text-main)" }}>精力</label>
                    <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>{form.energy} / 100</span>
                  </div>
                  <input type="range" min="0" max="100" step="5" value={form.energy} onChange={(event) => setForm((current) => ({ ...current, energy: Number(event.target.value) }))} className="w-full" />
                </div>

                <Grid columns={2} gap="md">
                  <div>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "8px" }}>SAN</label>
                    <input type="number" min="1" max="10" value={form.san} onChange={(event) => setForm((current) => ({ ...current, san: Number(event.target.value) || 1 }))} style={{ width: "100%", borderRadius: "14px", border: "1px solid var(--border-light)", padding: "10px 12px", background: "var(--bg-card)" }} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "8px" }}>幸福感</label>
                    <input type="number" min="1" max="10" value={form.happiness} onChange={(event) => setForm((current) => ({ ...current, happiness: Number(event.target.value) || 1 }))} style={{ width: "100%", borderRadius: "14px", border: "1px solid var(--border-light)", padding: "10px 12px", background: "var(--bg-card)" }} />
                  </div>
                </Grid>

                <Grid columns={3} gap="md">
                  <div>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "8px" }}>饮水 ml</label>
                    <input type="number" min="0" value={form.water_ml} onChange={(event) => setForm((current) => ({ ...current, water_ml: Number(event.target.value) || 0 }))} style={{ width: "100%", borderRadius: "14px", border: "1px solid var(--border-light)", padding: "10px 12px", background: "var(--bg-card)" }} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "8px" }}>活动 min</label>
                    <input type="number" min="0" value={form.exercise_minutes} onChange={(event) => setForm((current) => ({ ...current, exercise_minutes: Number(event.target.value) || 0 }))} style={{ width: "100%", borderRadius: "14px", border: "1px solid var(--border-light)", padding: "10px 12px", background: "var(--bg-card)" }} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "8px" }}>专注 min</label>
                    <input type="number" min="0" value={form.focus_minutes} onChange={(event) => setForm((current) => ({ ...current, focus_minutes: Number(event.target.value) || 0 }))} style={{ width: "100%", borderRadius: "14px", border: "1px solid var(--border-light)", padding: "10px 12px", background: "var(--bg-card)" }} />
                  </div>
                </Grid>
              </div>

              <div>
                <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--text-main)", marginBottom: "10px" }}>今天按什么模式工作</div>
                <div style={{ display: "grid", gap: "8px" }}>
                  {WORK_MODE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setForm((current) => ({ ...current, work_mode: option.value }))}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        gap: "14px",
                        padding: "12px 14px",
                        borderRadius: "16px",
                        border: form.work_mode === option.value ? "1px solid rgba(124, 58, 237, 0.26)" : "1px solid var(--border-light)",
                        background: form.work_mode === option.value ? "rgba(245, 243, 255, 0.96)" : "var(--bg-card)",
                        textAlign: "left",
                        cursor: "pointer",
                      }}
                    >
                      <span>
                        <span style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, color: "var(--text-main)", marginBottom: "3px" }}>{option.label}</span>
                        <span style={{ fontSize: "0.76rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>{option.hint}</span>
                      </span>
                      <span style={{ marginTop: "2px", color: form.work_mode === option.value ? "var(--color-primary)" : "var(--text-light)" }}>
                        {form.work_mode === option.value ? <CheckCircle2 style={{ width: "18px", height: "18px" }} /> : <Circle style={{ width: "18px", height: "18px" }} />}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "8px" }}>
                  今天想守住的身份提示
                </label>
                <input
                  value={form.identity_focus}
                  onChange={(event) => setForm((current) => ({ ...current, identity_focus: event.target.value }))}
                  placeholder="例如：先收敛一个问题，而不是被信息拖着走"
                  style={{ width: "100%", borderRadius: "16px", border: "1px solid var(--border-light)", padding: "12px 14px", background: "var(--bg-card)" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "8px" }}>
                  备注
                </label>
                <textarea
                  value={form.notes}
                  onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                  placeholder="记录今天身体或节律上的异常，比如头痛、状态很散、需要早收工"
                  rows={4}
                  style={{ width: "100%", resize: "vertical", borderRadius: "18px", border: "1px solid var(--border-light)", padding: "12px 14px", background: "var(--bg-card)", lineHeight: 1.7 }}
                />
              </div>

              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                <button
                  onClick={submitCheckin}
                  disabled={saving}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "10px",
                    border: "none",
                    borderRadius: "999px",
                    padding: "12px 18px",
                    background: "linear-gradient(135deg, #ec8f5e 0%, #b88af7 100%)",
                    color: "#fff",
                    fontSize: "0.9rem",
                    fontWeight: 800,
                    boxShadow: "0 14px 28px rgba(184, 138, 247, 0.2)",
                    cursor: saving ? "wait" : "pointer",
                    opacity: saving ? 0.7 : 1,
                  }}
                >
                  {saving ? <RefreshCw style={{ width: "16px", height: "16px", animation: "spin 1s linear infinite" }} /> : <Heart style={{ width: "16px", height: "16px" }} />}
                  {saving ? "保存中..." : "保存今日状态"}
                </button>
                <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", color: "var(--text-muted)", fontSize: "0.8rem", lineHeight: 1.6 }}>
                  <Clock style={{ width: "15px", height: "15px" }} />
                  这份记录会同步进时间线判断和 Journal。
                </div>
              </div>
            </div>
          </Card>

          <div style={{ display: "grid", gap: "18px", height: "100%" }}>
            <Card title="提醒中心" summary="这里不只展示建议，还能直接把后台提醒真正打开">
              <div style={{ display: "grid", gap: "14px" }}>
                <div style={{ display: "grid", gap: "10px" }}>
                  {dashboard.reminders.map((item, index) => (
                    <div
                      key={item.id}
                      style={{
                        padding: "14px 16px",
                        borderRadius: "18px",
                        background: index === 0 ? "linear-gradient(135deg, rgba(255, 247, 237, 0.96), rgba(250, 245, 255, 0.96))" : "var(--bg-hover)",
                        border: index === 0 ? "1px solid rgba(251, 146, 60, 0.2)" : "1px solid var(--border-light)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", marginBottom: "6px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <Bell style={{ width: "15px", height: "15px", color: index === 0 ? "#ea580c" : "var(--color-primary)" }} />
                          <span style={{ fontSize: "0.88rem", fontWeight: 800, color: "var(--text-main)" }}>{item.title}</span>
                        </div>
                        <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{item.level}</span>
                      </div>
                      <div style={{ fontSize: "0.84rem", lineHeight: 1.7, color: "var(--text-secondary)" }}>{item.body}</div>
                    </div>
                  ))}
                  {dashboard.reminders.length === 0 && (
                    <div style={{ padding: "14px 16px", borderRadius: "18px", background: "var(--bg-hover)", border: "1px solid var(--border-light)", color: "var(--text-secondary)", fontSize: "0.84rem", lineHeight: 1.7 }}>
                      当前没有到点的提醒。系统仍会继续结合你的节律判断。
                    </div>
                  )}
                </div>

                <div style={{ paddingTop: "12px", borderTop: "1px solid var(--border-light)", display: "grid", gap: "10px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                    <div>
                      <div style={{ fontSize: "0.88rem", fontWeight: 800, color: "var(--text-main)" }}>后台提醒开关</div>
                      <div style={{ fontSize: "0.76rem", color: "var(--text-muted)", marginTop: "4px" }}>
                        开启后，应用会轮询健康提醒并尝试发系统通知；拿不到权限时退化成应用内提醒。
                      </div>
                    </div>
                    <button
                      onClick={() => updateReminderPreference({ notifications_enabled: !dashboard.reminder_preferences.notifications_enabled })}
                      disabled={preferenceSaving}
                      style={{
                        border: "none",
                        borderRadius: "999px",
                        padding: "10px 14px",
                        background: dashboard.reminder_preferences.notifications_enabled ? "linear-gradient(135deg, #ec8f5e 0%, #b88af7 100%)" : "var(--bg-hover)",
                        color: dashboard.reminder_preferences.notifications_enabled ? "#fff" : "var(--text-secondary)",
                        fontSize: "0.82rem",
                        fontWeight: 800,
                        cursor: preferenceSaving ? "wait" : "pointer",
                      }}
                    >
                      {dashboard.reminder_preferences.notifications_enabled ? "已开启" : "开启提醒"}
                    </button>
                  </div>

                  <Grid columns={2} gap="md">
                    {[
                      { key: "checkin_reminder_enabled", label: "状态校准提醒" },
                      { key: "hydration_reminder_enabled", label: "补水提醒" },
                      { key: "movement_reminder_enabled", label: "活动提醒" },
                      { key: "closure_reminder_enabled", label: "收工提醒" },
                    ].map((item) => {
                      const key = item.key as keyof ReminderPreferences;
                      const active = Boolean(dashboard.reminder_preferences[key]);
                      return (
                        <button
                          key={item.key}
                          onClick={() => updateReminderPreference({ [item.key]: !active } as Partial<ReminderPreferences>)}
                          disabled={preferenceSaving}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "10px",
                            padding: "12px 14px",
                            borderRadius: "16px",
                            border: active ? "1px solid rgba(124, 58, 237, 0.22)" : "1px solid var(--border-light)",
                            background: active ? "rgba(245, 243, 255, 0.96)" : "var(--bg-card)",
                            color: "var(--text-main)",
                            cursor: preferenceSaving ? "wait" : "pointer",
                          }}
                        >
                          <span style={{ fontSize: "0.82rem", fontWeight: 700 }}>{item.label}</span>
                          <span style={{ fontSize: "0.76rem", color: active ? "var(--color-primary)" : "var(--text-muted)" }}>
                            {active ? "开" : "关"}
                          </span>
                        </button>
                      );
                    })}
                  </Grid>
                </div>
              </div>
            </Card>

            <Card title="今天的节律轨迹" summary="根据 ABO 内的活动时间线自动分段，帮助你看工作块和恢复空隙">
              {dashboard.activity_blocks.length > 0 ? (
                <div style={{ display: "grid", gap: "14px" }}>
                  <div style={{ display: "flex", gap: "10px", alignItems: "stretch", overflowX: "auto", paddingBottom: "4px" }}>
                    {dashboard.activity_blocks.map((block) => (
                      <div
                        key={block.id}
                        style={{
                          minWidth: `${Math.max(140, Math.min(260, block.duration_minutes * 1.6))}px`,
                          padding: "14px 16px",
                          borderRadius: "20px",
                          background: "linear-gradient(180deg, rgba(255,255,255,0.96), rgba(246, 248, 255, 0.92))",
                          border: "1px solid rgba(148, 163, 184, 0.16)",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", marginBottom: "12px" }}>
                          <span style={{ fontSize: "0.84rem", fontWeight: 800, color: "var(--text-main)" }}>{block.label}</span>
                          <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{block.activity_count} 项</span>
                        </div>
                        <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--text-main)", marginBottom: "6px" }}>{block.duration_minutes} min</div>
                        <div style={{ fontSize: "0.78rem", lineHeight: 1.6, color: "var(--text-secondary)" }}>
                          {block.start} - {block.end}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "0.79rem", color: "var(--text-muted)" }}>
                    <Activity style={{ width: "15px", height: "15px" }} />
                    当前只基于 ABO 内的行为痕迹判断，不会假装读取系统级全局活动。
                  </div>
                </div>
              ) : (
                <div style={{ minHeight: "160px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: "0.88rem", textAlign: "center", lineHeight: 1.8 }}>
                  今天还没有足够的时间线痕迹。开始浏览、对话或保存状态后，这里会自动形成你的工作块。
                </div>
              )}
            </Card>
          </div>
        </Grid>

        <Grid columns={2} gap="lg" style={{ marginBottom: "28px" }}>
          <Card title="习惯与想成为的人" summary="打卡不是单独完成动作，而是给每个习惯一个身份锚点">
            <div style={{ display: "grid", gap: "12px", marginBottom: "18px" }}>
              {dashboard.habits.map((habit) => (
                <button
                  key={habit.id}
                  onClick={() => toggleHabit(habit)}
                  disabled={habitSaving === habit.id}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "14px",
                    width: "100%",
                    textAlign: "left",
                    padding: "14px 16px",
                    borderRadius: "18px",
                    border: habit.completed_today ? "1px solid rgba(16, 185, 129, 0.24)" : "1px solid var(--border-light)",
                    background: habit.completed_today ? "rgba(236, 253, 245, 0.98)" : "var(--bg-card)",
                    cursor: habitSaving === habit.id ? "wait" : "pointer",
                    opacity: habitSaving === habit.id ? 0.7 : 1,
                  }}
                >
                  <div style={{ marginTop: "2px", color: habit.completed_today ? "#059669" : "var(--text-light)" }}>
                    {habit.completed_today ? <CheckCircle2 style={{ width: "20px", height: "20px" }} /> : <Circle style={{ width: "20px", height: "20px" }} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "4px" }}>
                      <span style={{ fontSize: "0.92rem", fontWeight: 800, color: "var(--text-main)" }}>{habit.name}</span>
                      <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{habit.preferred_window || "任意时间"}</span>
                    </div>
                    {habit.cue && (
                      <div style={{ fontSize: "0.8rem", lineHeight: 1.65, color: "var(--text-secondary)", marginBottom: "4px" }}>
                        触发时机：{habit.cue}
                      </div>
                    )}
                    {habit.identity_anchor && (
                      <div style={{ fontSize: "0.78rem", lineHeight: 1.65, color: "var(--text-muted)" }}>
                        {habit.identity_anchor}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>

            <div style={{ paddingTop: "16px", borderTop: "1px solid var(--border-light)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                <Plus style={{ width: "16px", height: "16px", color: "var(--color-primary)" }} />
                <span style={{ fontSize: "0.88rem", fontWeight: 800, color: "var(--text-main)" }}>新增一个值得长期坚持的小动作</span>
              </div>
              <div style={{ display: "grid", gap: "10px" }}>
                <input
                  value={habitDraft.name}
                  onChange={(event) => setHabitDraft((current) => ({ ...current, name: event.target.value }))}
                  placeholder="习惯名，例如：17:30 前离开屏幕走一圈"
                  style={{ width: "100%", borderRadius: "15px", border: "1px solid var(--border-light)", padding: "11px 13px", background: "var(--bg-card)" }}
                />
                <Grid columns={2} gap="md">
                  <input
                    value={habitDraft.cue}
                    onChange={(event) => setHabitDraft((current) => ({ ...current, cue: event.target.value }))}
                    placeholder="触发时机"
                    style={{ width: "100%", borderRadius: "15px", border: "1px solid var(--border-light)", padding: "11px 13px", background: "var(--bg-card)" }}
                  />
                  <input
                    value={habitDraft.preferred_window}
                    onChange={(event) => setHabitDraft((current) => ({ ...current, preferred_window: event.target.value }))}
                    placeholder="建议时间段"
                    style={{ width: "100%", borderRadius: "15px", border: "1px solid var(--border-light)", padding: "11px 13px", background: "var(--bg-card)" }}
                  />
                </Grid>
                <input
                  value={habitDraft.identity_anchor}
                  onChange={(event) => setHabitDraft((current) => ({ ...current, identity_anchor: event.target.value }))}
                  placeholder="为什么这件事和你想成为的人有关"
                  style={{ width: "100%", borderRadius: "15px", border: "1px solid var(--border-light)", padding: "11px 13px", background: "var(--bg-card)" }}
                />
                <button
                  onClick={addHabit}
                  disabled={creatingHabit}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    border: "1px solid rgba(124, 58, 237, 0.16)",
                    borderRadius: "999px",
                    padding: "11px 14px",
                    background: "rgba(245, 243, 255, 0.96)",
                    color: "var(--text-main)",
                    fontSize: "0.86rem",
                    fontWeight: 800,
                    cursor: creatingHabit ? "wait" : "pointer",
                  }}
                >
                  <Plus style={{ width: "15px", height: "15px" }} />
                  {creatingHabit ? "添加中..." : "加入我的打卡清单"}
                </button>
              </div>
            </div>
          </Card>

          <Card title="快速读懂今天缺什么" summary="把最容易忽视的身体与工作指标放到一起">
            <div style={{ display: "grid", gap: "12px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "92px 1fr auto", alignItems: "center", gap: "12px" }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", color: "var(--text-main)", fontWeight: 700 }}>
                  <Moon style={{ width: "16px", height: "16px", color: "#64748b" }} />
                  睡眠
                </div>
                <div style={{ height: "10px", borderRadius: "999px", background: "rgba(226, 232, 240, 0.9)", overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(100, ((dashboard.today.sleep_hours ?? 0) / 8) * 100)}%`, height: "100%", background: "linear-gradient(90deg, #64748b, #a5b4fc)" }} />
                </div>
                <div style={{ minWidth: "58px", textAlign: "right", fontSize: "0.8rem", fontWeight: 700, color: "var(--text-secondary)" }}>{dashboard.today.sleep_hours ?? "--"} h</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "92px 1fr auto", alignItems: "center", gap: "12px" }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", color: "var(--text-main)", fontWeight: 700 }}>
                  <Droplets style={{ width: "16px", height: "16px", color: "#0ea5e9" }} />
                  补水
                </div>
                <div style={{ height: "10px", borderRadius: "999px", background: "rgba(226, 232, 240, 0.9)", overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(100, ((dashboard.today.water_ml ?? 0) / 2000) * 100)}%`, height: "100%", background: "linear-gradient(90deg, #38bdf8, #22d3ee)" }} />
                </div>
                <div style={{ minWidth: "58px", textAlign: "right", fontSize: "0.8rem", fontWeight: 700, color: "var(--text-secondary)" }}>{dashboard.today.water_ml ?? 0} ml</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "92px 1fr auto", alignItems: "center", gap: "12px" }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", color: "var(--text-main)", fontWeight: 700 }}>
                  <Flame style={{ width: "16px", height: "16px", color: "#f97316" }} />
                  活动
                </div>
                <div style={{ height: "10px", borderRadius: "999px", background: "rgba(226, 232, 240, 0.9)", overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(100, ((dashboard.today.exercise_minutes ?? 0) / 30) * 100)}%`, height: "100%", background: "linear-gradient(90deg, #fb923c, #f97316)" }} />
                </div>
                <div style={{ minWidth: "58px", textAlign: "right", fontSize: "0.8rem", fontWeight: 700, color: "var(--text-secondary)" }}>{dashboard.today.exercise_minutes ?? 0} min</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "92px 1fr auto", alignItems: "center", gap: "12px" }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", color: "var(--text-main)", fontWeight: 700 }}>
                  <Target style={{ width: "16px", height: "16px", color: "#8b5cf6" }} />
                  专注
                </div>
                <div style={{ height: "10px", borderRadius: "999px", background: "rgba(226, 232, 240, 0.9)", overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(100, ((dashboard.today.focus_minutes ?? 0) / 180) * 100)}%`, height: "100%", background: "linear-gradient(90deg, #8b5cf6, #d946ef)" }} />
                </div>
                <div style={{ minWidth: "58px", textAlign: "right", fontSize: "0.8rem", fontWeight: 700, color: "var(--text-secondary)" }}>{dashboard.today.focus_minutes ?? 0} min</div>
              </div>

              <div style={{ marginTop: "6px", padding: "14px 16px", borderRadius: "18px", background: "var(--bg-hover)", border: "1px solid var(--border-light)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                  <Sparkles style={{ width: "15px", height: "15px", color: "var(--color-primary)" }} />
                  <span style={{ fontSize: "0.86rem", fontWeight: 800, color: "var(--text-main)" }}>为何这样设计</span>
                </div>
                <div style={{ fontSize: "0.82rem", lineHeight: 1.75, color: "var(--text-secondary)" }}>
                  这页优先记录对你当天决策最有影响的少量信号：恢复、主观状态、活动量和习惯执行。这样系统既能持续提醒，又不会把你拖进一个高维护成本的重型健康工具。
                </div>
              </div>
            </div>
          </Card>
        </Grid>

        <Grid columns={2} gap="lg">
          <Card title="每周复盘" summary="把这一周的恢复、执行和失衡点讲清楚，而不是只留一串数字">
            <div style={{ display: "grid", gap: "14px" }}>
              <div style={{ padding: "14px 16px", borderRadius: "18px", background: "linear-gradient(135deg, rgba(255, 248, 244, 0.96), rgba(246, 244, 255, 0.96))", border: "1px solid rgba(148, 163, 184, 0.14)" }}>
                <div style={{ fontSize: "1rem", fontWeight: 800, color: "var(--text-main)", marginBottom: "6px" }}>
                  {dashboard.weekly_review.headline}
                </div>
                <div style={{ fontSize: "0.84rem", lineHeight: 1.75, color: "var(--text-secondary)" }}>
                  {dashboard.weekly_review.summary}
                </div>
              </div>

              <Grid columns={2} gap="md">
                <div style={{ padding: "14px 16px", borderRadius: "16px", background: "rgba(236, 253, 245, 0.7)", border: "1px solid rgba(16, 185, 129, 0.12)" }}>
                  <div style={{ fontSize: "0.78rem", fontWeight: 800, color: "#047857", marginBottom: "8px" }}>这周做对了什么</div>
                  <div style={{ display: "grid", gap: "8px" }}>
                    {dashboard.weekly_review.wins.length > 0 ? dashboard.weekly_review.wins.map((item, index) => (
                      <div key={index} style={{ fontSize: "0.8rem", lineHeight: 1.7, color: "var(--text-secondary)" }}>{item}</div>
                    )) : <div style={{ fontSize: "0.8rem", lineHeight: 1.7, color: "var(--text-muted)" }}>先连续记录几天，系统才有足够依据。</div>}
                  </div>
                </div>
                <div style={{ padding: "14px 16px", borderRadius: "16px", background: "rgba(255, 247, 237, 0.75)", border: "1px solid rgba(249, 115, 22, 0.14)" }}>
                  <div style={{ fontSize: "0.78rem", fontWeight: 800, color: "#c2410c", marginBottom: "8px" }}>下周最容易继续失衡的地方</div>
                  <div style={{ display: "grid", gap: "8px" }}>
                    {dashboard.weekly_review.risks.length > 0 ? dashboard.weekly_review.risks.map((item, index) => (
                      <div key={index} style={{ fontSize: "0.8rem", lineHeight: 1.7, color: "var(--text-secondary)" }}>{item}</div>
                    )) : <div style={{ fontSize: "0.8rem", lineHeight: 1.7, color: "var(--text-muted)" }}>目前没有明显风险提示。</div>}
                  </div>
                </div>
              </Grid>

              <div style={{ padding: "14px 16px", borderRadius: "16px", background: "var(--bg-hover)", border: "1px solid var(--border-light)" }}>
                <div style={{ fontSize: "0.78rem", fontWeight: 800, color: "var(--text-main)", marginBottom: "8px" }}>下周建议实验</div>
                <div style={{ display: "grid", gap: "8px" }}>
                  {dashboard.weekly_review.experiments.map((item, index) => (
                    <div key={index} style={{ fontSize: "0.82rem", lineHeight: 1.72, color: "var(--text-secondary)" }}>{item}</div>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <Card title="最近两周的恢复曲线" summary="睡眠和精力一起看，更容易发现失衡从哪里开始">
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "16px" }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: "7px", fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                <span style={{ width: "9px", height: "9px", borderRadius: "999px", background: "#64748b" }} />
                睡眠小时
              </div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: "7px", fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                <span style={{ width: "9px", height: "9px", borderRadius: "999px", background: "#8b5cf6" }} />
                精力 / 20
              </div>
            </div>
            <div style={{ position: "relative", minHeight: "190px" }}>
              <svg viewBox="0 0 100 56" preserveAspectRatio="none" style={{ width: "100%", height: "160px", overflow: "visible" }}>
                {[0, 1, 2, 3].map((step) => (
                  <line key={step} x1="0" y1={(step / 3) * 56} x2="100" y2={(step / 3) * 56} stroke="rgba(148,163,184,0.24)" strokeWidth="0.5" strokeDasharray="2 3" />
                ))}
                {(() => {
                  const sleepPoints = chartData
                    .map((item, index) => {
                      if (item.sleep_hours == null) return null;
                      return {
                        x: chartData.length <= 1 ? 0 : (index / (chartData.length - 1)) * 100,
                        y: 56 - Math.min(56, (item.sleep_hours / 10) * 56),
                      };
                    })
                    .filter((point): point is { x: number; y: number } => point !== null);
                  const energyPoints = chartData
                    .map((item, index) => {
                      if (item.energy == null) return null;
                      return {
                        x: chartData.length <= 1 ? 0 : (index / (chartData.length - 1)) * 100,
                        y: 56 - Math.min(56, ((item.energy / 100) * 56)),
                      };
                    })
                    .filter((point): point is { x: number; y: number } => point !== null);
                  return (
                    <>
                      {buildLinePath(sleepPoints) && <path d={buildLinePath(sleepPoints)} fill="none" stroke="#64748b" strokeWidth="2.2" strokeLinecap="round" />}
                      {buildLinePath(energyPoints) && <path d={buildLinePath(energyPoints)} fill="none" stroke="#8b5cf6" strokeWidth="2.2" strokeLinecap="round" />}
                      {sleepPoints.map((point, index) => <circle key={`sleep-${index}`} cx={point.x} cy={point.y} r="1.8" fill="#64748b" />)}
                      {energyPoints.map((point, index) => <circle key={`energy-${index}`} cx={point.x} cy={point.y} r="1.8" fill="#8b5cf6" />)}
                    </>
                  );
                })()}
              </svg>
              <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, display: "flex", justifyContent: "space-between", gap: "6px" }}>
                {chartData.filter((_, index) => index % Math.max(1, Math.floor(chartData.length / 5)) === 0).map((item) => (
                  <span key={item.date} style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{formatShortDate(item.date)}</span>
                ))}
              </div>
            </div>
          </Card>

          <HealthBars
            title="推进与打卡的关系"
            subtitle="看自己是不是只在工作，却没有做足够的恢复动作"
            data={dashboard.history}
          />
        </Grid>
      </PageContent>
    </PageContainer>
  );
}
