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
  Plus,
  RefreshCw,
  X,
  Save,
  FolderDown,
  Trash2,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { PageContainer, PageHeader, PageContent, Card, EmptyState } from "../../components/Layout";
import { api } from "../../core/api";
import { isActionEnterKey } from "../../core/keyboard";
import { dirnamePath, formatLibraryLocation, withLocationSuffix } from "../../core/pathDisplay";
import { useStore } from "../../core/store";
import { useToast } from "../../components/Toast";
import { CookieGuide } from "../../components/ConfigHelp";
import {
  type CrawlNoteResponse,
  type CrawlBatchResponse,
  type XHSTaskStatus,
  type XHSAuthorCandidate,
  type XHSCreatorRecentResponse,
  type XHSSmartGroupOption,
  type XHSSmartGroupResult,
  xiaohongshuCancelTask,
  xiaohongshuGetConfig,
  xiaohongshuGetTaskStatus,
  xiaohongshuGetCookieFromBrowser,
  xiaohongshuListTasks,
  xiaohongshuSaveConfig,
  xiaohongshuSavePreviews,
  xiaohongshuSyncAuthorsToTracker,
  xiaohongshuStartCommentsTask,
  xiaohongshuStartCrawlBatchTask,
  xiaohongshuStartCrawlNoteTask,
  xiaohongshuStartCreatorRecentTask,
  xiaohongshuStartFollowingFeedTask,
  xiaohongshuStartSearchTask,
  xiaohongshuStartSmartGroupTask,
  xiaohongshuVerifyCookie,
} from "../../api/xiaohongshu";
import { SmartGroupActionButton } from "../../components/SmartGroupActionButton";
import { SharedSignalMappingPanel, type SharedSignalEntry } from "../../components/SharedSignalMappingPanel";
import {
  createCreatorMonitor,
  createFollowingScan,
  createFollowingScanMonitor,
  createKeywordMonitor,
  DEFAULT_XHS_RECENT_DAYS,
  formatKeywordInput,
  normalizeXhsTrackerConfig,
  parseKeywordInput,
  type XHSTrackerCreatorMonitor,
  type XHSTrackerFollowingScanMonitor,
  type XHSTrackerFollowingScan,
  type XHSTrackerKeywordMonitor,
} from "./trackerConfig";
import XiaohongshuNoteCard from "./XiaohongshuNoteCard";

interface XHSNote {
  id: string;
  title: string;
  content: string;
  author: string;
  author_id?: string;
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
  strategy?: string;
  comments: XHSComment[];
}

type TabType = "collections" | "search" | "following";
type AlbumCrawlMode = "incremental" | "full";
type BrowserChoice = "default" | "edge" | "chrome" | "brave" | "safari" | "firefox";
type NoteResultLayout = "horizontal" | "vertical";
const XIAOHONGSHU_TOOL_TAB_KEY = "xiaohongshu_tool_tab";
const CREATOR_BATCH_DELAY_SECONDS_RANGE = [20, 30] as const;
const XHS_CREATOR_RISK_MARKERS = [
  "访问频繁",
  "安全验证",
  "安全限制",
  "安全访问",
  "扫码",
  "请先登录",
  "登录后查看更多内容",
  "请稍后再试",
  "risk_limited",
  "manual_required",
  "auth_invalid",
];

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
const randomCreatorBatchDelaySeconds = () => {
  const [minSeconds, maxSeconds] = CREATOR_BATCH_DELAY_SECONDS_RANGE;
  return minSeconds + Math.floor(Math.random() * (maxSeconds - minSeconds + 1));
};
const isXhsCreatorRiskError = (value: unknown) => {
  const text = value instanceof Error ? value.message : String(value || "");
  return XHS_CREATOR_RISK_MARKERS.some((marker) => text.includes(marker));
};

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
    mode?: string;
    found?: number;
    saved?: number;
    skipped?: number;
    diagnostics?: {
      loaded_notes?: number;
      raw_seen_count?: number;
      valid_seen_count?: number;
      pruned_seen_count?: number;
      candidate_notes?: number;
      processable_notes?: number;
      recent_days?: number | null;
      before_date?: string | null;
      skip_breakdown?: {
        already_seen?: number;
        older_than_recent_days?: number;
        newer_than_before_date?: number;
        invalid_note?: number;
      };
    };
    error?: string;
  }>;
}

interface XHSCreatorProfile {
  author?: string;
  author_id?: string;
  profile_url?: string;
  pending_author_id?: boolean;
  recent_days?: number;
  sort_by?: "likes" | "time";
  smart_groups?: string[];
  smart_group_labels?: string[];
  latest_title?: string;
  sample_titles?: string[];
  sample_albums?: string[];
  sample_tags?: string[];
  sample_note_urls?: string[];
  source_summary?: string;
}

interface SharedCreatorGroupingSnapshot {
  updated_at?: string;
  signal_group_labels?: Record<string, string | string[]>;
  vault_signal_database?: {
    indexed_files?: number;
    signal_count?: number;
    database_path?: string;
    tag_index_path?: string;
    saved_at?: string;
  };
  shared_data_paths?: {
    tag_index_path?: string;
    shared_groups_path?: string;
    creator_profiles_path?: string;
  };
}

interface CreatorBatchTarget {
  profileId: string;
  author: string;
  authorId: string;
  query: string;
  groupValue?: string;
  groupLabel?: string;
}

interface CreatorBatchResultItem {
  target: CreatorBatchTarget;
  result?: XHSCreatorRecentResponse;
  error?: string;
}

export function XiaohongshuTool() {
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    const saved = localStorage.getItem(XIAOHONGSHU_TOOL_TAB_KEY);
    if (saved === "following" || saved === "search") return saved;
    return "collections";
  });
  const toast = useToast();
  const config = useStore((state) => state.config);

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
  const [minLikes, setMinLikes] = useState(100);
  const [searchLimit, setSearchLimit] = useState(20);
  const [searchRecentDays, setSearchRecentDays] = useState(DEFAULT_XHS_RECENT_DAYS);
  const [searchAutoSaveAfterFetch, setSearchAutoSaveAfterFetch] = useState(false);
  const [searchSaveComments, setSearchSaveComments] = useState(false);
  const [searchSaveCommentsLimit, setSearchSaveCommentsLimit] = useState(20);
  const [searchSaveCommentsSortBy, setSearchSaveCommentsSortBy] = useState<"likes" | "time">("likes");
  const [searchResult, setSearchResult] = useState<SearchResponse | null>(null);
  const [showSearchResults, setShowSearchResults] = useState(true);
  const [searchResultLayout, setSearchResultLayout] = useState<NoteResultLayout>("horizontal");
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());

  // Comments state
  const [noteId, setNoteId] = useState("");
  const [commentsResult, setCommentsResult] = useState<CommentsResponse | null>(null);
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());

  // Following feed state
  const [followingKeywords, setFollowingKeywords] = useState("");
  const [followingLimit, setFollowingLimit] = useState(20);
  const [followingRecentDays, setFollowingRecentDays] = useState(DEFAULT_XHS_RECENT_DAYS);
  const [followingAutoSaveAfterFetch, setFollowingAutoSaveAfterFetch] = useState(false);
  const [followingResult, setFollowingResult] = useState<FollowingFeedResponse | null>(null);
  const [showFollowingResults, setShowFollowingResults] = useState(true);
  const [followingResultLayout, setFollowingResultLayout] = useState<NoteResultLayout>("horizontal");
  const [expandedFollowingNotes, setExpandedFollowingNotes] = useState<Set<string>>(new Set());
  const [followingFeedTaskId, setFollowingFeedTaskId] = useState<string | null>(null);
  const [creatorSearchQuery, setCreatorSearchQuery] = useState("");
  const [creatorRecentDays, setCreatorRecentDays] = useState(DEFAULT_XHS_RECENT_DAYS);
  const [creatorRecentLimit, setCreatorRecentLimit] = useState(10);
  const [creatorRecentAutoSaveAfterFetch, setCreatorRecentAutoSaveAfterFetch] = useState(false);
  const [creatorRecentResult, setCreatorRecentResult] = useState<XHSCreatorRecentResponse | null>(null);
  const [creatorRecentResultLayout, setCreatorRecentResultLayout] = useState<NoteResultLayout>("horizontal");
  const [expandedCreatorRecentNotes, setExpandedCreatorRecentNotes] = useState<Set<string>>(new Set());
  const [creatorBatchResultLayout, setCreatorBatchResultLayout] = useState<NoteResultLayout>("horizontal");
  const [expandedCreatorBatchNotes, setExpandedCreatorBatchNotes] = useState<Set<string>>(new Set());
  const [creatorRecentTaskId, setCreatorRecentTaskId] = useState<string | null>(null);
  const [selectedCreatorBatchIds, setSelectedCreatorBatchIds] = useState<Set<string>>(new Set());
  const [creatorBatchResults, setCreatorBatchResults] = useState<CreatorBatchResultItem[]>([]);
  const [creatorBatchProgress, setCreatorBatchProgress] = useState<{
    completed: number;
    total: number;
    currentLabel: string;
  } | null>(null);

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
  const [albumRecentDaysInput, setAlbumRecentDaysInput] = useState("");
  const [albumCookieBrowser, setAlbumCookieBrowser] = useState<BrowserChoice>("default");
  const [albumDedicatedWindowMode, setAlbumDedicatedWindowMode] = useState(true);
  const [albumExtensionPort, setAlbumExtensionPort] = useState(9334);
  const [showAlbumRecoveryOptions, setShowAlbumRecoveryOptions] = useState(false);
  const [albumRecoveryMode, setAlbumRecoveryMode] = useState(true);
  const [albumBatchSize, setAlbumBatchSize] = useState(5);
  const [albumBatchPauseSeconds, setAlbumBatchPauseSeconds] = useState(30);
  const [albumProgress, setAlbumProgress] = useState<any | null>(null);
  const [albumListProgress, setAlbumListProgress] = useState<any | null>(null);
  const [albumListTaskId, setAlbumListTaskId] = useState<string | null>(null);
  const [albumCrawlTaskId, setAlbumCrawlTaskId] = useState<string | null>(null);
  const albumListTimerRef = useRef<number | null>(null);
  const albumCrawlTimerRef = useRef<number | null>(null);
  const followingResultTopRef = useRef<HTMLDivElement | null>(null);
  const followingResultBottomRef = useRef<HTMLDivElement | null>(null);
  const searchResultCarouselRef = useRef<HTMLDivElement | null>(null);
  const followingResultCarouselRef = useRef<HTMLDivElement | null>(null);
  const creatorRecentResultCarouselRef = useRef<HTMLDivElement | null>(null);
  const creatorBatchResultCarouselRef = useRef<HTMLDivElement | null>(null);
  const [, setTrackerKeywords] = useState<string[]>([]);
  const [trackerMaxResults, setTrackerMaxResults] = useState(20);
  const [trackerKeywordMinLikes, setTrackerKeywordMinLikes] = useState(500);
  const [trackerKeywordLimit, setTrackerKeywordLimit] = useState(10);
  const [trackerEnableKeywordSearch, setTrackerEnableKeywordSearch] = useState(true);
  const [trackerKeywordMonitors, setTrackerKeywordMonitors] = useState<XHSTrackerKeywordMonitor[]>([]);
  const [trackerFollowingScan, setTrackerFollowingScan] = useState<XHSTrackerFollowingScan>(createFollowingScan());
  const [trackerFollowingScanMonitors, setTrackerFollowingScanMonitors] = useState<XHSTrackerFollowingScanMonitor[]>([]);
  const [trackerKeywordDraft, setTrackerKeywordDraft] = useState("");
  const [trackerKeywordMonitorDrafts, setTrackerKeywordMonitorDrafts] = useState<Record<string, string>>({});
  const [trackerFollowingScanMonitorDrafts, setTrackerFollowingScanMonitorDrafts] = useState<Record<string, string>>({});
  const [trackerFollowingScanKeywordDraft, setTrackerFollowingScanKeywordDraft] = useState("");
  const [trackerCreatorMonitors, setTrackerCreatorMonitors] = useState<XHSTrackerCreatorMonitor[]>([]);
  const [trackerUserIds, setTrackerUserIds] = useState<string[]>([]);
  const [disabledCreatorIds, setDisabledCreatorIds] = useState<Set<string>>(new Set());
  const [trackerCreatorProfiles, setTrackerCreatorProfiles] = useState<Record<string, XHSCreatorProfile>>({});
  const [trackerCreatorNameMap, setTrackerCreatorNameMap] = useState<Record<string, {
    author?: string;
    author_id?: string;
    profile_url?: string;
    source?: string;
    updated_at?: string;
  }>>({});
  const [trackerCreatorGroups, setTrackerCreatorGroups] = useState<string[]>([]);
  const [trackerCreatorGroupOptions, setTrackerCreatorGroupOptions] = useState<XHSSmartGroupOption[]>([]);
  const [trackerCreatorPushEnabled, setTrackerCreatorPushEnabled] = useState(false);
  const [sharedSignalEntries, setSharedSignalEntries] = useState<SharedSignalEntry[]>([]);
  const [sharedCreatorGrouping, setSharedCreatorGrouping] = useState<SharedCreatorGroupingSnapshot>({});
  const [savingSignalMappings, setSavingSignalMappings] = useState(false);
  const [smartGroupResult, setSmartGroupResult] = useState<XHSSmartGroupResult | null>(null);
  const [showSharedGroupingDetail, setShowSharedGroupingDetail] = useState(false);
  const [showSharedSignalRules, setShowSharedSignalRules] = useState(false);
  const [showSharedCreatorGroupManager, setShowSharedCreatorGroupManager] = useState(false);
  const [expandedCreatorSelectorGroups, setExpandedCreatorSelectorGroups] = useState<Set<string>>(new Set());
  const [expandedSharedManagerGroups, setExpandedSharedManagerGroups] = useState<Set<string>>(new Set());
  const [expandedSharedManagerMembers, setExpandedSharedManagerMembers] = useState<Set<string>>(new Set());
  const [authorCandidates, setAuthorCandidates] = useState<XHSAuthorCandidate[]>([]);
  const [authorCandidateMeta, setAuthorCandidateMeta] = useState<{ totalNotes: number; message: string } | null>(null);
  const [showAllFrequentAuthors, setShowAllFrequentAuthors] = useState(false);
  const [frequentAuthorGroupFilter, setFrequentAuthorGroupFilter] = useState<string>("all");
  const [creatorMonitorGroupFilter, setCreatorMonitorGroupFilter] = useState<string>("all");
  const [creatorMonitorPage, setCreatorMonitorPage] = useState(0);
  const [showCreatorImportPanel, setShowCreatorImportPanel] = useState(false);
  const [showCreatorFilterPanel, setShowCreatorFilterPanel] = useState(false);
  const [showCreatorRecentWorkbench, setShowCreatorRecentWorkbench] = useState(false);
  const [showManualCrawlWorkbench, setShowManualCrawlWorkbench] = useState(false);
  const [sharedCreatorManagerQuery, setSharedCreatorManagerQuery] = useState("");
  const [sharedCreatorManagerPageSize, setSharedCreatorManagerPageSize] = useState<20 | 50>(20);
  const [sharedCreatorManagerPages, setSharedCreatorManagerPages] = useState<Record<string, number>>({});
  const [activeTaskKinds, setActiveTaskKinds] = useState<Set<string>>(new Set());
  const [backgroundTask, setBackgroundTask] = useState<{ kind: string; stage: string; taskId: string } | null>(null);
  const [taskHistory, setTaskHistory] = useState<XHSTaskStatus[]>([]);
  const [showTaskHistory, setShowTaskHistory] = useState(false);
  const [taskHistoryQuery, setTaskHistoryQuery] = useState("");
  const [taskHistoryPage, setTaskHistoryPage] = useState(0);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [expandedPushes, setExpandedPushes] = useState<Set<string>>(new Set(["creator"]));
  const [updatingSharedCreatorIds, setUpdatingSharedCreatorIds] = useState<Set<string>>(new Set());

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

  const browserLabelMap: Record<BrowserChoice, string> = {
    default: "默认浏览器",
    edge: "Edge",
    chrome: "Chrome",
    brave: "Brave",
    safari: "Safari",
    firefox: "Firefox",
  };

  const hasCookie = Boolean(fullCookie.trim() || webSession.trim() || backendCookieConfigured);
  const xhsBridgeOptions = {
    use_extension: true,
    extension_port: albumExtensionPort,
    dedicated_window_mode: albumDedicatedWindowMode,
  };
  const xhsCrawlFallbackOptions = {
    ...xhsBridgeOptions,
    use_cdp: true,
    cdp_port: 9222,
  };

  const formatStrategyLabel = (strategy?: string | null) => {
    switch (strategy) {
      case "extension_note_detail_map":
        return "插件详情 state";
      case "extension_state_tree_detail":
      case "extension_state_tree_note":
        return "插件页面 state 补抓";
      case "extension_dom_fallback":
        return "插件 DOM 补抓";
      case "extension_state_machine":
        return "插件评论状态机";
      case "plugin_state_urls":
        return "插件 state 媒体链接";
      case "plugin_dom_urls":
        return "插件 DOM 媒体链接";
      case "cdp_initial_state":
        return "CDP 详情兜底";
      case "cdp_state_urls":
        return "CDP 媒体链接";
      case "html_initial_state":
        return "后端 HTML/Initial State";
      case "html_state_urls":
        return "后端 HTML 媒体链接";
      default:
        return strategy || "未标记";
    }
  };

  const formatExecutionRoute = (payload?: {
    used_extension?: boolean;
    used_cdp?: boolean;
  } | null) => {
    if (payload?.used_extension) return "插件主链路";
    if (payload?.used_cdp) return "CDP 兜底";
    return "后端 HTML 兜底";
  };

  const normalizeAuthorKey = (value?: string | null) => String(value || "").trim().toLowerCase();

  const normalizeXhsProfileUserId = (value?: string | null) => {
    const cleanValue = String(value || "").trim();
    const profileMatch = cleanValue.match(/\/user\/profile\/([^/?#]+)/);
    return decodeURIComponent(profileMatch?.[1] || cleanValue).trim();
  };

  const buildXhsProfileUrl = (userId?: string | null) => {
    const cleanUserId = normalizeXhsProfileUserId(userId);
    return cleanUserId ? `https://www.xiaohongshu.com/user/profile/${encodeURIComponent(cleanUserId)}` : "";
  };

  const openExternalUrl = async (url?: string | null, label = "页面") => {
    const cleanUrl = String(url || "").trim();
    if (!cleanUrl) {
      toast.error(`${label}链接不存在`);
      return;
    }
    try {
      await openUrl(cleanUrl);
    } catch (e) {
      try {
        window.open(cleanUrl, "_blank", "noopener,noreferrer");
        return;
      } catch {
        // fall through
      }
      toast.error(`打开${label}失败`, e instanceof Error ? e.message : "未知错误");
    }
  };

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
    const normalized = normalizeXhsTrackerConfig(config);
    const keywordKeywords = Array.from(
      new Set(normalized.keywordMonitors.flatMap((monitor) => monitor.keywords))
    );
    const firstKeywordMonitor = normalized.keywordMonitors[0];
    const creatorProfiles = { ...(config.creator_profiles || {}) };
    normalized.creatorMonitors.forEach((monitor) => {
      if (!monitor.user_id) return;
      creatorProfiles[monitor.user_id] = {
        ...(creatorProfiles[monitor.user_id] || {}),
        author: monitor.author || monitor.label || monitor.user_id,
        author_id: monitor.user_id,
        smart_groups: monitor.smart_groups || [],
        smart_group_labels: monitor.smart_group_labels || [],
      };
    });

    setTrackerKeywords(keywordKeywords);
    setTrackerMaxResults(config.max_results ?? 20);
    setTrackerKeywordMinLikes(firstKeywordMonitor?.min_likes ?? config.keyword_min_likes ?? 500);
    setTrackerKeywordLimit(firstKeywordMonitor?.per_keyword_limit ?? config.keyword_search_limit ?? 10);
    setTrackerEnableKeywordSearch(normalized.keywordMonitors.some((monitor) => monitor.enabled));
    setTrackerKeywordMonitors(normalized.keywordMonitors);
    setTrackerFollowingScan(normalized.followingScan);
    setTrackerFollowingScanMonitors(normalized.followingScanMonitors);
    setTrackerKeywordDraft(keywordKeywords.join(", "));
    setTrackerKeywordMonitorDrafts(Object.fromEntries(
      normalized.keywordMonitors.map((monitor) => [monitor.id, monitor.keywords[0] || ""])
    ));
    setTrackerFollowingScanMonitorDrafts(Object.fromEntries(
      normalized.followingScanMonitors.map((monitor) => [monitor.id, monitor.keywords[0] || ""])
    ));
    setTrackerFollowingScanKeywordDraft(formatKeywordInput(
      normalized.followingScanMonitors.flatMap((monitor) => monitor.keywords),
    ));
    setTrackerCreatorMonitors(normalized.creatorMonitors);
    setTrackerUserIds(normalized.creatorMonitors.map((monitor) => monitor.user_id).filter(Boolean));
    setDisabledCreatorIds(new Set(normalized.creatorMonitors.filter((monitor) => !monitor.enabled).map((monitor) => monitor.user_id)));
    setTrackerCreatorProfiles(creatorProfiles);
    setTrackerCreatorNameMap(config.creator_name_map || {});
    setTrackerCreatorGroups(config.creator_groups || []);
    setTrackerCreatorGroupOptions(config.creator_group_options || []);
    setTrackerCreatorPushEnabled(config.creator_push_enabled ?? false);
    setSharedSignalEntries(config.shared_signal_entries || []);
    setSharedCreatorGrouping(config.shared_creator_grouping || {});
  };

  const buildTrackerConfigPayload = (overrides: {
    keyword_monitors?: XHSTrackerKeywordMonitor[];
    following_scan?: XHSTrackerFollowingScan;
    following_scan_monitors?: XHSTrackerFollowingScanMonitor[];
    creator_monitors?: XHSTrackerCreatorMonitor[];
    creator_groups?: string[];
    creator_push_enabled?: boolean;
  } = {}) => ({
    keyword_monitors: overrides.keyword_monitors ?? trackerKeywordMonitors,
    following_scan: overrides.following_scan ?? trackerFollowingScan,
    following_scan_monitors: overrides.following_scan_monitors ?? trackerFollowingScanMonitors,
    creator_monitors: overrides.creator_monitors ?? trackerCreatorMonitors,
    creator_groups: overrides.creator_groups ?? trackerCreatorGroups,
    creator_push_enabled: overrides.creator_push_enabled ?? trackerCreatorPushEnabled,
    max_results: trackerMaxResults,
  });

  const buildKeywordMonitorsFromKeywords = (
    keywords: string[],
    currentMonitors: XHSTrackerKeywordMonitor[] = trackerKeywordMonitors,
  ): XHSTrackerKeywordMonitor[] => {
    const normalizedKeywords = parseKeywordInput(keywords.join(", "));
    const existingByKeyword = new Map<string, XHSTrackerKeywordMonitor>();
    currentMonitors.forEach((monitor) => {
      const firstKeyword = (monitor.keywords[0] || "").trim().toLowerCase();
      if (firstKeyword) {
        existingByKeyword.set(firstKeyword, monitor);
      }
    });

    return normalizedKeywords.map((keyword) => {
      const existing = existingByKeyword.get(keyword.toLowerCase());
      return createKeywordMonitor({
        id: existing?.id,
        label: keyword,
        keywords: [keyword],
        enabled: existing?.enabled ?? true,
        min_likes: existing?.min_likes ?? trackerKeywordMinLikes,
        per_keyword_limit: existing?.per_keyword_limit ?? trackerKeywordLimit,
        include_comments: existing?.include_comments ?? false,
        comments_limit: existing?.comments_limit ?? 20,
        comments_sort_by: existing?.comments_sort_by ?? "likes",
      });
    });
  };

  const applyKeywordDraftToMonitors = (draftText: string) => {
    const keywords = parseKeywordInput(draftText);
    const nextMonitors = buildKeywordMonitorsFromKeywords(keywords);
    const normalizedDraft = formatKeywordInput(keywords);
    setTrackerKeywordDraft(normalizedDraft);
    setTrackerKeywords(keywords);
    setTrackerKeywordMonitors(nextMonitors);
    setTrackerKeywordMonitorDrafts(Object.fromEntries(
      nextMonitors.map((monitor) => [monitor.id, monitor.keywords[0] || ""])
    ));
    setTrackerEnableKeywordSearch(nextMonitors.some((monitor) => monitor.enabled));
    return nextMonitors;
  };

  const mergeKeywordsIntoKeywordMonitors = (keywords: string[]) => {
    const mergedKeywords = Array.from(new Set([
      ...trackerKeywordMonitors.flatMap((monitor) => monitor.keywords),
      ...parseKeywordInput(keywords.join(", ")),
    ]));
    return applyKeywordDraftToMonitors(formatKeywordInput(mergedKeywords));
  };

  const normalizeSingleKeywordDraft = (value: string) => {
    const [firstKeyword] = parseKeywordInput(value);
    return firstKeyword || "";
  };

  const commitKeywordMonitorDraft = (monitorId: string, draftText?: string) => {
    const rawText = draftText ?? trackerKeywordMonitorDrafts[monitorId] ?? "";
    const normalizedKeyword = normalizeSingleKeywordDraft(rawText);
    const normalizedDraft = normalizedKeyword;
    const nextMonitors = trackerKeywordMonitors.map((monitor) => (
      monitor.id === monitorId
        ? {
            ...monitor,
            keywords: normalizedKeyword ? [normalizedKeyword] : [],
            label: normalizedKeyword || monitor.label,
          }
        : monitor
    )).filter((monitor) => monitor.keywords.length > 0);
    const mergedKeywords = Array.from(
      new Set(nextMonitors.flatMap((monitor) => monitor.keywords).filter(Boolean))
    );
    setTrackerKeywordMonitorDrafts((prev) => ({
      ...prev,
      [monitorId]: normalizedDraft,
    }));
    setTrackerKeywordMonitors(nextMonitors);
    setTrackerKeywords(mergedKeywords);
    setTrackerKeywordDraft(formatKeywordInput(mergedKeywords));
    setTrackerEnableKeywordSearch(nextMonitors.some((monitor) => monitor.enabled));
  };

  const buildFollowingScanMonitorsFromKeywords = (
    keywords: string[],
    currentMonitors: XHSTrackerFollowingScanMonitor[] = trackerFollowingScanMonitors,
  ): XHSTrackerFollowingScanMonitor[] => {
    const normalizedKeywords = parseKeywordInput(keywords.join(", "));
    const existingByKeyword = new Map<string, XHSTrackerFollowingScanMonitor>();
    currentMonitors.forEach((monitor) => {
      const firstKeyword = (monitor.keywords[0] || "").trim().toLowerCase();
      if (firstKeyword) {
        existingByKeyword.set(firstKeyword, monitor);
      }
    });
    return normalizedKeywords.map((keyword) => {
      const existing = existingByKeyword.get(keyword.toLowerCase());
      return createFollowingScanMonitor({
        id: existing?.id,
        label: keyword,
        keywords: [keyword],
        enabled: existing?.enabled ?? trackerFollowingScan.enabled ?? true,
        fetch_limit: existing?.fetch_limit ?? trackerFollowingScan.fetch_limit,
        recent_days: existing?.recent_days ?? trackerFollowingScan.recent_days,
        sort_by: existing?.sort_by ?? trackerFollowingScan.sort_by,
        keyword_filter: true,
        include_comments: existing?.include_comments ?? trackerFollowingScan.include_comments,
        comments_limit: existing?.comments_limit ?? trackerFollowingScan.comments_limit,
        comments_sort_by: existing?.comments_sort_by ?? trackerFollowingScan.comments_sort_by,
      });
    });
  };

  const syncFollowingScanFromMonitors = (
    monitors: XHSTrackerFollowingScanMonitor[],
    baseScan: XHSTrackerFollowingScan = trackerFollowingScan,
  ) => {
    const primaryMonitor = monitors.find((monitor) => monitor.enabled) || monitors[0];
    const activeKeywords = Array.from(new Set(
      monitors
        .filter((monitor) => monitor.enabled)
        .flatMap((monitor) => monitor.keywords)
        .filter(Boolean),
    ));
    setTrackerFollowingScan({
      ...baseScan,
      enabled: monitors.some((monitor) => monitor.enabled),
      keywords: activeKeywords,
      fetch_limit: primaryMonitor?.fetch_limit ?? baseScan.fetch_limit,
      recent_days: primaryMonitor?.recent_days ?? baseScan.recent_days,
      sort_by: primaryMonitor?.sort_by ?? baseScan.sort_by,
      keyword_filter: true,
      include_comments: primaryMonitor?.include_comments ?? baseScan.include_comments,
      comments_limit: primaryMonitor?.comments_limit ?? baseScan.comments_limit,
      comments_sort_by: primaryMonitor?.comments_sort_by ?? baseScan.comments_sort_by,
    });
  };

  const applyFollowingScanDraftToMonitors = (draftText: string) => {
    const keywords = parseKeywordInput(draftText);
    const nextMonitors = buildFollowingScanMonitorsFromKeywords(keywords);
    const normalizedDraft = formatKeywordInput(keywords);
    setTrackerFollowingScanKeywordDraft(normalizedDraft);
    setTrackerFollowingScanMonitors(nextMonitors);
    setTrackerFollowingScanMonitorDrafts(Object.fromEntries(
      nextMonitors.map((monitor) => [monitor.id, monitor.keywords[0] || ""])
    ));
    syncFollowingScanFromMonitors(nextMonitors);
    return nextMonitors;
  };

  const mergeKeywordsIntoFollowingScanMonitors = (keywords: string[]) => {
    const mergedKeywords = Array.from(new Set([
      ...trackerFollowingScanMonitors.flatMap((monitor) => monitor.keywords),
      ...parseKeywordInput(keywords.join(", ")),
    ]));
    return applyFollowingScanDraftToMonitors(formatKeywordInput(mergedKeywords));
  };

  const commitFollowingScanMonitorDraft = (monitorId: string, draftText?: string) => {
    const rawText = draftText ?? trackerFollowingScanMonitorDrafts[monitorId] ?? "";
    const normalizedKeyword = normalizeSingleKeywordDraft(rawText);
    const normalizedDraft = normalizedKeyword;
    const nextMonitors = trackerFollowingScanMonitors.map((monitor) => (
      monitor.id === monitorId
        ? createFollowingScanMonitor({
            ...monitor,
            label: normalizedKeyword || monitor.label,
            keywords: normalizedKeyword ? [normalizedKeyword] : [],
          })
        : monitor
    )).filter((monitor) => monitor.keywords.length > 0);
    const mergedKeywords = Array.from(new Set(nextMonitors.flatMap((monitor) => monitor.keywords).filter(Boolean)));
    setTrackerFollowingScanMonitorDrafts((prev) => ({
      ...prev,
      [monitorId]: normalizedDraft,
    }));
    setTrackerFollowingScanMonitors(nextMonitors);
    setTrackerFollowingScanKeywordDraft(formatKeywordInput(mergedKeywords));
    syncFollowingScanFromMonitors(nextMonitors);
  };

  const commitFollowingScanMonitorsForSave = () => {
    const committedMonitors = trackerFollowingScanMonitors
      .map((monitor) => {
        const normalizedKeyword = normalizeSingleKeywordDraft(
          trackerFollowingScanMonitorDrafts[monitor.id] ?? (monitor.keywords[0] || ""),
        );
        return createFollowingScanMonitor({
          ...monitor,
          label: normalizedKeyword || monitor.label,
          keywords: normalizedKeyword ? [normalizedKeyword] : [],
          keyword_filter: true,
        });
      })
      .filter((monitor) => monitor.keywords.length > 0);
    const mergedKeywords = Array.from(new Set(committedMonitors.flatMap((monitor) => monitor.keywords).filter(Boolean)));
    setTrackerFollowingScanMonitors(committedMonitors);
    setTrackerFollowingScanMonitorDrafts(Object.fromEntries(
      committedMonitors.map((monitor) => [monitor.id, monitor.keywords[0] || ""])
    ));
    setTrackerFollowingScanKeywordDraft(formatKeywordInput(mergedKeywords));
    syncFollowingScanFromMonitors(committedMonitors);
    return committedMonitors;
  };

  const handleRemoveFollowingScanMonitor = (monitorId: string) => {
    const nextMonitors = trackerFollowingScanMonitors.filter((monitor) => monitor.id !== monitorId);
    const mergedKeywords = Array.from(new Set(nextMonitors.flatMap((monitor) => monitor.keywords).filter(Boolean)));
    setTrackerFollowingScanMonitors(nextMonitors);
    setTrackerFollowingScanMonitorDrafts((prev) => {
      const next = { ...prev };
      delete next[monitorId];
      return next;
    });
    setTrackerFollowingScanKeywordDraft(formatKeywordInput(mergedKeywords));
    syncFollowingScanFromMonitors(nextMonitors);
  };

  const buildFollowingScanPayload = (
    monitors: XHSTrackerFollowingScanMonitor[] = trackerFollowingScanMonitors,
    scan: XHSTrackerFollowingScan = trackerFollowingScan,
  ) => {
    const normalizedMonitors = monitors.map((monitor) => createFollowingScanMonitor({
      ...monitor,
      keyword_filter: true,
    })).filter((monitor) => monitor.keywords.length > 0);
    const primaryMonitor = normalizedMonitors.find((monitor) => monitor.enabled) || normalizedMonitors[0];
    const activeKeywords = Array.from(new Set(
      normalizedMonitors
        .filter((monitor) => monitor.enabled)
        .flatMap((monitor) => monitor.keywords)
        .filter(Boolean),
    ));
    return {
      followingScanMonitors: normalizedMonitors,
      followingScan: createFollowingScan({
        ...scan,
        enabled: normalizedMonitors.some((monitor) => monitor.enabled),
        keywords: activeKeywords,
        fetch_limit: primaryMonitor?.fetch_limit ?? scan.fetch_limit,
        recent_days: primaryMonitor?.recent_days ?? scan.recent_days,
        sort_by: primaryMonitor?.sort_by ?? scan.sort_by,
        keyword_filter: true,
        include_comments: primaryMonitor?.include_comments ?? scan.include_comments,
        comments_limit: primaryMonitor?.comments_limit ?? scan.comments_limit,
        comments_sort_by: primaryMonitor?.comments_sort_by ?? scan.comments_sort_by,
      }),
    };
  };

  const commitKeywordMonitorsForSave = () => {
    const committedMonitors = trackerKeywordMonitors
      .map((monitor) => {
        const normalizedKeyword = normalizeSingleKeywordDraft(
          trackerKeywordMonitorDrafts[monitor.id] ?? (monitor.keywords[0] || ""),
        );
        return createKeywordMonitor({
          ...monitor,
          label: normalizedKeyword || monitor.label,
          keywords: normalizedKeyword ? [normalizedKeyword] : [],
        });
      })
      .filter((monitor) => monitor.keywords.length > 0);
    const mergedKeywords = Array.from(
      new Set(committedMonitors.flatMap((monitor) => monitor.keywords).filter(Boolean))
    );
    setTrackerKeywordMonitors(committedMonitors);
    setTrackerKeywordMonitorDrafts(Object.fromEntries(
      committedMonitors.map((monitor) => [monitor.id, monitor.keywords[0] || ""])
    ));
    setTrackerKeywords(mergedKeywords);
    setTrackerKeywordDraft(formatKeywordInput(mergedKeywords));
    setTrackerEnableKeywordSearch(committedMonitors.some((monitor) => monitor.enabled));
    return committedMonitors;
  };

  const handleRemoveKeywordMonitor = (monitorId: string) => {
    const nextMonitors = trackerKeywordMonitors.filter((monitor) => monitor.id !== monitorId);
    const mergedKeywords = Array.from(
      new Set(nextMonitors.flatMap((monitor) => monitor.keywords).filter(Boolean))
    );
    setTrackerKeywordMonitors(nextMonitors);
    setTrackerKeywordMonitorDrafts((prev) => {
      const next = { ...prev };
      delete next[monitorId];
      return next;
    });
    setTrackerKeywords(mergedKeywords);
    setTrackerKeywordDraft(formatKeywordInput(mergedKeywords));
    setTrackerEnableKeywordSearch(nextMonitors.some((monitor) => monitor.enabled));
  };

  const handleSaveSharedSignalMappings = async (mapping: Record<string, string[]>) => {
    setSavingSignalMappings(true);
    try {
      await api.post("/api/modules/xiaohongshu-tracker/config", {
        shared_creator_grouping: {
          signal_group_labels: Object.fromEntries(
            Object.entries(mapping)
              .map(([signal, labels]) => [
                signal.trim(),
                [...new Set((labels || []).map((label) => String(label || "").trim()).filter(Boolean))],
              ])
              .filter(([signal, labels]) => signal && Array.isArray(labels) && labels.length > 0)
          ),
        },
      });
      await refreshTrackerConfig();
      toast.success("共享映射已保存", "下次执行“共享智能分组”会优先使用这份映射。");
    } catch (err) {
      toast.error("保存失败", err instanceof Error ? err.message : "未知错误");
    } finally {
      setSavingSignalMappings(false);
    }
  };

  // Persist cookies
  useEffect(() => {
    localStorage.setItem(XIAOHONGSHU_TOOL_TAB_KEY, activeTab);
  }, [activeTab]);

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
  const creatorRecentRunning = isTaskRunning("creator-recent");
  const creatorRecentBatchRunning = isTaskRunning("creator-recent-batch");
  const crawlNoteRunning = isTaskRunning("crawl-note");
  const crawlBatchRunning = isTaskRunning("crawl-batch");
  const previewSaveRunning = isTaskRunning("save-previews");
  const smartGroupRunning = isTaskRunning("smart-groups");

  useEffect(() => {
    if (!followingRunning) {
      setFollowingFeedTaskId(null);
    }
  }, [followingRunning]);

  useEffect(() => {
    if (!creatorRecentRunning) {
      setCreatorRecentTaskId(null);
    }
  }, [creatorRecentRunning]);

  const runBackgroundTask = async <T,>(
    kind: string,
    start: () => Promise<{ success: boolean; task_id: string }>,
    onComplete: (result: T) => void,
    successMessage: (result: T) => { title: string; description?: string },
    onStarted?: (taskId: string) => void,
  ) => {
    if (isTaskRunning(kind)) {
      toast.info("任务正在执行", "同类型任务完成后再启动新的。");
      return;
    }
    setTaskRunning(kind, true);
    try {
      const started = await start();
      onStarted?.(started.task_id);
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
          if (progress.status === "cancelled" || progress.status === "interrupted") {
            toast.info("任务已停止", progress.stage || "已中断");
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

  const normalizeFollowingLimit = (value: unknown) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return 20;
    return Math.max(1, Math.min(300, Math.round(parsed)));
  };

  const scrollToAnchor = (ref: React.RefObject<HTMLDivElement | null>) => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const scrollNoteCarousel = (ref: React.RefObject<HTMLDivElement | null>, direction: -1 | 1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: direction * Math.max(320, el.clientWidth - 80), behavior: "smooth" });
  };

  useEffect(() => {
    const handleNoteCarouselKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      const direction = key === "arrowleft" || key === "q" ? -1 : key === "arrowright" || key === "e" ? 1 : 0;
      if (!direction) return;

      const activeCarouselRef = activeTab === "following"
        ? followingResultCarouselRef
        : activeTab === "search"
          ? searchResultCarouselRef
          : (creatorRecentResultCarouselRef.current ? creatorRecentResultCarouselRef : creatorBatchResultCarouselRef.current ? creatorBatchResultCarouselRef : null);
      if (!activeCarouselRef?.current) return;

      event.preventDefault();
      scrollNoteCarousel(activeCarouselRef, direction as -1 | 1);
    };

    document.addEventListener("keydown", handleNoteCarouselKeyDown, { capture: true });
    return () => document.removeEventListener("keydown", handleNoteCarouselKeyDown, { capture: true });
  }, [activeTab]);

  const handleGetCookieFromBrowser = async (browser: BrowserChoice = albumCookieBrowser) => {
    setGettingCookie(true);
    try {
      const res = await xiaohongshuGetCookieFromBrowser({ browser });
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

  const handleClearXhsLocalCache = () => {
    localStorage.removeItem("xiaohongshu_album_cache");
    localStorage.removeItem("xiaohongshu_websession");
    localStorage.removeItem("xiaohongshu_idtoken");
    localStorage.removeItem("xiaohongshu_full_cookie");
    setAlbums([]);
    setSelectedAlbumIds(new Set());
    setAlbumResult(null);
    setAlbumListProgress(null);
    setAlbumProgress(null);
    setWebSession("");
    setIdToken("");
    setFullCookie("");
    setCookieVerified(false);
    setBackendCookieConfigured(false);
    toast.success("本地缓存已清空", "已清空 ABO 保存的小红书专辑和 Cookie 缓存，请重新登录并更新 Cookie");
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
      const shouldAutoSave = searchAutoSaveAfterFetch;
      await runBackgroundTask<SearchResponse>(
        "search",
        () => xiaohongshuStartSearchTask({
          keyword: searchKeyword.trim(),
          max_results: Math.max(1, Math.min(300, searchLimit || 20)),
          min_likes: minLikes,
          sort_by: "comprehensive",
          recent_days: Math.max(1, Math.min(365, searchRecentDays || DEFAULT_XHS_RECENT_DAYS)),
          cookie: buildCookie() || undefined,
          ...xhsBridgeOptions,
        }),
        (result) => {
          setSearchResult(result);
          setShowSearchResults(true);
          if (shouldAutoSave && result.notes.length > 0) {
            void handleSaveSearchResults(result.notes, result.keyword);
          }
        },
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
          ...xhsBridgeOptions,
          load_all_comments: true,
          click_more_replies: true,
          max_replies_threshold: 10,
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
      const keywords = parseKeywordInput(followingKeywords);
      const keywordLabel = keywords.join("，") || followingKeywords.trim();
      const shouldAutoSave = followingAutoSaveAfterFetch;
      await runBackgroundTask<FollowingFeedResponse>(
        "following-feed",
        () => xiaohongshuStartFollowingFeedTask({
          cookie: buildCookie() || undefined,
          keywords,
          max_notes: normalizeFollowingLimit(followingLimit),
          recent_days: Math.max(1, Math.min(365, followingRecentDays || DEFAULT_XHS_RECENT_DAYS)),
          sort_by: "time",
          ...xhsBridgeOptions,
        }),
        (result) => {
          setFollowingResult(result);
          setShowFollowingResults(true);
          setExpandedFollowingNotes(new Set());
          if (shouldAutoSave && result.notes.length > 0) {
            void handleSaveFollowingResults(result.notes, keywordLabel);
          }
        },
        (result) => ({ title: `已关注筛选中找到 ${result.total_found} 条匹配结果` }),
        (taskId) => setFollowingFeedTaskId(taskId),
      );
    } catch (e) {
      console.error("获取关注流关键词结果失败:", e);
      setFollowingFeedTaskId(null);
      toast.error("获取关注流关键词结果失败", e instanceof Error ? e.message : "未知错误");
    }
  };

  const runCreatorRecentFetch = async (
    nextCreatorQuery = creatorSearchQuery,
    overrides: { recentDays?: number; maxNotes?: number } = {},
  ) => {
    const trimmedQuery = String(nextCreatorQuery || "").trim();
    if (!trimmedQuery) {
      toast.error("请输入博主名称、主页链接或 user_id");
      return;
    }
    if (!requireCookie()) {
      return;
    }
    const recentDays = Math.max(1, Math.min(365, overrides.recentDays ?? creatorRecentDays ?? DEFAULT_XHS_RECENT_DAYS));
    const maxNotes = Math.max(1, Math.min(50, overrides.maxNotes ?? creatorRecentLimit ?? 10));
    const shouldAutoSave = creatorRecentAutoSaveAfterFetch;
    setCreatorSearchQuery(trimmedQuery);
    setCreatorRecentDays(recentDays);
    setCreatorRecentLimit(maxNotes);
    setShowCreatorRecentWorkbench(true);
    setCreatorRecentResult(null);
    setCreatorBatchResults([]);
    try {
      await runBackgroundTask<XHSCreatorRecentResponse>(
        "creator-recent",
        () => xiaohongshuStartCreatorRecentTask({
          creator_query: trimmedQuery,
          cookie: buildCookie() || undefined,
          recent_days: recentDays,
          max_notes: maxNotes,
          use_extension: true,
          extension_port: albumExtensionPort,
          dedicated_window_mode: albumDedicatedWindowMode,
          manual_current_tab: false,
          require_extension_success: true,
        }),
        (result) => {
          setCreatorRecentResult(result);
          setCreatorRecentTaskId(null);
          focusCreatorRecentResults();
          if (shouldAutoSave && result.notes.length > 0) {
            void handleSaveCreatorRecentNotes(
              result.notes,
              result.resolved_author || result.creator_query,
              "博主最近动态已入库",
            );
          }
        },
        (result) => ({
          title: `${result.resolved_author || result.resolved_user_id} 最近 ${result.recent_days} 天 ${result.total_found} 条`,
        }),
        (taskId) => setCreatorRecentTaskId(taskId),
      );
    } catch (e) {
      console.error("抓取指定博主失败:", e);
      setCreatorRecentTaskId(null);
      toast.error("抓取指定博主失败", e instanceof Error ? e.message : "未知错误");
    }
  };

  const handleFetchCreatorRecent = async () => {
    await runCreatorRecentFetch();
  };

  const waitForTaskResult = async <T,>(taskId: string): Promise<T> => {
    while (true) {
      const progress = await xiaohongshuGetTaskStatus<T>(taskId);
      if (progress.status === "completed" && progress.result) {
        return progress.result;
      }
      if (progress.status === "failed") {
        throw new Error(progress.error || progress.stage || "任务执行失败");
      }
      if (progress.status === "cancelled" || progress.status === "interrupted") {
        throw new Error(progress.stage || "任务已停止");
      }
      await new Promise((resolve) => window.setTimeout(resolve, 800));
    }
  };

  const fetchCreatorRecentDirect = async (
    creatorQuery: string,
    recentDays: number,
    maxNotes: number,
  ): Promise<XHSCreatorRecentResponse> => {
    const started = await xiaohongshuStartCreatorRecentTask({
      creator_query: creatorQuery,
      cookie: buildCookie() || undefined,
      recent_days: recentDays,
      max_notes: maxNotes,
      use_extension: true,
      extension_port: albumExtensionPort,
      dedicated_window_mode: albumDedicatedWindowMode,
      manual_current_tab: false,
      require_extension_success: true,
    });
    return waitForTaskResult<XHSCreatorRecentResponse>(started.task_id);
  };

  const handleCancelFollowingFeed = async () => {
    if (!followingFeedTaskId) return;
    try {
      await xiaohongshuCancelTask(followingFeedTaskId);
      toast.info("已发送停止指令", "关注流关键词搜索正在中断。");
    } catch (e) {
      toast.error("停止失败", e instanceof Error ? e.message : "未知错误");
    }
  };

  const handleCancelCreatorRecent = async () => {
    if (!creatorRecentTaskId) return;
    try {
      await xiaohongshuCancelTask(creatorRecentTaskId);
      toast.info("已发送停止指令", "指定 UP 主抓取正在中断。");
    } catch (e) {
      toast.error("停止失败", e instanceof Error ? e.message : "未知错误");
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
          ...xhsCrawlFallbackOptions,
        }),
        (result) => setCrawlResult(result),
        (result) => ({
          title: "已保存到 xhs",
          description: formatLibraryLocation(result.markdown_path, "vault", config),
        }),
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
          ...xhsCrawlFallbackOptions,
        }),
        (result) => setBatchResult(result),
        (result) => {
          const firstSavedResult = result.results.find((item): item is CrawlNoteResponse => item.success === true);
          return {
            title: "批量入库完成",
            description: withLocationSuffix(
              `成功 ${result.saved} 条，失败 ${result.failed} 条`,
              firstSavedResult?.xhs_dir || firstSavedResult?.markdown_path,
              "vault",
              config,
            ),
          };
        },
      );
    } catch (e) {
      console.error("Crawl batch failed:", e);
      toast.error("批量入库失败", e instanceof Error ? e.message : "请检查链接或 Cookie");
    }
  };

  const buildSaveSubfolderName = (raw: string, fallback: string) => {
    const compact = raw.trim().replace(/\s+/g, " ");
    return compact || fallback;
  };

  const buildKeywordSaveSubfolder = (keyword: string) => buildSaveSubfolderName(
    `关键词扫描/${keyword}`,
    "关键词扫描/未命名关键词",
  );

  const buildFollowingSaveSubfolder = (keywordLabel: string) => buildSaveSubfolderName(
    `关注流扫描/${keywordLabel}`,
    "关注流扫描/未命名关键词",
  );

  const buildCreatorSaveSubfolder = (rawLabel: string) => buildSaveSubfolderName(
    `指定用户扫描/${rawLabel}`,
    "指定用户扫描/未命名用户",
  );

  const keywordLabelFromFollowingResult = (result: FollowingFeedResponse, fallback: string) => {
    const keywords = Array.from(new Set(
      result.notes.flatMap((note) => note.matched_keywords || []).map((keyword) => keyword.trim()).filter(Boolean),
    ));
    return keywords.join("，") || parseKeywordInput(fallback).join("，") || fallback;
  };

  const focusCreatorRecentResults = () => {
    setExpandedCreatorSelectorGroups(new Set());
    setShowCreatorRecentWorkbench(false);
  };

  const handleSavePreviewNotesWithOptions = async (
    notes: XHSNote[],
    options: {
      subfolder?: string;
      successTitle?: string;
      includeComments?: boolean;
      commentsLimit?: number;
      commentsSortBy?: "likes" | "time";
      emptyMessage?: string;
    },
  ) => {
    const targetNotes = notes.filter((note) => note.url);
    if (targetNotes.length === 0) {
      toast.error(options.emptyMessage || "没有可入库的搜索结果");
      return;
    }
    if (previewSaveRunning) {
      toast.info("预览入库正在执行");
      return;
    }
    setTaskRunning("save-previews", true);
    try {
      const result = await xiaohongshuSavePreviews({
        notes: targetNotes,
        subfolder: options.subfolder,
        ...xhsCrawlFallbackOptions,
        download_images_mode: "always",
        save_strategy: "card",
        short_content_threshold: 120,
        include_comments: Boolean(options.includeComments),
        comments_limit: options.includeComments ? Math.max(1, options.commentsLimit || 20) : 0,
        comments_sort_by: options.includeComments ? (options.commentsSortBy || "likes") : "likes",
      });
      const status: XHSTaskStatus["status"] = result.failed > 0 ? "failed" : "completed";
      toast.success(
        options.successTitle || "已保存到 xhs",
        withLocationSuffix(`成功 ${result.saved} 条，失败 ${result.failed} 条`, result.xhs_dir, "vault", config),
      );
      setTaskHistory((prev) => [
        {
          task_id: `preview-${Date.now()}`,
          kind: "save-previews",
          status,
          stage: `统一入库完成：成功 ${result.saved} 条，失败 ${result.failed} 条`,
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

  const handleSaveCreatorRecentNotes = async (
    notes: XHSNote[],
    rawSubfolder: string,
    successTitle: string,
  ) => {
    await handleSavePreviewNotesWithOptions(notes, {
      subfolder: buildCreatorSaveSubfolder(rawSubfolder),
      successTitle,
      emptyMessage: "没有可入库的博主动态",
    });
  };

  const handleSaveSearchResults = async (notes: XHSNote[], keyword: string) => {
    await handleSavePreviewNotesWithOptions(notes, {
      subfolder: buildKeywordSaveSubfolder(keyword),
      successTitle: "关键词结果已入库",
      includeComments: searchSaveComments,
      commentsLimit: searchSaveCommentsLimit,
      commentsSortBy: searchSaveCommentsSortBy,
      emptyMessage: "没有可入库的关键词结果",
    });
  };

  const handleSaveFollowingResults = async (notes: XHSNote[], keywordLabel: string) => {
    await handleSavePreviewNotesWithOptions(notes, {
      subfolder: buildFollowingSaveSubfolder(keywordLabel),
      successTitle: "关注流搜索结果已入库",
      includeComments: searchSaveComments,
      commentsLimit: searchSaveCommentsLimit,
      commentsSortBy: searchSaveCommentsSortBy,
      emptyMessage: "没有可入库的关注流结果",
    });
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
        background: !albumDedicatedWindowMode,
        allow_cdp_fallback: false,
        ...xhsBridgeOptions,
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
              if (!raw) return undefined;
              const next = Number(raw);
              if (!Number.isFinite(next)) return undefined;
              return Math.max(1, Math.min(3650, next));
            })(),
        crawl_mode: mode,
        batch_size: albumRecoveryMode ? Math.max(1, Math.min(20, albumBatchSize || 5)) : undefined,
        batch_pause_seconds: albumRecoveryMode ? Math.max(10, Math.min(180, albumBatchPauseSeconds || 30)) : undefined,
        cdp_port: 9222,
        ...xhsBridgeOptions,
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
            const failedCount = Number(progress.result?.failed || 0);
            const savedCount = Number(progress.result?.saved || 0);
            const skippedCount = Number(progress.result?.skipped || 0);
            const firstFailedItem = Array.isArray(progress.result?.results)
              ? progress.result.results.find((item: any) => !item?.success)
              : null;
            const failureDetail = firstFailedItem?.error ? `；原因：${firstFailedItem.error}` : "";
            if (failedCount > 0) {
              toast.error(
                `专辑${mode === "full" ? "全量" : "增量"}抓取结束`,
                withLocationSuffix(
                  `新增 ${savedCount} 条，跳过 ${skippedCount} 条，失败 ${failedCount} 条；已保留当前专辑列表${failureDetail}`,
                  dirnamePath(progress.result?.progress_path),
                  "vault",
                  config,
                ),
              );
            } else {
              toast.success(
                `专辑${mode === "full" ? "全量" : "增量"}抓取完成`,
                withLocationSuffix(
                  `新增 ${savedCount} 条，跳过 ${skippedCount} 条；已保留当前专辑列表`,
                  dirnamePath(progress.result?.progress_path),
                  "vault",
                  config,
                ),
              );
            }
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
      const draftKeywords = parseKeywordInput(trackerKeywordDraft);
      const nextKeywordMonitors = draftKeywords.length > 0
        ? applyKeywordDraftToMonitors(trackerKeywordDraft)
        : commitKeywordMonitorsForSave();
      await api.post("/api/modules/xiaohongshu-tracker/config", buildTrackerConfigPayload({
        keyword_monitors: nextKeywordMonitors,
      }));
      toast.success("情报推送已保存", "模块管理会按定时任务抓取这些定义");
      await refreshTrackerConfig();
      setExpandedPushes((prev) => new Set(prev).add("keyword"));
    } catch (e) {
      toast.error("保存失败", e instanceof Error ? e.message : "未知错误");
    }
  };

  const handleToggleKeywordPush = async () => {
    const draftKeywords = parseKeywordInput(trackerKeywordDraft);
    const existingMonitors = draftKeywords.length > 0
      ? applyKeywordDraftToMonitors(trackerKeywordDraft)
      : commitKeywordMonitorsForSave();
    if (existingMonitors.length === 0) {
      toast.error("请先添加至少一个关键词定义");
      return;
    }
    const next = !trackerEnableKeywordSearch;
    const nextKeywordMonitors = existingMonitors.map((monitor) => ({
      ...monitor,
      enabled: next,
    }));
    try {
      await api.post("/api/modules/xiaohongshu-tracker/config", buildTrackerConfigPayload({
        keyword_monitors: nextKeywordMonitors,
      }));
      await refreshTrackerConfig();
      toast.success(next ? "情报推送已开启" : "情报推送已关闭");
    } catch (e) {
      toast.error("保存失败", e instanceof Error ? e.message : "未知错误");
    }
  };

  const handleDeleteKeywordPush = async () => {
    try {
      setTrackerKeywordDraft("");
      setTrackerKeywordMonitorDrafts({});
      setTrackerKeywordMonitors([]);
      setTrackerKeywords([]);
      setTrackerEnableKeywordSearch(false);
      await api.post("/api/modules/xiaohongshu-tracker/config", buildTrackerConfigPayload({
        keyword_monitors: [],
      }));
      await refreshTrackerConfig();
      setExpandedPushes((prev) => {
        const next = new Set(prev);
        next.delete("keyword");
        return next;
      });
      toast.success("情报推送已删除");
    } catch (e) {
      toast.error("删除失败", e instanceof Error ? e.message : "未知错误");
    }
  };

  const handleToggleCreatorPush = async () => {
    const baseCreatorMonitors = trackerCreatorMonitors.length > 0 ? trackerCreatorMonitors : creatorEntries;
    const next = !baseCreatorMonitors.some((monitor) => monitor.enabled);
    const nextCreatorMonitors = baseCreatorMonitors.map((monitor) => ({ ...monitor, enabled: next }));
    try {
      await api.post("/api/modules/xiaohongshu-tracker/config", buildTrackerConfigPayload({
        creator_monitors: nextCreatorMonitors,
        creator_push_enabled: next,
      }));
      await refreshTrackerConfig();
      toast.success(next ? "全部博主已开启" : "全部博主已关闭");
    } catch (e) {
      toast.error("保存失败", e instanceof Error ? e.message : "未知错误");
    }
  };

  const handleDeleteCreatorPush = async () => {
    try {
      await api.post("/api/modules/xiaohongshu-tracker/config", buildTrackerConfigPayload({
        creator_monitors: [],
        creator_groups: [],
        creator_push_enabled: false,
      }));
      await refreshTrackerConfig();
      setExpandedPushes((prev) => {
        const next = new Set(prev);
        next.delete("creator");
        return next;
      });
      toast.success("特定关注已删除");
    } catch (e) {
      toast.error("删除失败", e instanceof Error ? e.message : "未知错误");
    }
  };

  const handleToggleCreatorUser = async (userId: string) => {
    const normalizedUserId = normalizeXhsProfileUserId(userId);
    const baseCreatorMonitors = trackerCreatorMonitors.length > 0 ? trackerCreatorMonitors : creatorEntries;
    const nextCreatorMonitors = baseCreatorMonitors.map((monitor) => (
      normalizeXhsProfileUserId(monitor.user_id) === normalizedUserId
        ? { ...monitor, enabled: !monitor.enabled }
        : monitor
    ));
    try {
      await api.post("/api/modules/xiaohongshu-tracker/config", buildTrackerConfigPayload({
        creator_monitors: nextCreatorMonitors,
      }));
      await refreshTrackerConfig();
    } catch (e) {
      toast.error("保存失败", e instanceof Error ? e.message : "未知错误");
    }
  };

  const handleRemoveCreatorUser = async (userId: string) => {
    const normalizedUserId = normalizeXhsProfileUserId(userId);
    const baseCreatorMonitors = trackerCreatorMonitors.length > 0 ? trackerCreatorMonitors : creatorEntries;
    const nextCreatorMonitors = baseCreatorMonitors.filter((monitor) => normalizeXhsProfileUserId(monitor.user_id) !== normalizedUserId);
    try {
      await api.post("/api/modules/xiaohongshu-tracker/config", buildTrackerConfigPayload({
        creator_monitors: nextCreatorMonitors,
      }));
      await refreshTrackerConfig();
      toast.success("博主已移除");
    } catch (e) {
      toast.error("删除失败", e instanceof Error ? e.message : "未知错误");
    }
  };

  const handleRemoveCreatorMonitor = async (creatorMonitor: XHSTrackerCreatorMonitor) => {
    if (creatorMonitor.user_id) {
      await handleRemoveCreatorUser(creatorMonitor.user_id);
      return;
    }
    const nextCreatorMonitors = trackerCreatorMonitors.filter((monitor) => monitor.id !== creatorMonitor.id);
    setTrackerCreatorMonitors(nextCreatorMonitors);
  };

  const handleClearCreatorMonitors = async (scope: "all" | "filtered" | "page") => {
    const baseCreatorMonitors = trackerCreatorMonitors.length > 0 ? trackerCreatorMonitors : creatorEntries;
    const removeIds = new Set(
      (scope === "all" ? baseCreatorMonitors : scope === "filtered" ? filteredCreatorEntries : visibleCreatorEntries)
        .map((monitor) => monitor.id),
    );
    if (removeIds.size === 0) {
      toast.info("当前没有可删除的关注");
      return;
    }
    const nextCreatorMonitors = scope === "all"
      ? []
      : baseCreatorMonitors.filter((monitor) => !removeIds.has(monitor.id));
    try {
      await api.post("/api/modules/xiaohongshu-tracker/config", buildTrackerConfigPayload({
        creator_monitors: nextCreatorMonitors,
        creator_push_enabled: nextCreatorMonitors.length > 0 ? trackerCreatorPushEnabled : false,
      }));
      await refreshTrackerConfig();
      setCreatorMonitorPage(0);
      toast.success("关注已批量删除", `删除 ${removeIds.size} 个博主`);
    } catch (e) {
      toast.error("批量删除失败", e instanceof Error ? e.message : "未知错误");
    }
  };

  const handleImportCreatorGroup = async (groupValue: string) => {
    const group = visibleSharedCreatorGroups.find((item) => item.value === groupValue);
    if (!group) return;
    const currentMonitors = trackerCreatorMonitors.length > 0 ? trackerCreatorMonitors : creatorEntries;
    const existingIds = new Set(currentMonitors.map((monitor) => normalizeXhsProfileUserId(monitor.user_id)).filter(Boolean));
    const importedMonitors = group.members
      .filter((member) => member.authorId && !existingIds.has(normalizeXhsProfileUserId(member.authorId)))
      .map((member) => createCreatorMonitor({
        user_id: member.authorId,
        label: member.author,
        author: member.author,
        enabled: true,
        smart_groups: member.profile.smart_groups || [],
        smart_group_labels: member.profile.smart_group_labels || [],
      }));
    if (importedMonitors.length === 0) {
      toast.info("这个智能分组里的博主都已添加");
      return;
    }
    const nextCreatorMonitors = [...currentMonitors, ...importedMonitors];
    try {
      await api.post("/api/modules/xiaohongshu-tracker/config", buildTrackerConfigPayload({
        creator_monitors: nextCreatorMonitors,
      }));
      await refreshTrackerConfig();
      setCreatorMonitorGroupFilter(groupValue);
      setCreatorMonitorPage(0);
      setExpandedPushes((prev) => new Set(prev).add("creator"));
      toast.success("已从智能分组导入", `新增 ${importedMonitors.length} 个博主`);
    } catch (e) {
      toast.error("导入失败", e instanceof Error ? e.message : "未知错误");
    }
  };

  const handleRunSharedSmartGroups = async (mode: "full" | "creator-only" = "full") => {
    try {
      await runBackgroundTask<XHSSmartGroupResult>(
        "smart-groups",
        () => xiaohongshuStartSmartGroupTask({
          cookie: buildCookie() || undefined,
          resolve_author_ids: Boolean(buildCookie()),
          resolve_limit: 0,
          mode,
        }),
        (result) => {
          setSmartGroupResult(result);
          setAuthorCandidates(result.xhs_candidates || []);
          setAuthorCandidateMeta({
            totalNotes: result.total_notes || 0,
            message: result.xhs_candidate_message || result.message,
          });
          setFrequentAuthorGroupFilter("all");
          setShowAllFrequentAuthors(false);
          void refreshTrackerConfig();
          setExpandedPushes((prev) => new Set(prev).add("creator"));
        },
        (result) => ({
          title: result.workflow_mode === "creator-only"
            ? "博主 / UP 已重新整理"
            : (result.already_grouped ? "智能分组已增量更新" : "智能分组已生成"),
          description: result.message,
        }),
      );
    } catch (e) {
      toast.error("智能分组失败", e instanceof Error ? e.message : "未知错误");
    }
  };

  const handleBuildSmartGroups = async () => {
    await handleRunSharedSmartGroups("full");
  };

  const handleRefreshSharedCreatorAssignments = async () => {
    await handleRunSharedSmartGroups("creator-only");
  };

  const handleAddFrequentAuthorToCreatorMonitor = async (candidate: XHSAuthorCandidate) => {
    if (!candidate.author_id) {
      toast.error("这个博主还没解析出 user_id", "先重新执行一次“共享智能分组”。");
      return;
    }
    if (trackerCreatorMonitors.some((monitor) => monitor.user_id === candidate.author_id)) {
      setExpandedPushes((prev) => new Set(prev).add("creator"));
      toast.info("这个博主已经在指定关注里");
      return;
    }
    try {
      const result = await xiaohongshuSyncAuthorsToTracker([
        {
          author: candidate.author,
          author_id: candidate.author_id,
          latest_title: candidate.latest_title,
          sample_titles: candidate.sample_titles,
          sample_albums: candidate.sample_albums || [],
          sample_tags: candidate.sample_tags || [],
          source_summary: candidate.source_summary || "",
        },
      ]);
      await refreshTrackerConfig();
      setExpandedPushes((prev) => new Set(prev).add("creator"));
      toast.success("已加入指定关注爬取", `新增 ${result.added_count} 个博主，当前总数 ${result.total_user_ids}`);
    } catch (e) {
      toast.error("加入失败", e instanceof Error ? e.message : "未知错误");
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

  const renderHorizontalNoteResults = ({
    notes,
    carouselRef,
    layout,
    onLayoutChange,
    expandedIds,
    onToggleExpand,
    saveSubfolder,
    saveSuccessTitle,
    saveAllSubfolder,
    saveAllSuccessTitle,
    creatorSourceLabel,
    showMatchedKeywords = false,
  }: {
    notes: Array<XHSNote & { matched_keywords?: string[] }>;
    carouselRef: React.RefObject<HTMLDivElement | null>;
    layout: NoteResultLayout;
    onLayoutChange: (layout: NoteResultLayout) => void;
    expandedIds: Set<string>;
    onToggleExpand: (noteId: string) => void;
    saveSubfolder: (note: XHSNote & { matched_keywords?: string[] }) => string;
    saveSuccessTitle: string;
    saveAllSubfolder: string;
    saveAllSuccessTitle: string;
    creatorSourceLabel: (note: XHSNote & { matched_keywords?: string[] }) => { tags: string[]; summary: string };
    showMatchedKeywords?: boolean;
  }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "10px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
          {layout === "horizontal"
            ? "结果已整理成横向轨道。可左右滑动，或用 Q / E、← / → 快速翻页。"
            : "结果已切回竖向原版卡片。适合逐条细看、连续入库和对比详情。"}
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => onLayoutChange(layout === "horizontal" ? "vertical" : "horizontal")}
            style={segmentedButtonStyle(layout === "vertical")}
          >
            {layout === "horizontal" ? "切到竖排" : "切到横排"}
          </button>
          <button
            type="button"
            onClick={() => void handleSavePreviewNotesWithOptions(notes, {
              subfolder: saveAllSubfolder,
              successTitle: saveAllSuccessTitle,
              includeComments: searchSaveComments,
              commentsLimit: searchSaveCommentsLimit,
              commentsSortBy: searchSaveCommentsSortBy,
              emptyMessage: "没有可入库的搜索结果",
            })}
            disabled={previewSaveRunning || notes.length === 0}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 14px",
              borderRadius: "var(--radius-sm)",
              border: "none",
              background: previewSaveRunning || notes.length === 0 ? "var(--bg-hover)" : "var(--color-primary)",
              color: "white",
              fontSize: "0.8125rem",
              fontWeight: 600,
              cursor: previewSaveRunning || notes.length === 0 ? "not-allowed" : "pointer",
              opacity: previewSaveRunning || notes.length === 0 ? 0.62 : 1,
              whiteSpace: "nowrap",
            }}
          >
            <FolderDown style={{ width: "14px", height: "14px" }} />
            {previewSaveRunning ? "入库中..." : "全部入库"}
          </button>
          {layout === "horizontal" ? (
            <>
              <button type="button" onClick={() => scrollNoteCarousel(carouselRef, -1)} style={segmentedButtonStyle(false)}>
                ← Q 上一页
              </button>
              <button type="button" onClick={() => scrollNoteCarousel(carouselRef, 1)} style={segmentedButtonStyle(false)}>
                E 下一页 →
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div
        ref={carouselRef}
        style={{
          display: layout === "horizontal" ? "flex" : "grid",
          gridTemplateColumns: layout === "vertical" ? "1fr" : undefined,
          gap: "14px",
          overflowX: layout === "horizontal" ? "auto" : "visible",
          alignItems: "stretch",
          paddingBottom: "6px",
          scrollSnapType: layout === "horizontal" ? "x proximity" : undefined,
          scrollBehavior: "smooth",
        }}
      >
        {notes.map((note) => {
          const expanded = expandedIds.has(note.id);
          const content = note.content || "";
          const authorId = String(note.author_id || resolveKnownAuthorId(note.author) || "").trim();
          const creatorSource = creatorSourceLabel(note);

          return (
            <div
              key={note.id}
              style={{
                flex: layout === "horizontal" ? "0 0 min(420px, calc(100vw - 88px))" : undefined,
                minWidth: layout === "horizontal" ? "320px" : 0,
                maxWidth: layout === "horizontal" ? "420px" : "100%",
                scrollSnapAlign: layout === "horizontal" ? "start" : undefined,
              }}
            >
              <XiaohongshuNoteCard
                note={note}
                showMatchedKeywords={showMatchedKeywords}
                expanded={expanded}
                onToggleExpand={onToggleExpand}
                addToMonitorAction={{
                  onClick: () => handleAddFrequentAuthorToCreatorMonitor({
                    author: note.author,
                    author_id: authorId,
                    note_count: 1,
                    total_likes: note.likes || 0,
                    total_collects: note.collects || 0,
                    total_comments: note.comments_count || 0,
                    latest_date: note.published_at || "",
                    latest_title: note.title || content.slice(0, 28) || note.author,
                    sample_note_urls: note.url ? [note.url] : [],
                    sample_titles: note.title ? [note.title] : [],
                    sample_albums: [],
                    sample_tags: creatorSource.tags,
                    source_summary: creatorSource.summary,
                    score: (note.likes || 0) + (note.collects || 0),
                  }),
                  disabled: !authorId,
                }}
                primaryAction={{
                  label: "入库",
                  onClick: () => handleSavePreviewNotesWithOptions([note], {
                    subfolder: saveSubfolder(note),
                    successTitle: saveSuccessTitle,
                    includeComments: searchSaveComments,
                    commentsLimit: searchSaveCommentsLimit,
                    commentsSortBy: searchSaveCommentsSortBy,
                  }),
                  disabled: previewSaveRunning,
                  icon: <Save style={{ width: "12px", height: "12px" }} />,
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderCreatorNoteResults = ({
    notes,
    carouselRef,
    layout,
    onLayoutChange,
    expandedIds,
    onToggleExpand,
    sourceLabel,
    saveAllTitle,
  }: {
    notes: XHSNote[];
    carouselRef: React.RefObject<HTMLDivElement | null>;
    layout: NoteResultLayout;
    onLayoutChange: (layout: NoteResultLayout) => void;
    expandedIds: Set<string>;
    onToggleExpand: (noteId: string) => void;
    sourceLabel: string;
    saveAllTitle: string;
  }) => renderHorizontalNoteResults({
    notes,
    carouselRef,
    layout,
    onLayoutChange,
    expandedIds,
    onToggleExpand,
    saveSubfolder: () => buildCreatorSaveSubfolder(sourceLabel),
    saveSuccessTitle: "博主动态已入库",
    saveAllSubfolder: buildCreatorSaveSubfolder(sourceLabel),
    saveAllSuccessTitle: saveAllTitle,
    creatorSourceLabel: (note) => ({
      tags: [sourceLabel].filter(Boolean),
      summary: `来自指定博主抓取：${sourceLabel || note.author}`,
    }),
  });

  const renderTabs = () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: "12px",
      }}
    >
      {[
        {
          id: "collections" as const,
          label: "收藏专辑抓取",
          icon: Save,
          accent: "#FF6B81",
          bg: "rgba(255, 107, 129, 0.14)",
        },
        {
          id: "search" as const,
          label: "主动爬取",
          icon: Filter,
          accent: "#EF4444",
          bg: "rgba(239, 68, 68, 0.12)",
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

  const formatTaskKindLabel = (kind: string) => {
    switch (kind) {
      case "search":
        return "关键词扫描";
      case "following-feed":
        return "关注流扫描";
      case "creator-recent":
        return "指定博主抓取";
      case "crawl-note":
        return "单条入库";
      case "crawl-batch":
        return "批量入库";
      case "comments":
        return "评论抓取";
      case "author-candidates":
        return "博主候选分析";
      case "smart-groups":
        return "智能分组";
      case "save-previews":
        return "搜索结果入库";
      default:
        return kind;
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
    if (typeof input.max_creators === "number") {
      lines.push(`博主上限：${input.max_creators}`);
    }
    if (typeof input.creator_query === "string" && input.creator_query) {
      lines.push(`博主：${input.creator_query}`);
    }
    if (typeof input.recent_days === "number") {
      lines.push(`最近天数：${input.recent_days}`);
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
              <span>执行路径：{formatExecutionRoute(crawlResult)}</span>
              <span>图片 {crawlResult.remote_resources.images.length}</span>
              <span>Live {crawlResult.remote_resources.live.length}</span>
              <span>视频 {crawlResult.remote_resources.video ? 1 : 0}</span>
              <span>本地资源 {crawlResult.local_resources.length}</span>
              <span>详情链路：{formatStrategyLabel(crawlResult.detail_strategy)}</span>
              <span>媒体链路：{formatStrategyLabel(crawlResult.media_strategy)}</span>
              {crawlResult.comment_strategy ? (
                <span>评论链路：{formatStrategyLabel(crawlResult.comment_strategy)}</span>
              ) : null}
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
                {"markdown_path" in item
                  ? `已保存：${item.markdown_path} · ${formatExecutionRoute(item)} · ${formatStrategyLabel(item.detail_strategy)}`
                  : `失败：${item.url} · ${item.error}`}
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
      <Card title="收藏专辑抓取（反爬严格，约 10s 一条）（如遇限流，等待，更新 Cookie，切换 IP，重新登录）" icon={<Save style={{ width: "18px", height: "18px" }} />}>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div
            style={{
              padding: "12px 14px",
              borderRadius: "var(--radius-md)",
              border: "1px solid rgba(255, 138, 0, 0.18)",
              background: "rgba(255, 138, 0, 0.08)",
              fontSize: "0.8125rem",
              color: "#C2410C",
              lineHeight: 1.7,
              fontWeight: 600,
            }}
          >
            <div>因小红书限制，一次只能执行一个任务。请耐心等待当前任务完成后，再启动下一项抓取或入库。</div>
            <div>需要桌面非全屏，并漏出后台浏览器的一点点像素，才能正常滚动和爬取。</div>
          </div>

          <div style={{ fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.7 }}>
            <div>当前默认是插件优先，失败后再走兜底；增量会跳过本地仍存在 Markdown 文件的已抓笔记，最近天数留空表示不限。</div>
          </div>

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
                    setAlbumRecentDaysInput("");
                    return;
                  }
                  setAlbumRecentDaysInput(String(Math.max(1, Math.min(3650, next))));
                }}
                inputMode="numeric"
                placeholder="不限"
                style={{ ...compactControlStyle, width: "82px", background: "transparent" }}
              />
              天
            </label>
            <button
              type="button"
              onClick={() => setShowAlbumRecoveryOptions((v) => !v)}
              style={{
                ...segmentedButtonStyle(showAlbumRecoveryOptions),
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <Zap style={{ width: "15px", height: "15px" }} />
              恢复抓取设置
              {showAlbumRecoveryOptions ? <ChevronUp style={{ width: "14px", height: "14px" }} /> : <ChevronDown style={{ width: "14px", height: "14px" }} />}
            </button>
          </div>

          {showAlbumRecoveryOptions && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                padding: "14px 16px",
                borderRadius: "var(--radius-md)",
                background: "rgba(255, 107, 129, 0.06)",
                border: "1px solid rgba(255, 107, 129, 0.16)",
              }}
            >
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>恢复浏览器</span>
                <select
                  value={albumCookieBrowser}
                  onChange={(e) => setAlbumCookieBrowser(e.target.value as BrowserChoice)}
                  style={{ ...compactControlStyle, minWidth: "132px" }}
                >
                  {Object.entries(browserLabelMap).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => handleGetCookieFromBrowser(albumCookieBrowser)}
                  disabled={gettingCookie}
                  style={segmentedButtonStyle(false)}
                >
                  {gettingCookie ? "更新 Cookie 中..." : `用${browserLabelMap[albumCookieBrowser]}更新 Cookie`}
                </button>
                <button
                  type="button"
                  onClick={handleClearXhsLocalCache}
                  style={{ ...segmentedButtonStyle(false), borderColor: "rgba(239, 68, 68, 0.2)", color: "var(--color-danger)" }}
                >
                  清本地缓存
                </button>
              </div>

              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                <button type="button" onClick={() => setAlbumRecoveryMode((prev) => !prev)} style={segmentedButtonStyle(albumRecoveryMode)}>
                  低频多次分批抓取
                </button>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-main)", fontSize: "0.875rem" }}>
                  每批
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={albumBatchSize}
                    onChange={(e) => setAlbumBatchSize(Number(e.target.value || 5))}
                    style={{ ...compactControlStyle, width: "74px" }}
                  />
                  条
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-main)", fontSize: "0.875rem" }}>
                  批间等待
                  <input
                    type="number"
                    min={10}
                    max={180}
                    value={albumBatchPauseSeconds}
                    onChange={(e) => setAlbumBatchPauseSeconds(Number(e.target.value || 30))}
                    style={{ ...compactControlStyle, width: "82px" }}
                  />
                  秒
                </label>
              </div>

              <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                可先切换浏览器重新获取 Cookie。若仍限流，建议先清浏览器站点缓存并重新登录，再用低频分批模式继续抓取。
              </div>
            </div>
          )}

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
              记录评论（插件状态机）
            </button>
            <button
              type="button"
              onClick={() => setAlbumDedicatedWindowMode((v) => !v)}
              style={segmentedButtonStyle(albumDedicatedWindowMode)}
            >
              当前 Edge 独立窗口
            </button>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-main)", fontSize: "0.875rem" }}>
              扩展端口
              <input
                type="number"
                min={1024}
                max={65535}
                value={albumExtensionPort}
                onChange={(e) => setAlbumExtensionPort(Number(e.target.value || 9334))}
                style={{ ...compactControlStyle, width: "88px" }}
              />
            </label>
          </div>
          <div style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>
            抓取链路：插件优先（端口 {albumExtensionPort}，{albumDedicatedWindowMode ? "独立窗口" : "当前窗口"}）{` -> `}CDP / 后端兜底
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
                  : albumDedicatedWindowMode
                    ? `当前 Edge 独立窗口读取中。步骤 ${albumListProgress.current_step || 0}/${albumListProgress.total_steps || 7}`
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
                {albumProgress.pruned_seen_count ? (
                  <span>修正无效已抓 {albumProgress.pruned_seen_count}</span>
                ) : null}
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
              {albumProgress.skip_breakdown ? (
                <div style={{ color: "var(--text-secondary)", fontSize: "0.8125rem" }}>
                  过滤明细：已抓 {albumProgress.skip_breakdown.already_seen || 0} · 较旧 {albumProgress.skip_breakdown.older_than_recent_days || 0} · 较新 {albumProgress.skip_breakdown.newer_than_before_date || 0} · 无效 {albumProgress.skip_breakdown.invalid_note || 0}
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
                  ? `${item.album}：发现 ${item.found || 0}，新增 ${item.saved || 0}，跳过 ${item.skipped || 0}${item.mode ? ` · ${item.mode === "full" ? "全量" : "增量"}` : ""}`
                  : `${item.album || "专辑"}：${item.error || "失败"}`}
                {item.success && item.diagnostics ? (
                  <div style={{ marginTop: "6px", color: "var(--text-muted)" }}>
                    已抓校验：原记录 {item.diagnostics.raw_seen_count || 0} · 有效 {item.diagnostics.valid_seen_count || 0} · 已修正 {item.diagnostics.pruned_seen_count || 0} · 可处理 {item.diagnostics.processable_notes || 0}
                    {item.diagnostics.skip_breakdown ? ` · 过滤：已抓 ${item.diagnostics.skip_breakdown.already_seen || 0} / 较旧 ${item.diagnostics.skip_breakdown.older_than_recent_days || 0} / 较新 ${item.diagnostics.skip_breakdown.newer_than_before_date || 0}` : ""}
                  </div>
                ) : null}
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
    id: "creator" | "keyword" | "following-scan",
    title: string,
    subtitle: string,
    active: boolean,
    onToggle: () => void,
    onDelete: (() => void) | undefined,
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
          {onDelete ? (
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
          ) : null}
        </div>
        {expanded && (
          <div style={{ padding: "0 14px 14px", display: "flex", flexDirection: "column", gap: "10px" }}>
            {children}
          </div>
        )}
      </div>
    );
  };

  const creatorEntries = trackerCreatorMonitors.length > 0
    ? trackerCreatorMonitors
    : trackerUserIds.map((userId) => createCreatorMonitor({
        user_id: userId,
        label: trackerCreatorProfiles[userId]?.author || userId,
        author: trackerCreatorProfiles[userId]?.author || userId,
        enabled: trackerCreatorPushEnabled && !disabledCreatorIds.has(userId),
        smart_groups: trackerCreatorProfiles[userId]?.smart_groups || [],
        smart_group_labels: trackerCreatorProfiles[userId]?.smart_group_labels || [],
      }));
  const creatorMonitorByUserId = new Map<string, XHSTrackerCreatorMonitor>();
  creatorEntries.forEach((creatorMonitor) => {
    const userId = String(creatorMonitor.user_id || "").trim();
    if (!userId || creatorMonitorByUserId.has(userId)) return;
    creatorMonitorByUserId.set(userId, creatorMonitor);
  });
  const creatorGroupLabelMap = new Map(
    trackerCreatorGroupOptions.map((option) => [option.value, option.label]),
  );
  const creatorGroupCounts = trackerCreatorGroupOptions.reduce<Record<string, number>>((acc, option) => {
    acc[option.value] = Object.values(trackerCreatorProfiles).filter((profile) =>
      (profile.smart_groups || []).includes(option.value),
    ).length;
    return acc;
  }, {});
  const vaultIndexedFileCount = Number(sharedCreatorGrouping.vault_signal_database?.indexed_files || 0);
  const vaultSignalCount = Number(sharedCreatorGrouping.vault_signal_database?.signal_count || 0);
  const sharedTagIndexPath = sharedCreatorGrouping.shared_data_paths?.tag_index_path
    || sharedCreatorGrouping.vault_signal_database?.tag_index_path
    || sharedCreatorGrouping.vault_signal_database?.database_path
    || "";
  const creatorGroupDisplayOptions = trackerCreatorGroupOptions.filter((option) =>
    (creatorGroupCounts[option.value] || 0) > 0 || trackerCreatorGroups.includes(option.value),
  );
  const getCreatorGroupLabels = (profile?: XHSCreatorProfile | null): string[] => (
    (profile?.smart_groups || []).map((group, index) =>
      profile?.smart_group_labels?.[index]
      || creatorGroupLabelMap.get(group)
      || group,
    )
  );
  const getCreatorMonitorGroupLabels = (monitor: XHSTrackerCreatorMonitor): string[] => {
    const userId = String(monitor.user_id || "").trim();
    const profile = trackerCreatorProfiles[userId];
    const values = profile?.smart_groups?.length ? profile.smart_groups : monitor.smart_groups;
    const labels = profile?.smart_group_labels?.length ? profile.smart_group_labels : monitor.smart_group_labels;
    return (values || []).map((group, index) => labels?.[index] || creatorGroupLabelMap.get(group) || group);
  };
  const resolveCreatorProfileUrl = (profile?: XHSCreatorProfile | null, fallbackAuthorId?: string | null) => {
    const directUrl = String(profile?.profile_url || "").trim();
    if (directUrl) return directUrl;
    const directAuthorId = String(profile?.author_id || fallbackAuthorId || "").trim();
    if (directAuthorId) return buildXhsProfileUrl(directAuthorId);
    const mappedEntry = trackerCreatorNameMap[normalizeAuthorKey(profile?.author)] || null;
    const mappedAuthorId = String(mappedEntry?.author_id || "").trim();
    if (mappedAuthorId) return buildXhsProfileUrl(mappedAuthorId);
    return String(mappedEntry?.profile_url || "").trim();
  };
  const trackedCreatorUserIds = new Set(
    creatorEntries.map((monitor) => String(monitor.user_id || "").trim()).filter(Boolean),
  );
  const getMonitorGroupValues = (monitor: XHSTrackerCreatorMonitor): string[] => {
    const userId = String(monitor.user_id || "").trim();
    const profile = trackerCreatorProfiles[userId];
    return (profile?.smart_groups?.length ? profile.smart_groups : monitor.smart_groups) || [];
  };
  const filteredCreatorEntries = creatorEntries.filter((monitor) => {
    if (creatorMonitorGroupFilter === "all") return true;
    if (creatorMonitorGroupFilter === "__ungrouped__") return getMonitorGroupValues(monitor).length === 0;
    return getMonitorGroupValues(monitor).includes(creatorMonitorGroupFilter);
  });
  const creatorMonitorPageSize = 8;
  const creatorMonitorPageCount = Math.max(1, Math.ceil(filteredCreatorEntries.length / creatorMonitorPageSize));
  const safeCreatorMonitorPage = Math.min(creatorMonitorPage, creatorMonitorPageCount - 1);
  const visibleCreatorEntries = filteredCreatorEntries.slice(
    safeCreatorMonitorPage * creatorMonitorPageSize,
    safeCreatorMonitorPage * creatorMonitorPageSize + creatorMonitorPageSize,
  );
  const buildSharedCreatorMembers = (
    predicate: (profile: XHSCreatorProfile, profileId: string) => boolean,
  ) => Object.entries(trackerCreatorProfiles)
    .filter(([profileId, profile]) => predicate(profile, profileId))
    .map(([profileId, profile]) => {
      const authorId = String(profile.author_id || profileId || "").trim();
      const author = String(profile.author || authorId || "未命名博主").trim() || "未命名博主";
      return {
        profileId,
        profile,
        author,
        authorId,
        latestTitle: String(profile.latest_title || profile.sample_titles?.[0] || "").trim(),
        sourceSummary: String(profile.source_summary || "").trim(),
        sampleUrl: String(profile.sample_note_urls?.[0] || "").trim(),
        profileUrl: resolveCreatorProfileUrl(profile, profileId),
        sampleLabels: [...new Set([...(profile.sample_tags || []), ...(profile.sample_albums || [])])].slice(0, 5),
        inTracker: trackedCreatorUserIds.has(authorId),
      };
    })
    .sort((left, right) =>
      Number(right.inTracker) - Number(left.inTracker)
      || left.author.localeCompare(right.author, "zh-CN")
    );
  const sharedCreatorGroups = creatorGroupDisplayOptions.map((option) => {
    const members = buildSharedCreatorMembers((profile) => (profile.smart_groups || []).includes(option.value));
    return {
      ...option,
      members,
      count: members.length,
    };
  }).filter((group) => group.count > 0);
  const ungroupedCreatorMembers = buildSharedCreatorMembers((profile) => (profile.smart_groups || []).length === 0);
  const visibleSharedCreatorGroups = [
    ...sharedCreatorGroups,
    ...(ungroupedCreatorMembers.length > 0 ? [{
      value: "__ungrouped__",
      label: "未分组",
      count: ungroupedCreatorMembers.length,
      members: ungroupedCreatorMembers,
      isUngrouped: true,
    }] : []),
  ];
  const allSharedCreatorMembers = buildSharedCreatorMembers(() => true);
  const normalizedSharedCreatorManagerQuery = sharedCreatorManagerQuery.trim().toLowerCase();
  const filteredSharedCreatorMembers = allSharedCreatorMembers.filter((member) => {
    if (!normalizedSharedCreatorManagerQuery) return true;
    const candidateText = [
      member.author,
      member.authorId,
      member.latestTitle,
      member.sourceSummary,
      ...getCreatorGroupLabels(member.profile),
    ].join(" ").toLowerCase();
    return candidateText.includes(normalizedSharedCreatorManagerQuery);
  });
  const filteredSharedCreatorManagerGroups = visibleSharedCreatorGroups.map((group) => {
    const groupQueryMatched = !normalizedSharedCreatorManagerQuery
      || group.label.toLowerCase().includes(normalizedSharedCreatorManagerQuery);
    const members = group.members.filter((member) => {
      if (groupQueryMatched) return true;
      const candidateText = [
        member.author,
        member.authorId,
        member.latestTitle,
        member.sourceSummary,
        ...getCreatorGroupLabels(member.profile),
      ].join(" ").toLowerCase();
      return candidateText.includes(normalizedSharedCreatorManagerQuery);
    });
    return {
      ...group,
      members,
      filteredCount: members.length,
    };
  }).filter((group) => group.filteredCount > 0);
  const creatorBatchTargetByProfileId = new Map<string, CreatorBatchTarget>();
  visibleSharedCreatorGroups.forEach((group) => {
    group.members.forEach((member) => {
      creatorBatchTargetByProfileId.set(member.profileId, {
        profileId: member.profileId,
        author: member.author,
        authorId: member.authorId,
        query: member.authorId || member.author,
        groupValue: group.value,
        groupLabel: group.label,
      });
    });
  });
  const selectedCreatorBatchTargets = [...selectedCreatorBatchIds]
    .map((profileId) => creatorBatchTargetByProfileId.get(profileId))
    .filter((target): target is CreatorBatchTarget => Boolean(target?.query));
  const knownAuthorIdByName = new Map<string, string>();
  authorCandidates.forEach((candidate) => {
    const authorKey = normalizeAuthorKey(candidate.author);
    if (authorKey && candidate.author_id) knownAuthorIdByName.set(authorKey, candidate.author_id);
  });
  Object.values(trackerCreatorNameMap).forEach((entry) => {
    const authorKey = normalizeAuthorKey(entry.author);
    const authorId = String(entry.author_id || "").trim();
    if (authorKey && authorId) knownAuthorIdByName.set(authorKey, authorId);
  });
  Object.entries(trackerCreatorProfiles).forEach(([profileId, profile]) => {
    const authorKey = normalizeAuthorKey(profile.author);
    const profileAuthorId = String(profile.author_id || profileId || "").trim();
    if (authorKey && profileAuthorId) knownAuthorIdByName.set(authorKey, profileAuthorId);
  });
  const resolveKnownAuthorId = (author?: string | null) => knownAuthorIdByName.get(normalizeAuthorKey(author)) || "";
  const frequentAuthorCandidates = [...authorCandidates].sort((a, b) => {
    if (b.note_count !== a.note_count) return b.note_count - a.note_count;
    if (b.total_collects !== a.total_collects) return b.total_collects - a.total_collects;
    if (b.total_likes !== a.total_likes) return b.total_likes - a.total_likes;
    return b.score - a.score;
  });
  const getCandidateGroupLabels = (candidate: XHSAuthorCandidate): string[] => {
    const profile = candidate.author_id ? trackerCreatorProfiles[candidate.author_id] : undefined;
    return getCreatorGroupLabels(profile);
  };
  const frequentAuthorGroupCounts = creatorGroupDisplayOptions.reduce<Record<string, number>>((acc, option) => {
    acc[option.value] = frequentAuthorCandidates.filter((candidate) => {
      const profile = candidate.author_id ? trackerCreatorProfiles[candidate.author_id] : undefined;
      return (profile?.smart_groups || []).includes(option.value);
    }).length;
    return acc;
  }, {});
  const frequentAuthorGroupOptions = creatorGroupDisplayOptions.filter((option) =>
    (frequentAuthorGroupCounts[option.value] || 0) > 0
  );
  const filteredFrequentAuthorCandidates = frequentAuthorCandidates.filter((candidate) => {
    if (frequentAuthorGroupFilter === "all") return true;
    const profile = candidate.author_id ? trackerCreatorProfiles[candidate.author_id] : undefined;
    return (profile?.smart_groups || []).includes(frequentAuthorGroupFilter);
  });
  const visibleFrequentAuthorCandidates = showAllFrequentAuthors
    ? filteredFrequentAuthorCandidates
    : filteredFrequentAuthorCandidates.slice(0, 10);

  const persistTrackerDefinitions = async (successTitle: string, successDescription?: string) => {
    try {
      await api.post("/api/modules/xiaohongshu-tracker/config", buildTrackerConfigPayload());
      await refreshTrackerConfig();
      toast.success(successTitle, successDescription);
    } catch (e) {
      toast.error("保存失败", e instanceof Error ? e.message : "未知错误");
    }
  };

  const handleToggleFollowingScanPush = async () => {
    const draftKeywords = parseKeywordInput(trackerFollowingScanKeywordDraft);
    const existingMonitors = draftKeywords.length > 0
      ? applyFollowingScanDraftToMonitors(trackerFollowingScanKeywordDraft)
      : commitFollowingScanMonitorsForSave();
    if (existingMonitors.length === 0) {
      toast.error("请先添加至少一个关注流关键词定义");
      return;
    }
    const next = !trackerFollowingScan.enabled;
    const nextMonitors = existingMonitors.map((monitor) => ({
      ...monitor,
      enabled: next,
    }));
    const payload = buildFollowingScanPayload(nextMonitors, {
      ...trackerFollowingScan,
      enabled: next,
    });
    try {
      await api.post("/api/modules/xiaohongshu-tracker/config", buildTrackerConfigPayload({
        following_scan: payload.followingScan,
        following_scan_monitors: payload.followingScanMonitors,
      }));
      await refreshTrackerConfig();
      toast.success(next ? "关注流情报推送已开启" : "关注流情报推送已关闭");
    } catch (e) {
      toast.error("保存失败", e instanceof Error ? e.message : "未知错误");
    }
  };

  const handleSaveFollowingScan = async () => {
    try {
      const draftKeywords = parseKeywordInput(trackerFollowingScanKeywordDraft);
      const nextMonitors = draftKeywords.length > 0
        ? applyFollowingScanDraftToMonitors(trackerFollowingScanKeywordDraft)
        : commitFollowingScanMonitorsForSave();
      const payload = buildFollowingScanPayload(nextMonitors);
      await api.post("/api/modules/xiaohongshu-tracker/config", buildTrackerConfigPayload({
        following_scan: payload.followingScan,
        following_scan_monitors: payload.followingScanMonitors,
      }));
      toast.success("关注流情报推送已保存", "模块管理会按定时任务抓取这些定义");
      await refreshTrackerConfig();
      setExpandedPushes((prev) => new Set(prev).add("following-scan"));
    } catch (e) {
      toast.error("保存失败", e instanceof Error ? e.message : "未知错误");
    }
  };

  const handleDeleteFollowingScanPush = async () => {
    try {
      await api.post("/api/modules/xiaohongshu-tracker/config", buildTrackerConfigPayload({
        following_scan: createFollowingScan({
          ...trackerFollowingScan,
          enabled: false,
          keywords: [],
        }),
        following_scan_monitors: [],
      }));
      await refreshTrackerConfig();
      setExpandedPushes((prev) => {
        const next = new Set(prev);
        next.delete("following-scan");
        return next;
      });
      toast.success("关注流情报推送已清空");
    } catch (e) {
      toast.error("删除失败", e instanceof Error ? e.message : "未知错误");
    }
  };

  const toggleCreatorBatchSelection = (profileId: string) => {
    setSelectedCreatorBatchIds((prev) => {
      const next = new Set(prev);
      if (next.has(profileId)) next.delete(profileId);
      else next.add(profileId);
      return next;
    });
  };

  const buildCreatorBatchTargetsFromMembers = (
    members: Array<{
      profileId: string;
      author: string;
      authorId: string;
    }>,
    groupLabel?: string,
    groupValue?: string,
  ): CreatorBatchTarget[] => Array.from(new Map(
    members
      .map((member) => ({
        profileId: member.profileId,
        author: member.author,
        authorId: member.authorId,
        query: member.authorId || member.author,
        groupLabel,
        groupValue,
      }))
      .filter((target) => String(target.query || "").trim())
      .map((target) => [target.profileId, target]),
  ).values());

  const runCreatorRecentBatch = async (targets: CreatorBatchTarget[], sourceLabel: string) => {
    if (creatorRecentRunning || creatorRecentBatchRunning) {
      toast.info("任务正在执行", "当前有博主抓取任务在进行，完成后再启动新的。");
      return;
    }
    if (!requireCookie()) {
      return;
    }
    const normalizedTargets = Array.from(new Map(
      targets
        .map((target) => ({
          ...target,
          query: String(target.query || "").trim(),
        }))
        .filter((target) => target.query)
        .map((target) => [target.profileId, target]),
    ).values());
    if (normalizedTargets.length === 0) {
      toast.error("没有可抓取的博主");
      return;
    }

    const recentDays = Math.max(1, Math.min(365, creatorRecentDays || DEFAULT_XHS_RECENT_DAYS));
    const maxNotes = Math.max(1, Math.min(50, creatorRecentLimit || 10));
    const shouldAutoSave = creatorRecentAutoSaveAfterFetch;
    setShowCreatorRecentWorkbench(true);
    setCreatorRecentResult(null);
    setCreatorBatchResults([]);
    setCreatorBatchProgress({
      completed: 0,
      total: normalizedTargets.length,
      currentLabel: sourceLabel,
    });
    setTaskRunning("creator-recent-batch", true);

    const nextResults: CreatorBatchResultItem[] = [];
    let fuseStopped = false;
    try {
      for (let index = 0; index < normalizedTargets.length; index += 1) {
        const target = normalizedTargets[index];
        if (index > 0) {
          const delaySeconds = randomCreatorBatchDelaySeconds();
          setCreatorBatchProgress({
            completed: index,
            total: normalizedTargets.length,
            currentLabel: `等待 ${delaySeconds} 秒后抓取 ${target.author}`,
          });
          await wait(delaySeconds * 1000);
        }
        setCreatorBatchProgress({
          completed: index,
          total: normalizedTargets.length,
          currentLabel: target.author,
        });
        try {
          const result = await fetchCreatorRecentDirect(target.query, recentDays, maxNotes);
          nextResults.push({ target, result });
        } catch (err) {
          nextResults.push({
            target,
            error: err instanceof Error ? err.message : "未知错误",
          });
          if (isXhsCreatorRiskError(err)) {
            fuseStopped = true;
            toast.error("博主批量抓取已熔断", "检测到访问频繁/验证/登录限制，已停止后续博主抓取。等待恢复后再重试。");
            setCreatorBatchResults([...nextResults]);
            break;
          }
        }
        setCreatorBatchResults([...nextResults]);
      }

      const successCount = nextResults.filter((item) => item.result).length;
      const failedCount = nextResults.length - successCount;
      const successfulNotes = nextResults.flatMap((item) => item.result?.notes || []);
      setCreatorBatchProgress({
        completed: normalizedTargets.length,
        total: normalizedTargets.length,
        currentLabel: "已完成",
      });
      if (successCount > 0) {
        focusCreatorRecentResults();
        if (shouldAutoSave && successfulNotes.length > 0) {
          await handleSaveCreatorRecentNotes(
            successfulNotes,
            sourceLabel,
            "批量抓取结果已入库",
          );
        }
      }
      if (successCount > 0 && failedCount === 0) {
        toast.success("批量抓取完成", `${sourceLabel} 共抓取 ${successCount} 位博主`);
      } else if (successCount > 0) {
        toast.success("批量抓取已完成", `成功 ${successCount} 位，失败 ${failedCount} 位`);
      } else if (fuseStopped) {
        toast.error("批量抓取已停止", "触发风险熔断，未继续抓取后续博主。 ");
      } else {
        toast.error("批量抓取失败", "这批博主都没有成功抓取到结果");
      }
    } finally {
      setTaskRunning("creator-recent-batch", false);
      window.setTimeout(() => setCreatorBatchProgress(null), 1200);
    }
  };

  const handleRunSelectedCreatorBatch = async () => {
    await runCreatorRecentBatch(selectedCreatorBatchTargets, "已选博主");
  };

  const handleRefreshCreatorRecentResult = async () => {
    if (!creatorRecentResult) return;
    setCreatorRecentResult(null);
    await runCreatorRecentFetch(
      creatorRecentResult.resolved_user_id || creatorRecentResult.creator_query,
      {
        recentDays: creatorRecentResult.recent_days,
        maxNotes: creatorRecentLimit,
      },
    );
  };

  const handleRefreshCreatorBatchResults = async () => {
    if (creatorBatchResults.length === 0) return;
    const targets = creatorBatchResults.map((item) => item.target);
    setCreatorBatchResults([]);
    await runCreatorRecentBatch(targets, "当前批量结果");
  };

  const handleRunGroupCreatorBatch = async (
    groupLabel: string,
    groupValue: string,
    members: Array<{
      profileId: string;
      author: string;
      authorId: string;
    }>,
  ) => {
    const targets = buildCreatorBatchTargetsFromMembers(members, groupLabel, groupValue);
    if (targets.length === 0) {
      toast.error("这个分组里没有可抓取的博主");
      return;
    }
    setSelectedCreatorBatchIds(new Set(targets.map((target) => target.profileId)));
    await runCreatorRecentBatch(targets, groupLabel);
  };

  const saveSharedCreatorGroupMembership = async (profileId: string, nextGroupValues: string[]) => {
    const normalizedProfileId = String(profileId || "").trim();
    if (!normalizedProfileId) return;

    const currentProfile = trackerCreatorProfiles[normalizedProfileId];
    if (!currentProfile) {
      toast.error("没找到这个博主的共享分组信息");
      return;
    }

    const nextGroups = Array.from(new Set(
      nextGroupValues
        .map((groupValue) => String(groupValue || "").trim())
        .filter((groupValue) => groupValue && groupValue !== "__ungrouped__"),
    ));
    const nextGroupLabels = nextGroups.map((groupValue) =>
      trackerCreatorGroupOptions.find((option) => option.value === groupValue)?.label || groupValue
    );
    const currentGroups = Array.from(new Set(
      (currentProfile.smart_groups || [])
        .map((group) => String(group || "").trim())
        .filter(Boolean),
    ));
    const currentGroupKey = [...currentGroups].sort().join("|");
    const nextGroupKey = [...nextGroups].sort().join("|");
    if (currentGroupKey === nextGroupKey) {
      return;
    }

    const normalizedAuthorId = String(currentProfile.author_id || normalizedProfileId).trim();
    const authorLabel = currentProfile.author || normalizedAuthorId || "该博主";

    setUpdatingSharedCreatorIds((prev) => new Set(prev).add(normalizedProfileId));
    try {
      const nextCreatorProfiles = { ...trackerCreatorProfiles };
      nextCreatorProfiles[normalizedProfileId] = {
        ...(nextCreatorProfiles[normalizedProfileId] || currentProfile),
        smart_groups: nextGroups,
        smart_group_labels: nextGroupLabels,
      };
      if (normalizedAuthorId && normalizedAuthorId !== normalizedProfileId) {
        nextCreatorProfiles[normalizedAuthorId] = {
          ...(nextCreatorProfiles[normalizedAuthorId] || {}),
          ...nextCreatorProfiles[normalizedAuthorId],
          author: nextCreatorProfiles[normalizedAuthorId]?.author || currentProfile.author || normalizedAuthorId,
          author_id: normalizedAuthorId,
          smart_groups: nextGroups,
          smart_group_labels: nextGroupLabels,
        };
      }

      const baseCreatorMonitors = trackerCreatorMonitors.length > 0 ? trackerCreatorMonitors : creatorEntries;
      const nextCreatorMonitors = baseCreatorMonitors.map((monitor) => {
        const monitorUserId = String(monitor.user_id || "").trim();
        if (monitorUserId !== normalizedProfileId && monitorUserId !== normalizedAuthorId) {
          return monitor;
        }
        return {
          ...monitor,
          smart_groups: nextGroups,
          smart_group_labels: nextGroupLabels,
        };
      });

      await api.post("/api/modules/xiaohongshu-tracker/config", {
        ...buildTrackerConfigPayload({
          creator_monitors: nextCreatorMonitors,
        }),
        creator_profiles: nextCreatorProfiles,
      });
      setTrackerCreatorProfiles(nextCreatorProfiles);
      setTrackerCreatorMonitors(nextCreatorMonitors);
      toast.success(
        nextGroups.length > 0 ? "共享分组已更新" : "已移到未分组",
        nextGroups.length > 0
          ? `${authorLabel} 已加入 ${nextGroupLabels.join("、")}`
          : `${authorLabel} 已移到未分组`,
      );
    } catch (e) {
      toast.error("调整共享分组失败", e instanceof Error ? e.message : "未知错误");
    } finally {
      setUpdatingSharedCreatorIds((prev) => {
        const next = new Set(prev);
        next.delete(normalizedProfileId);
        return next;
      });
    }
  };

  const toggleSharedCreatorGroupMembership = async (profileId: string, groupValue: string) => {
    const normalizedProfileId = String(profileId || "").trim();
    const normalizedGroupValue = String(groupValue || "").trim();
    if (!normalizedProfileId || !normalizedGroupValue) return;
    const currentProfile = trackerCreatorProfiles[normalizedProfileId];
    if (!currentProfile) {
      toast.error("没找到这个博主的共享分组信息");
      return;
    }
    const currentGroups = Array.from(new Set(
      (currentProfile.smart_groups || [])
        .map((group) => String(group || "").trim())
        .filter(Boolean),
    ));
    const nextGroups = currentGroups.includes(normalizedGroupValue)
      ? currentGroups.filter((group) => group !== normalizedGroupValue)
      : [...currentGroups, normalizedGroupValue];
    await saveSharedCreatorGroupMembership(normalizedProfileId, nextGroups);
  };

  const renderDetailDivider = () => (
    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
      <div style={{ flex: 1, height: "1px", background: "var(--border-light)" }} />
      <span style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-muted)" }}>
        详细配置
      </span>
      <div style={{ flex: 1, height: "1px", background: "var(--border-light)" }} />
    </div>
  );

  const toggleCreatorSelectorGroupExpanded = (groupValue: string) => {
    setExpandedCreatorSelectorGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupValue)) next.delete(groupValue);
      else next.add(groupValue);
      return next;
    });
  };

  const toggleSharedManagerGroupExpanded = (groupValue: string) => {
    setExpandedSharedManagerGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupValue)) next.delete(groupValue);
      else next.add(groupValue);
      return next;
    });
    setSharedCreatorManagerPages((prev) => ({
      ...prev,
      [groupValue]: prev[groupValue] || 0,
    }));
  };

  const toggleSharedManagerMemberExpanded = (memberKey: string) => {
    setExpandedSharedManagerMembers((prev) => {
      const next = new Set(prev);
      if (next.has(memberKey)) next.delete(memberKey);
      else next.add(memberKey);
      return next;
    });
  };

  const renderSharedCreatorBatchSelector = () => {
    if (visibleSharedCreatorGroups.length === 0) {
      return (
        <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
          先跑一次“共享智能分组”，这里才会出现最终的小红书分组结果；到时你可以整组抓，也可以选几个博主做批量抓取。
        </div>
      );
    }

    return (
      <div
        style={{
          padding: "14px",
          borderRadius: "var(--radius-md)",
          border: "1px solid rgba(255, 138, 0, 0.16)",
          background: "linear-gradient(180deg, rgba(255, 138, 0, 0.06), rgba(255, 255, 255, 0.72))",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}
      >
        <div>
          <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-main)" }}>
            共享分组批量抓取
          </div>
          <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.6, marginTop: "4px" }}>
            这里直接复用共享智能分组的最终小红书结果。你可以整组抓，也可以勾选若干博主后统一批量抓取。
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "12px",
            alignItems: "center",
            flexWrap: "wrap",
            padding: "10px 12px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid rgba(255, 138, 0, 0.16)",
            background: "rgba(255, 255, 255, 0.72)",
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
            <span>已选 {selectedCreatorBatchTargets.length} 位博主</span>
            <span>共享组 {visibleSharedCreatorGroups.length} 个</span>
            <span>抓取范围 最近 {creatorRecentDays} 天 / 每位 {creatorRecentLimit} 条</span>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => void handleRunSelectedCreatorBatch()}
              disabled={selectedCreatorBatchTargets.length === 0 || creatorRecentBatchRunning}
              style={{
                ...segmentedButtonStyle(true),
                opacity: selectedCreatorBatchTargets.length === 0 || creatorRecentBatchRunning ? 0.55 : 1,
                cursor: selectedCreatorBatchTargets.length === 0 || creatorRecentBatchRunning ? "not-allowed" : "pointer",
              }}
            >
              {creatorRecentBatchRunning ? "批量抓取中..." : "抓取已选博主"}
            </button>
            <button
              type="button"
              onClick={() => setSelectedCreatorBatchIds(new Set())}
              disabled={selectedCreatorBatchTargets.length === 0 || creatorRecentBatchRunning}
              style={{
                ...segmentedButtonStyle(false),
                opacity: selectedCreatorBatchTargets.length === 0 || creatorRecentBatchRunning ? 0.55 : 1,
                cursor: selectedCreatorBatchTargets.length === 0 || creatorRecentBatchRunning ? "not-allowed" : "pointer",
              }}
            >
              清空已选
            </button>
          </div>
        </div>

        {creatorBatchProgress ? (
          <div
            style={{
              padding: "10px 12px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid rgba(255, 138, 0, 0.16)",
              background: "rgba(255, 138, 0, 0.08)",
              fontSize: "0.8125rem",
              color: "#C2410C",
              fontWeight: 700,
            }}
          >
            批量抓取进度 {creatorBatchProgress.completed}/{creatorBatchProgress.total} · 当前 {creatorBatchProgress.currentLabel}
          </div>
        ) : null}

        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {visibleSharedCreatorGroups.map((group) => {
            const expanded = expandedCreatorSelectorGroups.has(group.value);
            const selectableMembers = group.members.filter((member) => String(member.authorId || member.author || "").trim());
            const selectedMemberCount = selectableMembers.filter((member) =>
              selectedCreatorBatchIds.has(member.profileId),
            ).length;
            const isUngrouped = "isUngrouped" in group && Boolean(group.isUngrouped);
            return (
              <div
                key={`selector-${group.value}`}
                style={{
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid rgba(255, 138, 0, 0.18)",
                  background: selectedMemberCount > 0 ? "rgba(255, 138, 0, 0.10)" : "rgba(255, 255, 255, 0.74)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "12px",
                    alignItems: "stretch",
                    flexWrap: "wrap",
                    padding: "10px 12px",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => toggleCreatorSelectorGroupExpanded(group.value)}
                    style={{
                      flex: 1,
                      minWidth: "220px",
                      border: "none",
                      background: "transparent",
                      padding: 0,
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      textAlign: "left",
                      cursor: "pointer",
                      color: "inherit",
                    }}
                  >
                    {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: "3px" }}>
                      <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-main)" }}>
                        {group.label}
                      </span>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                        {group.count} 位博主 · 已选中 {selectedMemberCount} 位
                        {isUngrouped ? " · 手动整理区" : ""}
                      </span>
                    </span>
                  </button>

                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                    <button
                      type="button"
                      onClick={() => {
                        const groupIds = selectableMembers.map((member) => member.profileId);
                        const allSelected = groupIds.length > 0 && groupIds.every((profileId) => selectedCreatorBatchIds.has(profileId));
                        setSelectedCreatorBatchIds((prev) => {
                          const next = new Set(prev);
                          groupIds.forEach((profileId) => {
                            if (allSelected) next.delete(profileId);
                            else next.add(profileId);
                          });
                          return next;
                        });
                      }}
                      disabled={selectableMembers.length === 0 || creatorRecentBatchRunning}
                      style={{
                        alignSelf: "center",
                        padding: "7px 10px",
                        borderRadius: "999px",
                        border: "1px solid var(--border-light)",
                        background: "var(--bg-card)",
                        color: "var(--text-secondary)",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        cursor: selectableMembers.length === 0 || creatorRecentBatchRunning ? "not-allowed" : "pointer",
                        opacity: selectableMembers.length === 0 || creatorRecentBatchRunning ? 0.55 : 1,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {selectableMembers.length > 0 && selectableMembers.every((member) => selectedCreatorBatchIds.has(member.profileId))
                        ? "取消本组选择"
                        : "选中本组"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleRunGroupCreatorBatch(group.label, group.value, group.members)}
                      disabled={selectableMembers.length === 0 || creatorRecentBatchRunning}
                      style={{
                        ...segmentedButtonStyle(true),
                        opacity: selectableMembers.length === 0 || creatorRecentBatchRunning ? 0.55 : 1,
                        cursor: selectableMembers.length === 0 || creatorRecentBatchRunning ? "not-allowed" : "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      抓这一组
                    </button>
                  </div>
                </div>

                {expanded ? (
                  <div
                    style={{
                      padding: "0 12px 12px",
                      borderTop: "1px solid rgba(255, 138, 0, 0.12)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                    }}
                  >
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.6, marginTop: "10px" }}>
                      {isUngrouped
                        ? "这里是暂时不放进任何共享组的博主。可以先勾选再批量抓，或直接单独抓某个博主。"
                        : "你可以勾选几个博主后统一批量抓，也可以对某个博主单独立即抓最近内容。"}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {group.members.map((member) => {
                        const memberSelected = selectedCreatorBatchIds.has(member.profileId);
                        const canSelectIndividually = Boolean(String(member.authorId || member.author || "").trim());
                        return (
                          <div
                            key={`selector-member-${group.value}-${member.authorId || member.profileId}`}
                            style={{
                              padding: "10px 12px",
                              borderRadius: "var(--radius-sm)",
                              border: "1px solid var(--border-light)",
                              background: memberSelected ? "rgba(255, 36, 66, 0.06)" : "var(--bg-card)",
                              display: "flex",
                              justifyContent: "space-between",
                              gap: "12px",
                              alignItems: "flex-start",
                              flexWrap: "wrap",
                            }}
                          >
                            <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
                              <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                                <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-main)" }}>
                                  {member.author}
                                </span>
                                <span style={{ fontSize: "0.6875rem", color: memberSelected ? "var(--color-primary)" : "var(--text-muted)" }}>
                                  {memberSelected ? "已加入批量列表" : canSelectIndividually ? "未选中" : "待补 user_id"}
                                </span>
                                {member.inTracker ? (
                                  <span style={{ fontSize: "0.6875rem", color: "#C2410C" }}>
                                    已在关注推送
                                  </span>
                                ) : null}
                              </div>
                              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                                最近：{member.latestTitle || "暂无样本标题"}
                              </div>
                              {member.sampleLabels.length > 0 ? (
                                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                                  {member.sampleLabels.slice(0, 3).map((label) => (
                                    <span
                                      key={`selector-label-${member.authorId || member.profileId}-${label}`}
                                      style={{
                                        padding: "3px 6px",
                                        borderRadius: "var(--radius-sm)",
                                        background: "rgba(255, 138, 0, 0.08)",
                                        color: "#C2410C",
                                        fontSize: "0.6875rem",
                                      }}
                                    >
                                      {label}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                            </div>

                            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end" }}>
                              <button
                                type="button"
                                onClick={() => toggleCreatorBatchSelection(member.profileId)}
                                disabled={!canSelectIndividually}
                                style={{
                                  padding: "6px 10px",
                                  borderRadius: "999px",
                                  border: `1px solid ${memberSelected ? "rgba(255, 36, 66, 0.24)" : "var(--border-light)"}`,
                                  background: memberSelected ? "rgba(255, 36, 66, 0.10)" : "var(--bg-card)",
                                  color: memberSelected ? "var(--color-primary)" : canSelectIndividually ? "var(--text-secondary)" : "var(--text-muted)",
                                  fontSize: "0.75rem",
                                  fontWeight: 700,
                                  cursor: canSelectIndividually ? "pointer" : "not-allowed",
                                  opacity: canSelectIndividually ? 1 : 0.55,
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {!canSelectIndividually ? "待补 user_id" : memberSelected ? "取消选择" : "选中博主"}
                              </button>
                              <button
                                type="button"
                                onClick={() => void runCreatorRecentFetch(member.authorId || member.author, {
                                  recentDays: creatorRecentDays,
                                  maxNotes: creatorRecentLimit,
                                })}
                                disabled={!canSelectIndividually || creatorRecentBatchRunning}
                                style={{
                                  ...segmentedButtonStyle(true),
                                  padding: "6px 10px",
                                  fontSize: "0.75rem",
                                  opacity: !canSelectIndividually || creatorRecentBatchRunning ? 0.55 : 1,
                                  cursor: !canSelectIndividually || creatorRecentBatchRunning ? "not-allowed" : "pointer",
                                }}
                              >
                                单独抓取
                              </button>
                              <button
                                type="button"
                                onClick={() => void openExternalUrl(member.profileUrl, `${member.author}主页`)}
                                disabled={!member.profileUrl}
                                style={{
                                  ...segmentedButtonStyle(false),
                                  padding: "6px 10px",
                                  fontSize: "0.75rem",
                                  opacity: member.profileUrl ? 1 : 0.55,
                                  cursor: member.profileUrl ? "pointer" : "not-allowed",
                                }}
                              >
                                主页
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderSharedCreatorGroupManager = () => {
    if (allSharedCreatorMembers.length === 0) {
      return (
        <div
          style={{
            padding: "14px",
            borderRadius: "var(--radius-md)",
            border: "1px dashed rgba(255, 36, 66, 0.18)",
            background: "rgba(255, 36, 66, 0.04)",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          <button
            type="button"
            aria-expanded={showSharedCreatorGroupManager}
            onClick={() => setShowSharedCreatorGroupManager((value) => !value)}
            style={{
              width: "100%",
              padding: 0,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-main)" }}>
                  管理共享分组
                </div>
                <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.6, marginTop: "4px" }}>
                  还没有可管理的 UP 主成员。
                </div>
              </div>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "6px 10px",
                  borderRadius: "999px",
                  border: "1px solid rgba(255, 36, 66, 0.16)",
                  background: "rgba(255, 255, 255, 0.72)",
                  color: "var(--text-secondary)",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                }}
              >
                {showSharedCreatorGroupManager ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                {showSharedCreatorGroupManager ? "收起" : "展开"}
              </span>
            </div>
          </button>
          {showSharedCreatorGroupManager ? (
            <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
              先跑一次“共享智能分组”，这里才会出现可手动整理的小红书博主成员。
            </div>
          ) : null}
        </div>
      );
    }

    return (
      <div
        style={{
          padding: "14px",
          borderRadius: "var(--radius-md)",
          border: "1px solid rgba(255, 36, 66, 0.14)",
          background: "linear-gradient(180deg, rgba(255, 36, 66, 0.04), rgba(255, 255, 255, 0.76))",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        <button
          type="button"
          aria-expanded={showSharedCreatorGroupManager}
          onClick={() => setShowSharedCreatorGroupManager((value) => !value)}
          style={{
            width: "100%",
            padding: 0,
            border: "none",
            background: "transparent",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-main)" }}>
                管理共享分组
              </div>
              <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.6, marginTop: "4px" }}>
                全部博主 {allSharedCreatorMembers.length} 位 · 当前筛出 {filteredSharedCreatorMembers.length} 位 · 未分组 {ungroupedCreatorMembers.length} 位 · 共享组 {trackerCreatorGroupOptions.length} 个
              </div>
            </div>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 10px",
                borderRadius: "999px",
                border: "1px solid rgba(255, 36, 66, 0.16)",
                background: "rgba(255, 255, 255, 0.72)",
                color: "var(--text-secondary)",
                fontSize: "0.75rem",
                fontWeight: 700,
              }}
            >
              {showSharedCreatorGroupManager ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {showSharedCreatorGroupManager ? "收起" : "展开"}
            </span>
          </div>
        </button>

        {showSharedCreatorGroupManager ? (
          <>
            <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
              先点组名展开，再点具体 UP 主名字展开详情。每个博主都可以同时加入多个共享组；把所有组都移掉后，这个博主就会回到“未分组”。
            </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "12px",
            alignItems: "center",
            flexWrap: "wrap",
            padding: "10px 12px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid rgba(255, 36, 66, 0.14)",
            background: "rgba(255, 255, 255, 0.78)",
          }}
        >
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
            <span>全部博主 {allSharedCreatorMembers.length} 位</span>
            <span>当前筛出 {filteredSharedCreatorMembers.length} 位</span>
            <span>未分组 {ungroupedCreatorMembers.length} 位</span>
            <span>共享组 {trackerCreatorGroupOptions.length} 个</span>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", flex: "1 1 420px", justifyContent: "flex-end" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
              每页显示
              <select
                value={sharedCreatorManagerPageSize}
                onChange={(e) => setSharedCreatorManagerPageSize(Number(e.target.value) === 50 ? 50 : 20)}
                style={{ ...compactControlStyle, padding: "8px 10px", width: "84px" }}
              >
                <option value={20}>20 个</option>
                <option value={50}>50 个</option>
              </select>
            </label>
            <input
              type="text"
              value={sharedCreatorManagerQuery}
              onChange={(e) => {
                setSharedCreatorManagerQuery(e.target.value);
                setSharedCreatorManagerPages({});
              }}
              placeholder="搜索博主、标题或分组"
              style={{ ...compactControlStyle, minWidth: "240px", flex: "1 1 240px", maxWidth: "360px" }}
            />
          </div>
        </div>

        {filteredSharedCreatorManagerGroups.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {filteredSharedCreatorManagerGroups.map((group) => {
              const isUngrouped = "isUngrouped" in group && Boolean(group.isUngrouped);
              const expanded = expandedSharedManagerGroups.has(group.value);
              const currentPage = Math.max(0, sharedCreatorManagerPages[group.value] || 0);
              const pageCount = Math.max(1, Math.ceil(group.members.length / sharedCreatorManagerPageSize));
              const normalizedPage = Math.min(currentPage, pageCount - 1);
              const pagedMembers = group.members.slice(
                normalizedPage * sharedCreatorManagerPageSize,
                normalizedPage * sharedCreatorManagerPageSize + sharedCreatorManagerPageSize,
              );
              return (
                <div
                  key={`manager-group-${group.value}`}
                  style={{
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid rgba(255, 36, 66, 0.10)",
                    background: "var(--bg-card)",
                    overflow: "hidden",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => toggleSharedManagerGroupExpanded(group.value)}
                    aria-expanded={expanded}
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      border: "none",
                      background: expanded ? "rgba(255, 36, 66, 0.05)" : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "12px",
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: "10px" }}>
                      {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-main)" }}>
                          {group.label}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "4px", lineHeight: 1.5 }}>
                          {group.members.length} 位 UP 主
                          {isUngrouped ? " · 未归组成员" : ""}
                        </div>
                      </div>
                    </div>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                      {expanded ? "收起" : "展开"}
                    </span>
                  </button>

                  {expanded ? (
                    <div
                      style={{
                        padding: "0 14px 14px",
                        borderTop: "1px solid rgba(255, 36, 66, 0.10)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "10px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center", flexWrap: "wrap", marginTop: "12px" }}>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                          {isUngrouped
                            ? "这里是已经被手动移出全部共享组的 UP 主。"
                            : "点具体 UP 主名字展开详情，再做分组调整或单独抓取。"}
                        </div>
                        {pageCount > 1 ? (
                          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                            <button
                              type="button"
                              onClick={() => setSharedCreatorManagerPages((prev) => ({
                                ...prev,
                                [group.value]: Math.max(0, normalizedPage - 1),
                              }))}
                              disabled={normalizedPage === 0}
                              style={{
                                ...segmentedButtonStyle(false),
                                padding: "6px 10px",
                                fontSize: "0.75rem",
                                opacity: normalizedPage === 0 ? 0.55 : 1,
                                cursor: normalizedPage === 0 ? "not-allowed" : "pointer",
                              }}
                            >
                              上一页
                            </button>
                            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                              第 {normalizedPage + 1} / {pageCount} 页
                            </span>
                            <button
                              type="button"
                              onClick={() => setSharedCreatorManagerPages((prev) => ({
                                ...prev,
                                [group.value]: Math.min(pageCount - 1, normalizedPage + 1),
                              }))}
                              disabled={normalizedPage >= pageCount - 1}
                              style={{
                                ...segmentedButtonStyle(false),
                                padding: "6px 10px",
                                fontSize: "0.75rem",
                                opacity: normalizedPage >= pageCount - 1 ? 0.55 : 1,
                                cursor: normalizedPage >= pageCount - 1 ? "not-allowed" : "pointer",
                              }}
                            >
                              下一页
                            </button>
                          </div>
                        ) : null}
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {pagedMembers.map((member) => {
                          const memberKey = `${group.value}-${member.profileId}`;
                          const memberExpanded = expandedSharedManagerMembers.has(memberKey);
                          const memberSelected = selectedCreatorBatchIds.has(member.profileId);
                          const canSelectIndividually = Boolean(String(member.authorId || member.author || "").trim());
                          const savingSharedGroup = updatingSharedCreatorIds.has(member.profileId);
                          const currentGroups = Array.from(new Set(
                            (member.profile.smart_groups || [])
                              .map((item) => String(item || "").trim())
                              .filter(Boolean),
                          ));
                          const currentGroupLabels = getCreatorGroupLabels(member.profile);
                          return (
                            <div
                              key={`manager-member-${memberKey}`}
                              style={{
                                borderRadius: "var(--radius-sm)",
                                border: "1px solid rgba(255, 36, 66, 0.10)",
                                background: memberSelected ? "rgba(255, 36, 66, 0.05)" : "var(--bg-card)",
                                overflow: "hidden",
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => toggleSharedManagerMemberExpanded(memberKey)}
                                aria-expanded={memberExpanded}
                                style={{
                                  width: "100%",
                                  padding: "10px 12px",
                                  border: "none",
                                  background: "transparent",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  gap: "12px",
                                  textAlign: "left",
                                  cursor: "pointer",
                                }}
                              >
                                <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
                                  <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                                    {memberExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                    <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-main)" }}>
                                      {member.author}
                                    </span>
                                    <span style={{ fontSize: "0.6875rem", color: memberSelected ? "var(--color-primary)" : "var(--text-muted)" }}>
                                      {memberSelected ? "已加入批量列表" : canSelectIndividually ? "可管理" : "待补 user_id"}
                                    </span>
                                    {member.inTracker ? (
                                      <span style={{ fontSize: "0.6875rem", color: "#C2410C" }}>
                                        已在关注推送
                                      </span>
                                    ) : null}
                                  </div>
                                  <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                                    最近：{member.latestTitle || "暂无样本标题"}
                                  </div>
                                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                                    {currentGroupLabels.length > 0 ? currentGroupLabels.slice(0, 3).map((label) => (
                                      <span
                                        key={`manager-current-group-${member.profileId}-${label}`}
                                        style={{
                                          padding: "3px 7px",
                                          borderRadius: "999px",
                                          background: "rgba(255, 138, 0, 0.10)",
                                          color: "#C2410C",
                                          fontSize: "0.6875rem",
                                          fontWeight: 700,
                                        }}
                                      >
                                        {label}
                                      </span>
                                    )) : (
                                      <span
                                        style={{
                                          padding: "3px 7px",
                                          borderRadius: "999px",
                                          background: "rgba(148, 163, 184, 0.14)",
                                          color: "var(--text-secondary)",
                                          fontSize: "0.6875rem",
                                          fontWeight: 700,
                                        }}
                                      >
                                        未分组
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                                  {memberExpanded ? "收起详情" : "展开详情"}
                                </span>
                              </button>

                              {memberExpanded ? (
                                <div
                                  style={{
                                    padding: "0 12px 12px",
                                    borderTop: "1px solid rgba(255, 36, 66, 0.10)",
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "10px",
                                  }}
                                >
                                  <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.6, marginTop: "10px" }}>
                                    {member.sourceSummary || "来源：本地收藏 / 分组整理"}
                                  </div>

                                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                                    {member.sampleLabels.slice(0, 5).map((label) => (
                                      <span
                                        key={`manager-label-${member.profileId}-${label}`}
                                        style={{
                                          padding: "3px 7px",
                                          borderRadius: "999px",
                                          background: "var(--bg-hover)",
                                          color: "var(--text-secondary)",
                                          fontSize: "0.6875rem",
                                        }}
                                      >
                                        {label}
                                      </span>
                                    ))}
                                  </div>

                                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", justifyContent: "flex-start" }}>
                                    <button
                                      type="button"
                                      onClick={() => toggleCreatorBatchSelection(member.profileId)}
                                      disabled={!canSelectIndividually}
                                      style={{
                                        padding: "6px 10px",
                                        borderRadius: "999px",
                                        border: `1px solid ${memberSelected ? "rgba(255, 36, 66, 0.24)" : "var(--border-light)"}`,
                                        background: memberSelected ? "rgba(255, 36, 66, 0.10)" : "var(--bg-card)",
                                        color: memberSelected ? "var(--color-primary)" : canSelectIndividually ? "var(--text-secondary)" : "var(--text-muted)",
                                        fontSize: "0.75rem",
                                        fontWeight: 700,
                                        cursor: canSelectIndividually ? "pointer" : "not-allowed",
                                        opacity: canSelectIndividually ? 1 : 0.55,
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      {!canSelectIndividually ? "待补 user_id" : memberSelected ? "取消选择" : "加入批量抓取"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void runCreatorRecentFetch(member.authorId || member.author, {
                                        recentDays: creatorRecentDays,
                                        maxNotes: creatorRecentLimit,
                                      })}
                                      disabled={!canSelectIndividually || creatorRecentBatchRunning}
                                      style={{
                                        ...segmentedButtonStyle(true),
                                        padding: "6px 10px",
                                        fontSize: "0.75rem",
                                        opacity: !canSelectIndividually || creatorRecentBatchRunning ? 0.55 : 1,
                                        cursor: !canSelectIndividually || creatorRecentBatchRunning ? "not-allowed" : "pointer",
                                      }}
                                    >
                                      单独抓取
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void openExternalUrl(member.profileUrl, `${member.author}主页`)}
                                      disabled={!member.profileUrl}
                                      style={{
                                        ...segmentedButtonStyle(false),
                                        padding: "6px 10px",
                                        fontSize: "0.75rem",
                                        opacity: member.profileUrl ? 1 : 0.55,
                                        cursor: member.profileUrl ? "pointer" : "not-allowed",
                                      }}
                                    >
                                      主页
                                    </button>
                                  </div>

                                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                                      共享分组
                                    </span>
                                    {trackerCreatorGroupOptions.map((option) => {
                                      const active = currentGroups.includes(option.value);
                                      return (
                                        <button
                                          key={`manager-group-toggle-${member.profileId}-${option.value}`}
                                          type="button"
                                          onClick={() => void toggleSharedCreatorGroupMembership(member.profileId, option.value)}
                                          disabled={savingSharedGroup}
                                          style={{
                                            padding: "6px 10px",
                                            borderRadius: "999px",
                                            border: `1px solid ${active ? "rgba(255, 36, 66, 0.26)" : "var(--border-light)"}`,
                                            background: active ? "rgba(255, 36, 66, 0.10)" : "var(--bg-card)",
                                            color: active ? "var(--color-primary)" : "var(--text-secondary)",
                                            fontSize: "0.75rem",
                                            fontWeight: 700,
                                            cursor: savingSharedGroup ? "wait" : "pointer",
                                            opacity: savingSharedGroup ? 0.65 : 1,
                                            whiteSpace: "nowrap",
                                          }}
                                        >
                                          {active ? `已在 ${option.label}` : `加入 ${option.label}`}
                                        </button>
                                      );
                                    })}
                                    <button
                                      type="button"
                                      onClick={() => void saveSharedCreatorGroupMembership(member.profileId, [])}
                                      disabled={savingSharedGroup || currentGroups.length === 0}
                                      style={{
                                        padding: "6px 10px",
                                        borderRadius: "999px",
                                        border: "1px solid var(--border-light)",
                                        background: currentGroups.length === 0 ? "rgba(148, 163, 184, 0.10)" : "var(--bg-card)",
                                        color: currentGroups.length === 0 ? "var(--text-muted)" : "var(--text-secondary)",
                                        fontSize: "0.75rem",
                                        fontWeight: 700,
                                        cursor: savingSharedGroup || currentGroups.length === 0 ? "not-allowed" : "pointer",
                                        opacity: savingSharedGroup || currentGroups.length === 0 ? 0.55 : 1,
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      移到未分组
                                    </button>
                                    <span style={{ fontSize: "0.6875rem", color: savingSharedGroup ? "#C2410C" : "var(--text-muted)" }}>
                                      {savingSharedGroup ? "保存中..." : "支持同时加入多个分组"}
                                    </span>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
            当前搜索条件下没有匹配到共享分组成员。
          </div>
        )}
          </>
        ) : null}
      </div>
    );
  };

  const renderFrequentAuthorQuickPicker = () => {
    if (authorCandidates.length === 0) {
      return (
        <div
          style={{
            padding: "14px",
            borderRadius: "var(--radius-md)",
            border: "1px dashed var(--border-light)",
            background: "var(--bg-hover)",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          <div>
            <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-main)" }}>
              高频博主快捷添加
            </div>
            <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.6, marginTop: "4px" }}>
              共享智能分组完成后，会按本地内容里作者出现次数整理高频博主，默认展示前 10 个，点圆形头像就能直接加入“指定关注爬取”。
            </div>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button type="button" onClick={handleBuildSmartGroups} style={segmentedButtonStyle(true)}>
              生成共享智能分组
            </button>
            <button type="button" onClick={handleRefreshSharedCreatorAssignments} style={segmentedButtonStyle(false)}>
              仅整理博主 / UP
            </button>
          </div>
        </div>
      );
    }

    return (
      <div
        style={{
          padding: "14px",
          borderRadius: "var(--radius-md)",
          border: "1px solid rgba(255, 36, 66, 0.16)",
          background: "linear-gradient(180deg, rgba(255, 36, 66, 0.06), rgba(255, 138, 0, 0.04))",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-main)" }}>
              高频博主快捷添加
            </div>
            <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.6, marginTop: "4px" }}>
              按收藏里出现次数排序。默认只显示前 10 个，点头像就直接加入指定关注爬取。
            </div>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button type="button" onClick={handleBuildSmartGroups} style={segmentedButtonStyle(false)}>
              刷新共享智能分组
            </button>
            <button type="button" onClick={handleRefreshSharedCreatorAssignments} style={segmentedButtonStyle(false)}>
              仅整理博主 / UP
            </button>
          </div>
        </div>

        {authorCandidateMeta && (
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            {authorCandidateMeta.message}
          </div>
        )}

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setFrequentAuthorGroupFilter("all")}
            style={segmentedButtonStyle(frequentAuthorGroupFilter === "all")}
          >
            全部 · {frequentAuthorCandidates.length}
          </button>
          {frequentAuthorGroupOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setFrequentAuthorGroupFilter(option.value)}
              style={segmentedButtonStyle(frequentAuthorGroupFilter === option.value)}
            >
              {option.label} · {frequentAuthorGroupCounts[option.value] || 0}
            </button>
          ))}
        </div>

        {filteredFrequentAuthorCandidates.length > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "10px" }}>
            {visibleFrequentAuthorCandidates.map((candidate, index) => {
              const alreadyTracked = Boolean(candidate.author_id) && trackerCreatorMonitors.some((monitor) => monitor.user_id === candidate.author_id);
              const groupLabels = getCandidateGroupLabels(candidate);
              const avatarText = (candidate.author || "?").trim().slice(0, 2) || "?";
              return (
                <div
                  key={`${candidate.author}-${candidate.author_id || index}`}
                  style={{
                    padding: "12px",
                    borderRadius: "var(--radius-sm)",
                    border: alreadyTracked ? "1px solid rgba(255, 36, 66, 0.28)" : "1px solid var(--border-light)",
                    background: alreadyTracked ? "rgba(255, 36, 66, 0.06)" : "var(--bg-card)",
                    display: "flex",
                    gap: "12px",
                    alignItems: "flex-start",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => void handleAddFrequentAuthorToCreatorMonitor(candidate)}
                    disabled={!candidate.author_id}
                    title={candidate.author_id ? "点头像直接加入指定关注爬取" : "这个作者还没有解析出 user_id"}
                    style={{
                      width: "44px",
                      height: "44px",
                      borderRadius: "50%",
                      border: "none",
                      background: alreadyTracked
                        ? "linear-gradient(135deg, rgba(255, 36, 66, 0.92), rgba(255, 138, 0, 0.88))"
                        : "linear-gradient(135deg, rgba(255, 36, 66, 0.16), rgba(255, 138, 0, 0.14))",
                      color: alreadyTracked ? "white" : "var(--color-primary)",
                      fontSize: "0.875rem",
                      fontWeight: 800,
                      cursor: candidate.author_id ? "pointer" : "not-allowed",
                      opacity: candidate.author_id ? 1 : 0.45,
                      flexShrink: 0,
                    }}
                  >
                    {avatarText}
                  </button>

                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center" }}>
                      <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-main)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {candidate.author}
                      </span>
                      <span style={{ fontSize: "0.6875rem", color: alreadyTracked ? "var(--color-primary)" : "var(--text-muted)", whiteSpace: "nowrap" }}>
                        {alreadyTracked ? "已加入" : `TOP ${index + 1}`}
                      </span>
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                      收藏出现 {candidate.note_count} 次 · 收藏 {candidate.total_collects} · 点赞 {candidate.total_likes}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
                      最近：{candidate.latest_title || "暂无"}
                    </div>
                    {groupLabels.length > 0 ? (
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                        {groupLabels.slice(0, 3).map((label) => (
                          <span
                            key={label}
                            style={{
                              padding: "3px 6px",
                              borderRadius: "var(--radius-sm)",
                              background: "rgba(255, 138, 0, 0.10)",
                              color: "#C2410C",
                              fontSize: "0.6875rem",
                              fontWeight: 700,
                            }}
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
            当前筛选条件下还没有匹配到博主。可以切回“全部”，或者先重新执行一次智能分组。
          </div>
        )}

        {filteredFrequentAuthorCandidates.length > 10 ? (
          <div style={{ display: "flex", justifyContent: "center" }}>
            <button
              type="button"
              onClick={() => setShowAllFrequentAuthors((value) => !value)}
              style={segmentedButtonStyle(false)}
            >
              {showAllFrequentAuthors
                ? "收起高频博主"
                : `展开剩余 ${filteredFrequentAuthorCandidates.length - 10} 个高频博主`}
            </button>
          </div>
        ) : null}
      </div>
    );
  };

  const renderCreatorRecentWorkbenchContent = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <button
        type="button"
        aria-expanded={showCreatorRecentWorkbench}
        onClick={() => setShowCreatorRecentWorkbench((value) => !value)}
        style={{
          width: "100%",
          padding: "0",
          border: "none",
          background: "transparent",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-main)" }}>
              输入博主名称、主页链接或 `user_id`，主动补抓最近动态
            </div>
            <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.6, marginTop: "4px" }}>
              默认折叠。展开后可直接抓最近内容；共享分组里的整组抓取和批量选中也都复用这里的链路。
            </div>
          </div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 10px",
              borderRadius: "999px",
              border: "1px solid var(--border-light)",
              background: "var(--bg-card)",
              color: "var(--text-secondary)",
              fontSize: "0.75rem",
              fontWeight: 700,
            }}
          >
            {showCreatorRecentWorkbench ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {showCreatorRecentWorkbench ? "收起" : "展开"}
          </div>
        </div>
      </button>

      {showCreatorRecentWorkbench && (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
            如果输入的是名称，会优先在本地已记录的名字到 ID 映射里匹配，再抓取最近几天内容。下面也可以直接使用共享分组结果做整组或多博主批量抓取，并手动整理分组成员。
          </div>

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
            <input
              type="text"
              value={creatorSearchQuery}
              onChange={(e) => setCreatorSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (isActionEnterKey(e)) {
                  e.preventDefault();
                  void handleFetchCreatorRecent();
                }
              }}
              placeholder="输入博主名称、主页链接或 user_id"
              style={{ ...compactControlStyle, flex: 1, minWidth: "260px" }}
            />
            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.875rem", color: "var(--text-main)" }}>
              最近
              <input
                type="number"
                min={1}
                max={365}
                value={creatorRecentDays}
                onChange={(e) => setCreatorRecentDays(Number(e.target.value || 1))}
                style={{ ...compactControlStyle, width: "88px" }}
              />
              天
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.875rem", color: "var(--text-main)" }}>
              抓取
              <input
                type="number"
                min={1}
                max={50}
                value={creatorRecentLimit}
                onChange={(e) => setCreatorRecentLimit(Number(e.target.value || 1))}
                style={{ ...compactControlStyle, width: "88px" }}
              />
              条
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.875rem", color: "var(--text-main)" }}>
              <input
                type="checkbox"
                checked={creatorRecentAutoSaveAfterFetch}
                onChange={(e) => setCreatorRecentAutoSaveAfterFetch(e.target.checked)}
              />
              抓取后自动一键入库
            </label>
            <button
              type="button"
              onClick={() => void handleFetchCreatorRecent()}
              disabled={creatorRecentRunning || !creatorSearchQuery.trim()}
              style={segmentedButtonStyle(true)}
            >
              {creatorRecentRunning ? "抓取中..." : "抓取最近动态"}
            </button>
            {creatorRecentRunning && creatorRecentTaskId ? (
              <button
                type="button"
                onClick={() => void handleCancelCreatorRecent()}
                style={segmentedButtonStyle(false)}
              >
                停止
              </button>
            ) : null}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
            指定博主抓取使用插件 bridge 优先链路：由浏览器扩展打开博主主页并读取页面状态 / DOM，和专辑、搜索抓取保持一致。
            当前不会静默回退 Playwright；如插件未连接、页面没有读到笔记、访问频繁、扫码或登录限制，任务会停止并提示处理。批量抓取仍建议控制频率。
          </div>
          <div
            style={{
              padding: "10px 12px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid rgba(245, 158, 11, 0.45)",
              background: "rgba(245, 158, 11, 0.12)",
              color: "#92400e",
              fontSize: "0.8125rem",
              fontWeight: 700,
              lineHeight: 1.6,
            }}
          >
            风险提示：访问指定博主主页本身就可能触发小红书“访问频繁/安全验证”，即使走插件 bridge 也不稳定。建议优先使用插件路径、小批量低频执行，遇到限制立即停止并等待恢复。
          </div>

          {renderSharedCreatorBatchSelector()}
        </div>
      )}

      {creatorBatchResults.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-main)" }}>
              批量抓取结果 · 成功 {creatorBatchResults.filter((item) => item.result).length} 位 / 失败 {creatorBatchResults.filter((item) => item.error).length} 位
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
              <button
                type="button"
                onClick={() => void handleSaveCreatorRecentNotes(
                  creatorBatchResults.flatMap((item) => item.result?.notes || []),
                  "博主最近动态批量抓取",
                  "批量抓取结果已入库",
                )}
                disabled={previewSaveRunning || creatorBatchResults.every((item) => !item.result?.notes?.length)}
                style={{
                  ...segmentedButtonStyle(true),
                  opacity: previewSaveRunning || creatorBatchResults.every((item) => !item.result?.notes?.length) ? 0.55 : 1,
                  cursor: previewSaveRunning || creatorBatchResults.every((item) => !item.result?.notes?.length) ? "not-allowed" : "pointer",
                }}
              >
                <FolderDown style={{ width: "14px", height: "14px" }} />
                {previewSaveRunning ? "入库中..." : "一键入库全部结果"}
              </button>
              <button
                type="button"
                onClick={() => void handleRefreshCreatorBatchResults()}
                disabled={creatorRecentBatchRunning}
                style={{
                  ...segmentedButtonStyle(false),
                  opacity: creatorRecentBatchRunning ? 0.55 : 1,
                  cursor: creatorRecentBatchRunning ? "not-allowed" : "pointer",
                }}
              >
                <RefreshCw style={{ width: "14px", height: "14px" }} />
                {creatorRecentBatchRunning ? "刷新中..." : "刷新结果"}
              </button>
              <button
                type="button"
                onClick={() => setCreatorBatchResults([])}
                disabled={creatorRecentBatchRunning}
                style={{
                  ...segmentedButtonStyle(false),
                  opacity: creatorRecentBatchRunning ? 0.55 : 1,
                  cursor: creatorRecentBatchRunning ? "not-allowed" : "pointer",
                }}
              >
                清空结果
              </button>
            </div>
          </div>

          {creatorBatchResults.map((item) => (
            <div
              key={`creator-batch-${item.target.profileId}`}
              style={{
                padding: "14px",
                borderRadius: "var(--radius-md)",
                border: item.result ? "1px solid rgba(255, 138, 0, 0.18)" : "1px solid rgba(239, 68, 68, 0.20)",
                background: item.result ? "var(--bg-card)" : "rgba(239, 68, 68, 0.05)",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-main)" }}>
                      {item.result?.resolved_author || item.target.author}
                    </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "4px", lineHeight: 1.6 }}>
                    {item.target.groupLabel ? `${item.target.groupLabel} · ` : ""}
                    {item.result
                      ? `最近 ${item.result.recent_days} 天 ${item.result.total_found} 条`
                      : item.error || "抓取失败"}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                  {item.result ? (
                    <button
                      type="button"
                      onClick={() => void handleSaveCreatorRecentNotes(
                        item.result?.notes || [],
                        item.result?.resolved_author || item.target.author,
                        `${item.result?.resolved_author || item.target.author}动态已入库`,
                      )}
                      disabled={previewSaveRunning || item.result.notes.length === 0}
                      style={{
                        ...segmentedButtonStyle(true),
                        opacity: previewSaveRunning || item.result.notes.length === 0 ? 0.55 : 1,
                        cursor: previewSaveRunning || item.result.notes.length === 0 ? "not-allowed" : "pointer",
                      }}
                    >
                      <FolderDown style={{ width: "14px", height: "14px" }} />
                      {previewSaveRunning ? "入库中..." : "全部入库"}
                    </button>
                  ) : null}
                  {item.result?.profile_url || item.target.authorId ? (
                    <button
                      type="button"
                      onClick={() => void openExternalUrl(
                        item.result?.profile_url || buildXhsProfileUrl(item.target.authorId),
                        `${item.result?.resolved_author || item.target.author}主页`,
                      )}
                      style={segmentedButtonStyle(false)}
                    >
                      主页
                    </button>
                  ) : null}
                </div>
              </div>

              {item.result ? (
                item.result.notes.length > 0 ? (
                  renderCreatorNoteResults({
                    notes: item.result.notes,
                    carouselRef: creatorBatchResultCarouselRef,
                    layout: creatorBatchResultLayout,
                    onLayoutChange: setCreatorBatchResultLayout,
                    expandedIds: expandedCreatorBatchNotes,
                    onToggleExpand: (noteId) => setExpandedCreatorBatchNotes((prev) => {
                      const next = new Set(prev);
                      if (next.has(noteId)) next.delete(noteId);
                      else next.add(noteId);
                      return next;
                    }),
                    sourceLabel: item.result.resolved_author || item.target.author,
                    saveAllTitle: `${item.result.resolved_author || item.target.author}动态已入库`,
                  })
                ) : (
                  <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
                    这位博主在当前时间范围内没有可用内容。
                  </div>
                )
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {creatorRecentResult ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ fontSize: "0.875rem", color: "var(--text-main)", fontWeight: 700 }}>
              {creatorRecentResult.resolved_author} · 最近 {creatorRecentResult.recent_days} 天 {creatorRecentResult.total_found} 条
            </div>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
              <button
                type="button"
                onClick={() => void handleSaveCreatorRecentNotes(
                  creatorRecentResult.notes,
                  creatorRecentResult.resolved_author || creatorRecentResult.creator_query,
                  "博主最近动态已入库",
                )}
                disabled={previewSaveRunning || creatorRecentResult.notes.length === 0}
                style={{
                  ...segmentedButtonStyle(true),
                  opacity: previewSaveRunning || creatorRecentResult.notes.length === 0 ? 0.55 : 1,
                  cursor: previewSaveRunning || creatorRecentResult.notes.length === 0 ? "not-allowed" : "pointer",
                }}
              >
                <FolderDown style={{ width: "14px", height: "14px" }} />
                {previewSaveRunning ? "入库中..." : "一键入库"}
              </button>
              <button
                type="button"
                onClick={() => void handleRefreshCreatorRecentResult()}
                disabled={creatorRecentRunning}
                style={{
                  ...segmentedButtonStyle(false),
                  opacity: creatorRecentRunning ? 0.55 : 1,
                  cursor: creatorRecentRunning ? "not-allowed" : "pointer",
                }}
              >
                <RefreshCw style={{ width: "14px", height: "14px" }} />
                {creatorRecentRunning ? "刷新中..." : "刷新结果"}
              </button>
              <button
                type="button"
                onClick={() => void handleAddFrequentAuthorToCreatorMonitor({
                  author: creatorRecentResult.resolved_author,
                  author_id: creatorRecentResult.resolved_user_id,
                  note_count: creatorRecentResult.total_found,
                  total_likes: creatorRecentResult.notes.reduce((sum, item) => sum + (item.likes || 0), 0),
                  total_collects: creatorRecentResult.notes.reduce((sum, item) => sum + (item.collects || 0), 0),
                  total_comments: creatorRecentResult.notes.reduce((sum, item) => sum + (item.comments_count || 0), 0),
                  latest_date: creatorRecentResult.notes[0]?.published_at || "",
                  latest_title: creatorRecentResult.notes[0]?.title || "",
                  sample_note_urls: creatorRecentResult.notes.map((item) => item.url).filter(Boolean).slice(0, 6),
                  sample_titles: creatorRecentResult.notes.map((item) => item.title).filter(Boolean).slice(0, 6),
                  sample_albums: [],
                  sample_tags: [],
                  source_summary: `来自指定博主抓取：${creatorRecentResult.creator_query}`,
                  score: creatorRecentResult.notes.reduce((sum, item) => sum + (item.likes || 0) + (item.collects || 0), 0),
                })}
                style={segmentedButtonStyle(
                  trackerCreatorMonitors.some((monitor) => monitor.user_id === creatorRecentResult.resolved_user_id)
                )}
              >
                {trackerCreatorMonitors.some((monitor) => monitor.user_id === creatorRecentResult.resolved_user_id)
                  ? "已在特定关注"
                  : "加入特定关注"}
              </button>
              <button
                type="button"
                onClick={() => void openExternalUrl(
                  creatorRecentResult.profile_url || buildXhsProfileUrl(creatorRecentResult.resolved_user_id),
                  `${creatorRecentResult.resolved_author}主页`,
                )}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  color: "var(--color-primary)",
                  textDecoration: "none",
                  fontSize: "0.8125rem",
                  fontWeight: 700,
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                <ExternalLink size={14} />
                打开主页
              </button>
            </div>
          </div>
          {creatorRecentResult.notes.length > 0 ? renderCreatorNoteResults({
            notes: creatorRecentResult.notes,
            carouselRef: creatorRecentResultCarouselRef,
            layout: creatorRecentResultLayout,
            onLayoutChange: setCreatorRecentResultLayout,
            expandedIds: expandedCreatorRecentNotes,
            onToggleExpand: (noteId) => setExpandedCreatorRecentNotes((prev) => {
              const next = new Set(prev);
              if (next.has(noteId)) next.delete(noteId);
              else next.add(noteId);
              return next;
            }),
            sourceLabel: creatorRecentResult.resolved_author || creatorRecentResult.creator_query,
            saveAllTitle: "博主最近动态已入库",
          }) : (
            <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
              这位博主在你设定的最近天数内没有读到可用内容。
            </div>
          )}
        </div>
      ) : null}
    </div>
  );

  const renderCreatorRecentPanel = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <Card title="主动抓取 / 指定博主最近动态" icon={<Search style={{ width: "18px", height: "18px" }} />}>
        {renderCreatorRecentWorkbenchContent()}
      </Card>
      {renderSharedCreatorGroupManager()}
    </div>
  );

  const renderCreatorPushList = () => {
    const enabledCreatorCount = creatorEntries.filter((monitor) => monitor.enabled).length;
    const hasSmartGroups = visibleSharedCreatorGroups.length > 0;
    const filterLabel = creatorMonitorGroupFilter === "all"
      ? "全部"
      : creatorMonitorGroupFilter === "__ungrouped__"
        ? "未分组"
        : creatorGroupLabelMap.get(creatorMonitorGroupFilter) || creatorMonitorGroupFilter;
    const startIndex = filteredCreatorEntries.length === 0 ? 0 : safeCreatorMonitorPage * creatorMonitorPageSize + 1;
    const endIndex = Math.min(filteredCreatorEntries.length, startIndex + visibleCreatorEntries.length - 1);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {renderPushRow(
          "creator",
          "特定关注爬取",
          `${creatorEntries.length} 个博主定义 · 已单独开启 ${enabledCreatorCount} 个 · 当前筛选 ${filterLabel} · 每页 8 个 · 标题开关用于一键全开/全关`,
          trackerCreatorPushEnabled,
          handleToggleCreatorPush,
          handleDeleteCreatorPush,
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div>
              <div style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-main)" }}>
                具体博主定义
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.6, marginTop: "4px" }}>
                每个博主都可以独立开启、关闭和删除；手动添加时填写显示名称，以及主页 /user/profile/ 后面的用户号，不是小红书号。
              </div>
              <div
                style={{
                  marginTop: "8px",
                  padding: "8px 10px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid rgba(245, 158, 11, 0.45)",
                  background: "rgba(245, 158, 11, 0.12)",
                  color: "#92400e",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  lineHeight: 1.6,
                }}
              >
                可能触发反爬，并不稳定：特定关注/指定博主会访问博主主页，频率过高时容易出现访问频繁或验证页。建议分批低频运行。
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-light)", background: "var(--bg-card)" }}>
              <button
                type="button"
                onClick={() => setShowCreatorImportPanel((value) => !value)}
                style={{ ...segmentedButtonStyle(showCreatorImportPanel), justifyContent: "space-between", width: "100%" }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                  <FolderDown style={{ width: "14px", height: "14px" }} />
                  从智能分组快速导入
                </span>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{showCreatorImportPanel ? "收起" : "展开"}</span>
              </button>
              {showCreatorImportPanel ? (
                <>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    {hasSmartGroups ? "选择分组后点击添加，会只导入未添加的博主。" : "先执行共享智能分组后可按组导入。"}
                  </span>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {visibleSharedCreatorGroups.map((group) => {
                      const importableCount = group.members.filter((member) => member.authorId && !trackedCreatorUserIds.has(normalizeXhsProfileUserId(member.authorId))).length;
                      return (
                        <button
                          key={`import-${group.value}`}
                          type="button"
                          onClick={() => void handleImportCreatorGroup(group.value)}
                          disabled={importableCount === 0}
                          style={segmentedButtonStyle(false)}
                          title={importableCount === 0 ? "该组博主都已在特定关注里" : `导入 ${importableCount} 个未添加博主`}
                        >
                          <FolderDown style={{ width: "14px", height: "14px" }} />
                          {group.label} · 添加 {importableCount}
                        </button>
                      );
                    })}
                    {!hasSmartGroups ? (
                      <button type="button" onClick={handleRefreshSharedCreatorAssignments} style={segmentedButtonStyle(false)}>
                        生成智能分组
                      </button>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-light)", background: "var(--bg-card)" }}>
              <button
                type="button"
                onClick={() => setShowCreatorFilterPanel((value) => !value)}
                style={{ ...segmentedButtonStyle(showCreatorFilterPanel), justifyContent: "space-between", width: "100%" }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                  <Filter style={{ width: "14px", height: "14px" }} />
                  标签过滤
                </span>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{filterLabel} · {showCreatorFilterPanel ? "收起" : "展开"}</span>
              </button>
              {showCreatorFilterPanel ? (
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => { setCreatorMonitorGroupFilter("all"); setCreatorMonitorPage(0); }}
                style={segmentedButtonStyle(creatorMonitorGroupFilter === "all")}
              >
                全部 · {creatorEntries.length}
              </button>
              {creatorGroupDisplayOptions.map((option) => (
                <button
                  key={`monitor-filter-${option.value}`}
                  type="button"
                  onClick={() => { setCreatorMonitorGroupFilter(option.value); setCreatorMonitorPage(0); }}
                  style={segmentedButtonStyle(creatorMonitorGroupFilter === option.value)}
                >
                  {option.label} · {creatorEntries.filter((monitor) => getMonitorGroupValues(monitor).includes(option.value)).length}
                </button>
              ))}
              <button
                type="button"
                onClick={() => { setCreatorMonitorGroupFilter("__ungrouped__"); setCreatorMonitorPage(0); }}
                style={segmentedButtonStyle(creatorMonitorGroupFilter === "__ungrouped__")}
              >
                未分组 · {creatorEntries.filter((monitor) => getMonitorGroupValues(monitor).length === 0).length}
              </button>
                </div>
              ) : null}
            </div>

            {visibleCreatorEntries.length > 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "10px" }}>
                {visibleCreatorEntries.map((creatorMonitor) => {
                  const userId = normalizeXhsProfileUserId(creatorMonitor.user_id);
                  const profile = trackerCreatorProfiles[userId];
                  const active = creatorMonitor.enabled;
                  const source = profile?.source_summary || profile?.latest_title || "来自共享智能分组 / 手动添加";
                  const groupLabels = getCreatorMonitorGroupLabels(creatorMonitor);
                  return (
                    <div
                      key={creatorMonitor.id}
                      style={{
                        position: "relative",
                        textAlign: "left",
                        padding: "10px",
                        borderRadius: "var(--radius-sm)",
                        background: active ? "rgba(255, 36, 66, 0.10)" : "var(--bg-hover)",
                        border: active ? "1px solid rgba(255, 36, 66, 0.30)" : "1px solid var(--border-light)",
                        color: "var(--text-main)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "6px",
                        minWidth: 0,
                      }}
                    >
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <span
                          style={{
                            width: "7px",
                            height: "7px",
                            borderRadius: "50%",
                            background: active ? "var(--color-primary)" : "var(--text-muted)",
                            flexShrink: 0,
                          }}
                        />
                        <strong style={{ fontSize: "0.8125rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {profile?.author || creatorMonitor.label || userId || "未设置用户号"}
                        </strong>
                      </div>
                      <input
                        type="text"
                        value={creatorMonitor.label}
                        onChange={(e) => setTrackerCreatorMonitors((prev) => prev.map((monitor) => (
                          monitor.id === creatorMonitor.id
                            ? { ...monitor, label: e.target.value, author: e.target.value || monitor.author }
                            : monitor
                        )))}
                        placeholder="博主显示名称"
                        style={{ ...compactControlStyle, width: "100%" }}
                      />
                      <input
                        type="text"
                        value={creatorMonitor.user_id}
                        onChange={(e) => setTrackerCreatorMonitors((prev) => prev.map((monitor) => (
                          monitor.id === creatorMonitor.id
                            ? { ...monitor, user_id: normalizeXhsProfileUserId(e.target.value) }
                            : monitor
                        )))}
                        placeholder="填写主页 /user/profile/ 后面的用户号，不是小红书号"
                        style={{ ...compactControlStyle, width: "100%" }}
                      />
                      <span style={{ color: "var(--text-secondary)", fontSize: "0.75rem", lineHeight: 1.45, minHeight: "2.1em", overflow: "hidden" }}>
                        {source}
                      </span>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={() => creatorMonitor.user_id && void handleToggleCreatorUser(creatorMonitor.user_id)}
                          disabled={!creatorMonitor.user_id}
                          style={segmentedButtonStyle(active)}
                        >
                          {active ? "已开启" : "已关闭"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleRemoveCreatorMonitor(creatorMonitor)}
                          style={{ ...segmentedButtonStyle(false), color: "var(--color-danger)" }}
                        >
                          删除
                        </button>
                      </div>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        {resolveCreatorProfileUrl(profile, userId) ? (
                          <button
                            type="button"
                            onClick={() => void openExternalUrl(resolveCreatorProfileUrl(profile, userId), `${profile?.author || userId}主页`)}
                            style={{ ...segmentedButtonStyle(false), fontSize: "0.6875rem", padding: "5px 8px" }}
                          >
                            访问主页
                            <ExternalLink size={12} />
                          </button>
                        ) : null}
                        {profile?.sample_note_urls?.[0] ? (
                          <button
                            type="button"
                            onClick={() => void openExternalUrl(profile.sample_note_urls?.[0], `${profile?.author || userId}样本内容`)}
                            style={{ ...segmentedButtonStyle(false), fontSize: "0.6875rem", padding: "5px 8px" }}
                          >
                            预览样本
                            <ExternalLink size={12} />
                          </button>
                        ) : null}
                      </div>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                        <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>每次抓取</label>
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={creatorMonitor?.per_user_limit ?? 3}
                          onChange={(e) => setTrackerCreatorMonitors((prev) => prev.map((monitor) => (
                            monitor.id === creatorMonitor.id
                              ? { ...monitor, per_user_limit: Number(e.target.value || 1) }
                              : monitor
                          )))}
                          style={{ ...compactControlStyle, width: "72px" }}
                        />
                        <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>条</span>
                        <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>最近</label>
                        <input
                          type="number"
                          min={1}
                          max={365}
                          value={creatorMonitor?.recent_days ?? DEFAULT_XHS_RECENT_DAYS}
                          onChange={(e) => setTrackerCreatorMonitors((prev) => prev.map((monitor) => (
                            monitor.id === creatorMonitor.id
                              ? { ...monitor, recent_days: Math.max(1, Math.min(365, Number(e.target.value || 1))) }
                              : monitor
                          )))}
                          style={{ ...compactControlStyle, width: "72px" }}
                        />
                        <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>天</span>
                      </div>
                      <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                        <input
                          type="checkbox"
                          checked={creatorMonitor?.include_comments ?? false}
                          onChange={(e) => setTrackerCreatorMonitors((prev) => prev.map((monitor) => (
                            monitor.id === creatorMonitor.id
                              ? { ...monitor, include_comments: e.target.checked }
                              : monitor
                          )))}
                        />
                        选爬评论
                      </label>
                      {groupLabels.length > 0 ? (
                        <span style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                          {groupLabels.slice(0, 3).map((label) => (
                            <span
                              key={label}
                              style={{
                                padding: "3px 6px",
                                borderRadius: "var(--radius-sm)",
                                background: "rgba(255, 138, 0, 0.10)",
                                color: "#FF8A00",
                                fontSize: "0.6875rem",
                                fontWeight: 700,
                              }}
                            >
                              {label}
                            </span>
                          ))}
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ padding: "14px", borderRadius: "var(--radius-sm)", border: "1px dashed var(--border-light)", color: "var(--text-muted)", fontSize: "0.8125rem" }}>
                当前筛选下还没有博主，可以从智能分组导入或手动新增。
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                {filteredCreatorEntries.length > 0 ? `第 ${startIndex}-${endIndex} 个，共 ${filteredCreatorEntries.length} 个` : "共 0 个"}
              </span>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button type="button" disabled={safeCreatorMonitorPage <= 0} onClick={() => setCreatorMonitorPage((page) => Math.max(0, page - 1))} style={segmentedButtonStyle(false)}>
                  上一页
                </button>
                <button type="button" disabled={safeCreatorMonitorPage >= creatorMonitorPageCount - 1} onClick={() => setCreatorMonitorPage((page) => Math.min(creatorMonitorPageCount - 1, page + 1))} style={segmentedButtonStyle(false)}>
                  下一页
                </button>
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button type="button" onClick={() => setTrackerCreatorMonitors((prev) => [
                ...prev,
                createCreatorMonitor({ label: `手动新增 ${prev.length + 1}`, enabled: true }),
              ])} style={segmentedButtonStyle(false)}>
                <Plus style={{ width: "14px", height: "14px" }} />
                手动新增
              </button>
              <button type="button" onClick={() => persistTrackerDefinitions("特定关注定义已保存")} style={segmentedButtonStyle(true)}>
                保存特定关注定义
              </button>
              <button type="button" onClick={() => void handleClearCreatorMonitors("page")} style={{ ...segmentedButtonStyle(false), color: "var(--color-danger)" }}>
                删除本页关注
              </button>
              <button type="button" onClick={() => void handleClearCreatorMonitors("filtered")} style={{ ...segmentedButtonStyle(false), color: "var(--color-danger)" }}>
                删除当前筛选
              </button>
              <button type="button" onClick={() => void handleClearCreatorMonitors("all")} style={{ ...segmentedButtonStyle(false), color: "var(--color-danger)" }}>
                删除全部关注
              </button>
            </div>
          </div>,
        )}
      </div>
    );
  };

  const renderFollowingWorkbenchCard = () => (
    <Card title="关注监控实验台" icon={<Users style={{ width: "18px", height: "18px" }} />}>
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", margin: 0 }}>
          会先在搜索页搜索关键词，再自动点“筛选 -&gt; 已关注”，优先走插件 bridge 读取真实页面 state，再回退到浏览器兜底链路。
          {!cookieVerified && (
            <span style={{ color: "var(--color-warning)" }}>（需先配置 Cookie）</span>
          )}
        </p>

        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            onClick={() => setAlbumDedicatedWindowMode((v) => !v)}
            style={segmentedButtonStyle(albumDedicatedWindowMode)}
          >
            {albumDedicatedWindowMode ? "当前 Edge 独立窗口" : "使用当前窗口"}
          </button>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-main)", fontSize: "0.875rem" }}>
            扩展端口
            <input
              type="number"
              min={1024}
              max={65535}
              value={albumExtensionPort}
              onChange={(e) => setAlbumExtensionPort(Number(e.target.value || 9334))}
              style={{ ...compactControlStyle, width: "88px" }}
            />
          </label>
        </div>

        <div style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>
          抓取链路：插件优先（端口 {albumExtensionPort}，{albumDedicatedWindowMode ? "独立窗口" : "当前窗口"}）{` -> `}Playwright 兜底
        </div>

        <div style={{ height: "1px", background: "var(--border-light)" }} />

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-main)" }}>关注流关键词搜索</div>
          <div style={{ color: "var(--text-secondary)", fontSize: "0.8125rem" }}>
            直接按关键词搜索，再切到“已关注”筛选，只保留你已关注博主的结果。
          </div>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-main)", fontSize: "0.875rem" }}>
          抓取上限
          <input
            type="number"
            min={1}
            max={300}
            value={followingLimit}
            onChange={(e) => setFollowingLimit(normalizeFollowingLimit(e.target.value))}
            onBlur={(e) => setFollowingLimit(normalizeFollowingLimit(e.target.value))}
            style={{ ...compactControlStyle, width: "88px" }}
          />
          条
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-main)", fontSize: "0.875rem" }}>
          只保留最近
          <input
            type="number"
            min={1}
            max={365}
            value={followingRecentDays}
            onChange={(e) => setFollowingRecentDays(Math.max(1, Math.min(365, Number(e.target.value || 1))))}
            style={{ ...compactControlStyle, width: "88px" }}
          />
          天内发布
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-main)", fontSize: "0.875rem" }}>
          <input
            type="checkbox"
            checked={followingAutoSaveAfterFetch}
            onChange={(e) => setFollowingAutoSaveAfterFetch(e.target.checked)}
          />
          抓取后自动一键入库
        </label>

        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <input
            type="text"
            value={followingKeywords}
            onChange={(e) => setFollowingKeywords(e.target.value)}
            onKeyDown={(e) => {
              if (isActionEnterKey(e)) {
                e.preventDefault();
                handleFollowingFeed();
              }
            }}
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
          {followingRunning && followingFeedTaskId ? (
            <button
              type="button"
              onClick={() => void handleCancelFollowingFeed()}
              style={segmentedButtonStyle(false)}
            >
              停止
            </button>
            ) : null}
        </div>
        <div style={{ color: "var(--text-muted)", fontSize: "0.75rem", lineHeight: 1.6 }}>
          默认只返回结果，不自动入库；勾选后会在抓取完成时把当前关注流结果整批写入情报库。
        </div>
      </div>
    </Card>
  );

  const renderFollowingResultCard = () => followingResult ? (
    <Card title={`已关注筛选结果 (${followingResult.total_found})`} icon={<BookOpen style={{ width: "18px", height: "18px" }} />}>
      <div ref={followingResultTopRef} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "12px",
            alignItems: "center",
            flexWrap: "wrap",
            padding: "10px 12px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-light)",
            background: "rgba(255, 255, 255, 0.7)",
          }}
        >
          <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
            结果区已压缩。可以整块收起，也可以单条展开；需要快速定位时直接跳顶部或跳底部。
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            <button type="button" onClick={() => setShowFollowingResults((value) => !value)} style={segmentedButtonStyle(false)}>
              {showFollowingResults ? "收起结果" : "展开结果"}
            </button>
            <button type="button" onClick={() => scrollToAnchor(followingResultTopRef)} style={segmentedButtonStyle(false)}>
              回到顶部
            </button>
            <button type="button" onClick={() => scrollToAnchor(followingResultBottomRef)} style={segmentedButtonStyle(false)}>
              跳到底部
            </button>
          </div>
        </div>

        {showFollowingResults ? (
          renderHorizontalNoteResults({
            notes: followingResult.notes,
            carouselRef: followingResultCarouselRef,
            layout: followingResultLayout,
            onLayoutChange: setFollowingResultLayout,
            expandedIds: expandedFollowingNotes,
            onToggleExpand: (noteId) => setExpandedFollowingNotes((prev) => {
              const next = new Set(prev);
              if (next.has(noteId)) next.delete(noteId);
              else next.add(noteId);
              return next;
            }),
            saveSubfolder: (note) => buildFollowingSaveSubfolder(
              note.matched_keywords?.join("，") || followingKeywords,
            ),
            saveSuccessTitle: "关注流搜索笔记已入库",
            saveAllSubfolder: buildFollowingSaveSubfolder(keywordLabelFromFollowingResult(followingResult, followingKeywords)),
            saveAllSuccessTitle: "关注流搜索结果已入库",
            creatorSourceLabel: (note) => ({
              tags: note.matched_keywords?.length ? note.matched_keywords : parseKeywordInput(followingKeywords),
              summary: note.matched_keywords?.length ? `来自关注流搜索：${note.matched_keywords.join("，")}` : "来自关注流搜索",
            }),
            showMatchedKeywords: true,
          })
        ) : (
          <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
            结果已收起。需要继续看时点上面的“展开结果”。
          </div>
        )}
        <div ref={followingResultBottomRef} />
      </div>
    </Card>
  ) : null;

  const renderFollowingTab = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
          gap: "16px",
          alignItems: "start",
        }}
      >
        <Card title="搜索关键词情报推送" icon={<Filter style={{ width: "18px", height: "18px" }} />}>
          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            {renderPushRow(
              "keyword",
              "搜索关键词情报推送",
              `${trackerKeywordMonitors.length} 条定义 · ${trackerEnableKeywordSearch ? "已开启" : "已关闭"}`,
              trackerEnableKeywordSearch,
              handleToggleKeywordPush,
              handleDeleteKeywordPush,
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {trackerKeywordMonitors.map((monitor) => (
                  <div
                    key={monitor.id}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px",
                      padding: "12px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border-light)",
                      background: "var(--bg-card)",
                    }}
                  >
                    <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                      <div style={{ flex: 1, minWidth: "180px", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                        关键词定义
                      </div>
                      <div style={{ display: "flex", gap: "10px", alignItems: "center", flexShrink: 0, flexWrap: "nowrap" }}>
                        <button
                          type="button"
                          onClick={() => setTrackerKeywordMonitors((prev) => prev.map((item) => (
                            item.id === monitor.id ? { ...item, enabled: !item.enabled } : item
                          )))}
                          style={segmentedButtonStyle(monitor.enabled)}
                        >
                          {monitor.enabled ? "已开启" : "已关闭"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveKeywordMonitor(monitor.id)}
                          style={segmentedButtonStyle(false)}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                    <input
                      type="text"
                      value={trackerKeywordMonitorDrafts[monitor.id] ?? (monitor.keywords[0] || "")}
                      onChange={(e) => setTrackerKeywordMonitorDrafts((prev) => ({
                        ...prev,
                        [monitor.id]: e.target.value,
                      }))}
                      onBlur={(e) => commitKeywordMonitorDraft(monitor.id, e.target.value)}
                      onKeyDown={(e) => {
                        if (isActionEnterKey(e)) {
                          e.preventDefault();
                          commitKeywordMonitorDraft(monitor.id, (e.target as HTMLInputElement).value);
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                      placeholder="例如：科研工具"
                      style={{ ...compactControlStyle, width: "100%" }}
                    />
                    <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                        最低点赞
                        <input
                          type="number"
                          min={0}
                          value={monitor.min_likes}
                          onChange={(e) => setTrackerKeywordMonitors((prev) => prev.map((item) => (
                            item.id === monitor.id ? { ...item, min_likes: Number(e.target.value || 0) } : item
                          )))}
                          style={{ ...compactControlStyle, width: "88px" }}
                        />
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                        每词抓取
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={monitor.per_keyword_limit}
                          onChange={(e) => setTrackerKeywordMonitors((prev) => prev.map((item) => (
                            item.id === monitor.id ? { ...item, per_keyword_limit: Number(e.target.value || 1) } : item
                          )))}
                          style={{ ...compactControlStyle, width: "88px" }}
                        />
                        条
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                        最近
                        <input
                          type="number"
                          min={1}
                          max={365}
                          value={monitor.recent_days}
                          onChange={(e) => setTrackerKeywordMonitors((prev) => prev.map((item) => (
                            item.id === monitor.id ? { ...item, recent_days: Math.max(1, Math.min(365, Number(e.target.value || 1))) } : item
                          )))}
                          style={{ ...compactControlStyle, width: "72px" }}
                        />
                        天内发布
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                        <input
                          type="checkbox"
                          checked={monitor.include_comments}
                          onChange={(e) => setTrackerKeywordMonitors((prev) => prev.map((item) => (
                            item.id === monitor.id ? { ...item, include_comments: e.target.checked } : item
                          )))}
                        />
                        选爬评论
                      </label>
                      {monitor.include_comments ? (
                        <>
                          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                            前
                            <input
                              type="number"
                              min={1}
                              max={100}
                              value={monitor.comments_limit}
                              onChange={(e) => setTrackerKeywordMonitors((prev) => prev.map((item) => (
                                item.id === monitor.id ? { ...item, comments_limit: Number(e.target.value || 1) } : item
                              )))}
                              style={{ ...compactControlStyle, width: "72px" }}
                            />
                            条
                          </label>
                          <select
                            value={monitor.comments_sort_by}
                            onChange={(e) => setTrackerKeywordMonitors((prev) => prev.map((item) => (
                              item.id === monitor.id ? { ...item, comments_sort_by: e.target.value as "likes" | "time" } : item
                            )))}
                            style={{ ...compactControlStyle, width: "120px" }}
                          >
                            <option value="likes">高赞优先</option>
                            <option value="time">最新优先</option>
                          </select>
                        </>
                      ) : null}
                    </div>
                  </div>
                ))}
                {trackerKeywordMonitors.length === 0 ? (
                  <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
                    先在下面输入关键词并保存。保存时会按“一词一条定义”生成，这样每个关键词都能单独开关、单独设置评论抓取。
                  </div>
                ) : null}
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => setTrackerKeywordMonitors((prev) => [
                      ...prev,
                      createKeywordMonitor({
                        min_likes: trackerKeywordMinLikes,
                        per_keyword_limit: trackerKeywordLimit,
                      }),
                    ])}
                    style={segmentedButtonStyle(false)}
                  >
                    <Plus style={{ width: "14px", height: "14px" }} />
                    新增定义
                  </button>
                  <button type="button" onClick={handleSaveTrackerKeywords} style={segmentedButtonStyle(true)}>
                    保存搜索关键词情报推送
                  </button>
                </div>
              </div>,
            )}

            <div>
              <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-main)", marginBottom: "4px" }}>
                搜索关键词情报推送
              </div>
              <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", margin: 0, lineHeight: 1.6 }}>
                这里用于快速补充关键词，会自动拆成上面的独立定义；具体赞数、抓取条数和评论策略直接在上面的定义里调整。
              </p>
            </div>

            <input
              type="text"
              value={trackerKeywordDraft}
              onChange={(e) => setTrackerKeywordDraft(e.target.value)}
              onBlur={(e) => {
                applyKeywordDraftToMonitors(e.target.value);
              }}
              onKeyDown={(e) => {
                if (isActionEnterKey(e)) {
                  e.preventDefault();
                  applyKeywordDraftToMonitors((e.target as HTMLInputElement).value);
                  (e.target as HTMLInputElement).blur();
                }
              }}
              placeholder="科研工具, 论文写作, AI 工作流, 学术日常"
              style={{ ...compactControlStyle, width: "100%" }}
            />

            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
              <button
                type="button"
                onClick={handleToggleKeywordPush}
                style={segmentedButtonStyle(trackerEnableKeywordSearch)}
              >
                {trackerEnableKeywordSearch ? "搜索关键词情报推送已开启" : "搜索关键词情报推送已关闭"}
              </button>
              <button
                type="button"
                onClick={() => {
                  const preset = ["科研工具", "论文写作", "学术日常", "AI 工作流", "知识管理", "Obsidian"];
                  mergeKeywordsIntoKeywordMonitors(preset);
                }}
                style={segmentedButtonStyle(false)}
              >
                使用推荐关键词
              </button>
            </div>
          </div>
        </Card>

        <Card title="关注流情报推送" icon={<Users style={{ width: "18px", height: "18px" }} />}>
          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            {renderPushRow(
              "following-scan",
              "关注流情报推送",
              `${trackerFollowingScanMonitors.length} 条定义 · 已开启 ${trackerFollowingScanMonitors.filter((monitor) => monitor.enabled).length} 条 · 已关注筛选链路 · ${trackerFollowingScan.enabled ? "已开启" : "已关闭"}`,
              trackerFollowingScan.enabled,
              handleToggleFollowingScanPush,
              handleDeleteFollowingScanPush,
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {trackerFollowingScanMonitors.map((monitor) => (
                  <div
                    key={monitor.id}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px",
                      padding: "12px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border-light)",
                      background: "var(--bg-card)",
                    }}
                  >
                    <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                      <div style={{ flex: 1, minWidth: "180px", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                        关注流关键词
                      </div>
                      <div style={{ display: "flex", gap: "10px", alignItems: "center", flexShrink: 0, flexWrap: "nowrap" }}>
                        <button
                          type="button"
                          onClick={() => {
                            const nextMonitors = trackerFollowingScanMonitors.map((item) => (
                              item.id === monitor.id ? { ...item, enabled: !item.enabled } : item
                            ));
                            setTrackerFollowingScanMonitors(nextMonitors);
                            syncFollowingScanFromMonitors(nextMonitors);
                          }}
                          style={segmentedButtonStyle(monitor.enabled)}
                        >
                          {monitor.enabled ? "已开启" : "已关闭"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveFollowingScanMonitor(monitor.id)}
                          style={segmentedButtonStyle(false)}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                    <input
                      type="text"
                      value={trackerFollowingScanMonitorDrafts[monitor.id] ?? (monitor.keywords[0] || "")}
                      onChange={(e) => setTrackerFollowingScanMonitorDrafts((prev) => ({
                        ...prev,
                        [monitor.id]: e.target.value,
                      }))}
                      onBlur={(e) => commitFollowingScanMonitorDraft(monitor.id, e.target.value)}
                      onKeyDown={(e) => {
                        if (isActionEnterKey(e)) {
                          e.preventDefault();
                          commitFollowingScanMonitorDraft(monitor.id, (e.target as HTMLInputElement).value);
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                      placeholder="例如：科研工具"
                      style={{ ...compactControlStyle, width: "100%" }}
                    />
                    <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                        每词抓取
                        <input
                          type="number"
                          min={1}
                          max={200}
                          value={monitor.fetch_limit}
                          onChange={(e) => {
                            const nextMonitors = trackerFollowingScanMonitors.map((item) => (
                              item.id === monitor.id ? { ...item, fetch_limit: Number(e.target.value || 1) } : item
                            ));
                            setTrackerFollowingScanMonitors(nextMonitors);
                            syncFollowingScanFromMonitors(nextMonitors);
                          }}
                          style={{ ...compactControlStyle, width: "88px" }}
                        />
                        条
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                        只保留最近
                        <input
                          type="number"
                          min={1}
                          max={365}
                          value={monitor.recent_days}
                          onChange={(e) => {
                            const nextMonitors = trackerFollowingScanMonitors.map((item) => (
                              item.id === monitor.id
                                ? { ...item, recent_days: Math.max(1, Math.min(365, Number(e.target.value || 1))) }
                                : item
                            ));
                            setTrackerFollowingScanMonitors(nextMonitors);
                            syncFollowingScanFromMonitors(nextMonitors);
                          }}
                          style={{ ...compactControlStyle, width: "72px" }}
                        />
                        天
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                        <input
                          type="checkbox"
                          checked={monitor.include_comments}
                          onChange={(e) => {
                            const nextMonitors = trackerFollowingScanMonitors.map((item) => (
                              item.id === monitor.id ? { ...item, include_comments: e.target.checked } : item
                            ));
                            setTrackerFollowingScanMonitors(nextMonitors);
                            syncFollowingScanFromMonitors(nextMonitors);
                          }}
                        />
                        选爬评论
                      </label>
                      {monitor.include_comments ? (
                        <>
                          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                            前
                            <input
                              type="number"
                              min={1}
                              max={100}
                              value={monitor.comments_limit}
                              onChange={(e) => {
                                const nextMonitors = trackerFollowingScanMonitors.map((item) => (
                                  item.id === monitor.id ? { ...item, comments_limit: Number(e.target.value || 1) } : item
                                ));
                                setTrackerFollowingScanMonitors(nextMonitors);
                                syncFollowingScanFromMonitors(nextMonitors);
                              }}
                              style={{ ...compactControlStyle, width: "72px" }}
                            />
                            条
                          </label>
                          <select
                            value={monitor.comments_sort_by}
                            onChange={(e) => {
                              const nextMonitors = trackerFollowingScanMonitors.map((item) => (
                                item.id === monitor.id ? { ...item, comments_sort_by: e.target.value as "likes" | "time" } : item
                              ));
                              setTrackerFollowingScanMonitors(nextMonitors);
                              syncFollowingScanFromMonitors(nextMonitors);
                            }}
                            style={{ ...compactControlStyle, width: "120px" }}
                          >
                            <option value="likes">高赞优先</option>
                            <option value="time">最新优先</option>
                          </select>
                        </>
                      ) : null}
                    </div>
                  </div>
                ))}
                {trackerFollowingScanMonitors.length === 0 ? (
                  <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
                    先在下面输入关键词并保存。保存时会按“一词一条定义”生成，和搜索关键词情报推送一样，每个词都能单独开关和设置抓取参数。
                  </div>
                ) : null}
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => setTrackerFollowingScanMonitors((prev) => [
                      ...prev,
                      createFollowingScanMonitor({
                        fetch_limit: 20,
                        recent_days: DEFAULT_XHS_RECENT_DAYS,
                        keyword_filter: true,
                      }),
                    ])}
                    style={segmentedButtonStyle(false)}
                  >
                    <Plus style={{ width: "14px", height: "14px" }} />
                    新增定义
                  </button>
                  <button type="button" onClick={handleSaveFollowingScan} style={segmentedButtonStyle(true)}>
                    保存关注流情报推送
                  </button>
                </div>
              </div>,
            )}

            <div>
              <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-main)", marginBottom: "4px" }}>
                关注流情报推送
              </div>
              <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", margin: 0, lineHeight: 1.6 }}>
                这里用于快速补充关键词，会自动拆成上面的独立定义；执行时复用关注监控实验台链路，先搜索关键词，再切到“已关注”筛选。
              </p>
            </div>

            <input
              type="text"
              value={trackerFollowingScanKeywordDraft}
              onChange={(e) => setTrackerFollowingScanKeywordDraft(e.target.value)}
              onBlur={(e) => {
                applyFollowingScanDraftToMonitors(e.target.value);
              }}
              onKeyDown={(e) => {
                if (isActionEnterKey(e)) {
                  e.preventDefault();
                  applyFollowingScanDraftToMonitors((e.target as HTMLInputElement).value);
                  (e.target as HTMLInputElement).blur();
                }
              }}
              placeholder="科研工具, 论文写作, AI 工作流, 学术日常"
              style={{ ...compactControlStyle, width: "100%" }}
            />

            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
              <button
                type="button"
                onClick={handleToggleFollowingScanPush}
                style={segmentedButtonStyle(trackerFollowingScan.enabled)}
              >
                {trackerFollowingScan.enabled ? "关注流情报推送已开启" : "关注流情报推送已关闭"}
              </button>
              <button
                type="button"
                onClick={() => {
                  const preset = ["科研工具", "论文写作", "学术日常", "AI 工作流", "知识管理", "Obsidian"];
                  mergeKeywordsIntoFollowingScanMonitors(preset);
                }}
                style={segmentedButtonStyle(false)}
              >
                使用推荐关键词
              </button>
            </div>
          </div>
        </Card>
      </div>

      <Card title="博主最新动态爬取" icon={<BookOpen style={{ width: "18px", height: "18px" }} />}>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
            这个工作台单独占一整栏，和上面的两类情报推送配置分开。这里统一处理高频博主补充、特定关注定义、共享分组批量抓取和手动分组整理。
          </div>
          <div
            style={{
              padding: "10px 12px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid rgba(245, 158, 11, 0.45)",
              background: "rgba(245, 158, 11, 0.12)",
              color: "#92400e",
              fontSize: "0.8125rem",
              fontWeight: 700,
              lineHeight: 1.6,
            }}
          >
            风险提示：关注监控里的“博主最新动态爬取”会访问指定博主主页，频率过高时可能触发小红书访问频繁或安全验证，并不稳定。建议优先使用插件 bridge 路径，分批低频运行；一旦出现限制，应停止任务并等待恢复。
          </div>
          {renderFrequentAuthorQuickPicker()}
          {renderCreatorPushList()}
          <div style={{ height: "1px", background: "var(--border-light)" }} />
          {renderCreatorRecentWorkbenchContent()}
          {renderSharedCreatorGroupManager()}
        </div>
      </Card>

      {renderDetailDivider()}

      <Card title="共享智能分组" icon={<Zap style={{ width: "18px", height: "18px" }} />}>
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-main)", marginBottom: "4px" }}>
              共享智能分组
            </div>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", margin: 0, lineHeight: 1.6 }}>
              完整模式会统一扫描本地 xhs + B站内容并维护共享标签库；如果标签和组别已经有了，可以直接点“仅整理博主 / UP”，只刷新作者归组。小红书只根据本地笔记映射作者，不再走网页关注列表。
            </p>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "8px", lineHeight: 1.7 }}>
              原始标签 -&gt; 共享规则 -&gt; 共享组 -&gt; 作者入组。即博主会根据其笔记标签的分组情况加入对应共享组；这里管理的是笔记标签和分组的关系。
            </div>
          </div>

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <SmartGroupActionButton
              onClick={handleBuildSmartGroups}
              running={smartGroupRunning}
              secondaryLabel="仅整理博主 / UP"
              onSecondaryClick={handleRefreshSharedCreatorAssignments}
              gradient="linear-gradient(135deg, #FF6B81, #FF8A00)"
              borderColor="rgba(255, 138, 0, 0.28)"
            />
          </div>

          <div
            style={{
              borderRadius: "var(--radius-md)",
              border: "1px solid rgba(255, 138, 0, 0.18)",
              background: "rgba(255, 138, 0, 0.08)",
              overflow: "hidden",
            }}
          >
            <button
              type="button"
              aria-expanded={showSharedGroupingDetail}
              onClick={() => setShowSharedGroupingDetail((value) => !value)}
              style={{
                width: "100%",
                padding: "12px 14px",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: "0.875rem", fontWeight: 800, color: "var(--text-main)" }}>
                    {smartGroupRunning ? "正在整理共享智能分组" : smartGroupResult?.message || (Object.keys(trackerCreatorProfiles).length > 0
                      ? "已生成共享智能分组，可直接按组管理推送。"
                      : "先点“共享智能分组”做完整初始化；后续只想刷新作者归组时，直接点“仅整理博主 / UP”。")}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "4px", lineHeight: 1.6 }}>
                    当前博主 {trackerUserIds.length} 个 · 共享组别 {trackerCreatorGroupOptions.length} 个 ·
                    {vaultSignalCount > 0 ? ` 全库标签 ${vaultSignalCount} 个 · 带标签笔记 ${vaultIndexedFileCount} 篇 ·` : ""}
                    {showSharedGroupingDetail ? " 点击收起详情" : " 点击展开详情和规则词典"}
                  </div>
                  {sharedTagIndexPath && (
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "4px", lineHeight: 1.5 }}>
                      共享标签库已写入情报库：{sharedTagIndexPath}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                  {smartGroupResult && (
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      新增 {smartGroupResult.new_profile_count} · 更新 {smartGroupResult.updated_profile_count}
                    </div>
                  )}
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "6px 10px",
                      borderRadius: "999px",
                      border: "1px solid rgba(255, 138, 0, 0.20)",
                      background: "rgba(255, 255, 255, 0.7)",
                      color: "#C2410C",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                    }}
                  >
                    {showSharedGroupingDetail ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    {showSharedGroupingDetail ? "收起" : "展开"}
                  </div>
                </div>
              </div>
            </button>

            {showSharedGroupingDetail && (
              <div
                style={{
                  padding: "0 14px 14px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                  borderTop: "1px solid rgba(255, 138, 0, 0.12)",
                }}
              >
                <div
                  style={{
                    borderRadius: "var(--radius-md)",
                    border: "1px solid rgba(255, 138, 0, 0.18)",
                    background: "rgba(255, 138, 0, 0.05)",
                    overflow: "hidden",
                  }}
                >
                  <button
                    type="button"
                    aria-expanded={showSharedSignalRules}
                    onClick={() => setShowSharedSignalRules((value) => !value)}
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-main)" }}>
                          共享分组规则词典
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "4px", lineHeight: 1.6 }}>
                          这里是“原始标签 -&gt; 共享组”的映射规则。只有分组不准时，才需要展开这里微调。
                        </div>
                      </div>
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          padding: "6px 10px",
                          borderRadius: "999px",
                          border: "1px solid rgba(255, 138, 0, 0.18)",
                          background: "rgba(255, 255, 255, 0.72)",
                          color: "#C2410C",
                          fontSize: "0.75rem",
                          fontWeight: 700,
                        }}
                      >
                        {showSharedSignalRules ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        {showSharedSignalRules ? "收起规则" : "展开规则"}
                      </div>
                    </div>
                  </button>

                  {showSharedSignalRules && (
                    <div style={{ padding: "0 12px 12px", borderTop: "1px solid rgba(255, 138, 0, 0.12)" }}>
                      <SharedSignalMappingPanel
                        title="共享分组规则"
                        entries={sharedSignalEntries}
                        groupOptions={trackerCreatorGroupOptions}
                        saving={savingSignalMappings}
                        updatedAt={sharedCreatorGrouping.updated_at}
                        onSave={handleSaveSharedSignalMappings}
                        description="原始标签 -> 共享规则 -> 共享组 -> 作者入组。你可以把意思接近的标签并到同一个共享组里，也可以让一个标签同时挂多个共享组。保存后，重新执行一次“仅整理博主 / UP”或“共享智能分组”，作者会按这套规则重排。"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

      {renderFollowingResultCard()}

      {!followingResult && !followingRunning && !searchResult && !searchRunning && (
        <EmptyState
          icon={Users}
          title="关注监控"
          description="扫描关注用户最近发布的内容，再决定哪些作者和值得长期跟踪"
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
            onClick={() => handleGetCookieFromBrowser()}
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
      <div
        style={{
          padding: "12px 14px",
          borderRadius: "var(--radius-md)",
          border: "1px solid rgba(255, 138, 0, 0.18)",
          background: "rgba(255, 138, 0, 0.08)",
          fontSize: "0.8125rem",
          color: "#C2410C",
          lineHeight: 1.7,
          fontWeight: 600,
        }}
      >
        <div>因小红书限制，一次只能执行一个任务。请耐心等待当前任务完成后，再启动下一项抓取或入库。</div>
        <div>需要桌面非全屏，并漏出后台浏览器的一点点像素，才能正常滚动和爬取。</div>
      </div>

      <Card title="关键词扫描" icon={<Filter style={{ width: "18px", height: "18px" }} />}>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
            复用现有搜索链路，优先走插件 bridge 读取真实页面 state，再回退到浏览器兜底链路，扫描公开高赞笔记。
          </div>
          <div style={{ display: "flex", gap: "12px" }}>
            <input
              type="text"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (isActionEnterKey(e)) {
                  e.preventDefault();
                  handleSearch();
                }
              }}
              placeholder="输入关键词，搜索小红书公开笔记..."
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
              onClick={handleSearch}
              disabled={searchRunning || !searchKeyword.trim() || !cookieVerified}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "12px 24px",
                borderRadius: "var(--radius-md)",
                border: "none",
                background: searchRunning || !cookieVerified ? "var(--bg-hover)" : "var(--color-primary)",
                color: "white",
                fontSize: "0.9375rem",
                fontWeight: 600,
                cursor: searchRunning || !searchKeyword.trim() || !cookieVerified ? "not-allowed" : "pointer",
                opacity: searchRunning || !searchKeyword.trim() || !cookieVerified ? 0.6 : 1,
                transition: "all 0.2s ease",
              }}
            >
              {searchRunning ? (
                <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span className="animate-spin">⟳</span>
                  扫描中...
                </span>
              ) : (
                <>
                  <Search style={{ width: "16px", height: "16px" }} />
                  扫描
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
                <button type="button" disabled style={{ ...segmentedButtonStyle(true), cursor: "default" }}>
                  综合排序
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

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>只保留最近：</span>
              <input
                type="number"
                value={searchRecentDays}
                onChange={(e) => setSearchRecentDays(Math.max(1, Math.min(365, Number(e.target.value || 1))))}
                min={1}
                max={365}
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
              <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>天</span>
            </div>
          </div>

          <div style={{ display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.875rem", color: "var(--text-main)" }}>
              <input
                type="checkbox"
                checked={searchAutoSaveAfterFetch}
                onChange={(e) => setSearchAutoSaveAfterFetch(e.target.checked)}
              />
              抓取后自动一键入库
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.875rem", color: "var(--text-main)" }}>
              <input
                type="checkbox"
                checked={searchSaveComments}
                onChange={(e) => setSearchSaveComments(e.target.checked)}
              />
              保存时抓评论
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.875rem", color: "var(--text-main)" }}>
              评论上限
              <input
                type="number"
                min={1}
                max={100}
                value={searchSaveCommentsLimit}
                onChange={(e) => setSearchSaveCommentsLimit(Number(e.target.value || 1))}
                disabled={!searchSaveComments}
                style={{
                  width: "88px",
                  padding: "8px 12px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-light)",
                  background: "var(--bg-card)",
                  color: "var(--text-main)",
                  fontSize: "0.875rem",
                  opacity: searchSaveComments ? 1 : 0.5,
                }}
              />
              条
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>评论排序：</span>
              <div
                style={{
                  display: "flex",
                  gap: "6px",
                  padding: "4px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-light)",
                  background: "transparent",
                  opacity: searchSaveComments ? 1 : 0.5,
                }}
              >
                <button
                  type="button"
                  onClick={() => setSearchSaveCommentsSortBy("likes")}
                  disabled={!searchSaveComments}
                  style={segmentedButtonStyle(searchSaveCommentsSortBy === "likes")}
                >
                  高赞优先
                </button>
                <button
                  type="button"
                  onClick={() => setSearchSaveCommentsSortBy("time")}
                  disabled={!searchSaveComments}
                  style={segmentedButtonStyle(searchSaveCommentsSortBy === "time")}
                >
                  最新优先
                </button>
              </div>
            </div>
            <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
              不勾选时只抓结果不入库。仅单条入库时额外抓评论；批量“全部入库”或自动一键入库默认不抓评论。
            </span>
          </div>
        </div>
      </Card>

      {renderFollowingWorkbenchCard()}
      {renderFollowingResultCard()}

      {/* Search Results */}
      {searchResult && (
        <Card
          title={`关键词扫描结果 (${searchResult.total_found})`}
          icon={<BookOpen style={{ width: "18px", height: "18px" }} />}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "12px",
                alignItems: "center",
                flexWrap: "wrap",
                padding: "10px 12px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border-light)",
                background: "rgba(255, 255, 255, 0.72)",
              }}
            >
              <span style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
                会按统一入库格式保存到当前关键词文件夹；短文本笔记会优先补本地图片。
              </span>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                <button type="button" onClick={() => setShowSearchResults((value) => !value)} style={segmentedButtonStyle(false)}>
                  {showSearchResults ? "收起结果" : "展开结果"}
                </button>
                <button
                  onClick={() => void handleSaveSearchResults(searchResult.notes, searchResult.keyword)}
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
            </div>
            {showSearchResults ? (
              renderHorizontalNoteResults({
                notes: searchResult.notes,
                carouselRef: searchResultCarouselRef,
                layout: searchResultLayout,
                onLayoutChange: setSearchResultLayout,
                expandedIds: expandedNotes,
                onToggleExpand: toggleNoteExpand,
                saveSubfolder: () => buildKeywordSaveSubfolder(searchResult.keyword),
                saveSuccessTitle: "关键词笔记已入库",
                saveAllSubfolder: buildKeywordSaveSubfolder(searchResult.keyword),
                saveAllSuccessTitle: "关键词结果已入库",
                creatorSourceLabel: () => ({
                  tags: searchResult.keyword ? [searchResult.keyword] : [],
                  summary: searchResult.keyword ? `来自关键词搜索：${searchResult.keyword}` : "来自关键词搜索",
                }),
              })
            ) : (
              <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
                关键词扫描结果已收起。需要继续查看时点上面的“展开结果”。
              </div>
            )}
          </div>
        </Card>
      )}
      {renderCreatorRecentPanel()}
    </div>
  );

  const renderManualCrawlWorkbench = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div
        style={{
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--border-light)",
          background: "var(--bg-card)",
          overflow: "hidden",
        }}
      >
        <button
          type="button"
          aria-expanded={showManualCrawlWorkbench}
          onClick={() => setShowManualCrawlWorkbench((value) => !value)}
          style={{
            width: "100%",
            padding: "14px 16px",
            border: "none",
            background: "transparent",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-main)" }}>
                主动爬取 / 手动入库工具
              </div>
              <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginTop: "4px", lineHeight: 1.6 }}>
                单条入库、批量入库、评论抓取都收在这里。默认折叠，避免长期占页面空间。
              </div>
            </div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 10px",
                borderRadius: "999px",
                border: "1px solid var(--border-light)",
                background: "var(--bg-hover)",
                color: "var(--text-secondary)",
                fontSize: "0.75rem",
                fontWeight: 700,
              }}
            >
              {showManualCrawlWorkbench ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {showManualCrawlWorkbench ? "收起工具" : "展开工具"}
            </div>
          </div>
        </button>
      </div>

      {showManualCrawlWorkbench && renderManualCrawlTools()}
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
            onKeyDown={(e) => {
              if (isActionEnterKey(e)) {
                e.preventDefault();
                handleComments();
              }
            }}
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
            {commentsResult.strategy ? (
              <div style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>
                读取链路：{formatStrategyLabel(commentsResult.strategy)}
              </div>
            ) : null}
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
        subtitle="收藏专辑抓取、主动爬取、关注监控，一键获取 Cookie 并保存到情报库 xhs"
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
                  任务类型：{formatTaskKindLabel(backgroundTask.kind)} · Task ID: {backgroundTask.taskId}
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
                                  {formatTaskKindLabel(task.kind)}
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
                            {formatTaskKindLabel(selectedTask.kind)}
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

          {activeTab === "collections" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              {renderManualCrawlWorkbench()}
              {renderCollectionsTab()}
            </div>
          )}
          {activeTab === "search" && renderSearchTab()}
          {activeTab === "following" && renderFollowingTab()}
          {false && renderCommentsTab()}
        </div>
      </PageContent>
    </PageContainer>
  );
}
