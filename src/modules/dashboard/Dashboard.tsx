// src/modules/dashboard/Dashboard.tsx
// Redesigned dashboard: Today Snapshot → Wellness Trend → Engagement Depth → Research Focus → Activity Trend
import { useEffect, useState } from "react";
import { BarChart3, Sunrise, Activity, BookOpen, Compass, TrendingUp, RadioTower } from "lucide-react";
import { api } from "../../core/api";
import { PageContainer, PageHeader, PageContent, Card } from "../../components/Layout";
import TodaySnapshot from "./TodaySnapshot";
import WellnessTrend from "./WellnessTrend";
import EngagementDepth from "./EngagementDepth";
import ResearchFocus from "./ResearchFocus";
import ActivityChart from "./ActivityChart";
import IntelligenceRhythm, { type IntelligenceRhythmData } from "./IntelligenceRhythm";

// ── Types ────────────────────────────────────────────────────────

interface DailyTrendItem {
  date: string;
  count: number;
}

interface OverviewData {
  totalCards: number;
  thisWeek: number;
  lastWeek: number;
  dailyTrend: DailyTrendItem[];
  byModule: Record<string, number>;
  topTags: [string, number][];
  readingStreak: number;
}

interface TodayData {
  date: string;
  activityCounts: {
    total: number;
    views: number;
    likes: number;
    saves: number;
    dislikes: number;
    chats: number;
    module_runs: number;
  };
  hourlyHeatmap: { hour: number; count: number }[];
  todoProgress: { total: number; done: number; rate: number };
  wellness: { energy: number; san: number; happiness: number };
  summary: string | null;
  topInteractions: { id: string; title: string; action: string }[];
}

interface WellnessData {
  daily: { date: string; san: number | null; happiness: number | null; energy: number | null }[];
  thisWeekAvg: { san: number; happiness: number; energy: number };
  lastWeekAvg: { san: number; happiness: number; energy: number };
}

interface EngagementData {
  overall: {
    totalViewed: number;
    liked: number;
    saved: number;
    starred: number;
    disliked: number;
    skipped: number;
  };
  dailyTrend: { date: string; viewed: number; deepRead: number; rate: number }[];
  weekComparison: {
    thisWeek: {
      totalViewed: number;
      liked: number;
      saved: number;
      starred: number;
      disliked: number;
      skipped: number;
    };
    lastWeek: {
      totalViewed: number;
      liked: number;
      saved: number;
      starred: number;
      disliked: number;
      skipped: number;
    };
    cardsDelta: number;
    engagementRateDelta: number;
  };
}

interface KeywordPref {
  keyword: string;
  score: number;
  count: number;
}

// ── Streak Badge ─────────────────────────────────────────────────

function StreakBadge({ streak, thisWeek, lastWeek }: { streak: number; thisWeek: number; lastWeek: number }) {
  const weekDelta = thisWeek - lastWeek;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
      {streak > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "4px 12px",
            borderRadius: "var(--radius-full)",
            background: "linear-gradient(135deg, rgba(255, 183, 178, 0.2), rgba(255, 183, 178, 0.1))",
            border: "1px solid rgba(255, 183, 178, 0.3)",
          }}
        >
          <span style={{ fontSize: "0.875rem" }}>&#x1F525;</span>
          <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#D48984" }}>
            {streak} day streak
          </span>
        </div>
      )}
      {lastWeek > 0 && (
        <div
          style={{
            fontSize: "0.75rem",
            color: weekDelta >= 0 ? "#5BA88C" : "#E89B96",
          }}
        >
          This week: {thisWeek} cards ({weekDelta >= 0 ? "+" : ""}{weekDelta})
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard ───────────────────────────────────────────────

export default function Dashboard() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [today, setToday] = useState<TodayData | null>(null);
  const [wellness, setWellness] = useState<WellnessData | null>(null);
  const [engagement, setEngagement] = useState<EngagementData | null>(null);
  const [keywords, setKeywords] = useState<KeywordPref[]>([]);
  const [intelligenceRhythm, setIntelligenceRhythm] = useState<IntelligenceRhythmData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    try {
      const [ov, td, wl, eg, kw, ir] = await Promise.all([
        api.get<OverviewData>("/api/insights/overview"),
        api.get<TodayData>("/api/insights/today"),
        api.get<WellnessData>("/api/insights/wellness"),
        api.get<EngagementData>("/api/insights/engagement"),
        api.get<{ keywords: KeywordPref[] }>("/api/insights/preferences-evolution"),
        api.get<IntelligenceRhythmData>("/api/insights/intelligence-rhythm"),
      ]);
      setOverview(ov);
      setToday(td);
      setWellness(wl);
      setEngagement(eg);
      setKeywords(kw.keywords);
      setIntelligenceRhythm(ir);
    } catch (error) {
      console.error("Failed to load dashboard data:", error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <PageContainer>
        <div
          style={{
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "16px",
              color: "var(--text-muted)",
            }}
          >
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                border: "3px solid var(--border-light)",
                borderTopColor: "var(--color-primary)",
                animation: "spin 1s linear infinite",
              }}
            />
            <p style={{ fontSize: "0.9375rem" }}>Loading insights...</p>
          </div>
        </div>
      </PageContainer>
    );
  }

  if (!overview) {
    return (
      <PageContainer>
        <PageHeader title="Data Insights" subtitle="Personal analytics & visualization" icon={BarChart3} />
        <PageContent>
          <div
            style={{
              textAlign: "center",
              padding: "60px 20px",
              color: "var(--text-muted)",
            }}
          >
            <p>Unable to load data. Please try again later.</p>
          </div>
        </PageContent>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Data Insights"
        subtitle="Your personal research analytics"
        icon={BarChart3}
        actions={
          <StreakBadge
            streak={overview.readingStreak}
            thisWeek={overview.thisWeek}
            lastWeek={overview.lastWeek}
          />
        }
      />
      <PageContent maxWidth="1200px">
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* Section 1: Today's Snapshot */}
          {today && (
            <Card
              title="Today"
              icon={<Sunrise style={{ width: "18px", height: "18px", color: "#F5C88C" }} />}
            >
              <TodaySnapshot data={today} />
            </Card>
          )}

          {intelligenceRhythm && (
            <Card
              title="Intelligence Mirror"
              icon={<RadioTower style={{ width: "18px", height: "18px", color: "#2F7F73" }} />}
            >
              <IntelligenceRhythm data={intelligenceRhythm} />
            </Card>
          )}

          {/* Section 2 + 3: Wellness + Engagement side by side */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
            {wellness && (
              <Card
                title="Wellness Trends"
                icon={<Activity style={{ width: "18px", height: "18px", color: "#A8E6CF" }} />}
              >
                <WellnessTrend data={wellness} />
              </Card>
            )}

            {engagement && (
              <Card
                title="Engagement Depth"
                icon={<BookOpen style={{ width: "18px", height: "18px", color: "#BCA4E3" }} />}
              >
                <EngagementDepth data={engagement} />
              </Card>
            )}
          </div>

          {/* Section 4: Research Focus */}
          {(keywords.length > 0 || Object.keys(overview.byModule).length > 0) && (
            <Card
              title="Research Focus"
              icon={<Compass style={{ width: "18px", height: "18px", color: "#9B7FD4" }} />}
            >
              <ResearchFocus keywords={keywords} byModule={overview.byModule} />
            </Card>
          )}

          {/* Section 5: 30-day Activity Trend */}
          <Card
            title="30-Day Activity"
            icon={<TrendingUp style={{ width: "18px", height: "18px", color: "var(--color-primary)" }} />}
          >
            <ActivityChart data={overview.dailyTrend} />
          </Card>
        </div>
      </PageContent>
    </PageContainer>
  );
}
