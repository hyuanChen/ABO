import { useState, useEffect } from "react";
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
import { useToast } from "../../components/Toast";
import { api } from "../../core/api";
import { BilibiliCookieModal } from "./BilibiliCookieModal";
import { BilibiliFavoritesPage } from "./BilibiliFavoritesPage";
import {
  BiliDynamic,
  BiliFollowedUp,
  BiliOriginalFollowedGroup,
  BilibiliSmartGroupOption,
  BilibiliSmartGroupProfile,
  BilibiliSmartGroupTask,
  bilibiliFetchFollowed,
  bilibiliFetchFollowedUps,
  bilibiliGetConfig,
  bilibiliGetCookieFromBrowser,
  bilibiliDebugTest,
  DebugTestResult,
  CrawlToVaultResponse,
  bilibiliSaveSelectedDynamics,
  bilibiliStartFollowedUpsCrawl,
  bilibiliGetFollowedUpsCrawlTask,
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

const FOLLOWED_UPS_TASK_KEY = "bilibili_followed_ups_task_id";
const SMART_GROUP_TASK_KEY = "bilibili_followed_smart_group_task_id";
const BILIBILI_DYNAMICS_CACHE_KEY = "bilibili_dynamics_cache";
const BILIBILI_FOLLOWED_CACHE_KEY = "bilibili_followed_cache";

function readJsonCache<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function proxiedImage(url: string): string {
  if (!url) return "";
  return `http://127.0.0.1:8765/api/proxy/image?url=${encodeURIComponent(url)}`;
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

interface BilibiliTrackerConfig {
  up_uids: string[];
  followed_up_groups: string[];
  followed_up_original_groups: number[];
  followed_up_filter_mode: TrackerFilterMode;
  followed_up_group_options: BilibiliSmartGroupOption[];
  creator_profiles: Record<string, BilibiliSmartGroupProfile>;
}

export function BilibiliTool() {
  const toast = useToast();
  const [panelTab, setPanelTab] = useState<BilibiliPanelTab>(() => {
    const saved = localStorage.getItem("bilibili_tool_panel");
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
  const [sessdata, setSessdata] = useState(() => localStorage.getItem("bilibili_sessdata") || "");

  // Filter state
  const [keywords, setKeywords] = useState<string[]>(() => {
    const saved = localStorage.getItem("bilibili_keywords");
    return saved ? JSON.parse(saved) : [];
  });
  const [keywordInput, setKeywordInput] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<string[]>(["video", "image", "text", "article"]);
  const [daysBack, setDaysBack] = useState(7);
  const [daysBackInput, setDaysBackInput] = useState("7");
  const [limit, setLimit] = useState(50);
  const [limitInput, setLimitInput] = useState("50");

  // Results state
  const [dynamics, setDynamics] = useState<BiliDynamic[]>(() => readJsonCache(BILIBILI_DYNAMICS_CACHE_KEY, []));
  const [loading, setLoading] = useState(false);
  const [totalFound, setTotalFound] = useState(() => readJsonCache<number>("bilibili_dynamics_total", 0));
  const [selectedDynamicIds, setSelectedDynamicIds] = useState<Set<string>>(new Set());
  const [followedUps, setFollowedUps] = useState<BiliFollowedUp[]>(() => readJsonCache(BILIBILI_FOLLOWED_CACHE_KEY, []));
  const [originalGroups, setOriginalGroups] = useState<BiliOriginalFollowedGroup[]>(() => readJsonCache("bilibili_followed_groups_cache", []));
  const [followedUpsLoading, setFollowedUpsLoading] = useState(false);
  const [followedUpsLoaded, setFollowedUpsLoaded] = useState(() => readJsonCache<boolean>("bilibili_followed_loaded", false));
  const [followedUpsTask, setFollowedUpsTask] = useState<FollowedUpsCrawlTask | null>(null);
  const [smartGroupTask, setSmartGroupTask] = useState<BilibiliSmartGroupTask | null>(null);
  const [smartGroupRunning, setSmartGroupRunning] = useState(false);
  const [followedUpSearch, setFollowedUpSearch] = useState("");
  const [selectedOriginalGroup, setSelectedOriginalGroup] = useState<number | "all">("all");
  const [selectedFollowedGroup, setSelectedFollowedGroup] = useState<string>("all");
  const [showOriginalGroupFilter, setShowOriginalGroupFilter] = useState(false);
  const [showSmartGroupFilter, setShowSmartGroupFilter] = useState(false);
  const [managedSmartGroup, setManagedSmartGroup] = useState<string>(
    DEFAULT_SMART_GROUP_OPTIONS[0]?.value || "other"
  );
  const [trackerConfig, setTrackerConfig] = useState<BilibiliTrackerConfig>({
    up_uids: [],
    followed_up_groups: [],
    followed_up_original_groups: [],
    followed_up_filter_mode: "and",
    followed_up_group_options: DEFAULT_SMART_GROUP_OPTIONS,
    creator_profiles: {},
  });

  // Debug state
  const [debugResult, setDebugResult] = useState<DebugTestResult | null>(null);
  const [debugLoading, setDebugLoading] = useState(false);

  // Vault crawl state
  const [vaultCrawling, setVaultCrawling] = useState(false);
  const [vaultResult, setVaultResult] = useState<CrawlToVaultResponse | null>(null);

  // Persist keywords
  useEffect(() => {
    localStorage.setItem("bilibili_keywords", JSON.stringify(keywords));
  }, [keywords]);

  // Persist sessdata
  useEffect(() => {
    if (sessdata) {
      localStorage.setItem("bilibili_sessdata", sessdata);
    } else {
      localStorage.removeItem("bilibili_sessdata");
    }
  }, [sessdata]);

  useEffect(() => {
    localStorage.setItem("bilibili_tool_panel", panelTab);
  }, [panelTab]);

  useEffect(() => {
    localStorage.setItem(BILIBILI_DYNAMICS_CACHE_KEY, JSON.stringify(dynamics));
    localStorage.setItem("bilibili_dynamics_total", JSON.stringify(totalFound));
  }, [dynamics, totalFound]);

  useEffect(() => {
    localStorage.setItem(BILIBILI_FOLLOWED_CACHE_KEY, JSON.stringify(followedUps));
    localStorage.setItem("bilibili_followed_groups_cache", JSON.stringify(originalGroups));
    localStorage.setItem("bilibili_followed_loaded", JSON.stringify(followedUpsLoaded));
  }, [followedUps, originalGroups, followedUpsLoaded]);

  useEffect(() => {
    const taskId = localStorage.getItem(FOLLOWED_UPS_TASK_KEY);
    if (!taskId) {
      return;
    }
    void resumeFollowedUpsTask(taskId, true);
  }, []);

  useEffect(() => {
    const taskId = localStorage.getItem(SMART_GROUP_TASK_KEY);
    if (!taskId) {
      return;
    }
    void resumeSmartGroupTask(taskId, true);
  }, []);

  useEffect(() => {
    setDaysBackInput(String(daysBack));
  }, [daysBack]);

  useEffect(() => {
    setLimitInput(String(limit));
  }, [limit]);

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
      setTrackerConfig({
        up_uids: config.up_uids || [],
        followed_up_groups: config.followed_up_groups || [],
        followed_up_original_groups: config.followed_up_original_groups || [],
        followed_up_filter_mode: config.followed_up_filter_mode === "smart_only" ? "smart_only" : "and",
        followed_up_group_options: (config.followed_up_group_options || DEFAULT_SMART_GROUP_OPTIONS).length > 0
          ? (config.followed_up_group_options || DEFAULT_SMART_GROUP_OPTIONS)
          : DEFAULT_SMART_GROUP_OPTIONS,
        creator_profiles: config.creator_profiles || {},
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
          localStorage.setItem("bilibili_sessdata", extractedSessdata);
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
    localStorage.setItem("bilibili_sessdata", extracted);
    return extracted;
  }

  const handleAddKeyword = () => {
    const kw = keywordInput.trim();
    if (!kw) return;
    if (keywords.includes(kw)) {
      toast.info("关键词已存在");
      return;
    }
    setKeywords([...keywords, kw]);
    setKeywordInput("");
  };

  const handleRemoveKeyword = (kw: string) => {
    setKeywords(keywords.filter((k) => k !== kw));
  };

  const handleAddPresetKeyword = (kw: string) => {
    if (keywords.includes(kw)) {
      toast.info(`"${kw}" 已添加`);
      return;
    }
    setKeywords([...keywords, kw]);
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
    const normalized = Math.floor(parsed);
    commit(normalized);
    reflect(String(normalized));
  };

  const handleFetch = async () => {
    setLoading(true);
    try {
      const resolvedDaysBack = Number(daysBackInput.trim());
      const safeDaysBack = Number.isFinite(resolvedDaysBack) && resolvedDaysBack >= 1
        ? Math.floor(resolvedDaysBack)
        : daysBack;
      const resolvedLimit = Number(limitInput.trim());
      const safeLimit = Number.isFinite(resolvedLimit) && resolvedLimit >= 1
        ? Math.floor(resolvedLimit)
        : limit;
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

      const activeSessdata = await ensureSessdataFromEdge();
      const dynamicTypes = selectedTypes.map(getDynamicTypeNumber);
      const res = await bilibiliFetchFollowed({
        sessdata: activeSessdata,
        keywords: keywords.length > 0 ? keywords : undefined,
        dynamic_types: dynamicTypes.length > 0 ? dynamicTypes : undefined,
        days_back: safeDaysBack,
        limit: safeLimit,
      });
      setDynamics(res.dynamics);
      setSelectedDynamicIds(new Set());
      setTotalFound(res.total_found);
      if (res.dynamics.length === 0) {
        toast.info("未找到符合条件的动态");
      } else {
        toast.success(`找到 ${res.total_found} 条动态`);
      }
    } catch (err) {
      toast.error("获取失败", err instanceof Error ? err.message : "未知错误");
    } finally {
      setLoading(false);
    }
  };

  const finalizeFollowedUpsTask = (taskId?: string | null) => {
    if (!taskId) return;
    if (localStorage.getItem(FOLLOWED_UPS_TASK_KEY) === taskId) {
      localStorage.removeItem(FOLLOWED_UPS_TASK_KEY);
    }
  };

  const resumeFollowedUpsTask = async (taskId: string, silent = false) => {
    setFollowedUpsLoading(true);
    try {
      while (true) {
        const task = await bilibiliGetFollowedUpsCrawlTask(taskId);
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
          throw new Error(task.error || "关注列表抓取失败");
        }

        await new Promise((resolve) => window.setTimeout(resolve, 900));
      }
    } catch (err) {
      finalizeFollowedUpsTask(taskId);
      if (!silent) {
        toast.error("加载关注失败", err instanceof Error ? err.message : "未知错误");
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
        localStorage.setItem(FOLLOWED_UPS_TASK_KEY, started.task_id);
        await resumeFollowedUpsTask(started.task_id, silent);
      } catch (err) {
        if (!isNotFoundError(err)) {
          throw err;
        }
        finalizeFollowedUpsTask(localStorage.getItem(FOLLOWED_UPS_TASK_KEY));
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
    };
    await api.post("/api/modules/bilibili-tracker/config", nextConfig);
    setTrackerConfig(nextConfig);
    if (successTitle) {
      toast.success(successTitle);
    }
  };

  const finalizeSmartGroupTask = (taskId?: string | null) => {
    if (!taskId) return;
    if (localStorage.getItem(SMART_GROUP_TASK_KEY) === taskId) {
      localStorage.removeItem(SMART_GROUP_TASK_KEY);
    }
  };

  const resumeSmartGroupTask = async (taskId: string, silent = false) => {
    setSmartGroupRunning(true);
    try {
      while (true) {
        const task = await bilibiliGetSmartGroupTask(taskId);
        setSmartGroupTask(task);

        if (task.status === "completed") {
          finalizeSmartGroupTask(taskId);
          await refreshTrackerConfig();
          if (!silent) {
            toast.success("智能分组已更新", task.result?.message || "已同步到日常爬虫监视");
          }
          break;
        }

        if (task.status === "failed") {
          finalizeSmartGroupTask(taskId);
          throw new Error(task.error || "智能分组失败");
        }

        await new Promise((resolve) => window.setTimeout(resolve, 900));
      }
    } catch (err) {
      finalizeSmartGroupTask(taskId);
      if (!silent) {
        toast.error("智能分组失败", err instanceof Error ? err.message : "未知错误");
      }
    } finally {
      setSmartGroupRunning(false);
    }
  };

  const handleBuildSmartGroups = async () => {
    if (smartGroupRunning) return;
    try {
      const activeSessdata = await ensureSessdataFromEdge();
      const started = await bilibiliStartSmartGroupTask({
        sessdata: activeSessdata,
        max_count: 5000,
      });
      localStorage.setItem(SMART_GROUP_TASK_KEY, started.task_id);
      setSmartGroupTask(null);
      await resumeSmartGroupTask(started.task_id);
    } catch (err) {
      toast.error("智能分组失败", err instanceof Error ? err.message : "未知错误");
    }
  };

  const toggleTrackedSmartGroup = async (groupValue: string) => {
    const current = trackerConfig.followed_up_groups || [];
    const next = current.includes(groupValue)
      ? current.filter((item) => item !== groupValue)
      : [...current, groupValue];
    try {
      await saveTrackerConfig({
        followed_up_groups: next,
        followed_up_original_groups: [],
      });
    } catch (err) {
      toast.error("保存失败", err instanceof Error ? err.message : "未知错误");
    }
  };

  const toggleManualMonitoredUp = async (upId: string) => {
    const current = trackerConfig.up_uids || [];
    const next = current.includes(upId)
      ? current.filter((item) => item !== upId)
      : [...current, upId];
    try {
      await saveTrackerConfig({
        up_uids: next,
        followed_up_original_groups: [],
      });
    } catch (err) {
      toast.error("保存失败", err instanceof Error ? err.message : "未知错误");
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "未知时间";
    const date = new Date(dateStr);
    return date.toLocaleString("zh-CN", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
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

  const getUpProfile = (up: BiliFollowedUp): BilibiliSmartGroupProfile | null => (
    trackerConfig.creator_profiles?.[up.mid] || null
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
    const q = followedUpSearch.trim().toLowerCase();
    if (!q) return true;
    return [up.uname, up.sign, up.official_desc].some((value) => value?.toLowerCase().includes(q));
  };

  const resetFollowedUpFilters = () => {
    setSelectedOriginalGroup("all");
    setSelectedFollowedGroup("all");
    setFollowedUpSearch("");
  };

  const saveManualSmartGroupMembership = async (up: BiliFollowedUp, smartGroups: string[]) => {
    const currentProfiles = trackerConfig.creator_profiles || {};
    const currentProfile = currentProfiles[up.mid] || {};
    const nextGroups = Array.from(
      new Set(
        smartGroups
          .map((group) => group.trim())
          .filter(Boolean)
      )
    );
    const nextProfiles = {
      ...currentProfiles,
      [up.mid]: {
        ...currentProfile,
        author: currentProfile.author || up.uname,
        author_id: currentProfile.author_id || up.mid,
        matched_author: currentProfile.matched_author || up.uname,
        manual_override: true,
        smart_groups: nextGroups,
        smart_group_labels: nextGroups.map((group) => getSmartGroupLabel(group)),
      },
    };
    await saveTrackerConfig({ creator_profiles: nextProfiles });
  };

  const addUpToManagedSmartGroup = async (up: BiliFollowedUp, groupValue: string) => {
    try {
      await saveManualSmartGroupMembership(up, [...getUpSmartGroups(up), groupValue]);
    } catch (err) {
      toast.error("保存失败", err instanceof Error ? err.message : "未知错误");
    }
  };

  const removeUpFromManagedSmartGroup = async (up: BiliFollowedUp, groupValue: string) => {
    try {
      await saveManualSmartGroupMembership(
        up,
        getUpSmartGroups(up).filter((group) => group !== groupValue)
      );
    } catch (err) {
      toast.error("保存失败", err instanceof Error ? err.message : "未知错误");
    }
  };

  const followedGroupByAuthorId = Object.fromEntries(
    followedUps.map((up) => [up.mid, getUpSmartGroups(up)[0] || ""])
  ) as Record<string, string>;
  const followedUpByAuthorId = Object.fromEntries(
    followedUps.map((up) => [up.mid, up])
  ) as Record<string, BiliFollowedUp>;

  const filteredFollowedUps = followedUps.filter((up) => {
    if (selectedOriginalGroup !== "all" && !up.tag_ids.includes(selectedOriginalGroup)) {
      return false;
    }
    if (selectedFollowedGroup !== "all" && !getUpSmartGroups(up).includes(selectedFollowedGroup)) {
      return false;
    }
    return matchesFollowedUpSearch(up);
  });

  const displayedDynamics = dynamics.filter((dynamic) => {
    const up = followedUpByAuthorId[dynamic.author_id];
    if (selectedOriginalGroup !== "all" && !(up?.tag_ids || []).includes(selectedOriginalGroup)) {
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
    acc[group.tag_id] = followedUps.filter((up) => up.tag_ids.includes(group.tag_id)).length;
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

  const followStatusTitle = followedUpsLoading
    ? "正在获取关注列表"
    : followedUpsLoaded
      ? "最近一次获取完成"
      : "尚未开始获取";
  const followStatusStage = followedUpsTask?.stage
    || (followedUpsLoaded ? "关注列表已就绪，可继续筛选分组。" : "点击右侧按钮开始获取当前账号关注列表。");
  const followStatusCount = followedUpsTask?.fetched_count ?? followedUps.length;
  const followStatusPage = followedUpsTask?.current_page ?? 0;
  const followStatusProgress = followedUpsLoading
    ? Math.min(96, Math.max(10, Math.round(followStatusCount / 50)))
    : followedUpsLoaded
      ? 100
      : 0;
  const smartGroupStatusTitle = smartGroupRunning
    ? "正在整理收藏 tag 智能分组"
    : smartGroupTask?.status === "completed"
      ? "最近一次智能分组完成"
      : "尚未生成智能分组";
  const smartGroupStatusStage = smartGroupTask?.stage
    || (smartGroupOptions.length > 0 && trackerConfig.creator_profiles && Object.keys(trackerConfig.creator_profiles).length > 0
      ? "已生成智能分组，可直接用于关注监控与日常爬虫。"
      : "点击右侧“智能分组”，根据本地收藏和标签反推已关注 UP。");
  const smartGroupStatusProgress = smartGroupRunning
    ? smartGroupTask?.progress || 18
    : smartGroupTask?.status === "completed"
      ? 100
      : 0;
  const selectedTrackedSmartGroups = smartGroupOptions
    .filter((group) => trackerConfig.followed_up_groups.includes(group.value))
    .map((group) => {
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
  const trackedGroupUpIds = new Set(
    selectedTrackedSmartGroups.flatMap((group) => group.members.map((up) => up.mid))
  );
  const specialPoolIds = Array.from(new Set(trackerConfig.up_uids || []));
  const specialPoolMembers = specialPoolIds.map((upId) => ({
    id: upId,
    up: followedUpByAuthorId[upId],
  }));
  const trackedUpIds = new Set<string>([
    ...Array.from(trackedGroupUpIds),
    ...specialPoolIds,
  ]);
  const monitorCategoryCount = selectedTrackedSmartGroups.length + (specialPoolMembers.length > 0 ? 1 : 0);
  const managedSmartGroupOption = smartGroupOptions.find((group) => group.value === managedSmartGroup) || smartGroupOptions[0];
  const managedSmartGroupMeta = managedSmartGroupOption
    ? resolveSmartGroupMeta(managedSmartGroupOption.value, managedSmartGroupOption.label)
    : resolveSmartGroupMeta("other", "其他");
  const managedSmartGroupMembers = managedSmartGroupOption
    ? followedUps.filter((up) => getUpSmartGroups(up).includes(managedSmartGroupOption.value))
    : [];
  const smartGroupManagementCandidates = managedSmartGroupOption
    ? followedUps.filter((up) => {
      if (selectedOriginalGroup !== "all" && !up.tag_ids.includes(selectedOriginalGroup)) {
        return false;
      }
      if (selectedFollowedGroup !== "all" && selectedFollowedGroup !== managedSmartGroupOption.value && !getUpSmartGroups(up).includes(selectedFollowedGroup)) {
        return false;
      }
      if (!matchesFollowedUpSearch(up)) {
        return false;
      }
      return !getUpSmartGroups(up).includes(managedSmartGroupOption.value);
    })
    : [];

  const handleSaveSelectedDynamics = async () => {
    const selectedDynamics = displayedDynamics.filter((dynamic) => selectedDynamicIds.has(dynamic.id));
    if (selectedDynamics.length === 0) {
      toast.error("请先选择要入库的动态");
      return;
    }
    setVaultCrawling(true);
    try {
      const result = await bilibiliSaveSelectedDynamics({
        dynamics: selectedDynamics,
      });
      setVaultResult(result);
      toast.success("Bilibili 已写入情报库", `已入库 ${selectedDynamics.length} 条动态`);
    } catch (err) {
      toast.error("入库失败", err instanceof Error ? err.message : "未知错误");
    } finally {
      setVaultCrawling(false);
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
    localStorage.setItem("bilibili_tool_panel", tab);
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

  const renderResultList = (emptyDescription: string) => {
    if (loading) {
      return <LoadingState message="正在获取动态..." />;
    }

    if (dynamics.length === 0) {
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
          <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
            共抓到 <strong style={{ color: "var(--text-main)" }}>{totalFound}</strong> 条动态，
            当前显示 <strong style={{ color: "var(--text-main)" }}>{displayedDynamics.length}</strong> 条
            {keywords.length > 0 && <span>，关键词: {keywords.join(", ")}</span>}
          </span>
          <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
            最近 {daysBack} 天
          </span>
        </div>

        {displayedDynamics.length === 0 ? (
          <EmptyState
            icon={Filter}
            title="这个分组里没有匹配推送"
            description="换一个分组、清空 UP 选择，或者调整推送关键词。"
          />
        ) : (
          <>
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
                    先预览，再单独入库
                  </div>
                  <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                    当前结果 {displayedDynamics.length} 条，已选 {displayedSelectedCount} 条写入情报库
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
                    全选当前结果
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
                </div>
              </div>
            </Card>

            {displayedDynamics.map((dynamic) => {
          const typeConfig = DYNAMIC_TYPE_MAP[dynamic.dynamic_type] || DYNAMIC_TYPE_MAP.text;
          const TypeIcon = typeConfig.icon;
          const selected = selectedDynamicIds.has(dynamic.id);

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
              <Card
                noPadding
                style={{
                  border: selected ? `1px solid ${typeConfig.color}` : undefined,
                  borderLeft: `4px solid ${typeConfig.color}`,
                }}
              >
                <div style={{ padding: "16px 20px" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: "12px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <label
                        onClick={(event) => event.stopPropagation()}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          padding: "4px 8px",
                          borderRadius: "9999px",
                          background: selected ? `${typeConfig.color}18` : "var(--bg-hover)",
                          color: selected ? typeConfig.color : "var(--text-secondary)",
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleDynamicSelection(dynamic.id)}
                        />
                        入库
                      </label>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          padding: "4px 10px",
                          borderRadius: "9999px",
                          background: `${typeConfig.color}15`,
                          color: typeConfig.color,
                          fontSize: "0.75rem",
                          fontWeight: 600,
                        }}
                      >
                        <TypeIcon size={12} />
                        {typeConfig.label}
                      </span>
                      <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                        {formatDate(dynamic.published_at)}
                      </span>
                    </div>
                    <a
                      href={dynamic.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(event) => event.stopPropagation()}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        color: "var(--text-muted)",
                        textDecoration: "none",
                        fontSize: "0.8125rem",
                      }}
                    >
                      查看原文
                      <ExternalLink size={14} />
                    </a>
                  </div>

                  <div style={{ marginBottom: "10px" }}>
                    <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-main)", marginBottom: "4px" }}>
                      {dynamic.author}
                    </div>
                    <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-main)", lineHeight: 1.5 }}>
                      {dynamic.title}
                    </div>
                  </div>

                  {dynamic.content && (
                    <div
                      style={{
                        fontSize: "0.875rem",
                        color: "var(--text-secondary)",
                        lineHeight: 1.7,
                        whiteSpace: "pre-wrap",
                        marginBottom: "12px",
                      }}
                    >
                      {dynamic.content}
                    </div>
                  )}

                  {dynamic.tags?.length > 0 && (
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
                      {dynamic.tags.slice(0, 8).map((tag) => (
                        <span
                          key={`${dynamic.id}-${tag}`}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "4px 10px",
                            borderRadius: "9999px",
                            background: "var(--bg-hover)",
                            border: "1px solid var(--border-light)",
                            color: "var(--text-secondary)",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                          }}
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {dynamic.images.length > 0 && (
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
                      {dynamic.images.slice(0, 4).map((img, idx) => (
                        <div
                          key={idx}
                          style={{
                            width: "120px",
                            height: "80px",
                            borderRadius: "var(--radius-sm)",
                            overflow: "hidden",
                            background: "var(--bg-muted)",
                            position: "relative",
                          }}
                        >
                          <img
                            src={proxiedImage(img)}
                            alt=""
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                            }}
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = "none";
                            }}
                          />
                          {dynamic.images.length > 4 && idx === 3 && (
                            <div
                              style={{
                                position: "absolute",
                                inset: 0,
                                background: "rgba(0,0,0,0.5)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                color: "white",
                                fontSize: "0.875rem",
                                fontWeight: 600,
                              }}
                            >
                              +{dynamic.images.length - 4}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {dynamic.dynamic_type === "video" && dynamic.pic && (
                    <img
                      src={proxiedImage(dynamic.pic)}
                      alt={dynamic.title}
                      style={{
                        width: "100%",
                        maxHeight: "320px",
                        objectFit: "cover",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border-light)",
                        marginBottom: "12px",
                      }}
                    />
                  )}

                  <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                    <span>{dynamic.dynamic_type}</span>
                    {dynamic.bvid && <span>{dynamic.bvid}</span>}
                    {dynamic.author_id && followedGroupByAuthorId[dynamic.author_id] && (
                      <span style={{ color: resolveSmartGroupMeta(followedGroupByAuthorId[dynamic.author_id], getSmartGroupLabel(followedGroupByAuthorId[dynamic.author_id])).accent }}>
                        {getSmartGroupLabel(followedGroupByAuthorId[dynamic.author_id])}
                      </span>
                    )}
                  </div>
                </div>
              </Card>
            </div>
          );
        })}
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
        subtitle="一键连接 Cookie，先预览关注动态，再选择哪些内容写入情报库"
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
            <Card title="动态筛选" icon={<Hash size={18} />}>
              <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                    gap: "16px",
                    alignItems: "start",
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-main)" }}>关键词筛选</div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <input
                        type="text"
                        value={keywordInput}
                        onChange={(e) => setKeywordInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleAddKeyword()}
                        placeholder="输入关键词..."
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
                        disabled={!keywordInput.trim()}
                        style={{
                          padding: "10px 14px",
                          borderRadius: "var(--radius-sm)",
                          border: "none",
                          background: "var(--color-secondary)",
                          color: "white",
                          cursor: keywordInput.trim() ? "pointer" : "not-allowed",
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
                          disabled={keywords.includes(kw)}
                          style={{
                            padding: "4px 10px",
                            borderRadius: "9999px",
                            border: "1px solid var(--border-light)",
                            background: keywords.includes(kw) ? "var(--bg-muted)" : "var(--bg-hover)",
                            color: keywords.includes(kw) ? "var(--text-muted)" : "var(--text-secondary)",
                            fontSize: "0.75rem",
                            cursor: keywords.includes(kw) ? "not-allowed" : "pointer",
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

                {keywords.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {keywords.map((kw) => (
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
                )}

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
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>自定义条数</span>
                      <input
                        type="number"
                        min={1}
                        value={limitInput}
                        onChange={(e) => setLimitInput(e.target.value)}
                        onBlur={() => normalizePositiveInput(limitInput, limit, setLimit, setLimitInput)}
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
                  预览关注动态
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

          {panelTab === "following" && <div style={{ overflow: "auto", display: "flex", flexDirection: "column", gap: "16px" }}>
            <Card title="关注监控" icon={<Filter size={18} />}>
              <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr)",
                    gap: "12px",
                  }}
                >
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
                    <button
                      type="button"
                      onClick={() => void handleBuildSmartGroups()}
                      disabled={smartGroupRunning}
                      style={{
                        padding: "10px 14px",
                        borderRadius: "8px",
                        border: "1px solid rgba(236, 72, 153, 0.32)",
                        background: smartGroupRunning ? "var(--bg-muted)" : "linear-gradient(135deg, #FB7299, #8B5CF6)",
                        color: smartGroupRunning ? "var(--text-muted)" : "white",
                        fontSize: "0.8125rem",
                        fontWeight: 800,
                        cursor: smartGroupRunning ? "not-allowed" : "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <Hash size={14} />
                      {smartGroupRunning ? "整理中..." : "智能分组"}
                    </button>
                  </div>
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
                        <div style={{ fontSize: "0.875rem", fontWeight: 800, color: "var(--text-primary)" }}>{followStatusTitle}</div>
                        <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginTop: "4px" }}>{followStatusStage}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>当前页</div>
                        <div style={{ fontSize: "1rem", fontWeight: 800, color: "var(--text-primary)" }}>{followStatusPage || "-"}</div>
                      </div>
                    </div>
                    <div style={{ width: "100%", height: "8px", borderRadius: "999px", background: "rgba(0, 0, 0, 0.08)", overflow: "hidden" }}>
                      <div style={{ width: `${followStatusProgress}%`, height: "100%", background: "linear-gradient(90deg, #10B981, #00AEEC)" }} />
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "14px", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      <span>已获取 {followStatusCount} 个关注</span>
                      <span>每 50 个关注刷新一次进度</span>
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
                        <div style={{ fontSize: "0.875rem", fontWeight: 800, color: "var(--text-primary)" }}>{smartGroupStatusTitle}</div>
                        <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginTop: "4px" }}>{smartGroupStatusStage}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>匹配 UP</div>
                        <div style={{ fontSize: "1rem", fontWeight: 800, color: "var(--text-primary)" }}>{smartGroupTask?.matched_followed_count || Object.keys(trackerConfig.creator_profiles || {}).length}</div>
                      </div>
                    </div>
                    <div style={{ width: "100%", height: "8px", borderRadius: "999px", background: "rgba(0, 0, 0, 0.08)", overflow: "hidden" }}>
                      <div style={{ width: `${smartGroupStatusProgress}%`, height: "100%", background: "linear-gradient(90deg, #FB7299, #8B5CF6)" }} />
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "14px", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      <span>已整理 {smartGroupTask?.processed_files || smartGroupTask?.result?.total_files || 0} / {smartGroupTask?.total_files || smartGroupTask?.result?.total_files || 0} 个收藏文件</span>
                      <span>智能分组 {smartGroupTask?.total_groups || smartGroupOptions.length} 个</span>
                    </div>
                  </div>
                </div>

                <div style={{ height: "1px", background: "var(--border-light)" }} />

                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  <div>
                    <div style={{ fontSize: "0.9375rem", fontWeight: 800, color: "var(--text-main)" }}>日常爬虫监视</div>
                    <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginTop: "4px", lineHeight: 1.6 }}>
                      日常爬虫只认两类来源：你选中的智能分组，以及你单独加入的 UP 池。后续情报会按类别一组一组输出。
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1.6fr) minmax(280px, 0.9fr)",
                      gap: "14px",
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      <div style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-main)" }}>智能分组加入日常爬虫</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                        {smartGroupOptions.length === 0 || (smartGroupOptions.length === DEFAULT_SMART_GROUP_OPTIONS.length && Object.keys(trackerConfig.creator_profiles || {}).length === 0) ? (
                          <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>先点“智能分组”，把本地收藏里的 tag 反推到已关注 UP。</span>
                        ) : smartGroupOptions.map((group) => {
                          const active = trackerConfig.followed_up_groups.includes(group.value);
                          const meta = resolveSmartGroupMeta(group.value, group.label);
                          return (
                            <button
                              key={group.value}
                              type="button"
                              onClick={() => void toggleTrackedSmartGroup(group.value)}
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
                    </div>

                    <div
                      style={{
                        padding: "12px 14px",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border-light)",
                        background: "var(--bg-hover)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "6px",
                        alignSelf: "start",
                      }}
                    >
                      <div style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-main)" }}>单独 UP 池</div>
                      <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--text-main)" }}>{specialPoolMembers.length}</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                        下方从关注列表里单独挑选的 UP 都会进入这个池子，并作为一个独立类别输出情报。
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                    <span>监视类别 {monitorCategoryCount} 组</span>
                    <span>覆盖 UP {trackedUpIds.size} 个</span>
                    <span>智能组 {(selectedTrackedSmartGroups || []).length} 个</span>
                    <span>单独 UP 池 {specialPoolMembers.length} 个</span>
                  </div>

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
                          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start" }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: "0.9375rem", fontWeight: 800, color: group.meta.accent }}>
                                {group.label}
                              </div>
                              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                                {group.members.length} 个 UP · 情报单独成组
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => void toggleTrackedSmartGroup(group.value)}
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
                              移出
                            </button>
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

                      {specialPoolMembers.length > 0 && (
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
                            <div style={{ fontSize: "0.9375rem", fontWeight: 800, color: "#078FBF" }}>单独 UP 池</div>
                            <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                              {specialPoolMembers.length} 个 UP · 情报单独成组
                            </div>
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                            {specialPoolMembers.slice(0, 8).map((entry) => (
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
                          {specialPoolMembers.length > 8 && (
                            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                              其余 {specialPoolMembers.length - 8} 个 UP 也会一起作为单独 UP 池输出。
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
                      还没有监视类别。先选几个智能分组，或者在下方把具体 UP 加进单独 UP 池。
                    </div>
                  )}
                </div>

                <div style={{ height: "1px", background: "var(--border-light)" }} />

                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div>
                    <div style={{ fontSize: "0.9375rem", fontWeight: 800, color: "var(--text-main)" }}>筛选关注 UP</div>
                    <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginTop: "4px", lineHeight: 1.6 }}>
                      默认分组和智能分组会同时生效，用它们先把关注列表收窄，再把具体 UP 放进单独 UP 池。已在监视智能组里的 UP 不再重复加入池子。
                    </div>
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
                              先点上方“智能分组”，把本地收藏里的 tag 反推到已关注 UP，再回来选智能组。
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

                  {followedUpsLoading && followedUps.length === 0 ? (
                    <div style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>正在读取关注列表...</div>
                  ) : filteredFollowedUps.length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center", justifyContent: "space-between" }}>
                        <div>
                          <div style={{ fontSize: "0.875rem", fontWeight: 800, color: "var(--text-main)" }}>筛选结果</div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                            点卡片底部，把具体 UP 放进单独 UP 池。这里只处理单独 UP 池，不改变上方的监视类别结构。
                          </div>
                        </div>
                        {filteredFollowedUps.length > 24 && (
                          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                            当前先展示前 24 个结果
                          </div>
                        )}
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                          gap: "10px",
                        }}
                      >
                        {filteredFollowedUps.slice(0, 24).map((up) => {
                          const primarySmartGroup = getUpSmartGroups(up)[0] || "";
                          const meta = resolveSmartGroupMeta(primarySmartGroup || "other", primarySmartGroup ? getSmartGroupLabel(primarySmartGroup) : "其他");
                          const smartGroupLabel = primarySmartGroup ? meta.label : "未分配智能组";
                          const manualExtra = specialPoolIds.includes(up.mid);
                          const groupedTracked = trackedGroupUpIds.has(up.mid);
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
                                    {(up.tag_names[0] || "未分组")} · {smartGroupLabel}
                                  </div>
                                </div>
                              </div>
                              {(up.sign || up.official_desc) && (
                                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                                  {up.sign || up.official_desc}
                                </div>
                              )}
                              {up.tag_names.length > 0 && (
                                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                                  {up.tag_names.slice(0, 3).map((tagName) => (
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
                                disabled={groupedTracked && !manualExtra}
                                style={{
                                  marginTop: "auto",
                                  padding: "8px 10px",
                                  borderRadius: "var(--radius-sm)",
                                  border: "1px solid var(--border-light)",
                                  background: manualExtra ? "rgba(0, 174, 236, 0.12)" : "var(--bg-card)",
                                  color: manualExtra ? "#078FBF" : groupedTracked ? "var(--text-muted)" : "var(--text-secondary)",
                                  fontSize: "0.75rem",
                                  fontWeight: 700,
                                  cursor: groupedTracked && !manualExtra ? "not-allowed" : "pointer",
                                  opacity: groupedTracked && !manualExtra ? 0.72 : 1,
                                }}
                              >
                                {manualExtra ? "移出单独 UP 池" : groupedTracked ? "已在监视智能组里" : "加入单独 UP 池"}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
                      {followedUps.length > 0 ? "这个筛选里没有匹配的 UP。" : "连接 Cookie 后会自动读取你的关注列表。"}
                    </div>
                  )}

                  <div style={{ height: "1px", background: "var(--border-light)" }} />

                  <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                    <div>
                      <div style={{ fontSize: "0.9375rem", fontWeight: 800, color: "var(--text-main)" }}>智能分组手动管理</div>
                      <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginTop: "4px", lineHeight: 1.6 }}>
                        选一个智能组，直接把当前筛选结果补进去，或者把组内不合适的 UP 移出。手动调整会覆盖自动反推结果。
                      </div>
                    </div>

                    {!smartGroupsReady || !managedSmartGroupOption ? (
                      <div style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
                        先完成一次“智能分组”，这里才会出现可管理的智能组成员。
                      </div>
                    ) : (
                      <>
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
                          <span>当前管理 {managedSmartGroupOption.label}</span>
                          <span>组内 {managedSmartGroupMembers.length} 个 UP</span>
                          <span>可补充 {smartGroupManagementCandidates.length} 个候选</span>
                          <span>搜索和默认分组筛选也会作用到补充列表</span>
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
                              padding: "14px",
                              borderRadius: "var(--radius-sm)",
                              border: `1px solid ${managedSmartGroupMeta.accent}33`,
                              background: managedSmartGroupMeta.bg,
                              display: "flex",
                              flexDirection: "column",
                              gap: "10px",
                            }}
                          >
                            <div>
                              <div style={{ fontSize: "0.875rem", fontWeight: 800, color: managedSmartGroupMeta.accent }}>
                                当前组内 UP
                              </div>
                              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                                移出后，这个 UP 不再属于 {managedSmartGroupOption.label}。
                              </div>
                            </div>
                            {managedSmartGroupMembers.length > 0 ? (
                              <>
                                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                  {managedSmartGroupMembers.slice(0, 12).map((up) => (
                                    <div
                                      key={up.mid}
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        gap: "10px",
                                        padding: "9px 10px",
                                        borderRadius: "var(--radius-sm)",
                                        background: "rgba(255,255,255,0.72)",
                                      }}
                                    >
                                      <div style={{ minWidth: 0 }}>
                                        <div style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-main)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                          {up.uname}
                                        </div>
                                        <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginTop: "4px" }}>
                                          {up.tag_names[0] || "未分组"}
                                        </div>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => void removeUpFromManagedSmartGroup(up, managedSmartGroupOption.value)}
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
                                        移出
                                      </button>
                                    </div>
                                  ))}
                                </div>
                                {managedSmartGroupMembers.length > 12 && (
                                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                                    其余 {managedSmartGroupMembers.length - 12} 个成员也仍在这个智能组里。
                                  </div>
                                )}
                              </>
                            ) : (
                              <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                                这个智能组里暂时没有成员。
                              </div>
                            )}
                          </div>

                          <div
                            style={{
                              padding: "14px",
                              borderRadius: "var(--radius-sm)",
                              border: "1px solid var(--border-light)",
                              background: "var(--bg-hover)",
                              display: "flex",
                              flexDirection: "column",
                              gap: "10px",
                            }}
                          >
                            <div>
                              <div style={{ fontSize: "0.875rem", fontWeight: 800, color: "var(--text-main)" }}>从当前筛选结果补充成员</div>
                              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                                这里会避开已经在 {managedSmartGroupOption.label} 里的 UP。
                              </div>
                            </div>
                            {smartGroupManagementCandidates.length > 0 ? (
                              <>
                                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                  {smartGroupManagementCandidates.slice(0, 12).map((up) => (
                                    <div
                                      key={up.mid}
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        gap: "10px",
                                        padding: "9px 10px",
                                        borderRadius: "var(--radius-sm)",
                                        border: "1px solid var(--border-light)",
                                        background: "var(--bg-card)",
                                      }}
                                    >
                                      <div style={{ minWidth: 0 }}>
                                        <div style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-main)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                          {up.uname}
                                        </div>
                                        <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginTop: "4px" }}>
                                          {(up.tag_names[0] || "未分组")} · {(getUpSmartGroups(up)[0] && getSmartGroupLabel(getUpSmartGroups(up)[0])) || "未分配智能组"}
                                        </div>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => void addUpToManagedSmartGroup(up, managedSmartGroupOption.value)}
                                        style={{
                                          padding: "6px 8px",
                                          borderRadius: "var(--radius-sm)",
                                          border: "1px solid var(--border-light)",
                                          background: "rgba(16, 185, 129, 0.12)",
                                          color: "#0F9F6E",
                                          fontSize: "0.75rem",
                                          fontWeight: 700,
                                          cursor: "pointer",
                                          flexShrink: 0,
                                        }}
                                      >
                                        加入
                                      </button>
                                    </div>
                                  ))}
                                </div>
                                {smartGroupManagementCandidates.length > 12 && (
                                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                                    其余 {smartGroupManagementCandidates.length - 12} 个候选可继续通过筛选缩小范围后再补充。
                                  </div>
                                )}
                              </>
                            ) : (
                              <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                                当前筛选结果里没有可补充的 UP。可以改一下搜索词，或者放宽上面的默认分组/智能分组筛选。
                              </div>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          </div>}

          {panelTab === "dynamics" && (
            <div style={{ overflow: "auto", display: "flex", flexDirection: "column", gap: "16px" }}>
              {renderResultList("点击上方「预览关注动态」开始")}
            </div>
          )}
        </div>
      </PageContent>
    </PageContainer>
  );
}
