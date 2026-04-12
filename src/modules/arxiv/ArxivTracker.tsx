import { useState, useEffect, useRef } from "react";
import {
  BookOpen,
  RefreshCw,
  ExternalLink,
  Star,
  Save,
  Search,
  Calendar,
  User,
  FileText,
  ChevronDown,
  ChevronUp,
  Check,
  Cpu,
  GitBranch,
  Square,
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
      local_path?: string;
      original_url?: string;
    }>;
    figures_dir?: string;
    local_figures?: Array<{
      filename: string;
      caption: string;
      local_path: string;
      original_url?: string;
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
    arxiv_id?: string;
    arxiv_url?: string;
    relationship?: string;
    relationship_label?: string;
    source_arxiv_id?: string;
    source_paper_title?: string;
    published?: string;
    venue?: string;
    figures?: Array<{
      url: string;
      caption: string;
      is_method: boolean;
    }>;
    local_figures?: Array<{
      filename: string;
      caption: string;
      local_path: string;
      original_url?: string;
    }>;
  };
}

interface CrawlProgress {
  current: number;
  total: number;
  phase: "fetching" | "processing" | "complete";
  message?: string;
  currentPaperTitle?: string;
}

export default function ArxivTracker() {
  const {
    config,
    arxivAndPapers,
    arxivAndCrawling,
    arxivAndProgress,
    arxivAndKeywords,
    setArxivAndPapers,
    setArxivAndCrawling,
    setArxivAndProgress,
    setArxivAndKeywords,
  } = useStore();

  // Semantic Scholar 状态
  const [arxivIdInput, _setArxivIdInput] = useState("");
  const [s2Papers, setS2Papers] = useState<SemanticScholarPaper[]>([]);
  const [s2Crawling, setS2Crawling] = useState(false);
  const [s2Progress, setS2Progress] = useState<CrawlProgress | null>(null);
  const [_fetchCitations, _setFetchCitations] = useState(true);
  const [_fetchReferences, _setFetchReferences] = useState(false);

  // 通用状态
  const [activeTab, setActiveTab] = useState<"search" | "followups">("search");
  const [loading, setLoading] = useState(false);
  const [savedPapers, setSavedPapers] = useState<Set<string>>(new Set());
  const [_savedS2Papers, _setSavedS2Papers] = useState<Set<string>>(new Set());
  const [autoSave, setAutoSave] = useState(false);
  const [csOnly, setCsOnly] = useState(true);
  const [searchMaxResults, setSearchMaxResults] = useState(50);
  const [searchDaysBack, setSearchDaysBack] = useState(180);

  const toast = useToast();
  const wsRef = useRef<WebSocket | null>(null);
  const wsConnectedRef = useRef<boolean>(false);
  const saveSinglePaperRef = useRef<((paper: ArxivPaper) => Promise<void>) | null>(null);

  // WebSocket 连接 - 使用 ref 来避免依赖问题，确保事件处理始终可用
  const activeTabRef = useRef(activeTab);
  const autoSaveRef = useRef(autoSave);
  const searchCrawlingRef = useRef(arxivAndCrawling);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    autoSaveRef.current = autoSave;
  }, [autoSave]);

  useEffect(() => {
    searchCrawlingRef.current = arxivAndCrawling;
  }, [arxivAndCrawling]);

  // Track which mode is currently crawling using a crawling ID
  const crawlingIdRef = useRef<string | null>(null);

  // crawlingMode state and ref - must be declared BEFORE WebSocket effect
  const [crawlingMode, setCrawlingMode] = useState<string | null>(null);
  const crawlingModeRef = useRef<string | null>(null);

  useEffect(() => {
    crawlingModeRef.current = crawlingMode;
  }, [crawlingMode]);

  // Session ID for cancellation
  const [crawlSessionId, setCrawlSessionId] = useState<string | null>(null);
  const crawlSessionIdRef = useRef<string | null>(null);
  const s2SessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    crawlSessionIdRef.current = crawlSessionId;
  }, [crawlSessionId]);

  // WebSocket connection with reconnect logic
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout>;
    let isActive = true;

    const connect = () => {
      if (!isActive) return;

      console.log("[arXiv] Connecting to WebSocket...");
      ws = new WebSocket("ws://127.0.0.1:8765/ws/feed");
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[arXiv] WebSocket connected");
        wsConnectedRef.current = true;
      };

      ws.onerror = (error) => {
        // Only log errors if not intentionally closing
        if (isActive) {
          console.error("[arXiv] WebSocket error:", error);
        }
        wsConnectedRef.current = false;
      };

      ws.onclose = (event) => {
        // 1000 = normal closure, 1001 = going away (page refresh), 1005 = no status, 1006 = abnormal
        const isNormalClose = [1000, 1001].includes(event.code);
        if (!isNormalClose && isActive) {
          console.log(`[arXiv] WebSocket closed (code: ${event.code}), reconnecting...`);
        }
        wsConnectedRef.current = false;
        // Reconnect after 3 seconds if still active
        if (isActive) {
          reconnectTimeout = setTimeout(connect, 3000);
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const shouldAutoSave = autoSaveRef.current;

          console.log("[arXiv] WS message:", data.type, data);

          if (data.type === "crawl_started") {
            // Store session ID for cancellation
            if (data.session_id) {
              setCrawlSessionId(data.session_id);
              crawlSessionIdRef.current = data.session_id;
            }
          } else if (data.type === "crawl_cancelled") {
            toast.info("已取消", data.message || "爬取任务已取消");
            setArxivAndCrawling(false);
            setArxivAndProgress(null);
            crawlingIdRef.current = null;
            setCrawlingMode(null);
            setCrawlSessionId(null);
            crawlSessionIdRef.current = null;
          } else if (data.type === "crawl_progress") {
            const progress: CrawlProgress = {
              current: data.current || 0,
              total: data.total || 20,
              phase: data.phase,
              message: data.message,
              currentPaperTitle: data.currentPaperTitle,
            };
            setArxivAndProgress(progress);
          } else if (data.type === "crawl_paper") {
            const store = useStore.getState();
            console.log("[arXiv] Received paper:", data.paper?.id, "mode:", crawlingModeRef.current || crawlingIdRef.current);
            const exists = store.arxivAndPapers.find(p => p.id === data.paper.id);
            if (!exists) {
              console.log("[arXiv] Adding to search list");
              store.appendArxivAndPaper(data.paper);
              if (shouldAutoSave && saveSinglePaperRef.current) {
                saveSinglePaperRef.current(data.paper);
              }
            }
          } else if (data.type === "crawl_complete") {
            console.log("[arXiv] Crawl complete:", data.count);
            toast.success("爬取完成", `共找到 ${data.count} 篇论文`);
            setArxivAndCrawling(false);
            setArxivAndProgress(null);
            crawlingIdRef.current = null;
            setCrawlingMode(null);
          } else if (data.type === "crawl_error") {
            console.error("[arXiv] Crawl error:", data.error);
            toast.error("爬取失败", data.error);
            setArxivAndCrawling(false);
            setArxivAndProgress(null);
            crawlingIdRef.current = null;
            setCrawlingMode(null);
          } else if (data.type === "s2_progress") {
            setS2Progress({
              current: data.current || 0,
              total: data.total || 20,
              phase: data.phase,
              message: data.message,
              currentPaperTitle: data.currentPaperTitle,
            });
          } else if (data.type === "s2_paper") {
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

          // Handle new semantic-scholar-tracker module messages
          if (data.module === "semantic-scholar-tracker") {
            if (data.type === "crawl_paper") {
              setS2Papers((prev) => {
                if (prev.find((p) => p.id === data.paper.id)) return prev;
                return [...prev, data.paper];
              });
            } else if (data.type === "crawl_complete") {
              setS2Crawling(false);
              setS2Progress(null);
              toast.success("后续论文爬取完成", `共获取 ${data.count} 篇论文`);
            } else if (data.type === "crawl_error") {
              setS2Crawling(false);
              setS2Progress(null);
              toast.error("后续论文爬取失败", data.error);
            } else if (data.type === "crawl_cancelled") {
              setS2Crawling(false);
              setS2Progress(null);
              toast.info("已取消爬取");
            } else if (data.type === "crawl_progress") {
              setS2Progress({
                current: data.current || 0,
                total: data.total || 20,
                phase: data.phase,
                message: data.message,
              });
            }
          }
        } catch (err) {
          console.error("[arXiv] Error handling message:", err);
        }
      };
    };

    connect();

    return () => {
      isActive = false;
      clearTimeout(reconnectTimeout);
      if (ws) {
        ws.close();
      }
    };
  }, [])

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
      setArxivAndPapers(sorted);
    } catch (err) {
      console.error("Failed to load papers:", err);
    } finally {
      setLoading(false);
    }
  }

  async function saveSinglePaper(paper: ArxivPaper) {
    try {
      const result = await api.post<{
        ok: boolean;
        path: string;
        figures?: Array<{ filename: string; caption: string; local_path: string; original_url: string }>;
        pdf?: string;
      }>("/api/modules/arxiv-tracker/save-to-literature", {
        paper,
        folder: "arxiv",
      });
      setSavedPapers(prev => new Set(prev).add(paper.id));

      // Update paper with local figures info for immediate display
      if (result.figures && result.figures.length > 0) {
        const updatedPaper = {
          ...paper,
          metadata: {
            ...paper.metadata,
            local_figures: result.figures,
          },
        };
        const store = useStore.getState();
        const newPapers = store.arxivAndPapers.map(p => p.id === paper.id ? updatedPaper : p);
        setArxivAndPapers(newPapers);
      }
    } catch (e) {
      console.error(`Failed to save paper ${paper.id}:`, e);
    }
  }

  // Update ref whenever saveSinglePaper changes
  useEffect(() => {
    saveSinglePaperRef.current = saveSinglePaper;
  }, []);

  async function runCrawl() {
    const keywords = arxivAndKeywords;
    const mode: "AND" | "AND_OR" = keywords.includes("|") ? "AND_OR" : "AND";

    // For AND_OR mode, pass the raw keywords string (with | separator) as a single item
    // For other modes, split by comma
    const keywordList = mode === "AND_OR"
      ? [keywords.trim()]  // Pass raw string with | separators
      : keywords.split(",").map(k => k.trim()).filter(Boolean);

    if (keywordList.length === 0 || (mode === "AND_OR" && !keywords.trim())) {
      toast.error("请输入关键词", "至少输入一个关键词进行搜索");
      return;
    }

    // Set crawling ID before starting - both in ref and state
    crawlingIdRef.current = mode;
    setCrawlingMode(mode);

    setArxivAndCrawling(true);
    setArxivAndPapers([]);
    setArxivAndProgress({ current: 0, total: searchMaxResults, phase: "fetching", message: "正在获取论文列表..." });

    try {
      // 启动爬取，结果会通过 WebSocket 推送
      console.log("[arXiv] Starting crawl API call with mode:", mode);
      await api.post("/api/modules/arxiv-tracker/crawl", {
        keywords: keywordList,
        max_results: searchMaxResults,
        mode: mode,
        cs_only: csOnly,
        days_back: searchDaysBack,
      });
      console.log("[arXiv] Crawl API call completed");
    } catch (err) {
      console.error("[arXiv] Crawl API error:", err);
      toast.error("爬取失败", err instanceof Error ? err.message : "请稍后重试");
      crawlingIdRef.current = null;
      setCrawlingMode(null);
      setCrawlSessionId(null);
      crawlSessionIdRef.current = null;
      setArxivAndCrawling(false);
    }
  }

  async function stopCrawl() {
    const sessionId = crawlSessionIdRef.current;
    if (!sessionId) {
      toast.error("没有正在进行的爬取任务");
      return;
    }

    try {
      console.log("[arXiv] Cancelling crawl:", sessionId);
      await api.post("/api/modules/arxiv-tracker/cancel", {
        session_id: sessionId,
      });
      toast.info("正在取消", "已发送取消信号，等待当前论文处理完成...");
    } catch (err) {
      console.error("[arXiv] Cancel error:", err);
      toast.error("取消失败", err instanceof Error ? err.message : "请稍后重试");
    }
  }

  async function saveToLiterature(paper: ArxivPaper) {
    try {
      const result = await api.post<{ ok: boolean; path: string; figures?: Array<{ filename: string; caption: string; local_path: string; original_url: string }> }>("/api/modules/arxiv-tracker/save-to-literature", {
        paper,
        folder: "arxiv",
      });
      setSavedPapers(prev => new Set(prev).add(paper.id));

      // Update paper with local figures info
      if (result.figures && result.figures.length > 0) {
        const updatedPaper = {
          ...paper,
          metadata: {
            ...paper.metadata,
            local_figures: result.figures,
          },
        };
        const store = useStore.getState();
        const newPapers = store.arxivAndPapers.map(p => p.id === paper.id ? updatedPaper : p);
        setArxivAndPapers(newPapers);
      }

      toast.success("保存成功", `已保存到文献库/arxiv/${paper.id}${result.figures ? ` (${result.figures.length} 张图片)` : ""}`);
    } catch (err) {
      toast.error("保存失败", err instanceof Error ? err.message : "请检查文献库路径");
    }
  }

  const currentPapers = activeTab === "search" ? arxivAndPapers : s2Papers;
  const isCrawling = activeTab === "search" ? arxivAndCrawling : s2Crawling;
  const currentProgress = activeTab === "search" ? arxivAndProgress : s2Progress;

  // Fetch follow-up papers from Semantic Scholar
  async function fetchS2FollowUps() {
    if (!arxivIdInput.trim()) {
      toast.error("请输入 arXiv ID 或论文标题", "例如：2501.12345 或 VGGT");
      return;
    }

    setS2Crawling(true);
    setS2Papers([]);
    setS2Progress({ current: 0, total: 20, phase: "fetching", message: "正在查询 Semantic Scholar..." });

    try {
      // Generate session ID for cancellation
      const sessionId = Math.random().toString(36).substring(2, 10);
      s2SessionIdRef.current = sessionId;

      await api.post("/api/modules/semantic-scholar-tracker/crawl", {
        query: arxivIdInput.trim(),
        max_results: 20,
        days_back: 7,
        session_id: sessionId,
      });
    } catch (err) {
      toast.error("获取失败", err instanceof Error ? err.message : "请稍后重试");
      setS2Crawling(false);
    }
  }

  // Cancel S2 crawl
  async function stopS2Crawl() {
    if (s2SessionIdRef.current) {
      try {
        await api.post("/api/modules/semantic-scholar-tracker/cancel", {
          session_id: s2SessionIdRef.current,
        });
        toast.info("已停止爬取");
      } catch (e) {
        console.error("Cancel failed:", e);
      }
    }
  }

  async function saveS2ToLiterature(paper: SemanticScholarPaper) {
    try {
      const result = await api.post<{
        ok: boolean;
        path: string;
        figures: Array<{ filename: string; caption: string; local_path: string }>;
        pdf: string | null;
        folder: string;
      }>("/api/modules/semantic-scholar/save-to-literature", {
        paper,
        save_pdf: true,
        max_figures: 5,
      });

      _setSavedS2Papers(prev => new Set(prev).add(paper.id));

      // Update paper with local figures for immediate display
      if (result.figures && result.figures.length > 0) {
        const updatedPaper = {
          ...paper,
          metadata: {
            ...paper.metadata,
            local_figures: result.figures,
          },
        };
        setS2Papers(prev => prev.map(p => p.id === paper.id ? updatedPaper : p));
      }

      const figureMsg = result.figures?.length ? ` (${result.figures.length}张图)` : "";
      const pdfMsg = result.pdf ? " +PDF" : "";
      toast.success("保存成功", `已保存到 ${result.folder}${figureMsg}${pdfMsg}`);
    } catch (err) {
      toast.error("保存失败", err instanceof Error ? err.message : "请检查文献库路径");
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="论文搜索"
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
        {/* Search Tabs */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
          <button
            onClick={() => setActiveTab("search")}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              padding: "16px 24px",
              borderRadius: "var(--radius-lg)",
              background: activeTab === "search" ? "var(--color-primary)" : "var(--bg-card)",
              border: `1px solid ${activeTab === "search" ? "transparent" : "var(--border-light)"}`,
              color: activeTab === "search" ? "white" : "var(--text-secondary)",
              fontSize: "0.9375rem",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.3s ease",
            }}
          >
            <Search style={{ width: "18px", height: "18px" }} />
            关键词搜索
            <span style={{ fontSize: "0.75rem", opacity: 0.8 }}>(AND / AND-OR)</span>
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
            {activeTab === "followups" ? (
              // Follow-ups Tab UI
              <>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <GitBranch style={{ width: "20px", height: "20px", color: "var(--color-primary)" }} />
                  <span style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text-main)" }}>
                    Semantic Scholar 后续论文
                  </span>
                  <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginLeft: "8px" }}>
                    查找引用该论文的后续研究
                  </span>
                </div>

                <div style={{ display: "flex", gap: "12px", alignItems: "stretch" }}>
                  <input
                    type="text"
                    value={arxivIdInput}
                    onChange={(e) => _setArxivIdInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !s2Crawling && fetchS2FollowUps()}
                    placeholder="输入论文标题或 arXiv ID，如：VGGT 或 2501.12345"
                    disabled={s2Crawling}
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
                  {s2Crawling ? (
                    <button
                      onClick={stopS2Crawl}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "12px 24px",
                        borderRadius: "var(--radius-full)",
                        background: "linear-gradient(135deg, #EF4444, #DC2626)",
                        border: "none",
                        color: "white",
                        fontSize: "0.9375rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        transition: "all 0.3s ease",
                        boxShadow: "0 4px 16px rgba(239, 68, 68, 0.4)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <Square style={{ width: "16px", height: "16px" }} />
                      停止爬取
                    </button>
                  ) : (
                    <button
                      onClick={fetchS2FollowUps}
                      disabled={s2Crawling}
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
                        cursor: "pointer",
                        transition: "all 0.3s ease",
                        boxShadow: "0 4px 16px rgba(188, 164, 227, 0.4)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <GitBranch style={{ width: "16px", height: "16px" }} />
                      查找后续论文
                    </button>
                  )}
                </div>

                {/* Options */}
                <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={_fetchCitations}
                      onChange={(e) => _setFetchCitations(e.target.checked)}
                      disabled={s2Crawling}
                      style={{ width: "16px", height: "16px", cursor: "pointer" }}
                    />
                    <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>
                      查找引用该论文的文献
                    </span>
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={_fetchReferences}
                      onChange={(e) => _setFetchReferences(e.target.checked)}
                      disabled={s2Crawling}
                      style={{ width: "16px", height: "16px", cursor: "pointer" }}
                    />
                    <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>
                      查找该论文引用的参考文献
                    </span>
                  </label>
                </div>

                {/* Example */}
                <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                  提示：输入论文标题或 arXiv ID，系统将查找引用该论文的后续研究
                </div>
              </>
            ) : (
              // Keyword search UI
              <>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <Search style={{ width: "20px", height: "20px", color: "var(--color-primary)" }} />
                  <span style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text-main)" }}>
                    arXiv 关键词搜索
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

                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: "6px", width: "120px" }}>
                    <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                      最大结果数
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={200}
                      value={searchMaxResults}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        setSearchMaxResults(Number.isFinite(value) ? Math.min(200, Math.max(1, value)) : 50);
                      }}
                      disabled={isCrawling}
                      style={{
                        height: "38px",
                        padding: "8px 12px",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid var(--border-light)",
                        background: "var(--bg-app)",
                        color: "var(--text-main)",
                        fontSize: "0.875rem",
                        boxSizing: "border-box",
                      }}
                    />
                  </label>

                  <label style={{ display: "flex", flexDirection: "column", gap: "6px", width: "140px" }}>
                    <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                      截止时间范围(天)
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={3650}
                      value={searchDaysBack}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        setSearchDaysBack(Number.isFinite(value) ? Math.min(3650, Math.max(1, value)) : 180);
                      }}
                      disabled={isCrawling}
                      style={{
                        height: "38px",
                        padding: "8px 12px",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid var(--border-light)",
                        background: "var(--bg-app)",
                        color: "var(--text-main)",
                        fontSize: "0.875rem",
                        boxSizing: "border-box",
                      }}
                    />
                  </label>
                </div>

                <div style={{ display: "flex", gap: "12px", alignItems: "stretch" }}>
                  <input
                    type="text"
                    value={arxivAndKeywords}
                    onChange={(e) => setArxivAndKeywords(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !isCrawling) {
                        runCrawl();
                      }
                    }}
                    placeholder="AND：robotics, manipulation；AND-OR：vision,language | robot,manipulation"
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
                  {isCrawling ? (
                    <button
                      onClick={stopCrawl}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "12px 24px",
                        borderRadius: "var(--radius-full)",
                        background: "linear-gradient(135deg, #EF4444, #DC2626)",
                        border: "none",
                        color: "white",
                        fontSize: "0.9375rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        transition: "all 0.3s ease",
                        boxShadow: "0 4px 16px rgba(239, 68, 68, 0.4)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <Square style={{ width: "16px", height: "16px" }} />
                      停止爬取
                    </button>
                  ) : (
                    <button
                      onClick={runCrawl}
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
                      {isCrawling ? "爬取中..." : `立即爬取 (${searchMaxResults}篇)`}
                    </button>
                  )}
                </div>

                {/* AND-OR Mode Help Text */}
                {!isCrawling && (
                  <div style={{
                    marginTop: "12px",
                    padding: "12px 16px",
                    background: "var(--bg-hover)",
                    borderRadius: "var(--radius-lg)",
                    border: "1px dashed var(--border-light)",
                    fontSize: "0.875rem",
                    color: "var(--text-secondary)",
                    lineHeight: 1.6,
                  }}>
                    <strong style={{ color: "var(--text-main)" }}>搜索规则：</strong>
                    <br />
                    逗号分隔的关键词按 AND 搜索；用 <code style={{ background: "var(--bg-card)", padding: "2px 6px", borderRadius: "4px" }}>|</code> 分隔多组 AND 条件
                    <br />
                    例如：
                    <code style={{ background: "var(--bg-card)", padding: "2px 6px", borderRadius: "4px" }}>
                      vision,language | robot,manipulation
                    </code>
                    <br />
                    <span style={{ fontSize: "0.8125rem", opacity: 0.8 }}>
                      表示：(vision AND language) OR (robot AND manipulation)
                    </span>
                  </div>
                )}
              </>
            )}

            {/* Real-time Progress Bar */}
            {isCrawling && currentProgress && (
              <div style={{ marginTop: "12px", padding: "16px", background: "var(--bg-hover)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-light)" }}>
                {/* Progress Header */}
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
                  <div style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "50%",
                    background: "linear-gradient(135deg, var(--color-primary), var(--color-secondary))",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    animation: currentProgress.phase === "fetching" ? "spin 1s linear infinite" : "none"
                  }}>
                    <RefreshCw style={{ width: "16px", height: "16px", color: "white" }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text-main)" }}>
                      {currentProgress.phase === "fetching"
                        ? "正在获取论文列表..."
                        : activeTab === "search"
                          ? `正在推送第 ${currentProgress.current}/${currentProgress.total} 篇`
                          : `正在处理第 ${currentProgress.current}/${currentProgress.total} 篇`}
                    </div>
                    <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                      {currentProgress.message || "正在爬取..."}
                    </div>
                  </div>
                  <span style={{
                    fontSize: "1.125rem",
                    fontWeight: 700,
                    color: "var(--color-primary)",
                  }}>
                    {currentProgress.phase === "fetching"
                      ? "准备中"
                      : `${Math.round((currentProgress.current / currentProgress.total) * 100)}%`}
                  </span>
                </div>

                {/* Progress Bar */}
                <div
                  style={{
                    width: "100%",
                    height: "8px",
                    background: "var(--bg-app)",
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
                      transition: "width 0.3s ease",
                      animation: currentProgress.phase === "fetching" ? "progress-pulse 1.5s ease-in-out infinite" : "none",
                    }}
                  />
                </div>

                {/* Current Paper Title */}
                {currentProgress.currentPaperTitle && currentProgress.phase === "processing" && (
                  <div style={{
                    marginTop: "12px",
                    padding: "10px 14px",
                    background: "var(--bg-card)",
                    borderRadius: "var(--radius-md)",
                    borderLeft: "3px solid var(--color-primary)"
                  }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "4px" }}>
                      当前处理
                    </div>
                    <div style={{
                      fontSize: "0.875rem",
                      color: "var(--text-main)",
                      fontWeight: 500,
                      lineHeight: 1.4,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap"
                    }}>
                      {currentProgress.currentPaperTitle}
                    </div>
                  </div>
                )}

                {/* Recently Added Papers */}
                {currentPapers.length > 0 && (
                  <div style={{ marginTop: "12px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>最新获取:</span>
                    {currentPapers.slice(-3).reverse().map((p) => (
                      <span key={p.id} style={{
                        fontSize: "0.75rem",
                        color: "var(--color-primary)",
                        background: "rgba(188, 164, 227, 0.15)",
                        padding: "3px 10px",
                        borderRadius: "var(--radius-full)",
                        fontWeight: 500
                      }}>
                        {p.id}
                      </span>
                    ))}
                    <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginLeft: "auto" }}>
                      已获取 {currentPapers.length} 篇
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* S2 Progress Bar - Only show for followups tab */}
            {activeTab === "followups" && s2Crawling && s2Progress && (
              <div style={{ marginTop: "12px", padding: "16px", background: "var(--bg-hover)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-light)" }}>
                {/* Progress Header */}
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
                  <div style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "50%",
                    background: "linear-gradient(135deg, var(--color-primary), var(--color-secondary))",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    animation: s2Progress.phase === "fetching" ? "spin 1s linear infinite" : "none"
                  }}>
                    <GitBranch style={{ width: "16px", height: "16px", color: "white" }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text-main)" }}>
                      {s2Progress.phase === "fetching"
                        ? "正在查询 Semantic Scholar..."
                        : `正在处理第 ${s2Progress.current}/${s2Progress.total} 篇`}
                    </div>
                    <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                      {s2Progress.message || "正在获取后续论文..."}
                    </div>
                  </div>
                  <span style={{
                    fontSize: "1.125rem",
                    fontWeight: 700,
                    color: "var(--color-primary)",
                  }}>
                    {s2Progress.phase === "fetching"
                      ? "准备中"
                      : `${Math.round((s2Progress.current / s2Progress.total) * 100)}%`}
                  </span>
                </div>

                {/* Progress Bar */}
                <div
                  style={{
                    width: "100%",
                    height: "8px",
                    background: "var(--bg-app)",
                    borderRadius: "var(--radius-full)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: s2Progress.phase === "fetching"
                        ? "30%"
                        : `${(s2Progress.current / s2Progress.total) * 100}%`,
                      height: "100%",
                      background: "linear-gradient(90deg, var(--color-primary), var(--color-secondary))",
                      borderRadius: "var(--radius-full)",
                      transition: "width 0.3s ease",
                      animation: s2Progress.phase === "fetching" ? "progress-pulse 1.5s ease-in-out infinite" : "none",
                    }}
                  />
                </div>

                {/* S2 Papers Count */}
                {s2Papers.length > 0 && (
                  <div style={{ marginTop: "12px", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    已获取 {s2Papers.length} 篇后续论文
                  </div>
                )}
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
                  自动保存到文献库/{activeTab === "followups" ? "FollowUps" : "arxiv"} 文件夹
                </span>
              </label>
            </div>
          </div>
        </Card>

        {/* Papers List */}
        {loading && currentPapers.length === 0 ? (
          <LoadingState message="加载论文中..." />
        ) : currentPapers.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="暂无论文"
            description={
              activeTab === "followups"
                ? "输入 arXiv ID 点击「查找后续论文」开始搜索"
                : "输入关键词点击「立即爬取」开始搜索"
            }
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {activeTab === "followups"
              ? s2Papers.map((paper) => (
                  <S2PaperCard
                    key={paper.id}
                    paper={paper}
                    isSaved={_savedS2Papers.has(paper.id)}
                    onSave={() => saveS2ToLiterature(paper)}
                    hasLiteraturePath={!!(config?.literature_path || config?.vault_path)}
                  />
                ))
              : currentPapers.map((paper) => (
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
  const meta = paper.metadata || {};
  const authors = meta.authors || [];

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
        {/* Header: Title + Actions */}
        <div style={{ display: "flex", gap: "16px", marginBottom: "12px" }}>
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

        {/* Figures Gallery - Use local images if available, otherwise remote */}
        {(meta.local_figures && meta.local_figures.length > 0) || (meta.figures && meta.figures.length > 0) ? (
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
                ({meta.local_figures?.length || meta.figures?.length || 0} 张图)
                {meta.local_figures && meta.local_figures.length > 0 && (
                  <span style={{ color: "#10B981", marginLeft: "4px" }}>已下载</span>
                )}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {(meta.local_figures || meta.figures || []).map((fig, idx) => {
                // Build image URL with proxy to avoid CORS
                let imageUrl: string;
                const localPath = (fig as { local_path?: string }).local_path;
                const remoteUrl = (fig as { url: string }).url;

                if (localPath) {
                  // Use local file API
                  imageUrl = `http://127.0.0.1:8765/api/literature/file?path=${encodeURIComponent(localPath)}`;
                } else if (remoteUrl) {
                  // Use proxy to avoid CORS issues with arxiv
                  imageUrl = `http://127.0.0.1:8765/api/proxy/image?url=${encodeURIComponent(remoteUrl)}`;
                } else {
                  imageUrl = '';
                }

                return (
                  <div
                    key={idx}
                    style={{
                      width: "100%",
                      borderRadius: "var(--radius-lg)",
                      overflow: "hidden",
                      border: "1px solid var(--border-light)",
                      background: "var(--bg-hover)",
                    }}
                  >
                  <div style={{ position: "relative", paddingTop: "56.25%", background: "var(--bg-app)" }}>
                    <a
                      href={paper.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <img
                        src={imageUrl}
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
                          const img = e.target as HTMLImageElement;
                          img.style.display = "none";
                        }}
                      />
                      <div
                        className="figure-fallback"
                        style={{
                          display: "none",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: "8px",
                          color: "var(--text-secondary)",
                          fontSize: "0.875rem",
                          textAlign: "center",
                          padding: "16px",
                        }}
                      >
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <rect x="3" y="3" width="18" height="18" rx="2" />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <path d="M21 15l-5-5L5 21" />
                        </svg>
                        <span>查看论文图片</span>
                      </div>
                    </a>
                    <style>{`
                      .figure-fallback:has(~ img[style*="display: none"]) {
                        display: flex !important;
                      }
                    `}</style>
                  </div>
                    {fig.caption && (
                      <div style={{ padding: "8px 12px", fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.4 }}>
                        {fig.caption}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

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

// S2 Paper Card Component
function S2PaperCard({
  paper,
  isSaved,
  onSave,
  hasLiteraturePath,
}: {
  paper: SemanticScholarPaper;
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

  const relationshipColor = meta.relationship === "citation" ? "#10B981" : "#6366F1";
  const relationshipLabel = meta.relationship_label || (meta.relationship === "citation" ? "引用文献" : "参考文献");

  // Figures gallery component
  const renderFiguresGallery = () => {
    if (!meta.local_figures || meta.local_figures.length === 0) return null;
    return (
      <div style={{ marginTop: "16px" }}>
        <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          已保存图表 ({meta.local_figures.length}张)
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {meta.local_figures.map((fig, idx) => (
            <div
              key={idx}
              style={{
                width: "120px",
                height: "90px",
                borderRadius: "var(--radius-md)",
                overflow: "hidden",
                border: "1px solid var(--border-light)",
                cursor: "pointer",
                position: "relative",
              }}
              onClick={() => window.open(fig.local_path, '_blank')}
            >
              <img
                src={fig.local_path}
                alt={fig.caption}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
              <div style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                padding: "4px 6px",
                background: "rgba(0,0,0,0.6)",
                fontSize: "0.625rem",
                color: "white",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}>
                {fig.caption}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
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

            {/* Authors & Year */}
            <div style={{ display: "flex", alignItems: "center", gap: "16px", marginTop: "8px", flexWrap: "wrap" }}>
              {authors.length > 0 && (
                <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "4px" }}>
                  <User style={{ width: "12px", height: "12px" }} />
                  {authors.slice(0, 3).join(", ")}
                  {authors.length > 3 && ` +${authors.length - 3}`}
                </span>
              )}
              {meta.year && (
                <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "4px" }}>
                  <Calendar style={{ width: "12px", height: "12px" }} />
                  {meta.year}
                </span>
              )}
              {meta.citation_count !== undefined && (
                <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "4px" }}>
                  <Star style={{ width: "12px", height: "12px" }} />
                  被引 {meta.citation_count} 次
                </span>
              )}
              {/* Relationship Badge */}
              <span
                style={{
                  fontSize: "0.75rem",
                  padding: "2px 10px",
                  borderRadius: "var(--radius-full)",
                  background: `${relationshipColor}20`,
                  color: relationshipColor,
                  fontWeight: 600,
                }}
              >
                {relationshipLabel}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
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
        {renderFiguresGallery()}

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
