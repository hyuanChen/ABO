import { useEffect, useState } from "react";
import {
  Settings,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Video,
  ShoppingBag,
  Headphones,
  HelpCircle,
  FileText,
  Rss,
  Check,
  Cookie,
  Loader2,
  Globe,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { api } from "../../../core/api";
import { useStore } from "../../../core/store";
import {
  bilibiliGetConfig,
  bilibiliGetCookieFromBrowser,
  bilibiliVerifySessdata,
} from "../../../api/bilibili";
import {
  xiaohongshuGetConfig,
  xiaohongshuGetCookieFromBrowser,
  xiaohongshuVerifyCookie,
} from "../../../api/xiaohongshu";

interface QuickConfigStepProps {
  onNext: () => void;
  onBack: () => void;
}

interface ModuleConfig {
  id: string;
  name: string;
  icon: React.ReactNode;
  enabled: boolean;
  keywords: string[];
  requiresCookie: boolean;
  description: string;
}

type CookiePlatform = "bilibili" | "xiaohongshu";

interface CookieSetupState {
  configured: boolean;
  verified: boolean;
  loading: boolean;
  testing: boolean;
  expanded: boolean;
  preview: string | null;
  source?: string;
  message?: string;
  error?: string;
}

const DEFAULT_KEYWORDS: Record<string, string[]> = {
  "arxiv-tracker": ["machine learning", "artificial intelligence", "neural networks"],
  "bilibili-tracker": ["机器学习", "AI技术", "编程教程"],
  "xiaohongshu-tracker": ["数码评测", "学习笔记", "效率工具"],
  "xiaoyuzhou-tracker": ["科技播客", "商业思维", "个人成长"],
  "zhihu-tracker": ["人工智能", "深度学习", "科研方法"],
  "semantic-scholar-tracker": ["computer vision", "NLP", "reinforcement learning"],
  "folder-monitor": ["research", "notes", "ideas"],
};

export default function QuickConfigStep({ onNext, onBack }: QuickConfigStepProps) {
  const { addToast } = useStore();
  const [isSaving, setIsSaving] = useState(false);
  const [showCookieHint, setShowCookieHint] = useState(false);
  const [cookieSetup, setCookieSetup] = useState<Record<CookiePlatform, CookieSetupState>>({
    bilibili: {
      configured: false,
      verified: false,
      loading: false,
      testing: false,
      expanded: true,
      preview: null,
      message: "一键读取浏览器 Cookie 后，会自动检测 SESSDATA 是否可用。",
    },
    xiaohongshu: {
      configured: false,
      verified: false,
      loading: false,
      testing: false,
      expanded: true,
      preview: null,
      message: "一键读取浏览器 Cookie 后，会自动检测 web_session 是否可用。",
    },
  });

  const [modules, setModules] = useState<ModuleConfig[]>([
    {
      id: "arxiv-tracker",
      name: "ArXiv 追踪器",
      icon: <BookOpen style={{ width: "20px", height: "20px" }} />,
      enabled: true,
      keywords: DEFAULT_KEYWORDS["arxiv-tracker"],
      requiresCookie: false,
      description: "追踪最新学术论文",
    },
    {
      id: "semantic-scholar-tracker",
      name: "Semantic Scholar",
      icon: <FileText style={{ width: "20px", height: "20px" }} />,
      enabled: true,
      keywords: DEFAULT_KEYWORDS["semantic-scholar-tracker"],
      requiresCookie: false,
      description: "学术搜索引擎",
    },
    {
      id: "bilibili-tracker",
      name: "B站追踪器",
      icon: <Video style={{ width: "20px", height: "20px" }} />,
      enabled: true,
      keywords: DEFAULT_KEYWORDS["bilibili-tracker"],
      requiresCookie: true,
      description: "技术视频和教程",
    },
    {
      id: "xiaohongshu-tracker",
      name: "小红书追踪器",
      icon: <ShoppingBag style={{ width: "20px", height: "20px" }} />,
      enabled: true,
      keywords: DEFAULT_KEYWORDS["xiaohongshu-tracker"],
      requiresCookie: true,
      description: "学习笔记和评测",
    },
    {
      id: "xiaoyuzhou-tracker",
      name: "小宇宙追踪器",
      icon: <Headphones style={{ width: "20px", height: "20px" }} />,
      enabled: false,
      keywords: DEFAULT_KEYWORDS["xiaoyuzhou-tracker"],
      requiresCookie: false,
      description: "播客内容追踪",
    },
    {
      id: "zhihu-tracker",
      name: "知乎追踪器",
      icon: <HelpCircle style={{ width: "20px", height: "20px" }} />,
      enabled: true,
      keywords: DEFAULT_KEYWORDS["zhihu-tracker"],
      requiresCookie: true,
      description: "问答和深度文章",
    },
    {
      id: "folder-monitor",
      name: "文件夹监控",
      icon: <Rss style={{ width: "20px", height: "20px" }} />,
      enabled: true,
      keywords: DEFAULT_KEYWORDS["folder-monitor"],
      requiresCookie: false,
      description: "监控本地文件变化",
    },
  ]);

  const toggleModule = (id: string) => {
    setModules((prev) =>
      prev.map((m) => (m.id === id ? { ...m, enabled: !m.enabled } : m))
    );
  };

  const updateKeywords = (id: string, keywordsStr: string) => {
    const keywords = keywordsStr
      .split(",")
      .map((k) => k.trim())
      .filter((k) => k);
    setModules((prev) =>
      prev.map((m) => (m.id === id ? { ...m, keywords } : m))
    );
  };

  useEffect(() => {
    void loadCookieStatus();
  }, []);

  const setCookiePlatformState = (
    platform: CookiePlatform,
    updater: (current: CookieSetupState) => CookieSetupState
  ) => {
    setCookieSetup((prev) => ({
      ...prev,
      [platform]: updater(prev[platform]),
    }));
  };

  const extractCookieValue = (cookieText: string | undefined, name: string): string | null => {
    if (!cookieText?.trim()) return null;

    try {
      if (cookieText.startsWith("[") || cookieText.startsWith("{")) {
        const parsed = JSON.parse(cookieText);
        if (Array.isArray(parsed)) {
          const matched = parsed.find((item: any) => item?.name === name);
          if (matched?.value) return String(matched.value);
        }
      }
    } catch (error) {
      console.error(`Failed to parse cookie JSON for ${name}:`, error);
    }

    const match = cookieText.match(new RegExp(`${name}=([^;\\s]+)`));
    return match ? match[1] : null;
  };

  const loadCookieStatus = async () => {
    try {
      const [bilibiliConfig, xiaohongshuConfig] = await Promise.all([
        bilibiliGetConfig(),
        xiaohongshuGetConfig(),
      ]);

      setCookieSetup((prev) => ({
        ...prev,
        bilibili: {
          ...prev.bilibili,
          configured: bilibiliConfig.cookie_configured,
          preview: bilibiliConfig.cookie_preview,
          message: bilibiliConfig.cookie_configured
            ? "已检测到已保存的浏览器 Cookie，可以直接重新测试。"
            : prev.bilibili.message,
        },
        xiaohongshu: {
          ...prev.xiaohongshu,
          configured: xiaohongshuConfig.cookie_configured,
          preview: xiaohongshuConfig.cookie_preview,
          message: xiaohongshuConfig.cookie_configured
            ? "已检测到已保存的浏览器 Cookie，可以直接重新测试。"
            : prev.xiaohongshu.message,
        },
      }));
    } catch (error) {
      console.error("Failed to load onboarding cookie status:", error);
    }
  };

  const handleBilibiliCookieFetch = async () => {
    setCookiePlatformState("bilibili", (current) => ({
      ...current,
      loading: true,
      testing: false,
      error: undefined,
      message: "正在从浏览器读取 B 站 Cookie...",
    }));

    try {
      const result = await bilibiliGetCookieFromBrowser();
      if (!result.success) {
        throw new Error(result.error || "未找到哔哩哔哩 Cookie");
      }

      const sessdata = extractCookieValue(result.cookie, "SESSDATA");
      if (!sessdata) {
        throw new Error("已获取 Cookie，但没有解析到 SESSDATA");
      }

      setCookiePlatformState("bilibili", (current) => ({
        ...current,
        configured: true,
        preview: result.cookie_preview || result.cookie || current.preview,
        source: "浏览器",
        loading: false,
        testing: true,
        message: "Cookie 已读取，正在验证登录态...",
      }));

      const verify = await bilibiliVerifySessdata({ sessdata });

      setCookiePlatformState("bilibili", (current) => ({
        ...current,
        verified: verify.valid,
        configured: true,
        loading: false,
        testing: false,
        error: verify.valid ? undefined : verify.message,
        message: verify.valid ? "测试通过，可以直接用于引导后的模块配置。" : verify.message,
      }));

      if (verify.valid) {
        addToast({
          kind: "success",
          title: "B 站 Cookie 可用",
          message: verify.message,
        });
      } else {
        addToast({
          kind: "info",
          title: "B 站 Cookie 校验失败",
          message: verify.message,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "获取浏览器 Cookie 失败";
      setCookiePlatformState("bilibili", (current) => ({
        ...current,
        loading: false,
        testing: false,
        verified: false,
        error: message,
        message,
      }));
      addToast({
        kind: "error",
        title: "B 站一键获取失败",
        message,
      });
    }
  };

  const handleXiaohongshuCookieFetch = async () => {
    setCookiePlatformState("xiaohongshu", (current) => ({
      ...current,
      loading: true,
      testing: false,
      error: undefined,
      message: "正在从浏览器读取小红书 Cookie...",
    }));

    try {
      const result = await xiaohongshuGetCookieFromBrowser();
      if (!result.success) {
        throw new Error(result.error || "未找到小红书 Cookie");
      }

      const webSession = result.web_session || extractCookieValue(result.cookie, "web_session");
      const idToken = result.id_token || extractCookieValue(result.cookie, "id_token") || undefined;

      if (!webSession) {
        throw new Error("已获取 Cookie，但没有解析到 web_session");
      }

      setCookiePlatformState("xiaohongshu", (current) => ({
        ...current,
        configured: true,
        preview: result.cookie_preview || result.cookie || current.preview,
        source: result.source,
        loading: false,
        testing: true,
        message: "Cookie 已读取，正在验证登录态...",
      }));

      const verify = await xiaohongshuVerifyCookie({
        web_session: webSession,
        id_token: idToken,
      });

      setCookiePlatformState("xiaohongshu", (current) => ({
        ...current,
        verified: verify.valid,
        configured: true,
        loading: false,
        testing: false,
        error: verify.valid ? undefined : verify.message,
        message: verify.valid ? "测试通过，可以直接用于搜索和入库。" : verify.message,
      }));

      if (verify.valid) {
        addToast({
          kind: "success",
          title: "小红书 Cookie 可用",
          message: verify.message,
        });
      } else {
        addToast({
          kind: "info",
          title: "小红书 Cookie 校验失败",
          message: verify.message,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "获取浏览器 Cookie 失败";
      setCookiePlatformState("xiaohongshu", (current) => ({
        ...current,
        loading: false,
        testing: false,
        verified: false,
        error: message,
        message,
      }));
      addToast({
        kind: "error",
        title: "小红书一键获取失败",
        message,
      });
    }
  };

  const handleContinue = async () => {
    setIsSaving(true);
    try {
      // Save module configurations — use allSettled so partial failures don't block progress
      const enabledModules = modules.filter((m) => m.enabled);

      const results = await Promise.allSettled(
        enabledModules.map((module) =>
          api.post(`/api/modules/${module.id}/config`, {
            keywords: module.keywords,
            enabled: module.enabled,
          })
        )
      );

      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) {
        addToast({
          kind: "info",
          title: "部分配置保存失败",
          message: `${enabledModules.length - failed}/${enabledModules.length} 个模块保存成功，可稍后在模块管理中重新配置`,
        });
      } else {
        addToast({
          kind: "success",
          title: "配置已保存",
          message: `已启用 ${enabledModules.length} 个模块`,
        });
      }

      // Always proceed to next step
      onNext();
    } catch (error) {
      console.error("Failed to save config:", error);
      // Even on unexpected error, still proceed
      onNext();
    } finally {
      setIsSaving(false);
    }
  };

  const enabledCount = modules.filter((m) => m.enabled).length;
  const cookieRequiredCount = modules.filter((m) => m.enabled && m.requiresCookie).length;
  const showCookieSetup = modules.some(
    (module) =>
      module.enabled && (module.id === "bilibili-tracker" || module.id === "xiaohongshu-tracker")
  );

  const renderCookieSetupCard = (
    platform: CookiePlatform,
    title: string,
    description: string,
    onFetch: () => Promise<void>
  ) => {
    const state = cookieSetup[platform];
    const isBusy = state.loading || state.testing;
    const statusText = isBusy
      ? state.testing
        ? "测试中"
        : "获取中"
      : state.verified
        ? "测试通过"
        : state.configured
          ? "已获取，待测试"
          : "未配置";

    const statusColor = isBusy
      ? "#D48984"
      : state.verified
        ? "#22c55e"
        : state.configured
          ? "#E89B96"
          : "var(--text-muted)";

    return (
      <div
        style={{
          padding: "16px",
          borderRadius: "var(--radius-lg)",
          background: "var(--bg-card)",
          border: "1px solid var(--border-light)",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
          <div>
            <div style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-main)" }}>{title}</div>
            <div style={{ marginTop: "4px", fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
              {description}
            </div>
          </div>

          <span
            style={{
              padding: "4px 10px",
              borderRadius: "999px",
              background: `${statusColor}18`,
              color: statusColor,
              fontSize: "0.75rem",
              fontWeight: 700,
              whiteSpace: "nowrap",
            }}
          >
            {statusText}
          </span>
        </div>

        <div
          style={{
            padding: "12px",
            borderRadius: "var(--radius-md)",
            background: state.verified ? "rgba(34, 197, 94, 0.08)" : "var(--bg-hover)",
            border: `1px solid ${state.verified ? "rgba(34, 197, 94, 0.2)" : "var(--border-light)"}`,
            color: state.verified ? "#22c55e" : "var(--text-secondary)",
            fontSize: "0.8125rem",
            lineHeight: 1.6,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {state.verified ? (
              <CheckCircle2 style={{ width: "16px", height: "16px", color: "#22c55e" }} />
            ) : (
              <AlertCircle style={{ width: "16px", height: "16px", color: statusColor }} />
            )}
            <span>{state.message}</span>
          </div>
          {state.source && <div style={{ marginTop: "6px", color: "var(--text-muted)" }}>来源：{state.source}</div>}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
          <button
            onClick={() => void onFetch()}
            disabled={isBusy}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              padding: "10px 16px",
              borderRadius: "var(--radius-md)",
              border: "none",
              background: isBusy ? "var(--bg-muted)" : "var(--color-primary)",
              color: "white",
              fontSize: "0.875rem",
              fontWeight: 700,
              cursor: isBusy ? "not-allowed" : "pointer",
            }}
          >
            {isBusy ? (
              <>
                <Loader2 style={{ width: "16px", height: "16px", animation: "spin 1s linear infinite" }} />
                {state.testing ? "测试中..." : "获取中..."}
              </>
            ) : (
              <>
                <Globe style={{ width: "16px", height: "16px" }} />
                一键获取并测试
              </>
            )}
          </button>

          <button
            onClick={() =>
              setCookiePlatformState(platform, (current) => ({
                ...current,
                expanded: !current.expanded,
              }))
            }
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "10px 14px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-light)",
              background: "var(--bg-app)",
              color: "var(--text-secondary)",
              fontSize: "0.8125rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {state.expanded ? <ChevronUp style={{ width: "14px", height: "14px" }} /> : <ChevronDown style={{ width: "14px", height: "14px" }} />}
            {state.expanded ? "收起详情" : "查看详情"}
          </button>
        </div>

        {state.expanded && (
          <div
            style={{
              padding: "12px",
              borderRadius: "var(--radius-md)",
              background: "var(--bg-hover)",
              border: "1px dashed var(--border-light)",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.7 }}>
              会直接复用当前工具页的 Cookie 获取方式，并写入 ABO 全局配置。
            </div>
            {state.preview ? (
              <textarea
                readOnly
                value={state.preview}
                style={{
                  width: "100%",
                  minHeight: "92px",
                  resize: "vertical",
                  padding: "10px 12px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-light)",
                  background: "var(--bg-app)",
                  color: "var(--text-secondary)",
                  fontFamily: "monospace",
                  fontSize: "0.75rem",
                  lineHeight: 1.55,
                }}
              />
            ) : (
              <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                还没有读取到 Cookie。先确认浏览器已经登录对应站点。
              </div>
            )}
            {state.error && (
              <div style={{ fontSize: "0.8125rem", color: "#ef4444", lineHeight: 1.6 }}>{state.error}</div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100%",
        padding: "48px 32px",
        maxWidth: "800px",
        margin: "0 auto",
      }}
    >
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "32px" }}>
        <div
          style={{
            width: "72px",
            height: "72px",
            borderRadius: "var(--radius-xl)",
            background: "linear-gradient(135deg, #BCA4E3, #9D7BDB)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 20px",
            boxShadow: "0 8px 32px rgba(188, 164, 227, 0.4)",
          }}
        >
          <Settings style={{ width: "36px", height: "36px", color: "white" }} />
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
          快速配置
        </h2>

        <p
          style={{
            fontSize: "0.9375rem",
            color: "var(--text-secondary)",
            lineHeight: 1.6,
          }}
        >
          选择要启用的模块并配置关键词
          <br />
          已启用 {enabledCount} 个模块，其中 {cookieRequiredCount} 个需要 Cookie
        </p>
      </div>

      {/* Cookie Setup */}
      <div
        style={{
          padding: "16px 20px",
          borderRadius: "var(--radius-lg)",
          background: "rgba(255, 183, 178, 0.08)",
          border: "1px solid rgba(255, 183, 178, 0.2)",
          marginBottom: "24px",
        }}
      >
        <button
          onClick={() => setShowCookieHint(!showCookieHint)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            width: "100%",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <Cookie style={{ width: "20px", height: "20px", color: "#E89B96" }} />
          <span style={{ flex: 1, fontSize: "0.9375rem", color: "var(--text-main)", fontWeight: 600 }}>
            关于 Cookie 配置
          </span>
          <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
            {showCookieHint ? "收起" : "展开"}
          </span>
        </button>

        {showCookieHint && (
          <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid rgba(255, 183, 178, 0.2)" }}>
            <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: "12px" }}>
              引导里已经接入当前工具页的一键获取逻辑。B 站和小红书会在获取后立刻测试；知乎仍然可以稍后到模块管理页手动配置。
            </p>
            {showCookieSetup && (
              <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
                {modules.some((module) => module.enabled && module.id === "bilibili-tracker") &&
                  renderCookieSetupCard(
                    "bilibili",
                    "哔哩哔哩 Cookie",
                    "读取浏览器登录态，自动验证 SESSDATA，并保存到引导后的模块环境。",
                    handleBilibiliCookieFetch
                  )}
                {modules.some((module) => module.enabled && module.id === "xiaohongshu-tracker") &&
                  renderCookieSetupCard(
                    "xiaohongshu",
                    "小红书 Cookie",
                    "读取浏览器登录态，自动验证 web_session，并保存到后续搜索和入库流程。",
                    handleXiaohongshuCookieFetch
                  )}
              </div>
            )}

            {!showCookieSetup && (
              <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                只有启用 B 站或小红书模块时，才会显示对应的一键获取入口。
              </div>
            )}
          </div>
        )}
      </div>

      {/* Module List */}
      <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "32px" }}>
        {modules.map((module) => (
          <div
            key={module.id}
            style={{
              padding: "20px",
              borderRadius: "var(--radius-lg)",
              background: module.enabled ? "var(--bg-card)" : "var(--bg-hover)",
              border: `1px solid ${module.enabled ? "var(--color-primary-light)" : "var(--border-light)"}`,
              opacity: module.enabled ? 1 : 0.7,
              transition: "all 0.3s ease",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: module.enabled ? "16px" : 0 }}>
              {/* Toggle */}
              <button
                onClick={() => toggleModule(module.id)}
                style={{
                  width: "48px",
                  height: "26px",
                  borderRadius: "var(--radius-full)",
                  background: module.enabled
                    ? "linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))"
                    : "var(--bg-hover)",
                  border: "none",
                  cursor: "pointer",
                  transition: "all 0.3s ease",
                  position: "relative",
                  boxShadow: module.enabled ? "0 2px 8px rgba(188, 164, 227, 0.4)" : "inset 0 2px 4px rgba(0,0,0,0.1)",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: "3px",
                    left: module.enabled ? "25px" : "3px",
                    width: "20px",
                    height: "20px",
                    borderRadius: "50%",
                    background: "white",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
                    transition: "left 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
                  }}
                />
              </button>

              {/* Icon */}
              <div
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "var(--radius-md)",
                  background: module.enabled
                    ? "linear-gradient(135deg, var(--color-primary-light), var(--color-primary))"
                    : "var(--bg-hover)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: module.enabled ? "white" : "var(--text-muted)",
                }}
              >
                {module.icon}
              </div>

              {/* Info */}
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                  <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-main)" }}>
                    {module.name}
                  </h3>
                  {module.requiresCookie && (
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: "var(--radius-sm)",
                        background: "rgba(255, 183, 178, 0.2)",
                        fontSize: "0.6875rem",
                        color: "#D48984",
                        fontWeight: 600,
                      }}
                    >
                      Cookie
                    </span>
                  )}
                </div>
                <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>{module.description}</p>
              </div>

              {/* Status */}
              {module.enabled && (
                <Check style={{ width: "20px", height: "20px", color: "#22c55e" }} />
              )}
            </div>

            {/* Keywords Input */}
            {module.enabled && (
              <div style={{ marginLeft: "64px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.8125rem",
                    color: "var(--text-secondary)",
                    marginBottom: "8px",
                    fontWeight: 500,
                  }}
                >
                  关键词（用逗号分隔）
                </label>
                <input
                  type="text"
                  value={module.keywords.join(", ")}
                  onChange={(e) => updateKeywords(module.id, e.target.value)}
                  placeholder="输入关键词..."
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-light)",
                    background: "var(--bg-app)",
                    color: "var(--text-main)",
                    fontSize: "0.875rem",
                    transition: "all 0.2s ease",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "var(--color-primary)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "var(--border-light)";
                  }}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Navigation */}
      <div style={{ display: "flex", gap: "16px", justifyContent: "center", marginTop: "auto" }}>
        <button
          onClick={onBack}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "14px 28px",
            borderRadius: "var(--radius-full)",
            background: "var(--bg-hover)",
            border: "1px solid var(--border-light)",
            color: "var(--text-secondary)",
            fontSize: "0.9375rem",
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 0.3s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--bg-card)";
            e.currentTarget.style.borderColor = "var(--color-primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "var(--bg-hover)";
            e.currentTarget.style.borderColor = "var(--border-light)";
          }}
        >
          <ArrowLeft style={{ width: "18px", height: "18px" }} />
          返回
        </button>

        <button
          onClick={handleContinue}
          disabled={isSaving || enabledCount === 0}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "14px 32px",
            borderRadius: "var(--radius-full)",
            background: "linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))",
            border: "none",
            color: "white",
            fontSize: "0.9375rem",
            fontWeight: 700,
            cursor: isSaving || enabledCount === 0 ? "not-allowed" : "pointer",
            opacity: isSaving || enabledCount === 0 ? 0.6 : 1,
            transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
            boxShadow: "0 4px 16px rgba(188, 164, 227, 0.3)",
          }}
          onMouseEnter={(e) => {
            if (!isSaving && enabledCount > 0) {
              e.currentTarget.style.transform = "translateY(-2px) scale(1.02)";
              e.currentTarget.style.boxShadow = "0 6px 24px rgba(188, 164, 227, 0.4)";
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0) scale(1)";
            e.currentTarget.style.boxShadow = "0 4px 16px rgba(188, 164, 227, 0.3)";
          }}
        >
          {isSaving ? (
            <>
              <Loader2 style={{ width: "18px", height: "18px", animation: "spin 1s linear infinite" }} />
              保存中...
            </>
          ) : (
            <>
              继续
              <ArrowRight style={{ width: "18px", height: "18px" }} />
            </>
          )}
        </button>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
