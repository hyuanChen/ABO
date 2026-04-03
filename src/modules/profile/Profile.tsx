// src/modules/profile/Profile.tsx
import { useEffect, useState } from "react";
import { User, Sparkles } from "lucide-react";
import { api } from "../../core/api";
import { useStore, ProfileStats } from "../../core/store";
import { PageContainer, PageHeader, PageContent, Card, Grid } from "../../components/Layout";
import RoleCard from "./RoleCard";
import DailyTodo from "./DailyTodo";
import HexagonRadar from "./HexagonRadar";
import SkillGrid from "./SkillGrid";
import AchievementGallery from "./AchievementGallery";
import DailyCheckInModal from "./DailyCheckInModal";
import GamePanel from "../../components/GamePanel";
import KeywordPreferences from "../../components/KeywordPreferences";

interface Todo {
  id: string;
  text: string;
  done: boolean;
}

interface ProfileData {
  identity: { codename: string; long_term_goal: string };
  daily_motto: { motto: string; description: string; date: string };
  stats: ProfileStats;
  skills: Record<string, { unlocked_at: string }>;
  achievements: Array<{ id: string; name: string; unlocked_at: string }>;
  energy: number;
  todos: Todo[];
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
  const { setProfileEnergy, setProfileSan, setProfileMotto, setProfileStats } = useStore();

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

  return (
    <PageContainer>
      <PageHeader
        title="角色主页"
        subtitle="追踪你的研究成长与能力进化"
        icon={User}
      />
      <PageContent maxWidth="1000px">
        {/* Role Card - Full Width */}
        <RoleCard
          codename={data.identity.codename}
          longTermGoal={data.identity.long_term_goal}
          motto={data.daily_motto.motto}
          description={data.daily_motto.description}
          energy={data.energy}
          san={sanForAvatar}
          onUpdated={load}
        />

        {/* Daily Todo */}
        <div style={{ marginTop: "clamp(20px, 3vw, 28px)" }}>
          <DailyTodo todos={todos} onChange={setTodos} />
        </div>

        {/* Phase 3: Gamification Panel */}
        <Card
          title="游戏状态"
          icon={<Sparkles style={{ width: "18px", height: "18px", color: "var(--color-primary)" }} />}
          style={{ marginTop: "clamp(20px, 3vw, 28px)" }}
        >
          <GamePanel />
        </Card>

        {/* Phase 2: Keyword Preferences */}
        <Card
          title="偏好学习"
          icon={<span style={{ fontSize: "1rem" }}>📊</span>}
          style={{ marginTop: "clamp(20px, 3vw, 28px)" }}
        >
          <KeywordPreferences />
        </Card>

        {/* Hexagon Radar */}
        <Card
          title="六维能力评估"
          icon={<Sparkles style={{ width: "18px", height: "18px", color: "var(--color-primary)" }} />}
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
          >
            <SkillGrid unlockedSkills={data.skills} />
          </Card>

          <Card
            title="成就徽章"
            icon={<span style={{ fontSize: "1rem" }}>🏆</span>}
          >
            <AchievementGallery achievements={data.achievements} />
          </Card>
        </Grid>
      </PageContent>

      {showCheckin && <DailyCheckInModal onClose={handleCheckinClose} />}
    </PageContainer>
  );
}
