import { useState, useEffect } from "react";
import {
  Settings as SettingsIcon,
  Info,
  AlertTriangle,
  BookOpen,
  Moon,
  Sun,
  Keyboard,
  Palette,
  Zap,
  ChevronDown,
  ChevronRight,
  Rss,
  Copy,
  Check,
  Bug,
  Database,
  Loader2,
  Sparkles,
  User,
  Headphones,
  HelpCircle,
  FolderOpen,
  Layers,
  RefreshCw,
  ShoppingBag,
  Shield,
  Tv,
} from "lucide-react";
import { PageContainer, PageHeader, PageContent, Card } from "../../components/Layout";
import { api } from "../../core/api";
import { useThemeMode } from "../../core/theme";
import {
  MODULES_HIDDEN_FROM_MANAGEMENT,
  filterHiddenManagementModules,
} from "../../core/moduleVisibility";
import { useStore, FeedCard, FeedModule } from "../../core/store";
import {
  normalizeFeedPreferences,
  type FeedPreferences,
} from "../feed/intelligence";
import { bilibiliGetCookieFromBrowser } from "../../api/bilibili";
import type {
  BilibiliDailyDynamicMonitor,
  BilibiliFollowedGroupMonitor,
} from "../../api/bilibili";
import { xiaohongshuGetCookieFromBrowser } from "../../api/xiaohongshu";

// ── Types ─────────────────────────────────────────────────────────────────────

type SettingsTab = "general" | "developer" | "about";

const SOCIAL_AUTH_UPDATED_EVENT = "abo:settings-social-auth-updated";

interface SettingItemProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
  onClick?: () => void;
}

interface DebugFeedFlowResponse {
  ok: boolean;
  scope: string;
  completed: number;
  total: number;
  feed_cards?: FeedCard[];
  unread_counts?: Record<string, number>;
  results: Array<{
    module_id: string;
    name: string;
    ok: boolean;
    status: string;
    card_count?: number;
    message?: string;
  }>;
}

interface CrawlRecord {
  record_key: string;
  module_id: string;
  card_id: string;
  content_id: string;
  title: string;
  summary: string;
  score: number;
  source_url: string;
  obsidian_path: string;
  tags: string[];
  crawl_source: string;
  author: string;
  published: string;
  metadata: Record<string, unknown>;
  first_seen_at: number;
  last_seen_at: number;
  seen_count: number;
}

type FeedFlowScopeKey = "papers" | "bilibili" | "bilibili-fixed-up" | "xiaohongshu" | "social" | "all";

type FeedFlowSummaryMap = Record<FeedFlowScopeKey, string[]>;

const FEED_SYNC_LIMIT = 200;

interface PaperKeywordMonitor {
  id: string;
  label: string;
  query: string;
  categories: string[];
  enabled: boolean;
}

interface PaperFollowupMonitor {
  id: string;
  label: string;
  query: string;
  enabled: boolean;
}

interface XhsKeywordMonitor {
  id: string;
  label: string;
  keywords: string[];
  enabled: boolean;
}

interface XhsCreatorMonitor {
  id: string;
  user_id: string;
  label: string;
  author: string;
  enabled: boolean;
  smart_group_labels?: string[];
  smart_groups?: string[];
}

interface BiliTrackedProfile {
  author?: string;
  author_id?: string;
  smart_group_labels?: string[];
  smart_groups?: string[];
  latest_title?: string;
}

interface XhsFollowingScan {
  id: string;
  label: string;
  keywords: string[];
  enabled: boolean;
  fetch_limit: number;
  recent_days: number;
  sort_by: "likes" | "time";
  keyword_filter: boolean;
}

interface XhsFollowingScanMonitor {
  id: string;
  label: string;
  keywords: string[];
  enabled: boolean;
  fetch_limit: number;
  recent_days: number;
  sort_by: "likes" | "time";
  keyword_filter: boolean;
  include_comments?: boolean;
}

interface ModuleMonitorRegistry {
  paperKeywords: PaperKeywordMonitor[];
  paperFollowups: PaperFollowupMonitor[];
  biliDailyMonitors: BilibiliDailyDynamicMonitor[];
  biliGroupMonitors: BilibiliFollowedGroupMonitor[];
  biliFixedUps: string[];
  biliCreatorProfiles: Record<string, BiliTrackedProfile>;
  biliAuthReady: boolean;
  xhsKeywords: XhsKeywordMonitor[];
  xhsFollowingScan: XhsFollowingScan;
  xhsFollowingScanMonitors: XhsFollowingScanMonitor[];
  xhsCreators: XhsCreatorMonitor[];
  xhsCreatorPushEnabled: boolean;
  xhsCreatorGroups: string[];
  xhsAuthReady: boolean;
}

// ── Components ────────────────────────────────────────────────────────────────

function SettingItem({ icon, title, description, children, onClick }: SettingItemProps) {
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "16px",
        padding: "16px 20px",
        borderRadius: "var(--radius-lg)",
        background: "var(--bg-card)",
        border: "1px solid var(--border-light)",
        transition: "all 0.3s ease",
        cursor: onClick ? "pointer" : "default",
      }}
      onMouseEnter={(e) => {
        if (onClick) {
          e.currentTarget.style.transform = "translateX(4px)";
          e.currentTarget.style.borderColor = "var(--color-primary-light)";
          e.currentTarget.style.boxShadow = "var(--shadow-soft)";
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateX(0)";
        e.currentTarget.style.borderColor = "var(--border-light)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <div
        style={{
          width: "40px",
          height: "40px",
          borderRadius: "var(--radius-md)",
          background: "linear-gradient(135deg, rgba(188, 164, 227, 0.15), rgba(255, 183, 178, 0.1))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--color-primary)",
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h4 style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text-main)", marginBottom: description ? "4px" : 0 }}>
          {title}
        </h4>
        {description && (
          <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", lineHeight: 1.5 }}>{description}</p>
        )}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function Toggle({
  enabled,
  onToggle,
  disabled = false,
}: {
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      style={{
        position: "relative",
        width: "48px",
        height: "26px",
        borderRadius: "var(--radius-full)",
        background: enabled
          ? "linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))"
          : "var(--bg-hover)",
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "all 0.3s ease",
        boxShadow: enabled ? "0 2px 8px rgba(188, 164, 227, 0.4)" : "inset 0 2px 4px rgba(0,0,0,0.1)",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: "3px",
          left: enabled ? "25px" : "3px",
          width: "20px",
          height: "20px",
          borderRadius: "50%",
          background: "white",
          boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
          transition: "left 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      />
    </button>
  );
}

const HIDDEN_MODULE_ICONS: Record<string, React.ReactNode> = {
  "xiaoyuzhou-tracker": <Headphones style={{ width: "20px", height: "20px" }} />,
  "zhihu-tracker": <HelpCircle style={{ width: "20px", height: "20px" }} />,
  "folder-monitor": <FolderOpen style={{ width: "20px", height: "20px" }} />,
};

const HIDDEN_MODULE_DESCRIPTIONS: Record<string, string> = {
  "xiaoyuzhou-tracker": "已从模块管理页隐藏，可在这里控制播客追踪是否参与调度",
  "zhihu-tracker": "已从模块管理页隐藏，可在这里控制知乎追踪是否参与调度",
  "folder-monitor": "已从模块管理页隐藏，可在这里控制文件夹监控是否参与调度",
};

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        width: "100%",
        padding: "14px 18px",
        borderRadius: "var(--radius-lg)",
        background: active ? "var(--bg-card)" : "transparent",
        border: active ? "1px solid var(--border-light)" : "1px solid transparent",
        color: active ? "var(--color-primary)" : "var(--text-secondary)",
        fontSize: "0.9375rem",
        fontWeight: 600,
        cursor: "pointer",
        transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
        boxShadow: active ? "var(--shadow-soft)" : "none",
        transform: active ? "scale(1.02)" : "scale(1)",
      }}
    >
      {icon}
      {label}
      {active && (
        <ChevronRight
          style={{ width: "16px", height: "16px", marginLeft: "auto", opacity: 0.6 }}
        />
      )}
    </button>
  );
}

// ── Sections ──────────────────────────────────────────────────────────────────

interface RSSConfig {
  enabled: boolean;
  title: string;
  description: string;
  max_items: number;
  feed_url: string;
}

function RSSSection() {
  const [config, setConfig] = useState<RSSConfig>({
    enabled: false,
    title: "ABO Intelligence Feed",
    description: "Aggregated intelligence from ABO modules",
    max_items: 50,
    feed_url: "",
  });
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const { addToast } = useStore();

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    try {
      setLoading(true);
      const data = await api.get<RSSConfig>("/api/rss/config");
      setConfig(data);
    } catch (e) {
      console.error("Failed to load RSS config:", e);
      addToast({ kind: "error", title: "加载 RSS 配置失败" });
    } finally {
      setLoading(false);
    }
  }

  async function saveConfig(updates: Partial<RSSConfig>) {
    try {
      const newConfig = { ...config, ...updates };
      const data = await api.post<RSSConfig>("/api/rss/config", newConfig);
      setConfig(data);
      addToast({ kind: "success", title: "RSS 配置已保存" });
    } catch (e) {
      console.error("Failed to save RSS config:", e);
      addToast({ kind: "error", title: "保存 RSS 配置失败" });
    }
  }

  function copyFeedUrl() {
    if (config.feed_url) {
      navigator.clipboard.writeText(config.feed_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      addToast({ kind: "success", title: "订阅链接已复制" });
    }
  }

  if (loading) {
    return (
      <Card title="RSS 订阅" icon={<Rss style={{ width: "18px", height: "18px" }} />}>
        <div style={{ padding: "20px", textAlign: "center", color: "var(--text-muted)" }}>
          加载中...
        </div>
      </Card>
    );
  }

  return (
    <Card title="RSS 订阅" icon={<Rss style={{ width: "18px", height: "18px" }} />}>
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {/* Enable Toggle */}
        <SettingItem
          icon={<Rss style={{ width: "20px", height: "20px" }} />}
          title="启用 RSS Feed"
          description={config.enabled ? "外部可以通过 RSS 订阅你的情报" : "RSS feed 当前未启用"}
        >
          <Toggle
            enabled={config.enabled}
            onToggle={() => saveConfig({ enabled: !config.enabled })}
          />
        </SettingItem>

        {config.enabled && (
          <>
            {/* Feed URL */}
            <SettingItem
              icon={<Copy style={{ width: "20px", height: "20px" }} />}
              title="订阅链接"
              description="复制此链接到 RSS 阅读器"
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <code
                  style={{
                    padding: "6px 12px",
                    background: "var(--bg-hover)",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "0.75rem",
                    fontFamily: "monospace",
                    color: "var(--text-secondary)",
                    maxWidth: "200px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {config.feed_url || "未启用"}
                </code>
                <button
                  onClick={copyFeedUrl}
                  disabled={!config.feed_url}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border-light)",
                    background: "var(--bg-card)",
                    cursor: config.feed_url ? "pointer" : "not-allowed",
                    opacity: config.feed_url ? 1 : 0.5,
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    fontSize: "0.75rem",
                    color: "var(--text-secondary)",
                  }}
                >
                  {copied ? (
                    <>
                      <Check style={{ width: "14px", height: "14px" }} />
                      已复制
                    </>
                  ) : (
                    <>
                      <Copy style={{ width: "14px", height: "14px" }} />
                      复制
                    </>
                  )}
                </button>
              </div>
            </SettingItem>

            {/* Title Input */}
            <SettingItem
              icon={<span style={{ fontSize: "16px" }}>T</span>}
              title="Feed 标题"
              description="RSS feed 的标题"
            >
              <input
                type="text"
                value={config.title}
                onChange={(e) => setConfig({ ...config, title: e.target.value })}
                onBlur={() => saveConfig({ title: config.title })}
                style={{
                  padding: "8px 12px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-light)",
                  background: "var(--bg-card)",
                  color: "var(--text-main)",
                  fontSize: "0.875rem",
                  width: "200px",
                }}
              />
            </SettingItem>

            {/* Description Input */}
            <SettingItem
              icon={<span style={{ fontSize: "16px" }}>D</span>}
              title="Feed 描述"
              description="RSS feed 的描述"
            >
              <input
                type="text"
                value={config.description}
                onChange={(e) => setConfig({ ...config, description: e.target.value })}
                onBlur={() => saveConfig({ description: config.description })}
                style={{
                  padding: "8px 12px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-light)",
                  background: "var(--bg-card)",
                  color: "var(--text-main)",
                  fontSize: "0.875rem",
                  width: "280px",
                }}
              />
            </SettingItem>

            {/* Max Items */}
            <SettingItem
              icon={<span style={{ fontSize: "16px" }}>#</span>}
              title="最大条目数"
              description="Feed 中最多显示的条目数量 (10-200)"
            >
              <input
                type="number"
                min={10}
                max={200}
                value={config.max_items}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 50;
                  setConfig({ ...config, max_items: val });
                }}
                onBlur={() => saveConfig({ max_items: config.max_items })}
                style={{
                  padding: "8px 12px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-light)",
                  background: "var(--bg-card)",
                  color: "var(--text-main)",
                  fontSize: "0.875rem",
                  width: "80px",
                }}
              />
            </SettingItem>
          </>
        )}
      </div>
    </Card>
  );
}

function HiddenModuleSection() {
  const [modules, setModules] = useState<FeedModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingModuleId, setUpdatingModuleId] = useState<string | null>(null);
  const { addToast, setFeedModules } = useStore();

  useEffect(() => {
    loadModules();
  }, []);

  async function loadModules() {
    try {
      setLoading(true);
      const data = await api.get<{ modules: FeedModule[] }>("/api/modules");
      setFeedModules(data.modules);
      setModules(filterHiddenManagementModules(data.modules));
    } catch (e) {
      console.error("Failed to load hidden modules:", e);
      addToast({ kind: "error", title: "加载模块开关失败" });
    } finally {
      setLoading(false);
    }
  }

  async function toggleModule(module: FeedModule) {
    const nextEnabled = !module.enabled;
    setUpdatingModuleId(module.id);

    try {
      await api.patch(`/api/modules/${module.id}`, { enabled: nextEnabled });
      const nextModules = modules.map((item) =>
        item.id === module.id ? { ...item, enabled: nextEnabled } : item
      );
      setModules(nextModules);
      setFeedModules(
        useStore.getState().feedModules.map((item) =>
          item.id === module.id ? { ...item, enabled: nextEnabled } : item
        )
      );
      addToast({
        kind: "success",
        title: `${module.name}${nextEnabled ? "已启用" : "已关闭"}`,
      });
    } catch (e) {
      console.error("Failed to update hidden module:", e);
      addToast({ kind: "error", title: `更新 ${module.name} 失败` });
    } finally {
      setUpdatingModuleId(null);
    }
  }

  return (
    <Card title="隐藏模块开关" icon={<SettingsIcon style={{ width: "18px", height: "18px" }} />}>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div
          style={{
            padding: "12px 16px",
            borderRadius: "var(--radius-md)",
            background: "var(--bg-hover)",
            border: "1px solid var(--border-light)",
            fontSize: "0.75rem",
            color: "var(--text-muted)",
            lineHeight: 1.6,
          }}
        >
          小宇宙追踪、知乎追踪、文件夹监控已从模块管理页隐藏，统一在这里控制开关。
        </div>

        {loading ? (
          <div style={{ padding: "20px", textAlign: "center", color: "var(--text-muted)", fontSize: "0.875rem" }}>
            加载中...
          </div>
        ) : (
          modules.map((module) => (
            <SettingItem
              key={module.id}
              icon={HIDDEN_MODULE_ICONS[module.id] || <SettingsIcon style={{ width: "20px", height: "20px" }} />}
              title={module.name}
              description={HIDDEN_MODULE_DESCRIPTIONS[module.id] || "已从模块管理页隐藏，可在这里控制启停"}
            >
              <Toggle
                enabled={module.enabled}
                disabled={updatingModuleId === module.id}
                onToggle={() => toggleModule(module)}
              />
            </SettingItem>
          ))
        )}

        {!loading && modules.length !== MODULES_HIDDEN_FROM_MANAGEMENT.length && (
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", padding: "0 4px" }}>
            部分隐藏模块暂未加载到前端列表。
          </div>
        )}
      </div>
    </Card>
  );
}

function MonitorRegistrySection() {
  const { addToast, setActiveTab, setArxivTrackerActiveTab } = useStore();
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [expandedMonitorPanels, setExpandedMonitorPanels] = useState<Set<string>>(new Set());
  const [registry, setRegistry] = useState<ModuleMonitorRegistry>({
    paperKeywords: [],
    paperFollowups: [],
    biliDailyMonitors: [],
    biliGroupMonitors: [],
    biliFixedUps: [],
    biliCreatorProfiles: {},
    biliAuthReady: false,
    xhsKeywords: [],
    xhsFollowingScan: {
      id: "xhs-following-default",
      label: "关注流扫描",
      keywords: [],
      enabled: false,
      fetch_limit: 20,
      recent_days: 7,
      sort_by: "time",
      keyword_filter: true,
    },
    xhsFollowingScanMonitors: [],
    xhsCreators: [],
    xhsCreatorPushEnabled: false,
    xhsCreatorGroups: [],
    xhsAuthReady: false,
  });

  useEffect(() => {
    void loadRegistry();
  }, []);

  useEffect(() => {
    const handler = () => {
      void loadRegistry();
    };
    window.addEventListener(SOCIAL_AUTH_UPDATED_EVENT, handler);
    return () => window.removeEventListener(SOCIAL_AUTH_UPDATED_EVENT, handler);
  }, []);

  async function loadRegistry() {
    setLoading(true);
    try {
      const [arxivRes, followupRes, bilibiliRes, xhsRes] = await Promise.all([
        api.get<{
          keyword_monitors?: PaperKeywordMonitor[];
        }>("/api/modules/arxiv-tracker/config"),
        api.get<{
          followup_monitors?: PaperFollowupMonitor[];
        }>("/api/modules/semantic-scholar-tracker/config"),
        api.get<{
          daily_dynamic_monitors?: BilibiliDailyDynamicMonitor[];
          followed_up_group_monitors?: BilibiliFollowedGroupMonitor[];
          up_uids?: string[];
          creator_profiles?: Record<string, BiliTrackedProfile>;
          auth_ready?: boolean;
        }>("/api/modules/bilibili-tracker/config"),
        api.get<{
          keyword_monitors?: XhsKeywordMonitor[];
          following_scan?: XhsFollowingScan;
          following_scan_monitors?: XhsFollowingScanMonitor[];
          creator_monitors?: XhsCreatorMonitor[];
          creator_push_enabled?: boolean;
          creator_groups?: string[];
          auth_ready?: boolean;
        }>("/api/modules/xiaohongshu-tracker/config"),
      ]);

      setRegistry({
        paperKeywords: arxivRes.keyword_monitors || [],
        paperFollowups: followupRes.followup_monitors || [],
        biliDailyMonitors: bilibiliRes.daily_dynamic_monitors || [],
        biliGroupMonitors: bilibiliRes.followed_up_group_monitors || [],
        biliFixedUps: bilibiliRes.up_uids || [],
        biliCreatorProfiles: bilibiliRes.creator_profiles || {},
        biliAuthReady: bilibiliRes.auth_ready ?? false,
        xhsKeywords: xhsRes.keyword_monitors || [],
        xhsFollowingScan: xhsRes.following_scan || {
          id: "xhs-following-default",
          label: "关注流扫描",
          keywords: [],
          enabled: false,
          fetch_limit: 20,
          recent_days: 7,
          sort_by: "time",
          keyword_filter: true,
        },
        xhsFollowingScanMonitors: xhsRes.following_scan_monitors || [],
        xhsCreators: xhsRes.creator_monitors || [],
        xhsCreatorPushEnabled: xhsRes.creator_push_enabled ?? false,
        xhsCreatorGroups: xhsRes.creator_groups || [],
        xhsAuthReady: xhsRes.auth_ready ?? false,
      });
    } catch (e) {
      console.error("Failed to load monitor registry:", e);
      addToast({ kind: "error", title: "加载监控词条失败" });
    } finally {
      setLoading(false);
    }
  }

  async function persistPaperKeywordMonitors(nextMonitors: PaperKeywordMonitor[], targetId: string) {
    setSavingKey(`paper-keyword:${targetId}`);
    try {
      await api.post("/api/modules/arxiv-tracker/config", { keyword_monitors: nextMonitors });
      setRegistry((current) => ({ ...current, paperKeywords: nextMonitors }));
    } catch (e) {
      console.error("Failed to save paper keyword monitors:", e);
      addToast({ kind: "error", title: "保存论文关键词监控失败" });
    } finally {
      setSavingKey(null);
    }
  }

  async function persistPaperFollowupMonitors(nextMonitors: PaperFollowupMonitor[], targetId: string) {
    setSavingKey(`paper-followup:${targetId}`);
    try {
      await api.post("/api/modules/semantic-scholar-tracker/config", { followup_monitors: nextMonitors });
      setRegistry((current) => ({ ...current, paperFollowups: nextMonitors }));
    } catch (e) {
      console.error("Failed to save paper followup monitors:", e);
      addToast({ kind: "error", title: "保存 Follow Up 监控失败" });
    } finally {
      setSavingKey(null);
    }
  }

  async function persistBiliDailyMonitors(nextMonitors: BilibiliDailyDynamicMonitor[], targetId: string) {
    setSavingKey(`bili-daily:${targetId}`);
    try {
      await api.post("/api/modules/bilibili-tracker/config", { daily_dynamic_monitors: nextMonitors });
      setRegistry((current) => ({ ...current, biliDailyMonitors: nextMonitors }));
    } catch (e) {
      console.error("Failed to save bilibili daily monitors:", e);
      addToast({ kind: "error", title: "保存 B站关键词监控失败" });
    } finally {
      setSavingKey(null);
    }
  }

  async function persistBiliGroupMonitors(nextMonitors: BilibiliFollowedGroupMonitor[], targetId: string) {
    setSavingKey(`bili-group:${targetId}`);
    try {
      await api.post("/api/modules/bilibili-tracker/config", {
        followed_up_group_monitors: nextMonitors,
        followed_up_groups: nextMonitors.filter((item) => item.enabled).map((item) => item.group_value),
      });
      setRegistry((current) => ({ ...current, biliGroupMonitors: nextMonitors }));
    } catch (e) {
      console.error("Failed to save bilibili group monitors:", e);
      addToast({ kind: "error", title: "保存 B站分组监控失败" });
    } finally {
      setSavingKey(null);
    }
  }

  async function persistXhsKeywordMonitors(nextMonitors: XhsKeywordMonitor[], targetId: string) {
    setSavingKey(`xhs-keyword:${targetId}`);
    try {
      await api.post("/api/modules/xiaohongshu-tracker/config", { keyword_monitors: nextMonitors });
      setRegistry((current) => ({ ...current, xhsKeywords: nextMonitors }));
    } catch (e) {
      console.error("Failed to save xiaohongshu keyword monitors:", e);
      addToast({ kind: "error", title: "保存小红书关键词监控失败" });
    } finally {
      setSavingKey(null);
    }
  }

  async function persistXhsCreatorMonitors(nextMonitors: XhsCreatorMonitor[], targetId: string) {
    setSavingKey(`xhs-creator:${targetId}`);
    try {
      await api.post("/api/modules/xiaohongshu-tracker/config", { creator_monitors: nextMonitors });
      setRegistry((current) => ({ ...current, xhsCreators: nextMonitors }));
    } catch (e) {
      console.error("Failed to save xiaohongshu creator monitors:", e);
      addToast({ kind: "error", title: "保存小红书关注监控失败" });
    } finally {
      setSavingKey(null);
    }
  }

  async function persistXhsFollowingConfig(
    nextScan: XhsFollowingScan,
    nextMonitors: XhsFollowingScanMonitor[],
    targetId: string,
  ) {
    setSavingKey(`xhs-following:${targetId}`);
    try {
      const payload: Record<string, unknown> = {
        following_scan: nextScan,
      };
      if (nextMonitors.length > 0) {
        payload.following_scan_monitors = nextMonitors;
      }
      await api.post("/api/modules/xiaohongshu-tracker/config", payload);
      setRegistry((current) => ({
        ...current,
        xhsFollowingScan: nextScan,
        xhsFollowingScanMonitors: nextMonitors,
      }));
    } catch (e) {
      console.error("Failed to save xiaohongshu following scan config:", e);
      addToast({ kind: "error", title: "保存小红书关注流监控失败" });
    } finally {
      setSavingKey(null);
    }
  }

  async function persistXhsCreatorPushEnabled(nextEnabled: boolean) {
    setSavingKey("xhs-creator-push:global");
    try {
      await api.post("/api/modules/xiaohongshu-tracker/config", {
        creator_push_enabled: nextEnabled,
      });
      setRegistry((current) => ({ ...current, xhsCreatorPushEnabled: nextEnabled }));
    } catch (e) {
      console.error("Failed to save xiaohongshu creator push enabled:", e);
      addToast({ kind: "error", title: "保存小红书博主抓取开关失败" });
    } finally {
      setSavingKey(null);
    }
  }

  function openPaperMonitors() {
    setArxivTrackerActiveTab("monitors");
    setActiveTab("arxiv");
  }

  function openBiliMonitors() {
    setActiveTab("bilibili");
  }

  function openXhsMonitors() {
    setActiveTab("xiaohongshu");
  }

  const xhsFollowingMonitorCount = registry.xhsFollowingScanMonitors.length;
  const xhsFollowingKeywords = (
    registry.xhsFollowingScanMonitors.length > 0
      ? registry.xhsFollowingScanMonitors.flatMap((monitor) => monitor.keywords || []).filter(Boolean)
      : registry.xhsFollowingScan.keywords || []
  );
  const xhsFollowingKeywordPreview = xhsFollowingKeywords.slice(0, 3);
  const xhsCreatorGroupCount = registry.xhsCreatorGroups.length;
  const biliFixedUpPanelExpanded = expandedMonitorPanels.has("bili-fixed-ups");
  const biliFixedUpPreview = registry.biliFixedUps
    .slice(0, 3)
    .map((uid) => registry.biliCreatorProfiles[uid]?.author || registry.biliCreatorProfiles[uid]?.author_id || uid)
    .filter(Boolean);

  function toggleXhsFollowingMonitor(monitorId: string) {
    const nextMonitors = registry.xhsFollowingScanMonitors.map((item) => (
      item.id === monitorId ? { ...item, enabled: !item.enabled } : item
    ));
    const nextEnabled = nextMonitors.some((item) => item.enabled);
    void persistXhsFollowingConfig(
      {
        ...registry.xhsFollowingScan,
        enabled: nextEnabled,
      },
      nextMonitors,
      monitorId,
    );
  }

  function toggleExpandedMonitorPanel(panelId: string) {
    setExpandedMonitorPanels((current) => {
      const next = new Set(current);
      if (next.has(panelId)) next.delete(panelId);
      else next.add(panelId);
      return next;
    });
  }

  function renderMonitorRow(args: {
    key: string;
    title: string;
    subtitle: string;
    enabled: boolean;
    disabled?: boolean;
    onToggle: () => void;
  }) {
    return (
      <div
        key={args.key}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "12px 14px",
          borderRadius: "10px",
          border: "1px solid var(--border-light)",
          background: "var(--bg-card)",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-main)" }}>
              {args.title}
            </span>
            <span
              style={{
                fontSize: "0.6875rem",
                fontWeight: 700,
                color: args.enabled ? "var(--color-primary)" : "var(--text-muted)",
                background: args.enabled ? "rgba(188, 164, 227, 0.14)" : "var(--bg-hover)",
                borderRadius: "999px",
                padding: "3px 8px",
              }}
            >
              {args.enabled ? "已开启" : "已关闭"}
            </span>
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.6, marginTop: "4px" }}>
            {args.subtitle}
          </div>
        </div>
        <Toggle enabled={args.enabled} disabled={args.disabled} onToggle={args.onToggle} />
      </div>
    );
  }

  function renderPassiveRow(args: {
    key: string;
    title: string;
    subtitle: string;
    badge?: string;
  }) {
    return (
      <div
        key={args.key}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "12px 14px",
          borderRadius: "10px",
          border: "1px solid var(--border-light)",
          background: "var(--bg-card)",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-main)" }}>
              {args.title}
            </span>
            {args.badge ? (
              <span
                style={{
                  fontSize: "0.6875rem",
                  fontWeight: 700,
                  color: "var(--text-secondary)",
                  background: "var(--bg-hover)",
                  borderRadius: "999px",
                  padding: "3px 8px",
                }}
              >
                {args.badge}
              </span>
            ) : null}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.6, marginTop: "4px" }}>
            {args.subtitle}
          </div>
        </div>
      </div>
    );
  }

  function renderExpandableCollection(args: {
    key: string;
    title: string;
    subtitle: string;
    badge?: string;
    expanded: boolean;
    onToggle: () => void;
    children: React.ReactNode[];
  }) {
    return (
      <div
        key={args.key}
        style={{
          borderRadius: "10px",
          border: "1px solid var(--border-light)",
          background: "var(--bg-card)",
          overflow: "hidden",
        }}
      >
        <button
          type="button"
          aria-expanded={args.expanded}
          onClick={args.onToggle}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "12px 14px",
            border: "none",
            background: "transparent",
            textAlign: "left",
            cursor: "pointer",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-main)" }}>
                {args.title}
              </span>
              {args.badge ? (
                <span
                  style={{
                    fontSize: "0.6875rem",
                    fontWeight: 700,
                    color: "var(--text-secondary)",
                    background: "var(--bg-hover)",
                    borderRadius: "999px",
                    padding: "3px 8px",
                  }}
                >
                  {args.badge}
                </span>
              ) : null}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.6, marginTop: "4px" }}>
              {args.subtitle}
            </div>
          </div>
          {args.expanded ? (
            <ChevronDown style={{ width: "16px", height: "16px", color: "var(--text-muted)", flexShrink: 0 }} />
          ) : (
            <ChevronRight style={{ width: "16px", height: "16px", color: "var(--text-muted)", flexShrink: 0 }} />
          )}
        </button>

        {args.expanded ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              padding: "0 12px 12px",
              borderTop: "1px solid var(--border-light)",
              background: "var(--bg-hover)",
            }}
          >
            {args.children}
          </div>
        ) : null}
      </div>
    );
  }

  function renderGroup(args: {
    title: string;
    icon: React.ReactNode;
    description: string;
    count: number;
    onOpen: () => void;
    rows: React.ReactNode[];
    emptyText: string;
  }) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          padding: "16px",
          borderRadius: "var(--radius-lg)",
          background: "var(--bg-hover)",
          border: "1px solid var(--border-light)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                background: "rgba(188, 164, 227, 0.14)",
                color: "var(--color-primary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {args.icon}
            </div>
            <div>
              <div style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-main)" }}>
                {args.title}
              </div>
              <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)", lineHeight: 1.6, marginTop: "4px" }}>
                {args.description}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={args.onOpen}
            style={{
              padding: "8px 12px",
              borderRadius: "8px",
              border: "1px solid var(--border-light)",
              background: "var(--bg-card)",
              color: "var(--text-secondary)",
              fontSize: "0.75rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            打开配置
          </button>
        </div>

        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
          当前共 {args.count} 条监控词条，下面可以直接启用或关闭。
        </div>

        {args.rows.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {args.rows}
          </div>
        ) : (
          <div
            style={{
              padding: "14px",
              borderRadius: "8px",
              border: "1px dashed var(--border-light)",
              color: "var(--text-muted)",
              fontSize: "0.8125rem",
            }}
          >
            {args.emptyText}
          </div>
        )}
      </div>
    );
  }

  return (
    <Card title="监控词条" icon={<Layers style={{ width: "18px", height: "18px" }} />}>
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div
          style={{
            padding: "12px 16px",
            borderRadius: "var(--radius-md)",
            background: "var(--bg-hover)",
            border: "1px solid var(--border-light)",
            fontSize: "0.75rem",
            color: "var(--text-muted)",
            lineHeight: 1.6,
          }}
        >
          论文追踪和社媒监控词条会常驻显示在这里。你可以直接在设置页开启或关闭单条监控，不用再分别进工具页找入口。
        </div>

        {loading ? (
          <div style={{ padding: "20px", textAlign: "center", color: "var(--text-muted)", fontSize: "0.875rem" }}>
            加载中...
          </div>
        ) : (
          <>
            {renderGroup({
              title: "论文追踪",
              icon: <BookOpen style={{ width: "18px", height: "18px" }} />,
              description: "包含 arXiv 关键词监控和 Semantic Scholar Follow Up 监控。",
              count: registry.paperKeywords.length + registry.paperFollowups.length,
              onOpen: openPaperMonitors,
              emptyText: "还没有配置论文监控词条，去“论文追踪 > 关注监控”里新增即可。",
              rows: [
                ...registry.paperKeywords.map((monitor) =>
                  renderMonitorRow({
                    key: `paper-keyword-${monitor.id}`,
                    title: monitor.label || "未命名关键词监控",
                    subtitle: [
                      monitor.query ? `关键词: ${monitor.query}` : "",
                      monitor.categories?.length ? `领域: ${monitor.categories.join(" · ")}` : "领域: CS 全领域",
                    ].filter(Boolean).join(" | "),
                    enabled: monitor.enabled,
                    disabled: savingKey === `paper-keyword:${monitor.id}`,
                    onToggle: () => {
                      const nextMonitors = registry.paperKeywords.map((item) =>
                        item.id === monitor.id ? { ...item, enabled: !item.enabled } : item
                      );
                      void persistPaperKeywordMonitors(nextMonitors, monitor.id);
                    },
                  })
                ),
                ...registry.paperFollowups.map((monitor) =>
                  renderMonitorRow({
                    key: `paper-followup-${monitor.id}`,
                    title: monitor.label || "未命名 Follow Up 监控",
                    subtitle: monitor.query ? `源论文: ${monitor.query}` : "Follow Up 监控",
                    enabled: monitor.enabled,
                    disabled: savingKey === `paper-followup:${monitor.id}`,
                    onToggle: () => {
                      const nextMonitors = registry.paperFollowups.map((item) =>
                        item.id === monitor.id ? { ...item, enabled: !item.enabled } : item
                      );
                      void persistPaperFollowupMonitors(nextMonitors, monitor.id);
                    },
                  })
                ),
              ],
            })}

            {renderGroup({
              title: "B站监控",
              icon: <Tv style={{ width: "18px", height: "18px" }} />,
              description: "包含常驻关键词监控、智能分组推送，以及固定 UP 监督摘要。",
              count: registry.biliDailyMonitors.length + registry.biliGroupMonitors.length + registry.biliFixedUps.length,
              onOpen: openBiliMonitors,
              emptyText: "还没有配置 B站监控词条，去“Bilibili 工具”里新增即可。",
              rows: [
                ...(!registry.biliAuthReady ? [
                  renderPassiveRow({
                    key: "bili-auth-warning",
                    title: "B站登录态未连接",
                    subtitle: "当前未检测到可复用的 B站 Cookie / SESSDATA。已关注动态、常驻关键词和智能分组抓取都不会产出；如果只配了固定 UP，仍可能抓到部分公开视频。",
                    badge: "需要登录态",
                  }),
                ] : []),
                ...registry.biliDailyMonitors.map((monitor) =>
                  renderMonitorRow({
                    key: `bili-daily-${monitor.id}`,
                    title: monitor.label || "未命名关键词监控",
                    subtitle: [
                      monitor.keywords?.length ? `关键词: ${monitor.keywords.join(" · ")}` : "",
                      monitor.tag_filters?.length ? `标签词: ${monitor.tag_filters.join(" · ")}` : "",
                      `${monitor.days_back} 天内`,
                    ].filter(Boolean).join(" | "),
                    enabled: monitor.enabled,
                    disabled: savingKey === `bili-daily:${monitor.id}`,
                    onToggle: () => {
                      const nextMonitors = registry.biliDailyMonitors.map((item) =>
                        item.id === monitor.id ? { ...item, enabled: !item.enabled } : item
                      );
                      void persistBiliDailyMonitors(nextMonitors, monitor.id);
                    },
                  })
                ),
                ...registry.biliGroupMonitors.map((monitor) =>
                  renderMonitorRow({
                    key: `bili-group-${monitor.id}`,
                    title: monitor.label || monitor.group_value || "未命名分组",
                    subtitle: monitor.group_value ? `智能分组: ${monitor.group_value}` : "B站智能分组推送",
                    enabled: monitor.enabled,
                    disabled: savingKey === `bili-group:${monitor.id}`,
                    onToggle: () => {
                      const nextMonitors = registry.biliGroupMonitors.map((item) =>
                        item.id === monitor.id ? { ...item, enabled: !item.enabled } : item
                      );
                      void persistBiliGroupMonitors(nextMonitors, monitor.id);
                    },
                  })
                ),
                ...(registry.biliFixedUps.length > 0 ? [
                  renderExpandableCollection({
                    key: "bili-fixed-ups",
                    title: "固定 UP 监督",
                    subtitle: [
                      `当前 ${registry.biliFixedUps.length} 个固定 UP`,
                      biliFixedUpPreview.length > 0
                        ? `包含 ${biliFixedUpPreview.join(" · ")}${registry.biliFixedUps.length > biliFixedUpPreview.length ? " ..." : ""}`
                        : "",
                      biliFixedUpPanelExpanded ? "点击收起具体条目" : "点击展开具体条目",
                    ].filter(Boolean).join(" | "),
                    badge: "固定 UP",
                    expanded: biliFixedUpPanelExpanded,
                    onToggle: () => toggleExpandedMonitorPanel("bili-fixed-ups"),
                    children: registry.biliFixedUps.map((uid) => {
                      const profile = registry.biliCreatorProfiles[uid] || {};
                      const title = profile.author || profile.author_id || `固定 UP ${uid}`;
                      const subtitle = [
                        `UID: ${uid}`,
                        (profile.smart_group_labels?.length || profile.smart_groups?.length)
                          ? `分组: ${(profile.smart_group_labels?.length ? profile.smart_group_labels : profile.smart_groups)?.join(" · ")}`
                          : "",
                        profile.latest_title ? `最近内容: ${profile.latest_title}` : "",
                      ].filter(Boolean).join(" | ");
                      return renderPassiveRow({
                        key: `bili-fixed-up-${uid}`,
                        title,
                        subtitle: subtitle || `UID: ${uid}`,
                        badge: "UP",
                      });
                    }),
                  }),
                ] : []),
              ],
            })}

            {renderGroup({
              title: "小红书监控",
              icon: <ShoppingBag style={{ width: "18px", height: "18px" }} />,
              description: "包含关键词推送和关注监控，Feed 会按智能分组继续归类。",
              count: registry.xhsKeywords.length + registry.xhsFollowingScanMonitors.length + registry.xhsCreators.length,
              onOpen: openXhsMonitors,
              emptyText: "还没有配置小红书监控词条，去“小红书工具”里新增即可。",
              rows: [
                ...(!registry.xhsAuthReady ? [
                  renderPassiveRow({
                    key: "xhs-auth-warning",
                    title: "小红书 Cookie 未连接",
                    subtitle: "当前未检测到可复用的小红书 Cookie。关注流搜索、关键词搜索和博主最新动态都不会产出，请先在主动工具里重新连接 Cookie。",
                    badge: "需要登录态",
                  }),
                ] : []),
                renderMonitorRow({
                  key: "xhs-following-global",
                  title: "关注流搜索总开关",
                  subtitle: [
                    xhsFollowingMonitorCount > 0
                      ? `已配置 ${xhsFollowingMonitorCount} 条关注流定义`
                      : "还没有配置关注流定义",
                    xhsFollowingKeywordPreview.length > 0
                      ? `关键词: ${xhsFollowingKeywordPreview.join(" · ")}${xhsFollowingKeywords.length > xhsFollowingKeywordPreview.length ? " ..." : ""}`
                      : "",
                    registry.xhsFollowingScan.keyword_filter ? "按关键词过滤" : "抓全关注流",
                    "默认关闭，可在这里一键开启",
                  ].filter(Boolean).join(" | "),
                  enabled: registry.xhsFollowingScan.enabled,
                  disabled: savingKey === "xhs-following:global",
                  onToggle: () => {
                    const nextEnabled = !registry.xhsFollowingScan.enabled;
                    const nextScan = {
                      ...registry.xhsFollowingScan,
                      enabled: nextEnabled,
                    };
                    const nextMonitors = registry.xhsFollowingScanMonitors.map((item) => ({
                      ...item,
                      enabled: nextEnabled,
                    }));
                    void persistXhsFollowingConfig(nextScan, nextMonitors, "global");
                  },
                }),
                ...registry.xhsFollowingScanMonitors.map((monitor) =>
                  renderMonitorRow({
                    key: `xhs-following-${monitor.id}`,
                    title: monitor.label || monitor.keywords?.[0] || "未命名关注流监控",
                    subtitle: [
                      monitor.keywords?.length ? `关键词: ${monitor.keywords.join(" · ")}` : "未设置关键词",
                      monitor.keyword_filter ? "按关键词过滤" : "抓全关注流",
                      `抓取 ${monitor.fetch_limit} 条`,
                      `${monitor.recent_days} 天内`,
                      monitor.sort_by === "time" ? "最新优先" : "高赞优先",
                      monitor.include_comments ? "带评论" : "",
                    ].filter(Boolean).join(" | "),
                    enabled: monitor.enabled,
                    disabled: savingKey === `xhs-following:${monitor.id}`,
                    onToggle: () => toggleXhsFollowingMonitor(monitor.id),
                  })
                ),
                <div
                  key="xhs-creator-risk"
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "10px",
                    padding: "12px 14px",
                    borderRadius: "10px",
                    border: "1px solid rgba(217, 119, 6, 0.35)",
                    background: "rgba(245, 158, 11, 0.12)",
                    color: "#92400e",
                  }}
                >
                  <AlertTriangle style={{ width: "16px", height: "16px", flexShrink: 0, marginTop: "2px" }} />
                  <div style={{ fontSize: "0.75rem", lineHeight: 1.65 }}>
                    <div style={{ fontWeight: 700, marginBottom: "2px" }}>博主最新动态爬取默认关闭</div>
                    <div>
                      这条链路会访问博主主页抓最近动态，可能触发小红书访问频繁或安全验证。建议只在需要时开启，并优先结合智能分组缩小范围、低频执行。
                    </div>
                  </div>
                </div>,
                renderMonitorRow({
                  key: "xhs-creator-global",
                  title: "博主最新动态爬取（智能分组）",
                  subtitle: [
                    xhsCreatorGroupCount > 0
                      ? `已选 ${xhsCreatorGroupCount} 个智能分组`
                      : "还没有选中智能分组",
                    registry.xhsCreators.length > 0
                      ? `当前候选 ${registry.xhsCreators.length} 个博主`
                      : "当前还没有候选博主",
                    "默认关闭，按需开启",
                  ].filter(Boolean).join(" | "),
                  enabled: registry.xhsCreatorPushEnabled,
                  disabled: savingKey === "xhs-creator-push:global",
                  onToggle: () => {
                    void persistXhsCreatorPushEnabled(!registry.xhsCreatorPushEnabled);
                  },
                }),
                ...registry.xhsKeywords.map((monitor) =>
                  renderMonitorRow({
                    key: `xhs-keyword-${monitor.id}`,
                    title: monitor.label || "未命名关键词监控",
                    subtitle: monitor.keywords?.length ? `关键词: ${monitor.keywords.join(" · ")}` : "关键词监控",
                    enabled: monitor.enabled,
                    disabled: savingKey === `xhs-keyword:${monitor.id}`,
                    onToggle: () => {
                      const nextMonitors = registry.xhsKeywords.map((item) =>
                        item.id === monitor.id ? { ...item, enabled: !item.enabled } : item
                      );
                      void persistXhsKeywordMonitors(nextMonitors, monitor.id);
                    },
                  })
                ),
                ...registry.xhsCreators.map((monitor) =>
                  renderMonitorRow({
                    key: `xhs-creator-${monitor.id}`,
                    title: monitor.label || monitor.author || monitor.user_id || "未命名关注监控",
                    subtitle: [
                      monitor.author ? `作者: ${monitor.author}` : "",
                      monitor.user_id ? `ID: ${monitor.user_id}` : "",
                      (monitor.smart_group_labels?.length || monitor.smart_groups?.length)
                        ? `分组: ${(monitor.smart_group_labels?.length ? monitor.smart_group_labels : monitor.smart_groups)?.join(" · ")}`
                        : "",
                    ].filter(Boolean).join(" | "),
                    enabled: monitor.enabled,
                    disabled: savingKey === `xhs-creator:${monitor.id}`,
                    onToggle: () => {
                      const nextMonitors = registry.xhsCreators.map((item) =>
                        item.id === monitor.id ? { ...item, enabled: !item.enabled } : item
                      );
                      void persistXhsCreatorMonitors(nextMonitors, monitor.id);
                    },
                  })
                ),
              ],
            })}
          </>
        )}
      </div>
    </Card>
  );
}

const FEED_SOURCE_TOGGLES = [
  {
    moduleId: "xiaoyuzhou-tracker",
    title: "隐藏小宇宙情报",
    description: "播客源继续保留调度，只是不在今日情报里出现",
    icon: <Headphones style={{ width: "20px", height: "20px" }} />,
  },
  {
    moduleId: "zhihu-tracker",
    title: "隐藏知乎情报",
    description: "知乎源继续保留调度，只是不在今日情报里出现",
    icon: <HelpCircle style={{ width: "20px", height: "20px" }} />,
  },
  {
    moduleId: "folder-monitor",
    title: "隐藏文件夹监控情报",
    description: "文件夹监控继续运行，只是不在今日情报里出现",
    icon: <FolderOpen style={{ width: "20px", height: "20px" }} />,
  },
];

function FeedPreferencesSection() {
  const { config, setConfig, addToast } = useStore();
  const prefs = normalizeFeedPreferences(config?.feed_preferences);
  const [saving, setSaving] = useState(false);

  async function saveFeedPreferences(next: FeedPreferences) {
    try {
      setSaving(true);
      const saved = await api.post<Record<string, unknown>>("/api/config", {
        feed_preferences: next,
      });
      setConfig(saved as any);
      addToast({ kind: "success", title: "今日情报偏好已保存" });
    } catch (e) {
      console.error("Failed to save feed preferences:", e);
      addToast({ kind: "error", title: "保存今日情报偏好失败" });
    } finally {
      setSaving(false);
    }
  }

  function toggleHiddenModule(moduleId: string) {
    const hiddenSet = new Set(prefs.hidden_module_ids);
    if (hiddenSet.has(moduleId)) hiddenSet.delete(moduleId);
    else hiddenSet.add(moduleId);
    void saveFeedPreferences({
      ...prefs,
      hidden_module_ids: Array.from(hiddenSet),
    });
  }

  function updateGroupMode(groupMode: FeedPreferences["group_mode"]) {
    if (prefs.group_mode === groupMode) return;
    void saveFeedPreferences({
      ...prefs,
      group_mode: groupMode,
    });
  }

  function toggleRecommendations() {
    void saveFeedPreferences({
      ...prefs,
      show_recommendations: !prefs.show_recommendations,
    });
  }

  return (
    <Card title="今日情报" icon={<Zap style={{ width: "18px", height: "18px" }} />}>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div
          style={{
            padding: "12px 16px",
            borderRadius: "var(--radius-md)",
            background: "var(--bg-hover)",
            border: "1px solid var(--border-light)",
            fontSize: "0.75rem",
            color: "var(--text-muted)",
            lineHeight: 1.6,
          }}
        >
          今日情报现在会优先按智能分组聚合小红书、B站和论文监控。这里控制默认分组方式，以及哪些来源默认隐藏。
        </div>

        <SettingItem
          icon={<Layers style={{ width: "20px", height: "20px" }} />}
          title="默认分组方式"
          description="智能分组更适合集中看同类博主和同一条论文链路；时间线更适合按新旧处理"
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {[
              { value: "smart" as const, label: "智能分组" },
              { value: "timeline" as const, label: "时间线" },
            ].map((option) => {
              const active = prefs.group_mode === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={saving}
                  onClick={() => updateGroupMode(option.value)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: `1px solid ${active ? "var(--color-primary)" : "var(--border-light)"}`,
                    background: active ? "rgba(188, 164, 227, 0.12)" : "var(--bg-card)",
                    color: active ? "var(--color-primary)" : "var(--text-secondary)",
                    fontSize: "0.8125rem",
                    fontWeight: 600,
                    cursor: saving ? "not-allowed" : "pointer",
                    opacity: saving ? 0.7 : 1,
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </SettingItem>

        <SettingItem
          icon={<User style={{ width: "20px", height: "20px" }} />}
          title="显示相似博主推荐"
          description="在智能分组头部补出同组作者，方便继续扩展小红书和 B 站关注池"
        >
          <Toggle
            enabled={prefs.show_recommendations}
            disabled={saving}
            onToggle={toggleRecommendations}
          />
        </SettingItem>

        {FEED_SOURCE_TOGGLES.map((item) => (
          <SettingItem
            key={item.moduleId}
            icon={item.icon}
            title={item.title}
            description={item.description}
          >
            <Toggle
              enabled={prefs.hidden_module_ids.includes(item.moduleId)}
              disabled={saving}
              onToggle={() => toggleHiddenModule(item.moduleId)}
            />
          </SettingItem>
        ))}
      </div>
    </Card>
  );
}

function GeneralSection() {
  const [paperAiScoringEnabled, setPaperAiScoringEnabled] = useState(false);
  const [claudeCodeCompatEnabled, setClaudeCodeCompatEnabled] = useState(false);
  const [intelligenceDeliveryEnabled, setIntelligenceDeliveryEnabled] = useState(true);
  const [intelligenceDeliveryTime, setIntelligenceDeliveryTime] = useState("09:00");
  const [onboardingCompleted, setOnboardingCompleted] = useState(true);
  const [onboardingSaving, setOnboardingSaving] = useState<"show" | "hide" | "open" | null>(null);
  const [socialAuthStatus, setSocialAuthStatus] = useState<{
    xhsReady: boolean;
    xhsSource: string | null;
    biliReady: boolean;
    biliSource: string | null;
  }>({
    xhsReady: false,
    xhsSource: null,
    biliReady: false,
    biliSource: null,
  });
  const [xhsCookieConnecting, setXhsCookieConnecting] = useState(false);
  const [biliCookieConnecting, setBiliCookieConnecting] = useState(false);
  const { isDark: darkMode, toggleTheme } = useThemeMode();
  const {
    config, setConfig,
    aiProvider, setAiProvider,
    addToast, showcaseMode, setShowcaseMode,
    pixelAvatarOnHover, setPixelAvatarOnHover,
    sbtiHoverEnabled, setSbtiHoverEnabled,
  } = useStore();

  // Load settings state from config
  useEffect(() => {
    api.get<Record<string, unknown>>("/api/config").then((cfg) => {
      const claudeCompat = Boolean(cfg.claude_code_compat_enabled);
      setClaudeCodeCompatEnabled(claudeCompat);
      setPaperAiScoringEnabled(Boolean(cfg.paper_ai_scoring_enabled));
      setIntelligenceDeliveryEnabled(cfg.intelligence_delivery_enabled !== false);
      setIntelligenceDeliveryTime(String(cfg.intelligence_delivery_time || "09:00"));
      setOnboardingCompleted(cfg.onboarding_completed !== false);
      setAiProvider(cfg.ai_provider === "claude" && claudeCompat ? "claude" : "codex");
    }).catch(() => {});
    void loadSocialAuthStatus();
  }, [setAiProvider]);

  useEffect(() => {
    const handler = () => {
      void loadSocialAuthStatus();
    };
    window.addEventListener(SOCIAL_AUTH_UPDATED_EVENT, handler);
    return () => window.removeEventListener(SOCIAL_AUTH_UPDATED_EVENT, handler);
  }, []);

  async function loadSocialAuthStatus() {
    try {
      const [xhsConfig, biliConfig] = await Promise.all([
        api.get<{ auth_ready?: boolean; auth_source?: string | null }>("/api/modules/xiaohongshu-tracker/config"),
        api.get<{ auth_ready?: boolean; auth_source?: string | null }>("/api/modules/bilibili-tracker/config"),
      ]);
      setSocialAuthStatus({
        xhsReady: xhsConfig.auth_ready ?? false,
        xhsSource: xhsConfig.auth_source ?? null,
        biliReady: biliConfig.auth_ready ?? false,
        biliSource: biliConfig.auth_source ?? null,
      });
    } catch {
      // ignore auth status refresh failures in settings
    }
  }

  async function updateAiProvider(provider: "codex" | "claude") {
    if (provider === "claude" && !claudeCodeCompatEnabled) {
      addToast({ kind: "info", title: "请先开启 Claude Code 兼容", message: "默认保持关闭；确认需要后再手动开启。" });
      return;
    }
    try {
      const saved = await api.post<Record<string, unknown>>("/api/config", { ai_provider: provider });
      setConfig(saved as any);
      setAiProvider(provider);
      addToast({
        kind: "success",
        title: `默认 AI 已切换为 ${provider === "claude" ? "Claude Code" : "Codex"}`,
      });
    } catch {
      addToast({ kind: "error", title: "保存默认 AI 失败" });
    }
  }

  async function toggleClaudeCodeCompat() {
    const nextValue = !claudeCodeCompatEnabled;
    const nextProvider = !nextValue && aiProvider === "claude" ? "codex" : aiProvider;

    try {
      const saved = await api.post<Record<string, unknown>>("/api/config", {
        claude_code_compat_enabled: nextValue,
        ai_provider: nextProvider,
      });
      setConfig(saved as any);
      setClaudeCodeCompatEnabled(nextValue);
      setAiProvider(nextProvider);
      addToast({
        kind: "success",
        title: nextValue ? "Claude Code 兼容已开启" : "Claude Code 兼容已关闭",
        message: nextValue
          ? "现在可以在默认后台 Agent 中手动切换到 Claude Code。"
          : nextProvider === "codex"
            ? "已恢复为 Codex，避免继续走 Claude Code 后端链路。"
            : "Claude Code 已保持关闭。",
      });
    } catch {
      addToast({ kind: "error", title: "保存 Claude Code 兼容设置失败" });
    }
  }

  async function togglePaperAiScoring() {
    const nextValue = !paperAiScoringEnabled;
    try {
      const saved = await api.post<Record<string, unknown>>("/api/config", { paper_ai_scoring_enabled: nextValue });
      setConfig(saved as any);
      setPaperAiScoringEnabled(nextValue);
      addToast({
        kind: "success",
        title: nextValue ? "论文 AI 帮读评分已开启" : "论文 AI 帮读评分已关闭",
        message: nextValue
          ? "新抓取的论文会调用后台 AI 生成评分、短摘要、标签和核心创新"
          : "新抓取的论文将直接使用摘要回退，不再调用后台 AI 评分",
      });
    } catch {
      addToast({ kind: "error", title: "保存论文 AI 帮读评分设置失败" });
    }
  }

  async function saveIntelligenceDeliveryTime(nextTime: string) {
    try {
      const saved = await api.post<Record<string, unknown>>("/api/config", {
        intelligence_delivery_time: nextTime,
      });
      setConfig(saved as any);
      setIntelligenceDeliveryTime(String(saved.intelligence_delivery_time || nextTime));
      addToast({
        kind: "success",
        title: "默认推送时间已保存",
        message: "论文、小宇宙、知乎会按该时间调度；小红书和哔哩哔哩会提前 30 分钟开始预抓取。",
      });
    } catch {
      setIntelligenceDeliveryTime(config?.intelligence_delivery_time || "09:00");
      addToast({ kind: "error", title: "保存默认推送时间失败" });
    }
  }

  async function toggleIntelligenceDelivery() {
    const nextValue = !intelligenceDeliveryEnabled;
    try {
      const saved = await api.post<Record<string, unknown>>("/api/config", {
        intelligence_delivery_enabled: nextValue,
      });
      setConfig(saved as any);
      setIntelligenceDeliveryEnabled(saved.intelligence_delivery_enabled !== false);
      addToast({
        kind: "success",
        title: nextValue ? "默认推送已开启" : "默认推送已关闭",
        message: nextValue
          ? "定时情报抓取已恢复，会继续按默认推送时间执行。"
          : "定时情报抓取已暂停；你仍然可以在开发调试里手动触发 Feed 流测试。",
      });
    } catch {
      addToast({ kind: "error", title: "保存默认推送开关失败" });
    }
  }

  async function updateOnboardingPreference(completed: boolean, options?: { openNow?: boolean }) {
    setOnboardingSaving(options?.openNow ? "open" : completed ? "hide" : "show");
    try {
      const saved = await api.post<Record<string, unknown>>("/api/config", {
        onboarding_completed: completed,
        onboarding_step: completed ? 4 : 0,
      });
      setConfig(saved as any);
      setOnboardingCompleted(saved.onboarding_completed !== false);
      addToast({
        kind: "success",
        title: completed ? "新手向导已关闭" : options?.openNow ? "正在打开新手向导" : "新手向导已开启",
        message: completed
          ? "下次启动不会自动显示。你仍然可以在设置里重新打开。"
          : options?.openNow
            ? "将立即进入 UI 向导。右上角可以随时跳过。"
            : "下次启动会显示 UI 向导。",
      });
      if (options?.openNow) {
        window.dispatchEvent(new Event("abo:onboarding-status-updated"));
      }
    } catch {
      addToast({ kind: "error", title: "保存新手向导设置失败" });
    } finally {
      setOnboardingSaving(null);
    }
  }

  function describeAuthSource(source: string | null) {
    if (source === "module") return "已连接，当前直接使用模块配置";
    if (source === "global") return "已连接，当前复用主动工具保存的全局 Cookie";
    return "未连接，情报调度里的社媒链路不会完整执行";
  }

  async function handleConnectXhsCookie() {
    setXhsCookieConnecting(true);
    try {
      const result = await xiaohongshuGetCookieFromBrowser();
      if (!result.success) {
        addToast({
          kind: "error",
          title: "小红书 Cookie 一键配置失败",
          message: result.error || "请先确认浏览器已登录小红书",
        });
        return;
      }
      await loadSocialAuthStatus();
      window.dispatchEvent(new Event(SOCIAL_AUTH_UPDATED_EVENT));
      addToast({
        kind: "success",
        title: "小红书 Cookie 已连接",
        message: result.message || `已获取 ${result.cookie_count || 0} 个 Cookie，定时情报会直接复用。`,
      });
    } catch (err) {
      addToast({
        kind: "error",
        title: "小红书 Cookie 一键配置失败",
        message: err instanceof Error ? err.message : "请检查浏览器登录态或 ABO 后端状态",
      });
    } finally {
      setXhsCookieConnecting(false);
    }
  }

  async function handleConnectBiliCookie() {
    setBiliCookieConnecting(true);
    try {
      const result = await bilibiliGetCookieFromBrowser();
      if (!result.success) {
        addToast({
          kind: "error",
          title: "B站 Cookie 一键配置失败",
          message: result.error || "请先确认浏览器已登录 B站",
        });
        return;
      }
      await loadSocialAuthStatus();
      window.dispatchEvent(new Event(SOCIAL_AUTH_UPDATED_EVENT));
      addToast({
        kind: "success",
        title: "B站 Cookie 已连接",
        message: result.message || `已获取 ${result.cookie_count || 0} 个 Cookie，定时情报会直接复用。`,
      });
    } catch (err) {
      addToast({
        kind: "error",
        title: "B站 Cookie 一键配置失败",
        message: err instanceof Error ? err.message : "请检查浏览器登录态或 ABO 后端状态",
      });
    } finally {
      setBiliCookieConnecting(false);
    }
  }

  const shortcuts = [
    { label: "角色主页", shortcut: "⌘1" },
    { label: "今日情报", shortcut: "⌘2" },
    { label: "情报库", shortcut: "⌘3" },
    { label: "文献库", shortcut: "⌘4" },
    { label: "知识库", shortcut: "⌘5" },
    { label: "手记", shortcut: "⌘6" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <Card title="情报调度" icon={<Zap style={{ width: "18px", height: "18px" }} />}>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <SettingItem
            icon={<Zap style={{ width: "20px", height: "20px" }} />}
            title="开启默认推送"
            description={intelligenceDeliveryEnabled
              ? "当前已开启。论文、小宇宙、知乎会按默认推送时间调度；小红书和哔哩哔哩会提前 30 分钟预抓取。"
              : "当前已关闭。不会执行默认定时推送，但你仍然可以手动触发抓取测试。"
            }
          >
            <Toggle enabled={intelligenceDeliveryEnabled} onToggle={toggleIntelligenceDelivery} />
          </SettingItem>
          <SettingItem
            icon={<Zap style={{ width: "20px", height: "20px" }} />}
            title="默认推送时间"
            description="默认是 09:00。论文、小宇宙、知乎在这个时间开始抓取；小红书和哔哩哔哩会提前 30 分钟预抓取，用来保证 9 点前后 Feed 能到位。修改后会同步覆盖这些模块的默认调度。"
          >
            <input
              type="time"
              step={1800}
              value={intelligenceDeliveryTime}
              onChange={(e) => setIntelligenceDeliveryTime(e.target.value)}
              onBlur={() => void saveIntelligenceDeliveryTime(intelligenceDeliveryTime)}
              style={{
                padding: "8px 12px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border-light)",
                background: "var(--bg-card)",
                color: "var(--text-main)",
                fontSize: "0.875rem",
                width: "120px",
              }}
            />
          </SettingItem>
          <div
            style={{
              padding: "12px 16px",
              borderRadius: "var(--radius-md)",
              background: "var(--bg-hover)",
              border: "1px solid var(--border-light)",
              fontSize: "0.75rem",
              color: "var(--text-muted)",
              lineHeight: 1.6,
            }}
          >
            社媒情报会直接复用主动工具的一键浏览器 Cookie。这里可以不进工具页，直接完成小红书和 B站的登录态连接。
          </div>
          <SettingItem
            icon={<ShoppingBag style={{ width: "20px", height: "20px" }} />}
            title="小红书 Cookie"
            description={describeAuthSource(socialAuthStatus.xhsSource)}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", justifyContent: "flex-end" }}>
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  color: socialAuthStatus.xhsReady ? "var(--color-primary)" : "var(--text-muted)",
                  background: socialAuthStatus.xhsReady ? "rgba(188, 164, 227, 0.14)" : "var(--bg-hover)",
                  borderRadius: "999px",
                  padding: "4px 10px",
                }}
              >
                {socialAuthStatus.xhsReady ? "已连接" : "未连接"}
              </span>
              <button
                type="button"
                onClick={() => void handleConnectXhsCookie()}
                disabled={xhsCookieConnecting}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  minWidth: "148px",
                  padding: "8px 14px",
                  borderRadius: "8px",
                  border: "none",
                  background: "linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))",
                  color: "white",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  cursor: xhsCookieConnecting ? "not-allowed" : "pointer",
                  opacity: xhsCookieConnecting ? 0.7 : 1,
                }}
              >
                {xhsCookieConnecting ? (
                  <Loader2 style={{ width: "14px", height: "14px", animation: "spin 1s linear infinite" }} />
                ) : (
                  <ShoppingBag style={{ width: "14px", height: "14px" }} />
                )}
                {xhsCookieConnecting ? "连接中..." : "一键配置"}
              </button>
            </div>
          </SettingItem>
          <SettingItem
            icon={<Tv style={{ width: "20px", height: "20px" }} />}
            title="B站 Cookie"
            description={describeAuthSource(socialAuthStatus.biliSource)}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", justifyContent: "flex-end" }}>
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  color: socialAuthStatus.biliReady ? "var(--color-primary)" : "var(--text-muted)",
                  background: socialAuthStatus.biliReady ? "rgba(188, 164, 227, 0.14)" : "var(--bg-hover)",
                  borderRadius: "999px",
                  padding: "4px 10px",
                }}
              >
                {socialAuthStatus.biliReady ? "已连接" : "未连接"}
              </span>
              <button
                type="button"
                onClick={() => void handleConnectBiliCookie()}
                disabled={biliCookieConnecting}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  minWidth: "148px",
                  padding: "8px 14px",
                  borderRadius: "8px",
                  border: "none",
                  background: "linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))",
                  color: "white",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  cursor: biliCookieConnecting ? "not-allowed" : "pointer",
                  opacity: biliCookieConnecting ? 0.7 : 1,
                }}
              >
                {biliCookieConnecting ? (
                  <Loader2 style={{ width: "14px", height: "14px", animation: "spin 1s linear infinite" }} />
                ) : (
                  <Tv style={{ width: "14px", height: "14px" }} />
                )}
                {biliCookieConnecting ? "连接中..." : "一键配置"}
              </button>
            </div>
          </SettingItem>
        </div>
      </Card>

      <MonitorRegistrySection />
      <HiddenModuleSection />
      <FeedPreferencesSection />
      <Card title="AI 助手" icon={<Sparkles style={{ width: "18px", height: "18px" }} />}>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <SettingItem
            icon={<Shield style={{ width: "20px", height: "20px" }} />}
            title="Claude Code 兼容"
            description={claudeCodeCompatEnabled
              ? "已开启。你现在可以把默认后台 Agent 切到 Claude Code"
              : "默认关闭。需要兼容 Claude Code 后端时再手动开启"
            }
          >
            <Toggle enabled={claudeCodeCompatEnabled} onToggle={toggleClaudeCodeCompat} />
          </SettingItem>
          <SettingItem
            icon={<Sparkles style={{ width: "20px", height: "20px" }} />}
            title="默认后台 Agent"
            description={aiProvider === "claude" ? "当前默认使用 Claude Code" : "当前默认使用 Codex"}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {[
                { id: "codex" as const, label: "Codex", supported: true, hint: "默认可用" },
                {
                  id: "claude" as const,
                  label: "Claude Code",
                  supported: claudeCodeCompatEnabled,
                  hint: claudeCodeCompatEnabled ? "兼容模式已开启" : "先开启上面的兼容开关",
                },
              ].map((provider) => {
                const active = aiProvider === provider.id;
                return (
                  <button
                    key={provider.id}
                    type="button"
                    onClick={() => updateAiProvider(provider.id)}
                    disabled={!provider.supported}
                    title={provider.hint}
                    style={{
                      padding: "8px 14px",
                      borderRadius: "8px",
                      border: `1px solid ${provider.supported ? (active ? "var(--color-primary)" : "var(--border-light)") : "rgba(15, 23, 42, 0.12)"}`,
                      background: provider.supported
                        ? (active ? "rgba(188, 164, 227, 0.15)" : "var(--bg-card)")
                        : "rgba(15, 23, 42, 0.74)",
                      color: provider.supported
                        ? (active ? "var(--color-primary)" : "var(--text-secondary)")
                        : "rgba(255, 255, 255, 0.72)",
                      fontSize: "0.8125rem",
                      fontWeight: 600,
                      cursor: provider.supported ? "pointer" : "not-allowed",
                      transition: "all 0.2s ease",
                      opacity: provider.supported ? 1 : 0.92,
                    }}
                  >
                    {provider.label}
                  </button>
                );
              })}
            </div>
          </SettingItem>
          <div
            style={{
              padding: "10px 14px",
              borderRadius: "var(--radius-md)",
              background: "var(--bg-hover)",
              fontSize: "0.75rem",
              color: "var(--text-muted)",
              lineHeight: 1.6,
            }}
          >
            这个设置会影响聊天入口的默认选择，以及后端统一 AI 调用链路。默认只启用 Codex；Claude Code 兼容默认关闭，只有在你明确需要时才建议手动开启。
          </div>
          <SettingItem
            icon={<Sparkles style={{ width: "20px", height: "20px" }} />}
            title="启用论文 AI 帮读评分"
            description={paperAiScoringEnabled
              ? "论文爬取时会调用后台 AI 生成评分、短摘要、标签和核心创新"
              : "默认关闭。关闭后论文爬取只保留原始摘要和元数据，不调用后台 AI 评分"
            }
          >
            <Toggle enabled={paperAiScoringEnabled} onToggle={togglePaperAiScoring} />
          </SettingItem>
        </div>
      </Card>

      {/* Appearance */}
      <Card title="外观设置" icon={<Palette style={{ width: "18px", height: "18px" }} />}>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <SettingItem
            icon={darkMode ? <Moon style={{ width: "20px", height: "20px" }} /> : <Sun style={{ width: "20px", height: "20px" }} />}
            title="深色模式"
            description={darkMode ? "当前使用深色主题" : "当前使用浅色主题"}
          >
            <Toggle enabled={darkMode} onToggle={toggleTheme} />
          </SettingItem>
        </div>
      </Card>

      {/* Showcase Mode */}
      <Card title="炫酷展示模式" icon={<Sparkles style={{ width: "18px", height: "18px" }} />}>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <SettingItem
            icon={<Sparkles style={{ width: "20px", height: "20px" }} />}
            title="炫酷展示模式"
            description={showcaseMode
              ? "已开启：增强光效、霓虹雷达、粒子背景、Hero 角色卡"
              : "开启后增强视觉效果，适合截图分享和宣传"
            }
          >
            <Toggle
              enabled={showcaseMode}
              onToggle={() => {
                setShowcaseMode(!showcaseMode);
                addToast({
                  kind: "success",
                  title: !showcaseMode ? "炫酷模式已开启" : "炫酷模式已关闭",
                  message: !showcaseMode ? "光效增强、霓虹雷达、Hero 角色卡已激活" : "已恢复标准 UI",
                });
              }}
            />
          </SettingItem>
          {showcaseMode && (
            <div
              style={{
                padding: "12px 16px",
                borderRadius: "var(--radius-md)",
                background: "linear-gradient(135deg, rgba(188, 164, 227, 0.12), rgba(255, 183, 178, 0.08))",
                border: "1px solid rgba(188, 164, 227, 0.2)",
                fontSize: "0.8125rem",
                color: "var(--text-secondary)",
                lineHeight: 1.7,
              }}
            >
              <strong style={{ color: "var(--color-primary)" }}>展示增强已激活：</strong>
              <br />
              Hero 角色卡 / 霓虹六维雷达 / 浮动粒子背景 / 增强光影卡片 / 渐变文字
            </div>
          )}
        </div>
      </Card>

      {/* Avatar Hover Behavior */}
      <Card title="角色头像" icon={<User style={{ width: "18px", height: "18px" }} />}>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <SettingItem
            icon={<User style={{ width: "20px", height: "20px" }} />}
            title="启用悬停切换形态"
            description={sbtiHoverEnabled
              ? "悬停头像时会切换到第二形态（MBTI 或 PixelAvatar）"
              : "始终显示 SBTI 像素头像，不响应悬停"
            }
          >
            <Toggle
              enabled={sbtiHoverEnabled}
              onToggle={() => {
                setSbtiHoverEnabled(!sbtiHoverEnabled);
                addToast({
                  kind: "success",
                  title: "悬停切换已" + (!sbtiHoverEnabled ? "开启" : "关闭"),
                });
              }}
            />
          </SettingItem>
          <SettingItem
            icon={<User style={{ width: "20px", height: "20px" }} />}
            title="悬停第二形态"
            description={pixelAvatarOnHover
              ? "悬停显示 PixelAvatar（随 SAN / 精力变化的 8 态小人）"
              : "悬停显示 MBTIAvatar（16 种 MBTI 人格像素小人）"
            }
          >
            <Toggle
              enabled={pixelAvatarOnHover}
              onToggle={() => {
                setPixelAvatarOnHover(!pixelAvatarOnHover);
                addToast({
                  kind: "success",
                  title: "头像悬停目标已切换",
                  message: !pixelAvatarOnHover ? "悬停显示 PixelAvatar（状态反馈）" : "悬停显示 MBTIAvatar",
                });
              }}
            />
          </SettingItem>
          <div
            style={{
              padding: "10px 14px",
              borderRadius: "var(--radius-md)",
              background: "var(--bg-hover)",
              fontSize: "0.75rem",
              color: "var(--text-muted)",
              lineHeight: 1.6,
            }}
          >
            默认显示 SBTI 像素头像（27 种人格）。可在角色卡右上角手动切换 SBTI 类型。
          </div>
        </div>
      </Card>

      <Card title="新手向导" icon={<Sparkles style={{ width: "18px", height: "18px" }} />}>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <SettingItem
            icon={<Sparkles style={{ width: "20px", height: "20px" }} />}
            title="首次启动显示 UI 向导"
            description={onboardingCompleted
              ? "当前已关闭。新用户第一次打开仍会看到向导；这台设备下次启动不会自动弹出。"
              : "当前已开启。下次启动会显示完整 UI 向导，右上角可以跳过。"
            }
          >
            <Toggle
              enabled={!onboardingCompleted}
              disabled={onboardingSaving !== null}
              onToggle={() => void updateOnboardingPreference(!onboardingCompleted)}
            />
          </SettingItem>

          <div
            style={{
              display: "flex",
              gap: "10px",
              flexWrap: "wrap",
              justifyContent: "flex-end",
            }}
          >
            <button
              type="button"
              onClick={() => void updateOnboardingPreference(false, { openNow: true })}
              disabled={onboardingSaving !== null}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "7px",
                padding: "9px 14px",
                borderRadius: "8px",
                border: "none",
                background: "linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))",
                color: "white",
                fontSize: "0.8125rem",
                fontWeight: 700,
                cursor: onboardingSaving !== null ? "not-allowed" : "pointer",
                opacity: onboardingSaving !== null ? 0.7 : 1,
              }}
            >
              {onboardingSaving === "open" ? (
                <Loader2 style={{ width: "14px", height: "14px", animation: "spin 1s linear infinite" }} />
              ) : (
                <Sparkles style={{ width: "14px", height: "14px" }} />
              )}
              {onboardingSaving === "open" ? "打开中..." : "立即打开向导"}
            </button>

            <button
              type="button"
              onClick={() => void updateOnboardingPreference(true)}
              disabled={onboardingSaving !== null || onboardingCompleted}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "7px",
                padding: "9px 14px",
                borderRadius: "8px",
                border: "1px solid var(--border-light)",
                background: "var(--bg-card)",
                color: onboardingCompleted ? "var(--text-muted)" : "var(--text-secondary)",
                fontSize: "0.8125rem",
                fontWeight: 700,
                cursor: onboardingSaving !== null || onboardingCompleted ? "not-allowed" : "pointer",
                opacity: onboardingSaving !== null || onboardingCompleted ? 0.7 : 1,
              }}
            >
              {onboardingSaving === "hide" ? (
                <Loader2 style={{ width: "14px", height: "14px", animation: "spin 1s linear infinite" }} />
              ) : (
                <Check style={{ width: "14px", height: "14px" }} />
              )}
              {onboardingSaving === "hide" ? "关闭中..." : "关闭向导"}
            </button>
          </div>

          <div
            style={{
              padding: "10px 14px",
              borderRadius: "var(--radius-md)",
              background: "var(--bg-hover)",
              fontSize: "0.75rem",
              color: "var(--text-muted)",
              lineHeight: 1.6,
            }}
          >
            向导不是 Markdown 文档替代品，而是第一次打开时的 UI 学习流程：配置路径、连接 Cookie、试跑主动工具、理解关注监控、入库维护和助手使用。
          </div>
        </div>
      </Card>

      {/* RSS Feed */}
      <RSSSection />

      {/* Keyboard Shortcuts */}
      <Card title="键盘快捷键" icon={<Keyboard style={{ width: "18px", height: "18px" }} />}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: "12px",
          }}
        >
          {shortcuts.map(({ label, shortcut }) => (
            <div
              key={label}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px",
                borderRadius: "var(--radius-md)",
                background: "var(--bg-hover)",
                border: "1px solid var(--border-light)",
              }}
            >
              <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>{label}</span>
              <kbd
                style={{
                  padding: "4px 10px",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-light)",
                  fontSize: "0.75rem",
                  fontFamily: "monospace",
                  color: "var(--text-muted)",
                  boxShadow: "0 2px 0 var(--border-light)",
                }}
              >
                {shortcut}
              </kbd>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function AboutSection() {
  const techStack = [
    { name: "Tauri", version: "2.x" },
    { name: "React", version: "19" },
    { name: "FastAPI", version: "latest" },
    { name: "Tailwind", version: "v4" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div style={{ textAlign: "center", padding: "40px 20px" }}>
        {/* Logo */}
        <div
          style={{
            width: "80px",
            height: "80px",
            margin: "0 auto 24px",
            borderRadius: "var(--radius-xl)",
            background: "linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 8px 32px rgba(188, 164, 227, 0.4)",
          }}
        >
          <Zap style={{ width: "40px", height: "40px", color: "white" }} />
        </div>

        <h2
          style={{
            fontFamily: "'M PLUS Rounded 1c', sans-serif",
            fontSize: "1.75rem",
            fontWeight: 700,
            color: "var(--text-main)",
            marginBottom: "8px",
          }}
        >
          ABO
        </h2>
        <p style={{ fontSize: "1rem", color: "var(--text-secondary)", marginBottom: "4px" }}>
          Another Brain Odyssey
        </p>
        <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>Version 0.5.0 · Phase 5</p>
      </div>

      <Card title="关于" icon={<Info style={{ width: "18px", height: "18px" }} />}>
        <p
          style={{
            fontSize: "0.9375rem",
            color: "var(--text-secondary)",
            lineHeight: 1.8,
            textAlign: "center",
            padding: "8px 16px",
          }}
        >
          Obsidian 驱动的研究自动化伴侣。
          <br />
          本地优先，隐私保护，AI 赋能。
        </p>
      </Card>

      <Card title="技术栈" icon={<Zap style={{ width: "18px", height: "18px" }} />}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "10px",
            justifyContent: "center",
          }}
        >
          {techStack.map(({ name, version }) => (
            <div
              key={name}
              style={{
                padding: "10px 18px",
                borderRadius: "var(--radius-full)",
                background: "var(--bg-hover)",
                border: "1px solid var(--border-light)",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                {name}
              </span>
              <span
                style={{
                  fontSize: "0.75rem",
                  color: "var(--text-muted)",
                  padding: "2px 8px",
                  borderRadius: "var(--radius-full)",
                  background: "var(--bg-card)",
                }}
              >
                {version}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <div style={{ textAlign: "center", padding: "20px" }}>
        <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
          Built with ❤️ for researchers
        </p>
      </div>
    </div>
  );
}

function ActionButton({
  onClick,
  loading,
  loadingText,
  label,
  icon,
  variant = "primary",
  fullWidth = false,
}: {
  onClick: () => void;
  loading: boolean;
  loadingText: string;
  label: string;
  icon: React.ReactNode;
  variant?: "primary" | "danger";
  fullWidth?: boolean;
}) {
  const styles =
    variant === "danger"
      ? {
          border: "1px solid rgba(255, 100, 100, 0.3)",
          background: "rgba(255, 100, 100, 0.1)",
          color: "#E85D5D",
        }
      : {
          border: "none",
          background: "linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))",
          color: "white",
        };

  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "6px",
        padding: "8px 16px",
        borderRadius: "var(--radius-md)",
        fontSize: "0.8125rem",
        fontWeight: 600,
        cursor: loading ? "not-allowed" : "pointer",
        opacity: loading ? 0.7 : 1,
        transition: "all 0.2s ease",
        width: fullWidth ? "100%" : undefined,
        ...styles,
      }}
    >
      {loading ? (
        <Loader2 style={{ width: "14px", height: "14px", animation: "spin 1s linear infinite" }} />
      ) : (
        icon
      )}
      {loading ? loadingText : label}
    </button>
  );
}

const EMPTY_FEED_FLOW_SUMMARY: FeedFlowSummaryMap = {
  papers: [],
  bilibili: [],
  "bilibili-fixed-up": [],
  xiaohongshu: [],
  social: [],
  all: [],
};

function summarizeLabels(values: string[], emptyLabel: string): string {
  const normalized = values.map((value) => String(value || "").trim()).filter(Boolean);
  return normalized.length > 0 ? normalized.join("；") : emptyLabel;
}

function FeedFlowSummaryLines({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px", padding: "0 2px" }}>
      {lines.map((line) => (
        <div key={line} style={{ fontSize: "0.72rem", lineHeight: 1.55, color: "var(--text-muted)" }}>
          {line}
        </div>
      ))}
    </div>
  );
}

function DeveloperSection() {
  const [runningFeedFlow, setRunningFeedFlow] = useState<"papers" | "bilibili" | "bilibili-fixed-up" | "xiaohongshu" | "social" | "all" | null>(null);
  const [crawlRecords, setCrawlRecords] = useState<CrawlRecord[]>([]);
  const [crawlRecordTotal, setCrawlRecordTotal] = useState(0);
  const [loadingCrawlRecords, setLoadingCrawlRecords] = useState(false);
  const [feedFlowSummary, setFeedFlowSummary] = useState<FeedFlowSummaryMap>(EMPTY_FEED_FLOW_SUMMARY);
  const { addToast, setFeedCards, setUnreadCounts } = useStore();

  useEffect(() => {
    void loadCrawlRecords();
    void loadFeedFlowSummary();
  }, []);

  async function loadCrawlRecords() {
    setLoadingCrawlRecords(true);
    try {
      const r = await api.get<{ records: CrawlRecord[]; total: number }>("/api/crawl-records?limit=8");
      setCrawlRecords(r.records || []);
      setCrawlRecordTotal(r.total || 0);
    } catch {
      addToast({ kind: "error", title: "加载抓取元数据失败" });
    } finally {
      setLoadingCrawlRecords(false);
    }
  }

  async function syncFeedFrontendState() {
    const [cardsResult, unreadCountsResult] = await Promise.allSettled([
      api.get<{ cards: FeedCard[] }>(`/api/cards?unread_only=true&limit=${FEED_SYNC_LIMIT}`),
      api.get<Record<string, number>>("/api/cards/unread-counts"),
    ]);

    if (cardsResult.status === "fulfilled") {
      setFeedCards(cardsResult.value.cards || []);
    }
    if (unreadCountsResult.status === "fulfilled") {
      setUnreadCounts(unreadCountsResult.value || {});
    }
  }

  function scheduleFeedFrontendSync(delays: number[]) {
    delays.forEach((delayMs) => {
      window.setTimeout(() => {
        void loadCrawlRecords();
        void syncFeedFrontendState();
      }, delayMs);
    });
  }

  async function loadFeedFlowSummary() {
    try {
      const [arxivConfig, followupConfig, xhsConfig, bilibiliConfig] = await Promise.all([
        api.get<Record<string, unknown>>("/api/modules/arxiv-tracker/config"),
        api.get<Record<string, unknown>>("/api/modules/semantic-scholar-tracker/config"),
        api.get<Record<string, unknown>>("/api/modules/xiaohongshu-tracker/config"),
        api.get<Record<string, unknown>>("/api/modules/bilibili-tracker/config"),
      ]);

      const arxivMonitors = Array.isArray(arxivConfig.keyword_monitors)
        ? arxivConfig.keyword_monitors.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
        : [];
      const followupMonitors = Array.isArray(followupConfig.followup_monitors)
        ? followupConfig.followup_monitors.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
        : [];
      const xhsKeywordMonitors = Array.isArray(xhsConfig.keyword_monitors)
        ? xhsConfig.keyword_monitors.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && item.enabled !== false)
        : [];
      const xhsFollowingMonitors = Array.isArray(xhsConfig.following_scan_monitors)
        ? xhsConfig.following_scan_monitors.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && item.enabled !== false)
        : [];
      const xhsCreatorEnabled = Boolean(xhsConfig.creator_push_enabled);
      const xhsCreatorMonitors = Array.isArray(xhsConfig.creator_monitors)
        ? xhsConfig.creator_monitors.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && item.enabled !== false)
        : [];

      const biliDailyMonitors = Array.isArray(bilibiliConfig.daily_dynamic_monitors)
        ? bilibiliConfig.daily_dynamic_monitors.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && item.enabled !== false)
        : [];
      const biliGroupMonitors = Array.isArray(bilibiliConfig.followed_up_group_monitors)
        ? bilibiliConfig.followed_up_group_monitors.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && item.enabled !== false)
        : [];
      const biliFixedUps = Array.isArray(bilibiliConfig.up_uids)
        ? bilibiliConfig.up_uids.map((item) => String(item || "").trim()).filter(Boolean)
        : [];
      const biliCreatorProfiles = (
        bilibiliConfig.creator_profiles && typeof bilibiliConfig.creator_profiles === "object"
          ? bilibiliConfig.creator_profiles
          : {}
      ) as Record<string, Record<string, unknown>>;
      const biliFixedUpPreview = biliFixedUps
        .map((uid) => {
          const profile = biliCreatorProfiles[uid] || {};
          return String(profile.author || profile.author_id || uid || "").trim();
        })
        .filter(Boolean)
        .slice(0, 6);
      const biliFixedUpPreviewLabel = biliFixedUps.length > 0
        ? `${summarizeLabels(biliFixedUpPreview, "未命名固定 UP")}${biliFixedUps.length > biliFixedUpPreview.length ? " ..." : ""}`
        : "";

      const papersLines = [
        `arXiv 关键词监控 ${arxivMonitors.length} 条：${summarizeLabels(
          arxivMonitors.map((item) => String(item.label || item.query || "").trim()).filter(Boolean),
          "未配置",
        )}`,
        `Follow Up 监控 ${followupMonitors.length} 条：${summarizeLabels(
          followupMonitors.map((item) => String(item.label || item.query || "").trim()).filter(Boolean),
          "未配置",
        )}`,
      ];

      const xhsLines = [
        `关键词监控 ${xhsKeywordMonitors.length} 条：${summarizeLabels(
          xhsKeywordMonitors.map((item) => {
            const label = String(item.label || "").trim();
            const recentDays = Number(item.recent_days || 0);
            const limit = Number(item.per_keyword_limit || 0);
            return label ? `${label}（${recentDays || "?"}天 / ${limit || "?"}条）` : "";
          }).filter(Boolean),
          "未配置",
        )}`,
        `关注流监控 ${xhsFollowingMonitors.length} 条：${summarizeLabels(
          xhsFollowingMonitors.map((item) => {
            const label = String(item.label || "").trim();
            const recentDays = Number(item.recent_days || 0);
            const limit = Number(item.fetch_limit || 0);
            return label ? `${label}（${recentDays || "?"}天 / ${limit || "?"}条）` : "";
          }).filter(Boolean),
          "未配置",
        )}`,
        `固定博主 ${xhsCreatorEnabled ? xhsCreatorMonitors.length : 0} 条：${xhsCreatorEnabled
          ? summarizeLabels(
              xhsCreatorMonitors.map((item) => String(item.label || item.author || item.user_id || "").trim()).filter(Boolean).slice(0, 6),
              "已开启但当前没有有效定义",
            )
          : "当前总开关关闭，不会触发"}`,
      ];

      const biliFixedUpLines = [
        `固定 UP 监督 ${biliFixedUps.length} 个：${biliFixedUps.length > 0
          ? `${biliFixedUpPreviewLabel}（最近 ${Number(bilibiliConfig.fixed_up_days_back || 0) || 1} 天）`
          : "当前为空，不会触发"}`,
      ];

      const biliLines = [
        `常驻关键词监控 ${biliDailyMonitors.length} 条：${summarizeLabels(
          biliDailyMonitors.map((item) => {
            const label = String(item.label || "").trim();
            const daysBack = Number(item.days_back || 0);
            const limit = Number(item.limit || 0);
            return label ? `${label}（${daysBack || "?"}天 / ${limit || "?"}条）` : "";
          }).filter(Boolean),
          "未配置",
        )}`,
        `智能分组监控 ${biliGroupMonitors.length} 条：${summarizeLabels(
          biliGroupMonitors.map((item) => String(item.label || item.group_label || item.group_value || "").trim()).filter(Boolean),
          "当前为空，不会触发",
        )}`,
        ...biliFixedUpLines,
      ];

      setFeedFlowSummary({
        papers: papersLines,
        bilibili: biliLines,
        "bilibili-fixed-up": biliFixedUpLines,
        xiaohongshu: xhsLines,
        social: [
          "并行触发：小红书链路 + B站链路",
          ...xhsLines,
          ...biliLines,
        ],
        all: [
          "依次触发：论文链路 + 社媒并行链路",
          ...papersLines,
          ...xhsLines,
          ...biliLines,
        ],
      });
    } catch {
      setFeedFlowSummary(EMPTY_FEED_FLOW_SUMMARY);
    }
  }

  async function handleRunFeedFlow(scope: "papers" | "bilibili" | "bilibili-fixed-up" | "xiaohongshu" | "social" | "all") {
    setRunningFeedFlow(scope);
    try {
      const r = await api.post<DebugFeedFlowResponse>("/api/debug/feed-flow", { scope });
      if (Array.isArray(r.feed_cards)) {
        setFeedCards(r.feed_cards);
      }
      if (r.unread_counts && typeof r.unread_counts === "object") {
        setUnreadCounts(r.unread_counts);
      }
      const failed = r.results.filter((item) => item.status === "error" || item.status === "missing");
      const skipped = r.results.filter((item) => item.status === "skipped");
      const zeroOutput = r.results.filter((item) => item.status === "completed" && item.card_count === 0);
      const completedSummary = r.results
        .filter((item) => item.status === "completed")
        .map((item) => (
          typeof item.card_count === "number"
            ? `${item.name} ${item.card_count} 条`
            : item.name
        ))
        .join("；");

      if (failed.length === 0 && skipped.length === 0 && zeroOutput.length === 0) {
        addToast({
          kind: "success",
          title: "Feed 流测试已触发",
          message: completedSummary
            ? `已立即执行 ${r.completed}/${r.total} 个模块：${completedSummary}。`
            : `已立即执行 ${r.completed}/${r.total} 个模块，不需要等到 9 点调度。`,
        });
      } else {
        const messageParts = [
          completedSummary ? `已执行：${completedSummary}` : "",
          ...skipped.map((item) => item.message || `${item.name} 已跳过`),
          ...failed.map((item) => item.message ? `${item.name}：${item.message}` : item.name),
          ...zeroOutput
            .map((item) => item.message)
            .filter((message): message is string => Boolean(message)),
        ].filter(Boolean);

        addToast({
          kind: "info",
          title: "Feed 流测试部分完成",
          message: messageParts.join("；"),
        });
      }
      await loadCrawlRecords();
      if (!Array.isArray(r.feed_cards) || !r.unread_counts || typeof r.unread_counts !== "object") {
        await syncFeedFrontendState();
      }
    } catch (err) {
      const mayStillBeRunningInBackground = scope === "bilibili" || scope === "bilibili-fixed-up" || scope === "social" || scope === "all";
      if (mayStillBeRunningInBackground) {
        addToast({
          kind: "info",
          title: "Feed 流已提交",
          message: "B站链路耗时较长时，前端请求可能先断开；后台通常还会继续爬取。先不要重复触发，稍后看抓取记录或情报列表。",
        });
        scheduleFeedFrontendSync([8000, 18000, 30000]);
      } else {
        addToast({
          kind: "error",
          title: "触发 Feed 流测试失败",
          message: err instanceof Error ? err.message : "未知错误",
        });
      }
    } finally {
      setRunningFeedFlow(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <Card title="Feed 流测试" icon={<Layers style={{ width: "18px", height: "18px" }} />}>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <SettingItem
            icon={<Zap style={{ width: "20px", height: "20px" }} />}
            title="立即触发抓取"
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                width: "min(100%, 280px)",
                marginLeft: 0,
                alignSelf: "flex-start",
              }}
            >
              <ActionButton
                onClick={() => void handleRunFeedFlow("papers")}
                loading={runningFeedFlow === "papers"}
                loadingText="论文链路执行中..."
                label="论文链路"
                icon={<Layers style={{ width: "14px", height: "14px" }} />}
                fullWidth
              />
              <FeedFlowSummaryLines lines={feedFlowSummary.papers} />

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  padding: "10px",
                  borderRadius: "10px",
                  border: "1px solid var(--border-light)",
                  background: "var(--bg-hover)",
                }}
              >
                <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-main)" }}>
                  社媒链路
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <ActionButton
                    onClick={() => void handleRunFeedFlow("bilibili")}
                    loading={runningFeedFlow === "bilibili"}
                    loadingText="B站链路执行中..."
                    label="B站链路"
                    icon={<Tv style={{ width: "14px", height: "14px" }} />}
                    fullWidth
                  />
                  <FeedFlowSummaryLines lines={feedFlowSummary.bilibili} />
                  <ActionButton
                    onClick={() => void handleRunFeedFlow("bilibili-fixed-up")}
                    loading={runningFeedFlow === "bilibili-fixed-up"}
                    loadingText="固定 UP 执行中..."
                    label="B站固定 UP"
                    icon={<User style={{ width: "14px", height: "14px" }} />}
                    fullWidth
                  />
                  <FeedFlowSummaryLines lines={feedFlowSummary["bilibili-fixed-up"]} />
                  <ActionButton
                    onClick={() => void handleRunFeedFlow("xiaohongshu")}
                    loading={runningFeedFlow === "xiaohongshu"}
                    loadingText="小红书链路执行中..."
                    label="小红书链路"
                    icon={<ShoppingBag style={{ width: "14px", height: "14px" }} />}
                    fullWidth
                  />
                  <FeedFlowSummaryLines lines={feedFlowSummary.xiaohongshu} />
                  <ActionButton
                    onClick={() => void handleRunFeedFlow("social")}
                    loading={runningFeedFlow === "social"}
                    loadingText="社媒并行链路执行中..."
                    label="社媒并行"
                    icon={<Sparkles style={{ width: "14px", height: "14px" }} />}
                    fullWidth
                  />
                  <FeedFlowSummaryLines lines={feedFlowSummary.social} />
                </div>
              </div>

              <ActionButton
                onClick={() => void handleRunFeedFlow("all")}
                loading={runningFeedFlow === "all"}
                loadingText="全量链路执行中..."
                label="全量 Feed"
                icon={<Zap style={{ width: "14px", height: "14px" }} />}
                fullWidth
              />
              <FeedFlowSummaryLines lines={feedFlowSummary.all} />
            </div>
          </SettingItem>
        </div>
      </Card>

      <Card title="抓取元数据账本" icon={<Database style={{ width: "18px", height: "18px" }} />}>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
              本地常驻保存所有进入 Feed 的真实抓取结果元数据，重启后仍然保留。当前共
              <span style={{ color: "var(--text-main)", fontWeight: 700, margin: "0 4px" }}>{crawlRecordTotal}</span>
              条。
            </div>
            <ActionButton
              onClick={() => void loadCrawlRecords()}
              loading={loadingCrawlRecords}
              loadingText="刷新中..."
              label="刷新账本"
              icon={<RefreshCw style={{ width: "14px", height: "14px" }} />}
            />
          </div>

          {crawlRecords.length === 0 ? (
            <div
              style={{
                padding: "14px",
                borderRadius: "8px",
                border: "1px dashed var(--border-light)",
                color: "var(--text-muted)",
                fontSize: "0.875rem",
              }}
            >
              还没有持久化的抓取记录。跑一次论文链路或社媒链路后，这里会立即出现。
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {crawlRecords.map((record) => (
                <div
                  key={record.record_key}
                  style={{
                    padding: "12px 14px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-light)",
                    background: "var(--bg-card)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                    <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-main)" }}>
                      {record.title}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      最近抓取 {new Date(record.last_seen_at * 1000).toLocaleString("zh-CN", { hour12: false })}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    <span style={{ fontSize: "0.75rem", color: "var(--color-primary)", fontWeight: 700 }}>
                      {record.module_id}
                    </span>
                    {record.crawl_source && (
                      <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                        来源: {record.crawl_source}
                      </span>
                    )}
                    {record.author && (
                      <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                        作者: {record.author}
                      </span>
                    )}
                    <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                      命中 {record.seen_count} 次
                    </span>
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
                    content_id: {record.content_id}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

  const tabs = [
    { id: "general" as const, label: "通用", icon: <SettingsIcon style={{ width: "20px", height: "20px" }} /> },
    { id: "developer" as const, label: "开发调试", icon: <Bug style={{ width: "20px", height: "20px" }} /> },
    { id: "about" as const, label: "关于", icon: <Info style={{ width: "20px", height: "20px" }} /> },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="设置"
        subtitle="自定义你的 ABO 体验"
        icon={SettingsIcon}
      />
      <PageContent maxWidth="1200px">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "180px 1fr",
            gap: "48px",
            height: "100%",
          }}
        >
          {/* Sidebar Tabs */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              height: "fit-content",
            }}
          >
            {tabs.map(({ id, label, icon }) => (
              <TabButton
                key={id}
                active={activeTab === id}
                onClick={() => setActiveTab(id)}
                icon={icon}
                label={label}
              />
            ))}
          </div>

          {/* Content Area */}
          <div style={{ minWidth: 0 }}>
            {activeTab === "general" && <GeneralSection />}
            {activeTab === "developer" && <DeveloperSection />}
            {activeTab === "about" && <AboutSection />}
          </div>
        </div>
      </PageContent>
    </PageContainer>
  );
}
