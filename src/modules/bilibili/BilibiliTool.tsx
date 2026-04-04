import { useState, useEffect } from "react";
import {
  Tv,
  Search,
  Filter,
  Clock,
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
  Globe,
} from "lucide-react";
import { PageContainer, PageHeader, PageContent, Card, EmptyState, LoadingState } from "../../components/Layout";
import { useToast } from "../../components/Toast";
import { CookieGuide } from "../../components/ConfigHelp";
import {
  BiliDynamic,
  bilibiliFetchFollowed,
  bilibiliVerifySessdata,
  bilibiliGetConfig,
  bilibiliSaveConfig,
  bilibiliGetCookieFromBrowser,
  bilibiliDebugTest,
  DebugTestResult,
} from "../../api/bilibili";

const DYNAMIC_TYPE_MAP: Record<string, { label: string; icon: typeof Play; color: string }> = {
  video: { label: "视频", icon: Play, color: "#00AEEC" },
  image: { label: "图文", icon: ImageIcon, color: "#FB7299" },
  text: { label: "文字", icon: MessageSquare, color: "#FF7F50" },
  article: { label: "专栏", icon: FileText, color: "#52C41A" },
};

const PRESET_KEYWORDS = [
  "AI",
  "人工智能",
  "AIGC",
  "ChatGPT",
  "大模型",
  "科技",
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

export function BilibiliTool() {
  const toast = useToast();

  // Cookie configuration state
  const [cookieConfigured, setCookieConfigured] = useState(false);
  const [cookiePreview, setCookiePreview] = useState<string | null>(null);
  const [cookieInput, setCookieInput] = useState("");
  const [gettingFromBrowser, setGettingFromBrowser] = useState(false);

  // SESSDATA state (extracted from cookie)
  const [sessdata, setSessdata] = useState(() => localStorage.getItem("bilibili_sessdata") || "");
  const [sessdataVerified, setSessdataVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);

  // Filter state
  const [keywords, setKeywords] = useState<string[]>(() => {
    const saved = localStorage.getItem("bilibili_keywords");
    return saved ? JSON.parse(saved) : [];
  });
  const [keywordInput, setKeywordInput] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<string[]>(["video", "image", "text", "article"]);
  const [daysBack, setDaysBack] = useState(7);
  const [limit, setLimit] = useState(50);

  // Results state
  const [dynamics, setDynamics] = useState<BiliDynamic[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalFound, setTotalFound] = useState(0);

  // Debug state
  const [debugResult, setDebugResult] = useState<DebugTestResult | null>(null);
  const [debugLoading, setDebugLoading] = useState(false);

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

  async function handleSaveCookie() {
    if (!cookieInput.trim()) {
      toast.error("请输入 Cookie");
      return;
    }

    try {
      // Try to extract and set SESSDATA
      const extractedSessdata = extractSessdataFromCookie(cookieInput.trim());
      if (extractedSessdata) {
        setSessdata(extractedSessdata);
        // Also save to localStorage for backward compatibility
        localStorage.setItem("bilibili_sessdata", extractedSessdata);
      }

      const res = await bilibiliSaveConfig({ cookie: cookieInput.trim() });
      if (res.success) {
        setCookieConfigured(true);
        setCookiePreview(res.cookie_preview);
        toast.success("Cookie 保存成功");
      }
    } catch (err) {
      toast.error("保存失败", err instanceof Error ? err.message : "未知错误");
    }
  }

  async function handleGetFromBrowser() {
    setGettingFromBrowser(true);
    try {
      const res = await bilibiliGetCookieFromBrowser();
      if (res.success && res.cookie_preview) {
        setCookieInput(res.cookie_preview.replace("...", ""));
        setCookieConfigured(true);
        setCookiePreview(res.cookie_preview);

        // Extract and set SESSDATA
        const extractedSessdata = extractSessdataFromCookie(res.cookie_preview.replace("...", ""));
        if (extractedSessdata) {
          setSessdata(extractedSessdata);
          localStorage.setItem("bilibili_sessdata", extractedSessdata);
        }

        toast.success("从浏览器获取 Cookie 成功", res.message || `获取到 ${res.cookie_count} 个 Cookie`);
      } else {
        toast.error("获取失败", res.error || "未找到 Cookie");
      }
    } catch (err) {
      toast.error("获取失败", err instanceof Error ? err.message : "未知错误");
    } finally {
      setGettingFromBrowser(false);
    }
  }

  function applyCookieToSessdata() {
    const extracted = extractSessdataFromCookie(cookieInput);
    if (extracted) {
      setSessdata(extracted);
      localStorage.setItem("bilibili_sessdata", extracted);
      toast.success("已提取 SESSDATA");
    } else {
      toast.error("无法从输入中提取 SESSDATA");
    }
  }

  const handleVerifySessdata = async () => {
    if (!sessdata.trim()) {
      toast.error("请输入 SESSDATA");
      return;
    }
    setVerifying(true);
    try {
      const res = await bilibiliVerifySessdata({ sessdata: sessdata.trim() });
      if (res.valid) {
        setSessdataVerified(true);
        toast.success("SESSDATA 验证成功", res.message);
      } else {
        setSessdataVerified(false);
        toast.error("SESSDATA 验证失败", res.message);
      }
    } catch (err) {
      setSessdataVerified(false);
      toast.error("验证失败", err instanceof Error ? err.message : "未知错误");
    } finally {
      setVerifying(false);
    }
  };

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
      if (selectedTypes.length > 1) {
        setSelectedTypes(selectedTypes.filter((t) => t !== type));
      }
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

  const handleFetch = async () => {
    if (!sessdata.trim()) {
      toast.error("请先输入 SESSDATA");
      return;
    }
    setLoading(true);
    try {
      const dynamicTypes = selectedTypes.map(getDynamicTypeNumber);
      const res = await bilibiliFetchFollowed({
        sessdata: sessdata.trim(),
        keywords: keywords.length > 0 ? keywords : undefined,
        dynamic_types: dynamicTypes.length > 0 ? dynamicTypes : undefined,
        days_back: daysBack,
        limit,
      });
      setDynamics(res.dynamics);
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
    if (!sessdata.trim()) {
      toast.error("请先输入 SESSDATA");
      return;
    }
    setDebugLoading(true);
    try {
      const result = await bilibiliDebugTest(sessdata.trim());
      setDebugResult(result);
      toast.success("诊断测试完成");
    } catch (err) {
      toast.error("诊断失败", err instanceof Error ? err.message : "未知错误");
    } finally {
      setDebugLoading(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="哔哩哔哩工具"
        subtitle="关注动态聚合与关键词筛选"
        icon={Tv}
      />
      <PageContent>
        <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: "24px", height: "100%" }}>
          {/* Left sidebar - Configuration */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", overflow: "auto" }}>
            {/* Cookie Configuration Card */}
            <Card
              title={`Cookie 配置 ${cookieConfigured ? "✓" : ""}`}
              icon={<Cookie size={18} />}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                  配置 B 站登录 Cookie 后可获取关注列表动态。支持 JSON 格式或 SESSDATA 字符串。
                </p>

                {cookiePreview && (
                  <div
                    style={{
                      padding: "8px 12px",
                      borderRadius: "var(--radius-sm)",
                      background: "var(--bg-hover)",
                      fontSize: "0.8125rem",
                      color: "var(--text-secondary)",
                      fontFamily: "monospace",
                      wordBreak: "break-all",
                    }}
                  >
                    当前: {cookiePreview}
                  </div>
                )}

                <textarea
                  value={cookieInput}
                  onChange={(e) => setCookieInput(e.target.value)}
                  placeholder={`支持以下格式：
1. JSON 数组: [{"name":"SESSDATA","value":"xxx"},...]
2. Header 格式: SESSDATA=xxx; bili_jct=yyy
3. 纯 SESSDATA: xxx`}
                  style={{
                    width: "100%",
                    padding: "12px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border-light)",
                    background: "var(--bg-input)",
                    color: "var(--text-main)",
                    fontSize: "0.8125rem",
                    fontFamily: "monospace",
                    resize: "vertical",
                    minHeight: "100px",
                  }}
                />

                <CookieGuide platform="bilibili" cookieName="SESSDATA" />

                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    onClick={handleSaveCookie}
                    disabled={!cookieInput.trim()}
                    style={{
                      flex: 1,
                      padding: "10px 16px",
                      borderRadius: "var(--radius-sm)",
                      border: "none",
                      background: !cookieInput.trim() ? "var(--bg-muted)" : "var(--color-primary)",
                      color: "white",
                      fontSize: "0.875rem",
                      fontWeight: 600,
                      cursor: !cookieInput.trim() ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                    }}
                  >
                    <CheckCircle size={16} />
                    保存 Cookie
                  </button>

                  <button
                    onClick={handleGetFromBrowser}
                    disabled={gettingFromBrowser}
                    style={{
                      flex: 1,
                      padding: "10px 16px",
                      borderRadius: "var(--radius-sm)",
                      border: "none",
                      background: gettingFromBrowser ? "var(--bg-muted)" : "#00AEEC",
                      color: "white",
                      fontSize: "0.875rem",
                      fontWeight: 600,
                      cursor: gettingFromBrowser ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                    }}
                  >
                    {gettingFromBrowser ? (
                      <>
                        <div
                          style={{
                            width: "16px",
                            height: "16px",
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
                        <Globe size={16} />
                        从 Chrome 获取
                      </>
                    )}
                  </button>
                </div>

                {cookieInput && (
                  <button
                    onClick={applyCookieToSessdata}
                    style={{
                      padding: "10px 16px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border-light)",
                      background: "var(--bg-hover)",
                      color: "var(--text-secondary)",
                      fontSize: "0.8125rem",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                    }}
                  >
                    <Tv size={16} />
                    提取 SESSDATA 到下方输入框
                  </button>
                )}
              </div>
            </Card>

            {/* SESSDATA Quick Input Card */}
            <Card title="SESSDATA 快速输入" icon={<Tv size={18} />}>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                  直接输入 SESSDATA 值（如果你只有这一个值）
                </p>
                <textarea
                  value={sessdata}
                  onChange={(e) => {
                    setSessdata(e.target.value);
                    setSessdataVerified(false);
                  }}
                  placeholder="粘贴 SESSDATA..."
                  style={{
                    width: "100%",
                    padding: "12px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border-light)",
                    background: "var(--bg-input)",
                    color: "var(--text-main)",
                    fontSize: "0.8125rem",
                    fontFamily: "monospace",
                    resize: "vertical",
                    minHeight: "80px",
                  }}
                />
                <button
                  onClick={handleVerifySessdata}
                  disabled={verifying || !sessdata.trim()}
                  style={{
                    padding: "10px 16px",
                    borderRadius: "var(--radius-sm)",
                    border: "none",
                    background: verifying ? "var(--bg-muted)" : "var(--color-primary)",
                    color: "white",
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    cursor: verifying || !sessdata.trim() ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                  }}
                >
                  {verifying ? (
                    <>
                      <div
                        style={{
                          width: "16px",
                          height: "16px",
                          border: "2px solid rgba(255,255,255,0.3)",
                          borderTopColor: "white",
                          borderRadius: "50%",
                          animation: "spin 1s linear infinite",
                        }}
                      />
                      验证中...
                    </>
                  ) : sessdataVerified ? (
                    <>
                      <CheckCircle size={16} />
                      已验证
                    </>
                  ) : (
                    <>
                      <AlertCircle size={16} />
                      验证 SESSDATA
                    </>
                  )}
                </button>
              </div>
            </Card>

            {/* Keywords Card */}
            <Card title="关键词筛选" icon={<Hash size={18} />}>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
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

                {/* Preset keywords */}
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

                {/* Selected keywords */}
                {keywords.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "8px" }}>
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
              </div>
            </Card>

            {/* Type Filter Card */}
            <Card title="动态类型" icon={<Filter size={18} />}>
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
            </Card>

            {/* Time Range Card */}
            <Card title="时间范围" icon={<Clock size={18} />}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {TIME_RANGE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setDaysBack(opt.value)}
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
            </Card>

            {/* Limit Card */}
            <Card title="数量限制" icon={<Filter size={18} />}>
              <div style={{ display: "flex", gap: "8px" }}>
                {LIMIT_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setLimit(opt)}
                    style={{
                      flex: 1,
                      padding: "10px",
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
            </Card>

            {/* Fetch Button */}
            <button
              onClick={handleFetch}
              disabled={loading || !sessdata.trim()}
              style={{
                padding: "14px 24px",
                borderRadius: "var(--radius-md)",
                border: "none",
                background: loading || !sessdata.trim() ? "var(--bg-muted)" : "linear-gradient(135deg, #00AEEC, #FB7299)",
                color: "white",
                fontSize: "0.9375rem",
                fontWeight: 600,
                cursor: loading || !sessdata.trim() ? "not-allowed" : "pointer",
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
                  获取关注动态
                </>
              )}
            </button>

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
          </div>

          {/* Right content - Results */}
          <div style={{ overflow: "auto", height: "100%" }}>
            {loading ? (
              <LoadingState message="正在获取动态..." />
            ) : dynamics.length === 0 ? (
              <EmptyState
                icon={Tv}
                title="暂无动态"
                description={
                  sessdata
                    ? "点击左侧「获取关注动态」开始"
                    : "请先配置 SESSDATA 并验证"
                }
              />
            ) : (
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
                  }}
                >
                  <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
                    共找到 <strong style={{ color: "var(--text-main)" }}>{totalFound}</strong> 条动态
                    {keywords.length > 0 && (
                      <span>，关键词: {keywords.join(", ")}</span>
                    )}
                  </span>
                  <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                    最近 {daysBack} 天
                  </span>
                </div>

                {dynamics.map((dynamic) => {
                  const typeConfig = DYNAMIC_TYPE_MAP[dynamic.dynamic_type] || DYNAMIC_TYPE_MAP.text;
                  const TypeIcon = typeConfig.icon;

                  return (
                    <Card
                      key={dynamic.id}
                      noPadding
                      style={{
                        borderLeft: `4px solid ${typeConfig.color}`,
                      }}
                    >
                      <div style={{ padding: "16px 20px" }}>
                        {/* Header */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginBottom: "12px",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
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
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                              padding: "6px 12px",
                              borderRadius: "var(--radius-sm)",
                              background: "var(--bg-hover)",
                              color: "var(--color-primary)",
                              fontSize: "0.75rem",
                              fontWeight: 500,
                              textDecoration: "none",
                            }}
                          >
                            <ExternalLink size={12} />
                            打开
                          </a>
                        </div>

                        {/* Author */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            marginBottom: "10px",
                          }}
                        >
                          <div
                            style={{
                              width: "28px",
                              height: "28px",
                              borderRadius: "50%",
                              background: "linear-gradient(135deg, var(--color-primary), var(--color-secondary))",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <span style={{ fontSize: "0.75rem", color: "white", fontWeight: 600 }}>
                              {dynamic.author.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-main)" }}>
                            {dynamic.author}
                          </span>
                        </div>

                        {/* Title */}
                        {dynamic.title && (
                          <h3
                            style={{
                              fontSize: "1rem",
                              fontWeight: 700,
                              color: "var(--text-main)",
                              marginBottom: "8px",
                              lineHeight: 1.5,
                            }}
                          >
                            {dynamic.title}
                          </h3>
                        )}

                        {/* Content */}
                        <p
                          style={{
                            fontSize: "0.875rem",
                            color: "var(--text-secondary)",
                            lineHeight: 1.6,
                            marginBottom: dynamic.images.length > 0 ? "12px" : 0,
                            display: "-webkit-box",
                            WebkitLineClamp: 3,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}
                        >
                          {dynamic.content}
                        </p>

                        {/* Images */}
                        {dynamic.images.length > 0 && (
                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "12px" }}>
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
                                  src={img}
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

                        {/* Main thumbnail for video */}
                        {dynamic.dynamic_type === "video" && dynamic.pic && (
                          <div
                            style={{
                              marginTop: "12px",
                              borderRadius: "var(--radius-sm)",
                              overflow: "hidden",
                              background: "var(--bg-muted)",
                              position: "relative",
                            }}
                          >
                            <img
                              src={dynamic.pic}
                              alt=""
                              style={{
                                width: "100%",
                                maxHeight: "200px",
                                objectFit: "cover",
                              }}
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = "none";
                              }}
                            />
                            <div
                              style={{
                                position: "absolute",
                                inset: 0,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                background: "rgba(0,0,0,0.2)",
                              }}
                            >
                              <div
                                style={{
                                  width: "48px",
                                  height: "48px",
                                  borderRadius: "50%",
                                  background: "rgba(0, 174, 236, 0.9)",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                <Play size={20} fill="white" color="white" />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </PageContent>
    </PageContainer>
  );
}
