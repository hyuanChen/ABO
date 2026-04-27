import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Play, Clock, Calendar, User, Plus, X, Trash2, HelpCircle, History, Info } from "lucide-react";
import { api } from "../../core/api";
import { isActionEnterKey } from "../../core/keyboard";
import { useStore, FeedModule } from "../../core/store";
import { PageContainer, PageHeader, PageContent, Card } from "../../components/Layout";
import { useToast } from "../../components/Toast";
import { CookieGuide } from "../../components/ConfigHelp";
import type { BilibiliDailyDynamicMonitor, BilibiliFollowedGroupMonitor } from "../../api/bilibili";
import {
  createCreatorMonitor,
  createFollowingScan,
  createFollowingScanMonitor,
  createKeywordMonitor,
  formatKeywordInput,
  normalizeXhsTrackerConfig,
  parseKeywordInput,
  type XHSTrackerCreatorMonitor,
  type XHSTrackerFollowingScan,
  type XHSTrackerFollowingScanMonitor,
  type XHSTrackerKeywordMonitor,
} from "../xiaohongshu/trackerConfig";

const SCHEDULE_OPTIONS = [
  { label: "8:00", value: "0 8 * * *" },
  { label: "8:30", value: "30 8 * * *" },
  { label: "9:00", value: "0 9 * * *" },
  { label: "9:30", value: "30 9 * * *" },
  { label: "10:00", value: "0 10 * * *" },
  { label: "11:00", value: "0 11 * * *" },
  { label: "13:00", value: "0 13 * * *" },
  { label: "20:00", value: "0 20 * * *" },
];

function formatScheduleOptionLabel(value: string): string {
  if (value.startsWith("*/5")) return "每5分钟";
  const cronMatch = /^(\d{1,2}) (\d{1,2}) \* \* \*$/.exec(value.trim());
  if (!cronMatch) return value;
  const minute = Number(cronMatch[1]);
  const hour = Number(cronMatch[2]);
  if (minute < 0 || minute > 59 || hour < 0 || hour > 23) return value;
  return `${hour}:${minute.toString().padStart(2, "0")}`;
}

const BILIBILI_GROUP_OPTIONS = [
  { value: "ai-tech", label: "AI科技" },
  { value: "study", label: "学习知识" },
  { value: "digital", label: "数码影音" },
  { value: "game", label: "游戏" },
  { value: "finance", label: "财经商业" },
  { value: "creative", label: "设计创作" },
  { value: "entertainment", label: "生活娱乐" },
  { value: "other", label: "其他" },
];

const XHS_CREATOR_GROUP_OPTIONS = [
  { value: "research", label: "科研学习" },
  { value: "writing", label: "论文写作" },
  { value: "ai", label: "AI工具" },
  { value: "productivity", label: "效率知识库" },
  { value: "study_abroad", label: "留学读博" },
  { value: "lifestyle", label: "日常生活" },
  { value: "other", label: "其他" },
];

const BILIBILI_DYNAMIC_TYPE_OPTIONS = [
  { value: 8, label: "视频" },
  { value: 2, label: "图文" },
  { value: 4, label: "文字" },
  { value: 64, label: "专栏" },
];

// 各模块的订阅配置（仅支持订阅类型的模块）
const MODULE_SUB_CONFIG: Record<string, {
  types: { type: string; label: string; placeholder: string; example: string }[];
  desc: string;
}> = {
  "bilibili-tracker": {
    types: [
      { type: "up_uid", label: "UP主", placeholder: "输入UP主UID或空间链接", example: "1567748478" },
    ],
    desc: "添加UP主UID追踪其视频更新"
  },
  "xiaohongshu-tracker": {
    types: [
      { type: "user_id", label: "用户", placeholder: "输入用户主页链接或ID", example: "5f3c8b9a0000000001001234" },
    ],
    desc: "添加用户ID追踪小红书笔记"
  },
  "zhihu-tracker": {
    types: [
      { type: "topic", label: "话题", placeholder: "输入话题ID或链接", example: "19550728" },
      { type: "user", label: "用户", placeholder: "输入用户ID或主页链接", example: "zhihu-user" },
    ],
    desc: "添加话题或用户追踪知乎内容"
  },
  "xiaoyuzhou-tracker": {
    types: [
      { type: "podcast_id", label: "播客", placeholder: "输入播客ID或链接", example: "6169c4c8d8b44c5da7ea2e9b" },
    ],
    desc: "添加播客ID追踪节目更新"
  },
  "arxiv-tracker": {
    types: [],
    desc: "在下方配置关键词"
  },
  "semantic-scholar-tracker": {
    types: [],
    desc: "在下方配置关键词"
  },
  "folder-monitor": {
    types: [],
    desc: "监控文件夹变化"
  },
};

interface Props {
  module: FeedModule;
  onBack: () => void;
}

interface ModuleConfig {
  keywords?: string[];
  topics?: string[];
  users?: string[];
  podcast_ids?: string[];
  user_ids?: string[];
  folder_path?: string;
  up_uids?: string[];
  followed_up_groups?: string[];
  followed_up_original_groups?: number[];
  sessdata?: string;
  api_key?: string;
  cookie?: string;
  web_session?: string;
  id_token?: string;
  enable_keyword_search?: boolean;
  keyword_min_likes?: number;
  keyword_search_limit?: number;
  follow_feed?: boolean;
  follow_feed_types?: number[];
  fetch_follow_limit?: number;
  fixed_up_monitor_limit?: number;
  days_back?: number;
  creator_push_enabled?: boolean;
  keyword_filter?: boolean;
  followed_up_group_options?: { value: string; label: string }[];
  creator_groups?: string[];
  creator_group_options?: { value: string; label: string }[];
  creator_profiles?: Record<string, {
    author?: string;
    author_id?: string;
    smart_groups?: string[];
    smart_group_labels?: string[];
    latest_title?: string;
    sample_titles?: string[];
  }>;
  favorite_up_profiles?: Record<string, {
    author?: string;
    author_id?: string;
    smart_groups?: string[];
    smart_group_labels?: string[];
    latest_title?: string;
    sample_titles?: string[];
  }>;
  keyword_monitors?: XHSTrackerKeywordMonitor[];
  following_scan?: XHSTrackerFollowingScan;
  following_scan_monitors?: XHSTrackerFollowingScanMonitor[];
  creator_monitors?: XHSTrackerCreatorMonitor[];
  daily_dynamic_monitors?: BilibiliDailyDynamicMonitor[];
  followed_up_group_monitors?: BilibiliFollowedGroupMonitor[];
  followed_up_filter_mode?: "and" | "smart_only";
}

interface BilibiliOriginalGroupOption {
  tag_id: number;
  name: string;
  count: number;
  tip: string;
}

interface BilibiliFollowedUpsConfigResponse {
  total: number;
  groups: BilibiliOriginalGroupOption[];
  ups: Array<{
    mid: string;
    uname: string;
    tag_ids: number[];
    tag_names: string[];
  }>;
}

interface BilibiliTrackedProfileSummary {
  uid: string;
  author: string;
  smartGroups: string[];
  latestTitle?: string;
  sampleTitles: string[];
}

function parseBilibiliStringListInput(value: string): string[] {
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

function createLocalBilibiliMonitorId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

function normalizeBilibiliPositiveInt(value: unknown, fallback: number, max?: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.max(1, Math.round(parsed));
  return max ? Math.min(normalized, max) : normalized;
}

function getBilibiliMonitorDefaults(config: Partial<ModuleConfig> = {}) {
  return {
    daysBack: normalizeBilibiliPositiveInt(config.days_back, 7, 365),
    limit: normalizeBilibiliPositiveInt(config.fetch_follow_limit, 50, 1000),
    pageLimit: 5,
  };
}

function normalizeBilibiliDailyDynamicMonitor(
  seed: Partial<BilibiliDailyDynamicMonitor> = {},
  defaults: { daysBack?: number; limit?: number; pageLimit?: number } = {},
): BilibiliDailyDynamicMonitor {
  const keywords = Array.isArray(seed.keywords) ? parseBilibiliStringListInput(seed.keywords.join(", ")) : [];
  const tagFilters = Array.isArray(seed.tag_filters) ? parseBilibiliStringListInput(seed.tag_filters.join(", ")) : [];
  const label = String(seed.label || keywords[0] || tagFilters[0] || "每日动态监控").trim() || "每日动态监控";
  return {
    id: String(seed.id || createLocalBilibiliMonitorId("bili-dm")),
    label,
    keywords,
    tag_filters: tagFilters,
    enabled: seed.enabled ?? true,
    days_back: normalizeBilibiliPositiveInt(seed.days_back, defaults.daysBack ?? 7, 365),
    limit: normalizeBilibiliPositiveInt(
      seed.limit ?? (seed as { fetch_limit?: number }).fetch_limit,
      defaults.limit ?? 50,
      1000,
    ),
    page_limit: normalizeBilibiliPositiveInt(
      seed.page_limit ?? (seed as { pages?: number; max_pages?: number }).pages ?? (seed as { max_pages?: number }).max_pages,
      defaults.pageLimit ?? 5,
      100,
    ),
  };
}

function normalizeBilibiliFollowedGroupMonitor(
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
    id: String(seed.id || createLocalBilibiliMonitorId("bili-gm")),
    group_value: groupValue,
    label,
    enabled: seed.enabled ?? true,
    days_back: normalizeBilibiliPositiveInt(seed.days_back, defaults.daysBack ?? 7, 365),
    limit: normalizeBilibiliPositiveInt(
      seed.limit ?? (seed as { fetch_limit?: number }).fetch_limit,
      defaults.limit ?? 50,
      1000,
    ),
    page_limit: normalizeBilibiliPositiveInt(
      seed.page_limit ?? (seed as { pages?: number; max_pages?: number }).pages ?? (seed as { max_pages?: number }).max_pages,
      defaults.pageLimit ?? 5,
      100,
    ),
  };
}

function normalizeBilibiliTrackerModuleConfig(config: ModuleConfig): ModuleConfig {
  const monitorDefaults = getBilibiliMonitorDefaults(config);
  const labelLookup = Object.fromEntries(
    ((config.followed_up_group_options || BILIBILI_GROUP_OPTIONS) as { value: string; label: string }[])
      .map((option) => [option.value, option.label])
  );

  const dailyDynamicMonitors = Array.isArray(config.daily_dynamic_monitors) && config.daily_dynamic_monitors.length > 0
    ? config.daily_dynamic_monitors.map((item) => normalizeBilibiliDailyDynamicMonitor(item, monitorDefaults))
    : parseBilibiliStringListInput((config.keywords || []).join(", ")).map((keyword) => normalizeBilibiliDailyDynamicMonitor({
        label: keyword,
        keywords: [keyword],
        enabled: config.enable_keyword_search ?? true,
      }, monitorDefaults));

  const followedUpGroupMonitors = Array.isArray(config.followed_up_group_monitors) && config.followed_up_group_monitors.length > 0
    ? config.followed_up_group_monitors.map((item) => normalizeBilibiliFollowedGroupMonitor(item, labelLookup, monitorDefaults))
    : (config.followed_up_groups || []).map((groupValue) => normalizeBilibiliFollowedGroupMonitor({
        group_value: groupValue,
        enabled: true,
      }, labelLookup, monitorDefaults));

  return {
    ...config,
    up_uids: Array.isArray(config.up_uids) ? config.up_uids.map((item) => String(item || "").trim()).filter(Boolean) : [],
    daily_dynamic_monitors: dailyDynamicMonitors,
    followed_up_group_monitors: followedUpGroupMonitors,
  };
}

function extractBilibiliUid(rawValue: string): string {
  const text = String(rawValue || "").trim();
  if (!text) return "";
  const match = text.match(/space\.bilibili\.com\/(\d+)/i);
  if (match) return match[1];
  return text;
}

function normalizeXhsProfileUserId(rawValue: string): string {
  const text = String(rawValue || "").trim();
  if (!text) return "";
  const match = text.match(/\/user\/profile\/([^/?#]+)/i);
  return decodeURIComponent(match?.[1] || text).trim();
}

interface SubscriptionDetail {
  type: string;
  value: string;
  added_at: string;
  added_by: string;
  last_fetched: string | null;
  fetch_count: number;
  is_active: boolean;
}

interface SubDetailData {
  module_id: string;
  module_name: string;
  subscriptions: SubscriptionDetail[];
}

const TYPE_LABELS: Record<string, string> = {
  up_uid: "UP主",
  user_id: "用户ID",
  user: "用户",
  topic: "话题",
  podcast_id: "播客",
  keyword: "关键词",
};

const TYPE_COLORS: Record<string, string> = {
  up_uid: "#FF6B6B",
  user_id: "#FF6B9D",
  user: "#C44569",
  topic: "#786FA6",
  podcast_id: "#63CDDA",
  keyword: "#F8B500",
};

export default function ModuleDetail({ module, onBack }: Props) {
  const toast = useToast();
  const { setFeedModules } = useStore();
  const [moduleConfig, setModuleConfig] = useState<ModuleConfig>({});
  const [running, setRunning] = useState(false);
  const [moduleEnabled, setModuleEnabled] = useState(module.enabled);
  const [schedule, setSchedule] = useState(module.schedule);
  const [subDetails, setSubDetails] = useState<SubDetailData | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedType, setSelectedType] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [bilibiliOriginalGroups, setBilibiliOriginalGroups] = useState<BilibiliOriginalGroupOption[]>([]);
  const [loadingBilibiliGroups, setLoadingBilibiliGroups] = useState(false);
  const [bilibiliUpInput, setBilibiliUpInput] = useState("");

  const subConfig = MODULE_SUB_CONFIG[module.id] || { types: [], desc: "" };
  const scheduleOptions = useMemo(() => {
    if (SCHEDULE_OPTIONS.some((option) => option.value === schedule)) return SCHEDULE_OPTIONS;
    return [
      { label: formatScheduleOptionLabel(schedule), value: schedule },
      ...SCHEDULE_OPTIONS,
    ];
  }, [schedule]);
  const bilibiliSmartGroupOptions = useMemo(() => {
    const options = moduleConfig.followed_up_group_options || BILIBILI_GROUP_OPTIONS;
    return options.length > 0 ? options : BILIBILI_GROUP_OPTIONS;
  }, [moduleConfig.followed_up_group_options]);
  const bilibiliSmartGroupLabelLookup = useMemo(
    () => Object.fromEntries(bilibiliSmartGroupOptions.map((option) => [option.value, option.label])),
    [bilibiliSmartGroupOptions]
  );
  const bilibiliTrackedProfiles = useMemo(() => {
    const merged = new Map<string, BilibiliTrackedProfileSummary>();
    const profileGroups = [moduleConfig.creator_profiles || {}, moduleConfig.favorite_up_profiles || {}];

    profileGroups.forEach((profiles) => {
      Object.entries(profiles).forEach(([key, profile]) => {
        const uid = extractBilibiliUid(String(profile?.author_id || key || "").trim());
        if (!uid) return;
        const existing = merged.get(uid);
        const smartGroups = Array.from(new Set([
          ...(existing?.smartGroups || []),
          ...((profile?.smart_groups || []).map((item) => String(item || "").trim()).filter(Boolean)),
        ]));
        const sampleTitles = Array.from(new Set([
          ...(existing?.sampleTitles || []),
          ...((profile?.sample_titles || []).map((item) => String(item || "").trim()).filter(Boolean)),
        ])).slice(0, 3);
        merged.set(uid, {
          uid,
          author: String(profile?.author || existing?.author || uid).trim() || uid,
          smartGroups,
          latestTitle: String(profile?.latest_title || existing?.latestTitle || "").trim() || undefined,
          sampleTitles,
        });
      });
    });

    return Array.from(merged.values());
  }, [moduleConfig.creator_profiles, moduleConfig.favorite_up_profiles]);
  const bilibiliTrackedProfileMap = useMemo(
    () => new Map(bilibiliTrackedProfiles.map((profile) => [profile.uid, profile])),
    [bilibiliTrackedProfiles]
  );
  const bilibiliSmartGroupImportOptions = useMemo(() => {
    const currentSet = new Set((moduleConfig.up_uids || []).map((item) => String(item || "").trim()).filter(Boolean));
    return bilibiliSmartGroupOptions
      .map((option) => {
        const members = bilibiliTrackedProfiles.filter((profile) => profile.smartGroups.includes(option.value));
        return {
          ...option,
          totalMembers: members.length,
          importableMembers: members.filter((profile) => !currentSet.has(profile.uid)).length,
          sampleAuthors: members.slice(0, 3).map((profile) => profile.author),
        };
      })
      .filter((option) => option.totalMembers > 0);
  }, [bilibiliSmartGroupOptions, bilibiliTrackedProfiles, moduleConfig.up_uids]);
  const bilibiliActiveGroupCount = useMemo(
    () => (moduleConfig.followed_up_group_monitors || []).filter((item) => item.enabled).length,
    [moduleConfig.followed_up_group_monitors]
  );
  const bilibiliMonitorDefaults = getBilibiliMonitorDefaults(moduleConfig);

  useEffect(() => {
    api.get<ModuleConfig>(`/api/modules/${module.id}/config`)
      .then((config) => {
        if (module.id === "xiaohongshu-tracker") {
          const normalized = normalizeXhsTrackerConfig(config);
          setModuleConfig({
            ...config,
            keyword_monitors: normalized.keywordMonitors,
            following_scan: normalized.followingScan,
            following_scan_monitors: normalized.followingScanMonitors,
            creator_monitors: normalized.creatorMonitors,
          });
          return;
        }
        if (module.id === "bilibili-tracker") {
          setModuleConfig(normalizeBilibiliTrackerModuleConfig(config));
          return;
        }
        setModuleConfig(config);
      })
      .catch(() => setModuleConfig({}));

    // Load global config for semantic-scholar-tracker (for API key)
    if (module.id === "semantic-scholar-tracker") {
      api.get<{ semantic_scholar_api_key?: string }>("/api/config")
        .then((globalConfig) => {
          setModuleConfig((prev) => ({ ...prev, api_key: globalConfig.semantic_scholar_api_key || "" }));
        })
        .catch(() => {});
    }

    fetchSubscriptionDetails();
  }, [module.id]);

  useEffect(() => {
    if (module.id !== "bilibili-tracker") return;
    if (!moduleConfig.sessdata?.trim()) {
      setBilibiliOriginalGroups([]);
      return;
    }

    let cancelled = false;
    setLoadingBilibiliGroups(true);
    api.post<BilibiliFollowedUpsConfigResponse>("/api/tools/bilibili/followed-ups", {
      sessdata: moduleConfig.sessdata,
      max_count: 5000,
    })
      .then((res) => {
        if (!cancelled) {
          setBilibiliOriginalGroups(res.groups || []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBilibiliOriginalGroups([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingBilibiliGroups(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [module.id, moduleConfig.sessdata]);

  // 设置默认选中类型
  useEffect(() => {
    if (subConfig.types.length > 0 && !selectedType) {
      setSelectedType(subConfig.types[0].type);
    }
  }, [subConfig.types, selectedType]);

  async function fetchSubscriptionDetails() {
    setLoadingDetails(true);
    try {
      const data = await api.get<SubDetailData>(`/api/modules/${module.id}/subscriptions/detail`);
      setSubDetails(data);
    } catch {
      setSubDetails(null);
    } finally {
      setLoadingDetails(false);
    }
  }

  async function saveRuntimeSettings() {
    try {
      await api.patch(`/api/modules/${module.id}`, {
        enabled: moduleEnabled,
        schedule: schedule,
      });
      toast.success("保存成功");
      const modulesRes = await api.get<{ modules: FeedModule[] }>("/api/modules");
      if (modulesRes?.modules) {
        setFeedModules(modulesRes.modules);
      }
    } catch {
      toast.error("保存失败");
    }
  }

  async function runNow() {
    setRunning(true);
    try {
      await api.post(`/api/modules/${module.id}/run`, {});
      toast.success("已开始运行");
    } catch {
      toast.error("运行失败");
    } finally {
      setRunning(false);
    }
  }

  async function addSubscription() {
    if (!inputValue.trim()) {
      toast.error("请输入内容");
      return;
    }
    if (!selectedType) {
      toast.error("请选择订阅类型");
      return;
    }
    try {
      await api.post(`/api/modules/${module.id}/subscriptions`, {
        type: selectedType,
        value: inputValue.trim()
      });
      toast.success("订阅已添加");
      fetchSubscriptionDetails();
      setInputValue("");
      setShowAddForm(false);
    } catch (err: any) {
      console.error("Add subscription error:", err);
      toast.error(`添加失败: ${err.message || "请检查网络连接"}`);
    }
  }

  async function removeSubscription(type: string, value: string) {
    try {
      await api.delete(`/api/modules/${module.id}/subscriptions`, { type, value } as any);
      toast.success("订阅已移除");
      fetchSubscriptionDetails();
    } catch {
      toast.error("移除失败");
    }
  }

  async function toggleSubscription(type: string, value: string, isActive: boolean) {
    if (isActive) {
      // 禁用（软删除）
      await removeSubscription(type, value);
    } else {
      // 重新添加
      try {
        await api.post(`/api/modules/${module.id}/subscriptions`, { type, value });
        toast.success("订阅已恢复");
        fetchSubscriptionDetails();
      } catch {
        toast.error("恢复失败");
      }
    }
  }

  function formatDateTime(isoString: string): string {
    try {
      const date = new Date(isoString);
      return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    } catch {
      return isoString;
    }
  }

  const currentTypeConfig = subConfig.types.find(t => t.type === selectedType);

  async function saveModuleConfig(patch: Partial<ModuleConfig>, successTitle = "已保存") {
    try {
      const nextConfig = { ...moduleConfig, ...patch };
      await api.post(`/api/modules/${module.id}/config`, nextConfig);
      setModuleConfig(nextConfig);
      toast.success(successTitle);
    } catch {
      toast.error("保存失败");
    }
  }

  function setBilibiliDailyDynamicMonitors(nextMonitors: BilibiliDailyDynamicMonitor[]) {
    const normalized = nextMonitors.map((item) => normalizeBilibiliDailyDynamicMonitor(item, bilibiliMonitorDefaults));
    const activeKeywords = parseBilibiliStringListInput(
      normalized
        .filter((item) => item.enabled)
        .flatMap((item) => item.keywords || [])
        .join(", ")
    );
    setModuleConfig({
      ...moduleConfig,
      daily_dynamic_monitors: normalized,
      keywords: activeKeywords,
      enable_keyword_search: normalized.some((item) => item.enabled),
    });
  }

  function setBilibiliGroupMonitors(nextMonitors: BilibiliFollowedGroupMonitor[]) {
    const normalized = nextMonitors.map((item) => normalizeBilibiliFollowedGroupMonitor(item, bilibiliSmartGroupLabelLookup, bilibiliMonitorDefaults));
    setModuleConfig({
      ...moduleConfig,
      followed_up_group_monitors: normalized,
      followed_up_groups: normalized.filter((item) => item.enabled).map((item) => item.group_value),
    });
  }

  function toggleBilibiliGroup(group: string) {
    const current = moduleConfig.followed_up_group_monitors || [];
    const existing = current.find((item) => item.group_value === group);
    const next = existing
      ? current.map((item) => item.group_value === group ? { ...item, enabled: !item.enabled } : item)
      : [
          ...current,
          normalizeBilibiliFollowedGroupMonitor({
            group_value: group,
            label: bilibiliSmartGroupLabelLookup[group] || group,
            enabled: true,
          }, bilibiliSmartGroupLabelLookup, bilibiliMonitorDefaults),
        ];
    setBilibiliGroupMonitors(next);
  }

  function toggleBilibiliOriginalGroup(groupId: number) {
    const current = moduleConfig.followed_up_original_groups || [];
    const next = current.includes(groupId)
      ? current.filter((item) => item !== groupId)
      : [...current, groupId];
    setModuleConfig({ ...moduleConfig, followed_up_original_groups: next });
  }

  function toggleXhsCreatorGroup(group: string) {
    const current = moduleConfig.creator_groups || [];
    const next = current.includes(group)
      ? current.filter((item) => item !== group)
      : [...current, group];
    setModuleConfig({ ...moduleConfig, creator_groups: next });
  }

  function buildNextXhsFollowingScan(
    nextMonitors: XHSTrackerFollowingScanMonitor[],
    scanOverrides: Partial<XHSTrackerFollowingScan> = {},
  ) {
    const baseScan = moduleConfig.following_scan || createFollowingScan();
    const primaryMonitor = nextMonitors.find((monitor) => monitor.enabled) || nextMonitors[0];
    const nextKeywords = Array.from(new Set(
      nextMonitors.flatMap((monitor) => monitor.keywords || []).filter((keyword) => keyword.trim())
    ));

    return createFollowingScan({
      ...baseScan,
      keywords: nextKeywords,
      fetch_limit: primaryMonitor?.fetch_limit ?? baseScan.fetch_limit,
      recent_days: primaryMonitor?.recent_days ?? baseScan.recent_days,
      sort_by: primaryMonitor?.sort_by ?? baseScan.sort_by,
      keyword_filter: primaryMonitor?.keyword_filter ?? baseScan.keyword_filter,
      include_comments: primaryMonitor?.include_comments ?? baseScan.include_comments,
      comments_limit: primaryMonitor?.comments_limit ?? baseScan.comments_limit,
      comments_sort_by: primaryMonitor?.comments_sort_by ?? baseScan.comments_sort_by,
      ...scanOverrides,
    });
  }

  function setXhsFollowingScanMonitors(
    nextMonitors: XHSTrackerFollowingScanMonitor[],
    scanOverrides: Partial<XHSTrackerFollowingScan> = {},
  ) {
    setModuleConfig({
      ...moduleConfig,
      following_scan_monitors: nextMonitors,
      following_scan: buildNextXhsFollowingScan(nextMonitors, scanOverrides),
    });
  }

  function toggleXhsCreatorPush() {
    setModuleConfig({
      ...moduleConfig,
      creator_push_enabled: !(moduleConfig.creator_push_enabled ?? false),
    });
  }

  function getXhsCreatorMonitorGroupLabels(monitor: XHSTrackerCreatorMonitor): string[] {
    const normalizedUserId = normalizeXhsProfileUserId(monitor.user_id);
    const profile = moduleConfig.creator_profiles?.[normalizedUserId];
    const profileLabels = (profile?.smart_group_labels || []).map((item) => String(item || "").trim()).filter(Boolean);
    if (profileLabels.length > 0) return profileLabels;
    return (monitor.smart_group_labels || []).map((item) => String(item || "").trim()).filter(Boolean);
  }

  function toggleBilibiliDynamicType(type: number) {
    const current = moduleConfig.follow_feed_types || [8, 2, 4, 64];
    if (current.includes(type) && current.length === 1) {
      return;
    }
    const next = current.includes(type)
      ? current.filter((item) => item !== type)
      : [...current, type].sort((a, b) => a - b);
    setModuleConfig({ ...moduleConfig, follow_feed_types: next });
  }

  function addBilibiliManualUps() {
    const parsed = parseBilibiliStringListInput(bilibiliUpInput)
      .map((item) => extractBilibiliUid(item))
      .map((item) => String(item || "").trim())
      .filter(Boolean);
    if (parsed.length === 0) {
      toast.error("请输入有效的 UP UID 或空间链接");
      return;
    }
    const next = Array.from(new Set([...(moduleConfig.up_uids || []), ...parsed]));
    setModuleConfig({ ...moduleConfig, up_uids: next });
    setBilibiliUpInput("");
  }

  function removeBilibiliManualUp(uid: string) {
    setModuleConfig({
      ...moduleConfig,
      up_uids: (moduleConfig.up_uids || []).filter((item) => item !== uid),
    });
  }

  function importBilibiliSmartGroupMembers(groupValue: string) {
    const memberIds = bilibiliTrackedProfiles
      .filter((profile) => profile.smartGroups.includes(groupValue))
      .map((profile) => profile.uid);
    if (memberIds.length === 0) {
      toast.info("这个智能组里还没有可导入的 UP");
      return;
    }
    const next = Array.from(new Set([...(moduleConfig.up_uids || []), ...memberIds]));
    if (next.length === (moduleConfig.up_uids || []).length) {
      toast.info("这个智能组里的 UP 都已加入固定监督");
      return;
    }
    setModuleConfig({ ...moduleConfig, up_uids: next });
    toast.success(`已导入 ${next.length - (moduleConfig.up_uids || []).length} 个固定监督 UP`);
  }

  return (
    <PageContainer>
      <PageHeader
        title={module.name}
        subtitle={module.schedule}
        icon={Clock}
        actions={
          <>
            <button
              onClick={onBack}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 16px",
                borderRadius: "var(--radius-full)",
                background: "var(--bg-hover)",
                color: "var(--text-secondary)",
                fontSize: "0.875rem",
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
              }}
            >
              <ArrowLeft style={{ width: "16px", height: "16px" }} />
              返回
            </button>
            <button
              onClick={runNow}
              disabled={running}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 20px",
                borderRadius: "var(--radius-full)",
                background: "linear-gradient(135deg, var(--color-primary), var(--color-secondary))",
                color: "white",
                fontSize: "0.875rem",
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
              }}
            >
              <Play style={{ width: "16px", height: "16px" }} />
              {running ? "运行中..." : "立即运行"}
            </button>
          </>
        }
      />

      <PageContent maxWidth="700px">
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

          {/* 使用指南小卡片 */}
          <div style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "10px",
            padding: "10px 14px",
            borderRadius: "var(--radius-md)",
            background: "rgba(99, 205, 218, 0.1)",
            border: "1px solid rgba(99, 205, 218, 0.3)",
          }}>
            <Info style={{ width: "16px", height: "16px", color: "#63CDDA", flexShrink: 0, marginTop: "2px" }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-main)", marginBottom: "2px" }}>
                {subConfig.desc || `${module.name}模块`}
              </div>
              {subConfig.types.length > 0 && (
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "flex", flexWrap: "wrap", gap: "4px" }}>
                  支持类型:{subConfig.types.map(t => (
                    <span key={t.type} style={{ color: "var(--text-secondary)" }}>· {t.label}</span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 运行设置行 */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "12px 16px",
            borderRadius: "var(--radius-md)",
            background: "var(--bg-card)",
            border: "1px solid var(--border-light)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
              <div
                onClick={() => { setModuleEnabled(!moduleEnabled); }}
                style={{
                  width: "40px",
                  height: "22px",
                  borderRadius: "11px",
                  background: moduleEnabled ? "var(--color-primary)" : "var(--text-muted)",
                  position: "relative",
                  cursor: "pointer",
                  transition: "background 0.2s",
                }}
              >
                <div style={{
                  width: "18px",
                  height: "18px",
                  borderRadius: "50%",
                  background: "white",
                  position: "absolute",
                  top: "2px",
                  left: moduleEnabled ? "20px" : "2px",
                  transition: "left 0.2s",
                }} />
              </div>
              <span style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--text-main)" }}>
                {moduleEnabled ? "已开启" : "已关闭"}
              </span>
            </div>

            <div style={{ width: "1px", height: "20px", background: "var(--border-light)" }} />

            <Clock style={{ width: "14px", height: "14px", color: "var(--text-muted)", flexShrink: 0 }} />
            <select
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              style={{
                padding: "6px 10px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-light)",
                background: "var(--bg-app)",
                color: "var(--text-main)",
                fontSize: "0.8125rem",
                outline: "none",
                cursor: "pointer",
              }}
            >
              {scheduleOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            {module.next_run && (
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginLeft: "auto" }}>
                下次: {new Date(module.next_run).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </span>
            )}

            <button
              onClick={saveRuntimeSettings}
              style={{
                padding: "6px 12px",
                borderRadius: "var(--radius-md)",
                background: "var(--color-primary)",
                color: "white",
                fontSize: "0.75rem",
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              保存
            </button>
          </div>

          {/* 正在订阅卡片 */}
          <Card title={`正在订阅 (${subDetails?.subscriptions?.filter(s => s.is_active !== false).length || 0})`} icon={<Calendar style={{ width: "18px", height: "18px", color: "var(--color-primary)" }} />}>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>

              {/* 添加订阅按钮 */}
              {!showAddForm && subConfig.types.length > 0 && (
                <button
                  onClick={() => {
                    if (!selectedType && subConfig.types.length > 0) {
                      setSelectedType(subConfig.types[0].type);
                    }
                    setShowAddForm(true);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "12px 16px",
                    borderRadius: "var(--radius-md)",
                    border: "1px dashed var(--border-light)",
                    background: "var(--bg-hover)",
                    color: "var(--text-secondary)",
                    fontSize: "0.875rem",
                    cursor: "pointer",
                    width: "100%",
                  }}
                >
                  <Plus style={{ width: "16px", height: "16px" }} />
                  添加订阅
                </button>
              )}

              {/* 添加订阅表单 */}
              {showAddForm && (
                <div style={{
                  padding: "16px",
                  borderRadius: "var(--radius-md)",
                  background: "var(--bg-hover)",
                  border: "1px solid var(--border-light)",
                }}>
                  {/* 类型选择 */}
                  {subConfig.types.length > 1 && (
                    <div style={{ display: "flex", gap: "8px", marginBottom: "12px", flexWrap: "wrap" }}>
                      {subConfig.types.map((t) => (
                        <button
                          key={t.type}
                          onClick={() => { setSelectedType(t.type); setInputValue(""); }}
                          style={{
                            padding: "6px 12px",
                            borderRadius: "var(--radius-md)",
                            border: "1px solid var(--border-light)",
                            background: selectedType === t.type ? "var(--color-primary)" : "var(--bg-app)",
                            color: selectedType === t.type ? "white" : "var(--text-main)",
                            fontSize: "0.8125rem",
                            cursor: "pointer",
                          }}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* 输入框 */}
                  <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                    <input
                      type="text"
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      placeholder={currentTypeConfig?.placeholder || "输入..."}
                      style={{
                        flex: 1,
                        padding: "10px 14px",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid var(--border-light)",
                        background: "var(--bg-app)",
                        color: "var(--text-main)",
                        fontSize: "0.875rem",
                        outline: "none",
                      }}
                      onKeyDown={(e) => {
                        if (isActionEnterKey(e)) {
                          e.preventDefault();
                          addSubscription();
                        }
                      }}
                    />
                    <button
                      onClick={addSubscription}
                      style={{
                        padding: "10px 20px",
                        borderRadius: "var(--radius-md)",
                        background: "var(--color-primary)",
                        color: "white",
                        fontSize: "0.875rem",
                        fontWeight: 600,
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      添加
                    </button>
                    <button
                      onClick={() => { setShowAddForm(false); setInputValue(""); }}
                      style={{
                        padding: "10px",
                        borderRadius: "var(--radius-md)",
                        background: "transparent",
                        color: "var(--text-muted)",
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      <X style={{ width: "18px", height: "18px" }} />
                    </button>
                  </div>

                  {/* 示例提示 */}
                  {currentTypeConfig?.example && (
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "10px 12px",
                      borderRadius: "var(--radius-md)",
                      background: "rgba(248, 181, 0, 0.1)",
                      border: "1px dashed rgba(248, 181, 0, 0.3)",
                    }}>
                      <HelpCircle style={{ width: "14px", height: "14px", color: "#F8B500" }} />
                      <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                        示例: <code style={{ background: "rgba(248,181,0,0.15)", padding: "2px 6px", borderRadius: "4px", color: "#B8860B" }}>{currentTypeConfig.example}</code>
                      </span>
                    </div>
                  )}

                  {/* 历史订阅快捷恢复 */}
                  {subDetails && subDetails.subscriptions.filter(s => s.is_active === false).length > 0 && (
                    <div style={{ marginTop: "12px" }}>
                      <div style={{
                        fontSize: "0.75rem",
                        color: "var(--text-muted)",
                        marginBottom: "8px",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px"
                      }}>
                        <History style={{ width: "12px", height: "12px" }} />
                        点击恢复历史订阅
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {subDetails.subscriptions
                          .filter(s => s.is_active === false)
                          .slice(0, 5)
                          .map((sub, idx) => (
                            <button
                              key={idx}
                              onClick={() => {
                                setSelectedType(sub.type);
                                setInputValue(sub.value);
                              }}
                              style={{
                                padding: "4px 10px",
                                borderRadius: "9999px",
                                border: "1px solid var(--border-light)",
                                background: "var(--bg-app)",
                                color: "var(--text-muted)",
                                fontSize: "0.75rem",
                                cursor: "pointer",
                                textDecoration: "line-through",
                              }}
                            >
                              {sub.value}
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 订阅列表 */}
              {loadingDetails ? (
                <div style={{ textAlign: "center", padding: "20px", color: "var(--text-muted)", fontSize: "0.875rem" }}>
                  加载中...
                </div>
              ) : !subDetails || subDetails.subscriptions.filter(s => s.is_active !== false).length === 0 ? (
                <div style={{ textAlign: "center", padding: "20px", color: "var(--text-muted)", fontSize: "0.875rem" }}>
                  暂无订阅，点击上方添加
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {subDetails.subscriptions
                    .filter(s => s.is_active !== false)
                    .map((sub, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          padding: "10px 12px",
                          borderRadius: "var(--radius-md)",
                          background: "var(--bg-hover)",
                          border: "1px solid var(--border-light)",
                        }}
                      >
                        {/* 开关按钮 */}
                        <div
                          onClick={() => toggleSubscription(sub.type, sub.value, true)}
                          style={{
                            width: "36px",
                            height: "20px",
                            borderRadius: "10px",
                            background: "#10B981",
                            position: "relative",
                            cursor: "pointer",
                            transition: "background 0.2s",
                            flexShrink: 0,
                          }}
                        >
                          <div style={{
                            width: "16px",
                            height: "16px",
                            borderRadius: "50%",
                            background: "white",
                            position: "absolute",
                            top: "2px",
                            left: "18px",
                            transition: "left 0.2s",
                          }} />
                        </div>

                        <span style={{
                          fontSize: "0.65rem",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          background: TYPE_COLORS[sub.type] || "var(--color-primary)",
                          color: "white",
                          fontWeight: 600,
                          flexShrink: 0,
                        }}>
                          {TYPE_LABELS[sub.type] || sub.type}
                        </span>
                        <span style={{
                          flex: 1,
                          fontSize: "0.875rem",
                          color: "var(--text-main)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}>
                          {sub.value}
                        </span>
                        <span style={{
                          fontSize: "0.75rem",
                          color: "var(--text-muted)",
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                        }}>
                          <User style={{ width: "10px", height: "10px" }} />
                          {sub.added_by}
                        </span>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                          {formatDateTime(sub.added_at)}
                        </span>
                        <button
                          onClick={() => removeSubscription(sub.type, sub.value)}
                          style={{
                            padding: "4px",
                            borderRadius: "4px",
                            background: "transparent",
                            color: "var(--text-muted)",
                            border: "none",
                            cursor: "pointer",
                            opacity: 0.6,
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                          onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.6")}
                        >
                          <Trash2 style={{ width: "14px", height: "14px" }} />
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </Card>

          {/* 历史订阅折叠 */}
          {subDetails && subDetails.subscriptions.filter(s => s.is_active === false).length > 0 && (
            <Card>
              <div
                onClick={() => setShowHistory(!showHistory)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  cursor: "pointer",
                  fontSize: "0.875rem",
                  color: "var(--text-secondary)",
                }}
              >
                <History style={{ width: "16px", height: "16px" }} />
                <span>已移除的订阅 ({subDetails.subscriptions.filter(s => s.is_active === false).length})</span>
                <span style={{ marginLeft: "auto", transform: showHistory ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▼</span>
              </div>

              {showHistory && (
                <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
                  {subDetails.subscriptions
                    .filter(s => s.is_active === false)
                    .map((sub, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          padding: "10px 12px",
                          borderRadius: "var(--radius-md)",
                          background: "var(--bg-hover)",
                          opacity: 0.7,
                        }}
                      >
                        {/* 开关按钮 - 可恢复 */}
                        <div
                          onClick={() => toggleSubscription(sub.type, sub.value, false)}
                          style={{
                            width: "36px",
                            height: "20px",
                            borderRadius: "10px",
                            background: "var(--text-muted)",
                            position: "relative",
                            cursor: "pointer",
                            flexShrink: 0,
                          }}
                        >
                          <div style={{
                            width: "16px",
                            height: "16px",
                            borderRadius: "50%",
                            background: "white",
                            position: "absolute",
                            top: "2px",
                            left: "2px",
                          }} />
                        </div>

                        <span style={{
                          fontSize: "0.65rem",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          background: "var(--text-muted)",
                          color: "white",
                          fontWeight: 600,
                        }}>
                          {TYPE_LABELS[sub.type] || sub.type}
                        </span>
                        <span style={{ flex: 1, fontSize: "0.875rem", color: "var(--text-main)", textDecoration: "line-through" }}>
                          {sub.value}
                        </span>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                          {formatDateTime(sub.added_at)}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </Card>
          )}

          {/* 模块特殊配置 */}
          {module.id === "bilibili-tracker" && (
            <Card title="B站登录" icon={<User style={{ width: "18px", height: "18px", color: "var(--color-secondary)" }} />}>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-secondary)" }}>
                    SESSDATA
                  </label>
                  <input
                    type="password"
                    value={moduleConfig.sessdata || ""}
                    onChange={(e) => setModuleConfig({ ...moduleConfig, sessdata: e.target.value })}
                    placeholder="从 Cookie-Editor 复制 SESSDATA 的值"
                    style={{
                      padding: "10px 14px",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--border-light)",
                      background: "var(--bg-app)",
                      color: "var(--text-main)",
                      fontSize: "0.875rem",
                      outline: "none",
                      fontFamily: "monospace",
                    }}
                  />
                </div>
                <CookieGuide platform="bilibili" cookieName="SESSDATA" />
                <button
                  onClick={async () => {
                    await saveModuleConfig({
                      sessdata: moduleConfig.sessdata || "",
                    }, "Cookie 已保存");
                  }}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "var(--radius-md)",
                    background: "var(--color-primary)",
                    color: "white",
                    fontSize: "0.8125rem",
                    fontWeight: 600,
                    border: "none",
                    cursor: "pointer",
                    alignSelf: "flex-start",
                  }}
                >
                  保存 Cookie
                </button>
              </div>
            </Card>
          )}

          {module.id === "bilibili-tracker" && (
            <Card title="自动爬取策略" icon={<span style={{ fontSize: "16px" }}>🕸️</span>}>
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  padding: "12px 14px",
                  borderRadius: "var(--radius-md)",
                  background: "var(--bg-hover)",
                  border: "1px solid var(--border-light)",
                }}>
                  <div style={{ fontSize: "0.875rem", color: "var(--text-main)", fontWeight: 600 }}>
                    复用主动工具的真实监控定义
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
                    这里不再单独维护一套简化关键词，而是直接编辑每日情报真正使用的 B 站监控定义，包括常驻关键词监控、固定 UP 监督、原始分组和智能分组过滤。
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                    <span>关键词监控 {(moduleConfig.daily_dynamic_monitors || []).length} 条</span>
                    <span>固定监督 UP {(moduleConfig.up_uids || []).length} 个</span>
                    <span>已开智能分组 {bilibiliActiveGroupCount} 个</span>
                  </div>
                </div>

                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                  gap: "12px",
                }}>
                  <div style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                    padding: "12px 14px",
                    borderRadius: "var(--radius-md)",
                    background: "var(--bg-hover)",
                    border: "1px solid var(--border-light)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: 1 }}>
                        <span style={{ fontSize: "0.875rem", color: "var(--text-main)", fontWeight: 600 }}>
                          关注流自动爬取
                        </span>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
                          定时抓你的关注动态，再按下面的关键词监控、固定 UP 和分组定义做筛选。
                        </span>
                      </div>
                      <div
                        onClick={() => setModuleConfig({ ...moduleConfig, follow_feed: !(moduleConfig.follow_feed ?? false) })}
                        style={{
                          width: "40px",
                          height: "22px",
                          borderRadius: "11px",
                          background: (moduleConfig.follow_feed ?? false) ? "var(--color-primary)" : "var(--text-muted)",
                          position: "relative",
                          cursor: "pointer",
                          transition: "background 0.2s",
                          flexShrink: 0,
                        }}
                      >
                        <div style={{
                          width: "18px",
                          height: "18px",
                          borderRadius: "50%",
                          background: "white",
                          position: "absolute",
                          top: "2px",
                          left: (moduleConfig.follow_feed ?? false) ? "20px" : "2px",
                          transition: "left 0.2s",
                        }} />
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                      <label style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>抓取上限</label>
                      <input
                        type="number"
                        min={1}
                        max={500}
                        value={moduleConfig.fetch_follow_limit ?? 50}
                        onChange={(e) => setModuleConfig({
                          ...moduleConfig,
                          fetch_follow_limit: normalizeBilibiliPositiveInt(e.target.value, 50, 500),
                        })}
                        style={{
                          width: "90px",
                          padding: "8px 10px",
                          borderRadius: "var(--radius-md)",
                          border: "1px solid var(--border-light)",
                          background: "var(--bg-app)",
                          color: "var(--text-main)",
                          fontSize: "0.8125rem",
                          outline: "none",
                        }}
                      />
                    </div>
                  </div>

                  <div style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                    padding: "12px 14px",
                    borderRadius: "var(--radius-md)",
                    background: "var(--bg-hover)",
                    border: "1px solid var(--border-light)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: 1 }}>
                        <span style={{ fontSize: "0.875rem", color: "var(--text-main)", fontWeight: 600 }}>
                          启用关键词过滤
                        </span>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
                          关闭后会抓取选中范围里的全部动态；开启后只保留命中关键词监控定义的内容。
                        </span>
                      </div>
                      <div
                        onClick={() => setModuleConfig({ ...moduleConfig, keyword_filter: !(moduleConfig.keyword_filter ?? true) })}
                        style={{
                          width: "40px",
                          height: "22px",
                          borderRadius: "11px",
                          background: (moduleConfig.keyword_filter ?? true) ? "var(--color-primary)" : "var(--text-muted)",
                          position: "relative",
                          cursor: "pointer",
                          transition: "background 0.2s",
                          flexShrink: 0,
                        }}
                      >
                        <div style={{
                          width: "18px",
                          height: "18px",
                          borderRadius: "50%",
                          background: "white",
                          position: "absolute",
                          top: "2px",
                          left: (moduleConfig.keyword_filter ?? true) ? "20px" : "2px",
                          transition: "left 0.2s",
                        }} />
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                      <label style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>分组过滤</label>
                      <select
                        value={moduleConfig.followed_up_filter_mode || "and"}
                        onChange={(e) => setModuleConfig({
                          ...moduleConfig,
                          followed_up_filter_mode: e.target.value === "smart_only" ? "smart_only" : "and",
                        })}
                        style={{
                          padding: "8px 10px",
                          borderRadius: "var(--radius-md)",
                          border: "1px solid var(--border-light)",
                          background: "var(--bg-app)",
                          color: "var(--text-main)",
                          fontSize: "0.8125rem",
                          outline: "none",
                        }}
                      >
                        <option value="and">原始分组 + 智能分组</option>
                        <option value="smart_only">仅按智能分组</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <label style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-secondary)" }}>
                    动态类型
                  </label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {BILIBILI_DYNAMIC_TYPE_OPTIONS.map((option) => {
                      const active = (moduleConfig.follow_feed_types || [8, 2, 4, 64]).includes(option.value);
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => toggleBilibiliDynamicType(option.value)}
                          style={{
                            padding: "7px 12px",
                            borderRadius: "999px",
                            border: `1px solid ${active ? "var(--color-primary)" : "var(--border-light)"}`,
                            background: active ? "rgba(99, 102, 241, 0.12)" : "var(--bg-app)",
                            color: active ? "var(--color-primary)" : "var(--text-secondary)",
                            fontSize: "0.8125rem",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                  padding: "12px 14px",
                  borderRadius: "var(--radius-md)",
                  background: "var(--bg-hover)",
                  border: "1px solid var(--border-light)",
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: "0.875rem", color: "var(--text-main)", fontWeight: 600 }}>常驻关键词监控</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.6, marginTop: "4px" }}>
                        每一条都会复用主动工具同一套 `daily_dynamic_monitors` 定义；这里直接配置关键词、标签词、最近几天、保留条数和扫描页数上限。
                      </div>
                    </div>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                      已启用 {(moduleConfig.daily_dynamic_monitors || []).filter((item) => item.enabled).length} / {(moduleConfig.daily_dynamic_monitors || []).length}
                    </span>
                  </div>
                  {(moduleConfig.daily_dynamic_monitors || []).length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {(moduleConfig.daily_dynamic_monitors || []).map((monitor) => (
                        <div
                          key={monitor.id}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "10px",
                            padding: "12px 14px",
                            borderRadius: "var(--radius-md)",
                            background: "var(--bg-app)",
                            border: "1px solid var(--border-light)",
                          }}
                        >
                          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                            <input
                              type="text"
                              value={monitor.label}
                              onChange={(e) => setBilibiliDailyDynamicMonitors(
                                (moduleConfig.daily_dynamic_monitors || []).map((item) =>
                                  item.id === monitor.id ? normalizeBilibiliDailyDynamicMonitor({ ...item, label: e.target.value }) : item
                                )
                              )}
                              placeholder="监控名称"
                              style={{
                                flex: 1,
                                minWidth: "180px",
                                padding: "10px 14px",
                                borderRadius: "var(--radius-md)",
                                border: "1px solid var(--border-light)",
                                background: "var(--bg-hover)",
                                color: "var(--text-main)",
                                fontSize: "0.875rem",
                                outline: "none",
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => setBilibiliDailyDynamicMonitors(
                                (moduleConfig.daily_dynamic_monitors || []).map((item) =>
                                  item.id === monitor.id ? { ...item, enabled: !item.enabled } : item
                                )
                              )}
                              style={{
                                padding: "8px 14px",
                                borderRadius: "var(--radius-md)",
                                border: `1px solid ${monitor.enabled ? "var(--color-primary)" : "var(--border-light)"}`,
                                background: monitor.enabled ? "var(--color-primary)" : "var(--bg-app)",
                                color: monitor.enabled ? "white" : "var(--text-secondary)",
                                fontSize: "0.8125rem",
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                            >
                              {monitor.enabled ? "已开启" : "已关闭"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setBilibiliDailyDynamicMonitors(
                                (moduleConfig.daily_dynamic_monitors || []).filter((item) => item.id !== monitor.id)
                              )}
                              style={{
                                padding: "8px 14px",
                                borderRadius: "var(--radius-md)",
                                border: "1px solid var(--border-light)",
                                background: "var(--bg-app)",
                                color: "var(--text-secondary)",
                                fontSize: "0.8125rem",
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                            >
                              删除
                            </button>
                          </div>
                          <input
                            type="text"
                            value={(monitor.keywords || []).join(", ")}
                            onChange={(e) => setBilibiliDailyDynamicMonitors(
                              (moduleConfig.daily_dynamic_monitors || []).map((item) =>
                                item.id === monitor.id ? normalizeBilibiliDailyDynamicMonitor({
                                  ...item,
                                  keywords: parseBilibiliStringListInput(e.target.value),
                                }) : item
                              )
                            )}
                            placeholder="关键词: 科研, AI, 论文"
                            style={{
                              padding: "10px 14px",
                              borderRadius: "var(--radius-md)",
                              border: "1px solid var(--border-light)",
                              background: "var(--bg-hover)",
                              color: "var(--text-main)",
                              fontSize: "0.875rem",
                              outline: "none",
                            }}
                          />
                          <input
                            type="text"
                            value={(monitor.tag_filters || []).join(", ")}
                            onChange={(e) => setBilibiliDailyDynamicMonitors(
                              (moduleConfig.daily_dynamic_monitors || []).map((item) =>
                                item.id === monitor.id ? normalizeBilibiliDailyDynamicMonitor({
                                  ...item,
                                  tag_filters: parseBilibiliStringListInput(e.target.value),
                                }) : item
                              )
                            )}
                            placeholder="标签词: 机器人, Agent, 多模态"
                            style={{
                              padding: "10px 14px",
                              borderRadius: "var(--radius-md)",
                              border: "1px solid var(--border-light)",
                              background: "var(--bg-hover)",
                              color: "var(--text-main)",
                              fontSize: "0.875rem",
                              outline: "none",
                            }}
                          />
                          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                            <label style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>最近几天</label>
                            <input
                              type="number"
                              min={1}
                              max={365}
                              value={monitor.days_back ?? bilibiliMonitorDefaults.daysBack}
                              onChange={(e) => setBilibiliDailyDynamicMonitors(
                                (moduleConfig.daily_dynamic_monitors || []).map((item) =>
                                  item.id === monitor.id ? normalizeBilibiliDailyDynamicMonitor({
                                    ...item,
                                    days_back: Number(e.target.value || bilibiliMonitorDefaults.daysBack),
                                  }, bilibiliMonitorDefaults) : item
                                )
                              )}
                              style={{
                                width: "88px",
                                padding: "8px 10px",
                                borderRadius: "var(--radius-md)",
                                border: "1px solid var(--border-light)",
                                background: "var(--bg-hover)",
                                color: "var(--text-main)",
                                fontSize: "0.8125rem",
                                outline: "none",
                              }}
                            />
                            <label style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>保留条数</label>
                            <input
                              type="number"
                              min={1}
                              max={1000}
                              value={monitor.limit ?? bilibiliMonitorDefaults.limit}
                              onChange={(e) => setBilibiliDailyDynamicMonitors(
                                (moduleConfig.daily_dynamic_monitors || []).map((item) =>
                                  item.id === monitor.id ? normalizeBilibiliDailyDynamicMonitor({
                                    ...item,
                                    limit: Number(e.target.value || bilibiliMonitorDefaults.limit),
                                  }, bilibiliMonitorDefaults) : item
                                )
                              )}
                              style={{
                                width: "96px",
                                padding: "8px 10px",
                                borderRadius: "var(--radius-md)",
                                border: "1px solid var(--border-light)",
                                background: "var(--bg-hover)",
                                color: "var(--text-main)",
                                fontSize: "0.8125rem",
                                outline: "none",
                              }}
                            />
                            <label style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>扫描页数</label>
                            <input
                              type="number"
                              min={1}
                              max={100}
                              value={monitor.page_limit ?? bilibiliMonitorDefaults.pageLimit}
                              onChange={(e) => setBilibiliDailyDynamicMonitors(
                                (moduleConfig.daily_dynamic_monitors || []).map((item) =>
                                  item.id === monitor.id ? normalizeBilibiliDailyDynamicMonitor({
                                    ...item,
                                    page_limit: Number(e.target.value || bilibiliMonitorDefaults.pageLimit),
                                  }, bilibiliMonitorDefaults) : item
                                )
                              )}
                              style={{
                                width: "96px",
                                padding: "8px 10px",
                                borderRadius: "var(--radius-md)",
                                border: "1px solid var(--border-light)",
                                background: "var(--bg-hover)",
                                color: "var(--text-main)",
                                fontSize: "0.8125rem",
                                outline: "none",
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.7 }}>
                      还没有关键词监控。新增后，定时情报会直接复用这条定义的关键词、标签词、时间窗和抓取上限。
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setBilibiliDailyDynamicMonitors([
                      ...(moduleConfig.daily_dynamic_monitors || []),
                      normalizeBilibiliDailyDynamicMonitor({
                        label: `每日监控 ${(moduleConfig.daily_dynamic_monitors || []).length + 1}`,
                      }, bilibiliMonitorDefaults),
                    ])}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "var(--radius-md)",
                      background: "var(--bg-app)",
                      color: "var(--text-main)",
                      fontSize: "0.8125rem",
                      fontWeight: 600,
                      border: "1px solid var(--border-light)",
                      cursor: "pointer",
                      alignSelf: "flex-start",
                    }}
                  >
                    新增关键词监控
                  </button>
                </div>

                <div style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                  padding: "12px 14px",
                  borderRadius: "var(--radius-md)",
                  background: "var(--bg-hover)",
                  border: "1px solid var(--border-light)",
                }}>
                  <div>
                    <div style={{ fontSize: "0.875rem", color: "var(--text-main)", fontWeight: 600 }}>固定 UP 监督</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.6, marginTop: "4px" }}>
                      这里维护真正进入每日情报的 `up_uids`。定时抓取会复用关注监控同一套动态抓取、卡片预览和原文跳转逻辑；支持手动输入 UID / 空间链接，也可以从已有智能分组结果里批量导入。
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      flexWrap: "wrap",
                    }}
                  >
                    <label style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>抓取上限</label>
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      value={moduleConfig.fixed_up_monitor_limit ?? moduleConfig.fetch_follow_limit ?? 50}
                      onChange={(e) => setModuleConfig({
                        ...moduleConfig,
                        fixed_up_monitor_limit: normalizeBilibiliPositiveInt(
                          e.target.value,
                          moduleConfig.fetch_follow_limit ?? 50,
                          1000,
                        ),
                      })}
                      style={{
                        width: "110px",
                        padding: "8px 10px",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid var(--border-light)",
                        background: "var(--bg-app)",
                        color: "var(--text-main)",
                        fontSize: "0.8125rem",
                        outline: "none",
                      }}
                    />
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      固定 UP 每次最多保留多少条动态
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <input
                      type="text"
                      value={bilibiliUpInput}
                      onChange={(e) => setBilibiliUpInput(e.target.value)}
                      placeholder="输入 UP UID 或 https://space.bilibili.com/xxxx"
                      style={{
                        flex: 1,
                        minWidth: "240px",
                        padding: "10px 14px",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid var(--border-light)",
                        background: "var(--bg-app)",
                        color: "var(--text-main)",
                        fontSize: "0.875rem",
                        outline: "none",
                      }}
                      onKeyDown={(e) => {
                        if (isActionEnterKey(e)) {
                          e.preventDefault();
                          addBilibiliManualUps();
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={addBilibiliManualUps}
                      style={{
                        padding: "10px 16px",
                        borderRadius: "var(--radius-md)",
                        background: "var(--color-primary)",
                        color: "white",
                        fontSize: "0.8125rem",
                        fontWeight: 600,
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      加入固定监督
                    </button>
                  </div>
                  {(moduleConfig.up_uids || []).length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {(moduleConfig.up_uids || []).map((uid) => {
                        const profile = bilibiliTrackedProfileMap.get(uid);
                        const smartGroups = (profile?.smartGroups || []).map((groupValue) => bilibiliSmartGroupLabelLookup[groupValue] || groupValue);
                        const latestTitle = profile?.latestTitle || profile?.sampleTitles?.[0];
                        return (
                          <div
                            key={uid}
                            style={{
                              display: "flex",
                              alignItems: "flex-start",
                              justifyContent: "space-between",
                              gap: "12px",
                              padding: "12px 14px",
                              borderRadius: "var(--radius-md)",
                              border: "1px solid var(--border-light)",
                              background: "var(--bg-app)",
                              textAlign: "left",
                            }}
                          >
                            <div style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: 0 }}>
                              <div style={{ fontSize: "0.875rem", color: "var(--text-main)", fontWeight: 600 }}>
                                {profile?.author || `UP ${uid}`}
                              </div>
                              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontFamily: "monospace" }}>
                                {uid}
                              </div>
                              {smartGroups.length > 0 && (
                                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                                  {smartGroups.map((label) => (
                                    <span
                                      key={`${uid}-${label}`}
                                      style={{
                                        padding: "3px 8px",
                                        borderRadius: "999px",
                                        background: "rgba(99, 102, 241, 0.12)",
                                        color: "var(--color-primary)",
                                        fontSize: "0.6875rem",
                                        fontWeight: 600,
                                      }}
                                    >
                                      {label}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {latestTitle && (
                                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
                                  最近内容: {latestTitle}
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => removeBilibiliManualUp(uid)}
                              style={{
                                padding: "6px 10px",
                                borderRadius: "var(--radius-md)",
                                border: "1px solid var(--border-light)",
                                background: "var(--bg-hover)",
                                color: "var(--text-secondary)",
                                fontSize: "0.75rem",
                                fontWeight: 600,
                                cursor: "pointer",
                                flexShrink: 0,
                              }}
                            >
                              移除
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.7 }}>
                      还没有固定监督的 UP。这里只保留真正需要长期盯的作者，保存后会直接参与每日情报抓取。
                    </div>
                  )}
                  {bilibiliSmartGroupImportOptions.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                        从智能分组导入固定监督
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                        {bilibiliSmartGroupImportOptions.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => importBilibiliSmartGroupMembers(option.value)}
                            disabled={option.importableMembers === 0}
                            title={option.sampleAuthors.length > 0 ? option.sampleAuthors.join(" / ") : option.label}
                            style={{
                              padding: "8px 12px",
                              borderRadius: "var(--radius-md)",
                              border: "1px solid var(--border-light)",
                              background: option.importableMembers > 0 ? "var(--bg-app)" : "var(--bg-hover)",
                              color: option.importableMembers > 0 ? "var(--text-main)" : "var(--text-muted)",
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              cursor: option.importableMembers > 0 ? "pointer" : "not-allowed",
                              opacity: option.importableMembers > 0 ? 1 : 0.7,
                            }}
                          >
                            {option.label} · 可导入 {option.importableMembers} / {option.totalMembers}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                  padding: "12px 14px",
                  borderRadius: "var(--radius-md)",
                  background: "var(--bg-hover)",
                  border: "1px solid var(--border-light)",
                }}>
                  <div>
                    <div style={{ fontSize: "0.875rem", color: "var(--text-main)", fontWeight: 600 }}>分组推送</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.6, marginTop: "4px" }}>
                      智能分组追踪会复用主动工具同一套定向动态抓取逻辑。每个分组都可以单独设最近几天、保留条数和扫描页数上限。
                    </div>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                    <span>原始分组 {(moduleConfig.followed_up_original_groups || []).length} 个</span>
                    <span>智能分组 {bilibiliActiveGroupCount} 个</span>
                    <span>都不选时表示不过滤分组</span>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <label style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-secondary)" }}>
                      开启原始分组推送
                    </label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                      {loadingBilibiliGroups ? (
                        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>正在读取 B 站原始分组...</span>
                      ) : bilibiliOriginalGroups.length > 0 ? (
                        bilibiliOriginalGroups.map((group) => {
                          const active = (moduleConfig.followed_up_original_groups || []).includes(group.tag_id);
                          return (
                            <button
                              key={group.tag_id}
                              type="button"
                              onClick={() => toggleBilibiliOriginalGroup(group.tag_id)}
                              title={group.tip || group.name}
                              style={{
                                padding: "7px 12px",
                                borderRadius: "999px",
                                border: `1px solid ${active ? "#FB7299" : "var(--border-light)"}`,
                                background: active ? "rgba(251, 114, 153, 0.12)" : "var(--bg-app)",
                                color: active ? "#D64078" : "var(--text-secondary)",
                                fontSize: "0.8125rem",
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                            >
                              {group.name} {group.count ? `· ${group.count}` : ""}
                            </button>
                          );
                        })
                      ) : (
                        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                          保存有效 SESSDATA 后会自动读取你在 B 站里的原始关注分组。
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <label style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-secondary)" }}>
                      开启智能分组推送
                    </label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                      {bilibiliSmartGroupOptions.map((option) => {
                        const active = (moduleConfig.followed_up_group_monitors || []).some(
                          (item) => item.group_value === option.value && item.enabled
                        );
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => toggleBilibiliGroup(option.value)}
                            style={{
                              padding: "7px 12px",
                              borderRadius: "999px",
                              border: `1px solid ${active ? "var(--color-primary)" : "var(--border-light)"}`,
                              background: active ? "rgba(99, 102, 241, 0.12)" : "var(--bg-app)",
                              color: active ? "var(--color-primary)" : "var(--text-secondary)",
                              fontSize: "0.8125rem",
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {(moduleConfig.followed_up_group_monitors || []).length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {(moduleConfig.followed_up_group_monitors || []).map((monitor) => (
                        <div
                          key={monitor.id}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "10px",
                            padding: "12px 14px",
                            borderRadius: "var(--radius-md)",
                            background: "var(--bg-app)",
                            border: "1px solid var(--border-light)",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                            <div>
                              <div style={{ fontSize: "0.875rem", color: "var(--text-main)", fontWeight: 600 }}>{monitor.label}</div>
                              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "4px" }}>
                                分组键：{monitor.group_value}
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                              <button
                                type="button"
                                onClick={() => setBilibiliGroupMonitors(
                                  (moduleConfig.followed_up_group_monitors || []).map((item) =>
                                    item.id === monitor.id ? normalizeBilibiliFollowedGroupMonitor({
                                      ...item,
                                      enabled: !item.enabled,
                                    }, bilibiliSmartGroupLabelLookup, bilibiliMonitorDefaults) : item
                                  )
                                )}
                                style={{
                                  padding: "8px 14px",
                                  borderRadius: "var(--radius-md)",
                                  border: `1px solid ${monitor.enabled ? "var(--color-primary)" : "var(--border-light)"}`,
                                  background: monitor.enabled ? "var(--color-primary)" : "var(--bg-app)",
                                  color: monitor.enabled ? "white" : "var(--text-secondary)",
                                  fontSize: "0.8125rem",
                                  fontWeight: 600,
                                  cursor: "pointer",
                                }}
                              >
                                {monitor.enabled ? "已开启" : "已关闭"}
                              </button>
                              <button
                                type="button"
                                onClick={() => setBilibiliGroupMonitors(
                                  (moduleConfig.followed_up_group_monitors || []).filter((item) => item.id !== monitor.id)
                                )}
                                style={{
                                  padding: "8px 14px",
                                  borderRadius: "var(--radius-md)",
                                  border: "1px solid var(--border-light)",
                                  background: "var(--bg-app)",
                                  color: "var(--text-secondary)",
                                  fontSize: "0.8125rem",
                                  fontWeight: 600,
                                  cursor: "pointer",
                                }}
                              >
                                删除
                              </button>
                            </div>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                            <label style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>最近几天</label>
                            <input
                              type="number"
                              min={1}
                              max={365}
                              value={monitor.days_back ?? bilibiliMonitorDefaults.daysBack}
                              onChange={(e) => setBilibiliGroupMonitors(
                                (moduleConfig.followed_up_group_monitors || []).map((item) =>
                                  item.id === monitor.id ? normalizeBilibiliFollowedGroupMonitor({
                                    ...item,
                                    days_back: Number(e.target.value || bilibiliMonitorDefaults.daysBack),
                                  }, bilibiliSmartGroupLabelLookup, bilibiliMonitorDefaults) : item
                                )
                              )}
                              style={{
                                width: "88px",
                                padding: "8px 10px",
                                borderRadius: "var(--radius-md)",
                                border: "1px solid var(--border-light)",
                                background: "var(--bg-hover)",
                                color: "var(--text-main)",
                                fontSize: "0.8125rem",
                                outline: "none",
                              }}
                            />
                            <label style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>保留条数</label>
                            <input
                              type="number"
                              min={1}
                              max={1000}
                              value={monitor.limit ?? bilibiliMonitorDefaults.limit}
                              onChange={(e) => setBilibiliGroupMonitors(
                                (moduleConfig.followed_up_group_monitors || []).map((item) =>
                                  item.id === monitor.id ? normalizeBilibiliFollowedGroupMonitor({
                                    ...item,
                                    limit: Number(e.target.value || bilibiliMonitorDefaults.limit),
                                  }, bilibiliSmartGroupLabelLookup, bilibiliMonitorDefaults) : item
                                )
                              )}
                              style={{
                                width: "96px",
                                padding: "8px 10px",
                                borderRadius: "var(--radius-md)",
                                border: "1px solid var(--border-light)",
                                background: "var(--bg-hover)",
                                color: "var(--text-main)",
                                fontSize: "0.8125rem",
                                outline: "none",
                              }}
                            />
                            <label style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>扫描页数</label>
                            <input
                              type="number"
                              min={1}
                              max={100}
                              value={monitor.page_limit ?? bilibiliMonitorDefaults.pageLimit}
                              onChange={(e) => setBilibiliGroupMonitors(
                                (moduleConfig.followed_up_group_monitors || []).map((item) =>
                                  item.id === monitor.id ? normalizeBilibiliFollowedGroupMonitor({
                                    ...item,
                                    page_limit: Number(e.target.value || bilibiliMonitorDefaults.pageLimit),
                                  }, bilibiliSmartGroupLabelLookup, bilibiliMonitorDefaults) : item
                                )
                              )}
                              style={{
                                width: "96px",
                                padding: "8px 10px",
                                borderRadius: "var(--radius-md)",
                                border: "1px solid var(--border-light)",
                                background: "var(--bg-hover)",
                                color: "var(--text-main)",
                                fontSize: "0.8125rem",
                                outline: "none",
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.7 }}>
                      还没有启用智能分组追踪。点上面的分组标签后，就会生成对应监控并沿用主动抓取的动态卡片与保存路径。
                    </div>
                  )}
                </div>

                <button
                  onClick={async () => {
                    const normalizedDailyDynamicMonitors = (moduleConfig.daily_dynamic_monitors || [])
                      .map((item) => normalizeBilibiliDailyDynamicMonitor(item, bilibiliMonitorDefaults))
                      .filter((item) => item.keywords.length > 0 || item.tag_filters.length > 0);
                    const normalizedGroupMonitors = (moduleConfig.followed_up_group_monitors || [])
                      .map((item) => normalizeBilibiliFollowedGroupMonitor(item, bilibiliSmartGroupLabelLookup, bilibiliMonitorDefaults))
                      .filter((item) => item.group_value);
                    await saveModuleConfig({
                      sessdata: moduleConfig.sessdata || "",
                      follow_feed: moduleConfig.follow_feed ?? false,
                      follow_feed_types: moduleConfig.follow_feed_types || [8, 2, 4, 64],
                      fetch_follow_limit: moduleConfig.fetch_follow_limit ?? 50,
                      fixed_up_monitor_limit: moduleConfig.fixed_up_monitor_limit ?? moduleConfig.fetch_follow_limit ?? 50,
                      keyword_filter: moduleConfig.keyword_filter ?? true,
                      up_uids: Array.from(new Set((moduleConfig.up_uids || []).map((item) => String(item || "").trim()).filter(Boolean))),
                      daily_dynamic_monitors: normalizedDailyDynamicMonitors,
                      followed_up_group_monitors: normalizedGroupMonitors,
                      followed_up_original_groups: moduleConfig.followed_up_original_groups || [],
                      followed_up_groups: normalizedGroupMonitors.filter((item) => item.enabled).map((item) => item.group_value),
                      followed_up_filter_mode: moduleConfig.followed_up_filter_mode === "smart_only" ? "smart_only" : "and",
                    }, "B站爬取策略已保存");
                  }}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "var(--radius-md)",
                    background: "var(--color-primary)",
                    color: "white",
                    fontSize: "0.8125rem",
                    fontWeight: 600,
                    border: "none",
                    cursor: "pointer",
                    alignSelf: "flex-start",
                  }}
                >
                  保存爬取策略
                </button>
              </div>
            </Card>
          )}

          {/* arXiv 关键词配置 */}
          {module.id === "arxiv-tracker" && (
            <Card title="关键词" icon={<span style={{ fontSize: "14px" }}>🔤</span>}>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <input
                  type="text"
                  value={(moduleConfig.keywords || []).join(", ")}
                  onChange={(e) => setModuleConfig({ ...moduleConfig, keywords: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
                  placeholder="robotics, manipulation, grasp"
                  style={{
                    padding: "10px 14px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-light)",
                    background: "var(--bg-app)",
                    color: "var(--text-main)",
                    fontSize: "0.875rem",
                    outline: "none",
                  }}
                />
                <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: 0 }}>
                  输入英文关键词，用逗号分隔。系统会自动追踪包含这些关键词的新论文
                </p>
                <button
                  onClick={async () => {
                    try {
                      await api.post("/api/preferences", { modules: { [module.id]: { keywords: moduleConfig.keywords } } });
                      toast.success("已保存");
                    } catch {
                      toast.error("保存失败");
                    }
                  }}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "var(--radius-md)",
                    background: "var(--color-primary)",
                    color: "white",
                    fontSize: "0.8125rem",
                    fontWeight: 600,
                    border: "none",
                    cursor: "pointer",
                    alignSelf: "flex-start",
                  }}
                >
                  保存关键词
                </button>
              </div>
            </Card>
          )}

          {/* Semantic Scholar API Key 配置 */}
          {module.id === "semantic-scholar-tracker" && (
            <Card title="API 配置" icon={<span style={{ fontSize: "14px" }}>🔑</span>}>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-secondary)" }}>
                    Semantic Scholar API Key
                  </label>
                  <input
                    type="password"
                    value={moduleConfig.api_key || ""}
                    onChange={(e) => setModuleConfig({ ...moduleConfig, api_key: e.target.value })}
                    placeholder="输入你的 API Key（可选）"
                    style={{
                      padding: "10px 14px",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--border-light)",
                      background: "var(--bg-app)",
                      color: "var(--text-main)",
                      fontSize: "0.875rem",
                      outline: "none",
                    }}
                  />
                  <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: 0 }}>
                    留空将使用默认 API Key。如需使用自己的 Key，请从
                    <a href="https://www.semanticscholar.org/product/api" target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-primary)", textDecoration: "underline" }}>Semantic Scholar</a>
                    申请
                  </p>
                </div>
                <button
                  onClick={async () => {
                    try {
                      await api.post("/api/config", { semantic_scholar_api_key: moduleConfig.api_key || "" });
                      toast.success("API Key 已保存");
                    } catch {
                      toast.error("保存失败");
                    }
                  }}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "var(--radius-md)",
                    background: "var(--color-primary)",
                    color: "white",
                    fontSize: "0.8125rem",
                    fontWeight: 600,
                    border: "none",
                    cursor: "pointer",
                    alignSelf: "flex-start",
                  }}
                >
                  保存 API Key
                </button>
              </div>
            </Card>
          )}

          {/* 小红书 Cookie 配置 */}
          {module.id === "xiaohongshu-tracker" && (
            <Card title="小红书登录" icon={<span style={{ fontSize: "18px" }}>📕</span>}>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-secondary)" }}>
                    web_session
                  </label>
                  <input
                    type="password"
                    value={moduleConfig.web_session || ""}
                    onChange={(e) => setModuleConfig({ ...moduleConfig, web_session: e.target.value })}
                    placeholder="从 Cookie-Editor 复制 web_session 的值"
                    style={{
                      padding: "10px 14px",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--border-light)",
                      background: "var(--bg-app)",
                      color: "var(--text-main)",
                      fontSize: "0.875rem",
                      outline: "none",
                      fontFamily: "monospace",
                    }}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-secondary)" }}>
                    id_token <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 400 }}>(可选)</span>
                  </label>
                  <input
                    type="password"
                    value={moduleConfig.id_token || ""}
                    onChange={(e) => setModuleConfig({ ...moduleConfig, id_token: e.target.value })}
                    placeholder="从 Cookie-Editor 复制 id_token 的值"
                    style={{
                      padding: "10px 14px",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--border-light)",
                      background: "var(--bg-app)",
                      color: "var(--text-main)",
                      fontSize: "0.875rem",
                      outline: "none",
                      fontFamily: "monospace",
                    }}
                  />
                </div>
                <CookieGuide platform="xiaohongshu" cookieName="Cookie" />
                <button
                  onClick={async () => {
                    await saveModuleConfig({
                      web_session: moduleConfig.web_session || "",
                      id_token: moduleConfig.id_token || "",
                    });
                  }}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "var(--radius-md)",
                    background: "var(--color-primary)",
                    color: "white",
                    fontSize: "0.8125rem",
                    fontWeight: 600,
                    border: "none",
                    cursor: "pointer",
                    alignSelf: "flex-start",
                  }}
                >
                  保存 Cookie
                </button>
              </div>
            </Card>
          )}

          {module.id === "xiaohongshu-tracker" && (
            <Card title="自动爬取策略" icon={<span style={{ fontSize: "16px" }}>🕸️</span>}>
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  padding: "12px 14px",
                  borderRadius: "var(--radius-md)",
                  background: "var(--bg-hover)",
                  border: "1px solid var(--border-light)",
                }}>
                  <div style={{ fontSize: "0.875rem", color: "var(--text-main)", fontWeight: 600 }}>
                    情报推送 / 关注流扫描 / 特定关注
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
                    这里直接编辑小红书监控的真实定义。默认不抓评论；开启评论时默认按前 20 条高赞抓取。
                  </div>
                </div>

                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
                  gap: "16px",
                  alignItems: "start",
                }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px", minWidth: 0 }}>
                    <div style={{ fontSize: "0.875rem", color: "var(--text-main)", fontWeight: 600 }}>搜索关键词推送</div>
                    {(moduleConfig.keyword_monitors || []).map((monitor) => (
                      <div
                        key={monitor.id}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "10px",
                          padding: "12px 14px",
                          borderRadius: "var(--radius-md)",
                          background: "var(--bg-hover)",
                          border: "1px solid var(--border-light)",
                        }}
                      >
                        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                          <input
                            type="text"
                            value={monitor.label}
                            onChange={(e) => setModuleConfig({
                              ...moduleConfig,
                              keyword_monitors: (moduleConfig.keyword_monitors || []).map((item) =>
                                item.id === monitor.id ? { ...item, label: e.target.value } : item
                              ),
                            })}
                            placeholder="定义名称"
                            style={{
                              flex: 1,
                              minWidth: "180px",
                              padding: "10px 14px",
                              borderRadius: "var(--radius-md)",
                              border: "1px solid var(--border-light)",
                              background: "var(--bg-app)",
                              color: "var(--text-main)",
                              fontSize: "0.875rem",
                              outline: "none",
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => setModuleConfig({
                              ...moduleConfig,
                              keyword_monitors: (moduleConfig.keyword_monitors || []).map((item) =>
                                item.id === monitor.id ? { ...item, enabled: !item.enabled } : item
                              ),
                            })}
                            style={{
                              padding: "8px 14px",
                              borderRadius: "var(--radius-md)",
                              border: `1px solid ${monitor.enabled ? "var(--color-primary)" : "var(--border-light)"}`,
                              background: monitor.enabled ? "var(--color-primary)" : "var(--bg-app)",
                              color: monitor.enabled ? "white" : "var(--text-secondary)",
                              fontSize: "0.8125rem",
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            {monitor.enabled ? "已开启" : "已关闭"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setModuleConfig({
                              ...moduleConfig,
                              keyword_monitors: (moduleConfig.keyword_monitors || []).filter((item) => item.id !== monitor.id),
                            })}
                            style={{
                              padding: "8px 14px",
                              borderRadius: "var(--radius-md)",
                              border: "1px solid var(--border-light)",
                              background: "var(--bg-app)",
                              color: "var(--text-secondary)",
                              fontSize: "0.8125rem",
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            删除
                          </button>
                        </div>
                        <input
                          type="text"
                          value={formatKeywordInput(monitor.keywords)}
                          onChange={(e) => setModuleConfig({
                            ...moduleConfig,
                            keyword_monitors: (moduleConfig.keyword_monitors || []).map((item) =>
                              item.id === monitor.id ? { ...item, keywords: parseKeywordInput(e.target.value) } : item
                            ),
                          })}
                          placeholder="科研工具, 论文写作, AI 工作流"
                          style={{
                            padding: "10px 14px",
                            borderRadius: "var(--radius-md)",
                            border: "1px solid var(--border-light)",
                            background: "var(--bg-app)",
                            color: "var(--text-main)",
                            fontSize: "0.875rem",
                            outline: "none",
                          }}
                        />
                        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                          <label style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                            最低点赞
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={monitor.min_likes}
                            onChange={(e) => setModuleConfig({
                              ...moduleConfig,
                              keyword_monitors: (moduleConfig.keyword_monitors || []).map((item) =>
                                item.id === monitor.id ? { ...item, min_likes: Number(e.target.value || 0) } : item
                              ),
                            })}
                            style={{
                              width: "88px",
                              padding: "8px 10px",
                              borderRadius: "var(--radius-md)",
                              border: "1px solid var(--border-light)",
                              background: "var(--bg-app)",
                              color: "var(--text-main)",
                              fontSize: "0.8125rem",
                              outline: "none",
                            }}
                          />
                          <label style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                            每词抓取
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={100}
                            value={monitor.per_keyword_limit}
                            onChange={(e) => setModuleConfig({
                              ...moduleConfig,
                              keyword_monitors: (moduleConfig.keyword_monitors || []).map((item) =>
                                item.id === monitor.id ? { ...item, per_keyword_limit: Number(e.target.value || 1) } : item
                              ),
                            })}
                            style={{
                              width: "88px",
                              padding: "8px 10px",
                              borderRadius: "var(--radius-md)",
                              border: "1px solid var(--border-light)",
                              background: "var(--bg-app)",
                              color: "var(--text-main)",
                              fontSize: "0.8125rem",
                              outline: "none",
                            }}
                          />
                          <label style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                            最近天数
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={365}
                            value={monitor.recent_days}
                            onChange={(e) => setModuleConfig({
                              ...moduleConfig,
                              keyword_monitors: (moduleConfig.keyword_monitors || []).map((item) =>
                                item.id === monitor.id ? createKeywordMonitor({ ...item, recent_days: Number(e.target.value || 1) }) : item
                              ),
                            })}
                            style={{
                              width: "88px",
                              padding: "8px 10px",
                              borderRadius: "var(--radius-md)",
                              border: "1px solid var(--border-light)",
                              background: "var(--bg-app)",
                              color: "var(--text-main)",
                              fontSize: "0.8125rem",
                              outline: "none",
                            }}
                          />
                          <select
                            value={monitor.sort_by}
                            onChange={(e) => setModuleConfig({
                              ...moduleConfig,
                              keyword_monitors: (moduleConfig.keyword_monitors || []).map((item) =>
                                item.id === monitor.id ? createKeywordMonitor({ ...item, sort_by: e.target.value as "likes" | "time" }) : item
                              ),
                            })}
                            style={{
                              padding: "8px 10px",
                              borderRadius: "var(--radius-md)",
                              border: "1px solid var(--border-light)",
                              background: "var(--bg-app)",
                              color: "var(--text-main)",
                              fontSize: "0.8125rem",
                              outline: "none",
                            }}
                          >
                            <option value="likes">高赞优先</option>
                            <option value="time">最新优先</option>
                          </select>
                          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                            <input
                              type="checkbox"
                              checked={monitor.include_comments}
                              onChange={(e) => setModuleConfig({
                                ...moduleConfig,
                                keyword_monitors: (moduleConfig.keyword_monitors || []).map((item) =>
                                  item.id === monitor.id ? { ...item, include_comments: e.target.checked } : item
                                ),
                              })}
                            />
                            选爬评论
                          </label>
                          {monitor.include_comments ? (
                            <>
                              <input
                                type="number"
                                min={1}
                                max={100}
                                value={monitor.comments_limit}
                                onChange={(e) => setModuleConfig({
                                  ...moduleConfig,
                                  keyword_monitors: (moduleConfig.keyword_monitors || []).map((item) =>
                                    item.id === monitor.id ? { ...item, comments_limit: Number(e.target.value || 1) } : item
                                  ),
                                })}
                                style={{
                                  width: "72px",
                                  padding: "8px 10px",
                                  borderRadius: "var(--radius-md)",
                                  border: "1px solid var(--border-light)",
                                  background: "var(--bg-app)",
                                  color: "var(--text-main)",
                                  fontSize: "0.8125rem",
                                  outline: "none",
                                }}
                              />
                              <select
                                value={monitor.comments_sort_by}
                                onChange={(e) => setModuleConfig({
                                  ...moduleConfig,
                                  keyword_monitors: (moduleConfig.keyword_monitors || []).map((item) =>
                                    item.id === monitor.id ? { ...item, comments_sort_by: e.target.value as "likes" | "time" } : item
                                  ),
                                })}
                                style={{
                                  padding: "8px 10px",
                                  borderRadius: "var(--radius-md)",
                                  border: "1px solid var(--border-light)",
                                  background: "var(--bg-app)",
                                  color: "var(--text-main)",
                                  fontSize: "0.8125rem",
                                  outline: "none",
                                }}
                              >
                                <option value="likes">高赞优先</option>
                                <option value="time">最新优先</option>
                              </select>
                            </>
                          ) : null}
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setModuleConfig({
                        ...moduleConfig,
                        keyword_monitors: [
                          ...(moduleConfig.keyword_monitors || []),
                          createKeywordMonitor({ label: `情报推送 ${(moduleConfig.keyword_monitors || []).length + 1}` }),
                        ],
                      })}
                      style={{
                        padding: "8px 16px",
                        borderRadius: "var(--radius-md)",
                        background: "var(--bg-app)",
                        color: "var(--text-main)",
                        fontSize: "0.8125rem",
                        fontWeight: 600,
                        border: "1px solid var(--border-light)",
                        cursor: "pointer",
                        alignSelf: "flex-start",
                      }}
                    >
                      新增搜索关键词推送
                    </button>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "16px", minWidth: 0 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      <div style={{ fontSize: "0.875rem", color: "var(--text-main)", fontWeight: 600 }}>关注流关键词推送</div>
                      <div style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "10px",
                        padding: "12px 14px",
                        borderRadius: "var(--radius-md)",
                        background: "var(--bg-hover)",
                        border: "1px solid var(--border-light)",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                            <span style={{ fontSize: "0.8125rem", color: "var(--text-main)", fontWeight: 600 }}>
                              已关注流关键词定义
                            </span>
                            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
                              这里复用主动工具里的关注流搜索定义。会先抓真实已关注流，再按每条关键词定义过滤。
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const next = !(moduleConfig.following_scan?.enabled ?? false);
                              const currentMonitors = moduleConfig.following_scan_monitors || [];
                              const nextMonitors = currentMonitors.map((monitor) => ({ ...monitor, enabled: next }));
                              setXhsFollowingScanMonitors(nextMonitors, { enabled: next });
                            }}
                            style={{
                              padding: "8px 14px",
                              borderRadius: "var(--radius-md)",
                              border: `1px solid ${(moduleConfig.following_scan?.enabled ?? false) ? "var(--color-primary)" : "var(--border-light)"}`,
                              background: (moduleConfig.following_scan?.enabled ?? false) ? "var(--color-primary)" : "var(--bg-app)",
                              color: (moduleConfig.following_scan?.enabled ?? false) ? "white" : "var(--text-secondary)",
                              fontSize: "0.8125rem",
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            {(moduleConfig.following_scan?.enabled ?? false) ? "总开关已开启" : "总开关已关闭"}
                          </button>
                        </div>
                        <div style={{ display: "grid", gap: "10px" }}>
                          {(moduleConfig.following_scan_monitors || []).length > 0 ? (
                            (moduleConfig.following_scan_monitors || []).map((monitor) => (
                              <div
                                key={monitor.id}
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: "10px",
                                  padding: "12px 14px",
                                  borderRadius: "var(--radius-md)",
                                  background: "var(--bg-app)",
                                  border: "1px solid var(--border-light)",
                                }}
                              >
                                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                                  <input
                                    type="text"
                                    value={monitor.label}
                                    onChange={(e) => setXhsFollowingScanMonitors(
                                      (moduleConfig.following_scan_monitors || []).map((item) =>
                                        item.id === monitor.id
                                          ? { ...item, label: e.target.value }
                                          : item
                                      )
                                    )}
                                    placeholder="定义名称"
                                    style={{
                                      flex: 1,
                                      minWidth: "180px",
                                      padding: "10px 14px",
                                      borderRadius: "var(--radius-md)",
                                      border: "1px solid var(--border-light)",
                                      background: "var(--bg-hover)",
                                      color: "var(--text-main)",
                                      fontSize: "0.875rem",
                                      outline: "none",
                                    }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const nextMonitors = (moduleConfig.following_scan_monitors || []).map((item) =>
                                        item.id === monitor.id ? { ...item, enabled: !item.enabled } : item
                                      );
                                      const nextEnabled = nextMonitors.some((item) => item.enabled);
                                      setXhsFollowingScanMonitors(nextMonitors, { enabled: nextEnabled });
                                    }}
                                    style={{
                                      padding: "8px 14px",
                                      borderRadius: "var(--radius-md)",
                                      border: `1px solid ${monitor.enabled ? "var(--color-primary)" : "var(--border-light)"}`,
                                      background: monitor.enabled ? "rgba(99, 102, 241, 0.12)" : "var(--bg-hover)",
                                      color: monitor.enabled ? "var(--color-primary)" : "var(--text-secondary)",
                                      fontSize: "0.8125rem",
                                      fontWeight: 700,
                                      cursor: "pointer",
                                    }}
                                  >
                                    {monitor.enabled ? "已开启" : "已关闭"}
                                  </button>
                                </div>
                                <input
                                  type="text"
                                  value={formatKeywordInput(monitor.keywords || [])}
                                  onChange={(e) => setXhsFollowingScanMonitors(
                                    (moduleConfig.following_scan_monitors || []).map((item) =>
                                      item.id === monitor.id
                                        ? { ...item, keywords: parseKeywordInput(e.target.value) }
                                        : item
                                    )
                                  )}
                                  placeholder="关注流过滤关键词"
                                  style={{
                                    padding: "10px 14px",
                                    borderRadius: "var(--radius-md)",
                                    border: "1px solid var(--border-light)",
                                    background: "var(--bg-hover)",
                                    color: "var(--text-main)",
                                    fontSize: "0.875rem",
                                    outline: "none",
                                  }}
                                />
                                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                                  <label style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>抓取上限</label>
                                  <input
                                    type="number"
                                    min={1}
                                    max={200}
                                    value={monitor.fetch_limit}
                                    onChange={(e) => setXhsFollowingScanMonitors(
                                      (moduleConfig.following_scan_monitors || []).map((item) =>
                                        item.id === monitor.id
                                          ? createFollowingScanMonitor({ ...item, fetch_limit: Number(e.target.value || 1) })
                                          : item
                                      )
                                    )}
                                    style={{
                                      width: "88px",
                                      padding: "8px 10px",
                                      borderRadius: "var(--radius-md)",
                                      border: "1px solid var(--border-light)",
                                      background: "var(--bg-hover)",
                                      color: "var(--text-main)",
                                      fontSize: "0.8125rem",
                                      outline: "none",
                                    }}
                                  />
                                  <label style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>最近天数</label>
                                  <input
                                    type="number"
                                    min={1}
                                    max={365}
                                    value={monitor.recent_days}
                                    onChange={(e) => setXhsFollowingScanMonitors(
                                      (moduleConfig.following_scan_monitors || []).map((item) =>
                                        item.id === monitor.id
                                          ? createFollowingScanMonitor({ ...item, recent_days: Number(e.target.value || 1) })
                                          : item
                                      )
                                    )}
                                    style={{
                                      width: "88px",
                                      padding: "8px 10px",
                                      borderRadius: "var(--radius-md)",
                                      border: "1px solid var(--border-light)",
                                      background: "var(--bg-hover)",
                                      color: "var(--text-main)",
                                      fontSize: "0.8125rem",
                                      outline: "none",
                                    }}
                                  />
                                  <select
                                    value={monitor.sort_by}
                                    onChange={(e) => setXhsFollowingScanMonitors(
                                      (moduleConfig.following_scan_monitors || []).map((item) =>
                                        item.id === monitor.id
                                          ? createFollowingScanMonitor({ ...item, sort_by: e.target.value as "likes" | "time" })
                                          : item
                                      )
                                    )}
                                    style={{
                                      padding: "8px 10px",
                                      borderRadius: "var(--radius-md)",
                                      border: "1px solid var(--border-light)",
                                      background: "var(--bg-hover)",
                                      color: "var(--text-main)",
                                      fontSize: "0.8125rem",
                                      outline: "none",
                                    }}
                                  >
                                    <option value="time">最新优先</option>
                                    <option value="likes">高赞优先</option>
                                  </select>
                                  <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                                    <input
                                      type="checkbox"
                                      checked={monitor.keyword_filter}
                                      onChange={(e) => setXhsFollowingScanMonitors(
                                        (moduleConfig.following_scan_monitors || []).map((item) =>
                                          item.id === monitor.id
                                            ? createFollowingScanMonitor({ ...item, keyword_filter: e.target.checked })
                                            : item
                                        )
                                      )}
                                    />
                                    按关键词过滤
                                  </label>
                                  <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                                    <input
                                      type="checkbox"
                                      checked={monitor.include_comments}
                                      onChange={(e) => setXhsFollowingScanMonitors(
                                        (moduleConfig.following_scan_monitors || []).map((item) =>
                                          item.id === monitor.id
                                            ? createFollowingScanMonitor({ ...item, include_comments: e.target.checked })
                                            : item
                                        )
                                      )}
                                    />
                                    选爬评论
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const nextMonitors = (moduleConfig.following_scan_monitors || []).filter((item) => item.id !== monitor.id);
                                      const nextEnabled = nextMonitors.some((item) => item.enabled);
                                      setXhsFollowingScanMonitors(nextMonitors, { enabled: nextEnabled });
                                    }}
                                    style={{
                                      padding: "7px 12px",
                                      borderRadius: "999px",
                                      border: "1px solid var(--border-light)",
                                      background: "var(--bg-hover)",
                                      color: "var(--text-secondary)",
                                      fontSize: "0.8125rem",
                                      fontWeight: 600,
                                      cursor: "pointer",
                                      marginLeft: "auto",
                                    }}
                                  >
                                    删除
                                  </button>
                                </div>
                                {monitor.include_comments ? (
                                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                                    <label style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>评论条数</label>
                                    <input
                                      type="number"
                                      min={1}
                                      max={100}
                                      value={monitor.comments_limit}
                                      onChange={(e) => setXhsFollowingScanMonitors(
                                        (moduleConfig.following_scan_monitors || []).map((item) =>
                                          item.id === monitor.id
                                            ? createFollowingScanMonitor({ ...item, comments_limit: Number(e.target.value || 1) })
                                            : item
                                        )
                                      )}
                                      style={{
                                        width: "88px",
                                        padding: "8px 10px",
                                        borderRadius: "var(--radius-md)",
                                        border: "1px solid var(--border-light)",
                                        background: "var(--bg-hover)",
                                        color: "var(--text-main)",
                                        fontSize: "0.8125rem",
                                        outline: "none",
                                      }}
                                    />
                                    <select
                                      value={monitor.comments_sort_by}
                                      onChange={(e) => setXhsFollowingScanMonitors(
                                        (moduleConfig.following_scan_monitors || []).map((item) =>
                                          item.id === monitor.id
                                            ? createFollowingScanMonitor({ ...item, comments_sort_by: e.target.value as "likes" | "time" })
                                            : item
                                        )
                                      )}
                                      style={{
                                        padding: "8px 10px",
                                        borderRadius: "var(--radius-md)",
                                        border: "1px solid var(--border-light)",
                                        background: "var(--bg-hover)",
                                        color: "var(--text-main)",
                                        fontSize: "0.8125rem",
                                        outline: "none",
                                      }}
                                    >
                                      <option value="likes">高赞优先</option>
                                      <option value="time">最新优先</option>
                                    </select>
                                  </div>
                                ) : null}
                              </div>
                            ))
                          ) : (
                            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                              还没有关注流关键词定义。新增后，情报会复用你在主动工具里那套关注流搜索链路。
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const nextMonitors = [
                              ...(moduleConfig.following_scan_monitors || []),
                              createFollowingScanMonitor({
                                label: `关注流推送 ${(moduleConfig.following_scan_monitors || []).length + 1}`,
                                enabled: moduleConfig.following_scan?.enabled ?? false,
                                fetch_limit: moduleConfig.following_scan?.fetch_limit ?? 20,
                                recent_days: moduleConfig.following_scan?.recent_days ?? 7,
                                sort_by: moduleConfig.following_scan?.sort_by ?? "time",
                                keyword_filter: moduleConfig.following_scan?.keyword_filter ?? true,
                                include_comments: moduleConfig.following_scan?.include_comments ?? false,
                                comments_limit: moduleConfig.following_scan?.comments_limit ?? 20,
                                comments_sort_by: moduleConfig.following_scan?.comments_sort_by ?? "likes",
                              }),
                            ];
                            setXhsFollowingScanMonitors(nextMonitors);
                          }}
                          style={{
                            padding: "8px 16px",
                            borderRadius: "var(--radius-md)",
                            background: "var(--bg-app)",
                            color: "var(--text-main)",
                            fontSize: "0.8125rem",
                            fontWeight: 600,
                            border: "1px solid var(--border-light)",
                            cursor: "pointer",
                            alignSelf: "flex-start",
                          }}
                        >
                          新增关注流关键词推送
                        </button>
                      </div>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      <div style={{ fontSize: "0.875rem", color: "var(--text-main)", fontWeight: 600 }}>博主最新动态爬取</div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "12px",
                          flexWrap: "wrap",
                          padding: "12px 14px",
                          borderRadius: "var(--radius-md)",
                          border: "1px solid rgba(245, 158, 11, 0.45)",
                          background: "rgba(245, 158, 11, 0.12)",
                        }}
                      >
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                          <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "#92400e" }}>
                            默认关闭，可能触发反爬
                          </span>
                          <span style={{ fontSize: "0.75rem", color: "#92400e", lineHeight: 1.6 }}>
                            这条链路会访问博主主页抓最近动态，频率过高时容易触发访问频繁或验证页。建议只在需要时开启，并优先结合智能分组缩小范围。
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={toggleXhsCreatorPush}
                          style={{
                            padding: "8px 14px",
                            borderRadius: "var(--radius-md)",
                            border: `1px solid ${(moduleConfig.creator_push_enabled ?? false) ? "#d97706" : "rgba(146, 64, 14, 0.25)"}`,
                            background: (moduleConfig.creator_push_enabled ?? false) ? "#d97706" : "rgba(255, 255, 255, 0.55)",
                            color: (moduleConfig.creator_push_enabled ?? false) ? "white" : "#92400e",
                            fontSize: "0.8125rem",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          {(moduleConfig.creator_push_enabled ?? false) ? "已开启抓取" : "保持关闭"}
                        </button>
                      </div>
                      <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: 0, lineHeight: 1.6 }}>
                        只要你选了下面的智能分组，系统会直接复用共享智能分组里的博主池进入每日情报抓取；不需要再把每个博主手动导入一次。下面的特定关注名单也会继续一起复用。
                      </p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                        {(moduleConfig.creator_group_options || XHS_CREATOR_GROUP_OPTIONS).map((option) => {
                          const active = (moduleConfig.creator_groups || []).includes(option.value);
                          const profileCount = Object.values(moduleConfig.creator_profiles || {}).filter((profile) =>
                            (profile.smart_groups || []).includes(option.value)
                          ).length;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => toggleXhsCreatorGroup(option.value)}
                              style={{
                                padding: "7px 12px",
                                borderRadius: "999px",
                                border: `1px solid ${active ? "var(--color-primary)" : "var(--border-light)"}`,
                                background: active ? "rgba(99, 102, 241, 0.12)" : "var(--bg-app)",
                                color: active ? "var(--color-primary)" : "var(--text-secondary)",
                                fontSize: "0.8125rem",
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                            >
                              {option.label} {profileCount ? `· ${profileCount}` : ""}
                            </button>
                          );
                        })}
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "10px" }}>
                        {(moduleConfig.creator_monitors || []).length > 0 ? (
                          (moduleConfig.creator_monitors || []).map((monitor) => (
                            <div
                              key={monitor.id}
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: "8px",
                                padding: "12px 14px",
                                borderRadius: "var(--radius-md)",
                                background: "var(--bg-hover)",
                                border: "1px solid var(--border-light)",
                              }}
                            >
                              <input
                                type="text"
                                value={monitor.label}
                                onChange={(e) => setModuleConfig({
                                  ...moduleConfig,
                                  creator_monitors: (moduleConfig.creator_monitors || []).map((item) =>
                                    item.id === monitor.id ? { ...item, label: e.target.value, author: e.target.value || item.author } : item
                                  ),
                                })}
                                placeholder="显示名称"
                                style={{
                                  padding: "10px 14px",
                                  borderRadius: "var(--radius-md)",
                                  border: "1px solid var(--border-light)",
                                  background: "var(--bg-app)",
                                  color: "var(--text-main)",
                                  fontSize: "0.875rem",
                                  outline: "none",
                                }}
                              />
                              <input
                                type="text"
                                value={monitor.user_id}
                                onChange={(e) => setModuleConfig({
                                  ...moduleConfig,
                                  creator_monitors: (moduleConfig.creator_monitors || []).map((item) =>
                                    item.id === monitor.id ? createCreatorMonitor({
                                      ...item,
                                      user_id: normalizeXhsProfileUserId(e.target.value),
                                    }) : item
                                  ),
                                })}
                                placeholder="用户主页 ID 或链接"
                                style={{
                                  padding: "10px 14px",
                                  borderRadius: "var(--radius-md)",
                                  border: "1px solid var(--border-light)",
                                  background: "var(--bg-app)",
                                  color: "var(--text-main)",
                                  fontSize: "0.875rem",
                                  outline: "none",
                                }}
                              />
                              {getXhsCreatorMonitorGroupLabels(monitor).length > 0 ? (
                                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                                  {getXhsCreatorMonitorGroupLabels(monitor).map((label) => (
                                    <span
                                      key={`${monitor.id}-${label}`}
                                      style={{
                                        padding: "4px 8px",
                                        borderRadius: "999px",
                                        background: "rgba(99, 102, 241, 0.12)",
                                        color: "var(--color-primary)",
                                        fontSize: "0.6875rem",
                                        fontWeight: 600,
                                      }}
                                    >
                                      {label}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                              <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                                <button
                                  type="button"
                                  onClick={() => setModuleConfig({
                                    ...moduleConfig,
                                    creator_monitors: (moduleConfig.creator_monitors || []).map((item) =>
                                      item.id === monitor.id ? { ...item, enabled: !item.enabled } : item
                                    ),
                                  })}
                                  style={{
                                    padding: "7px 12px",
                                    borderRadius: "999px",
                                    border: `1px solid ${monitor.enabled ? "var(--color-primary)" : "var(--border-light)"}`,
                                    background: monitor.enabled ? "rgba(99, 102, 241, 0.12)" : "var(--bg-app)",
                                    color: monitor.enabled ? "var(--color-primary)" : "var(--text-secondary)",
                                    fontSize: "0.8125rem",
                                    fontWeight: 600,
                                    cursor: "pointer",
                                  }}
                                >
                                  {monitor.enabled ? "已开启" : "已关闭"}
                                </button>
                                <label style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                                  每次抓取
                                </label>
                                <input
                                  type="number"
                                  min={1}
                                  max={20}
                                  value={monitor.per_user_limit}
                                  onChange={(e) => setModuleConfig({
                                    ...moduleConfig,
                                    creator_monitors: (moduleConfig.creator_monitors || []).map((item) =>
                                      item.id === monitor.id ? { ...item, per_user_limit: Number(e.target.value || 1) } : item
                                    ),
                                  })}
                                  style={{
                                    width: "72px",
                                    padding: "8px 10px",
                                    borderRadius: "var(--radius-md)",
                                    border: "1px solid var(--border-light)",
                                    background: "var(--bg-app)",
                                    color: "var(--text-main)",
                                    fontSize: "0.8125rem",
                                    outline: "none",
                                  }}
                                />
                                <label style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                                  最近天数
                                </label>
                                <input
                                  type="number"
                                  min={1}
                                  max={365}
                                  value={monitor.recent_days}
                                  onChange={(e) => setModuleConfig({
                                    ...moduleConfig,
                                    creator_monitors: (moduleConfig.creator_monitors || []).map((item) =>
                                      item.id === monitor.id ? createCreatorMonitor({ ...item, recent_days: Number(e.target.value || 1) }) : item
                                    ),
                                  })}
                                  style={{
                                    width: "72px",
                                    padding: "8px 10px",
                                    borderRadius: "var(--radius-md)",
                                    border: "1px solid var(--border-light)",
                                    background: "var(--bg-app)",
                                    color: "var(--text-main)",
                                    fontSize: "0.8125rem",
                                    outline: "none",
                                  }}
                                />
                                <select
                                  value={monitor.sort_by}
                                  onChange={(e) => setModuleConfig({
                                    ...moduleConfig,
                                    creator_monitors: (moduleConfig.creator_monitors || []).map((item) =>
                                      item.id === monitor.id ? createCreatorMonitor({ ...item, sort_by: e.target.value as "likes" | "time" }) : item
                                    ),
                                  })}
                                  style={{
                                    padding: "8px 10px",
                                    borderRadius: "var(--radius-md)",
                                    border: "1px solid var(--border-light)",
                                    background: "var(--bg-app)",
                                    color: "var(--text-main)",
                                    fontSize: "0.8125rem",
                                    outline: "none",
                                  }}
                                >
                                  <option value="time">最新优先</option>
                                  <option value="likes">高赞优先</option>
                                </select>
                                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                                  <input
                                    type="checkbox"
                                    checked={monitor.include_comments}
                                    onChange={(e) => setModuleConfig({
                                      ...moduleConfig,
                                      creator_monitors: (moduleConfig.creator_monitors || []).map((item) =>
                                        item.id === monitor.id ? { ...item, include_comments: e.target.checked } : item
                                      ),
                                    })}
                                  />
                                  选爬评论
                                </label>
                                <button
                                  type="button"
                                  onClick={() => setModuleConfig({
                                    ...moduleConfig,
                                    creator_monitors: (moduleConfig.creator_monitors || []).filter((item) => item.id !== monitor.id),
                                  })}
                                  style={{
                                    padding: "7px 12px",
                                    borderRadius: "999px",
                                    border: "1px solid var(--border-light)",
                                    background: "var(--bg-app)",
                                    color: "var(--text-secondary)",
                                    fontSize: "0.8125rem",
                                    fontWeight: 600,
                                    cursor: "pointer",
                                    marginLeft: "auto",
                                  }}
                                >
                                  删除
                                </button>
                              </div>
                              {monitor.include_comments ? (
                                <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                                  <label style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>评论条数</label>
                                  <input
                                    type="number"
                                    min={1}
                                    max={100}
                                    value={monitor.comments_limit}
                                    onChange={(e) => setModuleConfig({
                                      ...moduleConfig,
                                      creator_monitors: (moduleConfig.creator_monitors || []).map((item) =>
                                        item.id === monitor.id ? createCreatorMonitor({ ...item, comments_limit: Number(e.target.value || 1) }) : item
                                      ),
                                    })}
                                    style={{
                                      width: "88px",
                                      padding: "8px 10px",
                                      borderRadius: "var(--radius-md)",
                                      border: "1px solid var(--border-light)",
                                      background: "var(--bg-app)",
                                      color: "var(--text-main)",
                                      fontSize: "0.8125rem",
                                      outline: "none",
                                    }}
                                  />
                                  <select
                                    value={monitor.comments_sort_by}
                                    onChange={(e) => setModuleConfig({
                                      ...moduleConfig,
                                      creator_monitors: (moduleConfig.creator_monitors || []).map((item) =>
                                        item.id === monitor.id ? createCreatorMonitor({ ...item, comments_sort_by: e.target.value as "likes" | "time" }) : item
                                      ),
                                    })}
                                    style={{
                                      padding: "8px 10px",
                                      borderRadius: "var(--radius-md)",
                                      border: "1px solid var(--border-light)",
                                      background: "var(--bg-app)",
                                      color: "var(--text-main)",
                                      fontSize: "0.8125rem",
                                      outline: "none",
                                    }}
                                  >
                                    <option value="likes">高赞优先</option>
                                    <option value="time">最新优先</option>
                                  </select>
                                </div>
                              ) : null}
                            </div>
                          ))
                        ) : (
                          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                            先去小红书工具的“收藏反推博主”里同步候选博主，或在这里手动新增。
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setModuleConfig({
                          ...moduleConfig,
                          creator_monitors: [
                            ...(moduleConfig.creator_monitors || []),
                            createCreatorMonitor({ label: `手动新增 ${(moduleConfig.creator_monitors || []).length + 1}` }),
                          ],
                        })}
                        style={{
                          padding: "8px 16px",
                          borderRadius: "var(--radius-md)",
                          background: "var(--bg-app)",
                          color: "var(--text-main)",
                          fontSize: "0.8125rem",
                          fontWeight: 600,
                          border: "1px solid var(--border-light)",
                          cursor: "pointer",
                          alignSelf: "flex-start",
                        }}
                      >
                        新增特定关注
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  onClick={async () => {
                    const normalizedKeywordMonitors = (moduleConfig.keyword_monitors || [])
                      .map((monitor) => createKeywordMonitor(monitor))
                      .filter((monitor) => monitor.keywords.length > 0);
                    const normalizedFollowingScanMonitors = (moduleConfig.following_scan_monitors || [])
                      .map((monitor) => createFollowingScanMonitor(monitor))
                      .filter((monitor) => monitor.keywords.length > 0 || !monitor.keyword_filter);
                    const normalizedFollowingScan = buildNextXhsFollowingScan(
                      normalizedFollowingScanMonitors,
                      moduleConfig.following_scan || createFollowingScan(),
                    );
                    const normalizedCreatorMonitors = (moduleConfig.creator_monitors || [])
                      .map((monitor) => createCreatorMonitor({
                        ...monitor,
                        user_id: normalizeXhsProfileUserId(monitor.user_id),
                      }))
                      .filter((monitor) => monitor.user_id || monitor.author || monitor.label);
                    await saveModuleConfig({
                      keyword_monitors: normalizedKeywordMonitors,
                      following_scan: normalizedFollowingScan,
                      following_scan_monitors: normalizedFollowingScanMonitors,
                      creator_monitors: normalizedCreatorMonitors,
                      creator_groups: moduleConfig.creator_groups || [],
                      creator_push_enabled: moduleConfig.creator_push_enabled ?? false,
                    }, "爬取策略已保存");
                  }}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "var(--radius-md)",
                    background: "var(--color-primary)",
                    color: "white",
                    fontSize: "0.8125rem",
                    fontWeight: 600,
                    border: "none",
                    cursor: "pointer",
                    alignSelf: "flex-start",
                  }}
                >
                  保存爬取策略
                </button>
              </div>
            </Card>
          )}

          {/* 知乎 Cookie 配置 */}
          {module.id === "zhihu-tracker" && (
            <Card title="知乎登录" icon={<span style={{ fontSize: "18px" }}>❓</span>}>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <input
                  type="password"
                  value={moduleConfig.cookie || ""}
                  onChange={(e) => setModuleConfig({ ...moduleConfig, cookie: e.target.value })}
                  placeholder="粘贴知乎 Cookie..."
                  style={{
                    padding: "10px 14px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-light)",
                    background: "var(--bg-app)",
                    color: "var(--text-main)",
                    fontSize: "0.875rem",
                    outline: "none",
                  }}
                />
                <CookieGuide platform="zhihu" cookieName="Cookie" />
                <button
                  onClick={async () => {
                    try {
                      await api.post("/api/preferences", { modules: { [module.id]: { cookie: moduleConfig.cookie } } });
                      toast.success("已保存");
                    } catch {
                      toast.error("保存失败");
                    }
                  }}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "var(--radius-md)",
                    background: "var(--color-primary)",
                    color: "white",
                    fontSize: "0.8125rem",
                    fontWeight: 600,
                    border: "none",
                    cursor: "pointer",
                    alignSelf: "flex-start",
                  }}
                >
                  保存 Cookie
                </button>
              </div>
            </Card>
          )}

          {/* Semantic Scholar 关键词配置 */}
          {module.id === "semantic-scholar-tracker" && (
            <Card title="关键词" icon={<span style={{ fontSize: "14px" }}>🔤</span>}>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <input
                  type="text"
                  value={(moduleConfig.keywords || []).join(", ")}
                  onChange={(e) => setModuleConfig({ ...moduleConfig, keywords: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
                  placeholder="machine learning, NLP"
                  style={{
                    padding: "10px 14px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-light)",
                    background: "var(--bg-app)",
                    color: "var(--text-main)",
                    fontSize: "0.875rem",
                    outline: "none",
                  }}
                />
                <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: 0 }}>
                  输入英文关键词，用逗号分隔
                </p>
                <button
                  onClick={async () => {
                    try {
                      await api.post("/api/preferences", { modules: { [module.id]: { keywords: moduleConfig.keywords } } });
                      toast.success("已保存");
                    } catch {
                      toast.error("保存失败");
                    }
                  }}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "var(--radius-md)",
                    background: "var(--color-primary)",
                    color: "white",
                    fontSize: "0.8125rem",
                    fontWeight: 600,
                    border: "none",
                    cursor: "pointer",
                    alignSelf: "flex-start",
                  }}
                >
                  保存关键词
                </button>
              </div>
            </Card>
          )}

          {module.id === "folder-monitor" && (
            <Card title="文件夹路径" icon={<Calendar style={{ width: "18px", height: "18px", color: "var(--color-secondary)" }} />}>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <input
                  type="text"
                  value={moduleConfig.folder_path || ""}
                  onChange={(e) => setModuleConfig({ ...moduleConfig, folder_path: e.target.value })}
                  placeholder="/Users/xxx/Downloads/Papers"
                  style={{
                    padding: "10px 14px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-light)",
                    background: "var(--bg-app)",
                    color: "var(--text-main)",
                    fontSize: "0.875rem",
                    outline: "none",
                  }}
                />
                <button
                  onClick={async () => {
                    try {
                      await api.post("/api/preferences", { modules: { [module.id]: { folder_path: moduleConfig.folder_path } } });
                      toast.success("已保存");
                    } catch {
                      toast.error("保存失败");
                    }
                  }}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "var(--radius-md)",
                    background: "var(--color-primary)",
                    color: "white",
                    fontSize: "0.8125rem",
                    fontWeight: 600,
                    border: "none",
                    cursor: "pointer",
                    alignSelf: "flex-start",
                  }}
                >
                  保存路径
                </button>
              </div>
            </Card>
          )}

        </div>
      </PageContent>
    </PageContainer>
  );
}
