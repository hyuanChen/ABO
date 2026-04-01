import { useState, useEffect, useRef } from "react";
import {
  BookOpen,
  RefreshCw,
  ExternalLink,
  Star,
  Filter,
  Save,
  Search,
  Calendar,
  User,
  FileText,
  ChevronDown,
  ChevronUp,
  Check,
  Layers,
  Cpu,
  GitBranch,
} from "lucide-react";
import { PageContainer, PageHeader, PageContent, Card, EmptyState, LoadingState } from "../../components/Layout";
import { api } from "../../core/api";
import { useToast } from "../../components/Toast";
import { useStore } from "../../core/store";

interface ArxivPaper {
  id: string;
  title: string;
  summary: string;
  score: number;
  tags: string[];
  source_url: string;
  metadata: {
    authors?: string[];
    published?: string;
    "pdf-url"?: string;
    contribution?: string;
    abstract?: string;
    keywords?: string[];
    figures?: Array<{
      url: string;
      caption: string;
      is_method: boolean;
    }>;
  };
}

interface SemanticScholarPaper {
  id: string;
  title: string;
  summary: string;
  score: number;
  tags: string[];
  source_url: string;
  metadata: {
    authors?: string[];
    year?: number;
    citation_count?: number;
    contribution?: string;
    abstract?: string;
    keywords?: string[];
    paper_id?: string;
    s2_url?: string;
    relationship?: string;
    relationship_label?: string;
    source_arxiv_id?: string;
  };
}

interface CrawlProgress {
  current: number;
  total: number;
  phase: "fetching" | "processing" | "complete";
  message?: string;
}

export default function ArxivTracker() {
  const { config } = useStore();

  // AND 搜索模式状态
  const [andKeywords, setAndKeywords] = useState("robotics, manipulation");
  const [andPapers, setAndPapers] = useState<ArxivPaper[]>([]);
  const [andCrawling, setAndCrawling] = useState(false);
  const [andProgress, setAndProgress] = useState<CrawlProgress | null>(null);

  // OR 搜索模式状态
  const [orKeywords, setOrKeywords] = useState("grasping, gripper");
  const [orPapers, setOrPapers] = useState<ArxivPaper[]>([]);
  const [orCrawling, setOrCrawling] = useState(false);
  const [orProgress, setOrProgress] = useState<CrawlProgress | null>(null);

  // Semantic Scholar 状态
  const [arxivIdInput, setArxivIdInput] = useState("");
  const [s2Papers, setS2Papers] = useState<SemanticScholarPaper[]>([]);
  const [s2Crawling, setS2Crawling] = useState(false);
  const [s2Progress, setS2Progress] = useState<CrawlProgress | null>(null);
  const [fetchCitations, setFetchCitations] = useState(true);
  const [fetchReferences, setFetchReferences] = useState(false);

  // 通用状态
  const [activeTab, setActiveTab] = useState<"and" | "or" | "followups">("and");
  const [filterScore, setFilterScore] = useState(0);
  const [loading, setLoading] = useState(false);
  const [savedPapers, setSavedPapers] = useState<Set<string>>(new Set());
  const [savedS2Papers, setSavedS2Papers] = useState<Set<string>>(new Set());
  const [autoSave, setAutoSave] = useState(true);
  const [csOnly, setCsOnly] = useState(true);

  const toast = useToast();
  const wsRef = useRef<WebSocket | null>(null);

  // WebSocket 连接
  useEffect(() => {
    const ws = new WebSocket("ws://127.0.0.1:8765/ws/feed");
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "crawl_progress") {
        const progress = {
          current: data.current || 0,
          total: data.total || 20,
          phase: data.phase,
          message: data.message,
        };
        if (activeTab === "and") {
          setAndProgress(progress);
        } else {
          setOrProgress(progress);
        }
      } else if (data.type === "crawl_paper") {
        // 实时添加论文到列表
        if (activeTab === "and") {
          setAndPapers(prev => [...prev, data.paper]);
          // 自动保存
          if (autoSave) {
            saveSinglePaper(data.paper);
          }
        } else {
          setOrPapers(prev => [...prev, data.paper]);
          if (autoSave) {
            saveSinglePaper(data.paper);
          }
        }
      } else if (data.type === "crawl_complete") {
        toast.success(
          "爬取完成",
          `共找到 ${data.count} 篇论文${data.skipped_duplicates > 0 ? `，跳过 ${data.skipped_duplicates} 篇重复` : ""}`
        );
        if (activeTab === "and") {
          setAndCrawling(false);
        } else {
          setOrCrawling(false);
        }
      } else if (data.type === "crawl_error") {
        toast.error("爬取失败", data.error);
        if (activeTab === "and") {
          setAndCrawling(false);
        } else {
          setOrCrawling(false);
        }
      } else if (data.type === "s2_progress") {
        // Semantic Scholar progress
        setS2Progress({
          current: data.current || 0,
          total: data.total || 20,
          phase: data.phase,
          message: data.message,
        });
      } else if (data.type === "s2_paper") {
        // Real-time add S2 paper
        setS2Papers((prev) => {
          if (prev.find((p) => p.id === data.paper.id)) return prev;
          return [...prev, data.paper];
        });
      } else if (data.type === "s2_complete") {
        setS2Crawling(false);
        setS2Progress(null);
        toast.success("Semantic Scholar 爬取完成", `共获取 ${data.count} 篇相关论文`);
      } else if (data.type === "s2_error") {
        setS2Crawling(false);
        setS2Progress(null);
        toast.error("Semantic Scholar 爬取失败", data.error);
      }
    };

    return () => {
      ws.close();
    };
  }, [activeTab, autoSave]);

  // Load existing papers on mount
  useEffect(() => {
    loadPapers();
  }, []);

  async function loadPapers() {
    setLoading(true);
    try {
      const data = await api.get<{ cards: ArxivPaper[] }>(
        "/api/cards?module_id=arxiv-tracker&limit=50"
      );
      const sorted = (data.cards || []).sort((a, b) => {
        const dateA = a.metadata?.published || "";
        const dateB = b.metadata?.published || "";
        return dateB.localeCompare(dateA);
      });
      // 默认加载到 AND 列表
      setAndPapers(sorted);
    } catch (err) {
      console.error("Failed to load papers:", err);
    } finally {
      setLoading(false);
    }
  }

  async function saveSinglePaper(paper: ArxivPaper) {
    try {
      await api.post("/api/modules/arxiv-tracker/save-to-literature", {
        paper,
        folder: "arxiv",
      });
      setSavedPapers(prev => new Set(prev).add(paper.id));
    } catch (e) {
      console.error(`Failed to save paper ${paper.id}:`, e);
    }
  }

  async function runCrawl(mode: "AND" | "OR") {
    const keywords = mode === "AND" ? andKeywords : orKeywords;
    const keywordList = keywords.split(",").map(k => k.trim()).filter(Boolean);

    if (keywordList.length === 0) {
      toast.error("请输入关键词", "至少输入一个关键词进行搜索");
      return;
    }

    if (mode === "AND") {
      setAndCrawling(true);
      setAndPapers([]);
      setAndProgress({ current: 0, total: 20, phase: "fetching", message: "正在获取论文列表..." });
    } else {
      setOrCrawling(true);
      setOrPapers([]);
      setOrProgress({ current: 0, total: 20, phase: "fetching", message: "正在获取论文列表..." });
    }

    try {
      // 启动爬取，结果会通过 WebSocket 推送
      await api.post("/api/modules/arxiv-tracker/crawl", {
        keywords: keywordList,
        max_results: 20,
        mode: mode,
        cs_only: csOnly,
      });
    } catch (err) {
      toast.error("爬取失败", err instanceof Error ? err.message : "请稍后重试");
      if (mode === "AND") {
        setAndCrawling(false);
      } else {
        setOrCrawling(false);
      }
    }
  }

  async function saveToLiterature(paper: ArxivPaper) {
    try {
      await api.post("/api/modules/arxiv-tracker/save-to-literature", {
        paper,
        folder: "arxiv",
      });
      setSavedPapers(prev => new Set(prev).add(paper.id));
      toast.success("保存成功", `已保存到文献库/arxiv/${paper.id}`);
    } catch (err) {
      toast.error("保存失败", err instanceof Error ? err.message : "请检查文献库路径");
    }
  }

  async function fetchS2FollowUps() {
    if (!arxivIdInput.trim()) {
      toast.error("请输入 arXiv ID", "例如：2501.12345");
      return;
    }

    setS2Crawling(true);
    setS2Papers([]);
    setS2Progress({ current: 0, total: 20, phase: "fetching", message: "正在查询 Semantic Scholar..." });

    try {
      await api.post("/api/modules/semantic-scholar/follow-ups", {
        arxiv_id: arxivIdInput.trim(),
        fetch_citations: fetchCitations,
        fetch_references: fetchReferences,
        limit: 20,
      });
    } catch (err) {
      toast.error("获取失败", err instanceof Error ? err.message : "请稍后重试");
      setS2Crawling(false);
    }
  }

  async function saveS2ToLiterature(paper: SemanticScholarPaper) {
    try {
      await api.post("/api/modules/semantic-scholar/save-to-literature", {
        paper,
      });
      setSavedS2Papers(prev => new Set(prev).add(paper.id));
      const subfolder = paper.metadata?.source_arxiv_id?.slice(0, 6) || "unknown";
      toast.success("保存成功", `已保存到文献库/FollowUps/${subfolder}/`);
    } catch (err) {
      toast.error("保存失败", err instanceof Error ? err.message : "请检查文献库路径");
    }
  }

  const currentPapers = activeTab === "and" ? andPapers : activeTab === "or" ? orPapers : s2Papers;
  const filteredPapers = activeTab === "followups" ? currentPapers : currentPapers.filter(p => p.score >= filterScore);
  const isCrawling = activeTab === "and" ? andCrawling : activeTab === "or" ? orCrawling : s2Crawling;
  const currentProgress = activeTab === "and" ? andProgress : activeTab === "or" ? orProgress : s2Progress;
  const currentKeywords = activeTab === "and" ? andKeywords : orKeywords;
  const setCurrentKeywords = activeTab === "and" ? setAndKeywords : setOrKeywords;

  return (
    <PageContainer>
      <PageHeader
        title="arXiv 论文追踪"
        subtitle="AND/OR 双模式 · CS领域 · 实时进度 · 自动去重"
        icon={BookOpen}
        actions={
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button
              onClick={loadPapers}
              disabled={loading}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 16px",
                borderRadius: "var(--radius-full)",
                background: "var(--bg-hover)",
                border: "1px solid var(--border-light)",
                color: "var(--text-secondary)",
                fontSize: "0.875rem",
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.6 : 1,
                transition: "all 0.3s ease",
              }}
            >
              <RefreshCw style={{ width: "14px", height: "14px", animation: loading ? "spin 1s linear infinite" : "none" }} />
              刷新
            </button>
          </div>
        }
      />

      <PageContent maxWidth="1200px">
        {/* Mode Tabs */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
          <button
            onClick={() => setActiveTab("and")}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              padding: "16px 24px",
              borderRadius: "var(--radius-lg)",
              background: activeTab === "and" ? "var(--color-primary)" : "var(--bg-card)",
              border: `1px solid ${activeTab === "and" ? "transparent" : "var(--border-light)"}`,
              color: activeTab === "and" ? "white" : "var(--text-secondary)",
              fontSize: "0.9375rem",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.3s ease",
            }}
          >
            <Layers style={{ width: "18px", height: "18px" }} />
            AND 模式
            <span style={{ fontSize: "0.75rem", opacity: 0.8 }}>(摘要包含所有关键词)</span>
          </button>
          <button
            onClick={() => setActiveTab("or")}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              padding: "16px 24px",
              borderRadius: "var(--radius-lg)",
              background: activeTab === "or" ? "var(--color-primary)" : "var(--bg-card)",
              border: `1px solid ${activeTab === "or" ? "transparent" : "var(--border-light)"}`,
              color: activeTab === "or" ? "white" : "var(--text-secondary)",
              fontSize: "0.9375rem",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.3s ease",
            }}
          >
            <Search style={{ width: "18px", height: "18px" }} />
            OR 模式
            <span style={{ fontSize: "0.75rem", opacity: 0.8 }}>(摘要包含任一关键词)</span>
          </button>
          <button
            onClick={() => setActiveTab("followups")}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              padding: "16px 24px",
              borderRadius: "var(--radius-lg)",
              background: activeTab === "followups" ? "var(--color-primary)" : "var(--bg-card)",
              border: `1px solid ${activeTab === "followups" ? "transparent" : "var(--border-light)"}`,
              color: activeTab === "followups" ? "white" : "var(--text-secondary)",
              fontSize: "0.9375rem",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.3s ease",
            }}
          >
            <GitBranch style={{ width: "18px", height: "18px" }} />
            后续论文
            <span style={{ fontSize: "0.75rem", opacity: 0.8 }}>(Semantic Scholar)</span>
          </button>
        </div>

        {/* Search Card */}
        <Card style={{ marginBottom: "24px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <Search style={{ width: "20px", height: "20px", color: "var(--color-primary)" }} />
              <span style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text-main)" }}>
                {activeTab === "and" ? "AND 关键词搜索" : "OR 关键词搜索"}
              </span>
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "12px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                  <Cpu style={{ width: "14px", height: "14px", color: "var(--text-muted)" }} />
                  <input
                    type="checkbox"
                    checked={csOnly}
                    onChange={(e) => setCsOnly(e.target.checked)}
                    disabled={isCrawling}
                    style={{ cursor: "pointer" }}
                  />
                  <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                    仅 CS 领域
                  </span>
                </label>
              </div>
            </div>

            <div style={{ display: "flex", gap: "12px", alignItems: "stretch" }}>
              <input
                type="text"
                value={currentKeywords}
                onChange={(e) => setCurrentKeywords(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !isCrawling && runCrawl(activeTab.toUpperCase() as "AND" | "OR")}
                placeholder={activeTab === "and" ? "输入关键词(AND)，如：robotics, manipulation" : "输入关键词(OR)，如：grasping, gripper"}
                disabled={isCrawling}
                style={{
                  flex: 1,
                  padding: "12px 16px",
                  borderRadius: "var(--radius-lg)",
                  border: "1px solid var(--border-light)",
                  background: "var(--bg-app)",
                  color: "var(--text-main)",
                  fontSize: "0.9375rem",
                  outline: "none",
                  transition: "all 0.2s ease",
                }}
              />
              <button
                onClick={() => runCrawl(activeTab.toUpperCase() as "AND" | "OR")}
                disabled={isCrawling}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "12px 24px",
                  borderRadius: "var(--radius-full)",
                  background: "linear-gradient(135deg, var(--color-primary), var(--color-secondary))",
                  border: "none",
                  color: "white",
                  fontSize: "0.9375rem",
                  fontWeight: 600,
                  cursor: isCrawling ? "not-allowed" : "pointer",
                  opacity: isCrawling ? 0.6 : 1,
                  transition: "all 0.3s ease",
                  boxShadow: "0 4px 16px rgba(188, 164, 227, 0.4)",
                  whiteSpace: "nowrap",
                }}
              >
                <RefreshCw style={{ width: "16px", height: "16px", animation: isCrawling ? "spin 1s linear infinite" : "none" }} />
                {isCrawling ? "爬取中..." : `立即爬取 (20篇)`}
              </button>
            </div>

            {/* Real-time Progress Bar */}
            {isCrawling && currentProgress && (
              <div style={{ marginTop: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
                  <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)", fontWeight: 500 }}>
                    {currentProgress.message || (currentProgress.phase === "fetching" ? "正在获取论文..." : `正在处理 ${currentProgress.current}/${currentProgress.total}`)}
                  </span>
                  <span style={{
                    fontSize: "0.9375rem",
                    fontWeight: 700,
                    color: "var(--color-primary)",
                    marginLeft: "auto"
                  }}>
                    {currentProgress.phase === "fetching"
                      ? "准备中..."
                      : `${Math.round((currentProgress.current / currentProgress.total) * 100)}%`}
                  </span>
                </div>
                <div
                  style={{
                    width: "100%",
                    height: "10px",
                    background: "var(--bg-hover)",
                    borderRadius: "var(--radius-full)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: currentProgress.phase === "fetching"
                        ? "30%"
                        : `${(currentProgress.current / currentProgress.total) * 100}%`,
                      height: "100%",
                      background: "linear-gradient(90deg, var(--color-primary), var(--color-secondary))",
                      borderRadius: "var(--radius-full)",
                      transition: "width 0.5s ease",
                      animation: currentProgress.phase === "fetching" ? "progress-pulse 1.5s ease-in-out infinite" : "none",
                    }}
                  />
                </div>
                <div style={{ display: "flex", gap: "8px", marginTop: "8px", flexWrap: "wrap" }}>
                  {currentPapers.slice(-3).map((p, i) => (
                    <span key={p.id} style={{ fontSize: "0.75rem", color: "var(--text-muted)", background: "var(--bg-hover)", padding: "2px 8px", borderRadius: "var(--radius-full)" }}>
                      ✓ {p.id}
                    </span>
                  ))}
                  {currentPapers.length > 0 && (
                    <span style={{ fontSize: "0.75rem", color: "var(--color-primary)" }}>
                      已获取 {currentPapers.length} 篇
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Auto Save Toggle */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={autoSave}
                  onChange={(e) => setAutoSave(e.target.checked)}
                  disabled={isCrawling}
                  style={{ width: "18px", height: "18px", cursor: "pointer" }}
                />
                <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>
                  自动保存到文献库/arxiv 文件夹
                </span>
              </label>
            </div>
          </div>
        </Card>

        {/* Filter Bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            marginBottom: "20px",
            padding: "12px 20px",
            background: "var(--bg-card)",
            borderRadius: "var(--radius-full)",
            border: "1px solid var(--border-light)",
            width: "fit-content",
          }}
        >
          <Filter style={{ width: "16px", height: "16px", color: "var(--text-muted)" }} />
          <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
            最低评分
          </span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={filterScore}
            onChange={(e) => setFilterScore(parseFloat(e.target.value))}
            style={{ width: "120px" }}
          />
          <span
            style={{
              fontSize: "0.875rem",
              fontWeight: 700,
              color: filterScore >= 0.8 ? "#10B981" : filterScore >= 0.6 ? "#F59E0B" : "var(--text-main)",
              minWidth: "40px",
            }}
          >
            {(filterScore * 10).toFixed(0)}
          </span>
          <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginLeft: "8px" }}>
            {filteredPapers.length} / {currentPapers.length} 篇
          </span>
        </div>

        {/* Papers List */}
        {loading && currentPapers.length === 0 ? (
          <LoadingState message="加载论文中..." />
        ) : filteredPapers.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="暂无论文"
            description={currentPapers.length === 0 ? `输入关键词点击「立即爬取」开始${activeTab === "and" ? "AND" : "OR"}搜索` : "没有符合评分筛选条件的论文"}
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {filteredPapers.map((paper) => (
              <PaperCard
                key={paper.id}
                paper={paper}
                isSaved={savedPapers.has(paper.id)}
                onSave={() => saveToLiterature(paper)}
                hasLiteraturePath={!!(config?.literature_path || config?.vault_path)}
              />
            ))}
          </div>
        )}
      </PageContent>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes progress-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </PageContainer>
  );
}

function PaperCard({
  paper,
  isSaved,
  onSave,
  hasLiteraturePath,
}: {
  paper: ArxivPaper;
  isSaved: boolean;
  onSave: () => void;
  hasLiteraturePath: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const score = Math.round(paper.score * 10);
  const meta = paper.metadata || {};
  const authors = meta.authors || [];

  const scoreColor = score >= 8 ? "#10B981" : score >= 6 ? "#F59E0B" : "#94A3B8";
  const scoreBg = score >= 8 ? "rgba(16, 185, 129, 0.1)" : score >= 6 ? "rgba(245, 158, 11, 0.1)" : "rgba(148, 163, 184, 0.1)";

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
    } catch {
      return dateStr;
    }
  };

  return (
    <Card noPadding>
      <div style={{ padding: "20px 24px" }}>
        {/* Header: Score + Title + Actions */}
        <div style={{ display: "flex", gap: "16px", marginBottom: "12px" }}>
          {/* Score Badge */}
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "var(--radius-md)",
              background: scoreBg,
              border: `2px solid ${scoreColor}`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: "1.25rem", fontWeight: 700, color: scoreColor, lineHeight: 1 }}>
              {score}
            </span>
            <span style={{ fontSize: "0.625rem", color: scoreColor, opacity: 0.8 }}>分</span>
          </div>

          {/* Title & Meta */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <a
              href={paper.source_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: "1.0625rem",
                fontWeight: 600,
                color: "var(--text-main)",
                textDecoration: "none",
                display: "flex",
                alignItems: "flex-start",
                gap: "6px",
                lineHeight: 1.5,
              }}
            >
              <span style={{ flex: 1 }}>{paper.title}</span>
              <ExternalLink style={{ width: "16px", height: "16px", flexShrink: 0, opacity: 0.5, marginTop: "4px" }} />
            </a>

            {/* Authors & Date */}
            <div style={{ display: "flex", alignItems: "center", gap: "16px", marginTop: "8px", flexWrap: "wrap" }}>
              {authors.length > 0 && (
                <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "4px" }}>
                  <User style={{ width: "12px", height: "12px" }} />
                  {authors.slice(0, 3).join(", ")}
                  {authors.length > 3 && ` +${authors.length - 3}`}
                </span>
              )}
              {meta.published && (
                <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "4px" }}>
                  <Calendar style={{ width: "12px", height: "12px" }} />
                  {formatDate(meta.published)}
                </span>
              )}
              <span
                style={{
                  fontSize: "0.75rem",
                  padding: "2px 8px",
                  borderRadius: "var(--radius-full)",
                  background: "var(--bg-hover)",
                  color: "var(--text-muted)",
                }}
              >
                {paper.id}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
            {meta["pdf-url"] && (
              <a
                href={meta["pdf-url"]}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 14px",
                  borderRadius: "var(--radius-full)",
                  background: "var(--bg-hover)",
                  border: "1px solid var(--border-light)",
                  color: "var(--text-secondary)",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  textDecoration: "none",
                  transition: "all 0.2s ease",
                }}
              >
                <FileText style={{ width: "14px", height: "14px" }} />
                PDF
              </a>
            )}
            {hasLiteraturePath && (
              <button
                onClick={onSave}
                disabled={isSaved}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 14px",
                  borderRadius: "var(--radius-full)",
                  background: isSaved ? "rgba(16, 185, 129, 0.1)" : "var(--color-primary)",
                  border: isSaved ? "1px solid #10B981" : "none",
                  color: isSaved ? "#10B981" : "white",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  cursor: isSaved ? "default" : "pointer",
                  transition: "all 0.2s ease",
                }}
              >
                {isSaved ? (
                  <>
                    <Check style={{ width: "14px", height: "14px" }} />
                    已保存
                  </>
                ) : (
                  <>
                    <Save style={{ width: "14px", height: "14px" }} />
                    保存
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Tags */}
        {paper.tags?.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "12px" }}>
            {paper.tags.map((tag) => (
              <span
                key={tag}
                style={{
                  padding: "4px 10px",
                  borderRadius: "var(--radius-full)",
                  background: "var(--bg-hover)",
                  fontSize: "0.75rem",
                  color: "var(--text-secondary)",
                  fontWeight: 500,
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Contribution Highlight */}
        {meta.contribution && (
          <div
            style={{
              display: "flex",
              gap: "10px",
              marginBottom: "16px",
              padding: "12px 16px",
              background: "linear-gradient(135deg, rgba(188, 164, 227, 0.08), rgba(168, 230, 207, 0.05))",
              borderRadius: "var(--radius-lg)",
              border: "1px solid rgba(188, 164, 227, 0.2)",
            }}
          >
            <Star style={{ width: "18px", height: "18px", color: "var(--color-primary)", flexShrink: 0, marginTop: "2px" }} />
            <p style={{ fontSize: "0.9375rem", color: "var(--text-main)", lineHeight: 1.6, margin: 0 }}>
              {meta.contribution}
            </p>
          </div>
        )}

        {/* Figures Gallery */}
        {meta.figures && meta.figures.length > 0 && (
          <div style={{ marginBottom: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--color-primary)" }}>
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
              <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-main)" }}>
                模型架构 / Pipeline
              </span>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                ({meta.figures.length} 张图)
              </span>
            </div>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              {meta.figures.map((fig, idx) => (
                <div
                  key={idx}
                  style={{
                    flex: "1 1 300px",
                    maxWidth: "500px",
                    borderRadius: "var(--radius-lg)",
                    overflow: "hidden",
                    border: "1px solid var(--border-light)",
                    background: "var(--bg-hover)",
                  }}
                >
                  <div style={{ position: "relative", paddingTop: "56.25%", background: "var(--bg-app)" }}>
                    <img
                      src={fig.url}
                      alt={fig.caption}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                      }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </div>
                  {fig.caption && (
                    <div style={{ padding: "8px 12px", fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.4 }}>
                      {fig.caption}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Summary / Abstract */}
        <div>
          <p
            style={{
              fontSize: "0.9375rem",
              color: "var(--text-secondary)",
              lineHeight: 1.7,
              margin: 0,
              display: expanded ? "block" : "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {expanded && meta.abstract ? meta.abstract : paper.summary}
          </p>
        </div>

        {/* Expand/Collapse */}
        {(meta.abstract || paper.summary.length > 100) && (
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              marginTop: "12px",
              padding: "6px 12px",
              borderRadius: "var(--radius-full)",
              background: "transparent",
              border: "1px solid var(--border-light)",
              color: "var(--color-primary)",
              fontSize: "0.8125rem",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            {expanded ? (
              <>
                <ChevronUp style={{ width: "14px", height: "14px" }} />
                收起
              </>
            ) : (
              <>
                <ChevronDown style={{ width: "14px", height: "14px" }} />
                展开完整摘要
              </>
            )}
          </button>
        )}
      </div>
    </Card>
  );
}
