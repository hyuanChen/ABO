import { useState, useEffect, type ReactNode } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Tv,
  Search,
  Filter,
  Hash,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  CheckCircle,
  AlertCircle,
  Play,
  Image as ImageIcon,
  FileText,
  MessageSquare,
  X,
  Plus,
  Cookie,
  FolderHeart,
  Users,
} from "lucide-react";
import { PageContainer, PageHeader, PageContent, Card, EmptyState, LoadingState } from "../../components/Layout";
import { PaginationControls } from "../../components/PaginationControls";
import { SmartGroupActionButton } from "../../components/SmartGroupActionButton";
import { SharedSignalMappingPanel, type SharedSignalEntry } from "../../components/SharedSignalMappingPanel";
import { useToast } from "../../components/Toast";
import { api } from "../../core/api";
import { isActionEnterKey } from "../../core/keyboard";
import { withLocationSuffix } from "../../core/pathDisplay";
import {
  readJsonStorage,
  readStringStorage,
  removeStorageKey,
  writeJsonStorage,
  writeStringStorage,
} from "../../core/storage";
import { useStore } from "../../core/store";
import { BilibiliCookieModal } from "./BilibiliCookieModal";
import BilibiliDynamicCard from "./BilibiliDynamicCard";
import { BilibiliFavoritesPage } from "./BilibiliFavoritesPage";
import {
  BiliDynamic,
  BiliDynamicFetchStats,
  BilibiliDailyDynamicMonitor,
  BilibiliFollowedGroupMonitor,
  BiliFollowedUp,
  BiliOriginalFollowedGroup,
  BilibiliSmartGroupOption,
  BilibiliSmartGroupProfile,
  BilibiliSmartGroupTask,
  bilibiliCancelTaskSilently,
  bilibiliFetchFollowed,
  bilibiliFetchFollowedUps,
  bilibiliGetConfig,
  bilibiliGetCookieFromBrowser,
  bilibiliGetFollowedCrawlTask,
  bilibiliDebugTest,
  DebugTestResult,
  CrawlToVaultResponse,
  bilibiliSaveSelectedDynamics,
  bilibiliStartFollowedCrawl,
  bilibiliStartFollowedUpsCrawl,
  bilibiliGetFollowedUpsCrawlTask,
  FollowedDynamicsCrawlTask,
  FollowedUpsCrawlTask,
  bilibiliStartSmartGroupTask,
  bilibiliGetSmartGroupTask,
} from "../../api/bilibili";

const DYNAMIC_TYPE_MAP: Record<string, { label: string; icon: typeof Play; color: string }> = {
  video: { label: "视频", icon: Play, color: "#00AEEC" },
  image: { label: "图文", icon: ImageIcon, color: "#FB7299" },
  text: { label: "文字", icon: MessageSquare, color: "#FF7F50" },
  article: { label: "专栏", icon: FileText, color: "#52C41A" },
};

const PRESET_KEYWORDS = [
  "生活",
  "教程",
  "评测",
  "Vlog",
  "游戏",
];

const TIME_RANGE_OPTIONS = [
  { value: 1, label: "1天" },
  { value: 3, label: "3天" },
  { value: 7, label: "7天" },
  { value: 14, label: "14天" },
  { value: 30, label: "30天" },
];

const LIMIT_OPTIONS = [10, 20, 50];

type BilibiliPanelTab = "dynamics" | "favorites" | "following";
type TrackerFilterMode = "and" | "smart_only";
type ManualGroupingScope = "all" | "filtered" | "managed";
type DynamicFetchScope = "global" | "group" | "ups";
type PaginatedPageSize = 20 | 50;

interface DynamicFetchMeta {
  scope: DynamicFetchScope;
  label: string;
  authorCount?: number;
  fetchStats?: BiliDynamicFetchStats;
  daysBack?: number;
  keepLimit?: number;
}

const DEFAULT_SMART_GROUP_OPTIONS: BilibiliSmartGroupOption[] = [
  { value: "ai-tech", label: "AI科技" },
  { value: "study", label: "学习知识" },
  { value: "digital", label: "数码影音" },
  { value: "game", label: "游戏" },
  { value: "finance", label: "财经商业" },
  { value: "creative", label: "设计创作" },
  { value: "entertainment", label: "生活娱乐" },
  { value: "other", label: "其他" },
];

const DEFAULT_SMART_GROUP_META: Record<string, { label: string; accent: string; bg: string }> = {
  "ai-tech": { label: "AI科技", accent: "#0EA5E9", bg: "rgba(14, 165, 233, 0.14)" },
  study: { label: "学习知识", accent: "#10B981", bg: "rgba(16, 185, 129, 0.14)" },
  digital: { label: "数码影音", accent: "#F59E0B", bg: "rgba(245, 158, 11, 0.14)" },
  game: { label: "游戏", accent: "#EF4444", bg: "rgba(239, 68, 68, 0.14)" },
  finance: { label: "财经商业", accent: "#8B5CF6", bg: "rgba(139, 92, 246, 0.14)" },
  creative: { label: "设计创作", accent: "#EC4899", bg: "rgba(236, 72, 153, 0.14)" },
  entertainment: { label: "生活娱乐", accent: "#F97316", bg: "rgba(249, 115, 22, 0.14)" },
  other: { label: "其他", accent: "#64748B", bg: "rgba(100, 116, 139, 0.14)" },
};

const FOLLOWED_DYNAMICS_TASK_KEY = "bilibili_followed_dynamics_task_id";
const FOLLOWED_UPS_TASK_KEY = "bilibili_followed_ups_task_id";
const SMART_GROUP_TASK_KEY = "bilibili_followed_smart_group_task_id";
const BILIBILI_DYNAMICS_CACHE_KEY = "bilibili_dynamics_cache";
const BILIBILI_FOLLOWED_CACHE_KEY = "bilibili_followed_cache";
const DEFAULT_DYNAMIC_FETCH_META: DynamicFetchMeta = { scope: "global", label: "全关注流" };
const MAX_DYNAMIC_KEEP_LIMIT = 200;
const PAGINATION_SIZE_OPTIONS = [20, 50];
const FIXED_UP_IMPORT_GROUPS_PAGE_SIZE = 10;
const TARGETED_DYNAMIC_GROUPS_PAGE_SIZE = 10;
const TARGETED_DYNAMIC_RESULTS_PAGE_SIZE = 12;
const DYNAMIC_RESULTS_PAGE_SIZE = 10;
const TASK_POLL_INTERVAL_MS = 900;
const TASK_POLL_RETRY_DELAY_MS = 1500;
const TASK_POLL_MAX_CONSECUTIVE_ERRORS = 12;
const TASK_POLL_NOT_FOUND_RETRY_LIMIT = 5;

function readJsonCache<T>(key: string, fallback: T): T {
  return readJsonStorage(key, fallback);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err || "未知错误");
}

function createTerminalTaskError(message: string): Error & { taskTerminal: true } {
  return Object.assign(new Error(message), { taskTerminal: true as const });
}

function isTerminalTaskError(err: unknown): err is Error & { taskTerminal: true } {
  return Boolean(err && typeof err === "object" && "taskTerminal" in err);
}

function cancelStoredTask(taskStorageKey: string): void {
  const taskId = readStringStorage(taskStorageKey, "");
  if (!taskId) {
    return;
  }
  removeStorageKey(taskStorageKey);
  bilibiliCancelTaskSilently(taskId);
}

function resolveDynamicSourceUrl(dynamic: BiliDynamic): string {
  const rawUrl = String(dynamic.url || "").trim();
  if (rawUrl) {
    if (/^https?:\/\//i.test(rawUrl)) {
      return rawUrl;
    }
    if (rawUrl.startsWith("//")) {
      return `https:${rawUrl}`;
    }
    if (rawUrl.startsWith("/")) {
      return `https://www.bilibili.com${rawUrl}`;
    }
  }

  if (dynamic.bvid) {
    return `https://www.bilibili.com/video/${dynamic.bvid}`;
  }
  if (dynamic.dynamic_type === "article") {
    return dynamic.dynamic_id ? `https://www.bilibili.com/opus/${dynamic.dynamic_id}` : "";
  }
  if (dynamic.dynamic_id) {
    return dynamic.dynamic_type === "image" || dynamic.dynamic_type === "text"
      ? `https://t.bilibili.com/${dynamic.dynamic_id}`
      : `https://www.bilibili.com/opus/${dynamic.dynamic_id}`;
  }
  return "";
}

function isNotFoundError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err || "");
  return /not found|404/i.test(message);
}

function classifyFollowedUp(up: BiliFollowedUp): string {
  const haystack = `${up.uname} ${up.sign} ${up.official_desc}`.toLowerCase();

  const matchers: Array<[string, string[]]> = [
    ["ai-tech", ["ai", "人工智能", "大模型", "算法", "程序", "编程", "开发", "科技", "机器人", "芯片", "科普", "computer", "code"]],
    ["study", ["教程", "学习", "知识", "考研", "读书", "数学", "英语", "教育", "课堂", "论文", "学术", "老师"]],
    ["digital", ["数码", "手机", "相机", "耳机", "电脑", "测评", "评测", "影音", "摄影", "设备", "镜头"]],
    ["game", ["游戏", "电竞", "主机", "steam", "switch", "moba", "fps", "实况", "攻略"]],
    ["finance", ["财经", "商业", "投资", "股票", "基金", "创业", "营销", "副业", "理财", "经济"]],
    ["creative", ["设计", "插画", "绘画", "ui", "产品", "建筑", "摄影后期", "创作", "剪辑", "3d", "建模"]],
    ["entertainment", ["vlog", "生活", "旅行", "美食", "音乐", "舞蹈", "综艺", "动画", "影视", "电影", "追番", "二次元", "搞笑"]],
  ];

  for (const [group, keywords] of matchers) {
    if (keywords.some((keyword) => haystack.includes(keyword))) {
      return group;
    }
  }

  return "other";
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function resolveSmartGroupMeta(
  groupValue: string,
  label: string,
): { label: string; accent: string; bg: string } {
  const defaultMeta = DEFAULT_SMART_GROUP_META[groupValue];
  if (defaultMeta) {
    return defaultMeta;
  }
  const palette = [
    { accent: "#059669", bg: "rgba(5, 150, 105, 0.14)" },
    { accent: "#0EA5E9", bg: "rgba(14, 165, 233, 0.14)" },
    { accent: "#E11D48", bg: "rgba(225, 29, 72, 0.14)" },
    { accent: "#7C3AED", bg: "rgba(124, 58, 237, 0.14)" },
    { accent: "#EA580C", bg: "rgba(234, 88, 12, 0.14)" },
    { accent: "#0891B2", bg: "rgba(8, 145, 178, 0.14)" },
  ];
  return { label, ...palette[hashString(`${groupValue}-${label}`) % palette.length] };
}

function matchesUpQuery(up: BiliFollowedUp, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [up.uname, up.sign, up.official_desc].some((value) => value?.toLowerCase().includes(q));
}

function parseStringListInput(value: string): string[] {
  const rawItems = String(value || "").split(/[,\n，]+/);
  const normalized: string[] = [];
  const seen = new Set<string>();
  rawItems.forEach((item) => {
    const text = String(item || "").trim();
    if (!text) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    normalized.push(text);
  });
  return normalized;
}

function clampPositiveInt(value: unknown, fallback: number, max?: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.max(1, Math.round(parsed));
  return max ? Math.min(normalized, max) : normalized;
}

const LEGACY_MONITOR_PAGE_LIMIT = 5;

function normalizeMonitorPageLimit(value: unknown, fallback: number): number {
  const normalized = clampPositiveInt(value, fallback, 1000);
  if (normalized === LEGACY_MONITOR_PAGE_LIMIT) {
    return fallback;
  }
  return normalized;
}

function getDailyMonitorDefaults(config?: Partial<BilibiliTrackerConfig>) {
  return {
    daysBack: clampPositiveInt((config as { days_back?: number } | undefined)?.days_back, 7, 365),
    limit: clampPositiveInt((config as { fetch_follow_limit?: number } | undefined)?.fetch_follow_limit, 50, MAX_DYNAMIC_KEEP_LIMIT),
    pageLimit: normalizeMonitorPageLimit((config as { page_limit?: number } | undefined)?.page_limit, 1000),
  };
}

function createLocalMonitorId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

function normalizeDailyDynamicMonitor(
  seed: Partial<BilibiliDailyDynamicMonitor> = {},
  defaults: { daysBack?: number; limit?: number; pageLimit?: number } = {},
): BilibiliDailyDynamicMonitor {
  const keywords = Array.isArray(seed.keywords) ? parseStringListInput(seed.keywords.join(", ")) : [];
  const tagFilters = Array.isArray(seed.tag_filters) ? parseStringListInput(seed.tag_filters.join(", ")) : [];
  const label = String(seed.label || keywords[0] || tagFilters[0] || "每日动态监控").trim() || "每日动态监控";
  return {
    id: String(seed.id || createLocalMonitorId("bili-dm")),
    label,
    keywords,
    tag_filters: tagFilters,
    enabled: seed.enabled ?? true,
    days_back: clampPositiveInt(seed.days_back, defaults.daysBack ?? 7, 365),
    limit: clampPositiveInt(
      seed.limit ?? (seed as { fetch_limit?: number }).fetch_limit,
      defaults.limit ?? 50,
      MAX_DYNAMIC_KEEP_LIMIT,
    ),
    page_limit: normalizeMonitorPageLimit(
      seed.page_limit ?? (seed as { pages?: number; max_pages?: number }).pages ?? (seed as { max_pages?: number }).max_pages,
      defaults.pageLimit ?? 1000,
    ),
  };
}

function resolveSharedSignalEntryLabels(entry: SharedSignalEntry): string[] {
  const rawLabels = entry.group_labels && entry.group_labels.length > 0
    ? entry.group_labels
    : [entry.group_label];
  return Array.from(
    new Set(
      rawLabels
        .map((label) => String(label || "").trim())
        .filter(Boolean)
    )
  );
}

function buildDailyMonitorSubfolder(label: string): string {
  return `每日关键词监控/${normalizeSubfolderSegment(label, "未命名监控")}`;
}

function normalizeSubfolderSegment(value: string, fallback: string): string {
  const normalized = String(value || "")
    .replace(/[\\/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || fallback;
}

function uniqueSubfolderSegments(values: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  values.forEach((value) => {
    const normalized = normalizeSubfolderSegment(value, "");
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(normalized);
  });
  return result;
}

function buildKeywordContextSubfolders(keywords: string[] = [], tagFilters: string[] = []): string[] {
  const normalizedKeywords = uniqueSubfolderSegments(keywords);
  const normalizedTags = uniqueSubfolderSegments(tagFilters);
  const parts: string[] = [];
  if (normalizedKeywords.length > 0) {
    parts.push(`关键词/${normalizedKeywords.join("，")}`);
  }
  if (normalizedTags.length > 0) {
    parts.push(`标签/${normalizedTags.join("，")}`);
  }
  if (parts.length === 0) {
    parts.push("全部条件");
  }
  return parts;
}

function buildGlobalSearchSubfolder(keywords: string[] = [], tagFilters: string[] = []): string {
  return ["全关注流搜索", ...buildKeywordContextSubfolders(keywords, tagFilters)].join("/");
}

function buildDailyMonitorSaveSubfolder(
  label: string,
  keywords: string[] = [],
  tagFilters: string[] = [],
): string {
  return [
    "每日关键词监控",
    normalizeSubfolderSegment(label, "未命名监控"),
    ...buildKeywordContextSubfolders(keywords, tagFilters),
  ].join("/");
}

function buildTrackedUpsSubfolder(label: string): string {
  return ["每日监视UP", normalizeSubfolderSegment(label, "未命名范围")].join("/");
}

function buildTargetedGroupSubfolder(label: string): string {
  return ["定向动态爬取", "智能分组", normalizeSubfolderSegment(label, "未命名分组")].join("/");
}

function buildSelectedUpsSubfolder(label: string): string {
  return ["定向动态爬取", "指定UP", normalizeSubfolderSegment(label, "未命名UP")].join("/");
}

function getDailyMonitorTerms(monitor: Partial<BilibiliDailyDynamicMonitor>): string[] {
  return parseStringListInput([
    ...(Array.isArray(monitor.keywords) ? monitor.keywords : []),
    ...(Array.isArray(monitor.tag_filters) ? monitor.tag_filters : []),
  ].join(", "));
}

function normalizeFollowedGroupMonitor(
  seed: Partial<BilibiliFollowedGroupMonitor> = {},
  labelLookup: Record<string, string> = {},
  defaults: { daysBack?: number; limit?: number; pageLimit?: number } = {},
): BilibiliFollowedGroupMonitor {
  const groupValue = String(
    seed.group_value
    || (seed as { value?: string }).value
    || (seed as { group?: string }).group
    || ""
  ).trim();
  const label = String(seed.label || labelLookup[groupValue] || groupValue || "未命名分组").trim() || "未命名分组";
  return {
    id: String(seed.id || createLocalMonitorId("bili-gm")),
    group_value: groupValue,
    label,
    enabled: seed.enabled ?? true,
    days_back: clampPositiveInt(seed.days_back, defaults.daysBack ?? 7, 365),
    limit: clampPositiveInt(
      seed.limit ?? (seed as { fetch_limit?: number }).fetch_limit,
      defaults.limit ?? 50,
      MAX_DYNAMIC_KEEP_LIMIT,
    ),
    page_limit: normalizeMonitorPageLimit(
      seed.page_limit ?? (seed as { pages?: number; max_pages?: number }).pages ?? (seed as { max_pages?: number }).max_pages,
      defaults.pageLimit ?? 1000,
    ),
  };
}

interface VaultSignalStat {
  signal: string;
  count?: number;
  platforms?: string[];
  sample_titles?: string[];
  sample_authors?: string[];
}

interface BilibiliTrackerConfig {
  up_uids: string[];
  favorite_up_uids: string[];
  favorite_up_excluded_uids: string[];
  daily_dynamic_monitors: BilibiliDailyDynamicMonitor[];
  followed_up_group_monitors: BilibiliFollowedGroupMonitor[];
  followed_up_groups: string[];
  followed_up_original_groups: number[];
  followed_up_filter_mode: TrackerFilterMode;
  followed_up_group_options: BilibiliSmartGroupOption[];
  creator_profiles: Record<string, BilibiliSmartGroupProfile>;
  favorite_up_profiles: Record<string, BilibiliSmartGroupProfile>;
  shared_signal_entries: SharedSignalEntry[];
  shared_creator_grouping: {
    updated_at?: string;
    signal_group_labels?: Record<string, string | string[]>;
    vault_signal_database?: {
      indexed_files?: number;
      signal_count?: number;
      signals?: VaultSignalStat[];
      database_path?: string;
      tag_index_path?: string;
      saved_at?: string;
    };
    shared_data_paths?: {
      tag_index_path?: string;
      shared_groups_path?: string;
      creator_profiles_path?: string;
    };
  };
}

interface ExpandableSectionProps {
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  badge?: string;
  accent?: string;
  icon?: ReactNode;
  children: ReactNode;
}

function ExpandableSection({
  title,
  summary,
  open,
  onToggle,
  badge,
  accent = "var(--color-primary)",
  icon,
  children,
}: ExpandableSectionProps) {
  return (
    <div
      style={{
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--border-light)",
        background: "var(--bg-card)",
        overflow: "hidden",
        boxShadow: "var(--shadow-soft)",
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        style={{
          width: "100%",
          padding: "16px 18px",
          border: "none",
          background: "transparent",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) auto",
          gap: "14px",
          alignItems: "center",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", minWidth: 0 }}>
          {icon && (
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "12px",
                background: "var(--bg-hover)",
                color: accent,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {icon}
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "0.9375rem", fontWeight: 800, color: "var(--text-main)" }}>
              {title}
            </div>
            <div style={{ marginTop: "4px", fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
              {summary}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
          {badge && (
            <span
              style={{
                padding: "5px 10px",
                borderRadius: "999px",
                background: "var(--bg-hover)",
                color: "var(--text-secondary)",
                fontSize: "0.75rem",
                fontWeight: 700,
                whiteSpace: "nowrap",
              }}
            >
              {badge}
            </span>
          )}
          <span
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "999px",
              border: "1px solid var(--border-light)",
              background: "var(--bg-hover)",
              color: "var(--text-muted)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transform: open ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          >
            <ChevronDown size={15} />
          </span>
        </div>
      </button>

      <div
        style={{
          display: "grid",
          gridTemplateRows: open ? "1fr" : "0fr",
          transition: "grid-template-rows 240ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <div style={{ overflow: "hidden", minHeight: 0 }}>
          <div
            style={{
              padding: "18px",
              borderTop: "1px solid var(--border-light)",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export function BilibiliTool() {
  const toast = useToast();
  const config = useStore((state) => state.config);
  const [panelTab, setPanelTab] = useState<BilibiliPanelTab>(() => {
    const saved = readStringStorage("bilibili_tool_panel", "");
    if (saved === "favorites" || saved === "following") return saved;
    return "dynamics";
  });

  // Cookie configuration state
  const [cookieConfigured, setCookieConfigured] = useState(false);
  const [cookiePreview, setCookiePreview] = useState<string | null>(null);
  const [cookieInput, setCookieInput] = useState("");
  const [gettingFromBrowser, setGettingFromBrowser] = useState(false);
  const [showFullCookie, setShowFullCookie] = useState(false);
  const [showCookieModal, setShowCookieModal] = useState(false);

  // SESSDATA state (extracted from cookie)
  const [sessdata, setSessdata] = useState(() => readStringStorage("bilibili_sessdata", ""));

  // Filter state
  const [keywords, setKeywords] = useState<string[]>(() => {
    const storedKeywords = readJsonStorage("bilibili_keywords", [] as string[]);
    const storedTagFilters = readJsonStorage("bilibili_tag_filters", [] as string[]);
    return parseStringListInput([...storedKeywords, ...storedTagFilters].join(", "));
  });
  const [keywordInput, setKeywordInput] = useState("");
  const [tagFilters, setTagFilters] = useState<string[]>(() => {
    const storedKeywords = readJsonStorage("bilibili_keywords", [] as string[]);
    const storedTagFilters = readJsonStorage("bilibili_tag_filters", [] as string[]);
    return parseStringListInput([...storedKeywords, ...storedTagFilters].join(", "));
  });
  const [dailyMonitorTermInput, setDailyMonitorTermInput] = useState("");
  const [dailyMonitorDaysBackInput, setDailyMonitorDaysBackInput] = useState("7");
  const [selectedTypes, setSelectedTypes] = useState<string[]>(["video", "image", "text", "article"]);
  const [daysBack, setDaysBack] = useState(7);
  const [daysBackInput, setDaysBackInput] = useState("7");
  const [limit, setLimit] = useState(50);
  const [limitInput, setLimitInput] = useState("50");
  const [targetedGroupDaysBack, setTargetedGroupDaysBack] = useState(7);
  const [targetedGroupDaysBackInput, setTargetedGroupDaysBackInput] = useState("7");
  const [targetedGroupLimit, setTargetedGroupLimit] = useState(50);
  const [targetedGroupLimitInput, setTargetedGroupLimitInput] = useState("50");

  // Results state
  const [dynamics, setDynamics] = useState<BiliDynamic[]>(() => readJsonCache(BILIBILI_DYNAMICS_CACHE_KEY, []));
  const [loading, setLoading] = useState(false);
  const [followedDynamicsTask, setFollowedDynamicsTask] = useState<FollowedDynamicsCrawlTask | null>(null);
  const [totalFound, setTotalFound] = useState(() => readJsonCache<number>("bilibili_dynamics_total", 0));
  const [hasFetchedDynamics, setHasFetchedDynamics] = useState(() => readJsonCache<boolean>("bilibili_dynamics_has_fetched", false));
  const [dynamicFetchMeta, setDynamicFetchMeta] = useState<DynamicFetchMeta>(() => (
    readJsonCache<DynamicFetchMeta>("bilibili_dynamics_fetch_meta", DEFAULT_DYNAMIC_FETCH_META)
  ));
  const [selectedDynamicIds, setSelectedDynamicIds] = useState<Set<string>>(new Set());
  const [showDynamicResultList, setShowDynamicResultList] = useState(true);
  const [showSuggestedSmartGroupTags, setShowSuggestedSmartGroupTags] = useState(false);
  const [expandedSuggestedSmartGroupTagGroups, setExpandedSuggestedSmartGroupTagGroups] = useState<Set<string>>(new Set());
  const [dynamicResultsPage, setDynamicResultsPage] = useState(1);
  const [followedUps, setFollowedUps] = useState<BiliFollowedUp[]>(() => readJsonCache(BILIBILI_FOLLOWED_CACHE_KEY, []));
  const [originalGroups, setOriginalGroups] = useState<BiliOriginalFollowedGroup[]>(() => readJsonCache("bilibili_followed_groups_cache", []));
  const [followedUpsLoading, setFollowedUpsLoading] = useState(false);
  const [followedUpsLoaded, setFollowedUpsLoaded] = useState(() => readJsonCache<boolean>("bilibili_followed_loaded", false));
  const [followedUpsTask, setFollowedUpsTask] = useState<FollowedUpsCrawlTask | null>(null);
  const [smartGroupTask, setSmartGroupTask] = useState<BilibiliSmartGroupTask | null>(null);
  const [smartGroupRunning, setSmartGroupRunning] = useState(false);
  const [savingSignalMappings, setSavingSignalMappings] = useState(false);
  const [followedUpSearch, setFollowedUpSearch] = useState("");
  const [selectedOriginalGroup, setSelectedOriginalGroup] = useState<number | "all">("all");
  const [selectedFollowedGroup, setSelectedFollowedGroup] = useState<string>("all");
  const [showOriginalGroupFilter, setShowOriginalGroupFilter] = useState(false);
  const [showSmartGroupFilter, setShowSmartGroupFilter] = useState(false);
  const [showFeedBreakdown, setShowFeedBreakdown] = useState(true);
  const [showFollowedCatalog, setShowFollowedCatalog] = useState(false);
  const [showFollowedResultCards, setShowFollowedResultCards] = useState(true);
  const [showFixedUpMonitorSavedList, setShowFixedUpMonitorSavedList] = useState(true);
  const [showFixedUpMonitorImportPanel, setShowFixedUpMonitorImportPanel] = useState(false);
  const [showSmartGroupSourceDetail, setShowSmartGroupSourceDetail] = useState(false);
  const [showFixedUpTrackingDetail, setShowFixedUpTrackingDetail] = useState(false);
  const [showSmartGroupManagementDetail, setShowSmartGroupManagementDetail] = useState(false);
  const [expandedFixedUpImportGroup, setExpandedFixedUpImportGroup] = useState("");
  const [fixedUpImportSearch, setFixedUpImportSearch] = useState("");
  const [fixedUpImportGroupPage, setFixedUpImportGroupPage] = useState(1);
  const [showManualGroupingUpList, setShowManualGroupingUpList] = useState(true);
  const [targetedDynamicGroup, setTargetedDynamicGroup] = useState("all");
  const [targetedDynamicGroupPage, setTargetedDynamicGroupPage] = useState(1);
  const [targetedDynamicUpSearch, setTargetedDynamicUpSearch] = useState("");
  const [targetedDynamicUpIds, setTargetedDynamicUpIds] = useState<Set<string>>(new Set());
  const [targetedDynamicPage, setTargetedDynamicPage] = useState(1);
  const [showTargetedDynamicQuickSection, setShowTargetedDynamicQuickSection] = useState(false);
  const [showTargetedDynamicGroupSection, setShowTargetedDynamicGroupSection] = useState(true);
  const [fixedUpSavedPage, setFixedUpSavedPage] = useState(1);
  const [fixedUpSavedPageSize, setFixedUpSavedPageSize] = useState<PaginatedPageSize>(20);
  const [fixedUpImportPage, setFixedUpImportPage] = useState(1);
  const [fixedUpImportPageSize, setFixedUpImportPageSize] = useState<PaginatedPageSize>(20);
  const [managedSmartGroup, setManagedSmartGroup] = useState<string>(
    DEFAULT_SMART_GROUP_OPTIONS[0]?.value || "other"
  );
  const [manualGroupingScope, setManualGroupingScope] = useState<ManualGroupingScope>("all");
  const [manualGroupingSearch, setManualGroupingSearch] = useState("");
  const [manualGroupingPage, setManualGroupingPage] = useState(1);
  const [manualGroupingPageSize, setManualGroupingPageSize] = useState<PaginatedPageSize>(20);
  const [editingGroupedUpId, setEditingGroupedUpId] = useState("");
  const [editingSmartGroupValues, setEditingSmartGroupValues] = useState<string[]>([]);
  const [editingManualOriginalGroupIds, setEditingManualOriginalGroupIds] = useState<number[]>([]);
  const [savingGroupingEditor, setSavingGroupingEditor] = useState(false);
  const [followedResultPage, setFollowedResultPage] = useState(1);
  const [followedResultPageSize, setFollowedResultPageSize] = useState<PaginatedPageSize>(20);
  const [trackerConfig, setTrackerConfig] = useState<BilibiliTrackerConfig>({
    up_uids: [],
    favorite_up_uids: [],
    favorite_up_excluded_uids: [],
    daily_dynamic_monitors: [],
    followed_up_group_monitors: [],
    followed_up_groups: [],
    followed_up_original_groups: [],
    followed_up_filter_mode: "and",
    followed_up_group_options: DEFAULT_SMART_GROUP_OPTIONS,
    creator_profiles: {},
    favorite_up_profiles: {},
    shared_signal_entries: [],
    shared_creator_grouping: {},
  });

  // Debug state
  const [debugResult, setDebugResult] = useState<DebugTestResult | null>(null);
  const [debugLoading, setDebugLoading] = useState(false);

  // Vault crawl state
  const [vaultCrawling, setVaultCrawling] = useState(false);
  const [vaultResult, setVaultResult] = useState<CrawlToVaultResponse | null>(null);

  // Persist keywords
  useEffect(() => {
    writeJsonStorage("bilibili_keywords", keywords);
  }, [keywords]);

  useEffect(() => {
    writeJsonStorage("bilibili_tag_filters", tagFilters);
  }, [tagFilters]);

  // Persist sessdata
  useEffect(() => {
    if (sessdata) {
      writeStringStorage("bilibili_sessdata", sessdata);
    } else {
      removeStorageKey("bilibili_sessdata");
    }
  }, [sessdata]);

  useEffect(() => {
    writeStringStorage("bilibili_tool_panel", panelTab);
  }, [panelTab]);

  useEffect(() => {
    writeJsonStorage(BILIBILI_DYNAMICS_CACHE_KEY, dynamics);
    writeJsonStorage("bilibili_dynamics_total", totalFound);
    writeJsonStorage("bilibili_dynamics_has_fetched", hasFetchedDynamics);
    writeJsonStorage("bilibili_dynamics_fetch_meta", dynamicFetchMeta);
  }, [dynamics, totalFound, hasFetchedDynamics, dynamicFetchMeta]);

  useEffect(() => {
    writeJsonStorage(BILIBILI_FOLLOWED_CACHE_KEY, followedUps);
    writeJsonStorage("bilibili_followed_groups_cache", originalGroups);
    writeJsonStorage("bilibili_followed_loaded", followedUpsLoaded);
  }, [followedUps, originalGroups, followedUpsLoaded]);

  useEffect(() => {
    const taskId = readStringStorage(FOLLOWED_DYNAMICS_TASK_KEY, "");
    if (!taskId) {
      return;
    }
    void resumeFollowedDynamicsTask({
      taskId,
      scope: dynamicFetchMeta.scope,
      label: dynamicFetchMeta.label || "全关注流",
      authorCount: dynamicFetchMeta.authorCount,
      daysBackValue: dynamicFetchMeta.daysBack ?? daysBack,
      keepLimit: dynamicFetchMeta.keepLimit ?? limit,
      switchToResult: true,
      silent: true,
    });
  }, []);

  useEffect(() => {
    const taskId = readStringStorage(FOLLOWED_UPS_TASK_KEY, "");
    if (!taskId) {
      return;
    }
    void resumeFollowedUpsTask(taskId, true);
  }, []);

  useEffect(() => {
    const taskId = readStringStorage(SMART_GROUP_TASK_KEY, "");
    if (!taskId) {
      return;
    }
    void resumeSmartGroupTask(taskId, true);
  }, []);

  useEffect(() => {
    const handlePageHide = () => {
      cancelStoredTask(FOLLOWED_DYNAMICS_TASK_KEY);
      cancelStoredTask(FOLLOWED_UPS_TASK_KEY);
      cancelStoredTask(SMART_GROUP_TASK_KEY);
    };
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, []);

  useEffect(() => {
    setDaysBackInput(String(daysBack));
  }, [daysBack]);

  useEffect(() => {
    setLimitInput(String(limit));
  }, [limit]);

  useEffect(() => {
    setTargetedGroupDaysBackInput(String(targetedGroupDaysBack));
  }, [targetedGroupDaysBack]);

  useEffect(() => {
    setTargetedGroupLimitInput(String(targetedGroupLimit));
  }, [targetedGroupLimit]);

  useEffect(() => {
    if (selectedOriginalGroup !== "all" && !originalGroups.some((group) => group.tag_id === selectedOriginalGroup)) {
      setSelectedOriginalGroup("all");
    }
  }, [originalGroups, selectedOriginalGroup]);

  // Load config on mount
  useEffect(() => {
    loadConfig();
    void refreshTrackerConfig();
  }, []);

  async function loadConfig() {
    try {
      const config = await bilibiliGetConfig();
      setCookieConfigured(config.cookie_configured);
      setCookiePreview(config.cookie_preview);

      // If we have a configured cookie, try to extract SESSDATA
      if (config.cookie_configured && config.cookie_preview) {
        const extractedSessdata = extractSessdataFromCookie(config.cookie_preview.replace("...", ""));
        if (extractedSessdata && !sessdata) {
          setSessdata(extractedSessdata);
        }
      } else if (!sessdata) {
        setShowCookieModal(true);
      }
    } catch (err) {
      console.error("Failed to load config:", err);
    }
  }

  async function refreshTrackerConfig() {
    try {
      const config = await api.get<any>("/api/modules/bilibili-tracker/config");
      const monitorDefaults = getDailyMonitorDefaults(config);
      const groupLabelLookup = Object.fromEntries(
        ((config.followed_up_group_options || DEFAULT_SMART_GROUP_OPTIONS) as BilibiliSmartGroupOption[])
          .map((option) => [option.value, option.label])
      );
      setTrackerConfig({
        up_uids: config.up_uids || [],
        favorite_up_uids: config.favorite_up_uids || [],
        favorite_up_excluded_uids: config.favorite_up_excluded_uids || [],
        daily_dynamic_monitors: (config.daily_dynamic_monitors || []).map((item: Partial<BilibiliDailyDynamicMonitor>) => normalizeDailyDynamicMonitor(item, monitorDefaults)),
        followed_up_group_monitors: (config.followed_up_group_monitors || []).map((item: Partial<BilibiliFollowedGroupMonitor>) => normalizeFollowedGroupMonitor(
          item,
          groupLabelLookup,
          monitorDefaults,
        )),
        followed_up_groups: config.followed_up_groups || [],
        followed_up_original_groups: config.followed_up_original_groups || [],
        followed_up_filter_mode: config.followed_up_filter_mode === "smart_only" ? "smart_only" : "and",
        followed_up_group_options: (config.followed_up_group_options || DEFAULT_SMART_GROUP_OPTIONS).length > 0
          ? (config.followed_up_group_options || DEFAULT_SMART_GROUP_OPTIONS)
          : DEFAULT_SMART_GROUP_OPTIONS,
        creator_profiles: config.creator_profiles || {},
        favorite_up_profiles: config.favorite_up_profiles || {},
        shared_signal_entries: config.shared_signal_entries || [],
        shared_creator_grouping: config.shared_creator_grouping || {},
      });
    } catch (err) {
      console.error("Failed to load bilibili tracker config:", err);
    }
  }

  function extractSessdataFromCookie(cookieStr: string): string | null {
    try {
      // Try JSON format
      if (cookieStr.startsWith("[") || cookieStr.startsWith("{")) {
        const parsed = JSON.parse(cookieStr);
        if (Array.isArray(parsed)) {
          const sessdataCookie = parsed.find((c: any) => c.name === "SESSDATA");
          if (sessdataCookie) return sessdataCookie.value;
        }
      }

      // Try "SESSDATA=value" format
      const match = cookieStr.match(/SESSDATA=([^;\s]+)/);
      if (match) return match[1];

      // Try direct value (just the SESSDATA string)
      if (cookieStr.length > 20 && !cookieStr.includes("=") && !cookieStr.includes("{")) {
        return cookieStr.trim();
      }
    } catch (e) {
      console.error("Failed to parse cookie:", e);
    }
    return null;
  }

  async function handleGetFromBrowser() {
    setGettingFromBrowser(true);
    try {
      const res = await bilibiliGetCookieFromBrowser();
      if (res.success && (res.cookie || res.cookie_preview)) {
        const fullCookie = res.cookie || "";
        if (fullCookie) {
          setCookieInput(fullCookie);
        }
        setCookieConfigured(true);
        setCookiePreview(res.cookie_preview || null);

        // Extract and set SESSDATA
        const extractedSessdata = extractSessdataFromCookie(fullCookie || res.cookie_preview?.replace("...", "") || "");
        if (extractedSessdata) {
          setSessdata(extractedSessdata);
          writeStringStorage("bilibili_sessdata", extractedSessdata);
        }

        setShowCookieModal(false);
        toast.success("浏览器 Cookie 已连接", res.message || `获取到 ${res.cookie_count} 个 Cookie`);
      } else {
        toast.error("获取失败", res.error || "未找到 Cookie");
      }
    } catch (err) {
      toast.error("获取失败", err instanceof Error ? err.message : "未知错误");
    } finally {
      setGettingFromBrowser(false);
    }
  }

  async function ensureSessdataFromEdge(): Promise<string> {
    if (sessdata.trim()) return sessdata.trim();

    const res = await bilibiliGetCookieFromBrowser();
    const fullCookie = res.cookie || "";
    const extracted = extractSessdataFromCookie(fullCookie);
    if (!res.success || !extracted) {
      throw new Error(res.error || "未能从浏览器获取 SESSDATA，请确认 Chrome 或 Edge 已登录 B 站");
    }

    setCookieInput(fullCookie);
    setCookieConfigured(true);
    setCookiePreview(res.cookie_preview || null);
    setSessdata(extracted);
    writeStringStorage("bilibili_sessdata", extracted);
    return extracted;
  }

  const dynamicSearchTerms = parseStringListInput([...keywords, ...tagFilters].join(", "));

  const handleAddKeyword = () => {
    const nextTerms = parseStringListInput(keywordInput);
    if (nextTerms.length === 0) return;
    const mergedTerms = parseStringListInput([...dynamicSearchTerms, ...nextTerms].join(", "));
    if (mergedTerms.length === dynamicSearchTerms.length) {
      toast.info("这个词已经存在");
      return;
    }
    setKeywords(mergedTerms);
    setTagFilters(mergedTerms);
    setKeywordInput("");
  };

  const handleRemoveKeyword = (kw: string) => {
    const nextTerms = dynamicSearchTerms.filter((item) => item !== kw);
    setKeywords(nextTerms);
    setTagFilters(nextTerms);
  };

  const handleAddPresetKeyword = (kw: string) => {
    if (dynamicSearchTerms.includes(kw)) {
      toast.info(`"${kw}" 已添加`);
      return;
    }
    const nextTerms = [...dynamicSearchTerms, kw];
    setKeywords(nextTerms);
    setTagFilters(nextTerms);
  };

  const handleAddSuggestedTagFilter = (tag: string) => {
    if (dynamicSearchTerms.some((item) => item.toLowerCase() === tag.toLowerCase())) {
      toast.info(`"${tag}" 已添加`);
      return;
    }
    const nextTerms = parseStringListInput([...dynamicSearchTerms, tag].join(", "));
    setKeywords(nextTerms);
    setTagFilters(nextTerms);
  };

  const updateDailyDynamicMonitors = async (
    nextMonitors: BilibiliDailyDynamicMonitor[],
    successTitle: string,
  ) => {
    await saveTrackerConfig(
      {
        daily_dynamic_monitors: nextMonitors.map((monitor) => normalizeDailyDynamicMonitor(monitor)),
      },
      successTitle,
    );
  };

  const handleAddDailyDynamicMonitor = async () => {
    const terms = parseStringListInput(dailyMonitorTermInput);
    const label = terms.join(" + ").trim();
    if (!label || terms.length === 0) {
      toast.error("先输入一个监控词。这个输入框同时兼容关键词和标签");
      return;
    }
    if (trackerConfig.daily_dynamic_monitors.some((monitor) => monitor.label.trim().toLowerCase() === label.toLowerCase())) {
      toast.error("已经有同名的日抓监控了，换个名字再建");
      return;
    }
    const nextMonitor = normalizeDailyDynamicMonitor({
      label,
      keywords: [],
      tag_filters: terms,
      enabled: true,
      days_back: clampPositiveInt(dailyMonitorDaysBackInput, 7, 365),
    });
    const nextMonitors = [
      ...trackerConfig.daily_dynamic_monitors.filter((monitor) => monitor.id !== nextMonitor.id),
      nextMonitor,
    ];
    await updateDailyDynamicMonitors(nextMonitors, "已添加每日动态监控");
    setDailyMonitorTermInput("");
    setDailyMonitorDaysBackInput("7");
  };

  const handleToggleDailyDynamicMonitor = async (monitorId: string) => {
    const nextMonitors = trackerConfig.daily_dynamic_monitors.map((monitor) => (
      monitor.id === monitorId ? { ...monitor, enabled: !monitor.enabled } : monitor
    ));
    await updateDailyDynamicMonitors(nextMonitors, "已更新监控开关");
  };

  const handleRemoveDailyDynamicMonitor = async (monitorId: string) => {
    const nextMonitors = trackerConfig.daily_dynamic_monitors.filter((monitor) => monitor.id !== monitorId);
    await updateDailyDynamicMonitors(nextMonitors, "已移除每日动态监控");
  };

  const handleRemoveMonitorTerm = async (monitorId: string, term: string) => {
    const nextMonitors = trackerConfig.daily_dynamic_monitors.map((monitor) => (
      monitor.id === monitorId
        ? normalizeDailyDynamicMonitor({
            ...monitor,
            keywords: monitor.keywords.filter((item) => item !== term),
            tag_filters: monitor.tag_filters.filter((item) => item !== term),
          })
        : monitor
    )).filter((monitor) => monitor.keywords.length > 0 || monitor.tag_filters.length > 0);
    await updateDailyDynamicMonitors(nextMonitors, "已更新监控词");
  };

  const handleUpdateDailyMonitorDaysBack = async (monitorId: string, value: string) => {
    const currentMonitor = trackerConfig.daily_dynamic_monitors.find((monitor) => monitor.id === monitorId);
    if (!currentMonitor) {
      return;
    }
    const nextDaysBack = clampPositiveInt(value, currentMonitor.days_back || 14, 365);
    if (nextDaysBack === currentMonitor.days_back) {
      return;
    }
    const nextMonitors = trackerConfig.daily_dynamic_monitors.map((monitor) => (
      monitor.id === monitorId
        ? normalizeDailyDynamicMonitor({
            ...monitor,
            days_back: nextDaysBack,
          })
        : monitor
    ));
    await updateDailyDynamicMonitors(nextMonitors, "已更新监控时间范围");
  };


  const toggleType = (type: string) => {
    if (selectedTypes.includes(type)) {
      setSelectedTypes(selectedTypes.filter((t) => t !== type));
    } else {
      setSelectedTypes([...selectedTypes, type]);
    }
  };

  const getDynamicTypeNumber = (type: string): number => {
    const map: Record<string, number> = {
      video: 8,
      image: 2,
      text: 4,
      article: 64,
    };
    return map[type] || 0;
  };

  const normalizePositiveInput = (
    value: string,
    fallback: number,
    commit: (next: number) => void,
    reflect: (next: string) => void,
    max?: number,
  ) => {
    const trimmed = value.trim();
    if (!trimmed) {
      commit(fallback);
      reflect(String(fallback));
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 1) {
      commit(fallback);
      reflect(String(fallback));
      return;
    }
    const normalized = max ? Math.min(Math.floor(parsed), max) : Math.floor(parsed);
    commit(normalized);
    reflect(String(normalized));
  };

  const normalizeDynamicRequestInputs = () => {
    const safeDaysBack = clampPositiveInt(daysBackInput.trim(), daysBack);
    const safeLimit = clampPositiveInt(limitInput.trim(), limit, MAX_DYNAMIC_KEEP_LIMIT);

    if (safeDaysBack !== daysBack) {
      setDaysBack(safeDaysBack);
    }
    if (String(safeDaysBack) !== daysBackInput) {
      setDaysBackInput(String(safeDaysBack));
    }
    if (safeLimit !== limit) {
      setLimit(safeLimit);
    }
    if (String(safeLimit) !== limitInput) {
      setLimitInput(String(safeLimit));
    }

    return { safeDaysBack, safeLimit };
  };

  const normalizeTargetedGroupRequestInputs = () => {
    const safeDaysBack = clampPositiveInt(targetedGroupDaysBackInput.trim(), targetedGroupDaysBack, 365);
    const safeLimit = clampPositiveInt(targetedGroupLimitInput.trim(), targetedGroupLimit, MAX_DYNAMIC_KEEP_LIMIT);

    if (safeDaysBack !== targetedGroupDaysBack) {
      setTargetedGroupDaysBack(safeDaysBack);
    }
    if (String(safeDaysBack) !== targetedGroupDaysBackInput) {
      setTargetedGroupDaysBackInput(String(safeDaysBack));
    }
    if (safeLimit !== targetedGroupLimit) {
      setTargetedGroupLimit(safeLimit);
    }
    if (String(safeLimit) !== targetedGroupLimitInput) {
      setTargetedGroupLimitInput(String(safeLimit));
    }

    return { safeDaysBack, safeLimit };
  };

  const applyDynamicsPreviewResult = ({
    res,
    scope,
    label,
    authorCount,
    daysBackValue,
    keepLimit,
    switchToResult = false,
  }: {
    res: { dynamics: BiliDynamic[]; total_found: number; fetch_stats?: BiliDynamicFetchStats };
    scope: DynamicFetchScope;
    label: string;
    authorCount?: number;
    daysBackValue: number;
    keepLimit: number;
    switchToResult?: boolean;
  }) => {
    setDynamics(res.dynamics || []);
    setSelectedDynamicIds(new Set());
    setTotalFound(res.total_found || 0);
    setHasFetchedDynamics(true);
    setShowDynamicResultList(true);
    setDynamicResultsPage(1);
    setDynamicFetchMeta({
      scope,
      label,
      authorCount,
      fetchStats: res.fetch_stats,
      daysBack: daysBackValue,
      keepLimit,
    });

    if (switchToResult) {
      switchPanel("dynamics");
    }

    if ((res.dynamics || []).length === 0) {
      toast.info(scope === "global" ? "未找到符合条件的动态" : `${label} 最近没有匹配动态`);
    } else if (scope === "global") {
      toast.success(`命中 ${res.total_found} 条动态，当前保留前 ${res.dynamics.length} 条`);
    } else {
      toast.success(`定向动态已就绪 · 命中 ${res.total_found} 条`, label);
    }
  };

  const resetDynamicsPreviewResult = ({
    scope,
    label,
    authorCount,
  }: {
    scope: DynamicFetchScope;
    label: string;
    authorCount?: number;
  }) => {
    setDynamics([]);
    setSelectedDynamicIds(new Set());
    setTotalFound(0);
    setHasFetchedDynamics(false);
    setDynamicResultsPage(1);
    setDynamicFetchMeta({
      scope,
      label,
      authorCount,
    });
  };

  const finalizeFollowedDynamicsTask = (taskId?: string | null) => {
    if (!taskId) return;
    if (readStringStorage(FOLLOWED_DYNAMICS_TASK_KEY, "") === taskId) {
      removeStorageKey(FOLLOWED_DYNAMICS_TASK_KEY);
    }
  };

  const resumeFollowedDynamicsTask = async ({
    taskId,
    scope,
    label,
    authorCount,
    daysBackValue,
    keepLimit,
    switchToResult = false,
    silent = false,
  }: {
    taskId: string;
    scope: DynamicFetchScope;
    label: string;
    authorCount?: number;
    daysBackValue: number;
    keepLimit: number;
    switchToResult?: boolean;
    silent?: boolean;
  }) => {
    let consecutiveErrors = 0;
    try {
      while (true) {
        try {
          const task = await bilibiliGetFollowedCrawlTask(taskId);
          consecutiveErrors = 0;
          setFollowedDynamicsTask(task);

          if (task.status === "completed") {
            finalizeFollowedDynamicsTask(taskId);
            if (!task.result) {
              throw createTerminalTaskError("后台任务已完成，但没有返回结果");
            }
            applyDynamicsPreviewResult({
              res: task.result,
              scope,
              label,
              authorCount,
              daysBackValue,
              keepLimit,
              switchToResult,
            });
            break;
          }

          if (task.status === "failed") {
            finalizeFollowedDynamicsTask(taskId);
            throw createTerminalTaskError(task.error || "动态抓取失败");
          }

          if (task.status === "cancelled") {
            finalizeFollowedDynamicsTask(taskId);
            throw createTerminalTaskError(task.error || "后台任务已停止");
          }

          await sleep(TASK_POLL_INTERVAL_MS);
        } catch (err) {
          if (isTerminalTaskError(err)) {
            throw err;
          }
          consecutiveErrors += 1;
          const maxRetry = isNotFoundError(err)
            ? TASK_POLL_NOT_FOUND_RETRY_LIMIT
            : TASK_POLL_MAX_CONSECUTIVE_ERRORS;
          if (consecutiveErrors >= maxRetry) {
            if (isNotFoundError(err)) {
              finalizeFollowedDynamicsTask(taskId);
            }
            throw err;
          }
          await sleep(TASK_POLL_RETRY_DELAY_MS);
        }
      }
    } catch (err) {
      const message = consecutiveErrors > 0
        ? `${getErrorMessage(err)}；后台任务可能仍在执行，可稍后自动恢复`
        : getErrorMessage(err);
      resetDynamicsPreviewResult({ scope, label, authorCount });
      if (!silent) {
        toast.error(scope === "global" ? "获取失败" : "定向爬取失败", message);
      }
    }
  };

  const runDynamicsPreview = async ({
    authorIds,
    keywordsOverride,
    tagFiltersOverride,
    daysBackOverride,
    limitOverride,
    pageLimitOverride,
    label,
    scope,
    monitorLabel,
    monitorSubfolder,
    switchToResult = false,
  }: {
    authorIds?: string[];
    keywordsOverride?: string[];
    tagFiltersOverride?: string[];
    daysBackOverride?: number;
    limitOverride?: number;
    pageLimitOverride?: number;
    label: string;
    scope: DynamicFetchScope;
    monitorLabel?: string;
    monitorSubfolder?: string;
    switchToResult?: boolean;
  }) => {
    setLoading(true);
    setFollowedDynamicsTask(null);
    try {
      const { safeDaysBack: activeDaysBack, safeLimit: activeLimit } = normalizeDynamicRequestInputs();
      const safeDaysBack = daysBackOverride !== undefined
        ? clampPositiveInt(daysBackOverride, activeDaysBack, 365)
        : activeDaysBack;
      const safeLimit = limitOverride !== undefined
        ? clampPositiveInt(limitOverride, activeLimit, MAX_DYNAMIC_KEEP_LIMIT)
        : activeLimit;
      const safePageLimit = pageLimitOverride !== undefined
        ? clampPositiveInt(pageLimitOverride, 5, 1000)
        : undefined;
      const activeSessdata = await ensureSessdataFromEdge();
      const dynamicTypes = selectedTypes.map(getDynamicTypeNumber);
      const normalizedAuthorIds = Array.from(
        new Set(
          (authorIds || [])
            .map((authorId) => String(authorId || "").trim())
            .filter(Boolean)
        )
      );
      const normalizedKeywords = Array.from(
        new Set(
          (keywordsOverride !== undefined
            ? keywordsOverride
            : normalizedAuthorIds.length === 0
              ? keywords
              : []
          )
            .map((keyword) => String(keyword || "").trim())
            .filter(Boolean)
        )
      );
      const normalizedTagFilters = Array.from(
        new Set(
          (tagFiltersOverride !== undefined
            ? tagFiltersOverride
            : normalizedAuthorIds.length === 0
              ? tagFilters
              : []
          )
            .map((tag) => String(tag || "").trim())
            .filter(Boolean)
        )
      );
      const requestPayload = {
        sessdata: activeSessdata,
        keywords: normalizedKeywords.length > 0 ? normalizedKeywords : undefined,
        tag_filters: normalizedTagFilters.length > 0 ? normalizedTagFilters : undefined,
        author_ids: normalizedAuthorIds.length > 0 ? normalizedAuthorIds : undefined,
        dynamic_types: dynamicTypes.length > 0 ? dynamicTypes : undefined,
        days_back: safeDaysBack,
        limit: safeLimit,
        page_limit: safePageLimit,
        monitor_label: monitorLabel,
        monitor_subfolder: monitorSubfolder,
      };
      const authorCount = normalizedAuthorIds.length > 0 ? normalizedAuthorIds.length : undefined;

      try {
        const started = await bilibiliStartFollowedCrawl(requestPayload);
        writeStringStorage(FOLLOWED_DYNAMICS_TASK_KEY, started.task_id);
        await resumeFollowedDynamicsTask({
          taskId: started.task_id,
          scope,
          label,
          authorCount,
          daysBackValue: safeDaysBack,
          keepLimit: safeLimit,
          switchToResult,
        });
      } catch (err) {
        if (!isNotFoundError(err)) {
          throw err;
        }
        finalizeFollowedDynamicsTask(readStringStorage(FOLLOWED_DYNAMICS_TASK_KEY, ""));
        const res = await bilibiliFetchFollowed(requestPayload);
        applyDynamicsPreviewResult({
          res,
          scope,
          label,
          authorCount,
          daysBackValue: safeDaysBack,
          keepLimit: safeLimit,
          switchToResult,
        });
      }
    } catch (err) {
      resetDynamicsPreviewResult({
        scope,
        label,
        authorCount: authorIds?.length || undefined,
      });
      toast.error(scope === "global" ? "获取失败" : "定向爬取失败", getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleFetch = async () => {
    const label = dynamicSearchTerms.length > 0
      ? `全关注流筛选 · 词 / 标签：${dynamicSearchTerms.join(" / ")}`
      : "全关注流";
    await runDynamicsPreview({
      label,
      scope: "global",
      monitorSubfolder: buildGlobalSearchSubfolder(dynamicSearchTerms, dynamicSearchTerms),
    });
  };

  const handlePreviewDailyMonitor = async (monitor: BilibiliDailyDynamicMonitor) => {
    const normalizedMonitor = normalizeDailyDynamicMonitor(monitor);
    const label = `每日关键词监控：${normalizedMonitor.label}`;
    await runDynamicsPreview({
      keywordsOverride: normalizedMonitor.keywords,
      tagFiltersOverride: normalizedMonitor.tag_filters,
      daysBackOverride: normalizedMonitor.days_back,
      limitOverride: normalizedMonitor.limit,
      pageLimitOverride: normalizedMonitor.page_limit,
      label,
      scope: "global",
      monitorLabel: normalizedMonitor.label,
      monitorSubfolder: buildDailyMonitorSaveSubfolder(
        normalizedMonitor.label,
        normalizedMonitor.keywords,
        normalizedMonitor.tag_filters,
      ),
      switchToResult: true,
    });
  };

  const finalizeFollowedUpsTask = (taskId?: string | null) => {
    if (!taskId) return;
    if (readStringStorage(FOLLOWED_UPS_TASK_KEY, "") === taskId) {
      removeStorageKey(FOLLOWED_UPS_TASK_KEY);
    }
  };

  const resumeFollowedUpsTask = async (taskId: string, silent = false) => {
    setFollowedUpsLoading(true);
    let consecutiveErrors = 0;
    try {
      while (true) {
        try {
          const task = await bilibiliGetFollowedUpsCrawlTask(taskId);
          consecutiveErrors = 0;
          setFollowedUpsTask(task);

          if (task.status === "completed") {
            const result = task.result;
            setOriginalGroups(result?.groups || []);
            setFollowedUps(result?.ups || []);
            setFollowedUpsLoaded(true);
            finalizeFollowedUpsTask(taskId);
            if (!silent) {
              toast.success("关注 UP 已加载", `共 ${result?.total || 0} 个关注`);
            }
            break;
          }

          if (task.status === "failed") {
            finalizeFollowedUpsTask(taskId);
            throw createTerminalTaskError(task.error || "关注列表抓取失败");
          }

          if (task.status === "cancelled") {
            finalizeFollowedUpsTask(taskId);
            throw createTerminalTaskError(task.error || "后台任务已停止");
          }

          await sleep(TASK_POLL_INTERVAL_MS);
        } catch (err) {
          if (isTerminalTaskError(err)) {
            throw err;
          }
          consecutiveErrors += 1;
          const maxRetry = isNotFoundError(err)
            ? TASK_POLL_NOT_FOUND_RETRY_LIMIT
            : TASK_POLL_MAX_CONSECUTIVE_ERRORS;
          if (consecutiveErrors >= maxRetry) {
            if (isNotFoundError(err)) {
              finalizeFollowedUpsTask(taskId);
            }
            throw err;
          }
          await sleep(TASK_POLL_RETRY_DELAY_MS);
        }
      }
    } catch (err) {
      if (!silent) {
        const message = consecutiveErrors > 0
          ? `${getErrorMessage(err)}；后台任务可能仍在执行，可稍后自动恢复`
          : getErrorMessage(err);
        toast.error("加载关注失败", message);
      }
    } finally {
      setFollowedUpsLoading(false);
    }
  };

  const handleLoadFollowedUps = async (silent = false, force = false) => {
    if (followedUpsLoading) return;
    if (followedUpsLoaded && !force) return;

    setFollowedUpsLoading(true);
    setFollowedUpsTask(null);
    try {
      const activeSessdata = await ensureSessdataFromEdge();
      try {
        const started = await bilibiliStartFollowedUpsCrawl({
          sessdata: activeSessdata,
          max_count: 5000,
        });
        writeStringStorage(FOLLOWED_UPS_TASK_KEY, started.task_id);
        await resumeFollowedUpsTask(started.task_id, silent);
      } catch (err) {
        if (!isNotFoundError(err)) {
          throw err;
        }
        finalizeFollowedUpsTask(readStringStorage(FOLLOWED_UPS_TASK_KEY, ""));
        const result = await bilibiliFetchFollowedUps({
          sessdata: activeSessdata,
          max_count: 5000,
        });
        setOriginalGroups(result.groups || []);
        setFollowedUps(result.ups || []);
        setFollowedUpsLoaded(true);
        if (!silent) {
          toast.success("关注 UP 已加载", `共 ${result.total || 0} 个关注`);
        }
      }
    } catch (err) {
      if (!silent) {
        toast.error("加载关注失败", err instanceof Error ? err.message : "未知错误");
      }
    } finally {
      setFollowedUpsLoading(false);
    }
  };

  const saveTrackerConfig = async (patch: Partial<BilibiliTrackerConfig>, successTitle?: string) => {
    const nextConfig = {
      ...trackerConfig,
      ...patch,
      followed_up_filter_mode: patch.followed_up_filter_mode || trackerConfig.followed_up_filter_mode,
      followed_up_group_options: patch.followed_up_group_options || trackerConfig.followed_up_group_options,
      creator_profiles: patch.creator_profiles || trackerConfig.creator_profiles,
      favorite_up_profiles: patch.favorite_up_profiles || trackerConfig.favorite_up_profiles,
    };
    await api.post("/api/modules/bilibili-tracker/config", nextConfig);
    setTrackerConfig(nextConfig);
    if (successTitle) {
      toast.success(successTitle);
    }
  };

  const finalizeSmartGroupTask = (taskId?: string | null) => {
    if (!taskId) return;
    if (readStringStorage(SMART_GROUP_TASK_KEY, "") === taskId) {
      removeStorageKey(SMART_GROUP_TASK_KEY);
    }
  };

  const resumeSmartGroupTask = async (taskId: string, silent = false) => {
    setSmartGroupRunning(true);
    let consecutiveErrors = 0;
    try {
      while (true) {
        try {
          const task = await bilibiliGetSmartGroupTask(taskId);
          consecutiveErrors = 0;
          setSmartGroupTask(task);

          if (task.status === "completed") {
            finalizeSmartGroupTask(taskId);
            await refreshTrackerConfig();
            if (!silent) {
              const workflowMode = task.result?.workflow_mode || task.workflow_mode;
              toast.success(
                workflowMode === "creator-only" ? "博主 / UP 已重新整理" : "智能分组已更新",
                task.result?.message || "已同步到日常爬虫监视",
              );
            }
            break;
          }

          if (task.status === "failed") {
            finalizeSmartGroupTask(taskId);
            throw createTerminalTaskError(task.error || "智能分组失败");
          }

          if (task.status === "cancelled") {
            finalizeSmartGroupTask(taskId);
            throw createTerminalTaskError(task.error || "后台任务已停止");
          }

          await sleep(TASK_POLL_INTERVAL_MS);
        } catch (err) {
          if (isTerminalTaskError(err)) {
            throw err;
          }
          consecutiveErrors += 1;
          const maxRetry = isNotFoundError(err)
            ? TASK_POLL_NOT_FOUND_RETRY_LIMIT
            : TASK_POLL_MAX_CONSECUTIVE_ERRORS;
          if (consecutiveErrors >= maxRetry) {
            if (isNotFoundError(err)) {
              finalizeSmartGroupTask(taskId);
            }
            throw err;
          }
          await sleep(TASK_POLL_RETRY_DELAY_MS);
        }
      }
    } catch (err) {
      if (!silent) {
        const message = consecutiveErrors > 0
          ? `${getErrorMessage(err)}；后台任务可能仍在执行，可稍后自动恢复`
          : getErrorMessage(err);
        toast.error("智能分组失败", message);
      }
    } finally {
      setSmartGroupRunning(false);
    }
  };

  const handleRunSmartGroups = async (mode: "full" | "creator-only" = "full") => {
    if (smartGroupRunning) return;
    try {
      const activeSessdata = await ensureSessdataFromEdge();
      const started = await bilibiliStartSmartGroupTask({
        sessdata: activeSessdata,
        max_count: 5000,
        mode,
      });
      writeStringStorage(SMART_GROUP_TASK_KEY, started.task_id);
      setSmartGroupTask(null);
      await resumeSmartGroupTask(started.task_id);
    } catch (err) {
      toast.error("智能分组失败", err instanceof Error ? err.message : "未知错误");
    }
  };

  const handleBuildSmartGroups = async () => {
    await handleRunSmartGroups("full");
  };

  const handleRefreshSharedCreatorAssignments = async () => {
    await handleRunSmartGroups("creator-only");
  };

  const handleSaveSharedSignalMappings = async (mapping: Record<string, string[]>) => {
    setSavingSignalMappings(true);
    try {
      await api.post("/api/modules/bilibili-tracker/config", {
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

  const saveManualMonitoredUps = async (upIds: string[], successTitle?: string) => {
    await saveTrackerConfig({
      up_uids: Array.from(new Set(upIds.map((upId) => String(upId || "").trim()).filter(Boolean))),
      followed_up_original_groups: [],
    }, successTitle);
  };

  const toggleManualMonitoredUp = async (upId: string) => {
    const current = trackerConfig.up_uids || [];
    const next = current.includes(upId)
      ? current.filter((item) => item !== upId)
      : [...current, upId];
    try {
      await saveManualMonitoredUps(next);
    } catch (err) {
      toast.error("保存失败", err instanceof Error ? err.message : "未知错误");
    }
  };

  const handleClearManualMonitoredUps = async () => {
    try {
      await saveManualMonitoredUps([], "已清空固定监督 UP");
    } catch (err) {
      toast.error("清空失败", err instanceof Error ? err.message : "未知错误");
    }
  };

  const handleImportManualMonitorGroup = async (groupValue: string) => {
    const members = followedUps.filter((up) => getUpSmartGroups(up).includes(groupValue));
    const currentSet = new Set((trackerConfig.up_uids || []).map((upId) => String(upId || "").trim()).filter(Boolean));
    const importableIds = members
      .map((up) => up.mid)
      .filter((upId) => upId && !currentSet.has(upId));
    if (importableIds.length === 0) {
      toast.info("这个智能组里的 UP 都已在固定监督里");
      return;
    }
    try {
      await saveManualMonitoredUps(
        [...currentSet, ...importableIds],
        `已从智能组导入 ${importableIds.length} 个固定监督 UP`,
      );
      setExpandedFixedUpImportGroup(groupValue);
      setShowFixedUpMonitorSavedList(true);
    } catch (err) {
      toast.error("导入失败", err instanceof Error ? err.message : "未知错误");
    }
  };

  const handleDebugTest = async () => {
    setDebugLoading(true);
    try {
      const activeSessdata = await ensureSessdataFromEdge();
      const result = await bilibiliDebugTest(activeSessdata);
      setDebugResult(result);
      toast.success("诊断测试完成");
    } catch (err) {
      toast.error("诊断失败", err instanceof Error ? err.message : "未知错误");
    } finally {
      setDebugLoading(false);
    }
  };

  const smartGroupOptions = trackerConfig.followed_up_group_options.length > 0
    ? trackerConfig.followed_up_group_options
    : DEFAULT_SMART_GROUP_OPTIONS;
  const smartGroupLabelMap = new Map(smartGroupOptions.map((option) => [option.value, option.label]));
  const hasBuiltSmartGroups = Object.keys(trackerConfig.creator_profiles || {}).length > 0;
  const smartGroupsReady = !(smartGroupOptions.length === DEFAULT_SMART_GROUP_OPTIONS.length && !hasBuiltSmartGroups);

  useEffect(() => {
    if (selectedFollowedGroup !== "all" && !smartGroupOptions.some((group) => group.value === selectedFollowedGroup)) {
      setSelectedFollowedGroup("all");
    }
  }, [selectedFollowedGroup, smartGroupOptions]);

  useEffect(() => {
    if (smartGroupOptions.length === 0) {
      return;
    }
    if (!smartGroupOptions.some((group) => group.value === managedSmartGroup)) {
      setManagedSmartGroup(selectedFollowedGroup !== "all" && smartGroupOptions.some((group) => group.value === selectedFollowedGroup)
        ? selectedFollowedGroup
        : smartGroupOptions[0].value);
    }
  }, [managedSmartGroup, selectedFollowedGroup, smartGroupOptions]);

  useEffect(() => {
    if (selectedFollowedGroup !== "all" && smartGroupOptions.some((group) => group.value === selectedFollowedGroup)) {
      setManagedSmartGroup(selectedFollowedGroup);
    }
  }, [selectedFollowedGroup, smartGroupOptions]);

  useEffect(() => {
    const trackedGroup = (trackerConfig.followed_up_groups || []).find((groupValue) => (
      smartGroupOptions.some((group) => group.value === groupValue)
    ));
    const preferredGroup = trackedGroup
      || (selectedFollowedGroup !== "all" && smartGroupOptions.some((group) => group.value === selectedFollowedGroup)
        ? selectedFollowedGroup
        : "")
      || smartGroupOptions[0]?.value
      || "";
    if (!preferredGroup) {
      return;
    }
    if (targetedDynamicGroup === "all" || (targetedDynamicGroup && smartGroupOptions.some((group) => group.value === targetedDynamicGroup))) {
      return;
    }
    setTargetedDynamicGroup(preferredGroup);
  }, [targetedDynamicGroup, trackerConfig.followed_up_groups, selectedFollowedGroup, smartGroupOptions]);

  const originalGroupMap = new Map(originalGroups.map((group) => [group.tag_id, group]));

  const getUpProfile = (up: BiliFollowedUp): BilibiliSmartGroupProfile | null => (
    trackerConfig.creator_profiles?.[up.mid] || null
  );

  const getUpManualOriginalGroupIds = (up: BiliFollowedUp): number[] => {
    const profile = getUpProfile(up);
    return Array.from(
      new Set(
        (profile?.manual_original_group_ids || [])
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && originalGroupMap.has(value))
      )
    );
  };

  const getUpOriginalGroupIds = (up: BiliFollowedUp): number[] => (
    Array.from(new Set([...(up.tag_ids || []), ...getUpManualOriginalGroupIds(up)]))
  );

  const getUpOriginalGroupNames = (up: BiliFollowedUp): string[] => {
    const rawNames = Array.isArray(up.tag_names) ? up.tag_names.filter(Boolean) : [];
    const manualNames = getUpManualOriginalGroupIds(up)
      .map((groupId) => originalGroupMap.get(groupId)?.name || "")
      .filter(Boolean);
    return Array.from(new Set([...rawNames, ...manualNames]));
  };

  const isUpRawOriginalGroupMember = (up: BiliFollowedUp, groupId: number): boolean => (
    (up.tag_ids || []).includes(groupId)
  );

  const isUpInOriginalGroup = (up: BiliFollowedUp, groupId: number): boolean => (
    getUpOriginalGroupIds(up).includes(groupId)
  );

  const getUpSmartGroups = (up: BiliFollowedUp): string[] => {
    const profile = getUpProfile(up);
    const profileGroups = profile?.smart_groups || [];
    if (profile?.manual_override) {
      return profileGroups.filter((group) => group.trim());
    }
    if (profileGroups.length > 0) {
      return profileGroups;
    }
    return [classifyFollowedUp(up)];
  };

  const getSmartGroupLabel = (groupValue: string): string => (
    smartGroupLabelMap.get(groupValue)
    || DEFAULT_SMART_GROUP_META[groupValue]?.label
    || groupValue
  );

  const matchesFollowedUpSearch = (up: BiliFollowedUp): boolean => {
    return matchesUpQuery(up, followedUpSearch);
  };

  const resetFollowedUpFilters = () => {
    setSelectedOriginalGroup("all");
    setSelectedFollowedGroup("all");
    setFollowedUpSearch("");
  };

  const syncEditUpGroupingDraft = (up: BiliFollowedUp) => {
    setEditingGroupedUpId(up.mid);
    setEditingSmartGroupValues(getUpSmartGroups(up));
    setEditingManualOriginalGroupIds(getUpManualOriginalGroupIds(up));
  };

  const beginEditUpGrouping = (up: BiliFollowedUp) => {
    if (editingGroupedUpId === up.mid) {
      return;
    }
    syncEditUpGroupingDraft(up);
  };

  const closeEditUpGrouping = () => {
    setEditingGroupedUpId("");
    setEditingSmartGroupValues([]);
    setEditingManualOriginalGroupIds([]);
  };

  const toggleEditingSmartGroup = (groupValue: string) => {
    setEditingSmartGroupValues((prev) => (
      prev.includes(groupValue)
        ? prev.filter((value) => value !== groupValue)
        : [...prev, groupValue]
    ));
  };

  const toggleEditingOriginalGroup = (up: BiliFollowedUp, groupId: number) => {
    if (isUpRawOriginalGroupMember(up, groupId)) {
      return;
    }
    setEditingManualOriginalGroupIds((prev) => (
      prev.includes(groupId)
        ? prev.filter((value) => value !== groupId)
        : [...prev, groupId]
    ));
  };

  const saveEditedUpGrouping = async () => {
    const up = followedUpByAuthorId[editingGroupedUpId];
    if (!up) {
      toast.error("未找到要编辑的 UP");
      return;
    }

    const nextSmartGroups = Array.from(
      new Set(editingSmartGroupValues.map((value) => value.trim()).filter(Boolean))
    );
    if (nextSmartGroups.length === 0) {
      toast.info("至少保留一个智能分组");
      return;
    }

    const nextManualOriginalIds = Array.from(
      new Set(
        editingManualOriginalGroupIds
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && originalGroupMap.has(value) && !isUpRawOriginalGroupMember(up, value))
      )
    );

    const currentProfiles = trackerConfig.creator_profiles || {};
    const currentProfile = currentProfiles[up.mid] || {};
    const nextProfiles = {
      ...currentProfiles,
      [up.mid]: {
        ...currentProfile,
        author: currentProfile.author || up.uname,
        author_id: currentProfile.author_id || up.mid,
        matched_author: currentProfile.matched_author || up.uname,
        manual_override: true,
        smart_groups: nextSmartGroups,
        smart_group_labels: nextSmartGroups.map((group) => getSmartGroupLabel(group)),
        manual_original_group_ids: nextManualOriginalIds,
        manual_original_group_labels: nextManualOriginalIds
          .map((groupId) => originalGroupMap.get(groupId)?.name || "")
          .filter(Boolean),
      },
    };

    setSavingGroupingEditor(true);
    try {
      await saveTrackerConfig({ creator_profiles: nextProfiles }, "UP 分组已保存");
    } catch (err) {
      toast.error("保存失败", err instanceof Error ? err.message : "未知错误");
    } finally {
      setSavingGroupingEditor(false);
    }
  };

  const followedGroupByAuthorId = Object.fromEntries(
    followedUps.map((up) => [up.mid, getUpSmartGroups(up)[0] || ""])
  ) as Record<string, string>;
  const followedUpByAuthorId = Object.fromEntries(
    followedUps.map((up) => [up.mid, up])
  ) as Record<string, BiliFollowedUp>;

  const filteredFollowedUps = followedUps.filter((up) => {
    if (selectedOriginalGroup !== "all" && !isUpInOriginalGroup(up, selectedOriginalGroup)) {
      return false;
    }
    if (selectedFollowedGroup !== "all" && !getUpSmartGroups(up).includes(selectedFollowedGroup)) {
      return false;
    }
    return matchesFollowedUpSearch(up);
  });

  const displayedDynamics = dynamics.filter((dynamic) => {
    if (dynamicFetchMeta.scope !== "global") {
      return true;
    }
    const up = followedUpByAuthorId[dynamic.author_id];
    if (selectedOriginalGroup !== "all" && up && !isUpInOriginalGroup(up, selectedOriginalGroup)) {
      return false;
    }
    if (selectedFollowedGroup !== "all" && !getUpSmartGroups(up || {
      mid: dynamic.author_id,
      uname: dynamic.author,
      face: "",
      sign: "",
      official_desc: "",
      special: 0,
      tag_ids: [],
      tag_names: [],
    } as BiliFollowedUp).includes(selectedFollowedGroup)) {
      return false;
    }
    return true;
  });

  const groupCounts = smartGroupOptions.reduce<Record<string, number>>((acc, group) => {
    acc[group.value] = followedUps.filter((up) => getUpSmartGroups(up).includes(group.value)).length;
    return acc;
  }, {});

  const originalGroupCounts = originalGroups.reduce<Record<number, number>>((acc, group) => {
    acc[group.tag_id] = followedUps.filter((up) => isUpInOriginalGroup(up, group.tag_id)).length;
    return acc;
  }, {});
  const selectedOriginalGroupLabel = selectedOriginalGroup === "all"
    ? "全部默认分组"
    : originalGroups.find((group) => group.tag_id === selectedOriginalGroup)?.name || "已选默认分组";
  const selectedSmartGroupLabel = selectedFollowedGroup === "all"
    ? "全部智能分组"
    : getSmartGroupLabel(selectedFollowedGroup);
  const activeFollowedFilterCount = [
    selectedOriginalGroup !== "all",
    selectedFollowedGroup !== "all",
    followedUpSearch.trim().length > 0,
  ].filter(Boolean).length;
  const targetedDynamicGroupLabel = targetedDynamicGroup === "all"
    ? "全部智能组"
    : targetedDynamicGroup
      ? getSmartGroupLabel(targetedDynamicGroup)
      : "未选智能组";
  const targetedDynamicGroupMeta = targetedDynamicGroup === "all"
    ? { label: "全部智能组", accent: "#0EA5E9", bg: "rgba(14, 165, 233, 0.10)" }
    : targetedDynamicGroup
      ? resolveSmartGroupMeta(targetedDynamicGroup, targetedDynamicGroupLabel)
      : resolveSmartGroupMeta("other", "未选智能组");
  const targetedDynamicGroupMembers = targetedDynamicGroup === "all"
    ? followedUps
    : targetedDynamicGroup
      ? followedUps.filter((up) => getUpSmartGroups(up).includes(targetedDynamicGroup))
      : [];
  const targetedDynamicGroupTotalPages = Math.max(1, Math.ceil(smartGroupOptions.length / TARGETED_DYNAMIC_GROUPS_PAGE_SIZE));
  const safeTargetedDynamicGroupPage = Math.min(targetedDynamicGroupPage, targetedDynamicGroupTotalPages);
  const pagedTargetedDynamicGroups = smartGroupOptions.slice(
    (safeTargetedDynamicGroupPage - 1) * TARGETED_DYNAMIC_GROUPS_PAGE_SIZE,
    safeTargetedDynamicGroupPage * TARGETED_DYNAMIC_GROUPS_PAGE_SIZE,
  );
  const targetedDynamicCandidates = targetedDynamicGroupMembers.filter((up) => matchesUpQuery(up, targetedDynamicUpSearch));
  const targetedDynamicSelectedUps = followedUps.filter((up) => targetedDynamicUpIds.has(up.mid));
  const targetedDynamicSearchActive = targetedDynamicUpSearch.trim().length > 0;
  const targetedDynamicFetchMembers = targetedDynamicSearchActive ? targetedDynamicCandidates : targetedDynamicGroupMembers;
  const targetedDynamicVisibleSelectedCount = targetedDynamicCandidates.reduce(
    (count, up) => count + (targetedDynamicUpIds.has(up.mid) ? 1 : 0),
    0
  );
  const targetedDynamicTotalPages = Math.max(1, Math.ceil(targetedDynamicCandidates.length / TARGETED_DYNAMIC_RESULTS_PAGE_SIZE));
  const safeTargetedDynamicPage = Math.min(targetedDynamicPage, targetedDynamicTotalPages);
  const pagedTargetedDynamicCandidates = targetedDynamicCandidates.slice(
    (safeTargetedDynamicPage - 1) * TARGETED_DYNAMIC_RESULTS_PAGE_SIZE,
    safeTargetedDynamicPage * TARGETED_DYNAMIC_RESULTS_PAGE_SIZE,
  );
  const dynamicResultsTotalPages = Math.max(1, Math.ceil(displayedDynamics.length / DYNAMIC_RESULTS_PAGE_SIZE));
  const safeDynamicResultsPage = Math.min(dynamicResultsPage, dynamicResultsTotalPages);
  const pagedDisplayedDynamics = displayedDynamics.slice(
    (safeDynamicResultsPage - 1) * DYNAMIC_RESULTS_PAGE_SIZE,
    safeDynamicResultsPage * DYNAMIC_RESULTS_PAGE_SIZE,
  );

  useEffect(() => {
    const allowedIds = new Set(followedUps.map((up) => up.mid));
    setTargetedDynamicUpIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      prev.forEach((upId) => {
        if (allowedIds.has(upId)) {
          next.add(upId);
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [followedUps]);

  useEffect(() => {
    setTargetedDynamicPage(1);
  }, [targetedDynamicGroup, targetedDynamicUpSearch]);

  useEffect(() => {
    setDynamicResultsPage(1);
  }, [dynamics, dynamicFetchMeta.label, selectedOriginalGroup, selectedFollowedGroup]);

  const followStatusTitle = followedUpsLoading
    ? "正在获取关注列表"
    : followedUpsLoaded
      ? "最近一次获取完成"
      : "尚未开始获取";
  const followStatusStage = followedUpsTask?.stage
    || (followedUpsLoaded ? "关注列表已就绪，可继续筛选分组。" : "点击上方按钮开始获取当前账号关注列表。");
  const followStatusCount = followedUpsTask?.fetched_count ?? followedUps.length;
  const followStatusPage = followedUpsTask?.current_page ?? 0;
  const followStatusProgress = followedUpsLoading
    ? Math.min(96, Math.max(10, Math.round(followStatusCount / 50)))
    : followedUpsLoaded
      ? 100
      : 0;
  const smartGroupStatusTitle = smartGroupRunning
    ? "正在增量维护共享智能分组"
    : smartGroupTask?.status === "completed"
      ? "最近一次共享智能分组完成"
      : "尚未生成共享智能分组";
  const smartGroupStatusStage = smartGroupTask?.stage
    || (smartGroupOptions.length > 0 && trackerConfig.creator_profiles && Object.keys(trackerConfig.creator_profiles).length > 0
      ? "已生成共享智能分组，可直接用于关注监控，并与小红书共用同一套组别。"
      : "点击“共享智能分组”做完整重建；如果只想把新 UP 挂到已有组，直接点“仅整理博主 / UP”。");
  const smartGroupStatusProgress = smartGroupRunning
    ? smartGroupTask?.progress || 18
    : smartGroupTask?.status === "completed"
      ? 100
      : 0;
  const smartGroupTotalUpCount = smartGroupTask?.total_followed_count
    ?? (smartGroupTask?.status === "completed" ? Object.keys(trackerConfig.creator_profiles || {}).length : 0);
  const smartGroupProcessedUpCount = smartGroupTask?.processed_followed_count
    ?? (smartGroupTask?.status === "completed" ? smartGroupTotalUpCount : 0);
  const smartGroupCollectedUpCount = smartGroupTask?.fetched_count ?? followedUps.length;
  const smartGroupCurrentUpName = String(smartGroupTask?.current_followed_name || "").trim();
  const smartGroupMetricLabel = smartGroupRunning && smartGroupTotalUpCount > 0 ? "已处理 UP" : "匹配 UP";
  const smartGroupMetricValue = smartGroupRunning && smartGroupTotalUpCount > 0
    ? smartGroupProcessedUpCount
    : (smartGroupTask?.matched_followed_count || Object.keys(trackerConfig.creator_profiles || {}).length);
  const smartGroupStatusDetails = [
    smartGroupCollectedUpCount > 0 ? `已收集 UP ${smartGroupCollectedUpCount} 个` : "",
    (smartGroupTask?.total_groups || smartGroupOptions.length) > 0
      ? `共享分类 ${smartGroupTask?.total_groups || smartGroupOptions.length} 个`
      : "",
    smartGroupTotalUpCount > 0 ? `已处理 UP ${smartGroupProcessedUpCount} / ${smartGroupTotalUpCount}` : "",
    smartGroupCurrentUpName ? `当前：${smartGroupCurrentUpName}` : "",
  ].filter(Boolean);
  const sharedTagIndexPath = trackerConfig.shared_creator_grouping.shared_data_paths?.tag_index_path
    || trackerConfig.shared_creator_grouping.vault_signal_database?.tag_index_path
    || trackerConfig.shared_creator_grouping.vault_signal_database?.database_path
    || "";
  const dailyDynamicMonitors = (trackerConfig.daily_dynamic_monitors || []).map((monitor) => normalizeDailyDynamicMonitor(monitor));
  const activeDailyDynamicMonitors = dailyDynamicMonitors.filter((monitor) => monitor.enabled);
  const allSmartGroupBundles = smartGroupOptions.map((group) => {
    const members = followedUps.filter((up) => getUpSmartGroups(up).includes(group.value));
    const sampleTags = group.sample_tags && group.sample_tags.length > 0
      ? group.sample_tags
      : Array.from(
        new Set(
          members.flatMap((up) => getUpProfile(up)?.sample_tags || [])
        )
      ).slice(0, 4);
    return {
      ...group,
      meta: resolveSmartGroupMeta(group.value, group.label),
      members,
      sampleAuthors: members.slice(0, 4).map((up) => up.uname),
      sampleTags,
    };
  });
  const suggestedSmartGroupTags = allSmartGroupBundles
    .map((group) => {
      const mappedSignals = (trackerConfig.shared_signal_entries || [])
        .filter((entry) => resolveSharedSignalEntryLabels(entry).includes(group.label))
        .map((entry) => ({
          signal: String(entry.signal || "").trim(),
          count: Number(entry.count || 0),
        }))
        .filter((item) => item.signal)
        .sort((a, b) => b.count - a.count || a.signal.localeCompare(b.signal))
        .slice(0, 6);
      const fallbackSignals = mappedSignals.length > 0
        ? []
        : (group.sampleTags || []).map((tag) => ({
            signal: String(tag || "").trim(),
            count: 0,
          })).filter((item) => item.signal);
      const tags = mappedSignals.length > 0 ? mappedSignals : fallbackSignals;
      return {
        ...group,
        tags,
      };
    })
    .filter((group) => group.tags.length > 0);
  const manualPoolIds = Array.from(new Set(trackerConfig.up_uids || []));
  const manualPoolIdSet = new Set(manualPoolIds);
  const manualPoolMembers = manualPoolIds.map((upId) => ({
    id: upId,
    up: followedUpByAuthorId[upId],
  }));
  const selectedTrackedSmartGroups = allSmartGroupBundles.flatMap((group) => {
    const members = group.members.filter((up) => manualPoolIdSet.has(up.mid));
    if (members.length === 0) {
      return [];
    }
    return [{
      ...group,
      members,
      sampleAuthors: members.slice(0, 4).map((up) => up.uname),
      sampleTags: group.sample_tags && group.sample_tags.length > 0
        ? group.sample_tags
        : Array.from(
            new Set(
              members.flatMap((up) => getUpProfile(up)?.sample_tags || [])
            )
          ).slice(0, 4),
    }];
  });
  const trackedUpIds = new Set<string>(manualPoolIds);
  const trackedUpMembers = manualPoolMembers
    .map((entry) => entry.up)
    .filter((up): up is BiliFollowedUp => Boolean(up));
  const monitorCategoryCount = selectedTrackedSmartGroups.length + (manualPoolMembers.length > 0 ? 1 : 0);
  const fixedUpSavedTotalPages = Math.max(1, Math.ceil(manualPoolMembers.length / fixedUpSavedPageSize));
  const safeFixedUpSavedPage = Math.min(fixedUpSavedPage, fixedUpSavedTotalPages);
  const pagedFixedUpSavedMembers = manualPoolMembers.slice(
    (safeFixedUpSavedPage - 1) * fixedUpSavedPageSize,
    safeFixedUpSavedPage * fixedUpSavedPageSize,
  );
  const fixedUpImportGroups = allSmartGroupBundles.filter((group) => group.members.length > 0);
  const fixedUpImportGroupsTotalPages = Math.max(1, Math.ceil(fixedUpImportGroups.length / FIXED_UP_IMPORT_GROUPS_PAGE_SIZE));
  const safeFixedUpImportGroupPage = Math.min(fixedUpImportGroupPage, fixedUpImportGroupsTotalPages);
  const pagedFixedUpImportGroups = fixedUpImportGroups.slice(
    (safeFixedUpImportGroupPage - 1) * FIXED_UP_IMPORT_GROUPS_PAGE_SIZE,
    safeFixedUpImportGroupPage * FIXED_UP_IMPORT_GROUPS_PAGE_SIZE,
  );
  const expandedFixedUpGroupBundle = fixedUpImportGroups.find((group) => group.value === expandedFixedUpImportGroup) || null;
  const expandedFixedUpImportMembers = expandedFixedUpGroupBundle
    ? expandedFixedUpGroupBundle.members.filter((up) => matchesUpQuery(up, fixedUpImportSearch))
    : [];
  const fixedUpImportableCount = expandedFixedUpGroupBundle
    ? expandedFixedUpGroupBundle.members.filter((up) => !manualPoolIdSet.has(up.mid)).length
    : 0;
  const fixedUpImportTotalPages = Math.max(1, Math.ceil(expandedFixedUpImportMembers.length / fixedUpImportPageSize));
  const safeFixedUpImportPage = Math.min(fixedUpImportPage, fixedUpImportTotalPages);
  const pagedFixedUpImportMembers = expandedFixedUpImportMembers.slice(
    (safeFixedUpImportPage - 1) * fixedUpImportPageSize,
    safeFixedUpImportPage * fixedUpImportPageSize,
  );
  const managedSmartGroupOption = smartGroupOptions.find((group) => group.value === managedSmartGroup) || smartGroupOptions[0];
  const managedSmartGroupMeta = managedSmartGroupOption
    ? resolveSmartGroupMeta(managedSmartGroupOption.value, managedSmartGroupOption.label)
    : resolveSmartGroupMeta("other", "其他");
  const managedSmartGroupMembers = managedSmartGroupOption
    ? followedUps.filter((up) => getUpSmartGroups(up).includes(managedSmartGroupOption.value))
    : [];
  const manualGroupingBaseUps = manualGroupingScope === "filtered"
    ? filteredFollowedUps
    : manualGroupingScope === "managed"
      ? managedSmartGroupMembers
      : followedUps;
  const manualGroupingUps = manualGroupingBaseUps.filter((up) => matchesUpQuery(up, manualGroupingSearch));
  const manualGroupingTotalPages = Math.max(1, Math.ceil(manualGroupingUps.length / manualGroupingPageSize));
  const safeManualGroupingPage = Math.min(manualGroupingPage, manualGroupingTotalPages);
  const pagedManualGroupingUps = manualGroupingUps.slice(
    (safeManualGroupingPage - 1) * manualGroupingPageSize,
    safeManualGroupingPage * manualGroupingPageSize,
  );
  const editingGroupedUp = editingGroupedUpId ? followedUpByAuthorId[editingGroupedUpId] : null;
  const editingGroupedUpSmartGroups = editingGroupedUp
    ? editingSmartGroupValues
    : [];
  const editingGroupedUpEffectiveOriginalIds = editingGroupedUp
    ? Array.from(new Set([...(editingGroupedUp.tag_ids || []), ...editingManualOriginalGroupIds]))
    : [];

  useEffect(() => {
    if (!editingGroupedUpId) {
      return;
    }
    if (followedUpByAuthorId[editingGroupedUpId]) {
      return;
    }
    setEditingGroupedUpId("");
    setEditingSmartGroupValues([]);
    setEditingManualOriginalGroupIds([]);
  }, [editingGroupedUpId, followedUpByAuthorId]);

  useEffect(() => {
    setFixedUpSavedPage(1);
  }, [manualPoolMembers.length, fixedUpSavedPageSize]);

  useEffect(() => {
    setFixedUpImportGroupPage(1);
  }, [fixedUpImportGroups.length]);

  useEffect(() => {
    if (!expandedFixedUpImportGroup) {
      return;
    }
    if (fixedUpImportGroups.some((group) => group.value === expandedFixedUpImportGroup)) {
      return;
    }
    setExpandedFixedUpImportGroup("");
  }, [expandedFixedUpImportGroup, fixedUpImportGroups]);

  useEffect(() => {
    setFixedUpImportPage(1);
  }, [expandedFixedUpImportGroup, fixedUpImportSearch, fixedUpImportPageSize]);

  useEffect(() => {
    setFollowedResultPage(1);
  }, [selectedOriginalGroup, selectedFollowedGroup, followedUpSearch, followedUps.length, followedResultPageSize]);

  useEffect(() => {
    setManualGroupingPage(1);
  }, [
    manualGroupingScope,
    manualGroupingSearch,
    managedSmartGroup,
    selectedOriginalGroup,
    selectedFollowedGroup,
    followedUpSearch,
    followedUps.length,
    manualGroupingPageSize,
  ]);

  const followedResultTotalPages = Math.max(1, Math.ceil(filteredFollowedUps.length / followedResultPageSize));
  const safeFollowedResultPage = Math.min(followedResultPage, followedResultTotalPages);
  const pagedFollowedUps = filteredFollowedUps.slice(
    (safeFollowedResultPage - 1) * followedResultPageSize,
    safeFollowedResultPage * followedResultPageSize,
  );

  const toggleTargetedDynamicUp = (upId: string) => {
    setTargetedDynamicUpIds((prev) => {
      const next = new Set(prev);
      if (next.has(upId)) {
        next.delete(upId);
      } else {
        next.add(upId);
      }
      return next;
    });
  };

  const selectAllTargetedDynamicCandidates = () => {
    setTargetedDynamicUpIds((prev) => {
      const next = new Set(prev);
      targetedDynamicCandidates.forEach((up) => next.add(up.mid));
      return next;
    });
  };

  const clearTargetedDynamicSelection = () => {
    setTargetedDynamicUpIds(new Set());
  };

  const handleFetchTrackedUpsDynamics = async () => {
    if (trackedUpMembers.length === 0) {
      toast.info("先把要监视的智能组或手动 UP 放进情报 Feed");
      return;
    }
    await runDynamicsPreview({
      authorIds: trackedUpMembers.map((up) => up.mid),
      label: `每日监视 UP · ${trackedUpMembers.length} 个 UP`,
      scope: "ups",
      monitorSubfolder: buildTrackedUpsSubfolder(`已启用监视UP ${trackedUpMembers.length} 个`),
      switchToResult: true,
    });
  };

  const handleFetchTargetedGroupDynamics = async () => {
    if (!targetedDynamicGroup) {
      toast.error("先选一个浏览范围");
      return;
    }
    const { safeDaysBack, safeLimit } = normalizeTargetedGroupRequestInputs();
    if (targetedDynamicFetchMembers.length === 0) {
      toast.info(
        targetedDynamicSearchActive
          ? `${targetedDynamicGroupLabel} 里没有匹配当前搜索词的 UP`
          : `${targetedDynamicGroupLabel} 里还没有可抓取的 UP`
      );
      return;
    }
    const scopeLabel = targetedDynamicSearchActive ? "当前筛选" : "整组";
    const label = targetedDynamicGroup === "all"
      ? `全部智能组 · ${scopeLabel} ${targetedDynamicFetchMembers.length} 个 UP`
      : `${targetedDynamicGroupLabel} · ${scopeLabel} ${targetedDynamicFetchMembers.length} 个 UP`;
    await runDynamicsPreview({
      authorIds: targetedDynamicFetchMembers.map((up) => up.mid),
      daysBackOverride: safeDaysBack,
      limitOverride: safeLimit,
      label,
      scope: "group",
      monitorSubfolder: buildTargetedGroupSubfolder(
        targetedDynamicGroup === "all" ? "全部智能组" : targetedDynamicGroupLabel,
      ),
      switchToResult: true,
    });
  };

  const handleFetchSelectedUpsDynamics = async () => {
    if (targetedDynamicSelectedUps.length === 0) {
      toast.error("先勾选至少一个 UP");
      return;
    }
    const { safeDaysBack, safeLimit } = normalizeTargetedGroupRequestInputs();
    const sampleNames = targetedDynamicSelectedUps.slice(0, 3).map((up) => up.uname);
    const overflowCount = targetedDynamicSelectedUps.length - sampleNames.length;
    const label = overflowCount > 0
      ? `${sampleNames.join(" / ")} 等 ${targetedDynamicSelectedUps.length} 个 UP`
      : sampleNames.join(" / ");
    await runDynamicsPreview({
      authorIds: targetedDynamicSelectedUps.map((up) => up.mid),
      daysBackOverride: safeDaysBack,
      limitOverride: safeLimit,
      label,
      scope: "ups",
      monitorSubfolder: buildSelectedUpsSubfolder(label),
      switchToResult: true,
    });
  };

  const saveDynamicsToVault = async (targetDynamics: BiliDynamic[], successLabel: string) => {
    if (targetDynamics.length === 0) {
      toast.error("没有可入库的动态");
      return;
    }
    setVaultCrawling(true);
    try {
      const result = await bilibiliSaveSelectedDynamics({
        dynamics: targetDynamics,
      });
      setVaultResult(result);
      toast.success(
        "Bilibili 已写入情报库",
        withLocationSuffix(successLabel, result.output_dir, "vault", config),
      );
    } catch (err) {
      toast.error("入库失败", err instanceof Error ? err.message : "未知错误");
    } finally {
      setVaultCrawling(false);
    }
  };

  const handleSaveSelectedDynamics = async () => {
    const selectedDynamics = displayedDynamics.filter((dynamic) => selectedDynamicIds.has(dynamic.id));
    if (selectedDynamics.length === 0) {
      toast.error("请先选择要入库的动态");
      return;
    }
    await saveDynamicsToVault(selectedDynamics, `已入库 ${selectedDynamics.length} 条已选动态`);
  };

  const handleSaveAllDisplayedDynamics = async () => {
    if (displayedDynamics.length === 0) {
      toast.error("当前没有可入库的动态");
      return;
    }
    await saveDynamicsToVault(displayedDynamics, `已一键入库当前结果 ${displayedDynamics.length} 条`);
  };

  const handleSaveSingleDynamic = async (dynamic: BiliDynamic) => {
    await saveDynamicsToVault([dynamic], `已入库 1 条动态：${dynamic.title || dynamic.author}`);
  };

  const handleOpenDynamicSource = async (dynamic: BiliDynamic) => {
    const targetUrl = resolveDynamicSourceUrl(dynamic);
    if (!targetUrl) {
      toast.info("这条动态暂时没有可跳转的原文链接");
      return;
    }
    try {
      await openUrl(targetUrl);
    } catch (err) {
      try {
        window.open(targetUrl, "_blank", "noopener,noreferrer");
        return;
      } catch {
        // fall through
      }
      toast.error("打开原文失败", err instanceof Error ? err.message : "未知错误");
    }
  };

  const displayedSelectedCount = displayedDynamics.reduce(
    (count, dynamic) => count + (selectedDynamicIds.has(dynamic.id) ? 1 : 0),
    0
  );

  function toggleDynamicSelection(dynamicId: string) {
    setSelectedDynamicIds((prev) => {
      const next = new Set(prev);
      if (next.has(dynamicId)) {
        next.delete(dynamicId);
      } else {
        next.add(dynamicId);
      }
      return next;
    });
  }

  function selectAllDisplayedDynamics() {
    setSelectedDynamicIds((prev) => {
      const next = new Set(prev);
      displayedDynamics.forEach((dynamic) => next.add(dynamic.id));
      return next;
    });
  }

  function clearDisplayedDynamicsSelection() {
    setSelectedDynamicIds((prev) => {
      const next = new Set(prev);
      displayedDynamics.forEach((dynamic) => next.delete(dynamic.id));
      return next;
    });
  }

  const switchPanel = (tab: BilibiliPanelTab) => {
    setPanelTab(tab);
    writeStringStorage("bilibili_tool_panel", tab);
  };

  const renderTabs = () => {
    const tabs = [
      { key: "dynamics" as const, label: "动态追踪", icon: Tv, accent: "#00AEEC", bg: "rgba(0, 174, 236, 0.12)" },
      { key: "favorites" as const, label: "收藏整理", icon: FolderHeart, accent: "#FB7299", bg: "rgba(251, 114, 153, 0.12)" },
      { key: "following" as const, label: "关注监控", icon: Users, accent: "#10B981", bg: "rgba(16, 185, 129, 0.12)" },
    ];

    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: "12px",
        }}
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = panelTab === tab.key;

          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => switchPanel(tab.key)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "14px 16px",
                borderRadius: "var(--radius-md)",
                border: `1px solid ${active ? tab.accent : "var(--border-light)"}`,
                background: active ? tab.bg : "var(--bg-card)",
                color: active ? tab.accent : "var(--text-main)",
                fontSize: "0.9375rem",
                fontWeight: 700,
                cursor: "pointer",
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
                  background: active ? tab.bg : "var(--bg-hover)",
                  color: active ? tab.accent : "var(--text-secondary)",
                  flexShrink: 0,
                }}
              >
                <Icon size={18} />
              </span>
              {tab.label}
            </button>
          );
        })}
      </div>
    );
  };

  const renderTargetedDynamicCrawlBody = () => (
    followedUpsLoading && followedUps.length === 0 ? (
      <div style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
        正在读取关注列表...
      </div>
    ) : followedUps.length === 0 ? (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.7 }}>
          先抓一次关注列表，这里才能按智能组或指定 UP 做每日动态范围调度。
        </div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => void handleLoadFollowedUps(false, true)}
            disabled={followedUpsLoading}
            style={{
              padding: "10px 14px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid rgba(14, 165, 233, 0.32)",
              background: "linear-gradient(135deg, #10B981, #00AEEC)",
              color: "white",
              fontSize: "0.8125rem",
              fontWeight: 800,
              cursor: followedUpsLoading ? "not-allowed" : "pointer",
              opacity: followedUpsLoading ? 0.7 : 1,
            }}
          >
            {followedUpsLoading ? "读取中..." : "先读取关注列表"}
          </button>
        </div>
      </div>
    ) : (
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.7 }}>
          这块只控制临时动态预览范围，不会改动固定监督和情报 Feed 配置。
          {!smartGroupsReady && " 还没执行“共享智能分组”时，会先按当前 B 站信息临时归类。"}
        </div>

        <div
          style={{
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-light)",
            background: "var(--bg-card)",
            overflow: "hidden",
          }}
        >
          <button
            type="button"
            onClick={() => setShowTargetedDynamicQuickSection((value) => !value)}
            style={{
              width: "100%",
              padding: "16px",
              border: "none",
              background: "transparent",
              display: "flex",
              justifyContent: "space-between",
              gap: "12px",
              alignItems: "flex-start",
              flexWrap: "wrap",
              textAlign: "left",
              cursor: "pointer",
            }}
          >
            <div>
              <div style={{ fontSize: "0.875rem", fontWeight: 800, color: "var(--text-main)" }}>快速当日爬取</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "4px", lineHeight: 1.6 }}>
                先统一最近多久时间、抓取条数和动态类型，再直接抓当前监督范围。
              </div>
            </div>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 10px",
                borderRadius: "999px",
                background: "rgba(16, 185, 129, 0.10)",
                color: "#0F9F6E",
                fontSize: "0.75rem",
                fontWeight: 800,
                whiteSpace: "nowrap",
              }}
            >
              {showTargetedDynamicQuickSection ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              当前监督 {trackedUpMembers.length} 个 UP
            </span>
          </button>

          {showTargetedDynamicQuickSection && (
            <div
              style={{
                padding: "0 16px 16px",
                borderTop: "1px solid var(--border-light)",
                display: "flex",
                flexDirection: "column",
                gap: "14px",
              }}
            >
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", paddingTop: "16px" }}>
                <button
                  type="button"
                  onClick={() => void handleFetchTrackedUpsDynamics()}
                  disabled={loading || trackedUpMembers.length === 0}
                  style={{
                    padding: "10px 14px",
                    borderRadius: "var(--radius-sm)",
                    border: "none",
                    background: loading || trackedUpMembers.length === 0
                      ? "var(--bg-muted)"
                      : "linear-gradient(135deg, #10B981, #00AEEC)",
                    color: "white",
                    fontSize: "0.8125rem",
                    fontWeight: 800,
                    cursor: loading || trackedUpMembers.length === 0 ? "not-allowed" : "pointer",
                  }}
                >
                  {loading ? "爬取中..." : `抓当前监督范围 · ${trackedUpMembers.length}`}
                </button>
                <button
                  type="button"
                  onClick={() => setShowDynamicResultList(true)}
                  disabled={!hasFetchedDynamics}
                  style={{
                    padding: "10px 14px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border-light)",
                    background: "var(--bg-card)",
                    color: hasFetchedDynamics ? "var(--text-secondary)" : "var(--text-muted)",
                    fontSize: "0.8125rem",
                    fontWeight: 700,
                    cursor: hasFetchedDynamics ? "pointer" : "not-allowed",
                  }}
                >
                  查看动态结果
                </button>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {selectedTrackedSmartGroups.slice(0, 8).map((group) => (
                  <span
                    key={`daily-track-${group.value}`}
                    style={{
                      padding: "6px 10px",
                      borderRadius: "999px",
                      background: group.meta.bg,
                      color: group.meta.accent,
                      fontSize: "0.75rem",
                      fontWeight: 800,
                    }}
                  >
                    {group.label} · {group.members.length}
                  </span>
                ))}
                {manualPoolMembers.length > 0 && (
                  <span
                    style={{
                      padding: "6px 10px",
                      borderRadius: "999px",
                      background: "rgba(0, 174, 236, 0.08)",
                      color: "#078FBF",
                      fontSize: "0.75rem",
                      fontWeight: 800,
                    }}
                  >
                    固定监督 · {manualPoolMembers.length}
                  </span>
                )}
                {monitorCategoryCount === 0 && (
                  <span
                    style={{
                      padding: "6px 10px",
                      borderRadius: "999px",
                      background: "var(--bg-card)",
                      color: "var(--text-muted)",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                    }}
                  >
                    先选智能组或固定监督 UP，临时抓取范围才会出现
                  </span>
                )}
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                  gap: "16px",
                  alignItems: "start",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div style={{ fontSize: "0.8125rem", fontWeight: 800, color: "var(--text-main)" }}>最近多久时间</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {TIME_RANGE_OPTIONS.map((opt) => (
                      <button
                        key={`targeted-time-${opt.value}`}
                        type="button"
                        onClick={() => {
                          setDaysBack(opt.value);
                          setDaysBackInput(String(opt.value));
                        }}
                        style={{
                          padding: "8px 12px",
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid",
                          borderColor: daysBack === opt.value ? "var(--color-primary)" : "var(--border-light)",
                          background: daysBack === opt.value ? "rgba(188, 164, 227, 0.15)" : "var(--bg-hover)",
                          color: daysBack === opt.value ? "var(--color-primary)" : "var(--text-secondary)",
                          fontSize: "0.8125rem",
                          fontWeight: daysBack === opt.value ? 700 : 500,
                          cursor: "pointer",
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                    <input
                      type="number"
                      min={1}
                      value={daysBackInput}
                      onChange={(e) => setDaysBackInput(e.target.value)}
                      onBlur={() => normalizePositiveInput(daysBackInput, daysBack, setDaysBack, setDaysBackInput)}
                      placeholder="自定义天数"
                      style={{
                        width: "110px",
                        padding: "8px 10px",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border-light)",
                        background: "var(--bg-input)",
                        color: "var(--text-main)",
                        fontSize: "0.8125rem",
                      }}
                    />
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>天内</span>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div style={{ fontSize: "0.8125rem", fontWeight: 800, color: "var(--text-main)" }}>过滤后最多保留</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {LIMIT_OPTIONS.map((opt) => (
                      <button
                        key={`targeted-limit-${opt}`}
                        type="button"
                        onClick={() => {
                          setLimit(opt);
                          setLimitInput(String(opt));
                        }}
                        style={{
                          minWidth: "88px",
                          padding: "8px 12px",
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid",
                          borderColor: limit === opt ? "var(--color-primary)" : "var(--border-light)",
                          background: limit === opt ? "rgba(188, 164, 227, 0.15)" : "var(--bg-hover)",
                          color: limit === opt ? "var(--color-primary)" : "var(--text-secondary)",
                          fontSize: "0.8125rem",
                          fontWeight: limit === opt ? 700 : 500,
                          cursor: "pointer",
                        }}
                      >
                        {opt} 条
                      </button>
                    ))}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                    <input
                      type="number"
                      min={1}
                      max={MAX_DYNAMIC_KEEP_LIMIT}
                      value={limitInput}
                      onChange={(e) => setLimitInput(e.target.value)}
                      onBlur={() => normalizePositiveInput(limitInput, limit, setLimit, setLimitInput, MAX_DYNAMIC_KEEP_LIMIT)}
                      placeholder={`1-${MAX_DYNAMIC_KEEP_LIMIT}`}
                      style={{
                        width: "110px",
                        padding: "8px 10px",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border-light)",
                        background: "var(--bg-input)",
                        color: "var(--text-main)",
                        fontSize: "0.8125rem",
                      }}
                    />
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>条</span>
                  </div>
                  <div style={{ fontSize: "0.74rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
                    系统可能会扫描更多动态；这里控制的是过滤完成后最终保留多少条，上限 {MAX_DYNAMIC_KEEP_LIMIT}。
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ fontSize: "0.8125rem", fontWeight: 800, color: "var(--text-main)" }}>动态类型</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {Object.entries(DYNAMIC_TYPE_MAP).map(([type, config]) => {
                    const Icon = config.icon;
                    const selected = selectedTypes.includes(type);
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => toggleType(type)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          padding: "8px 12px",
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid",
                          borderColor: selected ? config.color : "var(--border-light)",
                          background: selected ? `${config.color}15` : "var(--bg-card)",
                          color: selected ? config.color : "var(--text-secondary)",
                          fontSize: "0.8125rem",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        <Icon size={14} />
                        {config.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        <div
          style={{
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-light)",
            background: "var(--bg-card)",
            overflow: "hidden",
          }}
        >
          <button
            type="button"
            onClick={() => setShowTargetedDynamicGroupSection((value) => !value)}
            style={{
              width: "100%",
              padding: "16px",
              border: "none",
              background: "transparent",
              display: "flex",
              justifyContent: "space-between",
              gap: "12px",
              alignItems: "flex-start",
              flexWrap: "wrap",
              textAlign: "left",
              cursor: "pointer",
            }}
          >
            <div>
              <div style={{ fontSize: "0.875rem", fontWeight: 800, color: "var(--text-main)" }}>自选分组爬取</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "4px", lineHeight: 1.6 }}>
                分组按钮固定在名单上方。可以跨智能组连续勾选，切组不会清空已选 UP。
              </div>
            </div>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 10px",
                borderRadius: "999px",
                background: `${targetedDynamicGroupMeta.accent}14`,
                color: targetedDynamicGroupMeta.accent,
                fontSize: "0.75rem",
                fontWeight: 800,
                whiteSpace: "nowrap",
              }}
            >
              {showTargetedDynamicGroupSection ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              当前 {targetedDynamicGroupLabel}
            </span>
          </button>

          {showTargetedDynamicGroupSection && (
            <div
              style={{
                padding: "0 16px 16px",
                borderTop: "1px solid var(--border-light)",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
              }}
            >
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.6, paddingTop: "16px" }}>
                当前每页显示 12 个 UP。整组抓取不受上方关键词影响；如果这里输入了 UP 搜索词，就只抓当前搜索命中的名单。
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "14px",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div style={{ fontSize: "0.8125rem", fontWeight: 800, color: "var(--text-main)" }}>这组最近多久时间</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {TIME_RANGE_OPTIONS.map((opt) => (
                      <button
                        key={`targeted-group-time-${opt.value}`}
                        type="button"
                        onClick={() => {
                          setTargetedGroupDaysBack(opt.value);
                          setTargetedGroupDaysBackInput(String(opt.value));
                        }}
                        style={{
                          padding: "8px 12px",
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid",
                          borderColor: targetedGroupDaysBack === opt.value ? targetedDynamicGroupMeta.accent : "var(--border-light)",
                          background: targetedGroupDaysBack === opt.value ? targetedDynamicGroupMeta.bg : "var(--bg-hover)",
                          color: targetedGroupDaysBack === opt.value ? targetedDynamicGroupMeta.accent : "var(--text-secondary)",
                          fontSize: "0.8125rem",
                          fontWeight: targetedGroupDaysBack === opt.value ? 700 : 500,
                          cursor: "pointer",
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                    <input
                      type="number"
                      min={1}
                      value={targetedGroupDaysBackInput}
                      onChange={(e) => setTargetedGroupDaysBackInput(e.target.value)}
                      onBlur={() => normalizePositiveInput(
                        targetedGroupDaysBackInput,
                        targetedGroupDaysBack,
                        setTargetedGroupDaysBack,
                        setTargetedGroupDaysBackInput,
                        365,
                      )}
                      placeholder="自定义天数"
                      style={{
                        width: "110px",
                        padding: "8px 10px",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border-light)",
                        background: "var(--bg-input)",
                        color: "var(--text-main)",
                        fontSize: "0.8125rem",
                      }}
                    />
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>天内</span>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div style={{ fontSize: "0.8125rem", fontWeight: 800, color: "var(--text-main)" }}>这组前端最多展示</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {LIMIT_OPTIONS.map((opt) => (
                      <button
                        key={`targeted-group-limit-${opt}`}
                        type="button"
                        onClick={() => {
                          setTargetedGroupLimit(opt);
                          setTargetedGroupLimitInput(String(opt));
                        }}
                        style={{
                          minWidth: "88px",
                          padding: "8px 12px",
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid",
                          borderColor: targetedGroupLimit === opt ? targetedDynamicGroupMeta.accent : "var(--border-light)",
                          background: targetedGroupLimit === opt ? targetedDynamicGroupMeta.bg : "var(--bg-hover)",
                          color: targetedGroupLimit === opt ? targetedDynamicGroupMeta.accent : "var(--text-secondary)",
                          fontSize: "0.8125rem",
                          fontWeight: targetedGroupLimit === opt ? 700 : 500,
                          cursor: "pointer",
                        }}
                      >
                        {opt} 条
                      </button>
                    ))}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                    <input
                      type="number"
                      min={1}
                      max={MAX_DYNAMIC_KEEP_LIMIT}
                      value={targetedGroupLimitInput}
                      onChange={(e) => setTargetedGroupLimitInput(e.target.value)}
                      onBlur={() => normalizePositiveInput(
                        targetedGroupLimitInput,
                        targetedGroupLimit,
                        setTargetedGroupLimit,
                        setTargetedGroupLimitInput,
                        MAX_DYNAMIC_KEEP_LIMIT,
                      )}
                      placeholder={`1-${MAX_DYNAMIC_KEEP_LIMIT}`}
                      style={{
                        width: "110px",
                        padding: "8px 10px",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border-light)",
                        background: "var(--bg-input)",
                        color: "var(--text-main)",
                        fontSize: "0.8125rem",
                      }}
                    />
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>条</span>
                  </div>
                  <div style={{ fontSize: "0.74rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
                    指定分组会先按作者空间默认扫 3 页，再把符合条件的结果按时间排序，前端最多展示这里设定的条数。
                  </div>
                </div>
              </div>

              {smartGroupOptions.length > TARGETED_DYNAMIC_GROUPS_PAGE_SIZE && (
                <PaginationControls
                  totalCount={smartGroupOptions.length}
                  page={safeTargetedDynamicGroupPage}
                  pageSize={TARGETED_DYNAMIC_GROUPS_PAGE_SIZE}
                  itemLabel="个分组"
                  onPageChange={setTargetedDynamicGroupPage}
                  emptyText="当前没有可选智能组"
                />
              )}

              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                <button
                  type="button"
                  onClick={() => setTargetedDynamicGroup("all")}
                  style={{
                    padding: "8px 12px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid",
                    borderColor: targetedDynamicGroup === "all" ? "#0EA5E9" : "var(--border-light)",
                    background: targetedDynamicGroup === "all" ? "rgba(14, 165, 233, 0.10)" : "var(--bg-card)",
                    color: targetedDynamicGroup === "all" ? "#0284C7" : "var(--text-secondary)",
                    fontSize: "0.8125rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  全部智能组 · {followedUps.length}
                </button>
                {pagedTargetedDynamicGroups.map((group) => {
                  const active = targetedDynamicGroup === group.value;
                  const meta = resolveSmartGroupMeta(group.value, group.label);
                  return (
                    <button
                      key={group.value}
                      type="button"
                      onClick={() => setTargetedDynamicGroup(group.value)}
                      style={{
                        padding: "8px 12px",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid",
                        borderColor: active ? meta.accent : "var(--border-light)",
                        background: active ? meta.bg : "var(--bg-card)",
                        color: active ? meta.accent : "var(--text-secondary)",
                        fontSize: "0.8125rem",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      {group.label} {groupCounts[group.value] ? `· ${groupCounts[group.value]}` : ""}
                    </button>
                  );
                })}
              </div>

              <input
                type="text"
                value={targetedDynamicUpSearch}
                onChange={(e) => setTargetedDynamicUpSearch(e.target.value)}
                placeholder={`在 ${targetedDynamicGroupLabel} 里搜 UP 名 / 简介`}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-light)",
                  background: "var(--bg-input)",
                  color: "var(--text-main)",
                  fontSize: "0.875rem",
                }}
              />

              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: "var(--radius-sm)",
                  border: `1px solid ${targetedDynamicGroupMeta.accent}33`,
                  background: targetedDynamicGroupMeta.bg,
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "10px",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                  <span style={{ color: targetedDynamicGroupMeta.accent, fontWeight: 800 }}>当前范围 {targetedDynamicGroupLabel}</span>
                  <span>范围内 {targetedDynamicGroupMembers.length} 个 UP</span>
                  <span>搜索命中 {targetedDynamicCandidates.length} 个</span>
                  <span>本次整组抓取 {targetedDynamicFetchMembers.length} 个</span>
                  <span>当前页已选 {targetedDynamicVisibleSelectedCount} 个</span>
                  <span>累计已选 {targetedDynamicSelectedUps.length} 个</span>
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={selectAllTargetedDynamicCandidates}
                    disabled={targetedDynamicCandidates.length === 0}
                    style={{
                      padding: "7px 10px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border-light)",
                      background: "var(--bg-card)",
                      color: targetedDynamicCandidates.length === 0 ? "var(--text-muted)" : "var(--text-secondary)",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      cursor: targetedDynamicCandidates.length === 0 ? "not-allowed" : "pointer",
                    }}
                  >
                    全选当前名单
                  </button>
                  <button
                    type="button"
                    onClick={clearTargetedDynamicSelection}
                    disabled={targetedDynamicUpIds.size === 0}
                    style={{
                      padding: "7px 10px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border-light)",
                      background: "var(--bg-card)",
                      color: targetedDynamicUpIds.size === 0 ? "var(--text-muted)" : "var(--text-secondary)",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      cursor: targetedDynamicUpIds.size === 0 ? "not-allowed" : "pointer",
                    }}
                  >
                    清空已选
                  </button>
                </div>
              </div>

              {targetedDynamicCandidates.length > 0 ? (
                <>
                  <PaginationControls
                    totalCount={targetedDynamicCandidates.length}
                    page={safeTargetedDynamicPage}
                    pageSize={TARGETED_DYNAMIC_RESULTS_PAGE_SIZE}
                    itemLabel="个 UP"
                    onPageChange={setTargetedDynamicPage}
                    emptyText="当前没有匹配的 UP"
                  />
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
                      gap: "10px",
                    }}
                  >
                    {pagedTargetedDynamicCandidates.map((up) => {
                      const selected = targetedDynamicUpIds.has(up.mid);
                      return (
                        <button
                          key={up.mid}
                          type="button"
                          onClick={() => toggleTargetedDynamicUp(up.mid)}
                          style={{
                            padding: "12px",
                            borderRadius: "var(--radius-sm)",
                            border: "1px solid",
                            borderColor: selected ? targetedDynamicGroupMeta.accent : "var(--border-light)",
                            background: selected ? targetedDynamicGroupMeta.bg : "var(--bg-hover)",
                            textAlign: "left",
                            display: "flex",
                            flexDirection: "column",
                            gap: "6px",
                            cursor: "pointer",
                            minHeight: "108px",
                          }}
                        >
                          <div style={{ fontSize: "0.875rem", fontWeight: 800, color: selected ? targetedDynamicGroupMeta.accent : "var(--text-main)" }}>
                            {up.uname}
                          </div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {(up.tag_names[0] || "未分组")} · {selected ? "已勾选" : "点击加入本次抓取"}
                          </div>
                          {(up.sign || up.official_desc) && (
                            <div
                              style={{
                                fontSize: "0.6875rem",
                                color: "var(--text-muted)",
                                lineHeight: 1.5,
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                              }}
                            >
                              {up.sign || up.official_desc}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <PaginationControls
                    totalCount={targetedDynamicCandidates.length}
                    page={safeTargetedDynamicPage}
                    pageSize={TARGETED_DYNAMIC_RESULTS_PAGE_SIZE}
                    itemLabel="个 UP"
                    onPageChange={setTargetedDynamicPage}
                    emptyText="当前没有匹配的 UP"
                  />
                </>
              ) : (
                <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                  {targetedDynamicGroupMembers.length > 0
                    ? "这个范围里没有匹配当前搜索词的 UP。"
                    : "当前范围里还没有可抓取的关注 UP。"}
                </div>
              )}

              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => void handleFetchTargetedGroupDynamics()}
                  disabled={loading || targetedDynamicFetchMembers.length === 0}
                  style={{
                    padding: "10px 14px",
                    borderRadius: "var(--radius-sm)",
                    border: "none",
                    background: loading || targetedDynamicFetchMembers.length === 0
                      ? "var(--bg-muted)"
                      : `linear-gradient(135deg, ${targetedDynamicGroupMeta.accent}, #10B981)`,
                    color: "white",
                    fontSize: "0.8125rem",
                    fontWeight: 800,
                    cursor: loading || targetedDynamicFetchMembers.length === 0 ? "not-allowed" : "pointer",
                  }}
                >
                  {loading
                    ? "爬取中..."
                    : targetedDynamicSearchActive
                      ? `抓当前筛选 ${targetedDynamicFetchMembers.length} 个 UP`
                      : targetedDynamicGroup === "all"
                        ? "抓当前全部 UP"
                        : `抓整个 ${targetedDynamicGroupLabel} 组`}
                </button>
                <button
                  type="button"
                  onClick={() => void handleFetchSelectedUpsDynamics()}
                  disabled={loading || targetedDynamicSelectedUps.length === 0}
                  style={{
                    padding: "10px 14px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border-light)",
                    background: loading || targetedDynamicSelectedUps.length === 0 ? "var(--bg-muted)" : "var(--bg-card)",
                    color: loading || targetedDynamicSelectedUps.length === 0 ? "var(--text-muted)" : "var(--text-secondary)",
                    fontSize: "0.8125rem",
                    fontWeight: 800,
                    cursor: loading || targetedDynamicSelectedUps.length === 0 ? "not-allowed" : "pointer",
                  }}
                >
                  只抓已选 {targetedDynamicSelectedUps.length} 个 UP
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  );

  const renderTargetedDynamicCrawlWorkbench = () => (
    <Card
      title="主动爬取 / 分组搜索"
      icon={<Search size={18} />}
      actions={(
        <span
          style={{
            padding: "5px 10px",
            borderRadius: "999px",
            background: "rgba(16, 185, 129, 0.12)",
            color: "#0F9F6E",
            fontSize: "0.75rem",
            fontWeight: 800,
            whiteSpace: "nowrap",
          }}
        >
          当前范围 {trackedUpMembers.length}
        </span>
      )}
    >
      <div
        style={{
          borderRadius: "var(--radius-sm)",
          border: "1px solid rgba(14, 165, 233, 0.18)",
          background: "linear-gradient(135deg, rgba(14, 165, 233, 0.09), rgba(16, 185, 129, 0.06))",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "14px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "0.9375rem", fontWeight: 800, color: "var(--text-main)" }}>主动爬取 / 分组搜索</div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "4px", lineHeight: 1.7, maxWidth: "760px" }}>
              这块单独处理临时动态抓取。上半部分直接抓当前监督范围，下半部分支持跨智能组勾选具体 UP 再抓。
            </div>
          </div>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 10px",
              borderRadius: "999px",
              border: "1px solid var(--border-light)",
              background: "rgba(255,255,255,0.74)",
              color: "var(--text-secondary)",
              fontSize: "0.75rem",
              fontWeight: 700,
              whiteSpace: "nowrap",
            }}
          >
            临时抓取工作台
          </span>
        </div>

        {renderTargetedDynamicCrawlBody()}
      </div>
    </Card>
  );

  const renderDailyGroupMonitorWorkbench = () => (
    <Card
      title="智能分组追踪"
      icon={<Users size={18} />}
      actions={(
        <span
          style={{
            padding: "5px 10px",
            borderRadius: "999px",
            background: "rgba(0, 174, 236, 0.10)",
            color: "#078FBF",
            fontSize: "0.75rem",
            fontWeight: 800,
            whiteSpace: "nowrap",
          }}
        >
          固定监督 {manualPoolMembers.length}
        </span>
      )}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <button
          type="button"
          onClick={() => setShowSmartGroupSourceDetail((value) => !value)}
          style={{
            width: "100%",
            padding: "14px 16px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-light)",
            background: "var(--bg-hover)",
            textAlign: "left",
            cursor: "pointer",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: "0.9375rem", fontWeight: 800, color: "var(--text-main)" }}>获取分组情况</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "4px", lineHeight: 1.6 }}>
                保留共享群标签库和智能分组的获取流程，这里只负责抓关注、整理标签库、查看当前分组情况。
              </div>
            </div>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 10px",
                borderRadius: "999px",
                border: "1px solid var(--border-light)",
                background: "rgba(255,255,255,0.74)",
                color: "var(--text-secondary)",
                fontSize: "0.75rem",
                fontWeight: 700,
                whiteSpace: "nowrap",
              }}
            >
              {showSmartGroupSourceDetail ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {showSmartGroupSourceDetail ? "收起" : "展开"}
            </span>
          </div>
        </button>

        {showSmartGroupSourceDetail && (
          <div
            style={{
              padding: "16px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-light)",
              background: "linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(14, 165, 233, 0.06))",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
            }}
          >
            <div
              style={{
                padding: "12px 14px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid rgba(236, 72, 153, 0.18)",
                background: "rgba(236, 72, 153, 0.06)",
                fontSize: "0.75rem",
                color: "var(--text-secondary)",
                lineHeight: 1.7,
              }}
            >
              <strong style={{ color: "var(--text-main)" }}>原始标签 -&gt; 共享规则 -&gt; 共享组 -&gt; 作者入组</strong>
              。即博主 / UP 会根据其样本笔记标签的分组情况加入对应共享组；这里保留的是共享标签库和分组结果，不再直接从这里配置监控。
            </div>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => void handleLoadFollowedUps(false, true)}
                disabled={followedUpsLoading}
                style={{
                  padding: "10px 14px",
                  borderRadius: "8px",
                  border: "1px solid rgba(16, 185, 129, 0.42)",
                  background: "linear-gradient(135deg, #10B981, #00AEEC)",
                  color: "white",
                  fontSize: "0.8125rem",
                  fontWeight: 800,
                  cursor: followedUpsLoading ? "not-allowed" : "pointer",
                  opacity: followedUpsLoading ? 0.62 : 1,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <Users size={14} />
                {followedUpsLoading ? "爬取中..." : "爬取关注列表"}
              </button>
              <SmartGroupActionButton
                onClick={() => void handleBuildSmartGroups()}
                running={smartGroupRunning}
                secondaryLabel="仅整理博主 / UP"
                onSecondaryClick={() => void handleRefreshSharedCreatorAssignments()}
              />
            </div>

            {sharedTagIndexPath && (
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
                共享标签库已写入情报库：{sharedTagIndexPath}
              </div>
            )}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "12px",
              }}
            >
              {[
                { label: "关注列表", value: followedUps.length, detail: followedUpsLoaded ? "已抓到关注 UP" : "等待抓取" },
                { label: "智能分组", value: fixedUpImportGroups.length, detail: "当前可用分组" },
                { label: "作者画像", value: Object.keys(trackerConfig.creator_profiles || {}).length, detail: "已生成分组画像" },
                { label: "固定监督", value: manualPoolMembers.length, detail: "下方可批量导入" },
              ].map((metric) => (
                <div
                  key={metric.label}
                  style={{
                    padding: "12px 14px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border-light)",
                    background: "var(--bg-card)",
                  }}
                >
                  <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--text-main)" }}>{metric.value}</div>
                  <div style={{ marginTop: "4px", fontSize: "0.75rem", color: "var(--text-secondary)" }}>{metric.label}</div>
                  <div style={{ marginTop: "2px", fontSize: "0.6875rem", color: "var(--text-muted)" }}>{metric.detail}</div>
                </div>
              ))}
            </div>

            {fixedUpImportGroups.length > 0 ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "12px",
                }}
              >
                {fixedUpImportGroups.slice(0, 8).map((group) => (
                  <div
                    key={`smart-group-overview-${group.value}`}
                    style={{
                      padding: "14px",
                      borderRadius: "var(--radius-sm)",
                      border: `1px solid ${group.meta.accent}22`,
                      background: "var(--bg-card)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px",
                    }}
                  >
                    <div style={{ fontSize: "0.875rem", fontWeight: 800, color: group.meta.accent }}>
                      {group.label}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                      {group.members.length} 个 UP
                    </div>
                    {group.sampleAuthors.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {group.sampleAuthors.map((author) => (
                          <span
                            key={`smart-group-overview-author-${group.value}-${author}`}
                            style={{
                              padding: "3px 8px",
                              borderRadius: "999px",
                              background: "rgba(255,255,255,0.72)",
                              color: "var(--text-main)",
                              fontSize: "0.6875rem",
                              fontWeight: 700,
                            }}
                          >
                            {author}
                          </span>
                        ))}
                      </div>
                    )}
                    {group.sampleTags.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {group.sampleTags.slice(0, 4).map((tag) => (
                          <span
                            key={`smart-group-overview-tag-${group.value}-${tag}`}
                            style={{
                              padding: "3px 8px",
                              borderRadius: "999px",
                              background: "var(--bg-hover)",
                              color: "var(--text-muted)",
                              fontSize: "0.6875rem",
                            }}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.7 }}>
                还没有智能分组结果。先执行一次“共享智能分组”，这里才会看到当前分组情况。
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => setShowFixedUpTrackingDetail((value) => !value)}
          style={{
            width: "100%",
            padding: "14px 16px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-light)",
            background: "var(--bg-hover)",
            textAlign: "left",
            cursor: "pointer",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: "0.9375rem", fontWeight: 800, color: "var(--text-main)" }}>固定 UP 监督</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "4px", lineHeight: 1.6 }}>
                这里统一做固定 UP 的长期监督和批量导入。所有真正参与情报 Feed 和每日动态抓取的范围，都从这里进入。
              </div>
            </div>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 10px",
                borderRadius: "999px",
                border: "1px solid var(--border-light)",
                background: "rgba(255,255,255,0.74)",
                color: "var(--text-secondary)",
                fontSize: "0.75rem",
                fontWeight: 700,
                whiteSpace: "nowrap",
              }}
            >
              {showFixedUpTrackingDetail ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {showFixedUpTrackingDetail ? "收起" : "展开"}
            </span>
          </div>
        </button>

        {showFixedUpTrackingDetail && (
          <div
            style={{
              padding: "16px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-light)",
              background: "rgba(0, 174, 236, 0.05)",
            }}
          >
            {renderFixedUpMonitorWorkbench()}
          </div>
        )}
      </div>
    </Card>
  );

  const renderFixedUpMonitorWorkbench = () => (
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.7 }}>
          这里管理真正参与长期监督的固定 UP。智能分组只负责上面那层获取和导入入口，真正进入每日动态和情报 Feed 的范围，都以这里保存的名单为准。
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "10px",
          }}
        >
          {[
            { label: "固定监督", value: manualPoolMembers.length, detail: "手动指定的 UP" },
            { label: "命中智能组", value: selectedTrackedSmartGroups.length, detail: "这些固定 UP 落入的分组" },
            { label: "总监督范围", value: trackedUpMembers.length, detail: "最终会参与每日动态" },
          ].map((metric) => (
            <div
              key={metric.label}
              style={{
                padding: "12px 14px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border-light)",
                background: "var(--bg-hover)",
              }}
            >
              <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--text-main)" }}>{metric.value}</div>
              <div style={{ marginTop: "4px", fontSize: "0.75rem", color: "var(--text-secondary)" }}>{metric.label}</div>
              <div style={{ marginTop: "2px", fontSize: "0.6875rem", color: "var(--text-muted)" }}>{metric.detail}</div>
            </div>
          ))}
        </div>

        <div
          style={{
            padding: "12px 14px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-light)",
            background: "var(--bg-hover)",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: "0.875rem", fontWeight: 800, color: "var(--text-main)" }}>已保存的固定监督 UP</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "4px", lineHeight: 1.6 }}>
                这部分只放你明确想长期盯住的具体 UP；一旦加入，就会持续参与每日抓取。
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {manualPoolMembers.length > 0 && (
                <button
                  type="button"
                  onClick={() => void handleClearManualMonitoredUps()}
                  style={{
                    padding: "7px 10px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid rgba(239, 68, 68, 0.24)",
                    background: "rgba(239, 68, 68, 0.08)",
                    color: "#DC2626",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  清空全部
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowFixedUpMonitorSavedList((value) => !value)}
                style={{
                  padding: "7px 10px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-light)",
                  background: "var(--bg-card)",
                  color: "var(--text-secondary)",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {showFixedUpMonitorSavedList ? "隐藏列表" : "展开列表"}
              </button>
            </div>
          </div>

          {manualPoolMembers.length === 0 ? (
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.7 }}>
              还没有固定监督的 UP。直接从下面的智能标签 / 智能分组里展开成员，或者在更下方的明细筛选里逐个补充。
            </div>
          ) : showFixedUpMonitorSavedList ? (
            <>
              <PaginationControls
                totalCount={manualPoolMembers.length}
                page={safeFixedUpSavedPage}
                pageSize={fixedUpSavedPageSize}
                itemLabel="个 UP"
                pageSizeOptions={PAGINATION_SIZE_OPTIONS}
                onPageChange={setFixedUpSavedPage}
                onPageSizeChange={(nextPageSize) => setFixedUpSavedPageSize(nextPageSize === 50 ? 50 : 20)}
                emptyText="还没有固定监督的 UP"
              />
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "12px",
                }}
              >
                {pagedFixedUpSavedMembers.map((entry) => {
                  const up = entry.up;
                  const smartLabels = up ? getUpSmartGroups(up).map((groupValue) => getSmartGroupLabel(groupValue)).filter(Boolean) : [];
                  const originalLabels = up ? getUpOriginalGroupNames(up) : [];
                  return (
                    <div
                      key={`fixed-up-saved-${entry.id}`}
                      style={{
                        padding: "12px",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid rgba(0, 174, 236, 0.24)",
                        background: "rgba(0, 174, 236, 0.08)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "flex-start" }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: "0.875rem", fontWeight: 800, color: "#078FBF", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {up?.uname || entry.id}
                          </div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "4px", lineHeight: 1.6 }}>
                            {up ? "固定监督中" : "当前关注列表未命中，但配置仍保留"}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void toggleManualMonitoredUp(entry.id)}
                          style={{
                            padding: "6px 8px",
                            borderRadius: "var(--radius-sm)",
                            border: "1px solid var(--border-light)",
                            background: "var(--bg-card)",
                            color: "var(--text-secondary)",
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            cursor: "pointer",
                            flexShrink: 0,
                          }}
                        >
                          移除
                        </button>
                      </div>
                      {(up?.sign || up?.official_desc) && (
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                          {up.sign || up.official_desc}
                        </div>
                      )}
                      {(smartLabels.length > 0 || originalLabels.length > 0) && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                          {smartLabels.slice(0, 3).map((label) => (
                            <span
                              key={`fixed-smart-${entry.id}-${label}`}
                              style={{
                                padding: "3px 8px",
                                borderRadius: "999px",
                                background: "rgba(14, 165, 233, 0.10)",
                                color: "#0284C7",
                                fontSize: "0.6875rem",
                                fontWeight: 700,
                              }}
                            >
                              {label}
                            </span>
                          ))}
                          {originalLabels.slice(0, 2).map((label) => (
                            <span
                              key={`fixed-original-${entry.id}-${label}`}
                              style={{
                                padding: "3px 8px",
                                borderRadius: "999px",
                                background: "rgba(251, 114, 153, 0.10)",
                                color: "#D64078",
                                fontSize: "0.6875rem",
                                fontWeight: 700,
                              }}
                            >
                              {label}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <PaginationControls
                totalCount={manualPoolMembers.length}
                page={safeFixedUpSavedPage}
                pageSize={fixedUpSavedPageSize}
                itemLabel="个 UP"
                pageSizeOptions={PAGINATION_SIZE_OPTIONS}
                onPageChange={setFixedUpSavedPage}
                onPageSizeChange={(nextPageSize) => setFixedUpSavedPageSize(nextPageSize === 50 ? 50 : 20)}
                emptyText="还没有固定监督的 UP"
              />
            </>
          ) : null}
        </div>

        <div
          style={{
            padding: "12px 14px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-light)",
            background: "var(--bg-hover)",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          <button
            type="button"
            onClick={() => setShowFixedUpMonitorImportPanel((value) => !value)}
            style={{
              width: "100%",
              padding: 0,
              border: "none",
              background: "transparent",
              textAlign: "left",
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: "0.875rem", fontWeight: 800, color: "var(--text-main)" }}>从智能标签 / 智能分组快速加入</div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "4px", lineHeight: 1.6 }}>
                  参考小红书那边的关注分组导入逻辑：先展开组，再整组导入未加入的 UP，或者在组内逐个挑人加入固定监督。
                </div>
              </div>
              <span
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
                  whiteSpace: "nowrap",
                }}
              >
                {showFixedUpMonitorImportPanel ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                {showFixedUpMonitorImportPanel ? "收起" : "展开"}
              </span>
            </div>
          </button>

          {showFixedUpMonitorImportPanel ? (
            fixedUpImportGroups.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.7 }}>
                  点击一个组展开成员；每个组都能单独整组导入，也能在组里逐个切换。固定监督支持跨智能组累计，不会因为你切组而丢失选择。分组列表按页显示，每页 10 个。
                </div>
                {fixedUpImportGroups.length > FIXED_UP_IMPORT_GROUPS_PAGE_SIZE && (
                  <PaginationControls
                    totalCount={fixedUpImportGroups.length}
                    page={safeFixedUpImportGroupPage}
                    pageSize={FIXED_UP_IMPORT_GROUPS_PAGE_SIZE}
                    itemLabel="个分组"
                    onPageChange={setFixedUpImportGroupPage}
                    emptyText="当前没有可导入的智能分组"
                  />
                )}
                {pagedFixedUpImportGroups.map((group) => {
                  const groupOpen = expandedFixedUpImportGroup === group.value;
                  const importableCount = group.members.filter((up) => !manualPoolIdSet.has(up.mid)).length;
                  return (
                    <div
                      key={`fixed-group-${group.value}`}
                      style={{
                        padding: "14px",
                        borderRadius: "var(--radius-sm)",
                        border: `1px solid ${group.meta.accent}22`,
                        background: groupOpen ? group.meta.bg : "var(--bg-card)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "12px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start", flexWrap: "wrap" }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                            <div style={{ fontSize: "0.875rem", fontWeight: 800, color: group.meta.accent }}>
                              {group.label}
                            </div>
                            <span
                              style={{
                                padding: "4px 8px",
                                borderRadius: "999px",
                                background: "rgba(255,255,255,0.72)",
                                color: "var(--text-secondary)",
                                fontSize: "0.6875rem",
                                fontWeight: 700,
                              }}
                            >
                              {group.members.length} 个 UP
                            </span>
                          </div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "4px", lineHeight: 1.6 }}>
                            已在固定监督里 {group.members.filter((up) => manualPoolIdSet.has(up.mid)).length} 个 · 还可新增 {importableCount} 个
                          </div>
                          {group.sampleTags.length > 0 && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
                              {group.sampleTags.slice(0, 5).map((tag) => (
                                <span
                                  key={`fixed-group-tag-${group.value}-${tag}`}
                                  style={{
                                    padding: "3px 8px",
                                    borderRadius: "999px",
                                    background: "rgba(255,255,255,0.72)",
                                    color: "var(--text-muted)",
                                    fontSize: "0.6875rem",
                                  }}
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                          <button
                            type="button"
                            onClick={() => {
                              setExpandedFixedUpImportGroup((value) => value === group.value ? "" : group.value);
                              setFixedUpImportSearch("");
                            }}
                            style={{
                              padding: "7px 10px",
                              borderRadius: "var(--radius-sm)",
                              border: "1px solid var(--border-light)",
                              background: "var(--bg-card)",
                              color: "var(--text-secondary)",
                              fontSize: "0.75rem",
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            {groupOpen ? "收起成员" : "展开成员"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleImportManualMonitorGroup(group.value)}
                            disabled={importableCount === 0}
                            style={{
                              padding: "7px 10px",
                              borderRadius: "var(--radius-sm)",
                              border: "none",
                              background: importableCount === 0 ? "var(--bg-muted)" : `linear-gradient(135deg, ${group.meta.accent}, #10B981)`,
                              color: importableCount === 0 ? "var(--text-muted)" : "white",
                              fontSize: "0.75rem",
                              fontWeight: 800,
                              cursor: importableCount === 0 ? "not-allowed" : "pointer",
                            }}
                          >
                            添加未加入 {importableCount}
                          </button>
                        </div>
                      </div>

                      {groupOpen && expandedFixedUpGroupBundle?.value === group.value && (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "12px",
                            paddingTop: "12px",
                            borderTop: `1px solid ${group.meta.accent}22`,
                          }}
                        >
                          <input
                            type="text"
                            value={fixedUpImportSearch}
                            onChange={(e) => setFixedUpImportSearch(e.target.value)}
                            placeholder={`在 ${group.label} 里搜索 UP 名 / 简介`}
                            style={{
                              width: "100%",
                              padding: "10px 12px",
                              borderRadius: "var(--radius-sm)",
                              border: "1px solid var(--border-light)",
                              background: "var(--bg-input)",
                              color: "var(--text-main)",
                              fontSize: "0.875rem",
                            }}
                          />

                          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                            <span>当前组 {expandedFixedUpGroupBundle.members.length} 个 UP</span>
                            <span>搜索命中 {expandedFixedUpImportMembers.length} 个</span>
                            <span>还可新增 {fixedUpImportableCount} 个</span>
                            <span>分页管理，每页 {fixedUpImportPageSize} 个</span>
                          </div>

                          {expandedFixedUpImportMembers.length > 0 ? (
                            <>
                              <PaginationControls
                                totalCount={expandedFixedUpImportMembers.length}
                                page={safeFixedUpImportPage}
                                pageSize={fixedUpImportPageSize}
                                itemLabel="个 UP"
                                pageSizeOptions={PAGINATION_SIZE_OPTIONS}
                                onPageChange={setFixedUpImportPage}
                                onPageSizeChange={(nextPageSize) => setFixedUpImportPageSize(nextPageSize === 50 ? 50 : 20)}
                                emptyText="当前没有匹配的 UP"
                              />
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                                  gap: "12px",
                                }}
                              >
                                {pagedFixedUpImportMembers.map((up) => {
                                  const selected = manualPoolIdSet.has(up.mid);
                                  const originalGroupNames = getUpOriginalGroupNames(up);
                                  return (
                                    <div
                                      key={`fixed-up-import-${group.value}-${up.mid}`}
                                      style={{
                                        padding: "12px",
                                        borderRadius: "var(--radius-sm)",
                                        border: "1px solid",
                                        borderColor: selected ? group.meta.accent : "var(--border-light)",
                                        background: selected ? "rgba(255,255,255,0.72)" : "var(--bg-hover)",
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: "8px",
                                      }}
                                    >
                                      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "flex-start" }}>
                                        <div style={{ minWidth: 0 }}>
                                          <div style={{ fontSize: "0.875rem", fontWeight: 800, color: selected ? group.meta.accent : "var(--text-main)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                            {up.uname}
                                          </div>
                                          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "4px", lineHeight: 1.6 }}>
                                            {selected ? "已加入固定监督" : "可加入固定监督"}
                                          </div>
                                        </div>
                                      </div>
                                      {(up.sign || up.official_desc) && (
                                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                                          {up.sign || up.official_desc}
                                        </div>
                                      )}
                                      {originalGroupNames.length > 0 && (
                                        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                                          {originalGroupNames.slice(0, 3).map((label) => (
                                            <span
                                              key={`fixed-up-import-original-${up.mid}-${label}`}
                                              style={{
                                                padding: "3px 8px",
                                                borderRadius: "999px",
                                                background: "rgba(251, 114, 153, 0.10)",
                                                color: "#D64078",
                                                fontSize: "0.6875rem",
                                                fontWeight: 700,
                                              }}
                                            >
                                              {label}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => void toggleManualMonitoredUp(up.mid)}
                                        style={{
                                          marginTop: "auto",
                                          padding: "8px 10px",
                                          borderRadius: "var(--radius-sm)",
                                          border: "1px solid var(--border-light)",
                                          background: selected ? group.meta.bg : "var(--bg-card)",
                                          color: selected ? group.meta.accent : "var(--text-secondary)",
                                          fontSize: "0.75rem",
                                          fontWeight: 700,
                                          cursor: "pointer",
                                        }}
                                      >
                                        {selected ? "移出固定监督" : "加入固定监督"}
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                              <PaginationControls
                                totalCount={expandedFixedUpImportMembers.length}
                                page={safeFixedUpImportPage}
                                pageSize={fixedUpImportPageSize}
                                itemLabel="个 UP"
                                pageSizeOptions={PAGINATION_SIZE_OPTIONS}
                                onPageChange={setFixedUpImportPage}
                                onPageSizeChange={(nextPageSize) => setFixedUpImportPageSize(nextPageSize === 50 ? 50 : 20)}
                                emptyText="当前没有匹配的 UP"
                              />
                            </>
                          ) : (
                            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                              这个智能组里没有匹配当前搜索词的 UP。
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.7 }}>
                  先执行一次共享智能分组，这里才会按标签展开具体成员，方便你快速导入固定监督。
                </div>
                {!smartGroupsReady && (
                  <button
                    type="button"
                    onClick={() => void handleRefreshSharedCreatorAssignments()}
                    style={{
                      alignSelf: "flex-start",
                      padding: "8px 12px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border-light)",
                      background: "var(--bg-card)",
                      color: "var(--text-secondary)",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    先生成智能分组
                  </button>
                )}
              </div>
            )
          ) : null}
        </div>
      </div>
  );

  const renderResultList = (emptyDescription: string) => {
    const fetchStats = dynamicFetchMeta.fetchStats;
    const matchedBeforeKeep = fetchStats?.matched_count_before_keep ?? totalFound;
    const keptCount = fetchStats?.kept_count ?? dynamics.length;
    const keepLimit = fetchStats?.keep_limit ?? dynamicFetchMeta.keepLimit ?? limit;
    const pagesScanned = fetchStats?.pages_scanned ?? 0;
    const scannedAuthorCount = fetchStats?.scanned_author_count ?? dynamicFetchMeta.authorCount ?? 0;
    const fetchDaysBack = dynamicFetchMeta.daysBack ?? daysBack;

    if (loading) {
      return <LoadingState message={followedDynamicsTask?.stage || "正在获取动态..."} />;
    }

    if (!hasFetchedDynamics) {
      return (
        <EmptyState
          icon={Tv}
          title="暂无动态"
          description={
            sessdata
              ? emptyDescription
              : "点击右上角连接 Cookie，或直接预览，系统会自动尝试获取 Cookie"
          }
        />
      );
    }

    if (dynamics.length === 0) {
      return (
        <EmptyState
          icon={Tv}
          title="暂无动态"
          description={`${dynamicFetchMeta.label} 最近 ${fetchDaysBack} 天还没有抓到匹配动态。`}
        />
      );
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            background: "var(--bg-card)",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-light)",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
              共命中 <strong style={{ color: "var(--text-main)" }}>{matchedBeforeKeep}</strong> 条动态，
              当前保留 <strong style={{ color: "var(--text-main)" }}>{keptCount}</strong> 条，
              当前筛选 <strong style={{ color: "var(--text-main)" }}>{displayedDynamics.length}</strong> 条，
              本页显示 <strong style={{ color: "var(--text-main)" }}>{pagedDisplayedDynamics.length}</strong> 条，
              抓取范围 <strong style={{ color: "var(--text-main)" }}>{dynamicFetchMeta.label}</strong>
            </span>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
              实际扫了 <strong style={{ color: "var(--text-main)" }}>{pagesScanned}</strong> 页
              {scannedAuthorCount > 0 ? ` / ${scannedAuthorCount} 个UP` : ""}
              ，命中了 <strong style={{ color: "var(--text-main)" }}>{matchedBeforeKeep}</strong> 条，
              现在只展示前 <strong style={{ color: "var(--text-main)" }}>{keepLimit}</strong> 条。
            </span>
          </div>
          <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
            最近 {fetchDaysBack} 天
          </span>
        </div>

        {displayedDynamics.length === 0 ? (
          <EmptyState
            icon={Filter}
            title={dynamicFetchMeta.scope === "global" ? "这个分组里没有匹配推送" : "当前范围里没有匹配动态"}
            description={
              dynamicFetchMeta.scope === "global"
                ? "换一个分组、清空 UP 选择，或者调整推送关键词。"
                : "放宽最近几天、切换分组，或者清空 UP 搜索后再试。"
            }
          />
        ) : (
          <>
            <PaginationControls
              totalCount={displayedDynamics.length}
              page={safeDynamicResultsPage}
              pageSize={DYNAMIC_RESULTS_PAGE_SIZE}
              itemLabel="条动态"
              onPageChange={setDynamicResultsPage}
              emptyText="当前没有匹配的动态"
            />
            <Card
              style={{
                border: "1px solid var(--border-light)",
                background: "var(--bg-card)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <div style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-main)" }}>
                    支持逐条入库，也能一键入库
                  </div>
                  <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                    当前筛选 {displayedDynamics.length} 条，本页 {pagedDisplayedDynamics.length} 条，已选 {displayedSelectedCount} 条写入情报库
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={selectAllDisplayedDynamics}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border-light)",
                      background: "var(--bg-hover)",
                      color: "var(--text-secondary)",
                      fontSize: "0.8125rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    全选当前筛选
                  </button>
                  <button
                    type="button"
                    onClick={clearDisplayedDynamicsSelection}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border-light)",
                      background: "var(--bg-hover)",
                      color: "var(--text-secondary)",
                      fontSize: "0.8125rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    清空选择
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveSelectedDynamics}
                    disabled={vaultCrawling || displayedSelectedCount === 0}
                    style={{
                      padding: "10px 14px",
                      borderRadius: "var(--radius-sm)",
                      border: "none",
                      background: vaultCrawling || displayedSelectedCount === 0
                        ? "var(--bg-muted)"
                        : "linear-gradient(135deg, #00AEEC, #52C41A)",
                      color: "white",
                      fontSize: "0.875rem",
                      fontWeight: 700,
                      cursor: vaultCrawling || displayedSelectedCount === 0 ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <CheckCircle size={16} />
                    {vaultCrawling ? "入库中..." : `写入已选 ${displayedSelectedCount} 条`}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveAllDisplayedDynamics}
                    disabled={vaultCrawling || displayedDynamics.length === 0}
                    style={{
                      padding: "10px 14px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid rgba(16, 185, 129, 0.24)",
                      background: vaultCrawling || displayedDynamics.length === 0
                        ? "var(--bg-muted)"
                        : "rgba(16, 185, 129, 0.12)",
                      color: vaultCrawling || displayedDynamics.length === 0 ? "var(--text-muted)" : "#0F9F6E",
                      fontSize: "0.875rem",
                      fontWeight: 800,
                      cursor: vaultCrawling || displayedDynamics.length === 0 ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <FolderHeart size={16} />
                    {vaultCrawling ? "入库中..." : `一键入库当前结果 ${displayedDynamics.length} 条`}
                  </button>
                </div>
              </div>
            </Card>

            {pagedDisplayedDynamics.map((dynamic) => {
              const selected = selectedDynamicIds.has(dynamic.id);
              const sourceUrl = resolveDynamicSourceUrl(dynamic);
              const groupValue = dynamic.author_id ? followedGroupByAuthorId[dynamic.author_id] : "";
              const groupLabel = groupValue ? getSmartGroupLabel(groupValue) : "";
              const groupMeta = groupValue ? resolveSmartGroupMeta(groupValue, groupLabel) : null;

              return (
                <div
                  key={dynamic.id}
                  role="checkbox"
                  aria-checked={selected}
                  tabIndex={0}
                  onClick={() => toggleDynamicSelection(dynamic.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      toggleDynamicSelection(dynamic.id);
                    }
                  }}
                  style={{
                    cursor: "pointer",
                    borderRadius: "var(--radius-md)",
                  }}
                >
                  <BilibiliDynamicCard
                    dynamic={dynamic}
                    selected={selected}
                    onToggleSelect={toggleDynamicSelection}
                    onOpenSource={() => handleOpenDynamicSource(dynamic)}
                    sourceDisabled={!sourceUrl}
                    primaryAction={{
                      label: "立即入库",
                      onClick: () => handleSaveSingleDynamic(dynamic),
                      disabled: vaultCrawling,
                      pending: vaultCrawling,
                      pendingLabel: "入库中...",
                      primary: true,
                      icon: <FolderHeart size={14} />,
                    }}
                    secondaryAction={{
                      label: "原文",
                      onClick: () => handleOpenDynamicSource(dynamic),
                      disabled: !sourceUrl,
                      icon: <ExternalLink size={14} />,
                    }}
                    authorGroupLabel={groupLabel}
                    authorGroupAccent={groupMeta?.accent}
                  />
                </div>
              );
            })}
            <PaginationControls
              totalCount={displayedDynamics.length}
              page={safeDynamicResultsPage}
              pageSize={DYNAMIC_RESULTS_PAGE_SIZE}
              itemLabel="条动态"
              onPageChange={setDynamicResultsPage}
              emptyText="当前没有匹配的动态"
            />
          </>
        )}
      </div>
    );
  };

  return (
    <PageContainer>
      <BilibiliCookieModal
        open={showCookieModal}
        canClose={cookieConfigured || Boolean(sessdata.trim())}
        onClose={() => setShowCookieModal(false)}
        gettingFromBrowser={gettingFromBrowser}
        onFetchFromBrowser={handleGetFromBrowser}
        cookiePreview={cookiePreview}
        cookieInput={cookieInput}
        showFullCookie={showFullCookie}
        onToggleFullCookie={() => setShowFullCookie((visible) => !visible)}
      />
      <PageHeader
        title="哔哩哔哩工具"
        subtitle="一键连接 Cookie，按全关注流、智能分组或指定 UP 预览动态，再选择写入情报库"
        icon={Tv}
        actions={
          <button
            type="button"
            onClick={() => setShowCookieModal(true)}
            style={{
              padding: "10px 12px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-light)",
              background: cookieConfigured ? "transparent" : "rgba(239, 68, 68, 0.08)",
              color: cookieConfigured ? "var(--text-secondary)" : "var(--color-danger)",
              fontSize: "0.875rem",
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <Cookie size={16} />
            {cookieConfigured ? "Cookie 配置" : "配置 Cookie"}
          </button>
        }
      />
      <PageContent>
        <div style={{ display: "flex", flexDirection: "column", gap: "24px", height: "100%" }}>
          {renderTabs()}

          {/* Top controls */}
          {panelTab === "dynamics" && <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {renderTargetedDynamicCrawlWorkbench()}

            <Card title="全关注流动态追踪" icon={<Hash size={18} />}>
              <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.7 }}>
                  这里统一处理全关注流的临时搜索和预览。一个词会同时按正文关键词和动态标签两路命中，所以不再拆成两套输入。
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                    gap: "16px",
                    alignItems: "start",
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-main)" }}>词 / 标签</div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <input
                        type="text"
                        value={keywordInput}
                        onChange={(e) => setKeywordInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (isActionEnterKey(e)) {
                            e.preventDefault();
                            handleAddKeyword();
                          }
                        }}
                        placeholder="输入关键词、标签或话题词，一个输入框直接兼容"
                        style={{
                          flex: 1,
                          padding: "10px 12px",
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid var(--border-light)",
                          background: "var(--bg-input)",
                          color: "var(--text-main)",
                          fontSize: "0.875rem",
                        }}
                      />
                      <button
                        onClick={handleAddKeyword}
                        disabled={parseStringListInput(keywordInput).length === 0}
                        style={{
                          padding: "10px 14px",
                          borderRadius: "var(--radius-sm)",
                          border: "none",
                          background: "var(--color-secondary)",
                          color: "white",
                          cursor: parseStringListInput(keywordInput).length > 0 ? "pointer" : "not-allowed",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Plus size={18} />
                      </button>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                      {PRESET_KEYWORDS.map((kw) => (
                        <button
                          key={kw}
                          onClick={() => handleAddPresetKeyword(kw)}
                          disabled={dynamicSearchTerms.includes(kw)}
                          style={{
                            padding: "4px 10px",
                            borderRadius: "9999px",
                            border: "1px solid var(--border-light)",
                            background: dynamicSearchTerms.includes(kw) ? "var(--bg-muted)" : "var(--bg-hover)",
                            color: dynamicSearchTerms.includes(kw) ? "var(--text-muted)" : "var(--text-secondary)",
                            fontSize: "0.75rem",
                            cursor: dynamicSearchTerms.includes(kw) ? "not-allowed" : "pointer",
                          }}
                        >
                          + {kw}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-main)" }}>动态类型</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                      {Object.entries(DYNAMIC_TYPE_MAP).map(([type, config]) => {
                        const Icon = config.icon;
                        const selected = selectedTypes.includes(type);
                        return (
                          <button
                            key={type}
                            onClick={() => toggleType(type)}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                              padding: "8px 14px",
                              borderRadius: "var(--radius-sm)",
                              border: "1px solid",
                              borderColor: selected ? config.color : "var(--border-light)",
                              background: selected ? `${config.color}15` : "var(--bg-hover)",
                              color: selected ? config.color : "var(--text-secondary)",
                              fontSize: "0.8125rem",
                              fontWeight: 500,
                              cursor: "pointer",
                            }}
                          >
                            <Icon size={14} />
                            {config.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {dynamicSearchTerms.length > 0 ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {dynamicSearchTerms.map((kw) => (
                      <span
                        key={kw}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          padding: "4px 10px",
                          borderRadius: "9999px",
                          background: "rgba(188, 164, 227, 0.15)",
                          color: "var(--color-primary)",
                          fontSize: "0.8125rem",
                          fontWeight: 500,
                        }}
                      >
                        {kw}
                        <button
                          onClick={() => handleRemoveKeyword(kw)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: "2px",
                            borderRadius: "50%",
                            border: "none",
                            background: "transparent",
                            cursor: "pointer",
                            color: "inherit",
                          }}
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <div
                    style={{
                      padding: "12px 14px",
                      borderRadius: "var(--radius-sm)",
                      background: "var(--bg-hover)",
                      color: "var(--text-muted)",
                      fontSize: "0.75rem",
                      lineHeight: 1.6,
                    }}
                  >
                    不填词也能直接看关注动态总览；如果你今天有明确主题，再把关键词或标签补进去会更干净。
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <button
                    type="button"
                    onClick={() => setShowSuggestedSmartGroupTags((value) => !value)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "12px",
                      width: "100%",
                      padding: "12px 14px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border-light)",
                      background: "var(--bg-hover)",
                      color: "var(--text-main)",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <div style={{ fontSize: "0.8125rem", fontWeight: 700 }}>智能分组高频标签补充</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
                        按智能分组收起展示；点开某个组后，再展开里面的标签。
                      </div>
                    </div>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", color: "var(--text-muted)", flexShrink: 0 }}>
                      <span style={{ fontSize: "0.75rem" }}>{showSuggestedSmartGroupTags ? "收起" : "展开"}</span>
                      {showSuggestedSmartGroupTags ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </div>
                  </button>
                  {showSuggestedSmartGroupTags ? (
                    suggestedSmartGroupTags.length > 0 ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                          这些高频标签会先按智能分组归档，再补到上面的统一词池里，不再按原始标签平铺。
                        </div>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                            gap: "10px",
                          }}
                        >
                          {suggestedSmartGroupTags.map((group) => {
                            const groupExpanded = expandedSuggestedSmartGroupTagGroups.has(group.value);
                            return (
                              <div
                                key={`dynamics-smart-tag-group-${group.value}`}
                                style={{
                                  padding: "12px",
                                  borderRadius: "var(--radius-sm)",
                                  border: `1px solid ${group.meta.accent}22`,
                                  background: group.meta.bg,
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: "8px",
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setExpandedSuggestedSmartGroupTagGroups((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(group.value)) {
                                        next.delete(group.value);
                                      } else {
                                        next.add(group.value);
                                      }
                                      return next;
                                    });
                                  }}
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    gap: "10px",
                                    alignItems: "center",
                                    flexWrap: "wrap",
                                    width: "100%",
                                    padding: 0,
                                    border: "none",
                                    background: "transparent",
                                    cursor: "pointer",
                                    textAlign: "left",
                                  }}
                                >
                                  <div style={{ fontSize: "0.8125rem", fontWeight: 800, color: group.meta.accent }}>
                                    {group.label}
                                  </div>
                                  <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", color: "var(--text-muted)" }}>
                                    <span style={{ fontSize: "0.6875rem" }}>
                                      {group.tags.length} 个标签
                                    </span>
                                    {groupExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                  </div>
                                </button>
                                {groupExpanded ? (
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                                    {group.tags.map((item) => (
                                      <button
                                        key={`dynamics-smart-tag-${group.value}-${item.signal}`}
                                        type="button"
                                        onClick={() => handleAddSuggestedTagFilter(item.signal)}
                                        disabled={dynamicSearchTerms.some((tag) => tag.toLowerCase() === item.signal.toLowerCase())}
                                        style={{
                                          padding: "6px 10px",
                                          borderRadius: "999px",
                                          border: "1px solid var(--border-light)",
                                          background: dynamicSearchTerms.some((tag) => tag.toLowerCase() === item.signal.toLowerCase()) ? "var(--bg-muted)" : "rgba(255, 255, 255, 0.72)",
                                          color: dynamicSearchTerms.some((tag) => tag.toLowerCase() === item.signal.toLowerCase()) ? "var(--text-muted)" : group.meta.accent,
                                          fontSize: "0.75rem",
                                          fontWeight: 700,
                                          cursor: dynamicSearchTerms.some((tag) => tag.toLowerCase() === item.signal.toLowerCase()) ? "not-allowed" : "pointer",
                                        }}
                                      >
                                        + {item.signal} {item.count > 0 ? `· ${item.count}` : ""}
                                      </button>
                                    ))}
                                  </div>
                                ) : (
                                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
                                    点击展开这个智能分组，再看里面的高频标签。
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
                        还没有可复用的智能分组标签。先执行一次“共享智能分组”，这里就会按智能组展示高频标签；没有的话也可以直接在上面的统一输入框里填词。
                      </div>
                    )
                  ) : null}
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: "16px",
                    paddingTop: "16px",
                    borderTop: "1px solid var(--border-light)",
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-main)" }}>时间范围</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                      {TIME_RANGE_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => {
                            setDaysBack(opt.value);
                            setDaysBackInput(String(opt.value));
                          }}
                          style={{
                            padding: "8px 16px",
                            borderRadius: "var(--radius-sm)",
                            border: "1px solid",
                            borderColor: daysBack === opt.value ? "var(--color-primary)" : "var(--border-light)",
                            background: daysBack === opt.value ? "rgba(188, 164, 227, 0.15)" : "var(--bg-hover)",
                            color: daysBack === opt.value ? "var(--color-primary)" : "var(--text-secondary)",
                            fontSize: "0.8125rem",
                            fontWeight: daysBack === opt.value ? 600 : 400,
                            cursor: "pointer",
                          }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>自定义天数</span>
                      <input
                        type="number"
                        min={1}
                        value={daysBackInput}
                        onChange={(e) => setDaysBackInput(e.target.value)}
                        onBlur={() => normalizePositiveInput(daysBackInput, daysBack, setDaysBack, setDaysBackInput)}
                        style={{
                          width: "110px",
                          padding: "8px 10px",
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid var(--border-light)",
                          background: "var(--bg-input)",
                          color: "var(--text-main)",
                          fontSize: "0.8125rem",
                        }}
                      />
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>天</span>
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-main)" }}>数量限制</div>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {LIMIT_OPTIONS.map((opt) => (
                        <button
                          key={opt}
                          onClick={() => {
                            setLimit(opt);
                            setLimitInput(String(opt));
                          }}
                          style={{
                            minWidth: "88px",
                            padding: "10px 14px",
                            borderRadius: "var(--radius-sm)",
                            border: "1px solid",
                            borderColor: limit === opt ? "var(--color-primary)" : "var(--border-light)",
                            background: limit === opt ? "rgba(188, 164, 227, 0.15)" : "var(--bg-hover)",
                            color: limit === opt ? "var(--color-primary)" : "var(--text-secondary)",
                            fontSize: "0.8125rem",
                            fontWeight: limit === opt ? 600 : 400,
                            cursor: "pointer",
                          }}
                        >
                          {opt} 条
                        </button>
                      ))}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>过滤后保留</span>
                      <input
                        type="number"
                        min={1}
                        max={MAX_DYNAMIC_KEEP_LIMIT}
                        value={limitInput}
                        onChange={(e) => setLimitInput(e.target.value)}
                        onBlur={() => normalizePositiveInput(limitInput, limit, setLimit, setLimitInput, MAX_DYNAMIC_KEEP_LIMIT)}
                        placeholder={`1-${MAX_DYNAMIC_KEEP_LIMIT}`}
                        style={{
                          width: "110px",
                          padding: "8px 10px",
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid var(--border-light)",
                          background: "var(--bg-input)",
                          color: "var(--text-main)",
                          fontSize: "0.8125rem",
                        }}
                      />
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>条</span>
                    </div>
                    <div style={{ fontSize: "0.74rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
                      这里只限制最终展示与入库前保留的数量；分组抓取会按 UP 平均分配内部扫描预算。
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            {/* Fetch Button */}
            <button
              onClick={handleFetch}
              disabled={loading}
              style={{
                padding: "14px 24px",
                borderRadius: "var(--radius-md)",
                border: "none",
                background: loading ? "var(--bg-muted)" : "linear-gradient(135deg, #00AEEC, #FB7299)",
                color: "white",
                fontSize: "0.9375rem",
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "10px",
                boxShadow: "0 4px 16px rgba(0, 174, 236, 0.25)",
              }}
            >
              {loading ? (
                <>
                  <div
                    style={{
                      width: "18px",
                      height: "18px",
                      border: "2px solid rgba(255,255,255,0.3)",
                      borderTopColor: "white",
                      borderRadius: "50%",
                      animation: "spin 1s linear infinite",
                    }}
                  />
                  获取中...
                </>
              ) : (
                <>
                  <Search size={18} />
                  预览当前词 / 标签
                </>
              )}
            </button>

            {vaultResult && (
              <Card title="入库结果" icon={<CheckCircle size={18} />}>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.8125rem" }}>
                  <div style={{ color: "var(--text-secondary)", wordBreak: "break-all" }}>
                    输出目录：{vaultResult.output_dir}
                  </div>
                  <div style={{ color: "var(--text-secondary)" }}>
                    动态 {vaultResult.dynamic_count} 条
                  </div>
                  <div style={{ color: "var(--color-success)", fontWeight: 600 }}>
                    已写入 {vaultResult.written_count} 个 Markdown 文件
                  </div>
                </div>
              </Card>
            )}

            {/* Diagnostic Button */}
            <button
              onClick={handleDebugTest}
              disabled={debugLoading || !sessdata.trim()}
              style={{
                padding: "12px 20px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-light)",
                background: "var(--bg-card)",
                color: "var(--text-secondary)",
                fontSize: "0.875rem",
                fontWeight: 500,
                cursor: debugLoading || !sessdata.trim() ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
              }}
            >
              {debugLoading ? (
                <>
                  <div
                    style={{
                      width: "16px",
                      height: "16px",
                      border: "2px solid var(--text-muted)",
                      borderTopColor: "transparent",
                      borderRadius: "50%",
                      animation: "spin 1s linear infinite",
                    }}
                  />
                  诊断中...
                </>
              ) : (
                <>
                  <AlertCircle size={16} />
                  运行诊断测试
                </>
              )}
            </button>

            {/* Debug Results */}
            {debugResult && (
              <Card title="诊断结果" icon={<AlertCircle size={18} />}>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                    SESSDATA: {debugResult.sessdata_preview}
                  </div>
                  {Object.entries(debugResult.tests).map(([name, test]) => (
                    <div
                      key={name}
                      style={{
                        padding: "12px",
                        borderRadius: "var(--radius-sm)",
                        background: "var(--bg-hover)",
                        fontSize: "0.8125rem",
                      }}
                    >
                      <div style={{ fontWeight: 600, color: "var(--text-main)", marginBottom: "4px" }}>
                        {name === "video_only" && "仅视频 (type_list=8)"}
                        {name === "all_types" && "全部类型 (type_list=268435455)"}
                        {name === "no_params" && "无参数"}
                      </div>
                      {test.error ? (
                        <div style={{ color: "var(--color-error)" }}>错误: {test.error}</div>
                      ) : (
                        <div style={{ color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: "2px" }}>
                          <span>状态码: {test.status_code}</span>
                          <span>返回码: {test.code}</span>
                          <span>消息: {test.message}</span>
                          <span style={{ fontWeight: 600, color: test.cards_count && test.cards_count > 0 ? "var(--color-success)" : "var(--text-muted)" }}>
                            卡片数: {test.cards_count}
                          </span>
                          {test.first_card_types && test.first_card_types.length > 0 && (
                            <span>前5个卡片类型: {test.first_card_types.join(", ")}</span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  <div
                    style={{
                      padding: "12px",
                      borderRadius: "var(--radius-sm)",
                      background: "rgba(255, 193, 7, 0.1)",
                      border: "1px solid rgba(255, 193, 7, 0.3)",
                    }}
                  >
                    <div style={{ fontWeight: 600, color: "#FFB800", marginBottom: "8px", fontSize: "0.8125rem" }}>
                      可能的原因：
                    </div>
                    <ul style={{ margin: 0, paddingLeft: "16px", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                      {debugResult.suggestions.slice(1).map((s, i) => (
                        <li key={i} style={{ marginBottom: "4px" }}>{s}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </Card>
            )}
          </div>}

          {/* Bottom content - Results */}
          {panelTab === "favorites" && (
            <div style={{ overflow: "auto", display: "flex", flexDirection: "column", gap: "16px" }}>
              <BilibiliFavoritesPage embedded />
            </div>
          )}

          {panelTab === "following" && (
            <div style={{ overflow: "auto", display: "flex", flexDirection: "column", gap: "16px" }}>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "16px",
                }}
              >
                <Card
                  title="关注流常驻关键词监控"
                  icon={<Hash size={18} />}
                  actions={(
                    <span
                      style={{
                        padding: "5px 10px",
                        borderRadius: "999px",
                        background: "rgba(0, 174, 236, 0.1)",
                        color: "#078FBF",
                        fontSize: "0.75rem",
                        fontWeight: 800,
                        whiteSpace: "nowrap",
                      }}
                    >
                      已启用 {activeDailyDynamicMonitors.length}
                    </span>
                  )}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.7 }}>
                      这里现在只保留常驻监控。你新建一个空即可，里面兼容关键词和标签；新建后可以单独开启、关闭、删除，临时主动搜索则统一回到上面的「动态追踪」里做。
                    </div>

                    <div
                      style={{
                        padding: "16px",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid rgba(14, 165, 233, 0.16)",
                        background: "linear-gradient(135deg, rgba(14, 165, 233, 0.08), rgba(16, 185, 129, 0.06))",
                        display: "flex",
                        flexDirection: "column",
                        gap: "14px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start", flexWrap: "wrap" }}>
                        <div>
                          <div style={{ fontSize: "0.9375rem", fontWeight: 800, color: "var(--text-main)" }}>常驻关键词监控</div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "4px", lineHeight: 1.7, maxWidth: "760px" }}>
                            每个监控会单独开启 / 关闭，单独抓取，入库时也会落到自己的文件夹里。标签条件和关键词是同级的附加命中规则，不需要单独维护两套。
                          </div>
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                          已配置 {dailyDynamicMonitors.length} 个，启用 {activeDailyDynamicMonitors.length} 个
                        </div>
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "minmax(0, 1fr) minmax(116px, 140px) auto",
                          gap: "10px",
                          alignItems: "end",
                        }}
                      >
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 700 }}>词 / 标签</div>
                          <input
                            type="text"
                            value={dailyMonitorTermInput}
                            onChange={(e) => setDailyMonitorTermInput(e.target.value)}
                            placeholder="输入一个监控词，兼容关键词和标签；支持逗号分隔"
                            style={{
                              width: "100%",
                              padding: "10px 12px",
                              borderRadius: "var(--radius-sm)",
                              border: "1px solid var(--border-light)",
                              background: "var(--bg-card)",
                              color: "var(--text-main)",
                              fontSize: "0.8125rem",
                            }}
                          />
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 700 }}>最近几天</div>
                          <input
                            type="number"
                            min={1}
                            value={dailyMonitorDaysBackInput}
                            onChange={(e) => setDailyMonitorDaysBackInput(e.target.value)}
                            onBlur={() => setDailyMonitorDaysBackInput(String(clampPositiveInt(dailyMonitorDaysBackInput, 7, 365)))}
                            style={{
                              width: "100%",
                              padding: "10px 12px",
                              borderRadius: "var(--radius-sm)",
                              border: "1px solid var(--border-light)",
                              background: "var(--bg-card)",
                              color: "var(--text-main)",
                              fontSize: "0.8125rem",
                            }}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleAddDailyDynamicMonitor()}
                          disabled={parseStringListInput(dailyMonitorTermInput).length === 0}
                          style={{
                            padding: "10px 14px",
                            borderRadius: "var(--radius-sm)",
                            border: "none",
                            background: parseStringListInput(dailyMonitorTermInput).length > 0 ? "linear-gradient(135deg, #10B981, #00AEEC)" : "var(--bg-muted)",
                            color: parseStringListInput(dailyMonitorTermInput).length > 0 ? "white" : "var(--text-muted)",
                            cursor: parseStringListInput(dailyMonitorTermInput).length > 0 ? "pointer" : "not-allowed",
                            fontWeight: 800,
                          }}
                        >
                          新建
                        </button>
                      </div>

                      {dailyDynamicMonitors.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                          {dailyDynamicMonitors.map((monitor) => {
                            const monitorTerms = getDailyMonitorTerms(monitor);
                            return (
                              <div
                                key={monitor.id}
                                style={{
                                  padding: "14px",
                                  borderRadius: "var(--radius-sm)",
                                  border: "1px solid var(--border-light)",
                                  background: "var(--bg-card)",
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: "12px",
                                }}
                              >
                                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start", flexWrap: "wrap" }}>
                                  <div>
                                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                                      <div style={{ fontSize: "0.875rem", fontWeight: 800, color: "var(--text-main)" }}>{monitor.label}</div>
                                      <span
                                        style={{
                                          padding: "4px 8px",
                                          borderRadius: "999px",
                                          background: monitor.enabled ? "rgba(16, 185, 129, 0.12)" : "var(--bg-muted)",
                                          color: monitor.enabled ? "#0F9F6E" : "var(--text-muted)",
                                          fontSize: "0.6875rem",
                                          fontWeight: 800,
                                        }}
                                      >
                                        {monitor.enabled ? "已开启" : "已关闭"}
                                      </span>
                                      <span
                                        style={{
                                          padding: "4px 8px",
                                          borderRadius: "999px",
                                          background: "rgba(14, 165, 233, 0.12)",
                                          color: "#0284C7",
                                          fontSize: "0.6875rem",
                                          fontWeight: 800,
                                        }}
                                      >
                                        最近 {monitor.days_back} 天
                                      </span>
                                    </div>
                                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "4px", lineHeight: 1.6 }}>
                                      入库目录：{buildDailyMonitorSubfolder(monitor.label)}
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginTop: "8px" }}>
                                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>最近几天</span>
                                      <input
                                        key={`${monitor.id}-${monitor.days_back}`}
                                        type="number"
                                        min={1}
                                        defaultValue={monitor.days_back}
                                        onBlur={(e) => void handleUpdateDailyMonitorDaysBack(monitor.id, e.currentTarget.value)}
                                        onKeyDown={(e) => {
                                          if (isActionEnterKey(e)) {
                                            e.preventDefault();
                                            e.currentTarget.blur();
                                          }
                                        }}
                                        style={{
                                          width: "84px",
                                          padding: "6px 8px",
                                          borderRadius: "var(--radius-sm)",
                                          border: "1px solid var(--border-light)",
                                          background: "var(--bg-card)",
                                          color: "var(--text-main)",
                                          fontSize: "0.75rem",
                                        }}
                                      />
                                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>天内动态</span>
                                    </div>
                                  </div>
                                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                                    <button
                                      type="button"
                                      onClick={() => void handleToggleDailyDynamicMonitor(monitor.id)}
                                      style={{
                                        padding: "8px 12px",
                                        borderRadius: "var(--radius-sm)",
                                        border: "1px solid var(--border-light)",
                                        background: "var(--bg-card)",
                                        color: "var(--text-secondary)",
                                        fontSize: "0.75rem",
                                        fontWeight: 700,
                                        cursor: "pointer",
                                      }}
                                    >
                                      {monitor.enabled ? "关闭" : "开启"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void handlePreviewDailyMonitor(monitor)}
                                      disabled={loading}
                                      style={{
                                        padding: "8px 12px",
                                        borderRadius: "var(--radius-sm)",
                                        border: "none",
                                        background: loading ? "var(--bg-muted)" : "linear-gradient(135deg, #00AEEC, #10B981)",
                                        color: loading ? "var(--text-muted)" : "white",
                                        fontSize: "0.75rem",
                                        fontWeight: 800,
                                        cursor: loading ? "not-allowed" : "pointer",
                                      }}
                                    >
                                      立即爬取
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void handleRemoveDailyDynamicMonitor(monitor.id)}
                                      style={{
                                        padding: "8px 12px",
                                        borderRadius: "var(--radius-sm)",
                                        border: "1px solid rgba(239, 68, 68, 0.24)",
                                        background: "rgba(239, 68, 68, 0.08)",
                                        color: "#DC2626",
                                        fontSize: "0.75rem",
                                        fontWeight: 700,
                                        cursor: "pointer",
                                      }}
                                    >
                                      删除
                                    </button>
                                  </div>
                                </div>

                                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                                  {monitorTerms.map((term) => (
                                    <span
                                      key={`${monitor.id}-term-${term}`}
                                      style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "4px",
                                        padding: "4px 9px",
                                        borderRadius: "999px",
                                        background: "rgba(16, 185, 129, 0.12)",
                                        color: "#0F9F6E",
                                        fontSize: "0.75rem",
                                        fontWeight: 700,
                                      }}
                                    >
                                      {term}
                                      <button
                                        type="button"
                                        onClick={() => void handleRemoveMonitorTerm(monitor.id, term)}
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                          padding: 0,
                                          border: "none",
                                          background: "transparent",
                                          color: "inherit",
                                          cursor: "pointer",
                                        }}
                                      >
                                        <X size={12} />
                                      </button>
                                    </span>
                                  ))}
                                  {monitorTerms.length === 0 && (
                                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>这个监控还没有命中条件</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.7 }}>
                          还没有固定日抓监控。你可以先在上面试一轮关键词 / 标签，再把常用组合固化成下面这些每天自动跑的监控项。
                        </div>
                      )}
                    </div>

                  </div>
                </Card>

                {renderDailyGroupMonitorWorkbench()}

                <Card
                  title="关注 UP 最新动态 -> 情报 Feed"
                  icon={<Users size={18} />}
                  actions={(
                    <span
                      style={{
                        padding: "5px 10px",
                        borderRadius: "999px",
                        background: "rgba(16, 185, 129, 0.12)",
                        color: "#0F9F6E",
                        fontSize: "0.75rem",
                        fontWeight: 800,
                        whiteSpace: "nowrap",
                      }}
                    >
                      当前范围 {trackedUpMembers.length}
                    </span>
                  )}
                >
                    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                      <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.7 }}>
                        上面的「智能分组追踪」只负责看分组来源和维护固定监督名单；这里不再改监督配置，只负责查看当前范围、触发今日抓取，并把结果送进情报 Feed。
                      </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                        gap: "12px",
                      }}
                    >
                      <div
                        style={{
                          padding: "14px",
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid rgba(16, 185, 129, 0.24)",
                          background: "rgba(16, 185, 129, 0.08)",
                          display: "flex",
                          flexDirection: "column",
                          gap: "10px",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
                          <div>
                            <div style={{ fontSize: "0.875rem", fontWeight: 800, color: "var(--text-main)" }}>{followStatusTitle}</div>
                            <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "4px", lineHeight: 1.6 }}>{followStatusStage}</div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>当前页</div>
                            <div style={{ fontSize: "1rem", fontWeight: 800, color: "var(--text-main)" }}>{followStatusPage || "-"}</div>
                          </div>
                        </div>
                        <div style={{ width: "100%", height: "8px", borderRadius: "999px", background: "rgba(0, 0, 0, 0.08)", overflow: "hidden" }}>
                          <div style={{ width: `${followStatusProgress}%`, height: "100%", background: "linear-gradient(90deg, #10B981, #00AEEC)" }} />
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                          <span>已获取 {followStatusCount} 个关注</span>
                          {followedUpsTask?.updated_at && <span>最近更新 {new Date(followedUpsTask.updated_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>}
                        </div>
                      </div>

                      <div
                        style={{
                          padding: "14px",
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid rgba(236, 72, 153, 0.24)",
                          background: "rgba(236, 72, 153, 0.08)",
                          display: "flex",
                          flexDirection: "column",
                          gap: "10px",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
                          <div>
                            <div style={{ fontSize: "0.875rem", fontWeight: 800, color: "var(--text-main)" }}>{smartGroupStatusTitle}</div>
                            <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "4px", lineHeight: 1.6 }}>{smartGroupStatusStage}</div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{smartGroupMetricLabel}</div>
                            <div style={{ fontSize: "1rem", fontWeight: 800, color: "var(--text-main)" }}>
                              {smartGroupMetricValue}
                            </div>
                          </div>
                        </div>
                        <div style={{ width: "100%", height: "8px", borderRadius: "999px", background: "rgba(0, 0, 0, 0.08)", overflow: "hidden" }}>
                          <div style={{ width: `${smartGroupStatusProgress}%`, height: "100%", background: "linear-gradient(90deg, #FB7299, #8B5CF6)" }} />
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                          {smartGroupStatusDetails.map((detail) => (
                            <span key={detail}>{detail}</span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                        gap: "10px",
                      }}
                    >
                      {[
                        { label: "Feed 分组", value: monitorCategoryCount, detail: "会进入情报流" },
                        { label: "覆盖 UP", value: trackedUpIds.size, detail: "已被监视" },
                        { label: "监控分组", value: selectedTrackedSmartGroups.length, detail: "自动分组输出" },
                        { label: "固定UP", value: manualPoolMembers.length, detail: "手动指定监督" },
                      ].map((metric) => (
                        <div
                          key={metric.label}
                          style={{
                            padding: "12px 14px",
                            borderRadius: "var(--radius-sm)",
                            background: "var(--bg-hover)",
                            border: "1px solid var(--border-light)",
                          }}
                        >
                          <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--text-main)" }}>{metric.value}</div>
                          <div style={{ marginTop: "4px", fontSize: "0.75rem", color: "var(--text-secondary)" }}>{metric.label}</div>
                          <div style={{ marginTop: "2px", fontSize: "0.6875rem", color: "var(--text-muted)" }}>{metric.detail}</div>
                        </div>
                      ))}
                    </div>

                  </div>
                </Card>
              </div>

              <ExpandableSection
                title="情报 Feed 分组明细"
                summary="这里看的是最终会怎么出现在情报 Feed 里。组别保持在上层，具体作者和样例标签放到展开后再看。"
                badge={monitorCategoryCount > 0 ? `${monitorCategoryCount} 组` : "未配置"}
                accent="#10B981"
                icon={<Filter size={16} />}
                open={showFeedBreakdown}
                onToggle={() => setShowFeedBreakdown((value) => !value)}
              >
                {monitorCategoryCount > 0 ? (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                      gap: "12px",
                    }}
                  >
                    {selectedTrackedSmartGroups.map((group) => (
                      <div
                        key={group.value}
                        style={{
                          padding: "14px",
                          borderRadius: "var(--radius-sm)",
                          border: `1px solid ${group.meta.accent}33`,
                          background: group.meta.bg,
                          display: "flex",
                          flexDirection: "column",
                          gap: "10px",
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: "0.9375rem", fontWeight: 800, color: group.meta.accent }}>
                            {group.label}
                          </div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                            {group.members.length} 个 UP · 固定监督命中这个智能组后会在 Feed 单独成组
                          </div>
                        </div>
                        {group.sampleAuthors.length > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                            {group.sampleAuthors.map((author) => (
                              <span
                                key={author}
                                style={{
                                  padding: "3px 8px",
                                  borderRadius: "999px",
                                  background: "rgba(255,255,255,0.72)",
                                  color: "var(--text-main)",
                                  fontSize: "0.6875rem",
                                  fontWeight: 700,
                                }}
                              >
                                {author}
                              </span>
                            ))}
                          </div>
                        )}
                        {group.sampleTags.length > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                            {group.sampleTags.slice(0, 4).map((tag) => (
                              <span
                                key={tag}
                                style={{
                                  padding: "3px 8px",
                                  borderRadius: "999px",
                                  background: "var(--bg-card)",
                                  color: "var(--text-muted)",
                                  fontSize: "0.6875rem",
                                }}
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    {manualPoolMembers.length > 0 && (
                      <div
                        style={{
                          padding: "14px",
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid rgba(0, 174, 236, 0.28)",
                          background: "rgba(0, 174, 236, 0.08)",
                          display: "flex",
                          flexDirection: "column",
                          gap: "10px",
                        }}
                      >
                        <div>
                          <div style={{ fontSize: "0.9375rem", fontWeight: 800, color: "#078FBF" }}>固定监督 UP</div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                            {manualPoolMembers.length} 个 UP · 手动指定长期监督
                          </div>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                          {manualPoolMembers.slice(0, 8).map((entry) => (
                            <button
                              key={entry.id}
                              type="button"
                              onClick={() => void toggleManualMonitoredUp(entry.id)}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "6px",
                                padding: "4px 8px",
                                borderRadius: "999px",
                                border: "1px solid var(--border-light)",
                                background: "var(--bg-card)",
                                color: "var(--text-secondary)",
                                fontSize: "0.6875rem",
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              <span>{entry.up?.uname || entry.id}</span>
                              <span style={{ color: "var(--text-muted)" }}>移除</span>
                            </button>
                          ))}
                        </div>
                        {manualPoolMembers.length > 8 && (
                          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                            其余 {manualPoolMembers.length - 8} 个 UP 也会一起作为固定监督输出。
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
                    还没有固定监督范围。先在上面的固定 UP 监督里加几个 UP，这里才会按命中的智能组拆出 Feed 分组。
                  </div>
                )}
              </ExpandableSection>

              <ExpandableSection
                title="具体 UP 与分组筛选"
                summary="默认分组和智能分组先把关注列表收窄，再决定哪些具体 UP 进入固定监督。下面保留明细，但默认折叠。"
                badge={followedUps.length > 0 ? `${filteredFollowedUps.length} 个结果` : "未加载"}
                accent="#00AEEC"
                icon={<Users size={16} />}
                open={showFollowedCatalog}
                onToggle={() => setShowFollowedCatalog((value) => !value)}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "10px" }}>
                    <input
                      type="text"
                      value={followedUpSearch}
                      onChange={(e) => setFollowedUpSearch(e.target.value)}
                      placeholder="搜关注的 UP 名、简介"
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border-light)",
                        background: "var(--bg-input)",
                        color: "var(--text-main)",
                        fontSize: "0.875rem",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => void handleLoadFollowedUps(false, true)}
                      disabled={followedUpsLoading}
                      style={{
                        padding: "0 14px",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border-light)",
                        background: "var(--bg-card)",
                        color: followedUpsLoading ? "var(--text-muted)" : "var(--text-secondary)",
                        fontSize: "0.8125rem",
                        fontWeight: 700,
                        cursor: followedUpsLoading ? "not-allowed" : "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {followedUpsLoading ? "刷新中..." : "刷新关注"}
                    </button>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                      gap: "12px",
                    }}
                  >
                    <div
                      style={{
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border-light)",
                        background: "var(--bg-hover)",
                        overflow: "hidden",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setShowOriginalGroupFilter((value) => !value)}
                        style={{
                          width: "100%",
                          padding: "12px 14px",
                          border: "none",
                          background: "transparent",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: "12px",
                          textAlign: "left",
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: "0.875rem", fontWeight: 800, color: "var(--text-main)" }}>默认分组筛选</div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "4px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            当前：{selectedOriginalGroupLabel}
                          </div>
                        </div>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", color: "var(--text-muted)", flexShrink: 0 }}>
                          <span style={{ fontSize: "0.75rem" }}>{showOriginalGroupFilter ? "收起" : "展开"}</span>
                          {showOriginalGroupFilter ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                      </button>
                      {showOriginalGroupFilter && (
                        <div style={{ padding: "0 14px 14px", display: "flex", flexWrap: "wrap", gap: "8px", borderTop: "1px solid var(--border-light)" }}>
                          <button
                            type="button"
                            onClick={() => setSelectedOriginalGroup("all")}
                            style={{
                              marginTop: "12px",
                              padding: "8px 12px",
                              borderRadius: "var(--radius-sm)",
                              border: "1px solid",
                              borderColor: selectedOriginalGroup === "all" ? "#00AEEC" : "var(--border-light)",
                              background: selectedOriginalGroup === "all" ? "rgba(0, 174, 236, 0.12)" : "var(--bg-card)",
                              color: selectedOriginalGroup === "all" ? "#078FBF" : "var(--text-secondary)",
                              fontSize: "0.8125rem",
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            全部默认分组 · {followedUps.length}
                          </button>
                          {originalGroups.map((group) => {
                            const active = selectedOriginalGroup === group.tag_id;
                            return (
                              <button
                                key={group.tag_id}
                                type="button"
                                onClick={() => setSelectedOriginalGroup(group.tag_id)}
                                title={group.tip || group.name}
                                style={{
                                  marginTop: "12px",
                                  padding: "8px 12px",
                                  borderRadius: "var(--radius-sm)",
                                  border: "1px solid",
                                  borderColor: active ? "#FB7299" : "var(--border-light)",
                                  background: active ? "rgba(251, 114, 153, 0.12)" : "var(--bg-card)",
                                  color: active ? "#D64078" : "var(--text-secondary)",
                                  fontSize: "0.8125rem",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                }}
                              >
                                {group.name} {originalGroupCounts[group.tag_id] ? `· ${originalGroupCounts[group.tag_id]}` : ""}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div
                      style={{
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border-light)",
                        background: "var(--bg-hover)",
                        overflow: "hidden",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setShowSmartGroupFilter((value) => !value)}
                        style={{
                          width: "100%",
                          padding: "12px 14px",
                          border: "none",
                          background: "transparent",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: "12px",
                          textAlign: "left",
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: "0.875rem", fontWeight: 800, color: "var(--text-main)" }}>智能分组筛选</div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "4px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            当前：{selectedSmartGroupLabel}
                          </div>
                        </div>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", color: "var(--text-muted)", flexShrink: 0 }}>
                          <span style={{ fontSize: "0.75rem" }}>{showSmartGroupFilter ? "收起" : "展开"}</span>
                          {showSmartGroupFilter ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                      </button>
                      {showSmartGroupFilter && (
                        <div style={{ padding: "0 14px 14px", display: "flex", flexWrap: "wrap", gap: "8px", borderTop: "1px solid var(--border-light)" }}>
                          {!smartGroupsReady ? (
                            <div style={{ paddingTop: "12px", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                              先点上方“共享智能分组”，统一维护共享标签库和作者分组，再回来选智能组。
                            </div>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => setSelectedFollowedGroup("all")}
                                style={{
                                  marginTop: "12px",
                                  padding: "8px 12px",
                                  borderRadius: "var(--radius-sm)",
                                  border: "1px solid",
                                  borderColor: selectedFollowedGroup === "all" ? "#00AEEC" : "var(--border-light)",
                                  background: selectedFollowedGroup === "all" ? "rgba(0, 174, 236, 0.12)" : "var(--bg-card)",
                                  color: selectedFollowedGroup === "all" ? "#078FBF" : "var(--text-secondary)",
                                  fontSize: "0.8125rem",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                }}
                              >
                                全部智能组 · {followedUps.length}
                              </button>
                              {smartGroupOptions.map((group) => {
                                const active = selectedFollowedGroup === group.value;
                                const meta = resolveSmartGroupMeta(group.value, group.label);
                                return (
                                  <button
                                    key={group.value}
                                    type="button"
                                    onClick={() => setSelectedFollowedGroup(group.value)}
                                    style={{
                                      marginTop: "12px",
                                      padding: "8px 12px",
                                      borderRadius: "var(--radius-sm)",
                                      border: "1px solid",
                                      borderColor: active ? meta.accent : "var(--border-light)",
                                      background: active ? meta.bg : "var(--bg-card)",
                                      color: active ? meta.accent : "var(--text-secondary)",
                                      fontSize: "0.8125rem",
                                      fontWeight: 700,
                                      cursor: "pointer",
                                    }}
                                  >
                                    {group.label} {groupCounts[group.value] ? `· ${groupCounts[group.value]}` : ""}
                                  </button>
                                );
                              })}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "10px",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "12px 14px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border-light)",
                      background: "var(--bg-hover)",
                    }}
                  >
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                      <span>关注 {followedUps.length} 个 UP</span>
                      <span>默认筛选 {selectedOriginalGroupLabel}</span>
                      <span>智能筛选 {selectedSmartGroupLabel}</span>
                      <span>当前结果 {filteredFollowedUps.length} 个</span>
                      <span>已启用 {activeFollowedFilterCount} 项筛选</span>
                    </div>
                    {activeFollowedFilterCount > 0 && (
                      <button
                        type="button"
                        onClick={resetFollowedUpFilters}
                        style={{
                          padding: "7px 10px",
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid var(--border-light)",
                          background: "var(--bg-card)",
                          color: "var(--text-secondary)",
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        清空筛选
                      </button>
                    )}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px",
                      padding: "12px 14px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border-light)",
                      background: "var(--bg-card)",
                    }}
                  >
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontSize: "0.875rem", fontWeight: 800, color: "var(--text-main)" }}>筛选结果</div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "4px", lineHeight: 1.6 }}>
                          结果列表现在可以单独展开或隐藏；需要重新读关注时，直接在这里刷新。卡片底部仍然支持把具体 UP 加进固定监督。
                          </div>
                      </div>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={() => void handleLoadFollowedUps(false, true)}
                          disabled={followedUpsLoading}
                          style={{
                            padding: "7px 10px",
                            borderRadius: "var(--radius-sm)",
                            border: "1px solid var(--border-light)",
                            background: "var(--bg-hover)",
                            color: followedUpsLoading ? "var(--text-muted)" : "var(--text-secondary)",
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            cursor: followedUpsLoading ? "not-allowed" : "pointer",
                          }}
                        >
                          {followedUpsLoading ? "刷新中..." : "刷新结果"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowFollowedResultCards((value) => !value)}
                          style={{
                            padding: "7px 10px",
                            borderRadius: "var(--radius-sm)",
                            border: "1px solid var(--border-light)",
                            background: "var(--bg-hover)",
                            color: "var(--text-secondary)",
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          {showFollowedResultCards ? "隐藏结果" : "展开结果"}
                        </button>
                      </div>
                    </div>

	                    <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", fontSize: "0.75rem", color: "var(--text-muted)" }}>
	                      <span>命中 {filteredFollowedUps.length} 个 UP</span>
	                      <span>分页管理，每页 {followedResultPageSize} 个</span>
	                      <span>固定监督 {manualPoolMembers.length} 个</span>
	                    </div>

	                    {showFollowedResultCards && filteredFollowedUps.length > 0 && (
	                      <PaginationControls
	                        totalCount={filteredFollowedUps.length}
	                        page={safeFollowedResultPage}
	                        pageSize={followedResultPageSize}
	                        itemLabel="个 UP"
	                        pageSizeOptions={PAGINATION_SIZE_OPTIONS}
	                        onPageChange={setFollowedResultPage}
	                        onPageSizeChange={(nextPageSize) => setFollowedResultPageSize(nextPageSize === 50 ? 50 : 20)}
	                        emptyText="当前没有匹配的 UP"
	                      />
	                    )}

                    {showFollowedResultCards && (
                      followedUpsLoading && followedUps.length === 0 ? (
                        <div style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>正在读取关注列表...</div>
                      ) : filteredFollowedUps.length > 0 ? (
                        <>
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                              gap: "10px",
                            }}
                          >
                            {pagedFollowedUps.map((up) => {
                              const primarySmartGroup = getUpSmartGroups(up)[0] || "";
                              const meta = resolveSmartGroupMeta(primarySmartGroup || "other", primarySmartGroup ? getSmartGroupLabel(primarySmartGroup) : "其他");
                              const smartGroupLabel = primarySmartGroup ? meta.label : "未分配智能组";
                              const originalGroupNames = getUpOriginalGroupNames(up);
                              const manualExtra = manualPoolIdSet.has(up.mid);
                              return (
                                <div
                                  key={up.mid}
                                  style={{
                                    padding: "12px",
                                    borderRadius: "var(--radius-sm)",
                                    border: "1px solid var(--border-light)",
                                    background: "var(--bg-hover)",
                                    textAlign: "left",
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "8px",
                                  }}
                                >
                                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                    <div
                                      style={{
                                        width: "34px",
                                        height: "34px",
                                        borderRadius: "50%",
                                        background: "linear-gradient(135deg, #00AEEC, #FB7299)",
                                        color: "white",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        flexShrink: 0,
                                        fontSize: "0.875rem",
                                        fontWeight: 700,
                                      }}
                                    >
                                      {up.uname.charAt(0).toUpperCase()}
                                    </div>
                                    <div style={{ minWidth: 0, flex: 1 }}>
                                      <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-main)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                        {up.uname}
                                      </div>
                                      <div style={{ fontSize: "0.75rem", color: meta.accent, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                        {(originalGroupNames[0] || "未分组")} · {smartGroupLabel}
                                      </div>
                                    </div>
                                  </div>
                                  {(up.sign || up.official_desc) && (
                                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                                      {up.sign || up.official_desc}
                                    </div>
                                  )}
                                  {originalGroupNames.length > 0 && (
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                                      {originalGroupNames.slice(0, 3).map((tagName) => (
                                        <span
                                          key={tagName}
                                          style={{
                                            padding: "3px 8px",
                                            borderRadius: "9999px",
                                            background: "rgba(251, 114, 153, 0.1)",
                                            color: "#D64078",
                                            fontSize: "0.6875rem",
                                            fontWeight: 700,
                                          }}
                                        >
                                          {tagName}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => void toggleManualMonitoredUp(up.mid)}
                                    style={{
                                      marginTop: "auto",
                                      padding: "8px 10px",
                                      borderRadius: "var(--radius-sm)",
                                      border: "1px solid var(--border-light)",
                                      background: manualExtra ? "rgba(0, 174, 236, 0.12)" : "var(--bg-card)",
                                      color: manualExtra ? "#078FBF" : "var(--text-secondary)",
                                      fontSize: "0.75rem",
                                      fontWeight: 700,
                                      cursor: "pointer",
                                    }}
                                  >
                                    {manualExtra ? "移出固定监督" : "加入固定监督"}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                          <PaginationControls
                            totalCount={filteredFollowedUps.length}
                            page={safeFollowedResultPage}
                            pageSize={followedResultPageSize}
                            itemLabel="个 UP"
                            pageSizeOptions={PAGINATION_SIZE_OPTIONS}
                            onPageChange={setFollowedResultPage}
                            onPageSizeChange={(nextPageSize) => setFollowedResultPageSize(nextPageSize === 50 ? 50 : 20)}
                            emptyText="当前没有匹配的 UP"
                          />
                        </>
                      ) : (
                        <div style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
                          {followedUps.length > 0 ? "这个筛选里没有匹配的 UP。" : "连接 Cookie 后会自动读取你的关注列表。"}
                        </div>
                      )
                    )}
                  </div>
                </div>
              </ExpandableSection>

              <ExpandableSection
                title="智能分组手动管理"
                summary="这里改成全部UP主分组编辑器。点一个 UP 后，会在卡片下方一次性编辑多个智能组，也能补充多个默认分组。"
                badge={smartGroupsReady && managedSmartGroupOption ? `${manualGroupingUps.length} 个可编辑UP` : "等待智能分组"}
                accent="#FB7299"
                icon={<FolderHeart size={16} />}
                open={showSmartGroupManagementDetail}
                onToggle={() => setShowSmartGroupManagementDetail((value) => !value)}
              >
                {!smartGroupsReady || !managedSmartGroupOption ? (
                  <div style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
                    先完成一次“共享智能分组”，这里才会出现可管理的智能组成员。
                  </div>
                ) : (
                  <>
                    <div
                      style={{
                        padding: "12px 14px",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border-light)",
                        background: "linear-gradient(135deg, rgba(251, 114, 153, 0.08), rgba(14, 165, 233, 0.05))",
                        fontSize: "0.75rem",
                        color: "var(--text-secondary)",
                        lineHeight: 1.7,
                      }}
                    >
                      这里不再只是“往一个组里补成员”。你可以从全部UP主、当前筛选结果，或某个智能组内挑一个 UP，
                      然后直接在卡片下方勾选它要加入的多个智能组；默认分组也支持手动补充。原生默认分组会保留，只能额外加组。
                    </div>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                      {smartGroupOptions.map((group) => {
                        const active = managedSmartGroup === group.value;
                        const meta = resolveSmartGroupMeta(group.value, group.label);
                        return (
                          <button
                            key={group.value}
                            type="button"
                            onClick={() => setManagedSmartGroup(group.value)}
                            style={{
                              padding: "8px 12px",
                              borderRadius: "var(--radius-sm)",
                              border: "1px solid",
                              borderColor: active ? meta.accent : "var(--border-light)",
                              background: active ? meta.bg : "var(--bg-hover)",
                              color: active ? meta.accent : "var(--text-secondary)",
                              fontSize: "0.8125rem",
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            {group.label} {groupCounts[group.value] ? `· ${groupCounts[group.value]}` : ""}
                          </button>
                        );
                      })}
                    </div>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                      <span>当前聚焦 {managedSmartGroupOption.label}</span>
                      <span>组内 {managedSmartGroupMembers.length} 个 UP</span>
                      <span>全部UP主 {followedUps.length} 个</span>
                      <span>当前筛选 {filteredFollowedUps.length} 个</span>
                      <span>支持一次编辑多个智能组和默认分组</span>
                    </div>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                      {[
                        { value: "all" as const, label: `全部UP主 · ${followedUps.length}` },
                        { value: "filtered" as const, label: `当前筛选 · ${filteredFollowedUps.length}` },
                        { value: "managed" as const, label: `${managedSmartGroupOption.label} · ${managedSmartGroupMembers.length}` },
                      ].map((scope) => {
                        const active = manualGroupingScope === scope.value;
                        return (
                          <button
                            key={scope.value}
                            type="button"
                            onClick={() => setManualGroupingScope(scope.value)}
                            style={{
                              padding: "8px 12px",
                              borderRadius: "var(--radius-sm)",
                              border: "1px solid",
                              borderColor: active ? managedSmartGroupMeta.accent : "var(--border-light)",
                              background: active ? managedSmartGroupMeta.bg : "var(--bg-hover)",
                              color: active ? managedSmartGroupMeta.accent : "var(--text-secondary)",
                              fontSize: "0.8125rem",
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            {scope.label}
                          </button>
                        );
                      })}
                    </div>

                    <div
                      style={{
                        padding: "14px",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border-light)",
                        background: "var(--bg-hover)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "12px",
                      }}
                    >
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center", justifyContent: "space-between" }}>
                        <div>
                          <div style={{ fontSize: "0.875rem", fontWeight: 800, color: "var(--text-main)" }}>
                            {manualGroupingScope === "all"
                              ? "全部UP主"
                              : manualGroupingScope === "filtered"
                                ? "当前筛选结果"
                                : `${managedSmartGroupOption.label} 组内UP`}
                          </div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                            点一个 UP 后，分组选项会直接在这张卡片下面展开，不再固定在右侧常驻显示。
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                          <button
                            type="button"
                            onClick={() => void handleLoadFollowedUps(false, true)}
                            disabled={followedUpsLoading}
                            style={{
                              padding: "7px 10px",
                              borderRadius: "var(--radius-sm)",
                              border: "1px solid var(--border-light)",
                              background: "var(--bg-card)",
                              color: followedUpsLoading ? "var(--text-muted)" : "var(--text-secondary)",
                              fontSize: "0.75rem",
                              fontWeight: 700,
                              cursor: followedUpsLoading ? "not-allowed" : "pointer",
                            }}
                          >
                            {followedUpsLoading ? "刷新中..." : "刷新UP列表"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowManualGroupingUpList((value) => !value)}
                            style={{
                              padding: "7px 10px",
                              borderRadius: "var(--radius-sm)",
                              border: "1px solid var(--border-light)",
                              background: "var(--bg-card)",
                              color: "var(--text-secondary)",
                              fontSize: "0.75rem",
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            {showManualGroupingUpList ? "隐藏UP列表" : "展开UP列表"}
                          </button>
                        </div>
                      </div>

                      <input
                        type="text"
                        value={manualGroupingSearch}
                        onChange={(e) => setManualGroupingSearch(e.target.value)}
                        placeholder="搜索要编辑分组的 UP 名 / 简介"
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid var(--border-light)",
                          background: "var(--bg-input)",
                          color: "var(--text-main)",
                          fontSize: "0.875rem",
                        }}
                      />

                      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        <span>当前范围 {manualGroupingUps.length} 个 UP</span>
                        <span>聚焦智能组 {managedSmartGroupOption.label}</span>
                        <span>搜索词 {manualGroupingSearch.trim() || "无"}</span>
                        <span>桌面端每行约 3 到 4 个 UP</span>
                      </div>

                      {showManualGroupingUpList && manualGroupingUps.length > 0 && (
                        <PaginationControls
                          totalCount={manualGroupingUps.length}
                          page={safeManualGroupingPage}
                          pageSize={manualGroupingPageSize}
                          itemLabel="个 UP"
                          pageSizeOptions={PAGINATION_SIZE_OPTIONS}
                          onPageChange={setManualGroupingPage}
                          onPageSizeChange={(nextPageSize) => setManualGroupingPageSize(nextPageSize === 50 ? 50 : 20)}
                          emptyText="这个范围里没有可编辑的 UP"
                        />
                      )}

                      {showManualGroupingUpList ? (
                        manualGroupingUps.length > 0 ? (
                          <>
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                                gap: "12px",
                                alignItems: "start",
                              }}
                            >
                              {pagedManualGroupingUps.map((up) => {
                                const selected = editingGroupedUpId === up.mid;
                                const smartLabels = selected
                                  ? editingGroupedUpSmartGroups.map((groupValue) => getSmartGroupLabel(groupValue))
                                  : getUpSmartGroups(up).map((groupValue) => getSmartGroupLabel(groupValue));
                                const originalLabels = selected
                                  ? editingGroupedUpEffectiveOriginalIds
                                    .map((groupId) => originalGroupMap.get(groupId)?.name || "")
                                    .filter(Boolean)
                                  : getUpOriginalGroupNames(up);

                                return (
                                  <div
                                    key={up.mid}
                                    style={{
                                      padding: "12px",
                                      borderRadius: "var(--radius-sm)",
                                      border: "1px solid",
                                      borderColor: selected ? managedSmartGroupMeta.accent : "var(--border-light)",
                                      background: selected ? managedSmartGroupMeta.bg : "var(--bg-card)",
                                      display: "flex",
                                      flexDirection: "column",
                                      gap: "10px",
                                    }}
                                  >
                                    <button
                                      type="button"
                                      onClick={() => beginEditUpGrouping(up)}
                                      style={{
                                        padding: 0,
                                        border: "none",
                                        background: "transparent",
                                        textAlign: "left",
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: "8px",
                                        cursor: "pointer",
                                      }}
                                    >
                                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
                                        <div style={{ minWidth: 0 }}>
                                          <div style={{ fontSize: "0.875rem", fontWeight: 800, color: selected ? managedSmartGroupMeta.accent : "var(--text-main)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                            {up.uname}
                                          </div>
                                          {(up.sign || up.official_desc) && (
                                            <div style={{ marginTop: "4px", fontSize: "0.6875rem", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                              {up.sign || up.official_desc}
                                            </div>
                                          )}
                                        </div>
                                        <span
                                          style={{
                                            padding: "4px 8px",
                                            borderRadius: "999px",
                                            background: selected ? "rgba(255,255,255,0.74)" : "var(--bg-hover)",
                                            color: selected ? managedSmartGroupMeta.accent : "var(--text-secondary)",
                                            fontSize: "0.6875rem",
                                            fontWeight: 700,
                                            flexShrink: 0,
                                          }}
                                        >
                                          {selected ? "展开中" : "编辑分组"}
                                        </span>
                                      </div>

                                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                                        {smartLabels.slice(0, 3).map((label) => (
                                          <span
                                            key={`${up.mid}-smart-${label}`}
                                            style={{
                                              padding: "3px 8px",
                                              borderRadius: "999px",
                                              background: "rgba(14, 165, 233, 0.10)",
                                              color: "#0284C7",
                                              fontSize: "0.6875rem",
                                              fontWeight: 700,
                                            }}
                                          >
                                            {label}
                                          </span>
                                        ))}
                                        {originalLabels.slice(0, 2).map((label) => (
                                          <span
                                            key={`${up.mid}-original-${label}`}
                                            style={{
                                              padding: "3px 8px",
                                              borderRadius: "999px",
                                              background: "rgba(251, 114, 153, 0.10)",
                                              color: "#D64078",
                                              fontSize: "0.6875rem",
                                              fontWeight: 700,
                                            }}
                                          >
                                            {label}
                                          </span>
                                        ))}
                                      </div>
                                    </button>

                                    {selected && editingGroupedUp?.mid === up.mid && (
                                      <div
                                        style={{
                                          display: "flex",
                                          flexDirection: "column",
                                          gap: "12px",
                                          paddingTop: "12px",
                                          borderTop: `1px solid ${managedSmartGroupMeta.accent}33`,
                                        }}
                                      >
                                      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "flex-start" }}>
                                        <div>
                                          <div style={{ fontSize: "0.875rem", fontWeight: 800, color: managedSmartGroupMeta.accent }}>
                                            编辑 {up.uname}
                                          </div>
                                          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "4px", lineHeight: 1.6 }}>
                                            勾选这个 UP 要加入的多个智能组；默认分组是在原生标签基础上做补充，不会覆盖 B 站原始分组。
                                          </div>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={closeEditUpGrouping}
                                          style={{
                                            padding: "6px 8px",
                                            borderRadius: "var(--radius-sm)",
                                            border: "1px solid var(--border-light)",
                                            background: "var(--bg-card)",
                                            color: "var(--text-secondary)",
                                            fontSize: "0.75rem",
                                            fontWeight: 700,
                                            cursor: "pointer",
                                            flexShrink: 0,
                                          }}
                                        >
                                          收起
                                        </button>
                                      </div>

                                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                                        {editingGroupedUpSmartGroups.map((groupValue) => {
                                          const meta = resolveSmartGroupMeta(groupValue, getSmartGroupLabel(groupValue));
                                          return (
                                            <span
                                              key={`current-smart-${up.mid}-${groupValue}`}
                                              style={{
                                                padding: "4px 8px",
                                                borderRadius: "999px",
                                                background: meta.bg,
                                                color: meta.accent,
                                                fontSize: "0.6875rem",
                                                fontWeight: 700,
                                              }}
                                            >
                                              智能组 · {getSmartGroupLabel(groupValue)}
                                            </span>
                                          );
                                        })}
                                        {editingGroupedUpEffectiveOriginalIds.map((groupId) => {
                                          const label = originalGroupMap.get(groupId)?.name || "";
                                          if (!label) {
                                            return null;
                                          }
                                          return (
                                            <span
                                              key={`current-original-${up.mid}-${groupId}`}
                                              style={{
                                                padding: "4px 8px",
                                                borderRadius: "999px",
                                                background: "rgba(251, 114, 153, 0.10)",
                                                color: "#D64078",
                                                fontSize: "0.6875rem",
                                                fontWeight: 700,
                                              }}
                                            >
                                              默认组 · {label}
                                            </span>
                                          );
                                        })}
                                      </div>

                                      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                                        <div style={{ fontSize: "0.8125rem", fontWeight: 800, color: "var(--text-main)" }}>智能分组</div>
                                        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                                          {smartGroupOptions.map((group) => {
                                            const groupSelected = editingSmartGroupValues.includes(group.value);
                                            const meta = resolveSmartGroupMeta(group.value, group.label);
                                            return (
                                              <button
                                                key={`edit-smart-${up.mid}-${group.value}`}
                                                type="button"
                                                onClick={() => toggleEditingSmartGroup(group.value)}
                                                style={{
                                                  padding: "8px 12px",
                                                  borderRadius: "var(--radius-sm)",
                                                  border: "1px solid",
                                                  borderColor: groupSelected ? meta.accent : "var(--border-light)",
                                                  background: groupSelected ? meta.bg : "var(--bg-card)",
                                                  color: groupSelected ? meta.accent : "var(--text-secondary)",
                                                  fontSize: "0.8125rem",
                                                  fontWeight: 700,
                                                  cursor: "pointer",
                                                }}
                                              >
                                                {group.label}
                                              </button>
                                            );
                                          })}
                                        </div>
                                      </div>

                                      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                                        <div style={{ fontSize: "0.8125rem", fontWeight: 800, color: "var(--text-main)" }}>默认分组补充</div>
                                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
                                          带“原生”的默认分组来自 B 站关注分组，只读保留。你可以额外勾选更多默认分组，让这个 UP 同时出现在多个默认筛选里。
                                        </div>
                                        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                                          {originalGroups.map((group) => {
                                            const rawMember = isUpRawOriginalGroupMember(up, group.tag_id);
                                            const groupSelected = editingGroupedUpEffectiveOriginalIds.includes(group.tag_id);
                                            return (
                                              <button
                                                key={`edit-original-${up.mid}-${group.tag_id}`}
                                                type="button"
                                                onClick={() => toggleEditingOriginalGroup(up, group.tag_id)}
                                                disabled={rawMember}
                                                style={{
                                                  padding: "8px 12px",
                                                  borderRadius: "var(--radius-sm)",
                                                  border: "1px solid",
                                                  borderColor: groupSelected ? "#FB7299" : "var(--border-light)",
                                                  background: groupSelected ? "rgba(251, 114, 153, 0.12)" : "var(--bg-card)",
                                                  color: groupSelected ? "#D64078" : "var(--text-secondary)",
                                                  fontSize: "0.8125rem",
                                                  fontWeight: 700,
                                                  cursor: rawMember ? "default" : "pointer",
                                                  opacity: rawMember ? 0.92 : 1,
                                                }}
                                              >
                                                {group.name}{rawMember ? " · 原生" : groupSelected ? " · 已补充" : ""}
                                              </button>
                                            );
                                          })}
                                        </div>
                                      </div>

                                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                                        <button
                                          type="button"
                                          onClick={() => syncEditUpGroupingDraft(up)}
                                          style={{
                                            padding: "8px 12px",
                                            borderRadius: "var(--radius-sm)",
                                            border: "1px solid var(--border-light)",
                                            background: "var(--bg-card)",
                                            color: "var(--text-secondary)",
                                            fontSize: "0.75rem",
                                            fontWeight: 700,
                                            cursor: "pointer",
                                          }}
                                        >
                                          恢复当前保存状态
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => void saveEditedUpGrouping()}
                                          disabled={savingGroupingEditor || editingSmartGroupValues.length === 0}
                                          style={{
                                            padding: "8px 12px",
                                            borderRadius: "var(--radius-sm)",
                                            border: "none",
                                            background: savingGroupingEditor || editingSmartGroupValues.length === 0
                                              ? "var(--bg-muted)"
                                              : `linear-gradient(135deg, ${managedSmartGroupMeta.accent}, #10B981)`,
                                            color: savingGroupingEditor || editingSmartGroupValues.length === 0 ? "var(--text-muted)" : "white",
                                            fontSize: "0.75rem",
                                            fontWeight: 800,
                                            cursor: savingGroupingEditor || editingSmartGroupValues.length === 0 ? "not-allowed" : "pointer",
                                          }}
                                        >
                                          {savingGroupingEditor ? "保存中..." : "保存分组设置"}
                                        </button>
                                      </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                            <PaginationControls
                              totalCount={manualGroupingUps.length}
                              page={safeManualGroupingPage}
                              pageSize={manualGroupingPageSize}
                              itemLabel="个 UP"
                              pageSizeOptions={PAGINATION_SIZE_OPTIONS}
                              onPageChange={setManualGroupingPage}
                              onPageSizeChange={(nextPageSize) => setManualGroupingPageSize(nextPageSize === 50 ? 50 : 20)}
                              emptyText="这个范围里没有可编辑的 UP"
                            />
                          </>
                        ) : (
                          <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                            这个范围里没有可编辑的 UP。可以切到“全部UP主”，或者修改搜索词。
                          </div>
                        )
                      ) : (
                        <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                          UP 列表已隐藏。需要时再展开。
                        </div>
                      )}
                    </div>
                  </>
                )}
              </ExpandableSection>

              <SharedSignalMappingPanel
                title="共享分组规则"
                entries={trackerConfig.shared_signal_entries}
                groupOptions={smartGroupOptions}
                saving={savingSignalMappings}
                updatedAt={trackerConfig.shared_creator_grouping.updated_at}
                onSave={handleSaveSharedSignalMappings}
                description="原始标签 -> 共享规则 -> 共享组 -> 作者入组。比如把“Obsidian”“知识库”“双链笔记”并到同一个共享组，也可以让一个标签同时挂多个共享组。保存后，重新执行一次“仅整理博主 / UP”或“共享智能分组”，作者会按这套规则重排。"
              />
            </div>
          )}

          {panelTab === "dynamics" && (
            <div style={{ overflow: "auto", display: "flex", flexDirection: "column", gap: "16px" }}>
              <ExpandableSection
                title="动态搜索结果"
                summary="这里集中展示刚才的全关注流预览、主动爬取和分组抓取结果。结果区可以单独收起，不影响上面的搜索与筛选。"
                badge={hasFetchedDynamics ? `${displayedDynamics.length} 条` : "未获取"}
                accent="#00AEEC"
                icon={<Tv size={16} />}
                open={showDynamicResultList}
                onToggle={() => setShowDynamicResultList((value) => !value)}
              >
                {renderResultList("点击上方「预览当前词 / 标签」开始")}
              </ExpandableSection>
            </div>
          )}
        </div>
      </PageContent>
    </PageContainer>
  );
}
