import { useState, useEffect } from "react";
import {
  Tv,
  Search,
  Filter,
  Hash,
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
import { BilibiliCookieModal } from "./BilibiliCookieModal";
import { BilibiliFavoritesPage } from "./BilibiliFavoritesPage";
import {
  BiliDynamic,
  BiliFollowedUp,
  BiliOriginalFollowedGroup,
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

const FOLLOWED_GROUP_ORDER = [
  "all",
  "ai-tech",
  "study",
  "digital",
  "game",
  "finance",
  "creative",
  "entertainment",
  "other",
] as const;

type FollowedGroupKey = typeof FOLLOWED_GROUP_ORDER[number];
type BilibiliPanelTab = "dynamics" | "favorites" | "following";

const FOLLOWED_GROUP_META: Record<FollowedGroupKey, { label: string; accent: string; bg: string }> = {
  all: { label: "全部", accent: "#00AEEC", bg: "rgba(0, 174, 236, 0.12)" },
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

function classifyFollowedUp(up: BiliFollowedUp): FollowedGroupKey {
  const haystack = `${up.uname} ${up.sign} ${up.official_desc}`.toLowerCase();

  const matchers: Array<[FollowedGroupKey, string[]]> = [
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
  const [followedUpSearch, setFollowedUpSearch] = useState("");
  const [selectedOriginalGroup, setSelectedOriginalGroup] = useState<number | "all">("all");
  const [selectedFollowedGroup, setSelectedFollowedGroup] = useState<FollowedGroupKey>("all");

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
    setDaysBackInput(String(daysBack));
  }, [daysBack]);

  useEffect(() => {
    setLimitInput(String(limit));
  }, [limit]);

  // Load config on mount
  useEffect(() => {
    loadConfig();
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

  const followedGroupByAuthorId = Object.fromEntries(
    followedUps.map((up) => [up.mid, classifyFollowedUp(up)])
  ) as Record<string, FollowedGroupKey>;
  const followedUpByAuthorId = Object.fromEntries(
    followedUps.map((up) => [up.mid, up])
  ) as Record<string, BiliFollowedUp>;

  const filteredFollowedUps = followedUps.filter((up) => {
    if (selectedOriginalGroup !== "all" && !up.tag_ids.includes(selectedOriginalGroup)) {
      return false;
    }
    if (selectedFollowedGroup !== "all" && classifyFollowedUp(up) !== selectedFollowedGroup) {
      return false;
    }

    const q = followedUpSearch.trim().toLowerCase();
    if (!q) return true;

    return [up.uname, up.sign, up.official_desc].some((value) => value?.toLowerCase().includes(q));
  });

  const displayedDynamics = dynamics.filter((dynamic) => {
    const up = followedUpByAuthorId[dynamic.author_id];
    if (selectedOriginalGroup !== "all" && !(up?.tag_ids || []).includes(selectedOriginalGroup)) {
      return false;
    }
    if (selectedFollowedGroup !== "all" && followedGroupByAuthorId[dynamic.author_id] !== selectedFollowedGroup) {
      return false;
    }
    return true;
  });

  const groupCounts = FOLLOWED_GROUP_ORDER.reduce<Record<FollowedGroupKey, number>>((acc, group) => {
    acc[group] =
      group === "all" ? followedUps.length : followedUps.filter((up) => classifyFollowedUp(up) === group).length;
    return acc;
  }, {} as Record<FollowedGroupKey, number>);

  const originalGroupCounts = originalGroups.reduce<Record<number, number>>((acc, group) => {
    acc[group.tag_id] = followedUps.filter((up) => up.tag_ids.includes(group.tag_id)).length;
    return acc;
  }, {});

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
                    {dynamic.author_id && followedGroupByAuthorId[dynamic.author_id] && (
                      <span style={{ color: FOLLOWED_GROUP_META[followedGroupByAuthorId[dynamic.author_id]].accent }}>
                        {FOLLOWED_GROUP_META[followedGroupByAuthorId[dynamic.author_id]].label}
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
            <Card title="关注 UP 过滤" icon={<Filter size={18} />}>
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr)",
                    gap: "10px",
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
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  <button
                    type="button"
                    onClick={() => setSelectedOriginalGroup("all")}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid",
                      borderColor: selectedOriginalGroup === "all" ? "#00AEEC" : "var(--border-light)",
                      background: selectedOriginalGroup === "all" ? "rgba(0, 174, 236, 0.12)" : "var(--bg-hover)",
                      color: selectedOriginalGroup === "all" ? "#078FBF" : "var(--text-secondary)",
                      fontSize: "0.8125rem",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    全部分组 · {followedUps.length}
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
                          padding: "8px 12px",
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid",
                          borderColor: active ? "#FB7299" : "var(--border-light)",
                          background: active ? "rgba(251, 114, 153, 0.12)" : "var(--bg-hover)",
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

                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {FOLLOWED_GROUP_ORDER.map((group) => {
                    const meta = FOLLOWED_GROUP_META[group];
                    const active = selectedFollowedGroup === group;
                    return (
                      <button
                        key={group}
                        type="button"
                        onClick={() => setSelectedFollowedGroup(group)}
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
                        {meta.label} {groupCounts[group] ? `· ${groupCounts[group]}` : ""}
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => void handleLoadFollowedUps(false, true)}
                    disabled={followedUpsLoading}
                    style={{
                      marginLeft: "auto",
                      padding: "8px 13px",
                      borderRadius: "8px",
                      border: "1px solid rgba(16, 185, 129, 0.42)",
                      background: "linear-gradient(135deg, #10B981, #00AEEC)",
                      color: "white",
                      fontSize: "0.8125rem",
                      fontWeight: 800,
                      cursor: followedUpsLoading ? "not-allowed" : "pointer",
                      opacity: followedUpsLoading ? 0.62 : 1,
                      boxShadow: "0 8px 18px rgba(16, 185, 129, 0.22)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <Users size={14} />
                    {followedUpsLoading ? "爬取中..." : "爬取关注列表"}
                  </button>
                </div>

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
                  <div
                    style={{
                      width: "100%",
                      height: "8px",
                      borderRadius: "999px",
                      background: "rgba(0, 0, 0, 0.08)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${followStatusProgress}%`,
                        height: "100%",
                        background: "linear-gradient(90deg, #10B981, #00AEEC)",
                      }}
                    />
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "14px", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    <span>已获取 {followStatusCount} 个关注</span>
                    <span>每 50 个关注刷新一次进度</span>
                    {followedUpsTask?.updated_at && <span>最近更新 {new Date(followedUpsTask.updated_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>}
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "10px",
                    alignItems: "center",
                    fontSize: "0.8125rem",
                    color: "var(--text-muted)",
                  }}
                >
                  <span>关注 {followedUps.length} 个 UP</span>
                  <span>原始分组 {selectedOriginalGroup === "all" ? "全部" : originalGroups.find((group) => group.tag_id === selectedOriginalGroup)?.name || "已选分组"}</span>
                  <span>智能细分 {FOLLOWED_GROUP_META[selectedFollowedGroup].label}</span>
                  <span>当前分组 {filteredFollowedUps.length} 个</span>
                </div>

                {followedUpsLoading && followedUps.length === 0 ? (
                  <div style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>正在读取关注列表...</div>
                ) : filteredFollowedUps.length > 0 ? (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                      gap: "10px",
                    }}
                  >
                    {filteredFollowedUps.slice(0, 24).map((up) => {
                      const group = classifyFollowedUp(up);
                      const meta = FOLLOWED_GROUP_META[group];
                      return (
                        <div
                          key={up.mid}
                          style={{
                            padding: "12px",
                            borderRadius: "var(--radius-sm)",
                            border: "1px solid var(--border-light)",
                            background: "var(--bg-hover)",
                            textAlign: "left",
                            cursor: "default",
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
                              <div
                                style={{
                                  fontSize: "0.875rem",
                                  fontWeight: 700,
                                  color: "var(--text-main)",
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                {up.uname}
                              </div>
                              <div
                                style={{
                                  fontSize: "0.75rem",
                                  color: "var(--text-muted)",
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                  {(up.tag_names[0] || "未分组")} · {meta.label}
                              </div>
                            </div>
                          </div>
                          {(up.sign || up.official_desc) && (
                            <div
                              style={{
                                marginTop: "8px",
                                fontSize: "0.75rem",
                                color: "var(--text-secondary)",
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
                          {up.tag_names.length > 0 && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
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
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
                    {followedUps.length > 0 ? "这个分组里没有匹配的 UP。" : "连接 Cookie 后会自动读取你的关注列表。"}
                  </div>
                )}
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
