import { useState, useEffect, useRef } from "react";
import type React from "react";
import {
  Search,
  MessageCircle,
  TrendingUp,
  Heart,
  ExternalLink,
  Filter,
  Users,
  Zap,
  ChevronDown,
  ChevronUp,
  BookOpen,
  Cookie,
  AlertCircle,
  CheckCircle,
  Image as ImageIcon,
  PlayCircle,
  X,
  Save,
  FolderDown,
  Trash2,
} from "lucide-react";
import { PageContainer, PageHeader, PageContent, Card, EmptyState } from "../../components/Layout";
import { api } from "../../core/api";
import { useToast } from "../../components/Toast";
import { CookieGuide } from "../../components/ConfigHelp";
import {
  type CrawlNoteResponse,
  type CrawlBatchResponse,
  type XHSTaskStatus,
  type XHSAuthorCandidate,
  xiaohongshuGetConfig,
  xiaohongshuGetTaskStatus,
  xiaohongshuGetCookieFromBrowser,
  xiaohongshuListTasks,
  xiaohongshuSaveConfig,
  xiaohongshuSavePreviews,
  xiaohongshuSyncAuthorsToTracker,
  xiaohongshuStartAuthorCandidatesTask,
  xiaohongshuStartCommentsTask,
  xiaohongshuStartCrawlBatchTask,
  xiaohongshuStartCrawlNoteTask,
  xiaohongshuStartFollowingFeedTask,
  xiaohongshuStartSearchTask,
  xiaohongshuVerifyCookie,
} from "../../api/xiaohongshu";

interface XHSNote {
  id: string;
  title: string;
  content: string;
  author: string;
  likes: number;
  collects: number;
  comments_count: number;
  url: string;
  published_at: string | null;
  cover_image?: string | null;
  note_type?: string;
  images?: string[];
  video_url?: string | null;
  xsec_token?: string;
  xsec_source?: string;
  comments_preview?: XHSComment[];
}

interface XHSComment {
  id: string;
  author: string;
  content: string;
  likes: number;
  is_top: boolean;
}

interface SearchResponse {
  keyword: string;
  total_found: number;
  notes: XHSNote[];
}

interface CommentsResponse {
  note_id: string;
  total_comments: number;
  sort_by: string;
  comments: XHSComment[];
}

type TabType = "search" | "collections" | "following";
type AlbumCrawlMode = "incremental" | "full";

interface FollowingFeedResponse {
  total_found: number;
  notes: Array<XHSNote & { matched_keywords?: string[] }>;
}

interface XHSAlbumPreview {
  board_id: string;
  name: string;
  count: number | null;
  url: string;
  preview_image?: string;
  latest_title?: string;
  seen_count?: number;
  new_estimate?: number | null;
}

interface XHSAlbumListResponse {
  success: boolean;
  albums: XHSAlbumPreview[];
  total: number;
  progress_path: string;
  message: string;
}

interface XHSAlbumCrawlResponse {
  success: boolean;
  saved: number;
  skipped: number;
  failed: number;
  progress_path: string;
  results: Array<{
    success: boolean;
    album?: string;
    board_id?: string;
    found?: number;
    saved?: number;
    skipped?: number;
    error?: string;
  }>;
}

interface XHSCreatorProfile {
  author?: string;
  author_id?: string;
  smart_groups?: string[];
  latest_title?: string;
  sample_titles?: string[];
  sample_albums?: string[];
  sample_tags?: string[];
  source_summary?: string;
}

export function XiaohongshuTool() {
  const [activeTab, setActiveTab] = useState<TabType>("search");
  const toast = useToast();

  // Cookie config state
  const [webSession, setWebSession] = useState(() => localStorage.getItem("xiaohongshu_websession") || "");
  const [idToken, setIdToken] = useState(() => localStorage.getItem("xiaohongshu_idtoken") || "");
  const [fullCookie, setFullCookie] = useState(() => localStorage.getItem("xiaohongshu_full_cookie") || "");
  const [cookieVerified, setCookieVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [gettingCookie, setGettingCookie] = useState(false);
  const [showManualCookie, setShowManualCookie] = useState(false);
  const [showFullCookie, setShowFullCookie] = useState(false);
  const [showCookieModal, setShowCookieModal] = useState(false);
  const [backendCookieConfigured, setBackendCookieConfigured] = useState(false);

  // Search state
  const [searchKeyword, setSearchKeyword] = useState("");
  const [sortBy, setSortBy] = useState<"likes" | "time">("likes");
  const [minLikes, setMinLikes] = useState(100);
  const [searchLimit, setSearchLimit] = useState(20);
  const [searchResult, setSearchResult] = useState<SearchResponse | null>(null);
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());

  // Comments state
  const [noteId, setNoteId] = useState("");
  const [commentsResult, setCommentsResult] = useState<CommentsResponse | null>(null);
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());

  // Following feed state
  const [followingKeywords, setFollowingKeywords] = useState("");
  const [followingLimit, setFollowingLimit] = useState(50);
  const [followingResult, setFollowingResult] = useState<FollowingFeedResponse | null>(null);

  // Crawl state
  const [crawlUrl, setCrawlUrl] = useState("");
  const [includeImages, setIncludeImages] = useState(false);
  const [includeVideo, setIncludeVideo] = useState(false);
  const [includeLivePhoto, setIncludeLivePhoto] = useState(false);
  const [includeComments, setIncludeComments] = useState(false);
  const [commentsLimit, setCommentsLimit] = useState(20);
  const [crawlResult, setCrawlResult] = useState<CrawlNoteResponse | null>(null);
  const [batchUrls, setBatchUrls] = useState("");
  const [batchResult, setBatchResult] = useState<CrawlBatchResponse | null>(null);

  // Album collection state
  const [albums, setAlbums] = useState<XHSAlbumPreview[]>(() => {
    try {
      const saved = localStorage.getItem("xiaohongshu_album_cache");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [selectedAlbumIds, setSelectedAlbumIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem("xiaohongshu_album_cache");
      const parsed = saved ? JSON.parse(saved) : [];
      return new Set(Array.isArray(parsed) ? parsed.map((album: XHSAlbumPreview) => album.board_id).filter(Boolean) : []);
    } catch {
      return new Set();
    }
  });
  const [albumCrawlMode, setAlbumCrawlMode] = useState<AlbumCrawlMode>("full");
  const [albumResult, setAlbumResult] = useState<XHSAlbumCrawlResponse | null>(null);
  const [albumRecentDaysInput, setAlbumRecentDaysInput] = useState("180");
  const [albumCrawlDelay, setAlbumCrawlDelay] = useState(8);
  const [albumProgress, setAlbumProgress] = useState<any | null>(null);
  const [albumListProgress, setAlbumListProgress] = useState<any | null>(null);
  const [albumListTaskId, setAlbumListTaskId] = useState<string | null>(null);
  const [albumCrawlTaskId, setAlbumCrawlTaskId] = useState<string | null>(null);
  const albumListTimerRef = useRef<number | null>(null);
  const albumCrawlTimerRef = useRef<number | null>(null);
  const [trackerKeywords, setTrackerKeywords] = useState<string[]>([]);
  const [trackerMaxResults, setTrackerMaxResults] = useState(20);
  const [trackerKeywordMinLikes, setTrackerKeywordMinLikes] = useState(500);
  const [trackerKeywordLimit, setTrackerKeywordLimit] = useState(10);
  const [trackerEnableKeywordSearch, setTrackerEnableKeywordSearch] = useState(true);
  const [trackerFollowFeed, setTrackerFollowFeed] = useState(false);
  const [trackerFollowLimit, setTrackerFollowLimit] = useState(20);
  const [trackerUserIds, setTrackerUserIds] = useState<string[]>([]);
  const [disabledCreatorIds, setDisabledCreatorIds] = useState<Set<string>>(new Set());
  const [trackerCreatorProfiles, setTrackerCreatorProfiles] = useState<Record<string, XHSCreatorProfile>>({});
  const [trackerCreatorPushEnabled, setTrackerCreatorPushEnabled] = useState(true);
  const [authorCandidates, setAuthorCandidates] = useState<XHSAuthorCandidate[]>([]);
  const [selectedAuthors, setSelectedAuthors] = useState<Set<string>>(new Set());
  const [authorCandidateMeta, setAuthorCandidateMeta] = useState<{ totalNotes: number; message: string } | null>(null);
  const [activeTaskKinds, setActiveTaskKinds] = useState<Set<string>>(new Set());
  const [backgroundTask, setBackgroundTask] = useState<{ kind: string; stage: string; taskId: string } | null>(null);
  const [taskHistory, setTaskHistory] = useState<XHSTaskStatus[]>([]);
  const [showTaskHistory, setShowTaskHistory] = useState(false);
  const [taskHistoryQuery, setTaskHistoryQuery] = useState("");
  const [taskHistoryPage, setTaskHistoryPage] = useState(0);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [expandedPushes, setExpandedPushes] = useState<Set<string>>(new Set(["creator"]));

  const compactControlStyle = {
    padding: "10px 12px",
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--border-light)",
    background: "var(--bg-card)",
    color: "var(--text-main)",
    fontSize: "0.875rem",
    lineHeight: 1.2,
    outline: "none",
    boxShadow: "none",
  };

  const segmentedButtonStyle = (active: boolean): React.CSSProperties => ({
    padding: "8px 12px",
    borderRadius: "var(--radius-sm)",
    border: `1px solid ${active ? "var(--color-primary)" : "var(--border-light)"}`,
    background: active ? "var(--color-primary)" : "transparent",
    color: active ? "white" : "var(--text-main)",
    fontSize: "0.875rem",
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.15s ease",
  });

  const hasCookie = Boolean(fullCookie.trim() || webSession.trim() || backendCookieConfigured);

  useEffect(() => {
    return () => {
      if (albumListTimerRef.current) window.clearInterval(albumListTimerRef.current);
      if (albumCrawlTimerRef.current) window.clearInterval(albumCrawlTimerRef.current);
    };
  }, []);

  const switchStyle = (active: boolean): React.CSSProperties => ({
    width: "42px",
    height: "24px",
    borderRadius: "999px",
    border: "none",
    background: active ? "var(--color-primary)" : "var(--text-muted)",
    position: "relative",
    cursor: "pointer",
    transition: "background 0.18s ease",
    flexShrink: 0,
  });

  const switchKnobStyle = (active: boolean): React.CSSProperties => ({
    width: "18px",
    height: "18px",
    borderRadius: "50%",
    background: "white",
    position: "absolute",
    top: "3px",
    left: active ? "21px" : "3px",
    transition: "left 0.18s ease",
    boxShadow: "0 1px 4px rgba(15, 23, 42, 0.18)",
  });

  const refreshTrackerConfig = async () => {
    const config = await api.get<any>("/api/modules/xiaohongshu-tracker/config");
    setTrackerKeywords(config.keywords || []);
    setTrackerMaxResults(config.max_results ?? 20);
    setTrackerKeywordMinLikes(config.keyword_min_likes ?? 500);
    setTrackerKeywordLimit(config.keyword_search_limit ?? 10);
    setTrackerEnableKeywordSearch(config.enable_keyword_search ?? true);
    setTrackerFollowFeed(Boolean(config.follow_feed));
    setTrackerFollowLimit(config.fetch_follow_limit ?? 20);
    setTrackerUserIds(config.user_ids || []);
    setDisabledCreatorIds(new Set(config.disabled_creator_ids || []));
    setTrackerCreatorProfiles(config.creator_profiles || {});
    setTrackerCreatorPushEnabled(config.creator_push_enabled ?? true);
  };

  // Persist cookies
  useEffect(() => {
    if (webSession) {
      localStorage.setItem("xiaohongshu_websession", webSession);
    } else {
      localStorage.removeItem("xiaohongshu_websession");
    }
  }, [webSession]);

  useEffect(() => {
    if (idToken) {
      localStorage.setItem("xiaohongshu_idtoken", idToken);
    } else {
      localStorage.removeItem("xiaohongshu_idtoken");
    }
  }, [idToken]);

  useEffect(() => {
    if (fullCookie) {
      localStorage.setItem("xiaohongshu_full_cookie", fullCookie);
    } else {
      localStorage.removeItem("xiaohongshu_full_cookie");
    }
  }, [fullCookie]);

  useEffect(() => {
    if (albums.length > 0) {
      localStorage.setItem("xiaohongshu_album_cache", JSON.stringify(albums));
    }
  }, [albums]);

  useEffect(() => {
    void (async () => {
      try {
        const config = await xiaohongshuGetConfig();
        const configured = Boolean(config.cookie_configured);
        setBackendCookieConfigured(configured);
        if (configured || fullCookie.trim() || webSession.trim()) {
          setCookieVerified(true);
        } else {
          setShowCookieModal(true);
        }
      } catch {
        if (!fullCookie.trim() && !webSession.trim()) {
          setShowCookieModal(true);
        }
      }
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const result = await xiaohongshuListTasks(20);
        setTaskHistory(result.tasks || []);
      } catch {
        // ignore
      }
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await refreshTrackerConfig();
      } catch {
        // ignore
      }
    })();
  }, []);

  const buildCookie = () => {
    if (fullCookie.trim()) return fullCookie.trim();
    const parts = [];
    if (webSession.trim()) parts.push(`web_session=${webSession.trim()}`);
    if (idToken.trim()) parts.push(`id_token=${idToken.trim()}`);
    return parts.join("; ");
  };

  const requireCookie = (message = "请先配置 Cookie") => {
    if (hasCookie) return true;
    setShowCookieModal(true);
    toast.error(message);
    return false;
  };

  const isTaskRunning = (kind: string) => activeTaskKinds.has(kind);

  const setTaskRunning = (kind: string, running: boolean) => {
    setActiveTaskKinds((prev) => {
      const next = new Set(prev);
      if (running) next.add(kind);
      else next.delete(kind);
      return next;
    });
  };

  const searchRunning = isTaskRunning("search");
  const commentsRunning = isTaskRunning("comments");
  const followingRunning = isTaskRunning("following-feed");
  const crawlNoteRunning = isTaskRunning("crawl-note");
  const crawlBatchRunning = isTaskRunning("crawl-batch");
  const previewSaveRunning = isTaskRunning("save-previews");

  const runBackgroundTask = async <T,>(
    kind: string,
    start: () => Promise<{ success: boolean; task_id: string }>,
    onComplete: (result: T) => void,
    successMessage: (result: T) => { title: string; description?: string },
  ) => {
    if (isTaskRunning(kind)) {
      toast.info("任务正在执行", "同类型任务完成后再启动新的。");
      return;
    }
    setTaskRunning(kind, true);
    try {
      const started = await start();
      setBackgroundTask({ kind, stage: "任务已创建", taskId: started.task_id });
      setTaskHistory((prev) => [
        {
          task_id: started.task_id,
          kind,
          status: "running" as const,
          stage: "任务已创建",
          result: null,
          error: null,
        },
        ...prev.filter((item) => item.task_id !== started.task_id),
      ].slice(0, 20));

      const poll = async () => {
        try {
          const progress = await xiaohongshuGetTaskStatus<T>(started.task_id);
          setBackgroundTask({ kind, stage: progress.stage, taskId: started.task_id });
          if (progress.status === "completed" && progress.result) {
            onComplete(progress.result);
            const msg = successMessage(progress.result);
            toast.success(msg.title, msg.description);
            setTaskHistory((prev) => [progress, ...prev.filter((item) => item.task_id !== progress.task_id)].slice(0, 20));
            setBackgroundTask(null);
            setTaskRunning(kind, false);
            return;
          }
          if (progress.status === "failed") {
            toast.error("后台任务失败", progress.error || "未知错误");
            setTaskHistory((prev) => [progress, ...prev.filter((item) => item.task_id !== progress.task_id)].slice(0, 20));
            setBackgroundTask(null);
            setTaskRunning(kind, false);
            return;
          }
          window.setTimeout(poll, 1000);
        } catch (err) {
          toast.error("读取后台进度失败", err instanceof Error ? err.message : "未知错误");
          setBackgroundTask(null);
          setTaskRunning(kind, false);
        }
      };

      window.setTimeout(poll, 300);
    } catch (err) {
      setTaskRunning(kind, false);
      setBackgroundTask(null);
      throw err;
    }
  };

  const handleGetCookieFromBrowser = async () => {
    setGettingCookie(true);
    try {
      const res = await xiaohongshuGetCookieFromBrowser();
      if (!res.success) {
        toast.error("一键获取失败", res.error || "请先在本机浏览器登录小红书");
        return;
      }

      if (res.cookie) setFullCookie(res.cookie);
      if (res.web_session) setWebSession(res.web_session);
      if (res.id_token) setIdToken(res.id_token);
      setBackendCookieConfigured(true);
      setCookieVerified(Boolean(res.web_session || res.cookie));
      setShowCookieModal(false);
      toast.success("Cookie 已保存", res.message || `获取到 ${res.cookie_count || 0} 个 Cookie`);
    } catch (err) {
      toast.error("一键获取失败", err instanceof Error ? err.message : "请检查浏览器是否已登录");
    } finally {
      setGettingCookie(false);
    }
  };

  const handleVerifyCookie = async () => {
    if (!webSession.trim()) {
      toast.error("请输入 web_session");
      return;
    }
    setVerifying(true);
    try {
      const res = await xiaohongshuVerifyCookie({
        web_session: webSession.trim(),
        id_token: idToken.trim() || undefined,
      });
      if (res.valid) {
        const cookieToSave = buildCookie();
        if (cookieToSave) {
          await xiaohongshuSaveConfig({ cookie: cookieToSave });
        }
        setCookieVerified(true);
        setBackendCookieConfigured(true);
        setShowCookieModal(false);
        toast.success("Cookie 验证成功", res.message);
      } else {
        setCookieVerified(false);
        toast.error("Cookie 验证失败", res.message);
      }
    } catch (err) {
      setCookieVerified(false);
      toast.error("验证失败", err instanceof Error ? err.message : "未知错误");
    } finally {
      setVerifying(false);
    }
  };

  const handleSearch = async () => {
    if (!searchKeyword.trim()) {
      toast.error("请输入关键词");
      return;
    }
    if (!requireCookie()) {
      return;
    }
    try {
      await runBackgroundTask<SearchResponse>(
        "search",
        () => xiaohongshuStartSearchTask({
          keyword: searchKeyword.trim(),
          max_results: Math.max(1, Math.min(300, searchLimit || 20)),
          min_likes: minLikes,
          sort_by: sortBy,
          cookie: buildCookie() || undefined,
        }),
        (result) => setSearchResult(result),
        (result) => ({ title: `找到 ${result.total_found} 条结果` }),
      );
    } catch (e) {
      console.error("Search failed:", e);
      toast.error("搜索失败", e instanceof Error ? e.message : "请先配置有效的 Cookie");
    }
  };

  const handleComments = async () => {
    if (!noteId.trim()) {
      toast.error("请输入笔记 ID");
      return;
    }
    if (!requireCookie()) {
      return;
    }
    try {
      const raw = noteId.trim();
      const noteUrl = raw.startsWith("http://") || raw.startsWith("https://") ? raw : undefined;
      const normalizedId = noteUrl ? raw.split("/explore/").pop()?.split("?")[0] || raw : raw;
      await runBackgroundTask<CommentsResponse>(
        "comments",
        () => xiaohongshuStartCommentsTask({
          note_id: normalizedId,
          note_url: noteUrl,
          max_comments: 50,
          sort_by: "likes",
          cookie: buildCookie() || undefined,
        }),
        (result) => setCommentsResult(result),
        (result) => ({ title: `获取 ${result.total_comments} 条评论` }),
      );
    } catch (e) {
      console.error("Fetch comments failed:", e);
      toast.error("获取评论失败");
    }
  };

  const handleFollowingFeed = async () => {
    if (!followingKeywords.trim()) {
      toast.error("请输入关键词");
      return;
    }
    if (!requireCookie()) {
      return;
    }
    try {
      const keywords = followingKeywords.split(/[,，]/).map(k => k.trim()).filter(Boolean);
      await runBackgroundTask<FollowingFeedResponse>(
        "following-feed",
        () => xiaohongshuStartFollowingFeedTask({
          cookie: buildCookie() || undefined,
          keywords,
          max_notes: Math.max(1, Math.min(300, followingLimit || 50)),
        }),
        (result) => setFollowingResult(result),
        (result) => ({ title: `关注列表中找到 ${result.total_found} 条匹配结果` }),
      );
    } catch (e) {
      console.error("获取关注列表失败:", e);
      toast.error("获取关注列表失败");
    }
  };

  const handleCrawlNote = async () => {
    if (!crawlUrl.trim()) {
      toast.error("请输入小红书笔记链接");
      return;
    }
    if (!requireCookie()) {
      return;
    }
    try {
      await runBackgroundTask<CrawlNoteResponse>(
        "crawl-note",
        () => xiaohongshuStartCrawlNoteTask({
          url: crawlUrl.trim(),
          cookie: buildCookie() || undefined,
          include_images: includeImages,
          include_video: includeVideo,
          include_live_photo: includeLivePhoto,
          include_comments: includeComments,
          comments_limit: commentsLimit,
          use_cdp: true,
        }),
        (result) => setCrawlResult(result),
        (result) => ({ title: "已保存到 xhs", description: result.markdown_path }),
      );
    } catch (e) {
      console.error("Crawl note failed:", e);
      toast.error("入库失败", e instanceof Error ? e.message : "请检查链接、Cookie 或本地浏览器调试端口");
    }
  };

  const handleCrawlBatch = async (urls?: string[]) => {
    const targetUrls = urls || batchUrls.split(/\n+/).map((item) => item.trim()).filter(Boolean);
    if (targetUrls.length === 0) {
      toast.error("请输入至少一个小红书链接");
      return;
    }
    if (!requireCookie()) {
      return;
    }
    try {
      await runBackgroundTask<CrawlBatchResponse>(
        "crawl-batch",
        () => xiaohongshuStartCrawlBatchTask({
          urls: targetUrls,
          cookie: buildCookie() || undefined,
          include_images: includeImages,
          include_video: includeVideo,
          include_live_photo: includeLivePhoto,
          include_comments: includeComments,
          comments_limit: commentsLimit,
          use_cdp: true,
        }),
        (result) => setBatchResult(result),
        (result) => ({ title: "批量入库完成", description: `成功 ${result.saved} 条，失败 ${result.failed} 条` }),
      );
    } catch (e) {
      console.error("Crawl batch failed:", e);
      toast.error("批量入库失败", e instanceof Error ? e.message : "请检查链接或 Cookie");
    }
  };

  const handleSavePreviewNotes = async (notes: XHSNote[]) => {
    const targetNotes = notes.filter((note) => note.url);
    if (targetNotes.length === 0) {
      toast.error("没有可入库的搜索结果");
      return;
    }
    if (previewSaveRunning) {
      toast.info("预览入库正在执行");
      return;
    }
    setTaskRunning("save-previews", true);
    try {
      const result = await xiaohongshuSavePreviews(targetNotes);
      const status: XHSTaskStatus["status"] = result.failed > 0 ? "failed" : "completed";
      toast.success("已保存到 xhs", `成功 ${result.saved} 条，失败 ${result.failed} 条`);
      setTaskHistory((prev) => [
        {
          task_id: `preview-${Date.now()}`,
          kind: "save-previews",
          status,
          stage: `预览入库完成：成功 ${result.saved} 条，失败 ${result.failed} 条`,
          result,
          error: result.failed > 0 ? "部分搜索结果保存失败" : null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        ...prev,
      ].slice(0, 20));
    } catch (e) {
      toast.error("预览入库失败", e instanceof Error ? e.message : "请检查情报库路径");
    } finally {
      setTaskRunning("save-previews", false);
    }
  };

  const handleFetchAlbums = async () => {
    if (albumListTaskId) {
      try {
        await api.post(`/api/tools/xiaohongshu/albums/tasks/${albumListTaskId}/cancel`, {});
        if (albumListTimerRef.current) window.clearInterval(albumListTimerRef.current);
        albumListTimerRef.current = null;
        setAlbumListProgress((prev: any) => ({ ...(prev || {}), status: "cancelled", stage: "已中断" }));
        setAlbumListTaskId(null);
        toast.info("专辑读取已中断");
      } catch (e) {
        toast.error("中断失败", e instanceof Error ? e.message : "未知错误");
      }
      return;
    }
    if (!requireCookie()) {
      return;
    }
    try {
      const started = await api.post<{ success: boolean; task_id: string }>("/api/tools/xiaohongshu/albums/start", {
        cookie: buildCookie() || undefined,
        cdp_port: 9222,
        background: true,
        allow_cdp_fallback: false,
      });
      setAlbumListTaskId(started.task_id);
      setAlbumListProgress({ status: "running", stage: "任务已创建", albums_total: 0 });
      const timer = window.setInterval(async () => {
        try {
          const progress = await api.get<any>(`/api/tools/xiaohongshu/albums/${started.task_id}`);
          setAlbumListProgress(progress);
          if (progress.status === "completed") {
            window.clearInterval(timer);
            albumListTimerRef.current = null;
            const result = progress.result as XHSAlbumListResponse;
            setAlbums(result.albums);
            setSelectedAlbumIds(new Set(result.albums.map((album) => album.board_id)));
            setAlbumListTaskId(null);
            if (result.albums.length > 0) toast.success(`找到 ${result.albums.length} 个专辑`);
            else toast.info("未发现专辑", result.message);
          } else if (progress.status === "cancelled") {
            window.clearInterval(timer);
            albumListTimerRef.current = null;
            setAlbumListTaskId(null);
          } else if (progress.status === "failed") {
            window.clearInterval(timer);
            albumListTimerRef.current = null;
            setAlbumListTaskId(null);
            toast.error("获取专辑失败", progress.error || "未知错误");
          }
        } catch (err) {
          window.clearInterval(timer);
          albumListTimerRef.current = null;
          setAlbumListTaskId(null);
          toast.error("读取进度失败", err instanceof Error ? err.message : "未知错误");
        }
      }, 800);
      albumListTimerRef.current = timer;
    } catch (e) {
      setAlbumListTaskId(null);
      console.error("Fetch albums failed:", e);
      toast.error("获取专辑失败", e instanceof Error ? e.message : "请先在浏览器打开个人主页的收藏专辑页");
    }
  };

  const toggleAlbumSelection = (boardId: string) => {
    setSelectedAlbumIds((prev) => {
      const next = new Set(prev);
      if (next.has(boardId)) next.delete(boardId);
      else next.add(boardId);
      return next;
    });
  };

  const handleCrawlSelectedAlbums = async (mode: AlbumCrawlMode = albumCrawlMode) => {
    if (albumCrawlTaskId) {
      try {
        await api.post(`/api/tools/xiaohongshu/albums/tasks/${albumCrawlTaskId}/cancel`, {});
        if (albumCrawlTimerRef.current) window.clearInterval(albumCrawlTimerRef.current);
        albumCrawlTimerRef.current = null;
        setAlbumProgress((prev: any) => ({ ...(prev || {}), status: "cancelled", stage: "已中断" }));
        setAlbumCrawlTaskId(null);
        toast.info("专辑抓取已中断");
      } catch (e) {
        toast.error("中断失败", e instanceof Error ? e.message : "未知错误");
      }
      return;
    }
    const selected = albums.filter((album) => selectedAlbumIds.has(album.board_id));
    if (selected.length === 0) {
      toast.error("请选择至少一个专辑");
      return;
    }
    if (!requireCookie()) {
      return;
    }
    try {
      const started = await api.post<{ success: boolean; task_id: string }>("/api/tools/xiaohongshu/albums/crawl", {
        albums: selected,
        cookie: buildCookie() || undefined,
        include_images: includeImages,
        include_video: includeVideo,
        include_live_photo: includeLivePhoto,
        include_comments: includeComments,
        comments_limit: commentsLimit,
        recent_days: mode === "full"
          ? undefined
          : (() => {
              const raw = albumRecentDaysInput.trim();
              if (!raw) return 180;
              const next = Number(raw);
              if (!Number.isFinite(next)) return 180;
              return Math.max(1, Math.min(3650, next));
            })(),
        crawl_mode: mode,
        crawl_delay_seconds: Math.max(3, Math.min(8, albumCrawlDelay || 8)),
        cdp_port: 9222,
      });
      setAlbumCrawlTaskId(started.task_id);
      setAlbumProgress({ status: "running", stage: "任务已创建", total_albums: selected.length, saved: 0, skipped: 0, failed: 0 });
      const timer = window.setInterval(async () => {
        try {
          const progress = await api.get<any>(`/api/tools/xiaohongshu/albums/crawl/${started.task_id}`);
          setAlbumProgress(progress);
          if (progress.status === "completed") {
            window.clearInterval(timer);
            albumCrawlTimerRef.current = null;
            setAlbumResult(progress.result);
            setAlbumCrawlTaskId(null);
            toast.success(`专辑${mode === "full" ? "全量" : "增量"}抓取完成`, `新增 ${progress.result.saved} 条，跳过 ${progress.result.skipped} 条`);
            await handleFetchAlbums();
          } else if (progress.status === "cancelled") {
            window.clearInterval(timer);
            albumCrawlTimerRef.current = null;
            setAlbumCrawlTaskId(null);
          } else if (progress.status === "failed") {
            window.clearInterval(timer);
            albumCrawlTimerRef.current = null;
            setAlbumCrawlTaskId(null);
            toast.error("专辑抓取失败", progress.error || "未知错误");
          }
        } catch (err) {
          window.clearInterval(timer);
          albumCrawlTimerRef.current = null;
          setAlbumCrawlTaskId(null);
          toast.error("读取进度失败", err instanceof Error ? err.message : "未知错误");
        }
      }, 1200);
      albumCrawlTimerRef.current = timer;
    } catch (e) {
      setAlbumCrawlTaskId(null);
      console.error("Crawl albums failed:", e);
      toast.error("专辑抓取失败", e instanceof Error ? e.message : "请确认专辑页面可访问");
    }
  };

  const handleSaveTrackerKeywords = async () => {
    try {
      await api.post("/api/modules/xiaohongshu-tracker/config", {
        keywords: trackerKeywords,
        max_results: trackerMaxResults,
        enable_keyword_search: trackerEnableKeywordSearch,
        keyword_min_likes: trackerKeywordMinLikes,
        keyword_search_limit: trackerKeywordLimit,
        follow_feed: trackerFollowFeed,
        fetch_follow_limit: trackerFollowLimit,
      });
      toast.success("关键词推送已保存", "模块管理会按定时任务抓取这些关键词");
      await refreshTrackerConfig();
      setExpandedPushes((prev) => new Set(prev).add("keyword"));
    } catch (e) {
      toast.error("保存失败", e instanceof Error ? e.message : "未知错误");
    }
  };

  const handleToggleKeywordPush = async () => {
    const next = !trackerEnableKeywordSearch;
    try {
      await api.post("/api/modules/xiaohongshu-tracker/config", { enable_keyword_search: next });
      setTrackerEnableKeywordSearch(next);
      toast.success(next ? "关键词推送已开启" : "关键词推送已关闭");
    } catch (e) {
      toast.error("保存失败", e instanceof Error ? e.message : "未知错误");
    }
  };

  const handleDeleteKeywordPush = async () => {
    try {
      await api.post("/api/modules/xiaohongshu-tracker/config", {
        keywords: [],
        enable_keyword_search: false,
      });
      setTrackerKeywords([]);
      setTrackerEnableKeywordSearch(false);
      setExpandedPushes((prev) => {
        const next = new Set(prev);
        next.delete("keyword");
        return next;
      });
      toast.success("关键词推送已删除");
    } catch (e) {
      toast.error("删除失败", e instanceof Error ? e.message : "未知错误");
    }
  };

  const handleToggleCreatorPush = async () => {
    const next = !trackerCreatorPushEnabled;
    try {
      await api.post("/api/modules/xiaohongshu-tracker/config", { creator_push_enabled: next });
      setTrackerCreatorPushEnabled(next);
      toast.success(next ? "博主推送已开启" : "博主推送已关闭");
    } catch (e) {
      toast.error("保存失败", e instanceof Error ? e.message : "未知错误");
    }
  };

  const handleDeleteCreatorPush = async () => {
    try {
      await api.post("/api/modules/xiaohongshu-tracker/config", {
        user_ids: [],
        creator_profiles: {},
        creator_groups: [],
        disabled_creator_ids: [],
        creator_push_enabled: false,
      });
      setTrackerUserIds([]);
      setTrackerCreatorProfiles({});
      setDisabledCreatorIds(new Set());
      setTrackerCreatorPushEnabled(false);
      setExpandedPushes((prev) => {
        const next = new Set(prev);
        next.delete("creator");
        return next;
      });
      toast.success("博主推送已删除");
    } catch (e) {
      toast.error("删除失败", e instanceof Error ? e.message : "未知错误");
    }
  };

  const handleToggleCreatorUser = async (userId: string) => {
    const next = new Set(disabledCreatorIds);
    if (next.has(userId)) next.delete(userId);
    else next.add(userId);
    try {
      await api.post("/api/modules/xiaohongshu-tracker/config", {
        disabled_creator_ids: Array.from(next),
      });
      setDisabledCreatorIds(next);
    } catch (e) {
      toast.error("保存失败", e instanceof Error ? e.message : "未知错误");
    }
  };

  const handleRemoveCreatorUser = async (userId: string) => {
    const nextIds = trackerUserIds.filter((item) => item !== userId);
    const nextProfiles = { ...trackerCreatorProfiles };
    delete nextProfiles[userId];
    const nextDisabled = new Set(disabledCreatorIds);
    nextDisabled.delete(userId);
    try {
      await api.post("/api/modules/xiaohongshu-tracker/config", {
        user_ids: nextIds,
        creator_profiles: nextProfiles,
        disabled_creator_ids: Array.from(nextDisabled),
        creator_push_enabled: nextIds.length > 0 ? trackerCreatorPushEnabled : false,
      });
      setTrackerUserIds(nextIds);
      setTrackerCreatorProfiles(nextProfiles);
      setDisabledCreatorIds(nextDisabled);
      if (nextIds.length === 0) setTrackerCreatorPushEnabled(false);
      toast.success("博主已移除");
    } catch (e) {
      toast.error("删除失败", e instanceof Error ? e.message : "未知错误");
    }
  };

  const handleAnalyzeAuthors = async () => {
    if (!requireCookie("需要 Cookie 才能回查作者 ID")) {
      return;
    }
    try {
      await runBackgroundTask<{
        total_notes: number;
        message: string;
        candidates: XHSAuthorCandidate[];
      }>(
        "author-candidates",
        () => xiaohongshuStartAuthorCandidatesTask({
          cookie: buildCookie() || undefined,
          resolve_author_ids: true,
          resolve_limit: 15,
        }),
        (result) => {
          setAuthorCandidates(result.candidates);
          setAuthorCandidateMeta({ totalNotes: result.total_notes, message: result.message });
          setSelectedAuthors(new Set(result.candidates.filter((item) => item.author_id).slice(0, 10).map((item) => item.author)));
        },
        (result) => ({ title: "博主候选已生成", description: result.message }),
      );
    } catch (e) {
      toast.error("分析失败", e instanceof Error ? e.message : "未知错误");
    }
  };

  const toggleAuthorSelection = (author: string) => {
    setSelectedAuthors((prev) => {
      const next = new Set(prev);
      if (next.has(author)) next.delete(author);
      else next.add(author);
      return next;
    });
  };

  const handleSyncSelectedAuthors = async () => {
    const selected = authorCandidates.filter((item) => selectedAuthors.has(item.author) && item.author_id);
    if (selected.length === 0) {
      toast.error("没有可同步的博主", "请选择已经解析出作者 ID 的候选");
      return;
    }
    try {
      const result = await xiaohongshuSyncAuthorsToTracker(
        selected.map((item) => ({
          author: item.author,
          author_id: item.author_id,
          latest_title: item.latest_title,
          sample_titles: item.sample_titles,
          sample_albums: item.sample_albums || [],
          sample_tags: item.sample_tags || [],
          source_summary: item.source_summary || "",
        }))
      );
      toast.success("已同步到模块管理", `新增 ${result.added_count} 个 user_id，当前总数 ${result.total_user_ids}`);
      await refreshTrackerConfig();
      setExpandedPushes((prev) => new Set(prev).add("creator"));
    } catch (e) {
      toast.error("同步失败", e instanceof Error ? e.message : "未知错误");
    }
  };

  const toggleNoteExpand = (noteId: string) => {
    setExpandedNotes((prev) => {
      const next = new Set(prev);
      if (next.has(noteId)) next.delete(noteId);
      else next.add(noteId);
      return next;
    });
  };

  const renderNoteMedia = (note: XHSNote) => {
    const images = note.images || [];
    const previewImages = images.slice(0, 6);

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "12px" }}>
        {note.video_url && (
          <div
            style={{
              borderRadius: "var(--radius-lg)",
              overflow: "hidden",
              background: "var(--bg-card)",
              border: "1px solid var(--border-light)",
            }}
          >
            <video
              controls
              preload="metadata"
              src={note.video_url}
              style={{ width: "100%", maxHeight: "420px", display: "block", background: "#000" }}
            />
          </div>
        )}

        {previewImages.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: "10px",
            }}
          >
            {previewImages.map((imageUrl, index) => (
              <a
                key={`${note.id}-${index}`}
                href={imageUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "block",
                  borderRadius: "var(--radius-md)",
                  overflow: "hidden",
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-light)",
                  aspectRatio: "1 / 1",
                }}
              >
                <img
                  src={imageUrl}
                  alt={`${note.title}-${index + 1}`}
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
              </a>
            ))}
          </div>
        )}

        {note.comments_preview && note.comments_preview.length > 0 && (
          <div
            style={{
              padding: "12px",
              borderRadius: "var(--radius-md)",
              background: "var(--bg-card)",
              border: "1px solid var(--border-light)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "0.8125rem",
                color: "var(--text-muted)",
                marginBottom: "10px",
                fontWeight: 600,
              }}
            >
              <MessageCircle style={{ width: "14px", height: "14px" }} />
              评论预览
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {note.comments_preview.slice(0, 3).map((comment) => (
                <div
                  key={comment.id}
                  style={{
                    padding: "10px 12px",
                    borderRadius: "var(--radius-sm)",
                    background: "var(--bg-hover)",
                    fontSize: "0.8125rem",
                    color: "var(--text-main)",
                    lineHeight: 1.6,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", marginBottom: "4px" }}>
                    <span style={{ fontWeight: 600, color: "var(--color-primary)" }}>{comment.author}</span>
                    <span style={{ color: "var(--text-muted)" }}>赞 {comment.likes}</span>
                  </div>
                  {comment.content}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderTabs = () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        gap: "12px",
      }}
    >
      {[
        {
          id: "search" as const,
          label: "笔记搜索",
          icon: Search,
          accent: "#FF2442",
          bg: "rgba(255, 36, 66, 0.12)",
        },
        {
          id: "collections" as const,
          label: "收藏专辑抓取",
          icon: Save,
          accent: "#FF6B81",
          bg: "rgba(255, 107, 129, 0.14)",
        },
        {
          id: "following" as const,
          label: "关注监控",
          icon: Users,
          accent: "#FF8A00",
          bg: "rgba(255, 138, 0, 0.14)",
        },
      ].map(({ id, label, icon: Icon, accent, bg }) => (
        <button
          key={id}
          onClick={() => setActiveTab(id)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "14px 16px",
            borderRadius: "var(--radius-md)",
            border: `1px solid ${activeTab === id ? accent : "var(--border-light)"}`,
            background: activeTab === id ? bg : "var(--bg-card)",
            color: activeTab === id ? accent : "var(--text-main)",
            fontSize: "0.9375rem",
            fontWeight: 700,
            cursor: "pointer",
            transition: "all 0.18s ease",
            justifyContent: "flex-start",
            textAlign: "left",
          }}
        >
          <span
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: activeTab === id ? bg : "var(--bg-hover)",
              color: activeTab === id ? accent : "var(--text-secondary)",
              flexShrink: 0,
            }}
          >
            <Icon style={{ width: "18px", height: "18px" }} />
          </span>
          {label}
        </button>
      ))}
    </div>
  );

  const formatTaskTime = (value?: string) => {
    if (!value) return "未知时间";
    try {
      return new Date(value).toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return value;
    }
  };

  const renderTaskInputDetails = (task: XHSTaskStatus) => {
    const input = task.input || {};
    const lines: string[] = [];

    if (task.input_summary) lines.push(task.input_summary);
    if (typeof input.keyword === "string" && input.keyword && !lines.some((line) => line.includes(String(input.keyword)))) {
      lines.push(`关键词：${input.keyword}`);
    }
    if (Array.isArray(input.keywords) && input.keywords.length > 0) {
      lines.push(`关键词组：${input.keywords.join("，")}`);
    }
    if (typeof input.url === "string" && input.url) {
      lines.push(`链接：${input.url}`);
    }
    if (Array.isArray(input.urls) && input.urls.length > 0) {
      lines.push(`链接数：${input.urls.length}`);
    }
    if (Array.isArray(input.albums) && input.albums.length > 0) {
      lines.push(`专辑数：${input.albums.length}`);
    }
    if (typeof input.min_likes === "number") {
      lines.push(`最低点赞：${input.min_likes}`);
    }
    if (typeof input.max_results === "number") {
      lines.push(`结果上限：${input.max_results}`);
    }
    if (typeof input.max_comments === "number") {
      lines.push(`评论数：${input.max_comments}`);
    }
    if (typeof input.max_notes === "number") {
      lines.push(`抓取上限：${input.max_notes}`);
    }

    if (lines.length === 0) return null;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "4px" }}>
        {lines.map((line, index) => (
          <div key={`${task.task_id}-${index}`} style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
            {line}
          </div>
        ))}
      </div>
    );
  };

  const renderManualCrawlTools = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <Card title="保存笔记到 xhs" icon={<FolderDown style={{ width: "18px", height: "18px" }} />}>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", margin: 0 }}>
            粘贴小红书详情链接，ABO 会抓取正文、远程图片链接和本地资源，保存到情报库的 xhs 文件夹。
          </p>

          <div style={{ display: "flex", gap: "12px", alignItems: "stretch" }}>
            <textarea
              value={crawlUrl}
              onChange={(e) => setCrawlUrl(e.target.value)}
              placeholder="https://www.xiaohongshu.com/explore/..."
              style={{
                flex: 1,
                minHeight: "84px",
                padding: "12px 16px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-light)",
                background: "var(--bg-card)",
                color: "var(--text-main)",
                fontSize: "0.9375rem",
                outline: "none",
                resize: "vertical",
              }}
            />
	            <button
	              onClick={handleCrawlNote}
	              disabled={crawlNoteRunning || !crawlUrl.trim()}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                minWidth: "150px",
                padding: "12px 20px",
                borderRadius: "var(--radius-md)",
                border: "none",
	                background: crawlNoteRunning ? "var(--bg-hover)" : "var(--color-primary)",
                color: "white",
                fontSize: "0.9375rem",
                fontWeight: 600,
	                cursor: crawlNoteRunning || !crawlUrl.trim() ? "not-allowed" : "pointer",
	                opacity: crawlNoteRunning || !crawlUrl.trim() ? 0.6 : 1,
              }}
            >
	              {crawlNoteRunning ? "入库中..." : (
                <>
                  <Save style={{ width: "16px", height: "16px" }} />
                  保存入库
                </>
              )}
            </button>
          </div>

          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.875rem", color: "var(--text-main)" }}>
              <input
                type="checkbox"
                checked={includeImages}
                onChange={(e) => setIncludeImages(e.target.checked)}
              />
              下载图片到本地
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.875rem", color: "var(--text-main)" }}>
              <input
                type="checkbox"
                checked={includeLivePhoto}
                onChange={(e) => setIncludeLivePhoto(e.target.checked)}
              />
              下载 Live 图动态片段
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.875rem", color: "var(--text-main)" }}>
              <input
                type="checkbox"
                checked={includeVideo}
                onChange={(e) => setIncludeVideo(e.target.checked)}
              />
              下载视频 MP4
            </label>
            <div style={{ flexBasis: "100%" }} />
            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.875rem", color: "var(--text-main)" }}>
              <input
                type="checkbox"
                checked={includeComments}
                onChange={(e) => setIncludeComments(e.target.checked)}
              />
              记录评论（测试中，需要打开浏览器页面）
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.875rem", color: "var(--text-main)" }}>
              评论数量
              <input
                type="number"
                min={1}
                max={200}
                value={commentsLimit}
                onChange={(e) => setCommentsLimit(Number(e.target.value))}
                style={{
                  width: "80px",
                  padding: "8px 10px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-light)",
                  background: "var(--bg-card)",
                  color: "var(--text-main)",
                }}
              />
            </div>
          </div>
        </div>
      </Card>

      <Card title="批量链接入库" icon={<BookOpen style={{ width: "18px", height: "18px" }} />}>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", margin: 0 }}>
            每行一个小红书链接，使用同一套媒体下载和 Markdown 格式保存。
          </p>
          <textarea
            value={batchUrls}
            onChange={(e) => setBatchUrls(e.target.value)}
            placeholder={"https://www.xiaohongshu.com/explore/...\nhttps://www.xiaohongshu.com/explore/..."}
            style={{
              width: "100%",
              minHeight: "140px",
              padding: "12px 16px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-light)",
              background: "var(--bg-card)",
              color: "var(--text-main)",
              fontSize: "0.9375rem",
              outline: "none",
              resize: "vertical",
            }}
          />
	          <button
	            onClick={() => handleCrawlBatch()}
	            disabled={crawlBatchRunning || !batchUrls.trim()}
            style={{
              alignSelf: "flex-start",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 18px",
              borderRadius: "var(--radius-md)",
              border: "none",
	              background: crawlBatchRunning || !batchUrls.trim() ? "var(--bg-hover)" : "var(--color-primary)",
              color: "white",
              fontSize: "0.875rem",
              fontWeight: 600,
	              cursor: crawlBatchRunning || !batchUrls.trim() ? "not-allowed" : "pointer",
	              opacity: crawlBatchRunning || !batchUrls.trim() ? 0.6 : 1,
            }}
          >
            <FolderDown style={{ width: "16px", height: "16px" }} />
            批量保存
          </button>
        </div>
      </Card>

      {crawlResult && (
        <Card title="入库结果" icon={<CheckCircle style={{ width: "18px", height: "18px" }} />}>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ color: "var(--text-main)", fontWeight: 600 }}>{crawlResult.title}</div>
            <div style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
              {crawlResult.author} · {crawlResult.note_id}
            </div>
            <div
              style={{
                padding: "12px",
                borderRadius: "var(--radius-md)",
                background: "var(--bg-hover)",
                color: "var(--text-main)",
                fontSize: "0.875rem",
                wordBreak: "break-all",
              }}
            >
              Markdown：{crawlResult.markdown_path}
            </div>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", color: "var(--text-muted)", fontSize: "0.8125rem" }}>
              <span>图片 {crawlResult.remote_resources.images.length}</span>
              <span>Live {crawlResult.remote_resources.live.length}</span>
              <span>本地资源 {crawlResult.local_resources.length}</span>
              <span>{crawlResult.used_cdp ? "使用了隐藏浏览器兜底" : "后端直抓成功"}</span>
            </div>
            {crawlResult.warnings.length > 0 && (
              <div style={{ color: "var(--color-warning)", fontSize: "0.8125rem", lineHeight: 1.6 }}>
                {crawlResult.warnings.join("；")}
              </div>
            )}
          </div>
        </Card>
      )}

      {batchResult && (
        <Card title="批量入库结果" icon={<CheckCircle style={{ width: "18px", height: "18px" }} />}>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", color: "var(--text-main)", fontSize: "0.875rem" }}>
              <span>总数 {batchResult.total}</span>
              <span>成功 {batchResult.saved}</span>
              <span>失败 {batchResult.failed}</span>
            </div>
            {batchResult.results.slice(0, 8).map((item, index) => (
              <div
                key={index}
                style={{
                  padding: "10px 12px",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--bg-hover)",
                  color: item.success ? "var(--text-main)" : "var(--color-danger)",
                  fontSize: "0.8125rem",
                  wordBreak: "break-all",
                }}
              >
                {"markdown_path" in item ? `已保存：${item.markdown_path}` : `失败：${item.url} · ${item.error}`}
              </div>
            ))}
          </div>
        </Card>
      )}

      {renderCommentsTab()}
    </div>
  );

  const renderCollectionsTab = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <Card title="收藏专辑抓取（小红书反爬严格，速度很慢，约 5s 一条）" icon={<Save style={{ width: "18px", height: "18px" }} />}>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", margin: 0 }}>
            <strong style={{ color: "var(--text-main)" }}>须：</strong>
            <strong style={{ color: "var(--text-main)" }}>先读取收藏专辑，再按你选中的专辑抓取。</strong>
            增量会跳过本地 JSON 已记录笔记，全量会重新处理专辑内全部已读取笔记。
          </p>

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
            <button
              onClick={handleFetchAlbums}
              disabled={Boolean(albumCrawlTaskId)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 18px",
                borderRadius: "var(--radius-md)",
                border: "none",
                background: albumListTaskId ? "#FF6B81" : albumCrawlTaskId ? "var(--bg-hover)" : "var(--color-primary)",
                color: "white",
                fontSize: "0.875rem",
                fontWeight: 600,
                cursor: albumCrawlTaskId ? "not-allowed" : "pointer",
              }}
            >
              <Search style={{ width: "16px", height: "16px" }} />
              {albumListTaskId ? "获取收藏专辑中，点击中断" : "获取收藏专辑"}
            </button>

            <label style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-main)", fontSize: "0.875rem" }}>
              最近
              <input
                type="number"
                min={1}
                max={3650}
                value={albumRecentDaysInput}
                onChange={(e) => {
                  setAlbumRecentDaysInput(e.target.value);
                }}
                onBlur={() => {
                  const raw = albumRecentDaysInput.trim();
                  if (!raw) return;
                  const next = Number(raw);
                  if (!Number.isFinite(next)) {
                    setAlbumRecentDaysInput("180");
                    return;
                  }
                  setAlbumRecentDaysInput(String(Math.max(1, Math.min(3650, next))));
                }}
                inputMode="numeric"
                style={{ ...compactControlStyle, width: "82px", background: "transparent" }}
              />
              天
            </label>
          </div>

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>抓取方式</span>
            <button type="button" onClick={() => setAlbumCrawlMode("incremental")} style={segmentedButtonStyle(albumCrawlMode === "incremental")}>
              增量
            </button>
            <button
              type="button"
              onClick={() => setAlbumCrawlMode("full")}
              style={{
                ...segmentedButtonStyle(albumCrawlMode === "full"),
                borderColor: albumCrawlMode === "full" ? "#FF6B81" : "var(--border-light)",
                background: albumCrawlMode === "full" ? "#FF6B81" : "transparent",
              }}
            >
              全量
            </button>
            <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>默认只保存 Markdown 和远程链接，本地资源按需下载</span>
            <button type="button" onClick={() => setIncludeImages((v) => !v)} style={segmentedButtonStyle(includeImages)}>
              下载图片
            </button>
            <button type="button" onClick={() => setIncludeLivePhoto((v) => !v)} style={segmentedButtonStyle(includeLivePhoto)}>
              下载 Live 图
            </button>
            <button type="button" onClick={() => setIncludeVideo((v) => !v)} style={segmentedButtonStyle(includeVideo)}>
              下载视频
            </button>
          </div>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
            <button type="button" onClick={() => setIncludeComments((v) => !v)} style={segmentedButtonStyle(includeComments)}>
              记录评论（测试中，需要打开浏览器页面）
            </button>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-main)", fontSize: "0.875rem" }}>
              随机间隔 3 -
              <input
                type="number"
                min={3}
                max={8}
                value={albumCrawlDelay}
                onChange={(e) => setAlbumCrawlDelay(Number(e.target.value || 8))}
                style={{ ...compactControlStyle, width: "76px" }}
              />
              秒
            </label>
          </div>

          {albumListProgress && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                padding: "14px 16px",
                borderRadius: "var(--radius-md)",
                background: "var(--bg-hover)",
                border: "1px solid var(--border-light)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-main)", fontSize: "0.875rem", fontWeight: 600 }}>
                <TrendingUp style={{ width: "16px", height: "16px" }} />
                专辑读取进度
              </div>
              <div style={{ color: "var(--text-main)", fontSize: "0.9375rem", fontWeight: 600 }}>
                {albumListProgress.stage || "执行中"}
              </div>
              <div
                style={{
                  width: "100%",
                  height: "8px",
                  borderRadius: "999px",
                  background: "var(--bg-card)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width:
                      albumListProgress.status === "completed"
                        ? "100%"
                        : albumListProgress.total_steps
                          ? `${Math.max(((albumListProgress.current_step || 0) / albumListProgress.total_steps) * 100, 8)}%`
                        : albumListProgress.stage === "任务已创建"
                          ? "8%"
                          : albumListProgress.stage === "启动无界面浏览器"
                            ? "18%"
                            : albumListProgress.stage === "进入小红书首页"
                              ? "34%"
                              : albumListProgress.stage === "打开个人主页"
                                ? "52%"
                                : albumListProgress.stage === "打开收藏页"
                                  ? "70%"
                                  : albumListProgress.stage === "打开专辑页"
                                    ? "86%"
                                    : "94%",
                    height: "100%",
                    background: "var(--color-primary)",
                    transition: "width 0.25s ease",
                  }}
                />
              </div>
              <div style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>
                {albumListProgress.status === "completed"
                  ? `已读取 ${albumListProgress.albums_total || 0} 个专辑`
                  : albumListProgress.status === "cancelled"
                    ? "已中断，保留当前页面已有专辑。"
                  : `后台无界面加载中，不会影响当前窗口。步骤 ${albumListProgress.current_step || 0}/${albumListProgress.total_steps || 7}`}
              </div>
            </div>
          )}

          {albumProgress && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                padding: "14px 16px",
                borderRadius: "var(--radius-md)",
                background: "var(--bg-hover)",
                border: "1px solid var(--border-light)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-main)", fontSize: "0.875rem", fontWeight: 600 }}>
                <TrendingUp style={{ width: "16px", height: "16px" }} />
                抓取进度
              </div>
              <div style={{ color: "var(--text-main)", fontSize: "0.9375rem", fontWeight: 600 }}>
                {albumProgress.stage || "执行中"}
              </div>
              <div
                style={{
                  width: "100%",
                  height: "8px",
                  borderRadius: "999px",
                  background: "var(--bg-card)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: (() => {
                      const totalAlbums = albumProgress.total_albums || 0;
                      if (albumProgress.status === "completed") return "100%";
                      if (!totalAlbums) return "12%";
                      const albumIndex = Math.max((albumProgress.current_album_index || 1) - 1, 0);
                      const noteTotal = albumProgress.total_notes || 0;
                      const noteIndex = albumProgress.current_note_index || 0;
                      const noteFraction = noteTotal ? Math.min(noteIndex / noteTotal, 1) : 0;
                      return `${Math.max(((albumIndex + noteFraction) / totalAlbums) * 100, 6)}%`;
                    })(),
                    height: "100%",
                    background: "var(--color-primary)",
                    transition: "width 0.25s ease",
                  }}
                />
              </div>
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", color: "var(--text-muted)", fontSize: "0.8125rem" }}>
                <span>当前专辑：{albumProgress.current_album || "准备中"}</span>
                <span>专辑进度：{albumProgress.current_album_index || 0}/{albumProgress.total_albums || 0}</span>
                <span>已加载：{albumProgress.total_notes || 0}/{albumProgress.expected_total || "?"} 条</span>
                <span>已翻页：{albumProgress.pages_loaded || 0} 次</span>
                <span>新增：{albumProgress.saved || 0}</span>
                <span>跳过：{albumProgress.skipped || 0}</span>
                <span>失败：{albumProgress.failed || 0}</span>
              </div>
              {albumProgress.total_notes ? (
                <div style={{ color: "var(--text-secondary)", fontSize: "0.8125rem" }}>
                  当前专辑笔记进度：{albumProgress.current_note_index || 0}/{albumProgress.total_notes}
                  {albumProgress.stage === "专辑列表翻页" || albumProgress.stage === "读取专辑笔记列表"
                    ? " · 后台无界面加载中"
                    : ""}
                  {albumProgress.delay_seconds ? ` · 等待 ${albumProgress.delay_seconds} 秒后继续` : ""}
                </div>
              ) : null}
            </div>
          )}

          {albums.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                <span style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
                  已读取 {albums.length} 个专辑，当前选中 {selectedAlbumIds.size} 个（因帖子删除，总数可能对不上）
                </span>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button
                    onClick={() => {
                      if (selectedAlbumIds.size === albums.length) setSelectedAlbumIds(new Set());
                      else setSelectedAlbumIds(new Set(albums.map((album) => album.board_id)));
                    }}
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "var(--color-primary)",
                      cursor: "pointer",
                      fontSize: "0.8125rem",
                    }}
                  >
                    {selectedAlbumIds.size === albums.length ? "取消全选" : "全选"}
                  </button>
                  <button
                    onClick={() => handleCrawlSelectedAlbums(albumCrawlMode)}
                    disabled={Boolean(albumListTaskId) || (!albumCrawlTaskId && selectedAlbumIds.size === 0)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "10px 18px",
                      borderRadius: "var(--radius-md)",
                      border: "none",
                      background: albumCrawlTaskId
                        ? "#FF6B81"
                        : Boolean(albumListTaskId) || selectedAlbumIds.size === 0
                          ? "var(--bg-hover)"
                          : "var(--color-primary)",
                      color: "white",
                      fontSize: "0.875rem",
                      fontWeight: 600,
                      cursor: Boolean(albumListTaskId) || (!albumCrawlTaskId && selectedAlbumIds.size === 0) ? "not-allowed" : "pointer",
                      opacity: Boolean(albumListTaskId) || (!albumCrawlTaskId && selectedAlbumIds.size === 0) ? 0.6 : 1,
                    }}
                  >
                    <FolderDown style={{ width: "16px", height: "16px" }} />
                    {albumCrawlTaskId ? "正在爬取中，点击中断" : albumCrawlMode === "full" ? "全量抓取选中专辑" : "增量抓取选中专辑"}
                  </button>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "12px" }}>
                {albums.map((album) => (
                  <button
                    key={album.board_id}
                    onClick={() => toggleAlbumSelection(album.board_id)}
                    style={{
                      textAlign: "left",
                      padding: "0",
                      borderRadius: "var(--radius-md)",
                      border: selectedAlbumIds.has(album.board_id) ? "2px solid var(--color-primary)" : "1px solid var(--border-light)",
                      background: "var(--bg-card)",
                      color: "var(--text-main)",
                      overflow: "hidden",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ aspectRatio: "4 / 3", background: "var(--bg-hover)" }}>
                      {album.preview_image ? (
                        <img
                          src={album.preview_image}
                          alt={album.name}
                          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                        />
                      ) : (
                        <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
                          无预览图
                        </div>
                      )}
                    </div>
                    <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
                      <div style={{ fontWeight: 600, fontSize: "0.9375rem", lineHeight: 1.4 }}>{album.name}</div>
                      <div style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>
                        {album.count ?? "未知"} 条 · 已抓 {album.seen_count || 0} 条
                      </div>
                      {album.latest_title && (
                        <div style={{ color: "var(--text-secondary)", fontSize: "0.8125rem", lineHeight: 1.5 }}>
                          最新：{album.latest_title}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>
        </Card>

      {albumResult && (
        <Card title="专辑抓取结果" icon={<CheckCircle style={{ width: "18px", height: "18px" }} />}>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", fontSize: "0.875rem", color: "var(--text-main)" }}>
              <span>新增 {albumResult.saved}</span>
              <span>跳过 {albumResult.skipped}</span>
              <span>失败 {albumResult.failed}</span>
            </div>
            {albumResult.results.map((item, index) => (
              <div
                key={index}
                style={{
                  padding: "10px 12px",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--bg-hover)",
                  color: item.success ? "var(--text-main)" : "var(--color-danger)",
                  fontSize: "0.8125rem",
                }}
              >
                {item.success
                  ? `${item.album}：发现 ${item.found || 0}，新增 ${item.saved || 0}，跳过 ${item.skipped || 0}`
                  : `${item.album || "专辑"}：${item.error || "失败"}`}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );

  const togglePushExpanded = (id: string) => {
    setExpandedPushes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderPushRow = (
    id: "creator" | "keyword",
    title: string,
    subtitle: string,
    active: boolean,
    onToggle: () => void,
    onDelete: () => void,
    children: React.ReactNode,
  ) => {
    const expanded = expandedPushes.has(id);
    return (
      <div
        style={{
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--border-light)",
          background: "var(--bg-card)",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px" }}>
          <button
            type="button"
            onClick={() => togglePushExpanded(id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              flex: 1,
              minWidth: 0,
              padding: 0,
              border: "none",
              background: "transparent",
              color: "var(--text-main)",
              textAlign: "left",
              cursor: "pointer",
            }}
          >
            {expanded ? (
              <ChevronUp style={{ width: "16px", height: "16px", color: "var(--text-muted)", flexShrink: 0 }} />
            ) : (
              <ChevronDown style={{ width: "16px", height: "16px", color: "var(--text-muted)", flexShrink: 0 }} />
            )}
            <span style={{ display: "flex", flexDirection: "column", gap: "3px", minWidth: 0 }}>
              <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-main)" }}>{title}</span>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {subtitle}
              </span>
            </span>
          </button>
          <button type="button" onClick={onToggle} aria-label={active ? "关闭推送" : "开启推送"} style={switchStyle(active)}>
            <span style={switchKnobStyle(active)} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-light)",
              background: "transparent",
              color: "var(--color-danger)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            aria-label="删除推送"
          >
            <Trash2 style={{ width: "15px", height: "15px" }} />
          </button>
        </div>
        {expanded && (
          <div style={{ padding: "0 14px 14px", display: "flex", flexDirection: "column", gap: "10px" }}>
            {children}
          </div>
        )}
      </div>
    );
  };

  const renderTrackerPushList = () => {
    const hasCreatorPush = trackerUserIds.length > 0;
    const hasKeywordPush = trackerKeywords.length > 0;
    if (!hasCreatorPush && !hasKeywordPush) {
      return (
        <div style={{ color: "var(--text-muted)", fontSize: "0.8125rem", lineHeight: 1.6 }}>
          还没有定时推送。同步反推博主或保存关键词后，这里会单独列出可开关、可删除的推送。
        </div>
      );
    }
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {hasCreatorPush && renderPushRow(
          "creator",
          "收藏反推博主",
          `${trackerUserIds.length} 个博主 · ${trackerCreatorPushEnabled ? "已开启" : "已关闭"}`,
          trackerCreatorPushEnabled,
          handleToggleCreatorPush,
          handleDeleteCreatorPush,
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "10px" }}>
            {trackerUserIds.slice(0, 24).map((userId) => {
              const profile = trackerCreatorProfiles[userId];
              const active = trackerCreatorPushEnabled && !disabledCreatorIds.has(userId);
              const source = profile?.source_summary || profile?.latest_title || "来自收藏反推博主";
              return (
                <button
                  key={userId}
                  type="button"
                  onClick={() => handleToggleCreatorUser(userId)}
                  style={{
                    position: "relative",
                    textAlign: "left",
                    padding: "10px 30px 10px 10px",
                    borderRadius: "var(--radius-sm)",
                    background: active ? "rgba(255, 36, 66, 0.10)" : "var(--bg-hover)",
                    border: active ? "1px solid rgba(255, 36, 66, 0.30)" : "1px solid var(--border-light)",
                    color: "var(--text-main)",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.8125rem", fontWeight: 700 }}>
                    <span
                      style={{
                        width: "7px",
                        height: "7px",
                        borderRadius: "50%",
                        background: active ? "var(--color-primary)" : "var(--text-muted)",
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {profile?.author || userId}
                    </span>
                  </span>
                  <span style={{ color: "var(--text-secondary)", fontSize: "0.75rem", lineHeight: 1.45 }}>
                    {source}
                  </span>
                  {(profile?.sample_albums?.length || profile?.sample_tags?.length) ? (
                    <span style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                      {[...(profile?.sample_albums || []), ...(profile?.sample_tags || [])].slice(0, 3).map((label) => (
                        <span
                          key={label}
                          style={{
                            padding: "3px 6px",
                            borderRadius: "var(--radius-sm)",
                            background: "var(--bg-card)",
                            color: "var(--text-muted)",
                            fontSize: "0.6875rem",
                          }}
                        >
                          {label}
                        </span>
                      ))}
                    </span>
                  ) : null}
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveCreatorUser(userId);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        handleRemoveCreatorUser(userId);
                      }
                    }}
                    style={{
                      position: "absolute",
                      top: "8px",
                      right: "8px",
                      width: "18px",
                      height: "18px",
                      borderRadius: "50%",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--text-muted)",
                      background: "var(--bg-card)",
                      border: "1px solid var(--border-light)",
                      fontSize: "0.75rem",
                    }}
                    title="移除博主"
                  >
                    ×
                  </span>
                </button>
              );
            })}
            {trackerUserIds.length > 24 && (
              <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)", alignSelf: "center" }}>
                还有 {trackerUserIds.length - 24} 个
              </span>
            )}
          </div>,
        )}
        {hasKeywordPush && renderPushRow(
          "keyword",
          "关键词推送",
          `${trackerKeywords.length} 个关键词 · ${trackerEnableKeywordSearch ? "已开启" : "已关闭"}`,
          trackerEnableKeywordSearch,
          handleToggleKeywordPush,
          handleDeleteKeywordPush,
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {trackerKeywords.map((keyword) => (
              <span
                key={keyword}
                style={{
                  padding: "6px 10px",
                  borderRadius: "var(--radius-sm)",
                  background: "rgba(255, 36, 66, 0.08)",
                  border: "1px solid var(--border-light)",
                  color: "var(--color-primary)",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                }}
              >
                {keyword}
              </span>
            ))}
          </div>,
        )}
      </div>
    );
  };

  const renderFollowingTab = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <Card title="关注列表监控" icon={<Users style={{ width: "18px", height: "18px" }} />}>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", margin: 0 }}>
            监控你关注的用户发布的内容，筛选包含指定关键词的笔记。
            {!cookieVerified && (
              <span style={{ color: "var(--color-warning)" }}>（需先配置 Cookie）</span>
            )}
          </p>

          <label style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-main)", fontSize: "0.875rem" }}>
            抓取上限
            <input
              type="number"
              min={1}
              max={300}
              value={followingLimit}
              onChange={(e) => setFollowingLimit(Number(e.target.value || 1))}
              style={{ ...compactControlStyle, width: "88px" }}
            />
            条
          </label>

          <div style={{ display: "flex", gap: "12px" }}>
            <input
              type="text"
              value={followingKeywords}
              onChange={(e) => setFollowingKeywords(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleFollowingFeed()}
              placeholder="输入关键词，多个用逗号分隔..."
              disabled={!cookieVerified}
              style={{
                flex: 1,
                padding: "12px 16px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-light)",
                background: "var(--bg-card)",
                color: "var(--text-main)",
                fontSize: "0.9375rem",
                outline: "none",
                opacity: cookieVerified ? 1 : 0.5,
              }}
            />
            <button
              onClick={handleFollowingFeed}
              disabled={followingRunning || !followingKeywords.trim() || !cookieVerified}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "12px 24px",
                borderRadius: "var(--radius-md)",
                border: "none",
                background: followingRunning || !cookieVerified ? "var(--bg-hover)" : "var(--color-primary)",
                color: "white",
                fontSize: "0.9375rem",
                fontWeight: 600,
                cursor: followingRunning || !cookieVerified ? "not-allowed" : "pointer",
                opacity: followingRunning || !cookieVerified ? 0.6 : 1,
              }}
            >
              {followingRunning ? (
                <span>⟳ 获取中...</span>
              ) : (
                <>
                  <Users style={{ width: "16px", height: "16px" }} />
                  获取
                </>
              )}
            </button>
          </div>
        </div>
      </Card>

      <Card title="关注推送" icon={<Users style={{ width: "18px", height: "18px" }} />}>
        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-main)" }}>已创建推送</div>
            {renderTrackerPushList()}
          </div>

          <div style={{ height: "1px", background: "var(--border-light)" }} />

          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div>
              <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-main)", marginBottom: "4px" }}>
                收藏反推博主
              </div>
              <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", margin: 0, lineHeight: 1.6 }}>
                从已保存收藏里聚合高频作者，解析作者 ID 后并入关注推送池，后续定时任务会和关注列表监控一起跑。
              </p>
            </div>

            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <button type="button" onClick={handleAnalyzeAuthors} style={segmentedButtonStyle(true)}>
                从本地收藏生成博主候选
              </button>
              <button
                type="button"
                onClick={handleSyncSelectedAuthors}
                disabled={selectedAuthors.size === 0}
                style={{
                  ...segmentedButtonStyle(false),
                  opacity: selectedAuthors.size === 0 ? 0.5 : 1,
                  cursor: selectedAuthors.size === 0 ? "not-allowed" : "pointer",
                }}
              >
                同步选中博主到关注推送
              </button>
            </div>

            {authorCandidateMeta && (
              <div style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>
                {authorCandidateMeta.message}
              </div>
            )}

            {authorCandidates.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "12px" }}>
                {authorCandidates.slice(0, 24).map((candidate) => (
                  <button
                    key={candidate.author}
                    type="button"
                    onClick={() => toggleAuthorSelection(candidate.author)}
                    style={{
                      textAlign: "left",
                      padding: "14px",
                      borderRadius: "var(--radius-md)",
                      border: selectedAuthors.has(candidate.author) ? "2px solid var(--color-primary)" : "1px solid var(--border-light)",
                      background: "var(--bg-card)",
                      color: "var(--text-main)",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
                      <span style={{ fontWeight: 700, fontSize: "0.9375rem" }}>{candidate.author}</span>
                      <span style={{ fontSize: "0.75rem", color: candidate.author_id ? "var(--color-primary)" : "var(--color-warning)" }}>
                        {candidate.author_id ? "可同步" : "待解析ID"}
                      </span>
                    </div>
                    <div style={{ color: "var(--text-muted)", fontSize: "0.8125rem", display: "flex", gap: "10px", flexWrap: "wrap" }}>
                      <span>{candidate.note_count} 条</span>
                      <span>{candidate.total_collects} 收藏</span>
                      <span>{candidate.total_likes} 赞</span>
                    </div>
                    <div style={{ color: "var(--text-secondary)", fontSize: "0.8125rem", lineHeight: 1.5 }}>
                      最近：{candidate.latest_title || "暂无"}
                    </div>
                    <div style={{ color: "var(--text-secondary)", fontSize: "0.8125rem", lineHeight: 1.5 }}>
                      {candidate.source_summary || "来源：本地收藏笔记"}
                    </div>
                    {(candidate.sample_albums?.length || candidate.sample_tags?.length) ? (
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                        {[...(candidate.sample_albums || []), ...(candidate.sample_tags || [])].slice(0, 5).map((label) => (
                          <span
                            key={label}
                            style={{
                              padding: "3px 7px",
                              borderRadius: "var(--radius-sm)",
                              background: "rgba(255, 36, 66, 0.08)",
                              color: "var(--color-primary)",
                              fontSize: "0.72rem",
                              fontWeight: 600,
                            }}
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {candidate.author_id && (
                      <div style={{ color: "var(--text-muted)", fontSize: "0.75rem", wordBreak: "break-all" }}>
                        user_id: {candidate.author_id}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ height: "1px", background: "var(--border-light)" }} />

          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div>
              <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-main)", marginBottom: "4px" }}>
                关键词推送
              </div>
              <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", margin: 0, lineHeight: 1.6 }}>
                写入模块管理配置，后端按定时任务抓取高赞关键词内容。
              </p>
            </div>

            <input
              type="text"
              value={trackerKeywords.join(", ")}
              onChange={(e) => setTrackerKeywords(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
              placeholder="科研工具, 论文写作, AI 工作流, 学术日常"
              style={{ ...compactControlStyle, width: "100%" }}
            />

            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
              <button type="button" onClick={() => setTrackerEnableKeywordSearch((v) => !v)} style={segmentedButtonStyle(trackerEnableKeywordSearch)}>
                {trackerEnableKeywordSearch ? "关键词推送已开启" : "关键词推送已关闭"}
              </button>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.875rem", color: "var(--text-main)" }}>
                单次最多
                <input
                  type="number"
                  min={1}
                  max={300}
                  value={trackerMaxResults}
                  onChange={(e) => setTrackerMaxResults(Number(e.target.value || 1))}
                  style={{ ...compactControlStyle, width: "88px" }}
                />
                条
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.875rem", color: "var(--text-main)" }}>
                最低点赞
                <input
                  type="number"
                  min={0}
                  value={trackerKeywordMinLikes}
                  onChange={(e) => setTrackerKeywordMinLikes(Number(e.target.value || 0))}
                  style={{ ...compactControlStyle, width: "92px" }}
                />
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.875rem", color: "var(--text-main)" }}>
                每词抓取
                <input
                  type="number"
                  min={1}
                  value={trackerKeywordLimit}
                  onChange={(e) => setTrackerKeywordLimit(Number(e.target.value || 1))}
                  style={{ ...compactControlStyle, width: "88px" }}
                />
                条
              </label>
            </div>

            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
              <button type="button" onClick={() => setTrackerFollowFeed((v) => !v)} style={segmentedButtonStyle(trackerFollowFeed)}>
                {trackerFollowFeed ? "关注流补充已开启" : "开启关注流补充"}
              </button>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.875rem", color: "var(--text-main)" }}>
                关注流上限
                <input
                  type="number"
                  min={1}
                  value={trackerFollowLimit}
                  onChange={(e) => setTrackerFollowLimit(Number(e.target.value || 1))}
                  style={{ ...compactControlStyle, width: "88px" }}
                />
              </label>
              <button type="button" onClick={handleSaveTrackerKeywords} style={segmentedButtonStyle(true)}>
                保存关键词推送
              </button>
              <button
                type="button"
                onClick={() => setTrackerKeywords(["科研工具", "论文写作", "学术日常", "AI 工作流", "知识管理", "Obsidian"])}
                style={segmentedButtonStyle(false)}
              >
                使用推荐关键词
              </button>
            </div>
          </div>
        </div>
      </Card>

      {followingResult && (
        <Card title={`匹配结果 (${followingResult.total_found})`} icon={<BookOpen style={{ width: "18px", height: "18px" }} />}>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {followingResult.notes.map((note) => (
              <div
                key={note.id}
                style={{
                  padding: "16px",
                  borderRadius: "var(--radius-lg)",
                  background: "var(--bg-hover)",
                  border: "1px solid var(--border-light)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <h4 style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text-main)", marginBottom: "8px", flex: 1 }}>
                    {note.title}
                  </h4>
                  <a
                    href={note.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "4px 8px",
                      borderRadius: "var(--radius-sm)",
                      background: "var(--color-primary)20",
                      color: "var(--color-primary)",
                      fontSize: "0.75rem",
                      border: "none",
                      marginLeft: "8px",
                      cursor: "pointer",
                      textDecoration: "none",
                    }}
                  >
                    <ExternalLink style={{ width: "12px", height: "12px" }} />
                    详情
                  </a>
                </div>

                {note.matched_keywords && note.matched_keywords.length > 0 && (
                  <div style={{ display: "flex", gap: "4px", marginBottom: "8px", flexWrap: "wrap" }}>
                    {note.matched_keywords.map((kw) => (
                      <span
                        key={kw}
                        style={{
                          padding: "2px 8px",
                          borderRadius: "var(--radius-full)",
                          background: "var(--color-primary)20",
                          color: "var(--color-primary)",
                          fontSize: "0.75rem",
                        }}
                      >
                        {kw}
                      </span>
                    ))}
                  </div>
                )}

                <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "12px" }}>
                  {note.content?.slice(0, 200)}{note.content?.length > 200 ? "..." : ""}
                </p>

                {renderNoteMedia(note)}

                <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>作者：{note.author}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "0.8125rem", color: "var(--color-danger)" }}>
                    <Heart style={{ width: "14px", height: "14px" }} />
                    {note.likes.toLocaleString()}
                  </span>
                  {note.images && note.images.length > 0 && (
                    <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                      <ImageIcon style={{ width: "14px", height: "14px" }} />
                      {note.images.length} 张图
                    </span>
                  )}
                  {note.video_url && (
                    <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                      <PlayCircle style={{ width: "14px", height: "14px" }} />
                      视频
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {!followingResult && !followingRunning && (
        <EmptyState
          icon={Users}
          title="关注列表监控"
          description="输入关键词，监控你关注的用户发布的相关内容"
        />
      )}

    </div>
  );

  const renderCookieConfigModal = () => showCookieModal && (
    <div
      onClick={() => hasCookie && setShowCookieModal(false)}
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(7, 10, 18, 0.62)",
        backdropFilter: "blur(10px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 130,
        padding: "24px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(720px, 96vw)",
          maxHeight: "88vh",
          overflow: "auto",
          borderRadius: "20px",
          border: "1px solid var(--border-light)",
          background: "var(--bg-card)",
          boxShadow: "0 24px 80px rgba(0, 0, 0, 0.35)",
          padding: "24px",
          display: "flex",
          flexDirection: "column",
          gap: "18px",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px" }}>
          <div>
            <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-main)" }}>配置小红书 Cookie</div>
            <div style={{ marginTop: "4px", fontSize: "0.875rem", color: "var(--text-muted)" }}>
              首次使用或 Cookie 缺失时才会弹出。配置完成后页面内不再显示。
            </div>
          </div>
          {hasCookie && (
            <button
              type="button"
              onClick={() => setShowCookieModal(false)}
              style={{ border: "none", background: "transparent", color: "var(--text-muted)", cursor: "pointer" }}
            >
              <X size={18} />
            </button>
          )}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            padding: "14px",
            borderRadius: "var(--radius-md)",
            background: "var(--bg-hover)",
            border: "1px solid var(--border-light)",
          }}
        >
          <div>
            <div style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text-main)" }}>一键获取浏览器 Cookie</div>
            <div style={{ marginTop: "4px", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
              优先读取后台浏览器环境；成功后自动保存并复用。
            </div>
          </div>
          <button
            onClick={handleGetCookieFromBrowser}
            disabled={gettingCookie}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 16px",
              borderRadius: "var(--radius-sm)",
              border: "none",
              background: gettingCookie ? "var(--bg-muted)" : "var(--color-primary)",
              color: "white",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: gettingCookie ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
            }}
          >
            <Cookie size={16} />
            {gettingCookie ? "获取中..." : "一键获取"}
          </button>
        </div>

        <button
          onClick={() => setShowManualCookie((value) => !value)}
          style={{
            alignSelf: "flex-start",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "6px 0",
            border: "none",
            background: "transparent",
            color: "var(--text-muted)",
            fontSize: "0.8125rem",
            cursor: "pointer",
          }}
        >
          {showManualCookie ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          手动 Cookie 兜底
        </button>

        {showManualCookie && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              padding: "12px",
              borderRadius: "var(--radius-md)",
              background: "var(--bg-hover)",
            }}
          >
            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.875rem", color: "var(--text-main)" }}>
              <input type="checkbox" checked={showFullCookie} onChange={(e) => setShowFullCookie(e.target.checked)} />
              展开完整 Cookie
            </label>

            {showFullCookie && (
              <textarea
                readOnly
                value={fullCookie || buildCookie()}
                placeholder="还没有完整 Cookie，请先点击一键获取。"
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-light)",
                  background: "transparent",
                  color: "var(--text-main)",
                  fontSize: "0.8125rem",
                  fontFamily: "monospace",
                  resize: "vertical",
                  minHeight: "120px",
                }}
              />
            )}

            <textarea
              value={webSession}
              onChange={(e) => {
                setFullCookie("");
                setWebSession(e.target.value);
                setCookieVerified(false);
                setBackendCookieConfigured(false);
              }}
              placeholder="粘贴 web_session..."
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border-light)",
                background: "transparent",
                color: "var(--text-main)",
                fontSize: "0.8125rem",
                fontFamily: "monospace",
                resize: "vertical",
                minHeight: "60px",
              }}
            />

            <textarea
              value={idToken}
              onChange={(e) => {
                setFullCookie("");
                setIdToken(e.target.value);
                setCookieVerified(false);
                setBackendCookieConfigured(false);
              }}
              placeholder="粘贴 id_token（可选）..."
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border-light)",
                background: "transparent",
                color: "var(--text-main)",
                fontSize: "0.8125rem",
                fontFamily: "monospace",
                resize: "vertical",
                minHeight: "60px",
              }}
            />

            <CookieGuide platform="xiaohongshu" cookieName="web_session" />
            <button
              onClick={handleVerifyCookie}
              disabled={verifying || !webSession.trim()}
              style={{
                padding: "10px 16px",
                borderRadius: "var(--radius-sm)",
                border: "none",
                background: verifying ? "var(--bg-muted)" : "var(--color-primary)",
                color: "white",
                fontSize: "0.875rem",
                fontWeight: 600,
                cursor: verifying || !webSession.trim() ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
              }}
            >
              {verifying ? "验证中..." : cookieVerified ? <><CheckCircle size={16} />已验证</> : <><AlertCircle size={16} />验证并保存</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  const renderSearchTab = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Search Input Area */}
      <Card title="搜索条件" icon={<Filter style={{ width: "18px", height: "18px" }} />}>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "flex", gap: "12px" }}>
            <input
              type="text"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder="输入关键词搜索小红书笔记..."
              style={{
                flex: 1,
                padding: "12px 16px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-light)",
                background: "var(--bg-card)",
                color: "var(--text-main)",
                fontSize: "0.9375rem",
                outline: "none",
              }}
            />
            <button
              onClick={handleSearch}
              disabled={searchRunning || !searchKeyword.trim()}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "12px 24px",
                borderRadius: "var(--radius-md)",
                border: "none",
                background: searchRunning ? "var(--bg-hover)" : "var(--color-primary)",
                color: "white",
                fontSize: "0.9375rem",
                fontWeight: 600,
                cursor: searchRunning || !searchKeyword.trim() ? "not-allowed" : "pointer",
                opacity: searchRunning || !searchKeyword.trim() ? 0.6 : 1,
                transition: "all 0.2s ease",
              }}
            >
              {searchRunning ? (
                <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span className="animate-spin">⟳</span>
                  搜索中...
                </span>
              ) : (
                <>
                  <Search style={{ width: "16px", height: "16px" }} />
                  搜索
                </>
              )}
            </button>
          </div>

          <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>排序：</span>
              <div
                style={{
                  display: "flex",
                  gap: "6px",
                  padding: "4px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-light)",
                  background: "transparent",
                }}
              >
                <button type="button" onClick={() => setSortBy("likes")} style={segmentedButtonStyle(sortBy === "likes")}>
                  按点赞数
                </button>
                <button type="button" onClick={() => setSortBy("time")} style={segmentedButtonStyle(sortBy === "time")}>
                  按发布时间
                </button>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Heart style={{ width: "14px", height: "14px", color: "var(--color-danger)" }} />
              <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>最低点赞：</span>
              <input
                type="number"
                value={minLikes}
                onChange={(e) => setMinLikes(Number(e.target.value))}
                min={0}
                style={{
                  width: "80px",
                  padding: "8px 12px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-light)",
                  background: "var(--bg-card)",
                  color: "var(--text-main)",
                  fontSize: "0.875rem",
                }}
              />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>搜索上限：</span>
              <input
                type="number"
                value={searchLimit}
                onChange={(e) => setSearchLimit(Number(e.target.value || 1))}
                min={1}
                max={300}
                style={{
                  width: "88px",
                  padding: "8px 12px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-light)",
                  background: "var(--bg-card)",
                  color: "var(--text-main)",
                  fontSize: "0.875rem",
                }}
              />
              <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>条</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Search Results */}
      {searchResult && (
        <Card
          title={`搜索结果 (${searchResult.total_found})`}
          icon={<BookOpen style={{ width: "18px", height: "18px" }} />}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
              <span style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
                可直接把当前搜索结果全部保存到情报库 xhs。
              </span>
              <button
                onClick={() => handleSavePreviewNotes(searchResult.notes)}
                disabled={previewSaveRunning || searchResult.notes.length === 0}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px 14px",
                  borderRadius: "var(--radius-sm)",
                  border: "none",
                  background: previewSaveRunning ? "var(--bg-hover)" : "var(--color-primary)",
                  color: "white",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  cursor: previewSaveRunning ? "not-allowed" : "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                <FolderDown style={{ width: "14px", height: "14px" }} />
                {previewSaveRunning ? "保存中..." : "全部入库"}
              </button>
            </div>
            {searchResult.notes.map((note) => (
              <div
                key={note.id}
                style={{
                  padding: "16px",
                  borderRadius: "var(--radius-lg)",
                  background: "var(--bg-hover)",
                  border: "1px solid var(--border-light)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <h4
                    style={{
                      fontSize: "0.9375rem",
                      fontWeight: 600,
                      color: "var(--text-main)",
                      marginBottom: "8px",
                      flex: 1,
                    }}
                  >
                    {note.title}
                  </h4>
                  <a
                    href={note.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "4px 8px",
                      borderRadius: "var(--radius-sm)",
                      background: "var(--color-primary)20",
                      color: "var(--color-primary)",
                      fontSize: "0.75rem",
                      border: "none",
                      marginLeft: "8px",
                      cursor: "pointer",
                      textDecoration: "none",
                    }}
                  >
                    <ExternalLink style={{ width: "12px", height: "12px" }} />
                    详情
                  </a>
                </div>

                <p
                  style={{
                    fontSize: "0.875rem",
                    color: "var(--text-secondary)",
                    lineHeight: 1.6,
                    marginBottom: "12px",
                  }}
                >
                  {expandedNotes.has(note.id)
                    ? note.content
                    : note.content.slice(0, 150) + (note.content.length > 150 ? "..." : "")}
                </p>

                {renderNoteMedia(note)}

                {note.content.length > 150 && (
                  <button
                    onClick={() => toggleNoteExpand(note.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "4px 0",
                      background: "none",
                      border: "none",
                      color: "var(--color-primary)",
                      fontSize: "0.8125rem",
                      cursor: "pointer",
                      marginBottom: "12px",
                    }}
                  >
                    {expandedNotes.has(note.id) ? (
                      <>
                        <ChevronUp style={{ width: "14px", height: "14px" }} />
                        收起
                      </>
                    ) : (
                      <>
                        <ChevronDown style={{ width: "14px", height: "14px" }} />
                        展开
                      </>
                    )}
                  </button>
                )}

                <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                    作者：{note.author}
                  </span>
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      fontSize: "0.8125rem",
                      color: "var(--color-danger)",
                    }}
                  >
                    <Heart style={{ width: "14px", height: "14px" }} />
                    {note.likes.toLocaleString()}
                  </span>
                  <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                    收藏：{note.collects.toLocaleString()}
                  </span>
                  <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                    评论：{note.comments_count.toLocaleString()}
                  </span>
                  {note.published_at && (
                    <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                      {new Date(note.published_at).toLocaleDateString("zh-CN")}
                    </span>
                  )}
                  {note.images && note.images.length > 0 && (
                    <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                      <ImageIcon style={{ width: "14px", height: "14px" }} />
                      {note.images.length}
                    </span>
                  )}
                  {note.video_url && (
                    <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                      <PlayCircle style={{ width: "14px", height: "14px" }} />
                      视频
                    </span>
                  )}
                  <button
                    onClick={() => handleSavePreviewNotes([note])}
                    disabled={previewSaveRunning}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "4px 12px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border-light)",
                      background: "var(--bg-card)",
                      color: "var(--color-primary)",
                      fontSize: "0.75rem",
                      cursor: previewSaveRunning ? "not-allowed" : "pointer",
                      opacity: previewSaveRunning ? 0.6 : 1,
                      marginLeft: "auto",
                    }}
                  >
                    <Save style={{ width: "12px", height: "12px" }} />
                    入库
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {!searchResult && !searchRunning && (
        <EmptyState
          icon={Search}
          title="开始搜索"
          description="输入关键词搜索小红书高赞笔记"
        />
      )}
    </div>
  );

  const renderCommentsTab = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Comments Input */}
      <Card title="获取评论" icon={<MessageCircle style={{ width: "18px", height: "18px" }} />}>
        <div style={{ display: "flex", gap: "12px" }}>
          <input
            type="text"
            value={noteId}
            onChange={(e) => setNoteId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleComments()}
            placeholder="输入小红书笔记 ID 或完整链接..."
            style={{
              flex: 1,
              padding: "12px 16px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-light)",
              background: "var(--bg-card)",
              color: "var(--text-main)",
              fontSize: "0.9375rem",
              outline: "none",
            }}
          />
          <button
            onClick={handleComments}
            disabled={commentsRunning || !noteId.trim()}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "12px 24px",
              borderRadius: "var(--radius-md)",
              border: "none",
              background: commentsRunning ? "var(--bg-hover)" : "var(--color-primary)",
              color: "white",
              fontSize: "0.9375rem",
              fontWeight: 600,
              cursor: commentsRunning || !noteId.trim() ? "not-allowed" : "pointer",
              opacity: commentsRunning || !noteId.trim() ? 0.6 : 1,
            }}
          >
            {commentsRunning ? (
              <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span className="animate-spin">⟳</span>
                获取中...
              </span>
            ) : (
              <>
                <MessageCircle style={{ width: "16px", height: "16px" }} />
                获取评论
              </>
            )}
          </button>
        </div>
      </Card>

      {/* Comments Results */}
      {commentsResult && (
        <Card
          title={`评论列表 (${commentsResult.total_comments})`}
          icon={<Users style={{ width: "18px", height: "18px" }} />}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {commentsResult.comments.map((comment) => (
              <div
                key={comment.id}
                style={{
                  padding: "16px",
                  borderRadius: "var(--radius-lg)",
                  background: "var(--bg-hover)",
                  border: "1px solid var(--border-light)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <span
                    style={{
                      fontSize: "0.875rem",
                      fontWeight: 600,
                      color: "var(--color-primary)",
                    }}
                  >
                    {comment.author}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {comment.is_top && (
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: "var(--radius-sm)",
                          background: "var(--color-warning)20",
                          color: "var(--color-warning)",
                          fontSize: "0.75rem",
                        }}
                      >
                        置顶
                      </span>
                    )}
                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        fontSize: "0.8125rem",
                        color: "var(--color-danger)",
                      }}
                    >
                      <Heart style={{ width: "14px", height: "14px" }} />
                      {comment.likes.toLocaleString()}
                    </span>
                  </div>
                </div>

                <p
                  style={{
                    fontSize: "0.875rem",
                    color: "var(--text-main)",
                    lineHeight: 1.6,
                  }}
                >
                  {expandedComments.has(comment.id)
                    ? comment.content
                    : comment.content.slice(0, 200) + (comment.content.length > 200 ? "..." : "")}
                </p>

                {comment.content.length > 200 && (
                  <button
                    onClick={() => {
                      setExpandedComments((prev) => {
                        const next = new Set(prev);
                        if (next.has(comment.id)) next.delete(comment.id);
                        else next.add(comment.id);
                        return next;
                      });
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "4px 0",
                      background: "none",
                      border: "none",
                      color: "var(--color-primary)",
                      fontSize: "0.8125rem",
                      cursor: "pointer",
                      marginTop: "8px",
                    }}
                  >
                    {expandedComments.has(comment.id) ? (
                      <>
                        <ChevronUp style={{ width: "14px", height: "14px" }} />
                        收起
                      </>
                    ) : (
                      <>
                        <ChevronDown style={{ width: "14px", height: "14px" }} />
                        展开
                      </>
                    )}
                  </button>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {!commentsResult && !commentsRunning && (
        <EmptyState
          icon={MessageCircle}
          title="获取评论"
          description="输入笔记 ID 获取小红书评论（按点赞排序）"
        />
      )}
    </div>
  );

  const normalizedTaskQuery = taskHistoryQuery.trim().toLowerCase();
  const filteredTaskHistory = taskHistory.filter((task) => {
    if (!normalizedTaskQuery) return true;
    const searchable = [
      task.kind,
      task.status,
      task.stage,
      task.input_summary,
      task.error,
      JSON.stringify(task.input || {}),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return searchable.includes(normalizedTaskQuery);
  });
  const taskHistoryPageSize = 9;
  const taskHistoryPageCount = Math.max(1, Math.ceil(filteredTaskHistory.length / taskHistoryPageSize));
  const normalizedTaskHistoryPage = Math.min(taskHistoryPage, taskHistoryPageCount - 1);
  const pagedTaskHistory = filteredTaskHistory.slice(
    normalizedTaskHistoryPage * taskHistoryPageSize,
    normalizedTaskHistoryPage * taskHistoryPageSize + taskHistoryPageSize,
  );
  const selectedTask = taskHistory.find((task) => task.task_id === selectedTaskId) || null;

  return (
    <PageContainer>
      {renderCookieConfigModal()}
      <PageHeader
        title="小红书分析工具"
        subtitle="笔记搜索、收藏专辑抓取、关注监控，一键获取 Cookie 并保存到情报库 xhs"
        icon={Search}
        actions={
          <button
            type="button"
            onClick={() => setShowCookieModal(true)}
            style={{
              padding: "10px 12px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-light)",
              background: hasCookie ? "transparent" : "rgba(239, 68, 68, 0.08)",
              color: hasCookie ? "var(--text-secondary)" : "var(--color-danger)",
              fontSize: "0.875rem",
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <Cookie size={16} />
            {hasCookie ? "Cookie 配置" : "配置 Cookie"}
          </button>
        }
      />
      <PageContent maxWidth="1200px">
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {renderTabs()}

          {backgroundTask && (
            <Card title="后台任务" icon={<Zap style={{ width: "18px", height: "18px" }} />}>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text-main)" }}>
                  {backgroundTask.stage}
                </div>
                <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                  任务类型：{backgroundTask.kind} · Task ID: {backgroundTask.taskId}
                </div>
                <div
                  style={{
                    width: "100%",
                    height: "8px",
                    borderRadius: "999px",
                    background: "var(--bg-hover)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: "38%",
                      height: "100%",
                      background: "var(--color-primary)",
                      animation: "pulse 1.2s ease-in-out infinite",
                    }}
                  />
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                  切换到其他页面也会继续执行，返回后会自动接上结果。
                </div>
              </div>
            </Card>
          )}

          {taskHistory.length > 0 && (
            <Card>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <button
                  type="button"
                  onClick={() => setShowTaskHistory((prev) => !prev)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "12px",
                    width: "100%",
                    padding: "12px 14px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-light)",
                    background: "var(--bg-hover)",
                    color: "var(--text-main)",
                    cursor: "pointer",
                  }}
                >
                  <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>
                    最近任务 {taskHistory.length} 条
                  </span>
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "8px 10px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border-light)",
                      background: "var(--bg-card)",
                      color: "var(--text-secondary)",
                      flexShrink: 0,
                    }}
                  >
                    {showTaskHistory ? (
                      <>
                        <ChevronUp style={{ width: "16px", height: "16px" }} />
                        收起
                      </>
                    ) : (
                      <>
                        <ChevronDown style={{ width: "16px", height: "16px" }} />
                        展开
                      </>
                    )}
                  </span>
                </button>

                {showTaskHistory && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                      <input
                        type="text"
                        value={taskHistoryQuery}
                        onChange={(e) => {
                          setTaskHistoryQuery(e.target.value);
                          setTaskHistoryPage(0);
                        }}
                        placeholder="搜索历史关键词、链接、任务类型..."
                        style={{
                          flex: "1 1 260px",
                          minWidth: 0,
                          padding: "10px 12px",
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid var(--border-light)",
                          background: "var(--bg-card)",
                          color: "var(--text-main)",
                          fontSize: "0.875rem",
                          outline: "none",
                        }}
                      />
                      <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                        匹配 {filteredTaskHistory.length} 条
                      </span>
                    </div>

                    {pagedTaskHistory.length > 0 ? (
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                          gap: "8px",
                        }}
                      >
                        {pagedTaskHistory.map((task) => {
                          const color =
                            task.status === "completed"
                              ? "#22c55e"
                              : task.status === "failed" || task.status === "interrupted"
                                ? "#ef4444"
                                : "var(--color-primary)";
                          const active = selectedTaskId === task.task_id;
                          return (
                            <button
                              key={task.task_id}
                              type="button"
                              onClick={() => setSelectedTaskId(task.task_id)}
                              style={{
                                minHeight: "62px",
                                padding: "8px 10px",
                                borderRadius: "var(--radius-sm)",
                                border: `1px solid ${active ? "var(--color-primary)" : "var(--border-light)"}`,
                                background: active ? "rgba(59, 130, 246, 0.08)" : "var(--bg-hover)",
                                color: "var(--text-main)",
                                cursor: "pointer",
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "flex-start",
                                gap: "4px",
                                textAlign: "left",
                                overflow: "hidden",
                              }}
                            >
                              <span
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  gap: "8px",
                                  width: "100%",
                                  fontSize: "0.75rem",
                                  fontWeight: 700,
                                }}
                              >
                                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {task.kind}
                                </span>
                                <span style={{ color, flexShrink: 0 }}>
                                  {task.status === "completed"
                                    ? "完成"
                                    : task.status === "failed"
                                      ? "失败"
                                      : task.status === "interrupted"
                                        ? "中断"
                                        : "运行"}
                                </span>
                              </span>
                              <span
                                title={task.input_summary || task.stage}
                                style={{
                                  maxWidth: "100%",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                  fontSize: "0.75rem",
                                  color: "var(--text-secondary)",
                                }}
                              >
                                {task.input_summary || task.stage}
                              </span>
                              <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
                                {formatTaskTime(task.updated_at || task.created_at)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div
                        style={{
                          padding: "14px",
                          borderRadius: "var(--radius-sm)",
                          border: "1px dashed var(--border-light)",
                          color: "var(--text-muted)",
                          fontSize: "0.875rem",
                          textAlign: "center",
                        }}
                      >
                        没有匹配的历史任务
                      </div>
                    )}

                    {filteredTaskHistory.length > taskHistoryPageSize && (
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" }}>
                        <button
                          type="button"
                          onClick={() => setTaskHistoryPage((prev) => Math.max(0, prev - 1))}
                          disabled={normalizedTaskHistoryPage === 0}
                          style={{
                            padding: "8px 12px",
                            borderRadius: "var(--radius-sm)",
                            border: "1px solid var(--border-light)",
                            background: "var(--bg-card)",
                            color: "var(--text-main)",
                            cursor: normalizedTaskHistoryPage === 0 ? "not-allowed" : "pointer",
                            opacity: normalizedTaskHistoryPage === 0 ? 0.5 : 1,
                          }}
                        >
                          上一页
                        </button>
                        <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                          第 {normalizedTaskHistoryPage + 1} / {taskHistoryPageCount} 页
                        </span>
                        <button
                          type="button"
                          onClick={() => setTaskHistoryPage((prev) => Math.min(taskHistoryPageCount - 1, prev + 1))}
                          disabled={normalizedTaskHistoryPage >= taskHistoryPageCount - 1}
                          style={{
                            padding: "8px 12px",
                            borderRadius: "var(--radius-sm)",
                            border: "1px solid var(--border-light)",
                            background: "var(--bg-card)",
                            color: "var(--text-main)",
                            cursor: normalizedTaskHistoryPage >= taskHistoryPageCount - 1 ? "not-allowed" : "pointer",
                            opacity: normalizedTaskHistoryPage >= taskHistoryPageCount - 1 ? 0.5 : 1,
                          }}
                        >
                          下一页
                        </button>
                      </div>
                    )}

                    {selectedTask && (
                      <div
                        style={{
                          padding: "12px 14px",
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid var(--border-light)",
                          background: "var(--bg-card)",
                          display: "flex",
                          flexDirection: "column",
                          gap: "6px",
                          userSelect: "text",
                          WebkitUserSelect: "text",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
                          <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-main)" }}>
                            {selectedTask.kind}
                          </span>
                          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                            {selectedTask.task_id}
                          </span>
                        </div>
                        <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>{selectedTask.stage}</div>
                        {renderTaskInputDetails(selectedTask)}
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                          {formatTaskTime(selectedTask.updated_at || selectedTask.created_at)}
                        </div>
                        {selectedTask.error && (
                          <div style={{ fontSize: "0.75rem", color: "#ef4444" }}>{selectedTask.error}</div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Card>
          )}

          {activeTab === "search" && renderSearchTab()}
          {activeTab === "collections" && renderCollectionsTab()}
          {activeTab === "following" && renderFollowingTab()}
          {false && renderManualCrawlTools()}
          {false && renderCommentsTab()}
        </div>
      </PageContent>
    </PageContainer>
  );
}
