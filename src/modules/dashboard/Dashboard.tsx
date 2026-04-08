// src/modules/dashboard/Dashboard.tsx
import { useEffect, useState } from "react";
import { BarChart3, TrendingUp, Calendar, Target, Zap } from "lucide-react";
import { api } from "../../core/api";
import { PageContainer, PageHeader, PageContent, Card, Grid } from "../../components/Layout";
import ActivityChart from "./ActivityChart";
import ReadingStats from "./ReadingStats";
import ModulePerformance from "./ModulePerformance";

interface DailyTrendItem {
  date: string;
  count: number;
}

interface OverviewData {
  totalCards: number;
  thisWeek: number;
  dailyTrend: DailyTrendItem[];
  byModule: Record<string, number>;
  topTags: [string, number][];
  readingStreak: number;
}

interface MetricCardProps {
  title: string;
  value: number;
  subtitle?: string;
  icon: React.ReactNode;
  color: string;
}

function MetricCard({ title, value, subtitle, icon, color }: MetricCardProps) {
  return (
    <div
      style={{
        background: "var(--bg-card)",
        backdropFilter: "blur(16px)",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--border-light)",
        boxShadow: "var(--shadow-soft)",
        padding: "clamp(16px, 2vw, 24px)",
        display: "flex",
        alignItems: "flex-start",
        gap: "16px",
        transition: "transform 0.3s ease, box-shadow 0.3s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-4px)";
        e.currentTarget.style.boxShadow = "var(--shadow-medium)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "var(--shadow-soft)";
      }}
    >
      <div
        style={{
          width: "52px",
          height: "52px",
          borderRadius: "var(--radius-md)",
          background: color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: "0.8125rem",
            color: "var(--text-muted)",
            fontWeight: 500,
            marginBottom: "4px",
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: "clamp(1.5rem, 2.5vw, 2rem)",
            fontWeight: 700,
            color: "var(--text-main)",
            fontFamily: "'M PLUS Rounded 1c', sans-serif",
          }}
        >
          {value.toLocaleString()}
        </div>
        {subtitle && (
          <div
            style={{
              fontSize: "0.75rem",
              color: "var(--text-secondary)",
              marginTop: "4px",
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const overview = await api.get<OverviewData>("/api/insights/overview");
      setData(overview);
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
                borderRadius: "var(--radius-md)",
                background: "var(--bg-hover)",
                animation: "pulse 2s infinite",
              }}
            />
            <p style={{ fontSize: "0.9375rem" }}>加载数据中...</p>
          </div>
        </div>
      </PageContainer>
    );
  }

  if (!data) {
    return (
      <PageContainer>
        <PageHeader title="数据洞察" subtitle="个人数据分析与可视化" icon={BarChart3} />
        <PageContent>
          <div
            style={{
              textAlign: "center",
              padding: "60px 20px",
              color: "var(--text-muted)",
            }}
          >
            <p>无法加载数据，请稍后重试</p>
          </div>
        </PageContent>
      </PageContainer>
    );
  }

  const activeModules = Object.keys(data.byModule).length;
  const topTagCount = data.topTags.length;

  return (
    <PageContainer>
      <PageHeader title="数据洞察" subtitle="个人数据分析与可视化" icon={BarChart3} />
      <PageContent maxWidth="1400px">
        {/* Metric Cards */}
        <Grid columns={4} gap="md" style={{ marginBottom: "24px" }}>
          <MetricCard
            title="总卡片数"
            value={data.totalCards}
            subtitle="累计收集的情报卡片"
            icon={<TrendingUp style={{ width: "24px", height: "24px", color: "white" }} />}
            color="linear-gradient(135deg, #BCA4E3, #9B7FD4)"
          />
          <MetricCard
            title="连续阅读"
            value={data.readingStreak}
            subtitle="天连续活跃"
            icon={<Calendar style={{ width: "24px", height: "24px", color: "white" }} />}
            color="linear-gradient(135deg, #A8E6CF, #7DD3C0)"
          />
          <MetricCard
            title="活跃模块"
            value={activeModules}
            subtitle="个自动化模块"
            icon={<Target style={{ width: "24px", height: "24px", color: "white" }} />}
            color="linear-gradient(135deg, #FFE4B5, #F5C88C)"
          />
          <MetricCard
            title="偏好标签"
            value={topTagCount}
            subtitle="个常用标签"
            icon={<Zap style={{ width: "24px", height: "24px", color: "white" }} />}
            color="linear-gradient(135deg, #FFB7B2, #E89B96)"
          />
        </Grid>

        {/* Charts Grid */}
        <Grid columns={2} gap="lg">
          {/* Activity Chart */}
          <Card
            title="30天活动趋势"
            icon={<TrendingUp style={{ width: "18px", height: "18px", color: "var(--color-primary)" }} />}
          >
            <ActivityChart data={data.dailyTrend} />
          </Card>

          {/* Reading Stats */}
          <Card
            title="阅读统计"
            icon={<Calendar style={{ width: "18px", height: "18px", color: "var(--color-primary)" }} />}
          >
            <ReadingStats
              streak={data.readingStreak}
              topTags={data.topTags}
              thisWeek={data.thisWeek}
            />
          </Card>

          {/* Module Performance */}
          <Card
            title="模块表现"
            icon={<Target style={{ width: "18px", height: "18px", color: "var(--color-primary)" }} />}
          >
            <ModulePerformance byModule={data.byModule} />
          </Card>

          {/* Weekly Summary */}
          <Card
            title="本周概览"
            icon={<Zap style={{ width: "18px", height: "18px", color: "var(--color-primary)" }} />}
          >
            <div style={{ padding: "20px 0" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "16px",
                  marginBottom: "24px",
                }}
              >
                <div
                  style={{
                    width: "80px",
                    height: "80px",
                    borderRadius: "50%",
                    background: "linear-gradient(135deg, rgba(168, 230, 207, 0.3), rgba(168, 230, 207, 0.1))",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "2px solid rgba(168, 230, 207, 0.5)",
                  }}
                >
                  <span
                    style={{
                      fontSize: "1.75rem",
                      fontWeight: 700,
                      color: "#5BA88C",
                    }}
                  >
                    {data.thisWeek}
                  </span>
                </div>
                <div>
                  <div
                    style={{
                      fontSize: "1rem",
                      fontWeight: 600,
                      color: "var(--text-main)",
                    }}
                  >
                    本周新增卡片
                  </div>
                  <div
                    style={{
                      fontSize: "0.8125rem",
                      color: "var(--text-muted)",
                      marginTop: "4px",
                    }}
                  >
                    平均每天 {(data.thisWeek / 7).toFixed(1)} 张
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "12px",
                }}
              >
                {[
                  { label: "总卡片", value: data.totalCards },
                  { label: "模块数", value: activeModules },
                  { label: "标签数", value: topTagCount },
                ].map((item) => (
                  <div
                    key={item.label}
                    style={{
                      textAlign: "center",
                      padding: "12px",
                      background: "var(--bg-hover)",
                      borderRadius: "var(--radius-sm)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "1.25rem",
                        fontWeight: 700,
                        color: "var(--text-main)",
                      }}
                    >
                      {item.value}
                    </div>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--text-muted)",
                        marginTop: "2px",
                      }}
                    >
                      {item.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </Grid>
      </PageContent>
    </PageContainer>
  );
}
