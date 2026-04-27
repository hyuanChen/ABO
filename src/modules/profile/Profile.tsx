// src/modules/profile/Profile.tsx
import { useEffect, useState } from "react";
import { User, Sparkles, Clock } from "lucide-react";
import { api } from "../../core/api";
import { useStore, ProfileStats } from "../../core/store";
import { PageContainer, PageHeader, PageContent, Card, Grid } from "../../components/Layout";
import RoleCard from "./RoleCard";
import DailyTodo from "./DailyTodo";
import PersonaStudio from "./PersonaStudio";
import IntelligencePlanner from "./IntelligencePlanner";
import WorkdayWorkbench from "./WorkdayWorkbench";
import HexagonRadar from "./HexagonRadar";
import SkillGrid from "./SkillGrid";
import AchievementGallery from "./AchievementGallery";
import DailyCheckInModal from "./DailyCheckInModal";
import GamePanel from "../../components/GamePanel";
import ModuleConfigPanel from "../../components/ModuleConfigPanel";
import TimelineView from "../../components/TimelineView";

interface Todo {
  id: string;
  text: string;
  done: boolean;
  started_at?: number | null;
  duration_ms?: number | null;
  source?: string;
  priority?: string;
  reason?: string;
  evidence?: string[];
}

interface PersonaData {
  source_text: string;
  summary: string;
  homepage: {
    codename: string;
    long_term_goal: string;
    one_liner: string;
    narrative: string;
    strengths: string[];
    working_style: string[];
    preferred_topics: string[];
    next_focus: string[];
  };
  sbti: {
    type: string;
    label?: string;
    confidence: number;
    reasoning: string[];
  };
  generated_at: string;
}

interface DailyBriefing {
  date: string;
  summary: string;
  focus: string;
  preferred_keywords: Array<{ keyword: string; score: number; count: number }>;
  suggested_todos: Todo[];
  intel_cards: Array<{
    id: string;
    module_id: string;
    title: string;
    summary: string;
    tags: string[];
    score: number;
    source_url?: string;
    created_at?: number;
  }>;
  generated_at: string;
}

interface WorkbenchData {
  score: { value: number; label: string; summary: string };
  metrics: Array<{ id: string; label: string; value: number; detail: string }>;
  top_topics: Array<{ tag: string; count: number; preferred: boolean }>;
  recent_activity: Array<{ id: string; time: string; label: string; title: string }>;
}

interface ProfileData {
  identity: { codename: string; long_term_goal: string };
  daily_motto: { motto: string; description: string; date: string };
  stats: ProfileStats;
  skills: Record<string, { unlocked_at: string }>;
  achievements: Array<{ id: string; name: string; unlocked_at: string }>;
  energy: number;
  todos: Todo[];
  persona?: PersonaData;
  daily_briefing?: DailyBriefing;
  workbench?: WorkbenchData;
}

const CHECKIN_KEY = "abo_last_checkin";

function shouldShowCheckin(): boolean {
  const last = localStorage.getItem(CHECKIN_KEY);
  const today = new Date().toISOString().slice(0, 10);
  return last !== today;
}

export default function Profile() {
  const [data, setData] = useState<ProfileData | null>(null);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [showCheckin, setShowCheckin] = useState(false);
  const { setProfileEnergy, setProfileSan, setProfileMotto, setProfileCodename, setProfileStats } = useStore();

  useEffect(() => {
    load();
    if (shouldShowCheckin()) {
      setShowCheckin(true);
    }
  }, []);

  async function load() {
    try {
      const d = await api.get<ProfileData>("/api/profile");
      setData(d);
      setTodos(d.todos || []);
      setProfileEnergy(d.energy);
      const sanScore = d.stats?.san?.score ?? 0;
      setProfileSan(sanScore);
      setProfileMotto(d.daily_motto?.motto ?? "");
      setProfileCodename(d.identity?.codename ?? "");
      setProfileStats(d.stats);
    } catch { /* silent */ }
  }

  function handleCheckinClose() {
    localStorage.setItem(CHECKIN_KEY, new Date().toISOString().slice(0, 10));
    setShowCheckin(false);
    load();
  }

  if (!data) {
    return (
      <PageContainer>
        <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", color: "var(--text-muted)" }}>
            <div style={{ width: "48px", height: "48px", borderRadius: "var(--radius-md)", background: "var(--bg-hover)", animation: "pulse 2s infinite" }} />
            <p style={{ fontSize: "0.9375rem" }}>加载角色数据中...</p>
          </div>
        </div>
      </PageContainer>
    );
  }

  const sanForAvatar = Math.round((data.stats?.san?.score ?? 0) / 10);
  const completedTodos = todos.filter((todo) => todo.done).length;
  const todoProgress = todos.length > 0 ? Math.round((completedTodos / todos.length) * 100) : 0;
  const unlockedSkillCount = Object.keys(data.skills ?? {}).length;
  const achievementCount = data.achievements?.length ?? 0;
  const personaSummary = data.persona?.homepage?.one_liner || data.persona?.summary || "根据你的 wiki 与经历生成角色画像";
  const briefingSummary = data.daily_briefing?.focus || "把今天的情报整理成能执行的消化任务";
  const workbenchSummary = data.workbench
    ? `${Math.round(data.workbench.score.value)} 分 · ${data.workbench.score.label}`
    : "等待今日量化数据";

  return (
    <PageContainer>
      <PageHeader
        title="角色主页"
        subtitle="追踪你的研究成长与能力进化"
        icon={User}
      />
      <PageContent maxWidth="1280px">
        {/* Role Card - Full Width */}
        <RoleCard
          codename={data.identity.codename}
          longTermGoal={data.identity.long_term_goal}
          motto={data.daily_motto.motto}
          description={data.daily_motto.description}
          energy={data.energy}
          san={sanForAvatar}
          predictedSbti={data.persona?.sbti?.type ?? null}
          onUpdated={load}
          defaultExpanded
        />

        {/* Daily Todo */}
        <Card
          title="今日待办"
          icon={<span style={{ fontSize: "1rem" }}>🗂️</span>}
          collapsible
          defaultExpanded
          summary={`${completedTodos}/${todos.length} · 完成率 ${todoProgress}%`}
          style={{ marginTop: "clamp(20px, 3vw, 28px)" }}
        >
          <DailyTodo todos={todos} onChange={setTodos} showHeader={false} />
        </Card>

        {/* Daily Status */}
        <Card
          title="今日状态"
          icon={<Sparkles style={{ width: "18px", height: "18px", color: "var(--color-primary)" }} />}
          collapsible
          defaultExpanded
          summary="查看今天的能量、SAN 与整体状态"
          style={{ marginTop: "clamp(20px, 3vw, 28px)" }}
        >
          <GamePanel />
        </Card>

        {/* Today's Timeline */}
        <Card
          title="今日时间线"
          icon={<Clock style={{ width: "18px", height: "18px", color: "var(--color-primary)" }} />}
          collapsible
          defaultExpanded
          summary="今天发生了什么，按时间顺序展开"
          style={{ marginTop: "clamp(20px, 3vw, 28px)" }}
        >
          <TimelineView />
        </Card>

        <IntelligencePlanner
          briefing={data.daily_briefing}
          onRefresh={load}
          currentTodos={todos}
          onTodosChange={(nextTodos) => setTodos(nextTodos as Todo[])}
          collapsible
          defaultExpanded={false}
          summary={briefingSummary}
        />

        <WorkdayWorkbench
          workbench={data.workbench}
          collapsible
          defaultExpanded={false}
          summary={workbenchSummary}
        />

        {/* Hexagon Radar */}
        <Card
          title="六维能力评估"
          icon={<Sparkles style={{ width: "18px", height: "18px", color: "var(--color-primary)" }} />}
          collapsible
          defaultExpanded={false}
          summary="查看六项核心能力的当前状态"
          style={{ marginTop: "clamp(20px, 3vw, 28px)" }}
        >
          <div style={{ display: "flex", justifyContent: "center", padding: "clamp(16px, 3vw, 32px) 0" }}>
            <HexagonRadar stats={data.stats} size={280} />
          </div>
        </Card>

        {/* Skills + Achievements Grid */}
        <Grid columns={1} gap="lg" style={{ marginTop: "clamp(20px, 3vw, 28px)" }}>
          <Card
            title="技能树"
            icon={<span style={{ fontSize: "1rem" }}>🌳</span>}
            collapsible
            defaultExpanded={false}
            summary={`已解锁 ${unlockedSkillCount} 项技能`}
          >
            <SkillGrid unlockedSkills={data.skills} />
          </Card>

          <Card
            title="成就徽章"
            icon={<span style={{ fontSize: "1rem" }}>🏆</span>}
            collapsible
            defaultExpanded={false}
            summary={`已解锁 ${achievementCount} 枚徽章`}
          >
            <AchievementGallery achievements={data.achievements} showHeader={false} />
          </Card>
        </Grid>

        <PersonaStudio
          persona={data.persona}
          onRefresh={load}
          collapsible
          defaultExpanded={false}
          summary={personaSummary}
        />

        <Card
          title="爬虫模块管理"
          icon={<span style={{ fontSize: "0.9375rem" }}>🔧</span>}
          collapsible
          defaultExpanded={false}
          lazyMount
          summary="查看模块运行状态，偏好学习可单独点击加载"
          style={{ marginTop: "clamp(16px, 2vw, 20px)" }}
        >
          <ModuleConfigPanel />
        </Card>
      </PageContent>

      {showCheckin && <DailyCheckInModal onClose={handleCheckinClose} />}
    </PageContainer>
  );
}
