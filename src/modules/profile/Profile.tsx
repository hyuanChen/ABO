// src/modules/profile/Profile.tsx
import { useEffect, useState } from "react";
import { api } from "../../core/api";
import { useStore, ProfileStats } from "../../core/store";
import RoleCard from "./RoleCard";
import DailyTodo from "./DailyTodo";
import HexagonRadar from "./HexagonRadar";
import SkillGrid from "./SkillGrid";
import AchievementGallery from "./AchievementGallery";
import DailyCheckInModal from "./DailyCheckInModal";

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
      <div className="h-full flex items-center justify-center text-slate-400">
        加载中...
      </div>
    );
  }

  // Convert san score (0-100) back to 0-10 scale for PixelAvatar
  const sanForAvatar = Math.round((data.stats?.san?.score ?? 0) / 10);

  return (
    <div className="h-full overflow-auto bg-slate-950 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* A. Role Card */}
        <RoleCard
          codename={data.identity.codename}
          longTermGoal={data.identity.long_term_goal}
          motto={data.daily_motto.motto}
          description={data.daily_motto.description}
          energy={data.energy}
          san={sanForAvatar}
          onUpdated={load}
        />

        {/* B. Daily Todo */}
        <DailyTodo todos={todos} onChange={setTodos} />

        {/* C. Hexagon Radar */}
        <div className="bg-slate-800/50 rounded-xl p-5 flex flex-col items-center">
          <h3 className="text-sm font-medium text-slate-400 mb-4 self-start">六维能力</h3>
          <HexagonRadar stats={data.stats} size={300} />
        </div>

        {/* D. Skills + Achievements */}
        <div className="bg-slate-800/50 rounded-xl p-5 space-y-6">
          <SkillGrid unlockedSkills={data.skills} />
          <AchievementGallery achievements={data.achievements} />
        </div>
      </div>

      {showCheckin && <DailyCheckInModal onClose={handleCheckinClose} />}
    </div>
  );
}
