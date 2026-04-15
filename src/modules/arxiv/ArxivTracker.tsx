import { useState, useEffect, useMemo, useRef } from "react";
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
  Download,
  ChevronDown,
  ChevronUp,
  Check,
  Cpu,
  GitBranch,
  Square,
  Image as ImageIcon,
} from "lucide-react";
import { PageContainer, PageHeader, PageContent, Card, EmptyState } from "../../components/Layout";
import { api } from "../../core/api";
import { useToast } from "../../components/Toast";
import { useStore } from "../../core/store";
import PaperMonitorPanel from "./PaperMonitorPanel";

type PaperFigureAsset = {
  url?: string;
  caption: string;
  is_method?: boolean;
  local_path?: string;
  original_url?: string;
  filename?: string;
};

const API_BASE = "http://127.0.0.1:8765";

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
    figures?: PaperFigureAsset[];
    figures_dir?: string;
    local_figures?: PaperFigureAsset[];
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
    "pdf-url"?: string;
    "html-url"?: string;
    relationship?: string;
    relationship_label?: string;
    source_arxiv_id?: string;
    source_paper_title?: string;
    published?: string;
    venue?: string;
    figures?: PaperFigureAsset[];
    local_figures?: PaperFigureAsset[];
  };
}

interface CrawlProgress {
  current: number;
  total: number;
  phase: "fetching" | "processing" | "complete";
  message?: string;
  currentPaperTitle?: string;
}

function normalizePaperFigures(figures: PaperFigureAsset[] | undefined): PaperFigureAsset[] {
  if (!figures?.length) return [];

  const seen = new Set<string>();
  return figures.flatMap((figure, index) => {
    const key = figure.local_path || figure.url || figure.original_url || figure.filename || `figure-${index}`;
    if (!key || seen.has(key)) return [];
    seen.add(key);
    return [
      {
        ...figure,
        caption: figure.caption || `Figure ${index + 1}`,
      },
    ];
  });
}

function normalizeArxivFigureUrl(url: string): string {
  if (!url.startsWith("http")) return url;

  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "arxiv.org") return url;

    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts[0] !== "html" || parts.length < 3) return url;

    const docId = parts[1];
    const nested = parts[2];
    if (nested === docId || nested.startsWith(`${docId}v`)) {
      parsed.pathname = `/html/${parts.slice(2).join("/")}`;
      return parsed.toString();
    }
  } catch {
    return url;
  }

  return url;
}

function getPaperFigureRemoteUrl(figure: PaperFigureAsset): string {
  const remoteUrl = figure.original_url || figure.url || "";
  return normalizeArxivFigureUrl(remoteUrl);
}

function getPaperFigureImageUrl(figure: PaperFigureAsset): string {
  if (figure.local_path) {
    return `${API_BASE}/api/literature/file?path=${encodeURIComponent(figure.local_path)}`;
  }

  const remoteUrl = getPaperFigureRemoteUrl(figure);
  if (!remoteUrl) return "";
  if (remoteUrl.startsWith("data:image/")) return remoteUrl;
  if (remoteUrl.startsWith(`${API_BASE}/api/proxy/image?url=`)) return remoteUrl;
  return `${API_BASE}/api/proxy/image?url=${encodeURIComponent(remoteUrl)}`;
}

function getPaperFigureTargetUrl(figure: PaperFigureAsset, fallbackUrl: string): string {
  const remoteUrl = getPaperFigureRemoteUrl(figure);
  if (remoteUrl.startsWith("data:image/")) return fallbackUrl;
  return remoteUrl || getPaperFigureImageUrl(figure) || fallbackUrl;
}

function PaperFigureStrip({
  figures,
  fallbackUrl,
}: {
  figures: PaperFigureAsset[];
  fallbackUrl: string;
}) {
  if (!figures.length) return null;

  return (
    <div style={{ marginBottom: "16px" }}>
      <div
        style={{
          display: "flex",
          gap: "16px",
          overflowX: "auto",
          paddingBottom: "12px",
          scrollbarWidth: "thin",
        }}
      >
        {figures.map((figure, index) => {
          const imageUrl = getPaperFigureImageUrl(figure);
          const targetUrl = getPaperFigureTargetUrl(figure, fallbackUrl);
          return (
            <div
              key={`${targetUrl}-${index}`}
              style={{
                flexShrink: 0,
                width: "480px",
                borderRadius: "var(--radius-md)",
                overflow: "hidden",
                border: "1px solid var(--border-light)",
                background: "var(--bg-card)",
              }}
            >
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={figure.caption}
                  style={{
                    width: "100%",
                    height: "280px",
                    objectFit: "contain",
                    background: "var(--bg-hover)",
                    cursor: "pointer",
                  }}
                  onClick={() => window.open(targetUrl, "_blank")}
                  loading="lazy"
                />
              ) : (
                <a
                  href={fallbackUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "100%",
                    height: "280px",
                    background: "var(--bg-hover)",
                    color: "var(--text-muted)",
                    textDecoration: "none",
                    fontSize: "0.875rem",
                    fontWeight: 600,
                  }}
                >
                  查看论文图片
                </a>
              )}
              <div
                style={{
                  padding: "10px 12px",
                  fontSize: "0.8125rem",
                  color: "var(--text-muted)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  background: "var(--bg-card)",
                }}
              >
                {figure.caption}
                {figure.is_method && (
                  <span
                    style={{
                      marginLeft: "8px",
                      padding: "3px 8px",
                      borderRadius: "4px",
                      background: "var(--color-primary)",
                      color: "white",
                      fontSize: "0.6875rem",
                      fontWeight: 600,
                    }}
                  >
                    架构图
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getSemanticScholarTimestamp(paper: SemanticScholarPaper): number {
  const published = paper.metadata?.published;
  if (published) {
    const timestamp = new Date(published).getTime();
    if (Number.isFinite(timestamp)) return timestamp;
  }

  const year = paper.metadata?.year;
  if (typeof year === "number" && year > 0) {
    return new Date(year, 0, 1).getTime();
  }

  return 0;
}

export default function ArxivTracker() {
  const {
    config,
    arxivAndPapers,
    arxivAndCrawling,
    arxivAndProgress,
    arxivAndKeywords,
    arxivTrackerActiveTab,
    semanticScholarPapers: storedSemanticScholarPapers,
    semanticScholarCrawling,
    semanticScholarProgress,
    semanticScholarQuery,
    semanticScholarMaxResultsInput,
    semanticScholarDaysBackInput,
    semanticScholarSortBy,
    setArxivAndPapers,
    setArxivAndCrawling,
    setArxivAndProgress,
    setArxivAndKeywords,
    setArxivTrackerActiveTab,
    setSemanticScholarPapers,
    setSemanticScholarCrawling,
    setSemanticScholarProgress,
    setSemanticScholarQuery,
    setSemanticScholarMaxResultsInput,
    setSemanticScholarDaysBackInput,
    setSemanticScholarSortBy,
  } = useStore();
  const s2Papers = storedSemanticScholarPapers as SemanticScholarPaper[];

  // 通用状态
  const [savedPapers, setSavedPapers] = useState<Set<string>>(new Set());
  const [_savedS2Papers, _setSavedS2Papers] = useState<Set<string>>(new Set());
  const [savingS2PaperId, setSavingS2PaperId] = useState<string | null>(null);
  const [autoSave, setAutoSave] = useState(false);
  const [csOnly, setCsOnly] = useState(true);
  const [searchMaxResults, setSearchMaxResults] = useState(50);
  const [searchDaysBack, setSearchDaysBack] = useState(180);

  const toast = useToast();
  const wsRef = useRef<WebSocket | null>(null);
  const wsConnectedRef = useRef<boolean>(false);
  const saveSinglePaperRef = useRef<((paper: ArxivPaper) => Promise<void>) | null>(null);

  // WebSocket 连接 - 使用 ref 来避免依赖问题，确保事件处理始终可用
  const autoSaveRef = useRef(autoSave);

  useEffect(() => {
    autoSaveRef.current = autoSave;
  }, [autoSave]);

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
          const isSemanticScholarEvent = data.module === "semantic-scholar-tracker";

          console.log("[arXiv] WS message:", data.type, data);

          if (data.type === "crawl_started" && !isSemanticScholarEvent) {
            // Store session ID for cancellation
            if (data.session_id) {
              setCrawlSessionId(data.session_id);
              crawlSessionIdRef.current = data.session_id;
            }
          } else if (data.type === "crawl_cancelled" && !isSemanticScholarEvent) {
            toast.info("已取消", data.message || "爬取任务已取消");
            setArxivAndCrawling(false);
            setArxivAndProgress(null);
            crawlingIdRef.current = null;
            setCrawlingMode(null);
            setCrawlSessionId(null);
            crawlSessionIdRef.current = null;
          } else if (data.type === "crawl_progress" && !isSemanticScholarEvent) {
            const progress: CrawlProgress = {
              current: data.current || 0,
              total: data.total || 20,
              phase: data.phase,
              message: data.message,
              currentPaperTitle: data.currentPaperTitle,
            };
            setArxivAndProgress(progress);
          } else if (data.type === "crawl_paper" && !isSemanticScholarEvent) {
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
          } else if (data.type === "crawl_complete" && !isSemanticScholarEvent) {
            console.log("[arXiv] Crawl complete:", data.count);
            toast.success("爬取完成", `共找到 ${data.count} 篇论文`);
            setArxivAndCrawling(false);
            setArxivAndProgress(null);
            crawlingIdRef.current = null;
            setCrawlingMode(null);
          } else if (data.type === "crawl_error" && !isSemanticScholarEvent) {
            console.error("[arXiv] Crawl error:", data.error);
            toast.error("爬取失败", data.error);
            setArxivAndCrawling(false);
            setArxivAndProgress(null);
            crawlingIdRef.current = null;
            setCrawlingMode(null);
          } else if (data.type === "s2_progress") {
            setSemanticScholarProgress({
              current: data.current || 0,
              total: data.total || 20,
              phase: data.phase,
              message: data.message,
              currentPaperTitle: data.currentPaperTitle,
            });
          } else if (data.type === "s2_paper") {
            const store = useStore.getState();
            if (!store.semanticScholarPapers.find((p) => p.id === data.paper.id)) {
              store.appendSemanticScholarPaper(data.paper);
            }
          } else if (data.type === "s2_complete") {
            setSemanticScholarCrawling(false);
            setSemanticScholarProgress(null);
            toast.success("Semantic Scholar 爬取完成", `共获取 ${data.count} 篇相关论文`);
          } else if (data.type === "s2_error") {
            setSemanticScholarCrawling(false);
            setSemanticScholarProgress(null);
            toast.error("Semantic Scholar 爬取失败", data.error);
          }

          // Handle new semantic-scholar-tracker module messages
          if (isSemanticScholarEvent) {
            if (data.type === "crawl_started") {
              setSemanticScholarCrawling(true);
              if (data.session_id) {
                s2SessionIdRef.current = data.session_id;
              }
            } else if (data.type === "crawl_paper") {
              const store = useStore.getState();
              if (!store.semanticScholarPapers.find((p) => p.id === data.paper.id)) {
                store.appendSemanticScholarPaper(data.paper);
              }
            } else if (data.type === "crawl_complete") {
              setSemanticScholarCrawling(false);
              setSemanticScholarProgress(null);
              s2SessionIdRef.current = null;
              toast.success("后续论文爬取完成", `共获取 ${data.count} 篇论文`);
            } else if (data.type === "crawl_error") {
              setSemanticScholarCrawling(false);
              setSemanticScholarProgress(null);
              s2SessionIdRef.current = null;
              toast.error("后续论文爬取失败", data.error);
            } else if (data.type === "crawl_cancelled") {
              setSemanticScholarCrawling(false);
              setSemanticScholarProgress(null);
              s2SessionIdRef.current = null;
              toast.info("已取消爬取");
            } else if (data.type === "crawl_progress") {
              setSemanticScholarProgress({
                current: data.current || 0,
                total: data.total || 0,
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

  const displayedS2Papers = useMemo(() => {
    const papers = [...s2Papers];
    papers.sort((a, b) => {
      if (semanticScholarSortBy === "citation_count") {
        const citationDiff = (b.metadata?.citation_count || 0) - (a.metadata?.citation_count || 0);
        if (citationDiff !== 0) return citationDiff;
      }

      const timeDiff = getSemanticScholarTimestamp(b) - getSemanticScholarTimestamp(a);
      if (timeDiff !== 0) return timeDiff;

      if (semanticScholarSortBy === "recency") {
        return (b.metadata?.citation_count || 0) - (a.metadata?.citation_count || 0);
      }

      return a.title.localeCompare(b.title);
    });
    return papers;
  }, [s2Papers, semanticScholarSortBy]);

  const isMonitorTab = arxivTrackerActiveTab === "monitors";
  const currentPapers = arxivTrackerActiveTab === "search"
    ? arxivAndPapers
    : arxivTrackerActiveTab === "followups"
      ? displayedS2Papers
      : [];
  const isCrawling = arxivTrackerActiveTab === "search"
    ? arxivAndCrawling
    : arxivTrackerActiveTab === "followups"
      ? semanticScholarCrawling
      : false;
  const currentProgress = arxivTrackerActiveTab === "search"
    ? arxivAndProgress
    : arxivTrackerActiveTab === "followups"
      ? semanticScholarProgress
      : null;

  function clearCurrentResults() {
    if (isCrawling) return;
    if (isMonitorTab) return;
    if (arxivTrackerActiveTab === "search") {
      setArxivAndPapers([]);
      setArxivAndProgress(null);
      return;
    }
    setSemanticScholarPapers([]);
    setSemanticScholarProgress(null);
  }

  // Fetch follow-up papers from Semantic Scholar
  async function fetchS2FollowUps() {
    if (!semanticScholarQuery.trim()) {
      toast.error("请输入 arXiv ID 或论文标题", "例如：2501.12345 或 VGGT");
      return;
    }

    const parsedMaxResults = Number(semanticScholarMaxResultsInput.trim());
    const resolvedMaxResults = Number.isFinite(parsedMaxResults) && parsedMaxResults > 0
      ? Math.min(5000, Math.max(1, Math.floor(parsedMaxResults)))
      : null;
    const parsedDaysBack = Number(semanticScholarDaysBackInput.trim());
    const resolvedDaysBack = Number.isFinite(parsedDaysBack) && parsedDaysBack > 0
      ? Math.min(3650, Math.max(1, Math.floor(parsedDaysBack)))
      : null;

    setSemanticScholarCrawling(true);
    setSemanticScholarPapers([]);
    setSemanticScholarProgress({
      current: 0,
      total: resolvedMaxResults ?? 0,
      phase: "fetching",
      message: resolvedMaxResults
        ? `正在查询 Semantic Scholar（最多 ${resolvedMaxResults} 篇）...`
        : "正在查询 Semantic Scholar（全量）...",
    });

    try {
      // Generate session ID for cancellation
      const sessionId = Math.random().toString(36).substring(2, 10);
      s2SessionIdRef.current = sessionId;

      await api.post("/api/modules/semantic-scholar-tracker/crawl", {
        query: semanticScholarQuery.trim(),
        max_results: resolvedMaxResults,
        days_back: resolvedDaysBack,
        sort_by: semanticScholarSortBy,
        session_id: sessionId,
      });
    } catch (err) {
      toast.error("获取失败", err instanceof Error ? err.message : "请稍后重试");
      setSemanticScholarCrawling(false);
      setSemanticScholarProgress(null);
      s2SessionIdRef.current = null;
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
    setSavingS2PaperId(paper.id);
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
        setSemanticScholarPapers(s2Papers.map(p => p.id === paper.id ? updatedPaper : p));
      }

      const figureMsg = result.figures?.length ? ` (${result.figures.length}张图)` : "";
      const pdfMsg = result.pdf ? " +PDF" : "";
      toast.success("保存成功", `已保存到 ${result.folder}${figureMsg}${pdfMsg}`);
    } catch (err) {
      toast.error("保存失败", err instanceof Error ? err.message : "请检查文献库路径");
    } finally {
      setSavingS2PaperId(null);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="论文追踪"
        subtitle="AND/OR 双模式 · CS领域 · 实时进度 · 自动去重"
        icon={BookOpen}
        actions={
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button
              onClick={clearCurrentResults}
              disabled={isCrawling || currentPapers.length === 0}
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
                cursor: isCrawling || currentPapers.length === 0 ? "not-allowed" : "pointer",
                opacity: isCrawling || currentPapers.length === 0 ? 0.6 : 1,
                transition: "all 0.3s ease",
              }}
            >
              <RefreshCw style={{ width: "14px", height: "14px" }} />
              清空本次结果
            </button>
          </div>
        }
      />

      <PageContent maxWidth="1200px">
        {/* Search Tabs */}
        <div
          style={{
            display: "flex",
            gap: "8px",
            alignItems: "stretch",
            marginBottom: "20px",
          }}
        >
          <button
            onClick={() => setArxivTrackerActiveTab("followups")}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              padding: "16px 24px",
              borderRadius: "var(--radius-lg)",
              background: arxivTrackerActiveTab === "followups" ? "var(--color-primary)" : "var(--bg-card)",
              border: `1px solid ${arxivTrackerActiveTab === "followups" ? "transparent" : "var(--border-light)"}`,
              color: arxivTrackerActiveTab === "followups" ? "white" : "var(--text-secondary)",
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
          <button
            onClick={() => setArxivTrackerActiveTab("search")}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              padding: "16px 24px",
              borderRadius: "var(--radius-lg)",
              background: arxivTrackerActiveTab === "search" ? "var(--color-primary)" : "var(--bg-card)",
              border: `1px solid ${arxivTrackerActiveTab === "search" ? "transparent" : "var(--border-light)"}`,
              color: arxivTrackerActiveTab === "search" ? "white" : "var(--text-secondary)",
              fontSize: "0.9375rem",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.3s ease",
            }}
          >
            <Search style={{ width: "18px", height: "18px" }} />
            AI领域论文
            <span style={{ fontSize: "0.75rem", opacity: 0.8 }}>(AND / AND-OR)</span>
          </button>
          <button
            onClick={() => setArxivTrackerActiveTab("monitors")}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              padding: "16px 24px",
              borderRadius: "var(--radius-lg)",
              background: arxivTrackerActiveTab === "monitors" ? "var(--color-primary)" : "var(--bg-card)",
              border: `1px solid ${arxivTrackerActiveTab === "monitors" ? "transparent" : "var(--border-light)"}`,
              color: arxivTrackerActiveTab === "monitors" ? "white" : "var(--text-secondary)",
              fontSize: "0.9375rem",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.3s ease",
            }}
          >
            <GitBranch style={{ width: "18px", height: "18px" }} />
            关注监控
          </button>
        </div>

        {isMonitorTab ? (
          <PaperMonitorPanel />
        ) : (
          <>
            {/* Search Card */}
            <Card style={{ marginBottom: "24px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {arxivTrackerActiveTab === "followups" ? (
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
                    value={semanticScholarQuery}
                    onChange={(e) => setSemanticScholarQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !semanticScholarCrawling && fetchS2FollowUps()}
                    placeholder="输入论文标题或 arXiv ID，如：VGGT 或 2501.12345"
                    disabled={semanticScholarCrawling}
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
                  {semanticScholarCrawling ? (
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
                      disabled={semanticScholarCrawling}
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

                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: "6px", width: "140px" }}>
                    <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                      最大结果数
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={5000}
                      value={semanticScholarMaxResultsInput}
                      onChange={(e) => setSemanticScholarMaxResultsInput(e.target.value)}
                      placeholder="留空=全量"
                      disabled={semanticScholarCrawling}
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
                      最近 N 天
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={3650}
                      value={semanticScholarDaysBackInput}
                      onChange={(e) => setSemanticScholarDaysBackInput(e.target.value)}
                      placeholder="留空=不限"
                      disabled={semanticScholarCrawling}
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

                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                      排序
                    </span>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => setSemanticScholarSortBy("recency")}
                        disabled={semanticScholarCrawling}
                        style={{
                          height: "38px",
                          padding: "0 14px",
                          borderRadius: "var(--radius-md)",
                          border: `1px solid ${semanticScholarSortBy === "recency" ? "var(--color-primary)" : "var(--border-light)"}`,
                          background: semanticScholarSortBy === "recency" ? "rgba(188, 164, 227, 0.12)" : "var(--bg-app)",
                          color: semanticScholarSortBy === "recency" ? "var(--color-primary)" : "var(--text-secondary)",
                          fontSize: "0.875rem",
                          fontWeight: 600,
                          cursor: semanticScholarCrawling ? "not-allowed" : "pointer",
                        }}
                      >
                        最近优先
                      </button>
                      <button
                        type="button"
                        onClick={() => setSemanticScholarSortBy("citation_count")}
                        disabled={semanticScholarCrawling}
                        style={{
                          height: "38px",
                          padding: "0 14px",
                          borderRadius: "var(--radius-md)",
                          border: `1px solid ${semanticScholarSortBy === "citation_count" ? "var(--color-primary)" : "var(--border-light)"}`,
                          background: semanticScholarSortBy === "citation_count" ? "rgba(188, 164, 227, 0.12)" : "var(--bg-app)",
                          color: semanticScholarSortBy === "citation_count" ? "var(--color-primary)" : "var(--text-secondary)",
                          fontSize: "0.875rem",
                          fontWeight: 600,
                          cursor: semanticScholarCrawling ? "not-allowed" : "pointer",
                        }}
                      >
                        被引优先
                      </button>
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
                  提示：默认会把引用该论文的后续研究全量翻页抓完；如果填写最近 N 天，会在抓取结果里按时间过滤并按你选的排序展示。
                </div>
              </>
            ) : (
              // Keyword search UI
              <>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <Search style={{ width: "20px", height: "20px", color: "var(--color-primary)" }} />
                  <span style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text-main)" }}>
                    AI领域论文
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
                        ? arxivTrackerActiveTab === "search"
                          ? "正在获取论文列表..."
                          : "正在查询 Semantic Scholar..."
                        : arxivTrackerActiveTab === "search"
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
                      自动保存到文献库/{arxivTrackerActiveTab === "followups" ? "FollowUps" : "arxiv"} 文件夹
                    </span>
                  </label>
                </div>
              </div>
            </Card>

            {/* Papers List */}
            {currentPapers.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="暂无论文"
                description={
                  arxivTrackerActiveTab === "followups"
                    ? "输入 arXiv ID 点击「查找后续论文」开始搜索"
                    : "输入关键词点击「立即爬取」开始搜索"
                }
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {arxivTrackerActiveTab === "followups"
                  ? displayedS2Papers.map((paper) => (
                      <S2PaperCard
                        key={paper.id}
                        paper={paper}
                        isSaved={_savedS2Papers.has(paper.id)}
                        isSaving={savingS2PaperId === paper.id}
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
          </>
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
                const imageUrl = getPaperFigureImageUrl(fig);

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
  isSaving,
  onSave,
  hasLiteraturePath,
}: {
  paper: SemanticScholarPaper;
  isSaved: boolean;
  isSaving: boolean;
  onSave: () => void;
  hasLiteraturePath: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const score = Math.round(paper.score * 10);
  const meta = paper.metadata || {};
  const authors = meta.authors || [];
  const initialFigures = useMemo(
    () => normalizePaperFigures(meta.local_figures?.length ? meta.local_figures : meta.figures),
    [meta.local_figures, meta.figures],
  );
  const [figures, setFigures] = useState<PaperFigureAsset[]>(initialFigures);
  const [loadingFigures, setLoadingFigures] = useState(false);
  const [figureAttempted, setFigureAttempted] = useState(initialFigures.length > 0);

  const scoreColor = score >= 8 ? "#10B981" : score >= 6 ? "#F59E0B" : "#94A3B8";
  const scoreBg = score >= 8 ? "rgba(16, 185, 129, 0.1)" : score >= 6 ? "rgba(245, 158, 11, 0.1)" : "rgba(148, 163, 184, 0.1)";

  const relationshipColor = meta.relationship === "citation" ? "#10B981" : "#6366F1";
  const relationshipLabel = meta.relationship_label || (meta.relationship === "citation" ? "引用文献" : "参考文献");
  const figureCount = figures.length;
  const hasFigures = figureCount > 0;
  const canLoadFigures = Boolean(meta.arxiv_id);
  const paperLink = meta.arxiv_url || paper.source_url;

  useEffect(() => {
    setFigures(initialFigures);
    setFigureAttempted(initialFigures.length > 0);
  }, [paper.id, initialFigures]);

  const loadFigures = async () => {
    if (!meta.arxiv_id || loadingFigures) return;

    setLoadingFigures(true);
    setFigureAttempted(true);
    try {
      const result = await api.post<{ figures: PaperFigureAsset[] }>("/api/tools/arxiv/figures", {
        arxiv_id: meta.arxiv_id,
      });
      setFigures(normalizePaperFigures(result.figures));
    } catch (error) {
      console.error("Failed to load follow-up paper figures:", error);
    } finally {
      setLoadingFigures(false);
    }
  };

  useEffect(() => {
    if (!figureAttempted && canLoadFigures) {
      void loadFigures();
    }
  }, [figureAttempted, canLoadFigures]);

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
        <div style={{ display: "flex", gap: "16px", marginBottom: "12px" }}>
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
              {meta.published ? (
                <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "4px" }}>
                  <Calendar style={{ width: "12px", height: "12px" }} />
                  {formatDate(meta.published)}
                </span>
              ) : meta.year && (
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
        </div>

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

        {hasFigures && <PaperFigureStrip figures={figures} fallbackUrl={paperLink} />}

        {(meta["pdf-url"] || meta.arxiv_url || hasLiteraturePath || canLoadFigures) && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              flexWrap: "wrap",
              marginBottom: "16px",
            }}
          >
            {meta["pdf-url"] && (
              <a
                href={meta["pdf-url"]}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 16px",
                  borderRadius: "var(--radius-md)",
                  background: "var(--color-primary)",
                  color: "white",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  textDecoration: "none",
                  transition: "all 0.2s ease",
                }}
              >
                <Download style={{ width: "14px", height: "14px" }} />
                PDF
              </a>
            )}
            {meta.arxiv_url && (
              <a
                href={meta.arxiv_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 16px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-light)",
                  background: "var(--bg-card)",
                  color: "var(--text-main)",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  textDecoration: "none",
                  transition: "all 0.2s ease",
                }}
              >
                <ExternalLink style={{ width: "14px", height: "14px" }} />
                arXiv
              </a>
            )}
            {canLoadFigures && (
              <button
                onClick={() => void loadFigures()}
                disabled={loadingFigures}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 16px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-light)",
                  background: hasFigures ? "var(--bg-hover)" : "var(--bg-card)",
                  color: hasFigures ? "var(--text-muted)" : "var(--text-main)",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  cursor: loadingFigures ? "not-allowed" : "pointer",
                  transition: "all 0.2s ease",
                }}
              >
                {loadingFigures ? (
                  <>
                    <span className="animate-spin">⟳</span>
                    加载图片...
                  </>
                ) : (
                  <>
                    <ImageIcon style={{ width: "14px", height: "14px" }} />
                    {hasFigures ? `已加载 ${figureCount} 张图` : "获取图片"}
                  </>
                )}
              </button>
            )}
            {hasLiteraturePath && (
              <button
                onClick={onSave}
                disabled={isSaved || isSaving}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 16px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-light)",
                  background: "var(--bg-card)",
                  color: isSaved ? "#10B981" : "var(--color-primary)",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  cursor: isSaved || isSaving ? "not-allowed" : "pointer",
                  transition: "all 0.2s ease",
                }}
              >
                {isSaving ? (
                  <>
                    <span className="animate-spin">⟳</span>
                    保存中...
                  </>
                ) : isSaved ? (
                  <>
                    <Check style={{ width: "14px", height: "14px" }} />
                    已保存到文献库
                  </>
                ) : (
                  <>
                    <Save style={{ width: "14px", height: "14px" }} />
                    保存到文献库
                  </>
                )}
              </button>
            )}
          </div>
        )}

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
