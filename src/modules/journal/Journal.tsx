// src/modules/journal/Journal.tsx
import { useState, useEffect } from "react";
import {
  BookOpen,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  FileText,
  BarChart3,
  TrendingUp,
  Edit3,
  Save,
  X,
} from "lucide-react";
import { PageContainer, PageHeader, PageContent, Card, Grid } from "../../components/Layout";

// Date utilities
function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function getWeekKey(date: Date = new Date()): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  return d.toISOString().slice(0, 10);
}

function getMonthKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 7);
}

function getYearKey(date: Date = new Date()): string {
  return date.getFullYear().toString();
}

function formatDateCN(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function getWeekNumber(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

// Entry type definition
interface JournalEntry {
  id: string;
  content: string;
  mood?: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

type ViewMode = "daily" | "weekly" | "monthly" | "yearly";

const MOODS = [
  { emoji: "✨", label: "充实", color: "#A8E6CF" },
  { emoji: "🌟", label: "专注", color: "#BCA4E3" },
  { emoji: "🌊", label: "平静", color: "#A8D8FF" },
  { emoji: "🔥", label: "兴奋", color: "#FFB7B2" },
  { emoji: "☁️", label: "疲惫", color: "#FFE4B5" },
  { emoji: "🌧️", label: "低落", color: "#B8B8C8" },
];

export default function Journal() {
  const [viewMode, setViewMode] = useState<ViewMode>("daily");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [selectedMood, setSelectedMood] = useState<string | null>(null);

  // Load entries
  useEffect(() => {
    // TODO: Replace with actual API call when backend is ready
    setEntries([]);
  }, []);

  const currentEntry = entries.find((e) => {
    const entryDate = e.created_at.slice(0, 10);
    switch (viewMode) {
      case "daily":
        return entryDate === currentDate.toISOString().slice(0, 10);
      case "weekly":
        return entryDate >= getWeekKey(currentDate) &&
          entryDate < new Date(new Date(getWeekKey(currentDate)).getTime() + 7 * 86400000).toISOString().slice(0, 10);
      case "monthly":
        return e.created_at.slice(0, 7) === getMonthKey(currentDate);
      case "yearly":
        return e.created_at.slice(0, 4) === getYearKey(currentDate);
      default:
        return false;
    }
  });

  function handleSave() {
    if (!editContent.trim()) return;
    // TODO: Save to API
    setIsEditing(false);
  }

  function navigatePeriod(direction: "prev" | "next") {
    const newDate = new Date(currentDate);
    switch (viewMode) {
      case "daily":
        newDate.setDate(newDate.getDate() + (direction === "next" ? 1 : -1));
        break;
      case "weekly":
        newDate.setDate(newDate.getDate() + (direction === "next" ? 7 : -7));
        break;
      case "monthly":
        newDate.setMonth(newDate.getMonth() + (direction === "next" ? 1 : -1));
        break;
      case "yearly":
        newDate.setFullYear(newDate.getFullYear() + (direction === "next" ? 1 : -1));
        break;
    }
    setCurrentDate(newDate);
  }

  function getPeriodLabel(): string {
    switch (viewMode) {
      case "daily":
        return formatDateCN(currentDate.toISOString());
      case "weekly":
        return `${currentDate.getFullYear()}年第${getWeekNumber(currentDate)}周`;
      case "monthly":
        return `${currentDate.getFullYear()}年${currentDate.getMonth() + 1}月`;
      case "yearly":
        return `${currentDate.getFullYear()}年`;
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="手记"
        subtitle="记录每一天的思考与成长"
        icon={BookOpen}
        actions={
          <div
            style={{
              display: "flex",
              gap: "8px",
              background: "var(--bg-card)",
              padding: "4px",
              borderRadius: "var(--radius-full)",
              border: "1px solid var(--border-light)",
            }}
          >
            {([
              { id: "daily", label: "日记", icon: FileText },
              { id: "weekly", label: "周记", icon: Calendar },
              { id: "monthly", label: "月记", icon: BarChart3 },
              { id: "yearly", label: "年记", icon: TrendingUp },
            ] as const).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setViewMode(id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 16px",
                  borderRadius: "var(--radius-full)",
                  background: viewMode === id
                    ? "linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))"
                    : "transparent",
                  color: viewMode === id ? "white" : "var(--text-secondary)",
                  border: "none",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.3s ease",
                }}
              >
                <Icon style={{ width: "14px", height: "14px" }} />
                {label}
              </button>
            ))}
          </div>
        }
      />

      <PageContent maxWidth="900px">
        {/* Period Navigation */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "16px",
            marginBottom: "24px",
          }}
        >
          <button
            onClick={() => navigatePeriod("prev")}
            style={{
              padding: "10px",
              borderRadius: "50%",
              background: "var(--bg-card)",
              border: "1px solid var(--border-light)",
              color: "var(--text-secondary)",
              cursor: "pointer",
              transition: "all 0.2s ease",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--bg-hover)";
              e.currentTarget.style.transform = "scale(1.05)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--bg-card)";
              e.currentTarget.style.transform = "scale(1)";
            }}
          >
            <ChevronLeft style={{ width: "20px", height: "20px" }} />
          </button>

          <div
            style={{
              padding: "12px 24px",
              background: "var(--bg-card)",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--border-light)",
              fontSize: "1rem",
              fontWeight: 600,
              color: "var(--text-main)",
              minWidth: "180px",
              textAlign: "center",
            }}
          >
            {getPeriodLabel()}
          </div>

          <button
            onClick={() => navigatePeriod("next")}
            style={{
              padding: "10px",
              borderRadius: "50%",
              background: "var(--bg-card)",
              border: "1px solid var(--border-light)",
              color: "var(--text-secondary)",
              cursor: "pointer",
              transition: "all 0.2s ease",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--bg-hover)";
              e.currentTarget.style.transform = "scale(1.05)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--bg-card)";
              e.currentTarget.style.transform = "scale(1)";
            }}
          >
            <ChevronRight style={{ width: "20px", height: "20px" }} />
          </button>
        </div>

        {/* Main Content Based on View Mode */}
        {viewMode === "daily" && (
          <DailyView
            entry={currentEntry}
            isEditing={isEditing}
            setIsEditing={setIsEditing}
            editContent={editContent}
            setEditContent={setEditContent}
            selectedMood={selectedMood}
            setSelectedMood={setSelectedMood}
            onSave={handleSave}
            isToday={currentDate.toISOString().slice(0, 10) === getTodayKey()}
          />
        )}

        {viewMode === "weekly" && (
          <SummaryView
            title="周记总结"
            period={getPeriodLabel()}
            description="本周的收获与反思"
            stats={[
              { label: "记录天数", value: "5天" },
              { label: "总字数", value: "2,340字" },
              { label: "主要心情", value: "充实" },
            ]}
            highlights={[
              "完成了3篇文献的深度阅读",
              "和导师确定了研究方向",
              "保持了每天早起的习惯",
            ]}
          />
        )}

        {viewMode === "monthly" && (
          <SummaryView
            title="月度回顾"
            period={getPeriodLabel()}
            description="这个月的成长轨迹"
            stats={[
              { label: "记录天数", value: "22天" },
              { label: "总字数", value: "12,580字" },
              { label: "完成目标", value: "85%" },
            ]}
            highlights={[
              "发表了第一篇论文",
              "建立了稳定的研究节奏",
              "参加了2次学术会议",
              "阅读了15篇核心文献",
            ]}
          />
        )}

        {viewMode === "yearly" && (
          <SummaryView
            title="年度总结"
            period={getPeriodLabel()}
            description="这一年的旅程与蜕变"
            stats={[
              { label: "记录天数", value: "280天" },
              { label: "总字数", value: "156,000字" },
              { label: "研究产出", value: "3篇论文" },
            ]}
            highlights={[
              "完成了博士开题",
              "发表了2篇SCI论文",
              "建立了完整的研究体系",
              "收获了宝贵的学术友谊",
            ]}
          />
        )}
      </PageContent>
    </PageContainer>
  );
}

// Daily View Component
function DailyView({
  entry,
  isEditing,
  setIsEditing,
  editContent,
  setEditContent,
  selectedMood,
  setSelectedMood,
  onSave,
  isToday,
}: {
  entry?: JournalEntry;
  isEditing: boolean;
  setIsEditing: (v: boolean) => void;
  editContent: string;
  setEditContent: (v: string) => void;
  selectedMood: string | null;
  setSelectedMood: (v: string | null) => void;
  onSave: () => void;
  isToday: boolean;
}) {
  useEffect(() => {
    if (entry) {
      setEditContent(entry.content);
      setSelectedMood(entry.mood || null);
    } else {
      setEditContent("");
      setSelectedMood(null);
    }
  }, [entry]);

  if (isEditing) {
    return (
      <Card>
        <div style={{ marginBottom: "20px" }}>
          <label
            style={{
              display: "block",
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "var(--text-secondary)",
              marginBottom: "12px",
            }}
          >
            今天的心情
          </label>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            {MOODS.map(({ emoji, label, color }) => (
              <button
                key={emoji}
                onClick={() => setSelectedMood(selectedMood === emoji ? null : emoji)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "10px 16px",
                  borderRadius: "var(--radius-full)",
                  background: selectedMood === emoji ? color + "30" : "var(--bg-hover)",
                  border: `2px solid ${selectedMood === emoji ? color : "transparent"}`,
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
              >
                <span style={{ fontSize: "1.25rem" }}>{emoji}</span>
                <span
                  style={{
                    fontSize: "0.875rem",
                    fontWeight: 500,
                    color: selectedMood === emoji ? "var(--text-main)" : "var(--text-secondary)",
                  }}
                >
                  {label}
                </span>
              </button>
            ))}
          </div>
        </div>

        <textarea
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          placeholder="记录今天的所思所想..."
          style={{
            width: "100%",
            minHeight: "200px",
            padding: "16px",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-light)",
            background: "var(--bg-hover)",
            color: "var(--text-main)",
            fontSize: "1rem",
            lineHeight: 1.8,
            resize: "vertical",
            fontFamily: "inherit",
          }}
        />

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "12px",
            marginTop: "16px",
          }}
        >
          <button
            onClick={() => setIsEditing(false)}
            style={{
              padding: "10px 20px",
              borderRadius: "var(--radius-full)",
              background: "var(--bg-hover)",
              border: "1px solid var(--border-light)",
              color: "var(--text-secondary)",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s ease",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <X style={{ width: "16px", height: "16px" }} />
            取消
          </button>
          <button
            onClick={onSave}
            style={{
              padding: "10px 24px",
              borderRadius: "var(--radius-full)",
              background: "linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))",
              border: "none",
              color: "white",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s ease",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              boxShadow: "0 4px 16px rgba(188, 164, 227, 0.35)",
            }}
          >
            <Save style={{ width: "16px", height: "16px" }} />
            保存
          </button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      {entry ? (
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "16px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              {entry.mood && (
                <span style={{ fontSize: "1.5rem" }}>{entry.mood}</span>
              )}
              <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
                {new Date(entry.created_at).toLocaleTimeString("zh-CN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {" "}记录
              </span>
            </div>
            {isToday && (
              <button
                onClick={() => setIsEditing(true)}
                style={{
                  padding: "8px 16px",
                  borderRadius: "var(--radius-full)",
                  background: "var(--bg-hover)",
                  border: "1px solid var(--border-light)",
                  color: "var(--text-secondary)",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <Edit3 style={{ width: "14px", height: "14px" }} />
                编辑
              </button>
            )}
          </div>

          <div
            style={{
              fontSize: "1rem",
              lineHeight: 1.8,
              color: "var(--text-main)",
              whiteSpace: "pre-wrap",
            }}
          >
            {entry.content}
          </div>

          {entry.tags.length > 0 && (
            <div
              style={{
                display: "flex",
                gap: "8px",
                marginTop: "20px",
                flexWrap: "wrap",
              }}
            >
              {entry.tags.map((tag) => (
                <span
                  key={tag}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "var(--radius-full)",
                    background: "rgba(188, 164, 227, 0.12)",
                    color: "var(--color-primary-dark)",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                  }}
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div
          style={{
            textAlign: "center",
            padding: "60px 20px",
            color: "var(--text-muted)",
          }}
        >
          <div
            style={{
              width: "80px",
              height: "80px",
              borderRadius: "50%",
              background: "linear-gradient(135deg, rgba(188, 164, 227, 0.2), rgba(255, 183, 178, 0.15))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 20px",
            }}
          >
            <Sparkles style={{ width: "36px", height: "36px", opacity: 0.5 }} />
          </div>
          <p style={{ fontSize: "1rem", marginBottom: "8px" }}>
            {isToday ? "今天还没有记录" : "这一天没有记录"}
          </p>
          {isToday && (
            <button
              onClick={() => setIsEditing(true)}
              style={{
                padding: "12px 24px",
                borderRadius: "var(--radius-full)",
                background: "linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))",
                border: "none",
                color: "white",
                fontSize: "0.9375rem",
                fontWeight: 600,
                cursor: "pointer",
                marginTop: "16px",
                boxShadow: "0 4px 16px rgba(188, 164, 227, 0.35)",
              }}
            >
              开始记录
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

// Summary View Component (Weekly/Monthly/Yearly)
function SummaryView({
  title,
  period,
  description,
  stats,
  highlights,
}: {
  title: string;
  period: string;
  description: string;
  stats: { label: string; value: string }[];
  highlights: string[];
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Period Header */}
      <div style={{ textAlign: "center", marginBottom: "8px" }}>
        <div style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginBottom: "4px" }}>{period}</div>
        <div style={{ fontSize: "0.9375rem", color: "var(--text-secondary)" }}>{description}</div>
      </div>

      {/* Stats Grid */}
      <Grid columns={3} gap="md">
        {stats.map(({ label, value }) => (
          <Card key={label} style={{ textAlign: "center", padding: "24px" }}>
            <div
              style={{
                fontSize: "1.75rem",
                fontWeight: 700,
                color: "var(--color-primary-dark)",
                marginBottom: "4px",
              }}
            >
              {value}
            </div>
            <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
              {label}
            </div>
          </Card>
        ))}
      </Grid>

      {/* AI Summary Card */}
      <Card
        title={`${title}`}
        icon={<Sparkles style={{ width: "18px", height: "18px", color: "var(--color-primary)" }} />}
      >
        <div style={{ marginBottom: "20px" }}>
          <p
            style={{
              fontSize: "0.9375rem",
              color: "var(--text-secondary)",
              lineHeight: 1.7,
              fontStyle: "italic",
            }}
          >
            AI 正在分析你的{title.replace("总结", "").replace("回顾", "").replace("总结", "")}记录，
            生成专属总结... ✨
          </p>
        </div>

        <div
          style={{
            padding: "20px",
            background: "var(--bg-hover)",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-light)",
          }}
        >
          <h4
            style={{
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "var(--text-secondary)",
              marginBottom: "12px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <TrendingUp style={{ width: "16px", height: "16px" }} />
            高光时刻
          </h4>
          <ul
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            {highlights.map((highlight, i) => (
              <li
                key={i}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "10px",
                  fontSize: "0.9375rem",
                  color: "var(--text-main)",
                }}
              >
                <span
                  style={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    background: "var(--color-primary)",
                    marginTop: "8px",
                    flexShrink: 0,
                  }}
                />
                {highlight}
              </li>
            ))}
          </ul>
        </div>
      </Card>

      {/* Journal Entries List Placeholder */}
      <Card
        title="详细记录"
        icon={<FileText style={{ width: "18px", height: "18px", color: "var(--color-primary)" }} />}
      >
        <div
          style={{
            textAlign: "center",
            padding: "40px 20px",
            color: "var(--text-muted)",
          }}
        >
          <p>该时段的详细日记条目将在这里展示</p>
          <p style={{ fontSize: "0.8125rem", marginTop: "8px" }}>
            支持按心情、标签筛选
          </p>
        </div>
      </Card>
    </div>
  );
}
