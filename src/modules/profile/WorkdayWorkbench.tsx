import { ReactNode } from "react";
import { Activity, Gauge, History, Orbit } from "lucide-react";
import { Card } from "../../components/Layout";

interface Metric {
  id: string;
  label: string;
  value: number;
  detail: string;
}

interface Topic {
  tag: string;
  count: number;
  preferred: boolean;
}

interface ActivityItem {
  id: string;
  time: string;
  label: string;
  title: string;
}

interface WorkbenchData {
  score: {
    value: number;
    label: string;
    summary: string;
  };
  metrics: Metric[];
  top_topics: Topic[];
  recent_activity: ActivityItem[];
}

interface Props {
  workbench?: WorkbenchData | null;
  collapsible?: boolean;
  defaultExpanded?: boolean;
  summary?: ReactNode;
}

function ringColor(value: number): string {
  if (value >= 80) return "#62B59A";
  if (value >= 60) return "#6FA8FF";
  if (value >= 40) return "#F0B363";
  return "#D66B6B";
}

function surface(accent: string, amount = 16): string {
  return `color-mix(in srgb, ${accent} ${amount}%, var(--bg-card))`;
}

function outline(accent: string, amount = 28): string {
  return `color-mix(in srgb, ${accent} ${amount}%, transparent)`;
}

export default function WorkdayWorkbench({
  workbench,
  collapsible = false,
  defaultExpanded = true,
  summary,
}: Props) {
  const score = workbench?.score?.value ?? 0;
  const normalizedScore = Math.max(0, Math.min(100, score));
  const stroke = ringColor(score);
  const metrics = workbench?.metrics ?? [];
  const topTopics = workbench?.top_topics ?? [];
  const recentActivity = workbench?.recent_activity ?? [];
  const preferredTopicCount = topTopics.filter((topic) => topic.preferred).length;

  return (
    <Card
      title="今日量化"
      icon={<Gauge style={{ width: "18px", height: "18px", color: stroke }} />}
      collapsible={collapsible}
      defaultExpanded={defaultExpanded}
      summary={summary}
      style={{ marginTop: "clamp(20px, 3vw, 28px)" }}
    >
      {workbench ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "clamp(18px, 2.4vw, 26px)" }}>
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
              gap: "clamp(16px, 2vw, 22px)",
              padding: "clamp(18px, 2.6vw, 28px)",
              borderRadius: "8px",
              background: `linear-gradient(135deg, ${surface(stroke, 16)}, ${surface("var(--color-primary)", 12)})`,
              border: `1px solid ${outline(stroke, 24)}`,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "16px", minWidth: 0 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
                <span
                  style={{
                    padding: "4px 10px",
                    borderRadius: "999px",
                    background: surface(stroke, 18),
                    border: `1px solid ${outline(stroke, 28)}`,
                    color: "var(--text-secondary)",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                  }}
                >
                  今日推进指数
                </span>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  基于阅读、对话、收藏与任务推进自动量化
                </span>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "96px minmax(0, 1fr)",
                  gap: "clamp(16px, 2vw, 20px)",
                  alignItems: "center",
                }}
              >
                <div style={{ position: "relative", width: "96px", height: "96px", flexShrink: 0 }}>
                  <svg viewBox="0 0 36 36" style={{ width: "100%", height: "100%" }}>
                    <path
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="color-mix(in srgb, var(--border-light) 78%, transparent)"
                      strokeWidth="3"
                    />
                    <path
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke={stroke}
                      strokeWidth="3"
                      strokeDasharray={`${normalizedScore}, 100`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexDirection: "column",
                    }}
                  >
                    <span style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--text-main)" }}>
                      {Math.round(score)}
                    </span>
                    <span style={{ fontSize: "0.625rem", color: "var(--text-light)" }}>100</span>
                  </div>
                </div>

                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: "clamp(1.1rem, 1.8vw, 1.45rem)",
                      fontWeight: 800,
                      color: "var(--text-main)",
                      lineHeight: 1.35,
                      marginBottom: "8px",
                    }}
                  >
                    {workbench.score.label}
                  </div>
                  <div
                    style={{
                      fontSize: "0.9375rem",
                      color: "var(--text-secondary)",
                      lineHeight: 1.75,
                      maxWidth: "58ch",
                    }}
                  >
                    {workbench.score.summary}
                  </div>
                </div>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "14px",
                padding: "clamp(14px, 2vw, 18px)",
                borderRadius: "8px",
                background: surface("var(--color-primary-light)", 10),
                border: "1px solid var(--border-light)",
              }}
            >
              <div>
                <div style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-main)", marginBottom: "6px" }}>
                  今日工作切面
                </div>
                <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)", lineHeight: 1.7 }}>
                  只统计今天已经发生的工作轨迹，用来反映推进密度、主题集中度和执行节奏。
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "10px" }}>
                <div style={{ padding: "10px 12px", borderRadius: "8px", background: "var(--bg-hover)" }}>
                  <div style={{ fontSize: "0.6875rem", color: "var(--text-light)", marginBottom: "4px" }}>维度</div>
                  <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "var(--text-main)" }}>{metrics.length}</div>
                </div>
                <div style={{ padding: "10px 12px", borderRadius: "8px", background: "var(--bg-hover)" }}>
                  <div style={{ fontSize: "0.6875rem", color: "var(--text-light)", marginBottom: "4px" }}>偏好</div>
                  <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "var(--text-main)" }}>{preferredTopicCount}</div>
                </div>
                <div style={{ padding: "10px 12px", borderRadius: "8px", background: "var(--bg-hover)" }}>
                  <div style={{ fontSize: "0.6875rem", color: "var(--text-light)", marginBottom: "4px" }}>记录</div>
                  <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "var(--text-main)" }}>{recentActivity.length}</div>
                </div>
              </div>
            </div>
          </section>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
              gap: "clamp(18px, 2vw, 24px)",
            }}
          >
            <section
              style={{
                padding: "clamp(16px, 2.2vw, 22px)",
                borderRadius: "8px",
                background: "var(--bg-hover)",
                border: "1px solid var(--border-light)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
                <Gauge style={{ width: "15px", height: "15px", color: stroke }} />
                <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-main)" }}>
                  推进维度
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {metrics.map((metric) => {
                  const metricColor = ringColor(metric.value);
                  return (
                    <div
                      key={metric.id}
                      style={{
                        padding: "12px 14px",
                        borderRadius: "8px",
                        background: "var(--bg-card)",
                        border: "1px solid var(--border-light)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "baseline",
                          justifyContent: "space-between",
                          gap: "12px",
                          marginBottom: "8px",
                        }}
                      >
                        <div>
                          <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-main)" }}>
                            {metric.label}
                          </div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
                            {metric.detail}
                          </div>
                        </div>
                        <span style={{ fontSize: "0.875rem", fontWeight: 800, color: metricColor }}>
                          {metric.value}
                        </span>
                      </div>
                      <div
                        style={{
                          height: "8px",
                          borderRadius: "999px",
                          background: "color-mix(in srgb, var(--bg-hover) 82%, transparent)",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${Math.max(0, Math.min(100, metric.value))}%`,
                            height: "100%",
                            borderRadius: "999px",
                            background: `linear-gradient(90deg, ${metricColor}, color-mix(in srgb, ${metricColor} 64%, var(--bg-hover)))`,
                            transition: "width 0.35s ease",
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <div style={{ display: "flex", flexDirection: "column", gap: "clamp(16px, 1.8vw, 20px)" }}>
              <section
                style={{
                  padding: "clamp(16px, 2.2vw, 22px)",
                  borderRadius: "8px",
                  background: "var(--bg-hover)",
                  border: "1px solid var(--border-light)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                  <Orbit style={{ width: "15px", height: "15px", color: "var(--color-accent)" }} />
                  <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-main)" }}>
                    今日主题
                  </span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {topTopics.length > 0 ? (
                    topTopics.map((topic) => (
                      <span
                        key={topic.tag}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          padding: "6px 10px",
                          borderRadius: "999px",
                          background: topic.preferred ? surface("var(--color-success)", 18) : "var(--bg-card)",
                          border: topic.preferred
                            ? `1px solid ${outline("var(--color-success-text)", 24)}`
                            : "1px solid var(--border-light)",
                          color: "var(--text-secondary)",
                          fontSize: "0.75rem",
                          fontWeight: 700,
                        }}
                      >
                        {topic.tag}
                        <span style={{ color: topic.preferred ? "var(--color-success-text)" : "var(--text-light)", fontFamily: "monospace" }}>
                          {topic.count}
                        </span>
                      </span>
                    ))
                  ) : (
                    <span style={{ fontSize: "0.8125rem", color: "var(--text-light)", lineHeight: 1.7 }}>
                      今天的主题分布还不够明显
                    </span>
                  )}
                </div>
              </section>

              <section
                style={{
                  padding: "clamp(16px, 2.2vw, 22px)",
                  borderRadius: "8px",
                  background: "var(--bg-hover)",
                  border: "1px solid var(--border-light)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                  <History style={{ width: "15px", height: "15px", color: "var(--color-warning-text)" }} />
                  <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-main)" }}>
                    工作记录
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {recentActivity.length > 0 ? (
                    recentActivity.map((item) => (
                      <div
                        key={item.id}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "56px 76px 1fr",
                          gap: "10px",
                          alignItems: "start",
                          padding: "10px 12px",
                          borderRadius: "8px",
                          background: "var(--bg-card)",
                          border: "1px solid var(--border-light)",
                        }}
                      >
                        <span style={{ fontSize: "0.75rem", color: "var(--text-light)", fontFamily: "monospace" }}>{item.time}</span>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 700 }}>{item.label}</span>
                        <span style={{ fontSize: "0.875rem", color: "var(--text-main)", lineHeight: 1.55 }}>{item.title}</span>
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: "0.8125rem", color: "var(--text-light)", lineHeight: 1.7 }}>
                      等有了阅读、收藏、对话或模块运行记录后，这里会自动变成一份今日工作轨迹。
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      ) : (
        <div
          style={{
            padding: "18px 20px",
            borderRadius: "8px",
            background: surface("var(--color-primary-light)", 10),
            border: "1px dashed var(--border-light)",
            color: "var(--text-light)",
            fontSize: "0.875rem",
            lineHeight: 1.7,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
            <Activity style={{ width: "15px", height: "15px" }} />
            <span>今天的量化视图还没准备好。</span>
          </div>
          开始浏览、收藏、对话或生成待办后，这里会自动给出推进指数、主题结构和工作记录摘要。
        </div>
      )}
    </Card>
  );
}
